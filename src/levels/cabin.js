import * as THREE from 'three';
import { createWalls } from '../walls.js';
import { createFloorMask } from '../floormask.js';
import { mulberry } from '../atmos.js';
import { createRoller, surfaceTool, makeTray, mat, toMain } from '../tools/surfaceTools.js';
import { floorMotion } from '../tools/floorMotion.js';
import { createPuffs } from '../puffs.js';
import { addStrings, t } from '../i18n.js';

// Level 2 — Lakeside Cabin, living room (room: src/rooms/cabin.js). Format: levels/meadow.js.
// The twist: the chinking between the logs has crumbled away and the cold wind comes
// through — it blows the old candles out and won't let the fire catch until every gap
// is filled. Then the grey, weathered logs get oiled back to honey: the logs are most of
// what the probes see, so the whole room's bounce light warms up as the oil goes on.
// Tasks: litter (autumn leaves, twigs, cones) · mop the muddy floor · windows · chinking
// (caulk gun) · soot on the stones · oil the logs · light the fire.

const CREAM = '#f7e2bd'; // the chinking (room palette)
const OILS = ['#eab26a', '#c98a4b', '#f0c78e']; // honey (the room's own) · walnut · pale pine
const DRAFTY = ['candles', 'lantern']; // lamps with a real flame: the wind blows them out

