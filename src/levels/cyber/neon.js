import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { surfaceTool } from '../../tools/surfaceTools.js';
import { TUBE_Z } from '../../rooms/cyber/signs.js';

// The twist of level 6: the old sign-maker's three neon signs are dead — grey, dusty tubes
// with bits broken off. With the tube tool the player traces along a dead tube and a new one
// lights up right under the pointer, in the sign's colour; the sign's light grows with every
// centimetre (its PointLight is scaled by how much of it is new: fixtures.js), so the room
// takes on the colour as you draw. At ~90% the sign strikes — a stutter of on/off and a
// click or three — and the rest of its tubing comes on by itself. The probes see the signs'
// lights, so the bounce light of the whole flat turns magenta / amber / cyan sign by sign.
//
// The tool keeps to one tube per drag (playtest 2026-09-30: a drag must not jump between
// rows): the tubes near the press are candidates, and the one the pointer then moves along
// (~2.5 cm) is the stroke's — tubes meet (a bowl's ends touch its rim), so the nearest one at
// the press isn't always it. It follows that tube only near where it already is (a loop
// doesn't skip across), and lights the whole stretch between two pointer events (a fast sweep
// leaves no gaps). A click without a drag leaves a dab of new tube. Signs are the room's
// (src/rooms/cyber/signs.js); they hang where the player put them: everything works in each
// sign's own frame, on the plane of its tubes.
//
// Colours (playtest 2026-09-30, "like choosing a wall paint"): a colour belongs to a sign. With
// the tube in hand the HUD shows the swatches of the sign you're at (the one under the pointer,
// else the last one) — its own colour first — and picking one re-colours that sign there and
// then: the new tubes, the glow and the light it throws (the probes see it, so the room's tint
// follows); a lit sign stutters as it takes the new colour. Tubes traced from then on are that
// colour. Kept in the save and the journal (strokes carry their colour like the roller's paint,
// and a pick is a ['tint', sign, colour] mark).
//
// The fourth sign (street) is the noodle bar's lantern outside the window, the level's last
// job: worked through the glass like the others, but only once the stove is lit (locked).

const PICK = 0.075; // a press this close to a dead tube picks it (m)
const FOLLOW = 0.13; // a drag keeps lighting while within this of its tube
const DONE = 0.9; // a sign this new strikes up and finishes itself
const STRIKE_CLICKS = [0, 0.13, 0.28, 0.42]; // the ticks of a tube catching (fixtures.js STRIKE)

// the tool in the hand: a short U of glass tube with its two electrodes (local +z = away
// from the sign), glowing in the colour of the sign it's over
function tubeModel() {
  const g = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) });
  const u = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 14, Math.PI), glow);
  u.rotation.z = Math.PI;
  u.position.set(0, 0.02, 0.05);
  const legs = new THREE.CylinderGeometry(0.011, 0.011, 0.12, 6);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(legs, glow);
    leg.position.set(s * 0.05, 0.08, 0.05);
    g.add(leg);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.04, 8), new THREE.MeshStandardMaterial({ color: '#2b2a30', roughness: 0.5, metalness: 0.4 }));
    cap.position.set(s * 0.05, 0.155, 0.05);
    g.add(cap);
  }
  g.add(u);
  g.traverse((o) => {
    o.layers.set(LAYER_MAIN_ONLY);
    if (o.isMesh) o.castShadow = false;
  });
  g.userData.glow = glow;
  return g;
}

export const ICON_TUBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V9a4 4 0 0 1 8 0v6a3 3 0 0 0 6 0V4"/><path d="M3.5 20h3M17.5 4h3"/><path d="M9 2.5v1.5M4 5.5l1 1M14 5.5l-1 1"/></svg>';

// the colours each sign can take: its own first, then its place in the palettes that were tried
// (warm · cool · mix — so each of those looks can be made); the lantern: red, amber, violet, cyan
export const SWATCHES = {
  ramen: ['#ff2f9a', '#ff5a4f', '#b45cff', '#2fe4ff'],
  moon: ['#ffa733', '#ffcf4a', '#6dffb3', '#ff2f9a'],
  cat: ['#2fe4ff', '#ff8f3a', '#4f8cff', '#b6ff3a'],
  street: ['#ff5a4f', '#ffa733', '#b45cff', '#2fe4ff'],
};

