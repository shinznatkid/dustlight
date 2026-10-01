import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { ROOM, WIN, SILL, FRAME, PLANTER } from '../../rooms/pottery/layout.js';
import { t } from '../../i18n.js';

// Level 4's twist: the raw pots on the ware board only dry in direct sun. The sun comes in
// through the one window in the left wall, and during the repairs the time of day follows
// the work (ui/timeflow.js), so the patch of sunlight creeps across the floor as the player gets
// on — the board has to be carried into it (and after it). Dirty glass keeps the sun out
// (grime.js: the same 50% alpha that casts the sun's shadow), so the window matters too.
//
// "In the sun" is worked out on the CPU the way the light really gets there: from a few
// points on each pot, a ray towards the sun must get out through the window opening (both
// faces of the wall, over the sill, between the frame's bars), through glass that is clean
// enough there, and past whatever stands in the way (the hanging planter, the bin, …).
// Each pot dries from its rim down (grey wet clay → its own pale bone-dry colour, which is
// what the prototype shows), and says so with a wisp of steam while it's in the sun.
//
//   createDrying(world, { L, journal, sound, note, state }) → a level system (level.js):
//   progress · dried / total · setDry(i) (the timelapse) · boost (the title timelapse)
// seconds of full sun a pot needs (it runs on while the other repairs get done) — 45 at
// first; playtest 2026-09-30: too slow to watch, so a third of it
const DRY_TIME = 15;
const WET = new THREE.Color('#5e5852'); // wet grey clay (each pot is mixed from its own colour to this)
const WETNESS = 0.85;
// where a pot is looked at, [across its radius, up its height]: the shoulder and both
// flanks (not the rim: a sliver of sun over the sill on a tall pot's lip doesn't dry it)
const SAMPLES = [[0, 0.85], [-0.8, 0.5], [0.8, 0.5]];
const { X0, T } = ROOM;

// the window opening in the left wall, its frame's bars, the sill: does the ray P + s·L
// (L towards the sun) get out? → the point where it crosses the glass (for the grime), or null
const _q = new THREE.Vector3();
function throughWindow(P, L) {
  if (L.x > -1e-3) return null; // the sun isn't on the window's side
  const at = (x) => _q.copy(P).addScaledVector(L, (x - P.x) / L.x);
  const inOpening = (q) => q.y > WIN.y0 && q.y < WIN.y1 && q.z > FRAME.z0 && q.z < FRAME.z1;
  // the sill (the ray drops towards the room: the sill's inner edge is where it's lowest)
  if (P.x > SILL.x1 && at(SILL.x1).y < SILL.y) return null;
  if (P.x > X0 && !inOpening(at(X0))) return null;
  if (!inOpening(at(X0 - T))) return null;
  const q = at(FRAME.x);
  if (!inOpening(q)) return null;
  // the frame: sides, top and bottom rails, two mullions, the transom
  if (q.z < FRAME.z0 + 0.08 || q.z > FRAME.z1 - 0.08) return null;
  if (q.y < WIN.y0 + 0.07 || q.y > WIN.y1 - 0.08) return null;
  if (FRAME.mullions.some((z) => Math.abs(q.z - z) < 0.03)) return null;
  if (Math.abs(q.y - FRAME.transom) < 0.025) return null;
  return q.clone();
}
// the hanging planter in the window (pot, leaves hanging off it): three balls
const PLANT = [[0.08, 0.13], [-0.08, 0.12], [-0.22, 0.1]].map(([dy, r]) => ({ c: new THREE.Vector3(PLANTER.x, PLANTER.y + dy, PLANTER.z), r }));
const _d = new THREE.Vector3();
function planterInWay(P, L, far) {
  return PLANT.some(({ c, r }) => {
    const s = _d.copy(c).sub(P).dot(L);
    return s > 0 && s < far && _d.copy(P).addScaledVector(L, s).distanceTo(c) < r;
  });
}

