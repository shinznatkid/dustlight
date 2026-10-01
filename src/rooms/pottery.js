// Room module: a sunny little pottery studio in "flat low-poly" style — Kenney
// Furniture Kit pieces re-tinted to a warm palette + procedural low-poly props
// (lathe-turned pots, the wheel, a brick kiln), flat colours, no photo textures.
// Level 4 plays here (src/levels/pottery.js); on its own: proto.html?room=pottery.
// Contract: see the header of src/rooms/meadow.js.
import * as THREE from 'three';
import { buildShell } from './pottery/shell.js';
import { loadProps } from './pottery/props.js';
import { buildFixtures, fixturesReady } from './pottery/fixtures.js';
import { ROOM, WIN, WAIN, SILL, FRAME, KILN } from './pottery/layout.js';

// ---- what a level can work on here (formats: SITES in src/room.js) -------------------------
//   windows — the three panes of the big window (grime.js), in the frame's plane
//   walls   — the plaster above the sage wainscot's rail: [0, 5) left wall ← z ·
//             [5, 11) back wall ← x (the window, the test-tile board and the wall behind
//             the kiln don't count)
const { X0, X1, Z0, Z1, H } = ROOM;
const PANE = WIN.w / 3;
const sites = {
  windows: [0, 1, 2].map((i) => ({ at: [FRAME.x + 0.004, (WIN.y0 + WIN.y1) / 2, FRAME.z0 + PANE * (i + 0.5)], ry: Math.PI / 2, w: PANE, h: WIN.y1 - WIN.y0 })),
  walls: {
    aw: 11,
    ah: 3.2,
    base: WAIN + 0.05, // the rail on top of the wainscot
    top: H,
    old: '#c2ab96', // the apricot gone grey and dusty
    faces: [
      {
        face: 'left', axis: 'x', at: X0, sign: 1, along: 'z', lo: Z0, hi: Z1, ua: 0, origin: Z0,
        holes: [{ a0: FRAME.z0 - 0.1, a1: FRAME.z1 + 0.1, y0: SILL.y - 0.12, y1: WIN.y1 + 0.1 }],
      },
      {
        face: 'back', axis: 'z', at: Z0, sign: 1, along: 'x', lo: X0, hi: X1, ua: Z1 - Z0, origin: X0,
        holes: [{ a0: -1.88, a1: -1.18, y0: 1.0, y1: 1.42 }, { a0: KILN.x - 0.6, a1: X1, y0: -1, y1: 1.3 }],
      },
    ],
  },
};

// framed for the 6 × 5 m diorama (16:9); `wheel` and `kiln` are closer looks
const cams = {
  hero: { pos: [7.4, 5.5, 8.0], look: [-0.3, 0.8, -0.3], fov: 28 },
  wheel: { pos: [1.3, 1.75, 2.5], look: [-1.6, 0.75, -0.55], fov: 38 },
  kiln: { pos: [-0.4, 2.0, 1.9], look: [1.6, 1.05, -1.8], fov: 40 },
  top: { pos: [0.4, 14, 5.5], look: [0, 0, 0], fov: 32 },
};

// world.js KEYS (sun, sky, probe dome, exposure — the locked lighting) with one
// change: a warm cream backdrop by day (an earlier prototype's #e3c39d), deepening
// through dusk to a dark warm brown at night so the lamps carry the room.
const C = (r, g, b) => new THREE.Color(r, g, b);
const keys = [
  { t: 0.0, key: 'morning', elev: 38, head: -28, sun: C(1.0, 0.93, 0.84), si: 9.0, top: C(0.9, 1.35, 2.3), hor: C(2.5, 2.45, 2.25), glow: C(0.5, 0.45, 0.35), tree: C(0.2, 0.3, 0.14), bg: C(1.3, 0.9, 0.52), amb: 0.02, exp: 1.0, zen: C(0.55, 0.62, 0.78), dhor: C(0.66, 0.63, 0.57), gnd: C(0.16, 0.14, 0.12) },
  { t: 0.35, key: 'afternoon', elev: 31, head: -10, sun: C(1.0, 0.86, 0.68), si: 10.5, top: C(0.85, 1.2, 2.1), hor: C(2.7, 2.35, 1.9), glow: C(1.0, 0.7, 0.35), tree: C(0.18, 0.24, 0.1), bg: C(1.35, 0.87, 0.46), amb: 0.02, exp: 1.0, zen: C(0.55, 0.58, 0.66), dhor: C(0.7, 0.62, 0.52), gnd: C(0.16, 0.13, 0.1) },
  { t: 0.62, key: 'golden', elev: 22, head: 6, sun: C(1.0, 0.6, 0.3), si: 11.5, top: C(0.95, 0.8, 1.1), hor: C(2.9, 1.65, 0.8), glow: C(3.0, 1.4, 0.5), tree: C(0.12, 0.11, 0.07), bg: C(1.35, 0.84, 0.42), amb: 0.02, exp: 1.05, zen: C(0.44, 0.42, 0.5), dhor: C(0.66, 0.5, 0.36), gnd: C(0.14, 0.1, 0.07) },
  { t: 0.8, key: 'dusk', elev: 8, head: 15, sun: C(1.0, 0.38, 0.16), si: 2.5, top: C(0.22, 0.22, 0.45), hor: C(1.1, 0.5, 0.32), glow: C(1.0, 0.35, 0.12), tree: C(0.03, 0.03, 0.04), bg: C(0.32, 0.19, 0.13), amb: 0.015, exp: 1.25, zen: C(0.12, 0.12, 0.21), dhor: C(0.22, 0.15, 0.13), gnd: C(0.04, 0.03, 0.03) },
  { t: 0.88, key: 'evening', elev: 20, head: 10, sun: C(0.55, 0.65, 1.0), si: 0.0, top: C(0.05, 0.06, 0.14), hor: C(0.2, 0.18, 0.3), glow: C(0.1, 0.08, 0.12), tree: C(0.015, 0.015, 0.025), bg: C(0.05, 0.035, 0.03), amb: 0.012, exp: 1.4, zen: C(0.05, 0.06, 0.12), dhor: C(0.07, 0.07, 0.12), gnd: C(0.015, 0.015, 0.02) },
  { t: 1.0, key: 'night', elev: 38, head: -18, sun: C(0.55, 0.68, 1.0), si: 1.1, top: C(0.02, 0.03, 0.08), hor: C(0.07, 0.09, 0.18), glow: C(0.08, 0.1, 0.2), tree: C(0.008, 0.01, 0.018), bg: C(0.03, 0.025, 0.028), amb: 0.012, exp: 1.45, zen: C(0.035, 0.045, 0.1), dhor: C(0.04, 0.05, 0.09), gnd: C(0.01, 0.01, 0.015) },
];

export default {
  id: 'pottery',
  bounds: ROOM,
  sites,
  build: buildShell,
  ready: fixturesReady,
  loadProps,
  buildFixtures,
  cams,
  keys,
};