// ---- looks for the two wall masks (walls.js: oldWall(m), m = atlas metres) -------------------
// weathered logs: sun-bleached silver-grey, blotchy, streaked along the grain, greener
// and darker towards the damp floor
const OLD_LOGS = /* glsl */`
vec3 oldWall(vec2 m) {
  vec3 c = wOld;
  c *= mix(0.78, 1.06, smoothstep(0.25, 0.65, wf(m * 1.7)));
  c *= mix(0.86, 1.0, smoothstep(0.3, 0.6, wf(vec2(m.x * 0.8, m.y * 9.0))));
  c = mix(c, c * vec3(0.78, 0.88, 0.72), smoothstep(0.7, 0.0, m.y) * 0.6);
  return c;
}
`;
// crumbled chinking: the gaps are mostly empty (dark), with crumbs of the old filler left;
// the wall's cut ends and tops (not gaps) keep their cream
function oldChinkGLSL({ X0, Z0 }) {
  const c = new THREE.Color(CREAM);
  const cream = `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
  return /* glsl */`
vec3 oldWall(vec2 m) {
  if (vWallP.x < ${(X0 - 0.005).toFixed(4)} || vWallP.z < ${(Z0 - 0.005).toFixed(4)} || m.y > 3.05) return ${cream};
  float crumb = smoothstep(0.6, 0.7, wf(vec2(m.x * 4.0, m.y * 14.0)));
  return mix(wOld, ${cream} * 0.8, crumb);
}
`;
}

// ---- litter: what blew in and what was left -----------------------------------------------------
function litter(rand) {
  const bark = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
  const scales = [0x8a5a32, 0x7a4e2a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
  return {
    // a forked twig lying flat
    twig: () => {
      const g = new THREE.Group();
      const len = 0.22 + rand() * 0.14;
      const main = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.01, len, 6).rotateZ(Math.PI / 2), bark);
      main.position.y = 0.01;
      const fl = len * (0.35 + rand() * 0.2);
      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, fl, 5).rotateZ(Math.PI / 2), bark);
      fork.rotation.y = 0.5 + rand() * 0.4;
      fork.position.set(len * 0.1 + Math.cos(fork.rotation.y) * fl * 0.5, 0.009, -Math.sin(fork.rotation.y) * fl * 0.5);
      g.add(main, fork);
      return g;
    },
    // a pine cone on its side
    cone: () => {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * 0.03 * (1 + (rand() - 0.5) * 0.25), p.getY(i) * 0.05, p.getZ(i) * 0.03 * (1 + (rand() - 0.5) * 0.25));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo.rotateZ(Math.PI / 2).translate(0, 0.03, 0), scales[Math.floor(rand() * scales.length)]);
      return m;
    },
  };
}

// ---- tools ---------------------------------------------------------------------------------------
// the caulk gun (local +z = away from the wall; the nozzle's tip touches it)
function caulkModel() {
  const g = new THREE.Group();
  const red = mat(0xc0392b, { roughness: 0.5, metalness: 0.2 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.26, 16), mat(0xf1e6cf, { roughness: 0.55 }));
  tube.rotation.x = Math.PI / 2;
  tube.position.z = 0.2;
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 12), mat(0xe8dcc2, { roughness: 0.5 }));
  nozzle.rotation.x = -Math.PI / 2;
  nozzle.position.z = 0.035;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.32), red);
  rail.position.set(0, -0.042, 0.21);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 0.04), red);
  grip.position.set(0, -0.1, 0.32);
  grip.rotation.x = 0.35;
  g.add(tube, nozzle, rail, grip);
  return toMain(g);
}
// a wide brush for the oil; its bristles show the colour and how much is left
function oilBrushModel() {
  const g = new THREE.Group();
  const bristles = mat(OILS[0], { roughness: 0.9 });
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.05), mat(0x8a5a36, { roughness: 0.7 }));
  block.position.z = 0.075;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.055, 0.05), bristles);
  hair.position.z = 0.025;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.26, 10), mat(0x5a8a6a, { roughness: 0.6 }));
  handle.position.set(0, -0.15, 0.13);
  handle.rotation.x = -0.5;
  g.add(block, hair, handle);
  g.userData.paint = bristles;
  return toMain(g);
}

// a string mop (local +z = up, off the floor); the handle leans back · MOP_HAND: its top
const MOP_HAND = new THREE.Vector3(0, -0.19 - 0.45 * Math.sin(0.45), 0.48 + 0.45 * Math.cos(0.45));
function mopModel() {
  const g = new THREE.Group();
  const strands = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.05, 16).rotateX(Math.PI / 2), mat(0xe9dfc9, { roughness: 1 }));
  strands.position.z = 0.025;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12).rotateX(Math.PI / 2), mat(0x3f8fb0, { roughness: 0.5 }));
  cap.position.z = 0.07;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.9, 8), mat(0xb98a55, { roughness: 0.6 }));
  handle.rotation.x = Math.PI / 2 + 0.45; // (its foot in the cap — tilted the other way it stood on the floor beside the mop)
  handle.position.set(0, -0.19, 0.48);
  g.add(strands, cap, handle);
  Object.assign(g.userData, { strands, cap, handle });
  return toMain(g);
}
// held down, the mop wipes back and forth by itself (tools/floorMotion.js), and the water flicks
// off it — muddier where the floor still is
export function createMop(world, mud, puffs, { rub, rec }) {
  const ray = new THREE.Raycaster();
  const model = mopModel();
  const { strands, cap, handle } = model.userData;
  const tool = surfaceTool(world, {
    id: 'mop',
    rub,
    rec,
    hint: () => 'hint.mop',
    model,
    offset: 0.002,
    spacing: 4,
    find: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      return mud.hit(ray.ray);
    },
    target: () => ({ item: 'floor', normal: new THREE.Vector3(0, 1, 0) }),
    work: (h, px, py) => {
      mud.wipe(px, py, 0.2 * mud.px, 0.3);
      return true;
    },
  });
  floorMotion(world, tool, {
    model, hand: MOP_HAND, swing: [handle], slide: [strands, cap], pattern: 'wipe', reach: 0.13, rate: 1.2,
    dirt: mud, footR: 0.17, strength: 4, rub, rubKind: 'scrub', puffEvery: 0.08,
    puff: (at, way, left) => {
      puffs.emit(at, way, 2 + Math.round(left * 4), { color: '#dcebf2', size: 0.016, spread: 0.2, speed: 0.9, life: 1, alpha: 0.75, drop: 3.5 });
      if (left > 0.15) puffs.emit(at, way, 1 + Math.round(left * 3), { color: '#7a5c42', size: 0.02, spread: 0.16, speed: 0.7, life: 1, alpha: 0.85, drop: 4 });
    },
  });
  return tool;
}

// the muddy floor: boot prints from the open side to the hearth and back, wet-leaf
// stains under the windows (over floormask.js's dust)
function muddy(g, W, H, px, rand) {
  const print = (x, y, a, left) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = 'rgba(58,40,26,0.75)';
    g.beginPath();
    g.ellipse(left ? -0.06 * px : 0.06 * px, 0, 0.045 * px, 0.11 * px, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  // three trails of steps, in metres from the room's back-left corner
  for (const [ax, ay, bx, by] of [[5.9, 4.8, 2.4, 1.1], [2.6, 1.2, 0.9, 3.6], [6.0, 2.8, 3.8, 1.4]]) {
    const n = Math.round(Math.hypot(bx - ax, by - ay) / 0.34);
    const a = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
    for (let k = 0; k < n; k++) {
      const f = k / n;
      print((ax + (bx - ax) * f) * px + (rand() - 0.5) * 4, (ay + (by - ay) * f) * px + (rand() - 0.5) * 4, a + (rand() - 0.5) * 0.3, k % 2 === 0);
    }
  }
  for (let k = 0; k < 26; k++) {
    const x = (0.1 + rand() * 1.4) * px;
    const y = rand() * H;
    const r = (0.04 + rand() * 0.08) * px;
    g.fillStyle = `rgba(${Math.round(120 + rand() * 40)},${Math.round(70 + rand() * 20)},30,${(0.35 + rand() * 0.3).toFixed(2)})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rand() * 0.4), rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
}

