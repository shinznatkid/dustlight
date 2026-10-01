// Level 5's room: the solar at the top of a castle tower, in KayKit's "cute chunky" style
// (CC0 — tools/fetch_room_castle.py) over a shell built in code: limewashed ashlar walls with
// honey-stone surrounds, crenellations, a flagstone floor, a hooded hearth, a stained-glass
// lancet that throws coloured sunlight into the room (castle/glass.js) and a leaded window
// with a cushioned seat. Lit by the game's own sun / probe GI / post.
// The level itself is src/levels/castle.js. Module contract: src/rooms/meadow.js.
import * as THREE from 'three';
import { buildCastle, CASTLE, WINDOWS, FIRE, GLASS_X } from './castle/shell.js';
import { loadCastleProps } from './castle/props.js';
import { buildCastleFixtures } from './castle/fixtures.js';
import { rigHound } from './castle/hound.js';

let fixturesReady = Promise.resolve();

// (playtest 2026-09-30, both picked from prototypes)
//   coloured beams in the air between the stained glass and its patch on the floor (the shafts
//     pass also scatters the glass's spot light: atmos.js ShaftsPass `spot`) · &cshafts=<n>
//     scales them (tuning by eye; 0 = none)
//   the sleeping hound breathes, thumps its tail, twitches an ear (castle/hound.js; still in
//     ?still shots)
const FLAGS = new URLSearchParams(globalThis.location?.search ?? '');
// the coloured beams against the plain sun's: the glass passes little light (the spot is
// already ×1.8 the sun), and they go at dusk rather than hang on as moonlit haze
const CSHAFT_GAIN = 0.8 * (FLAGS.has('cshafts') && Number.isFinite(parseFloat(FLAGS.get('cshafts'))) ? parseFloat(FLAGS.get('cshafts')) : 1);
let houndTick = null;

// framed for the 6.2 × 5 m diorama and its battlements
const cams = {
  hero: { pos: [7.9, 5.9, 8.5], look: [-0.25, 1.0, -0.15], fov: 30 },
  fire: { pos: [2.9, 2.1, 2.2], look: [-0.2, 1.0, -2.0], fov: 42 },
  glass: { pos: [2.6, 2.3, 1.2], look: [-2.4, 1.2, -1.2], fov: 40 },
  top: { pos: [0.4, 14, 5.5], look: [0, 0, 0], fov: 32 },
};

// world.js KEYS with this room's backdrop: warm cream by day (as the cabin — it was liked there),
// a dusky plum at night; the sky card's "trees" are the valley seen from the tower
const C = (r, g, b) => new THREE.Color(r, g, b);
const keys = [
  { t: 0.0, key: 'morning', elev: 38, head: -28, sun: C(1.0, 0.93, 0.84), si: 9.0, top: C(0.9, 1.35, 2.3), hor: C(2.5, 2.45, 2.25), glow: C(0.5, 0.45, 0.35), tree: C(0.2, 0.34, 0.18), bg: C(1.0, 0.74, 0.46), amb: 0.02, exp: 1.0, zen: C(0.55, 0.62, 0.78), dhor: C(0.66, 0.63, 0.57), gnd: C(0.16, 0.14, 0.12) },
  { t: 0.35, key: 'afternoon', elev: 31, head: -10, sun: C(1.0, 0.86, 0.68), si: 10.5, top: C(0.85, 1.2, 2.1), hor: C(2.7, 2.35, 1.9), glow: C(1.0, 0.7, 0.35), tree: C(0.18, 0.3, 0.14), bg: C(1.0, 0.74, 0.46), amb: 0.02, exp: 1.0, zen: C(0.55, 0.58, 0.66), dhor: C(0.7, 0.62, 0.52), gnd: C(0.16, 0.13, 0.1) },
  { t: 0.62, key: 'golden', elev: 22, head: 6, sun: C(1.0, 0.6, 0.3), si: 11.5, top: C(0.95, 0.8, 1.1), hor: C(2.9, 1.65, 0.8), glow: C(3.0, 1.4, 0.5), tree: C(0.14, 0.14, 0.08), bg: C(1.4, 0.84, 0.36), amb: 0.02, exp: 1.05, zen: C(0.44, 0.42, 0.5), dhor: C(0.66, 0.5, 0.36), gnd: C(0.14, 0.1, 0.07) },
  { t: 0.8, key: 'dusk', elev: 8, head: 15, sun: C(1.0, 0.38, 0.16), si: 2.5, top: C(0.22, 0.22, 0.45), hor: C(1.1, 0.5, 0.32), glow: C(1.0, 0.35, 0.12), tree: C(0.03, 0.03, 0.04), bg: C(0.3, 0.19, 0.17), amb: 0.015, exp: 1.25, zen: C(0.12, 0.12, 0.21), dhor: C(0.22, 0.15, 0.13), gnd: C(0.04, 0.03, 0.03) },
  { t: 0.88, key: 'evening', elev: 20, head: 10, sun: C(0.55, 0.65, 1.0), si: 0.0, top: C(0.05, 0.06, 0.14), hor: C(0.2, 0.18, 0.3), glow: C(0.1, 0.08, 0.12), tree: C(0.015, 0.015, 0.025), bg: C(0.04, 0.03, 0.055), amb: 0.012, exp: 1.4, zen: C(0.05, 0.06, 0.12), dhor: C(0.07, 0.07, 0.12), gnd: C(0.015, 0.015, 0.02) },
  { t: 1.0, key: 'night', elev: 38, head: -18, sun: C(0.55, 0.68, 1.0), si: 1.1, top: C(0.02, 0.03, 0.08), hor: C(0.07, 0.09, 0.18), glow: C(0.08, 0.1, 0.2), tree: C(0.008, 0.01, 0.018), bg: C(0.03, 0.024, 0.045), amb: 0.012, exp: 1.45, zen: C(0.035, 0.045, 0.1), dhor: C(0.04, 0.05, 0.09), gnd: C(0.01, 0.01, 0.015) },
];

