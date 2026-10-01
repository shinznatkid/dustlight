// Room module: a tiny flat above a noodle bar in a rainy neon city, in the pottery studio's
// "flat low-poly" style — Kenney Furniture Kit pieces re-tinted to a warm palette plus
// procedural things (the neon signs, the kitchenette and its stove, the city outside, the
// cat). Its light identity: coloured neon — three signs inside (magenta, amber, cyan: lamps
// that come on at dusk, src/rooms/cyber/signs.js), the city's glow through the window at
// night (the "sun" after dark is the street's neon), the warm stove and lamps against it.
// Level 6 plays here (src/levels/cyber.js); on its own: proto.html?room=cyber.
// Contract: see the header of src/rooms/meadow.js.
import * as THREE from 'three';
import { buildShell } from './cyber/shell.js';
import { loadProps } from './cyber/props.js';
import { buildFixtures, fixturesReady } from './cyber/fixtures.js';
import { ROOM, WIN, WAIN, SILL, FRAME, KITCHEN, HOB, AC } from './cyber/layout.js';

// ---- what a level can work on here (formats: SITES in src/room.js) -------------------------
//   windows — the two sashes of the big window (grime.js), in the frame's plane
//   soot    — the kitchen tiles behind the hob: grease and smoke from years of cooking
//   walls   — the plaster above the mint dado: [0, 5) left wall ← z · [5, 11) back wall ← x
//             (the window, the kitchen tiles and shelf, the air conditioner don't count)
const { X0, X1, Z0, Z1, H } = ROOM;
const SASH = WIN.w / 2;
const sites = {
  windows: [0, 1].map((i) => ({ at: [FRAME.x + 0.004, (WIN.y0 + WIN.y1) / 2, FRAME.z0 + SASH * (i + 0.5)], ry: Math.PI / 2, w: SASH, h: WIN.y1 - WIN.y0 })),
  soot: { at: [HOB.x + 0.02, (KITCHEN.top + KITCHEN.splash) / 2, Z0 + 0.012], ry: 0, w: 0.9, h: KITCHEN.splash - KITCHEN.top - 0.02, hole: { w: 0, h: 0 } },
  walls: {
    aw: 11,
    ah: 3.2,
    base: WAIN + 0.05, // the rail on top of the tiles
    top: H,
    old: '#a39a93', // the peach gone grey, water-stained
    faces: [
      {
        face: 'left', axis: 'x', at: X0, sign: 1, along: 'z', lo: Z0, hi: Z1, ua: 0, origin: Z0,
        holes: [{ a0: FRAME.z0 - 0.1, a1: FRAME.z1 + 0.1, y0: SILL.y - 0.12, y1: WIN.y1 + 0.1 }],
      },
      {
        face: 'back', axis: 'z', at: Z0, sign: 1, along: 'x', lo: X0, hi: X1, ua: Z1 - Z0, origin: X0,
        holes: [{ a0: KITCHEN.x0 - 0.02, a1: KITCHEN.x1 + 0.02, y0: -1, y1: KITCHEN.splash + 0.03 }, { a0: AC.x - 0.43, a1: AC.x + 0.43, y0: AC.y - 0.15, y1: AC.y + 0.15 }],
      },
    ],
  },
};

// framed for the 6 × 5 m diorama (16:9); `kitchen` and `window` are closer looks
const cams = {
  hero: { pos: [7.4, 5.5, 8.0], look: [-0.3, 0.9, -0.3], fov: 28 },
  window: { pos: [1.6, 1.9, 3.2], look: [-2.6, 1.3, -0.3], fov: 40 },
  kitchen: { pos: [-0.2, 1.9, 1.7], look: [1.4, 1.15, -2.2], fov: 42 },
  signs: { pos: [2.2, 1.7, 2.6], look: [-1.6, 1.8, -1.6], fov: 44 },
  top: { pos: [0.4, 14, 5.5], look: [0, 0, 0], fov: 32 },
};