const ICON_MOP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3l-4.5 10"/><path d="M8 13h7l2 3H6z"/><path d="M7 16l-1.5 4M10 16l-.5 4.5M13 16l.5 4.5M16 16l1.5 4"/></svg>';
const ICON_CAULK ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="6" width="13" height="5" rx="1.5"/><path d="M7 8.5H3.5"/><path d="M12 11v2.5l-2 6.5"/><path d="M16 11l1.5 3"/></svg>';
const ICON_OIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="5" rx="1.5"/><path d="M6 9v4M9 9v5M12 9v4M15 9v5M18 9v4"/><path d="M12 14v7"/><path d="M5 20c1.5 0 2-1.5 2-3"/></svg>';

// the caulk gun: the bead goes into the gap between two logs nearest where the button
// went down, and stays in that row until it's let go (so a sweep fills one row however
// unsteady the hand — playtest 2026-09-30: it hopped to the row above / below mid-stroke);
// off that wall, it waits
function createCaulk(world, chink, gaps, { rub, rec }) {
  const ray = new THREE.Raycaster();
  let lock = null; // null · 'next' (the button just went down) · { item, y }
  const nearest = (item, y0) => gaps[item].reduce((a, b) => (Math.abs(b - y0) < Math.abs(a - y0) ? b : a));
  const snap = (h) => {
    if (lock === 'next') lock = { item: h.item, y: nearest(h.item, h.point.y) };
    if (lock && lock.item !== h.item) return null;
    const y = lock ? lock.y : nearest(h.item, h.point.y);
    h.point.y = y;
    h.py = (chink.ah - y) * chink.PX;
    return h;
  };
  const tool = surfaceTool(world, {
    id: 'caulk',
    rub,
    rec,
    rubKind: 'roll',
    hint: () => 'hint.caulk',
    model: caulkModel(),
    offset: 0.075, // (the logs stand out of the chinking: keep the tool in front of them)
    spacing: 2,
    find: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      const h = chink.hit(ray.ray);
      if (!h) return null;
      h.item = h.face;
      return snap(h);
    },
    target: (face) => ({ item: face, normal: chink.faceNormal(face) }),
    onDown: () => {
      lock = 'next';
      return false;
    },
    work: (h, px, py) => {
      // (between two pointer events the stroke is joined up: snap each dab to a row again —
      // the timelapse's recorded hits come in without the lock)
      const y = nearest(h.item, chink.ah - py / chink.PX);
      chink.mask.dab(px, (chink.ah - y) * chink.PX, 0.06 * chink.PX, { color: CREAM });
      return true;
    },
  });
  const { up, release } = tool;
  tool.up = () => {
    lock = null;
    up();
  };
  tool.release = () => {
    lock = null;
    release();
  };
  return tool;
}