// ---- what the level works on (room module `sites`; formats in src/room.js SITES) ------------------------
const { X0, X1, Z0, Z1, H } = CASTLE;
const fx = FIRE.x;
const sites = {
  // the glass of both windows (the stained one first): each pane's bounding rectangle
  windows: WINDOWS.map((w) => ({ at: [GLASS_X + 0.006, (w.y0 + w.yA) / 2, w.zc], ry: Math.PI / 2, w: w.w, h: w.yA - w.y0 })),
  // the jambs' and lintel's fronts round the fire opening
  soot: { at: [fx, FIRE.lintel / 2, Z0 + FIRE.jd + 0.012], ry: 0, w: (FIRE.ow + FIRE.jw) * 2, h: FIRE.lintel, hole: { w: FIRE.ow * 2, h: FIRE.oh } },
  // the limewash: [0, 5) left wall ← z · [5, 11.2) back wall ← x (the hearth, the window
  // surrounds are stone: not counted)
  walls: {
    aw: 11.2,
    ah: 3.4,
    base: 0.02,
    top: H,
    old: '#8e8c80',
    faces: [
      {
        face: 'left', axis: 'x', at: X0, sign: 1, along: 'z', lo: Z0, hi: Z1, ua: 0, origin: Z0,
        holes: WINDOWS.map((w) => ({ a0: w.zc - w.w / 2 - 0.2, a1: w.zc + w.w / 2 + 0.2, y0: w.y0 - 0.08, y1: w.yA + 0.22 })),
      },
      {
        face: 'back', axis: 'z', at: Z0, sign: 1, along: 'x', lo: X0, hi: X1, ua: Z1 - Z0, origin: X0,
        holes: [{ a0: fx - FIRE.mhw - 0.02, a1: fx + FIRE.mhw + 0.02, y0: -1, y1: 9 }],
      },
    ],
  },
  floor: { x0: X0, x1: X1 + 0.1, z0: Z0, z1: Z1 + 0.1 },
};

export default {
  id: 'castle',
  bounds: CASTLE,
  sites,
  build(scene) {
    const room = buildCastle(scene);
    const spot = room.glass.spot;
    // (spot.intensity = the sun's × 1.8: full by day, gone by the time the moon is up)
    room.shaftSpot = { light: spot, weight: () => CSHAFT_GAIN * THREE.MathUtils.smoothstep(spot.intensity, 3, 9) };
    const update = room.update;
    room.update = (dt, time, snap) => {
      update(dt, time, snap);
      houndTick?.(snap ? 0 : dt, snap ? 0 : time); // (frozen shots: the pose at rest)
    };
    return room;
  },
  ready: () => fixturesReady,
  async loadProps(onProgress) {
    const props = await loadCastleProps(onProgress);
    await fixturesReady; // the lamps' models must be in before they're adopted
    const h = props.find((p) => p.e.id === 'hound');
    if (h) houndTick = rigHound(h.obj);
    return props;
  },
  buildFixtures(scene) {
    const f = buildCastleFixtures(scene);
    fixturesReady = f.ready;
    return f;
  },
  cams,
  keys,
};
