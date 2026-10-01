// Level 2's room: a little log-cabin living room in KayKit's "cute chunky" style
// (rounded low-poly furniture on soft gradient atlases, CC0 — tools/fetch_room_cabin.py),
// lit by the game's own sun / probe GI / post. The level
// itself is src/levels/cabin.js. Module contract: src/rooms/meadow.js.
import * as THREE from 'three';
import { buildCabin, CABIN, WINDOWS, FIRE, LOG } from './cabin/shell.js';
import { loadCabinProps } from './cabin/props.js';
import { buildCabinFixtures } from './cabin/fixtures.js';

let fixturesReady = Promise.resolve();

// framed for the 6.2 × 5 m diorama (level 1's hero, nudged to this room's centre)
const cams = {
  hero: { pos: [7.8, 5.6, 8.4], look: [-0.25, 0.9, -0.15], fov: 30 },
  fire: { pos: [2.9, 2.0, 2.4], look: [-0.6, 0.85, -1.9], fov: 40 },
  nook: { pos: [1.6, 2.1, 4.3], look: [-2.2, 1.0, 0.6], fov: 38 },
  top: { pos: [0.4, 14, 5.5], look: [0, 0, 0], fov: 32 },
};

// world.js KEYS (not exported) with this room's backdrop: warm cream by day
// (preferred to the dark one in the style test), a dusky plum at night. bg is linear and
// goes through exposure + AgX like everything else, hence the odd-looking numbers.
const C = (r, g, b) => new THREE.Color(r, g, b);
const keys = [
  { t: 0.0, key: 'morning', elev: 38, head: -28, sun: C(1.0, 0.93, 0.84), si: 9.0, top: C(0.9, 1.35, 2.3), hor: C(2.5, 2.45, 2.25), glow: C(0.5, 0.45, 0.35), tree: C(0.16, 0.3, 0.16), bg: C(1.0, 0.72, 0.44), amb: 0.02, exp: 1.0, zen: C(0.55, 0.62, 0.78), dhor: C(0.66, 0.63, 0.57), gnd: C(0.16, 0.14, 0.12) },
  { t: 0.35, key: 'afternoon', elev: 31, head: -10, sun: C(1.0, 0.86, 0.68), si: 10.5, top: C(0.85, 1.2, 2.1), hor: C(2.7, 2.35, 1.9), glow: C(1.0, 0.7, 0.35), tree: C(0.14, 0.26, 0.12), bg: C(1.0, 0.72, 0.44), amb: 0.02, exp: 1.0, zen: C(0.55, 0.58, 0.66), dhor: C(0.7, 0.62, 0.52), gnd: C(0.16, 0.13, 0.1) },
  { t: 0.62, key: 'golden', elev: 22, head: 6, sun: C(1.0, 0.6, 0.3), si: 11.5, top: C(0.95, 0.8, 1.1), hor: C(2.9, 1.65, 0.8), glow: C(3.0, 1.4, 0.5), tree: C(0.1, 0.12, 0.07), bg: C(1.4, 0.82, 0.34), amb: 0.02, exp: 1.05, zen: C(0.44, 0.42, 0.5), dhor: C(0.66, 0.5, 0.36), gnd: C(0.14, 0.1, 0.07) },
  { t: 0.8, key: 'dusk', elev: 8, head: 15, sun: C(1.0, 0.38, 0.16), si: 2.5, top: C(0.22, 0.22, 0.45), hor: C(1.1, 0.5, 0.32), glow: C(1.0, 0.35, 0.12), tree: C(0.03, 0.03, 0.04), bg: C(0.3, 0.19, 0.17), amb: 0.015, exp: 1.25, zen: C(0.12, 0.12, 0.21), dhor: C(0.22, 0.15, 0.13), gnd: C(0.04, 0.03, 0.03) },
  { t: 0.88, key: 'evening', elev: 20, head: 10, sun: C(0.55, 0.65, 1.0), si: 0.0, top: C(0.05, 0.06, 0.14), hor: C(0.2, 0.18, 0.3), glow: C(0.1, 0.08, 0.12), tree: C(0.015, 0.015, 0.025), bg: C(0.04, 0.03, 0.055), amb: 0.012, exp: 1.4, zen: C(0.05, 0.06, 0.12), dhor: C(0.07, 0.07, 0.12), gnd: C(0.015, 0.015, 0.02) },
  { t: 1.0, key: 'night', elev: 38, head: -18, sun: C(0.55, 0.68, 1.0), si: 1.1, top: C(0.02, 0.03, 0.08), hor: C(0.07, 0.09, 0.18), glow: C(0.08, 0.1, 0.2), tree: C(0.008, 0.01, 0.018), bg: C(0.03, 0.024, 0.045), amb: 0.012, exp: 1.45, zen: C(0.035, 0.045, 0.1), dhor: C(0.04, 0.05, 0.09), gnd: C(0.01, 0.01, 0.015) },
];