// ---- the level ---------------------------------------------------------------------------------------
function setup({ world, journal, sound, rub, onToolChange, tools, state, note }) {
  const { room } = world;
  const S = world.sites;
  const logs = createWalls(room, S.logs, { mat: room.logs, id: 'logs', oldGLSL: OLD_LOGS, old: '#9b9389' });
  // only the gaps between the logs count (a band either side of each gap's centre line)
  const inGap = (f, along, y) => S.gaps[f.face].some((g) => Math.abs(y - g) < 0.03);
  const chink = createWalls(room, S.chink, { mat: room.chink, id: 'chink', oldGLSL: oldChinkGLSL(world.bounds), old: '#2a1f18', keep: inGap });

  // the oil tin on the floor (click it to load the brush), there while the repairs go on
  const tin = makeTray();
  tin.name = 'oil-tin';
  tin.position.set(-2.4, 0, 2.1);
  tin.rotation.y = 0.35;
  world.scene.add(tin);
  world.gi.patchScene(tin);

  // the mud on the floor
  const { X0, X1, Z0, Z1 } = world.bounds;
  const mud = createFloorMask({ mat: room.planks, bounds: { x0: X0, x1: X1, z0: Z0, z1: Z1 }, id: 'floor', hidden: room.fireplace });
  const mudRand = mulberry(31);

  const own = {
    mop: createMop(world, mud, createPuffs(world), { rub, rec: journal.surface('mop', { itemOf: () => 0 }) }),
    caulk: createCaulk(world, chink, S.gaps, { rub, rec: journal.surface('chink', { itemOf: (face) => face }) }),
    oil: createRoller(world, logs, {
      id: 'oil', sound, rub, colors: OILS, tray: tin, onChange: onToolChange,
      model: oilBrushModel(), hints: { use: 'hint.oil', dry: 'hint.oilDry' }, rubKind: 'scrub', cap: 36, width: 0.46,
      rec: journal.surface('oil', { itemOf: (face) => face, colorOf: () => tools.oil.color }),
    }),
  };
  own.mop.icon = ICON_MOP;
  own.caulk.icon = ICON_CAULK;
  own.oil.icon = ICON_OIL;

  // a wall mask as a level system
  const system = (w, color) => Object.assign(w, {
    fresh: () => w.clear(),
    finished: () => w.fill(color()),
    complete: () => w.fillGaps(color()),
    update: () => { w.flush(); return false; },
  });
  const logSys = system(logs, () => tools.oil?.color ?? OILS[0]);
  const chinkSys = system(chink, () => CREAM);
  // the draft: until the chinking is done, a flame that's lit gutters and goes out
  const baseUpdate = chinkSys.update;
  chinkSys.update = (dt) => {
    baseUpdate();
    const st = state();
    tin.visible = st.phase === 'restore' || st.toolId === 'oil';
    if (st.done('chink')) return false;
    for (const l of world.fixtures.lamps) {
      if (!DRAFTY.includes(l.name) || l.target < 0.5 || l.root.parent?.userData?.stored) {
        l.draft = 0;
        continue;
      }
      l.draft = (l.draft ?? 0) + dt;
      if (l.draft > 1.4) {
        l.draft = 0;
        l.target = 0;
        sound('cancel', { gain: 0.45, rate: 0.7 }); // a puff
        world.bounceChanged();
        note(t('hint.cabin.draft'));
      }
    }
    return false;
  };
  const mudSys = Object.assign(mud, {
    fresh: () => mud.dirty(mudRand, { color: '#6b5a48', film: 0.5, alpha: 0.45, blobs: 90, draw: muddy }),
    finished: () => mud.clean(),
    complete: () => mud.clean(),
    update: () => { mud.flush(); return false; },
  });
  return { systems: { mud: mudSys, logs: logSys, chink: chinkSys }, tools: own };
}

// ---- the title timelapse's take on the two new jobs ---------------------------------------------------
const demo = {
  async mop(game, api) {
    const { X0, X1, Z0, Z1 } = api.world.bounds;
    const pts = [];
    for (let z = Z0 + 0.3, k = 0; z <= Z1 - 0.2; z += 0.36, k++) pts.push(api.P(k % 2 ? X1 - 0.2 : X0 + 0.25, 0, z), api.P(k % 2 ? X0 + 0.25 : X1 - 0.2, 0, z));
    if (!await api.stroke(game.tools.mop, pts, 26)) return false;
    game.tools.mop.release();
    if (game.L.mud.progress < 0.88) game.L.mud.clean();
    return api.glideTime(api.at(0.03), 0.6);
  },
  async chink(game, api) {
    const { X0, X1, Z0, Z1 } = api.world.bounds;
    const { gaps } = api.world.sites;
    const gun = game.tools.caulk;
    let k = 0;
    for (const y of gaps.left) {
      const row = [api.P(X0, y, Z1 - 0.12), api.P(X0, y, Z0 + 0.04)];
      if (!await api.stroke(gun, k++ % 2 ? row.reverse() : row, 38)) return false;
    }
    for (const y of gaps.back) {
      const row = [api.P(X0 + 0.04, y, Z0), api.P(X1 - 0.12, y, Z0)];
      if (!await api.stroke(gun, k++ % 2 ? row.reverse() : row, 38)) return false;
    }
    gun.release();
    if (game.L.chink.progress < 0.92) game.L.chink.fillGaps(CREAM);
    return api.glideTime(api.at(0.08), 0.8);
  },
  async oil(game, api) {
    const { X0, X1, Z0, Z1 } = api.world.bounds;
    const brush = game.tools.oil;
    const f = 0.07; // the logs' fronts
    for (let y = 0.22, k = 0; y < 3.1; y += 0.4, k++) {
      const row = [api.P(X0 + f, y, Z1 - 0.2), api.P(X0 + f, y, Z0 + f + 0.02), api.P(X0 + f + 0.02, y, Z0 + f), api.P(X1 - 0.2, y, Z0 + f)];
      brush.setColor(OILS[0]);
      if (!await api.stroke(brush, k % 2 ? row.reverse() : row, 30)) return false;
    }
    brush.release();
    if (game.L.logs.progress < 0.9) game.L.logs.fillGaps(OILS[0]);
    return api.glideTime(api.at(0.13), 0.8);
  },
};