// The time of day, this room's way (world.js KEYS format). By day: the game's sun and sky
// over a hazy pastel city, a warm peach backdrop. From dusk the sky goes violet and the city
// lights up, and the "sun" becomes the street's neon glow coming in through the window —
// low, pink-violet, strong enough to lay a coloured patch on the floor (and grimy glass keeps
// it out, like the sun). The probes' sky (zen / dhor / gnd) stays a soft violet at night: the
// city's glow on the clouds, so the room is never black. tree = the buildings' tone.
const C = (r, g, b) => new THREE.Color(r, g, b);
const keys = [
  { t: 0.0, key: 'morning', elev: 36, head: -28, sun: C(1.0, 0.93, 0.84), si: 8.5, top: C(0.9, 1.3, 2.2), hor: C(2.4, 2.3, 2.2), glow: C(0.5, 0.45, 0.4), tree: C(0.55, 0.52, 0.6), bg: C(1.25, 0.82, 0.72), amb: 0.02, exp: 1.0, zen: C(0.55, 0.62, 0.78), dhor: C(0.66, 0.63, 0.6), gnd: C(0.16, 0.14, 0.13) },
  { t: 0.35, key: 'afternoon', elev: 31, head: -10, sun: C(1.0, 0.87, 0.72), si: 10.0, top: C(0.85, 1.2, 2.1), hor: C(2.6, 2.3, 2.0), glow: C(1.0, 0.7, 0.45), tree: C(0.55, 0.5, 0.56), bg: C(1.3, 0.82, 0.66), amb: 0.02, exp: 1.0, zen: C(0.55, 0.58, 0.68), dhor: C(0.7, 0.62, 0.56), gnd: C(0.16, 0.13, 0.11) },
  { t: 0.62, key: 'golden', elev: 22, head: 6, sun: C(1.0, 0.56, 0.42), si: 10.5, top: C(0.85, 0.65, 1.2), hor: C(2.8, 1.35, 1.05), glow: C(3.0, 1.1, 0.8), tree: C(0.3, 0.2, 0.34), bg: C(1.35, 0.72, 0.62), amb: 0.02, exp: 1.05, zen: C(0.44, 0.4, 0.52), dhor: C(0.66, 0.46, 0.42), gnd: C(0.14, 0.1, 0.09) },
  { t: 0.8, key: 'dusk', elev: 14, head: 4, sun: C(1.0, 0.36, 0.72), si: 4.5, top: C(0.16, 0.13, 0.42), hor: C(0.9, 0.34, 0.6), glow: C(0.8, 0.2, 0.5), tree: C(0.05, 0.04, 0.09), bg: C(0.13, 0.06, 0.2), amb: 0.015, exp: 1.35, zen: C(0.15, 0.13, 0.28), dhor: C(0.26, 0.15, 0.27), gnd: C(0.05, 0.03, 0.06) },
  { t: 0.88, key: 'evening', elev: 17, head: 0, sun: C(0.8, 0.34, 1.0), si: 4.6, top: C(0.04, 0.04, 0.14), hor: C(0.32, 0.12, 0.36), glow: C(0.3, 0.1, 0.3), tree: C(0.02, 0.02, 0.05), bg: C(0.06, 0.03, 0.1), amb: 0.012, exp: 1.5, zen: C(0.035, 0.035, 0.09), dhor: C(0.06, 0.045, 0.1), gnd: C(0.02, 0.015, 0.03) },
  { t: 1.0, key: 'night', elev: 19, head: -8, sun: C(0.72, 0.36, 1.0), si: 4.8, top: C(0.02, 0.025, 0.09), hor: C(0.24, 0.1, 0.3), glow: C(0.2, 0.08, 0.25), tree: C(0.015, 0.015, 0.04), bg: C(0.035, 0.02, 0.07), amb: 0.012, exp: 1.55, zen: C(0.03, 0.03, 0.08), dhor: C(0.05, 0.04, 0.09), gnd: C(0.015, 0.012, 0.025) },
];

export default {
  id: 'cyber',
  bounds: ROOM,
  sites,
  build: buildShell,
  ready: fixturesReady,
  loadProps,
  buildFixtures,
  cams,
  keys,
};