// locked(): the lantern may not be worked yet (the level says: the stove comes first)
export function createNeon(world, { journal, rub, sound = () => {}, note = () => {}, t = (k) => k, locked = () => false }) {
  const lamps = world.fixtures.signs;
  const signs = lamps.map((l) => l.sign);
  const names = lamps.map((l) => l.name);
  const done = signs.map(() => false);
  const STREET = lamps.findIndex((l) => l.street); // the lantern outside (-1: none)
  const inner = signs.map((_, i) => i).filter((i) => i !== STREET); // the three in the flat
  const colors = signs.map((s) => s.spec.color);
  let focus = 0; // the sign whose colours the HUD shows
  let streetOpen = false; // (the lantern's unlocked: said once)
  const strikes = []; // { i, t } a sign striking up: its clicks and the bounce light after
  let lock = null; // { i: sign, si: stroke, arc } — the tube the stroke is on
  let lockSaid = false;
  const colorName = (hex) => t(`neon.col.${hex.slice(1)}`);

  // sign i takes a colour: its tubes, glow and light · quiet = no stutter, no bounce (setup)
  function recolor(i, hex, { quiet = false } = {}) {
    if (!hex || colors[i] === hex) return false;
    colors[i] = hex;
    signs[i].setColor(hex);
    lamps[i].light.color.set(hex);
    if (quiet || signs[i].lit <= 0) return true;
    // a lit sign stutters into its new colour; the bounce light follows once it's steady
    world.fixtures.strike(lamps[i]);
    sound('switch', { gain: 0.4, rate: 1.35 });
    strikes.push({ i, t: 0, clicks: STRIKE_CLICKS.length });
    return true;
  }

  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  const local = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const live = (i) => !lamps[i].root.parent?.userData.stored;
  const normalOf = (i) => new THREE.Vector3(0, 0, 1).transformDirection(signs[i].object.matrixWorld);

  // a sign's last tubes go in by themselves: it strikes, clicks, and lights the room
  function strike(i, { quiet = false } = {}) {
    if (done[i]) return;
    done[i] = true;
    signs[i].setAll(1);
    lamps[i].target = 1;
    if (quiet) return;
    world.fixtures.strike(lamps[i]);
    strikes.push({ i, t: 0, clicks: 0 });
    journal.mark('sign', i);
    note(t(`hint.cyber.sign.${lamps[i].name}`, { col: colorName(colors[i]) }));
  }

  // A press finds the tubes near it (pend); which one it is shows once the pointer has
  // moved along one (tubes meet: the bowl's rim runs through the ends of the bowl), and
  // from then on the stroke keeps to that tube (lock)
  let pend = null; // { i, x, y, cands: [{ si, arc }] }
  function lit(i, fresh) {
    if (!fresh) return;
    lamps[i].target = 1; // (a sign someone switched off comes on as you fix it)
    if (signs[i].lit >= DONE) strike(i);
  }
  function work(h, px, py) {
    const i = names.indexOf(h.item);
    if (i < 0) return false;
    if (h.locked) {
      // (live hits only: the timelapse's recorded ones never are)
      if (!lockSaid) note(t('hint.cyber.streetLocked'));
      lockSaid = true;
      return false;
    }
    if (!live(i) || done[i]) return false;
    const s = signs[i];
    const x = px / 100;
    const y = py / 100;
    if (!lock || lock.i !== i) {
      if (!pend || pend.i !== i) {
        const cands = s.strokes.map((_, si) => s.nearest(x, y, si)).filter((n) => n.d <= PICK);
        if (!cands.length) return false;
        pend = { i, x, y, cands };
        return true;
      }
      if (Math.hypot(x - pend.x, y - pend.y) < 0.025) return true;
      let best = null;
      for (const c of pend.cands) {
        const n = s.nearest(x, y, c.si);
        if (!best || n.d < best.n.d) best = { c, n };
      }
      if (best.n.d > FOLLOW) return false;
      lock = { i, si: best.c.si, arc: best.c.arc };
      pend = null;
    }
    const n = s.nearest(x, y, lock.si, lock.arc, 0.3);
    if (!n || n.d > FOLLOW) return false;
    const fresh = s.light(lock.si, lock.arc, n.arc);
    lock.arc = n.arc;
    lit(i, fresh); // (along a tube that's new already: still "working", no light change)
    return true;
  }
  // let go without having moved: a dab of new tube where it was pressed (a click shows something)
  function release() {
    if (pend && !done[pend.i]) {
      const c = pend.cands.reduce((a, b) => (b.d < a.d ? b : a));
      lit(pend.i, signs[pend.i].light(c.si, c.arc, c.arc));
    }
    pend = null;
    lock = null;
  }

  const model = tubeModel();
  const glowCol = new THREE.Color();
  // (a stroke carries the colour of its sign, like the roller's paint: the timelapse re-colours
  // with it · a press on the locked lantern isn't work, and isn't kept)
  const rec0 = journal.surface('neon', { itemOf: (item) => item, colorOf: () => colors[focus] });
  const rec = { ...rec0, point: (h, b) => { if (!h?.locked) rec0.point(h, b); } };
  const tool = surfaceTool(world, {
    id: 'tube',
    rub,
    rubKind: 'glass',
    rec,
    hint: () => 'hint.tube',
    model,
    offset: 0.03,
    spacing: 1.5,
    giEvery: 1.2,
    onDown: () => {
      lock = null;
      pend = null;
      lockSaid = false;
      return false;
    },
    find: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      const targets = [];
      lamps.forEach((l, i) => { if (live(i)) targets.push(l.sign.board, l.sign.tubes); });
      const hit = ray.intersectObjects(targets, false)[0];
      if (!hit) return null;
      const i = lamps.findIndex((l) => l.sign.board === hit.object || l.sign.tubes === hit.object);
      // where the ray crosses the tubes' plane (a hit on the board behind them, seen at an
      // angle, would be centimetres off the tube the pointer is on)
      const o = signs[i].object;
      o.updateWorldMatrix(true, false);
      o.worldToLocal(local.copy(ray.ray.origin));
      o.worldToLocal(dir.copy(ray.ray.origin).add(ray.ray.direction)).sub(local);
      if (Math.abs(dir.z) > 1e-4) local.addScaledVector(dir, (TUBE_Z - local.z) / dir.z);
      focus = i; // (the HUD's swatches follow the pointer)
      glowCol.set(colors[i]).multiplyScalar(done[i] ? 1.2 : 3);
      model.userData.glow.color.copy(glowCol);
      const h = { item: names[i], point: hit.point.clone(), normal: normalOf(i), px: local.x * 100, py: local.y * 100 };
      if (i === STREET && !done[i] && locked()) h.locked = true;
      return h;
    },
    // (strokes are kept by the sign's name: the timelapse skips a falsy item, and sign 0 is one;
    // the stroke's sign is the one a colour then goes to — replay.js sets it right after)
    target: (name) => {
      const i = names.indexOf(name);
      if (i < 0) return null;
      focus = i;
      return { item: name, normal: normalOf(i) };
    },
    work,
  });
  tool.icon = ICON_TUBE;
  // the swatches in the HUD (hud.js palette): the sign's at the pointer
  Object.defineProperties(tool, {
    colors: { get: () => SWATCHES[names[focus]] ?? [colors[focus]] },
    color: { get: () => colors[focus] },
    setColor: {
      value(hex) {
        if (!recolor(focus, hex)) return;
        journal.mark('tint', names[focus], hex);
        glowCol.set(hex).multiplyScalar(done[focus] ? 1.2 : 3);
        model.userData.glow.color.copy(glowCol);
      },
    },
    colorName: { value: (hex) => { const s = colorName(hex); return s.charAt(0).toUpperCase() + s.slice(1); } },
    paletteLabel: { value: () => t('neon.palette', { sign: t(`neon.sign.${names[focus]}`) }) },
  });
  // (a new stroke — by hand or in the timelapse — picks its own tube)
  const replayDown = tool.replay.down;
  tool.replay.down = (h) => {
    lock = null;
    pend = null;
    replayDown(h);
  };
  const replayUp = tool.replay.up;
  tool.replay.up = () => {
    release();
    replayUp();
  };
  const up = tool.up;
  tool.up = (...a) => {
    release();
    up(...a);
  };
  const toolRelease = tool.release;
  tool.release = () => {
    pend = null;
    lock = null;
    toolRelease();
  };

  const share = (i) => (done[i] ? 1 : Math.min(1, signs[i].lit / DONE));
  const defaults = () => signs.forEach((s, i) => recolor(i, s.spec.color, { quiet: true }));
  const sys = {
    tool,
    signs,
    lamps,
    inner, // the three in the flat (the "neon" task)
    street: STREET, // the lantern outside (the "street" task)
    // the three signs in the flat: how many are lit, of how many
    get done() { return inner.filter((i) => done[i]).length; },
    get total() { return inner.length; },
    // each sign counts up to its strike (so the bar is full exactly when the last one strikes)
    get progress() { return inner.reduce((a, i) => a + share(i), 0) / inner.length; },
    get streetProgress() { return STREET < 0 ? 1 : share(STREET); },
    get colors() { return colors.slice(); },
    fresh() {
      strikes.length = 0;
      lock = null;
      focus = 0;
      streetOpen = false;
      defaults();
      signs.forEach((s, i) => {
        s.setAll(0);
        done[i] = false;
      });
    },
    finished() {
      strikes.length = 0;
      defaults();
      signs.forEach((s, i) => {
        s.setAll(1);
        done[i] = true;
      });
    },
    complete() {
      signs.forEach((s, i) => strike(i, { quiet: true }));
    },
    // the tasks' tidy-up: the flat's three signs · the lantern
    finishInner() { for (const i of inner) strike(i, { quiet: true }); },
    finishStreet() { if (STREET >= 0) strike(STREET, { quiet: true }); },
    // one sign finished at once (the timelapse's ['sign', i] marks)
    strikeSign(i, quiet = false) { strike(i, { quiet }); },
    // a sign by name takes a colour (the timelapse's ['tint', name, colour] marks)
    recolor(name, hex) {
      const i = names.indexOf(name);
      if (i >= 0) recolor(i, hex);
    },
    serialize: () => ({ runs: signs.map((s) => s.serialize()), colors: colors.slice() }),
    // (a save from before the colours / the lantern: the runs alone, three of them — a sign
    // with nothing saved is dead while restoring, lit once the repairs are done)
    restore(data, { early = true } = {}) {
      strikes.length = 0;
      const runs = Array.isArray(data) ? data : data?.runs ?? [];
      signs.forEach((s, i) => {
        recolor(i, data?.colors?.[i] ?? s.spec.color, { quiet: true });
        if (runs[i] !== undefined) s.restore(runs[i]);
        else s.setAll(early ? 0 : 1);
        done[i] = s.lit >= DONE;
        if (done[i]) s.setAll(1);
      });
      streetOpen = !locked();
    },
    update(dt) {
      // the stove lit: the lantern outside is the last job (said once, as it opens)
      const open = STREET >= 0 && !locked();
      if (open && !streetOpen && !done[STREET]) note(t('hint.cyber.streetOpen'));
      streetOpen = open;
      for (let k = strikes.length - 1; k >= 0; k--) {
        const st = strikes[k];
        st.t += dt;
        while (st.clicks < STRIKE_CLICKS.length && st.t >= STRIKE_CLICKS[st.clicks]) {
          sound('switch', { gain: 0.45, rate: 1.25 + st.clicks * 0.12 });
          st.clicks++;
        }
        if (st.t >= 0.75) {
          // steady now: the bounce light takes the sign's full colour
          world.bounceChanged();
          strikes.splice(k, 1);
        }
      }
      return false;
    },
    // where a stroke of sign i runs, in world space (the title timelapse traces it)
    strokeWorld(i, si, step = 0.05) {
      const s = signs[i];
      const st = s.strokes[si];
      const pts = [];
      const n = Math.max(2, Math.ceil(st.len / step));
      s.object.updateWorldMatrix(true, false);
      for (let k = 0; k <= n; k++) pts.push(s.object.localToWorld(s.pointAt(si, (st.len * k) / n)));
      return pts;
    },
  };
  return sys;
}