addStrings({
  th: {
    'task.cabin.trash': 'กวาดใบไม้ กิ่งไม้ออกไป',
    'task.cabin.soot': 'ขัดเขม่าบนเตาหิน',
    'task.chink': 'อุดร่องระหว่างท่อนซุง',
    'task.oil': 'ทาน้ำมันผนังซุง',
    'task.cabin.fire': 'จุดไฟในเตาหิน',
    'task.mop': 'ถูพื้นที่เปื้อนโคลน',
    'tool.mop': 'ไม้ถูพื้น',
    'hint.mop': 'กดค้างแล้วถูไปบนพื้น — รอยโคลนกับฝุ่นจะหลุดออก พื้นสะอาดแล้วห้องสว่างขึ้น',
    'demo.mop': 'ถูพื้น — รอยโคลนหายไป',
    'tool.caulk': 'ปืนยาแนว',
    'tool.oil': 'แปรงทาน้ำมัน',
    'hint.caulk': 'กดค้างแล้วลากไปตามร่องระหว่างท่อนซุง — ยาแนวเข้าร่องที่ใกล้ที่สุดเอง ลากทีเดียวได้ทั้งแถว · ซูมเข้าใกล้จะเห็นร่องชัดขึ้น',
    'hint.oil': 'กดค้างแล้วลากบนท่อนซุงเพื่อทาน้ำมัน · เลือกสีน้ำมันด้านล่าง · น้ำมันหมดให้คลิกถาดน้ำมันบนพื้น',
    'hint.oilDry': 'น้ำมันในแปรงหมดแล้ว — คลิกถาดน้ำมันบนพื้น หรือเลือกสีด้านล่าง',
    'paint.oil.0': 'น้ำผึ้ง',
    'paint.oil.1': 'วอลนัท',
    'paint.oil.2': 'สนอ่อน',
    'paint.load.oil': 'น้ำมันในแปรง',
    'hint.cabin.fireLocked': 'ลมหนาวลอดร่องซุงเข้ามา ไฟไม่ยอมติด — อุดร่องให้ครบและขัดเขม่าเตาก่อน',
    'hint.cabin.draft': 'ลมลอดร่องซุงเป่าเทียนดับ — อุดร่องให้ครบก่อน',
    'demo.cabin.trash': 'กวาดใบไม้ที่ปลิวเข้ามา',
    'demo.cabin.soot': 'ขัดเขม่าเตาหิน',
    'demo.chink': 'อุดร่องซุง — ลมหนาวเข้าไม่ได้แล้ว',
    'demo.oil': 'ทาน้ำมันซุง — ห้องกลับมาสีน้ำผึ้ง',
    'box.autumn': 'ของแต่งหน้าใบไม้ร่วง',
  },
  en: {
    'task.cabin.trash': 'Sweep out the leaves and twigs',
    'task.cabin.soot': 'Scrub the soot off the stones',
    'task.chink': 'Fill the gaps between the logs',
    'task.oil': 'Oil the log walls',
    'task.cabin.fire': 'Light the fire',
    'task.mop': 'Mop the muddy floor',
    'tool.mop': 'Mop',
    'hint.mop': 'Hold and mop over the floor — the mud and dust come up, and a clean floor lights up the room',
    'demo.mop': 'mop up the mud',
    'tool.caulk': 'Caulk gun',
    'tool.oil': 'Oil brush',
    'hint.caulk': 'Hold and run along the gaps between the logs — the bead finds the nearest gap, one sweep fills a row · zoom in to see the gaps',
    'hint.oil': 'Hold and brush over the logs to oil them · pick an oil below · out of oil? click the tin on the floor',
    'hint.oilDry': 'The brush is dry — click the oil tin on the floor, or pick an oil below',
    'paint.oil.0': 'Honey',
    'paint.oil.1': 'Walnut',
    'paint.oil.2': 'Pale pine',
    'paint.load.oil': 'Oil on the brush',
    'hint.cabin.fireLocked': 'The cold wind through the walls won\'t let it catch — fill the gaps and scrub the stones first',
    'hint.cabin.draft': 'The draft through the walls blew the candles out — fill the gaps first',
    'demo.cabin.trash': 'sweep out what the wind blew in',
    'demo.cabin.soot': 'scrub the stone fireplace',
    'demo.chink': 'fill the gaps — no more draft',
    'demo.oil': 'oil the logs back to honey',
    'box.autumn': 'Autumn things',
  },
});