// a soft white wisp of steam (a sprite; one per pot, shown while it dries in the sun)
function wispTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 40, 0, 16, 40, 16);
  grd.addColorStop(0, 'rgba(255,248,236,0.9)');
  grd.addColorStop(1, 'rgba(255,248,236,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(16, 36, 12, 26, 0, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createDrying(world, { L, journal, sound = () => {}, note = () => {}, state, boardId = 'wareboard', tableId = 'waretable' }) {
  const { decor, sun, scene } = world;
  const entry = (id) => decor.entries.find((e) => e.id === id);
  const board = entry(boardId);
  const obj = board.holder.children.find((c) => c.userData.pots);
  const { pots, mesh } = obj.userData;
  const colour = mesh.geometry.attributes.color;
  const pos = mesh.geometry.attributes.position;
  const dry0 = colour.array.slice(); // bone dry: the prototype's own colours
  const wet0 = new Float32Array(dry0.length);
  const wetLin = WET.clone(); // (THREE.Color is linear, as are the vertex colours)
  for (let i = 0; i < dry0.length; i += 3) {
    wet0[i] = dry0[i] + (wetLin.r - dry0[i]) * WETNESS;
    wet0[i + 1] = dry0[i + 1] + (wetLin.g - dry0[i + 1]) * WETNESS;
    wet0[i + 2] = dry0[i + 2] + (wetLin.b - dry0[i + 2]) * WETNESS;
  }
  // each vertex's height up its pot (0 foot … 1 rim): the rim dries first
  const up = new Float32Array(pos.count);
  for (const p of pots) {
    const [a, n] = p.range;
    for (let v = a; v < a + n; v++) up[v] = THREE.MathUtils.clamp((pos.getY(v) - p.y) / p.h, 0, 1);
  }
  const dry = pots.map(() => 0);
  const lit = pots.map(() => 0); // share of the pot in direct sun (with the glass as it is)
  // over the damp pots: the share of them in the sun with the glass as it is, and as it would
  // be with clean glass (why they're in the shade: the grime, or the spot)
  let litAvg = 0;
  let geoLit = 0;
  let boost = 1;

  function paint(i) {
    const [a, n] = pots[i].range;
    const d = dry[i];
    const arr = colour.array;
    for (let v = a; v < a + n; v++) {
      const k = THREE.MathUtils.smoothstep(d * 1.5 - (1 - up[v]) * 0.5, 0, 1);
      for (let c = 0; c < 3; c++) arr[v * 3 + c] = wet0[v * 3 + c] + (dry0[v * 3 + c] - wet0[v * 3 + c]) * k;
    }
    colour.addUpdateRange(a * 3, n * 3);
    colour.needsUpdate = true;
  }
  const paintAll = () => pots.forEach((_, i) => paint(i));

  // steam
  const wispMat = new THREE.SpriteMaterial({ map: wispTexture(), transparent: true, depthWrite: false, opacity: 0 });
  const wisps = pots.map((p, i) => {
    const s = new THREE.Sprite(wispMat.clone());
    s.layers.set(LAYER_MAIN_ONLY);
    s.visible = false;
    s.userData.phase = i * 0.37;
    scene.add(s);
    return s;
  });

  // ---- the sun test ------------------------------------------------------------------------
  const Ls = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  const P = new THREE.Vector3();
  const grimeAt = (q) => {
    const g = L.grime;
    if (!g) return 0;
    for (const w of g.windows) {
      if (!w.mesh.visible) continue;
      const u = w.w.at[2] - q.z; // (the pane faces +x: its own x runs along −z)
      const v = q.y - w.w.at[1];
      if (Math.abs(u) > w.w.w / 2 || Math.abs(v) > w.w.h / 2) continue;
      const px = Math.min(w.mask.w - 1, Math.floor((u / w.w.w + 0.5) * w.mask.w));
      const py = Math.min(w.mask.h - 1, Math.floor((0.5 - v / w.w.h) * w.mask.h));
      return w.mask.g.getImageData(px, py, 1, 1).data[3] / 255;
    }
    return 0;
  };
  // what else stands in the sun's way inside the room: any furniture out in the room but
  // the board and what carries it (the hanging planter is worked out above)
  function blockers() {
    const mine = new Set([board, entry(tableId)]);
    return decor.entries.filter((e) => !e.stored && !mine.has(e) && !e.crate).map((e) => e.holder);
  }
  // 1 = sunlit here, with the grime as it is; geo: 1 = would be, with clean glass
  function sample(p, list) {
    const q = throughWindow(p, Ls);
    if (!q) return { lit: 0, geo: 0 };
    const far = p.distanceTo(q);
    if (planterInWay(p, Ls, far)) return { lit: 0, geo: 0 };
    ray.set(p, Ls);
    ray.far = far;
    if (list.length && ray.intersectObjects(list, true).some((h) => h.object.visible)) return { lit: 0, geo: 0 };
    return { lit: grimeAt(q) < 0.5 ? 1 : 0, geo: 1 };
  }
  function measure() {
    Ls.copy(sun.position).sub(sun.target.position).normalize();
    const strength = THREE.MathUtils.clamp(sun.intensity / 8, 0, 1); // (dusk: no drying)
    obj.updateWorldMatrix(true, false);
    const list = blockers();
    const away = board.stored; // (carried out of the room: in the put-aside box)
    let geo = 0;
    let all = 0;
    pots.forEach((p, i) => {
      if (dry[i] >= 1 || away) {
        lit[i] = 0;
        return;
      }
      let a = 0;
      for (const [dx, dy] of SAMPLES) {
        const s = sample(obj.localToWorld(P.set(p.x + dx * p.r, p.y + dy * p.h, p.z)), list);
        a += s.lit;
        geo += s.geo;
      }
      all += a;
      lit[i] = (a / SAMPLES.length) * strength;
    });
    const n = pots.filter((_, i) => dry[i] < 1).length * SAMPLES.length;
    litAvg = n ? all / n : 0;
    geoLit = n ? geo / n : 0;
  }
  // what to tell the player about where the board stands now
  const verdict = (shade = 'hint.pottery.shade') => {
    if (geoLit <= 0) return shade;
    if (litAvg < geoLit * 0.5) return 'hint.pottery.grimy';
    return litAvg < 0.5 ? 'hint.pottery.partSun' : 'hint.pottery.drying';
  };

  // ---- telling the player --------------------------------------------------------------------
  // after the board is put down: in the sun or not, and why not · the sun moving off it
  let carried = false;
  let checkIn = -1;
  let lastNote = -99;
  let clock = 0;
  let wasLit = false;
  const say = (key, gap = 0) => {
    if (clock - lastNote < gap) return;
    lastNote = clock;
    note(t(key));
  };
  const litShare = () => lit.reduce((a, b) => a + b, 0);

  let acc = 0;
  let nudge = -1; // the windows just came clean and the board was never moved: a word once
  let moved = false;
  const sys = {
    pots,
    get total() { return pots.length; },
    get dried() { return dry.filter((d) => d >= 1).length; },
    get progress() { return dry.reduce((a, d) => a + Math.min(1, d), 0) / pots.length; },
    get lit() { return litShare() > 0; },
    // each pot's share in direct sun now (0..1; the screenshot tool, tests)
    get sunlit() { return lit.map((v) => Math.round(v * 100) / 100); },
    // is world point p in direct sun now? { lit (with the glass as it is), geo (with clean glass) }
    sunAt(p) {
      Ls.copy(sun.position).sub(sun.target.position).normalize();
      return sample(p, blockers());
    },
    get boost() { return boost; },
    set boost(v) { boost = v; },
    // pot i is dry (the player's timelapse: when it dried then)
    setDry(i) {
      if (dry[i] === undefined) return;
      dry[i] = 1;
      paint(i);
    },
    fresh() {
      dry.fill(0);
      paintAll();
      carried = false;
      checkIn = -1;
      wasLit = false;
      nudge = -1;
      moved = false;
    },
    finished() {
      dry.fill(1);
      paintAll();
    },
    // done at once (the task's last speck, the timelapse): the pots still damp dry now
    complete() {
      pots.forEach((_, i) => { if (dry[i] < 1) journal.mark('dry', i); });
      this.finished();
    },
    serialize: () => dry.map((d) => Math.round(Math.min(1, d) * 1000) / 1000),
    restore(s) {
      pots.forEach((_, i) => { dry[i] = Array.isArray(s) ? s[i] ?? 0 : 0; });
      paintAll();
    },
    update(dt) {
      clock += dt;
      const st = state();
      const working = st.phase === 'restore' && !st.done('dry');
      // put down → have a look a moment later (it has landed, the GI is on its way)
      const held = decor.held?.e;
      const holding = held === board || held === entry(tableId);
      if (carried && !holding) checkIn = 0.7;
      if (holding) moved = true;
      carried = holding;
      acc -= dt;
      if (acc <= 0) {
        acc = 0.15;
        measure();
      }
      pots.forEach((p, i) => {
        if (dry[i] >= 1 || lit[i] <= 0) return;
        dry[i] = Math.min(1, dry[i] + (dt * lit[i] * boost) / DRY_TIME);
        paint(i);
        if (dry[i] >= 1) {
          journal.mark('dry', i);
          sound('click', { gain: 0.35, rate: 1.5 });
        }
      });
      // steam over the pots in the sun
      pots.forEach((p, i) => {
        const w = wisps[i];
        const on = lit[i] > 0 && dry[i] < 1;
        w.visible = on;
        if (!on) return;
        w.userData.phase = (w.userData.phase + dt / 1.7) % 1;
        const k = w.userData.phase;
        obj.localToWorld(w.position.set(p.x, p.y + p.h + 0.06 + k * 0.2, p.z));
        w.scale.set(0.09 + k * 0.05, 0.16 + k * 0.1, 1);
        w.material.opacity = Math.sin(k * Math.PI) * 0.5 * Math.min(1, lit[i] * 1.5);
      });
      if (working) {
        const litNow = litShare() > 0;
        if (checkIn > 0 && (checkIn -= dt) <= 0) {
          if (!board.stored) say(verdict());
        } else if (wasLit && !litNow && !carried && checkIn <= 0 && !board.stored) {
          // the sun crept off it (or something came between)
          say(verdict('hint.pottery.sunMoved'), 15);
        }
        wasLit = litNow;
        // the sun is in now (the glass is clean) and the pots still stand in the shade
        if (nudge < 0 && st.done('windows') && !moved) nudge = 3;
        if (nudge > 0 && (nudge -= dt) <= 0) {
          nudge = 0;
          if (!moved && !litNow) say('hint.pottery.shade');
        }
      }
      return false;
    },
  };
  sys.fresh();
  return sys;
}
