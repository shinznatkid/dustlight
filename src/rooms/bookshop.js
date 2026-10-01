// Level 3's room: a small warm corner bookshop in the "warm realistic" style — the
// same Poly Haven CC0 PBR assets as level 1's room, art-directed into a warm,
// saturated palette (honey/walnut wood, oxblood, mustard, forest green, terracotta
// plaster, cream) with procedural book spines. It tests the idea that
// bright, saturated object colours are what make a scene read warm. The
// level is src/levels/bookshop.js. Module contract: rooms/meadow.js.
//   proto.html?room=bookshop [&t=0.62] [&cam=hero|nook|counter|shelves|window]
import * as THREE from 'three';
import { texturesReady } from './bookshop/common.js';
import { ROOM, DOOR, WIN, SHELF, SEAT, WALL_SHELVES } from './bookshop/plan.js';
import { buildShell, bayInner } from './bookshop/shell.js';
import { loadProps } from './bookshop/props.js';
import { buildFixtures } from './bookshop/fixtures.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
// the backdrop the diorama floats on: warm cream by day (preferred in the style test to
// the dark one), deepening to a warm brown at night. Linear values, pushed well
// past the target because AgX desaturates bright colours: (1.9, 1.0, 0.34) at the
// golden hour's exposure lands on screen as ~#e2c29d (measured).
const bg = (r, g, b) => new THREE.Color(r, g, b);

// world.js KEYS (not exported) with only the backdrop changed: sun, sky and GI
// stay exactly the engine's, so the room's warmth comes from its colours alone
const KEYS = [
  { t: 0.0, key: 'morning', elev: 38, head: -28, sun: C(1.0, 0.93, 0.84), si: 9.0, top: C(0.9, 1.35, 2.3), hor: C(2.5, 2.45, 2.25), glow: C(0.5, 0.45, 0.35), tree: C(0.2, 0.3, 0.14), bg: bg(1.8, 1.02, 0.44), amb: 0.02, exp: 1.0, zen: C(0.55, 0.62, 0.78), dhor: C(0.66, 0.63, 0.57), gnd: C(0.16, 0.14, 0.12) },
  { t: 0.35, key: 'afternoon', elev: 31, head: -10, sun: C(1.0, 0.86, 0.68), si: 10.5, top: C(0.85, 1.2, 2.1), hor: C(2.7, 2.35, 1.9), glow: C(1.0, 0.7, 0.35), tree: C(0.18, 0.24, 0.1), bg: bg(1.85, 1.0, 0.38), amb: 0.02, exp: 1.0, zen: C(0.55, 0.58, 0.66), dhor: C(0.7, 0.62, 0.52), gnd: C(0.16, 0.13, 0.1) },
  { t: 0.62, key: 'golden', elev: 22, head: 6, sun: C(1.0, 0.6, 0.3), si: 11.5, top: C(0.95, 0.8, 1.1), hor: C(2.9, 1.65, 0.8), glow: C(3.0, 1.4, 0.5), tree: C(0.12, 0.11, 0.07), bg: bg(1.9, 1.0, 0.34), amb: 0.02, exp: 1.05, zen: C(0.44, 0.42, 0.5), dhor: C(0.66, 0.5, 0.36), gnd: C(0.14, 0.1, 0.07) },
  { t: 0.8, key: 'dusk', elev: 8, head: 15, sun: C(1.0, 0.38, 0.16), si: 2.5, top: C(0.22, 0.22, 0.45), hor: C(1.1, 0.5, 0.32), glow: C(1.0, 0.35, 0.12), tree: C(0.03, 0.03, 0.04), bg: bg(0.42, 0.24, 0.14), amb: 0.015, exp: 1.25, zen: C(0.12, 0.12, 0.21), dhor: C(0.22, 0.15, 0.13), gnd: C(0.04, 0.03, 0.03) },
  { t: 0.88, key: 'evening', elev: 20, head: 10, sun: C(0.55, 0.65, 1.0), si: 0.0, top: C(0.05, 0.06, 0.14), hor: C(0.2, 0.18, 0.3), glow: C(0.1, 0.08, 0.12), tree: C(0.015, 0.015, 0.025), bg: bg(0.042, 0.021, 0.012), amb: 0.012, exp: 1.4, zen: C(0.05, 0.06, 0.12), dhor: C(0.07, 0.07, 0.12), gnd: C(0.015, 0.015, 0.02) },
  { t: 1.0, key: 'night', elev: 38, head: -18, sun: C(0.55, 0.68, 1.0), si: 1.1, top: C(0.02, 0.03, 0.08), hor: C(0.07, 0.09, 0.18), glow: C(0.08, 0.1, 0.2), tree: C(0.008, 0.01, 0.018), bg: bg(0.034, 0.017, 0.01), amb: 0.012, exp: 1.45, zen: C(0.035, 0.045, 0.1), dhor: C(0.04, 0.05, 0.09), gnd: C(0.01, 0.01, 0.015) },
];