export default {
  id: 'cabin',
  room: 'cabin',
  bin: { x: 2.5, z: 2.05 },
  trash: {
    seed: 21,
    counts: { leaves: 12, twig: 7, cone: 5, paper: 3, news: 1 },
    kinds: litter,
    blownIn: ['leaves', 'twig'],
  },
  // the old candles on the mantel were left behind: they're here from the start
  stay: ['lamp:candles'],
  demoPaint: OILS[0],
  boxes: [
    { id: 'furniture', big: true, at: [-0.4, 0.55, 0.15], items: ['couch', 'coffee_table', 'armchair', 'bookcase', 'teatable', 'chair', 'chair#2', 'side_table', 'pouf', 'chest'] },
    { id: 'lights', at: [0.35, 0.95, -0.2], items: ['lamp:floor', 'lamp:table', 'lamp:lantern'] },
    { id: 'books', at: [-0.35, 1.5, 0.1], items: ['books', 'books#2', 'books#3', 'books#4', 'books#5', 'book', 'book#2'] },
    { id: 'autumn', icon: 'decor', at: [-1.0, 0.1, 0.3], items: ['pumpkin', 'pumpkin#2', 'pumpkin#3', 'pumpkin#4', 'pumpkin#5'] },
    { id: 'plants', at: [0.25, -0.35, 0.25], items: ['fig', 'cactus', 'cactus#2', 'cactus#3', 'cactus#4', 'cactus#5'] },
    { id: 'frames', at: [-0.55, -0.8, -0.15], items: ['frame_mountain', 'frame_flowers', 'frame_small'] },
    // (the cat comes out last: it settles in front of the fire)
    { id: 'decor', at: [0.55, 1.8, -0.1], items: ['blanket', 'plate', 'jar', 'jar#2', 'jar#3', 'bowl', 'basket', 'frame_standing', 'cat'] },
  ],
  lost: [[-0.5, 2.15, -0.2], [0.9, 2.2, 0.15], [-1.6, 0.4, 0], [0.1, -1.3, 0.2]],
  tools: ['hand', 'mop', 'squeegee', 'caulk', 'brush', 'oil'],
  tasks: [
    {
      id: 'trash',
      tool: 'hand',
      progress: (L) => L.trash.progress,
      count: (L) => `${L.trash.binned}/${L.trash.total}`,
    },
    {
      id: 'mop',
      tool: 'mop',
      threshold: 0.88,
      progress: (L) => L.mud.progress,
      finish: (L) => L.mud.finish(),
    },
    {
      id: 'windows',
      tool: 'squeegee',
      threshold: 0.85,
      progress: (L) => L.grime.windowProgress,
      finish: (L) => L.grime.finishWindows(),
    },
    {
      // the twist: until every gap is filled the wind comes in (the fire won't catch,
      // candles blow out)
      id: 'chink',
      tool: 'caulk',
      threshold: 0.92,
      progress: (L) => L.chink.progress,
      finish: (L) => L.chink.fillGaps(CREAM),
    },
    {
      id: 'soot',
      tool: 'brush',
      threshold: 0.9,
      progress: (L) => L.grime.sootProgress,
      finish: (L) => L.grime.finishSoot(),
    },
    {
      id: 'oil',
      tool: 'oil',
      threshold: 0.9,
      progress: (L) => L.logs.progress,
      finish: (L, { tools }) => L.logs.fillGaps(tools.oil.color),
    },
    {
      id: 'fire',
      tool: 'hand',
      requires: ['soot', 'chink'],
      progress: (L) => (L.room.fireOn ? 1 : 0),
    },
  ],
  setup,
  demo,
  captions: { mop: 'mop', chink: 'chink', oil: 'oil' },
};