// ---- what the level works on (room module `sites`; formats in src/room.js SITES) -----------
const { X0, X1, Z0, Z1 } = CABIN;
const SASH_X = X0 - CABIN.T * 0.55; // the window sashes sit halfway through the wall
const FZ = Z0 + FIRE.d; // the chimney's stone front
const HEARTH = FIRE.hearth;
// the log walls, unfolded: [0, 5) left wall ← z · [5, 11.2) back wall ← x. `front` = how far
// the plane stands out from the wall's inner face (0: the chinking · LOG_FRONT: the logs' fronts)
function logFaces(front) {
  return [
    {
      face: 'left', axis: 'x', at: X0 + front, sign: 1, along: 'z', lo: Z0, hi: Z1, ua: 0, origin: Z0, y1: 3.2,
      // the window openings and their chunky casings
      holes: WINDOWS.map((w) => ({ a0: w.zc - w.w / 2 - 0.13, a1: w.zc + w.w / 2 + 0.13, y0: w.y0 - 0.04, y1: w.y1 + 0.13 })),
    },
    {
      face: 'back', axis: 'z', at: Z0 + front, sign: 1, along: 'x', lo: X0, hi: X1, ua: Z1 - Z0, origin: X0, y1: 3.1,
      holes: [{ a0: FIRE.x - FIRE.hw - 0.08, a1: FIRE.x + FIRE.hw + 0.08, y0: -1, y1: 9 }], // the stone chimney
    },
  ];
}
// where the gaps between the logs run (their centre heights), per wall: the left wall's
// logs sit at y = i·p, the back wall's at 0.13 + i·p (shell.js) — a gap is halfway
// between two (playtest 2026-09-30: the back wall's were at the log centres, so the bead
// went in behind the logs, unseen, while the count went up)
export const GAPS = {
  left: Array.from({ length: 12 }, (_, i) => (i + 0.5) * LOG.p),
  back: Array.from({ length: 11 }, (_, i) => 0.13 + (i + 0.5) * LOG.p),
};
const sites = {
  windows: WINDOWS.map((w) => ({ at: [SASH_X + 0.045, (w.y0 + w.y1) / 2, w.zc], ry: Math.PI / 2, w: w.w - 0.03, h: w.y1 - w.y0 - 0.03 })),
  // the stones around the fire opening, from the hearth up to the mantel beam
  soot: { at: [FIRE.x, HEARTH + (FIRE.mantel - 0.15 - HEARTH) / 2, FZ + 0.095], ry: 0, w: FIRE.ow * 2 + 0.72, h: FIRE.mantel - 0.15 - HEARTH, hole: { w: FIRE.ow * 2, h: FIRE.oh - HEARTH } },
  logs: { faces: logFaces(0.07), base: 0.03, top: 3.1, aw: 11.2, ah: 3.4 },
  chink: { faces: logFaces(0), base: 0.03, top: 3.1, aw: 11.2, ah: 3.4 },
  gaps: GAPS,
};

export default {
  id: 'cabin',
  bounds: CABIN,
  sites,
  build: buildCabin,
  ready: () => fixturesReady,
  async loadProps(onProgress) {
    const props = await loadCabinProps(onProgress);
    await fixturesReady; // the lamps' models must be in before they're adopted
    return props;
  },
  buildFixtures(scene) {
    const f = buildCabinFixtures(scene);
    fixturesReady = f.ready;
    return f;
  },
  cams,
  keys,
};