// ---- what the level works on (room module `sites`; formats in src/room.js SITES) -----------
const { X0, X1, Z0, Z1, H } = ROOM;
const sites = {
  // the shop window's glazing (one sheet across its lights and the transom, in the plane of
  // the bars) and the door's: its glazed upper half sits in the leaf, the transom in the
  // frame 3.5 cm further out — one sheet between the two, hidden inside the leaf's rails
  windows: [
    { at: [WIN.fx, (WIN.y0 + 0.07 + WIN.y1 - 0.08) / 2, (WIN.z0 + WIN.z1) / 2], ry: Math.PI / 2, w: WIN.z1 - WIN.z0 - 0.16, h: WIN.y1 - 0.08 - WIN.y0 - 0.07 },
    { at: [DOOR.fx + 0.025, (1.08 + DOOR.y1 - 0.08) / 2, (DOOR.z0 + DOOR.z1) / 2], ry: Math.PI / 2, w: DOOR.z1 - DOOR.z0 - 0.14, h: DOOR.y1 - 0.08 - 1.08 },
  ],
  // the plaster: the shop front (left wall) and the back wall right of the shelves. Two
  // companion faces the roller can never reach (y1 < 0) carry the same atlas on: the left
  // wall behind the shelves' end, and the strip of back wall above the shelves (painted
  // with the rest when the job is done — walls.js fillGaps)
  walls: {
    aw: 12.4,
    ah: 3.2,
    base: 0.12, // baseboards
    top: H,
    old: '#c4a58b', // faded, dusty apricot
    faces: [
      {
        face: 'left', axis: 'x', at: X0, sign: 1, along: 'z', lo: SHELF.front + 0.012, hi: Z1, ua: 0, origin: Z0,
        holes: [
          { a0: DOOR.z0, a1: DOOR.z1, y0: -1, y1: DOOR.y1 },
          { a0: WIN.z0, a1: WIN.z1, y0: WIN.y0, y1: WIN.y1 },
          { a0: SEAT.z0 - 0.03, a1: SEAT.z1 + 0.03, y0: -1, y1: SEAT.h }, // the window seat
        ],
      },
      { face: 'leftEnd', axis: 'x', at: X0, sign: 1, along: 'z', lo: Z0, hi: SHELF.front + 0.012, ua: 0, origin: Z0, y1: -1 },
      { face: 'back', axis: 'z', at: Z0, sign: 1, along: 'x', lo: SHELF.x1, hi: X1, ua: 5.6, origin: X0 },
      { face: 'backTop', axis: 'z', at: Z0, sign: 1, along: 'x', lo: X0, hi: SHELF.x1, ua: 5.6, origin: X0, y1: -1 },
    ],
  },
  // the level's own (src/levels/bookshop.js): the fronts of the book runs the duster works
  // on — the built-in shelves and the floating shelves behind the counter (planes z = at,
  // x0..x1 × y0..y1) — and the dust over them: every fragment of the books and the shelf
  // wood in front of zMax inside x0..x1 × y0..y1 (the mask's frame)
  shelves: [
    { item: 'shelves', at: SHELF.front, x0: SHELF.x0 + 0.02, x1: SHELF.x1 - 0.02, y0: 0.1, y1: SHELF.cornice },
    { item: 'wall', at: Z0 + WALL_SHELVES[0].d, x0: WALL_SHELVES[0].x0 - 0.05, x1: WALL_SHELVES[0].x1 + 0.05, y0: WALL_SHELVES[0].y - 0.18, y1: WALL_SHELVES[1].y + 0.36 },
  ],
  dust: { x0: X0, x1: WALL_SHELVES[0].x1 + 0.1, y0: 0, y1: SHELF.cornice + 0.02, zMax: SHELF.front + 0.07 },
  // cobwebs across top corners of some bays: [bay, board row it hangs under, side (-1 left, 1 right), size]
  webs: [[0, 6, -1, 0.2], [1, 4, 1, 0.15], [2, 2, -1, 0.14], [3, 6, 1, 0.19], [4, 5, -1, 0.16], [2, 6, 1, 0.13], [4, 1, 1, 0.14]].map(([bay, row, side, r]) => {
    const [a, b] = bayInner(bay);
    const top = row + 1 < SHELF.boards.length ? SHELF.boards[row + 1] - 0.025 : SHELF.top - 0.03;
    return { at: [side < 0 ? a : b, top, SHELF.front - 0.003], side, r };
  }),
  // the floor the sander works: the slab's whole top (it runs out past the open sides)
  floor: { x0: X0, x1: X1 + 0.12, z0: Z0, z1: Z1 + 0.12 },
};

export default {
  id: 'bookshop',
  bounds: ROOM,
  sites,
  build: buildShell,
  ready: texturesReady,
  loadProps,
  buildFixtures,
  cams: {
    hero: { pos: [7.7, 5.6, 8.3], look: [-0.3, 0.9, -0.25], fov: 28 },
    nook: { pos: [1.55, 2.05, 4.75], look: [-1.95, 0.95, 0.85], fov: 38 },
    counter: { pos: [4.2, 2.4, 2.3], look: [1.4, 1.15, -1.6], fov: 40 },
    shelves: { pos: [2.2, 2.2, 2.6], look: [-1.3, 1.45, -2.3], fov: 42 },
    window: { pos: [2.6, 2.3, 3.6], look: [-2.6, 1.2, 0.2], fov: 38 },
    top: { pos: [0.4, 14, 5.5], look: [0, 0, 0], fov: 32 },
  },
  keys: KEYS,
};
