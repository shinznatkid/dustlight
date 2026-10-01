import * as THREE from 'three';
import { gltfLoader } from '../../gltf.js';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { PAL, Bucket, mtx, pot, randomPot, rng } from './kit.js';
import { ROOM, SILL, SHELF_Y, SHELF_X, WALL_SHELF, FLUE_Y, WHEEL } from './layout.js';

// The pottery studio's furniture: Kenney Furniture Kit pieces (CC0, flat-coloured
// low-poly GLBs, re-tinted to the room's palette) plus procedural low-poly props —
// the potter's wheel, the work table, a shelf unit, sacks of clay, the apron, a
// brick kiln (built here, stood up as the room's fire by shell.js) — and rows of
// lathe-turned pots merged into one mesh per half row (a piece of furniture each).
// loadProps() returns [{ e, obj }] entries for decorate.js, like src/props.js.

const { X0, Z0 } = ROOM;
const R90 = Math.PI / 2;
const loader = gltfLoader();
const cache = new Map();

// Kenney material names → the room's palette (a piece may override per name)
const KDEF = {
  wood: PAL.wood, woodDark: PAL.woodDark, carpet: PAL.terracotta, carpetDarker: PAL.rust, carpetWhite: PAL.cream,
  metal: '#e6d8c0', metalMedium: PAL.sageDeep, metalDark: '#4a4440', metalLight: '#f3efe6', lamp: '#fff0c8',
  plant: PAL.leaf, glass: '#bfe0dc', _defaultMat: PAL.cream,
};

// a Kenney GLB (public/assets/rooms/pottery/kenney/, tools/fetch_room_pottery.py), with its
// own tinted, flat-shaded standard materials (lit by the sun, shadows and GI)
export async function kenney(name, tint = {}) {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(`assets/rooms/pottery/kenney/${name}.glb`).then((g) => g.scene));
  const obj = (await cache.get(name)).clone(true);
  const mats = new Map();
  const conv = (m) => {
    if (!mats.has(m)) {
      const n = new THREE.MeshStandardMaterial({
        color: tint[m.name] ?? KDEF[m.name] ?? '#cccccc',
        roughness: m.name.startsWith('metal') ? 0.55 : 0.85,
        metalness: 0,
        flatShading: true,
      });
      n.name = m.name;
      mats.set(m, n);
    }
    return mats.get(m);
  };
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  obj.name = name;
  return obj;
}

const _b = new THREE.Box3();
const _c = new THREE.Vector3();
// scale / turn, then centre the footprint on (x, z) with the bottom at y (or the middle at yc)
export function placeAt(obj, { x, z, y = 0, yc, ry = 0, s = 1 }) {
  if (Array.isArray(s)) obj.scale.set(...s);
  else obj.scale.setScalar(s);
  obj.rotation.set(0, ry, 0);
  obj.position.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  _b.setFromObject(obj);
  _b.getCenter(_c);
  obj.position.set(x - _c.x, yc !== undefined ? yc - _c.y : y - _b.min.y, z - _c.z);
  obj.updateMatrixWorld(true);
  return obj;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const bbox = (b, x0, x1, y0, y1, z0, z1, hex, o = {}) => b.add(unitBox, hex, { m: mtx([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, 0], [x1 - x0, y1 - y0, z1 - z0]), ...o });
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);

// ---- procedural pieces (built around their own origin, bottom at y = 0) ------------

// electric wheel: tapered teal body, cream splash pan, wet clay mid-throw
function wheel() {
  const b = new Bucket();
  b.add(cyl(0.2, 0.26, 0.33, 4), PAL.teal, { m: mtx([0, 0.195, 0], [0, Math.PI / 4, 0]), mat: 'gloss' });
  b.add(cyl(0.3, 0.3, 0.03, 4), '#e9dcc4', { m: mtx([0, 0.02, 0], [0, Math.PI / 4, 0]) });
  // splash pan + wheel head + clay
  b.addPainted(pot({ shape: 'pan', h: 0.11, r: 0.3, body: PAL.cream, glaze: PAL.cream, dip: 0, seg: 12 }), mtx([0, 0.36, 0]));
  b.add(cyl(0.16, 0.16, 0.035, 12), '#8c9491', { m: mtx([0, 0.4, 0]) });
  b.addPainted(pot({ shape: 'thrown', h: 0.19, r: 0.075, body: PAL.wetClay, glaze: '#a8623f', dip: 0, seg: 12 }), mtx([0, 0.418, 0]));
  // side tray with a water bowl and a sponge
  bbox(b, 0.27, 0.46, 0.33, 0.35, -0.12, 0.12, '#e9dcc4');
  b.addPainted(pot({ shape: 'bowl', h: 0.06, r: 0.07, body: PAL.oat, glaze: PAL.cobalt, dip: 0.2 }), mtx([0.37, 0.35, -0.04]));
  bbox(b, 0.33, 0.42, 0.35, 0.38, 0.05, 0.1, PAL.mustard);
  // foot pedal on the floor, towards the stool
  b.add(cyl(0.05, 0.07, 0.05, 4), '#4a4440', { m: mtx([0.18, 0.025, -0.4], [0, Math.PI / 4, 0]) });
  b.add(unitBox, '#8c9491', { m: mtx([0.18, 0.06, -0.39], [0.35, 0, 0], [0.08, 0.015, 0.12]) });
  return b.build({ name: 'wheel' });
}

// wood-fired brick dome kiln; its door (+z) glows when lit — it is a lamp
// (fixtures.js 'kiln'), so it's built there and handled like the floor lamp
export function kiln() {
  const rnd = rng(21);
  const b = new Bucket();
  const R = 0.52;
  b.add(cyl(0.6, 0.63, 0.12, 8), '#a39382', { m: mtx([0, 0.06, 0], [0, Math.PI / 8, 0]) });
  const course = ['#c8633a', '#b9542f', '#d17447', '#bf5b33'];
  for (let k = 0; k < 6; k++) {
    b.add(cyl(R, R, 0.116, 8), course[k % 4], { m: mtx([0, 0.12 + 0.06 + k * 0.12, 0], [0, Math.PI / 8 + (k % 2) * 0.05, 0]), jitter: 0.3, rnd });
  }
  const dome = new THREE.SphereGeometry(R, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add(dome, '#c96a3f', { m: mtx([0, 0.84, 0], [0, Math.PI / 8, 0]) });
  // lighter brick arch around the door
  const ap = R * Math.cos(Math.PI / 8); // apothem: the flat face the door sits on
  const arch = new THREE.TorusGeometry(0.19, 0.045, 4, 8, Math.PI);
  b.add(arch, '#e39a68', { m: mtx([0, 0.46, ap + 0.01]) });
  bbox(b, -0.235, -0.145, 0.12, 0.46, ap - 0.02, ap + 0.05, '#e39a68');
  bbox(b, 0.145, 0.235, 0.12, 0.46, ap - 0.02, ap + 0.05, '#e39a68');
  // chimney: straight up to the flue (shell.js runs it into the back wall)
  b.add(cyl(0.075, 0.075, FLUE_Y - 1.25, 8), '#4d4642', { m: mtx([0, (1.25 + FLUE_Y) / 2, 0]) });
  b.add(cyl(0.095, 0.095, 0.06, 8), '#6b625c', { m: mtx([0, 1.3, 0]) });
  const out = b.build({ name: 'kiln' });
  // the door opening: its own material so it can glow
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x241510, roughness: 1, flatShading: true, emissive: new THREE.Color(1.0, 0.42, 0.12), emissiveIntensity: 0 });
  const door = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.34), glowMat);
  hole.position.set(0, 0.29, ap + 0.012);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.145, 8, 0, Math.PI), glowMat);
  top.position.set(0, 0.46, ap + 0.012);
  door.add(hole, top);
  out.add(door);
  return { obj: out, glowMat, doorZ: ap, R };
}

// the potter's work table: honey top, a canvas wedging cover, a low shelf
function workTable(w = 2.0, d = 0.74, h = 0.82) {
  const b = new Bucket();
  const hx = w / 2;
  const hz = d / 2;
  bbox(b, -hx, hx, h - 0.06, h, -hz, hz, PAL.wood);
  bbox(b, -hx + 0.04, 0.15, h, h + 0.006, -hz + 0.02, hz + 0.02, PAL.canvas); // canvas cover (left part)
  bbox(b, -hx + 0.04, 0.15, h - 0.08, h, hz, hz + 0.02, PAL.canvas); // its front flap
  for (const [x, z] of [[-hx + 0.08, -hz + 0.08], [hx - 0.08, -hz + 0.08], [-hx + 0.08, hz - 0.08], [hx - 0.08, hz - 0.08]]) {
    bbox(b, x - 0.045, x + 0.045, 0, h - 0.06, z - 0.045, z + 0.045, PAL.woodDark);
  }
  bbox(b, -hx + 0.04, hx - 0.04, 0.16, 0.19, -hz + 0.05, hz - 0.05, PAL.woodPale);
  return b.build({ name: 'worktable' });
}

// open shelf unit: two end panels and five boards (board tops = SHELF_Y)
function shelfUnit(w, d, top) {
  const b = new Bucket();
  const hx = w / 2;
  const hz = d / 2;
  bbox(b, -hx, -hx + 0.04, 0, top, -hz, hz, PAL.woodDark);
  bbox(b, hx - 0.04, hx, 0, top, -hz, hz, PAL.woodDark);
  for (const y of SHELF_Y) bbox(b, -hx + 0.04, hx - 0.04, y - 0.03, y, -hz, hz, PAL.woodPale);
  bbox(b, -hx - 0.02, hx + 0.02, top, top + 0.035, -hz - 0.01, hz + 0.01, PAL.wood);
  bbox(b, -hx + 0.04, hx - 0.04, 0, SHELF_Y[0] - 0.03, hz - 0.03, hz, PAL.woodDark); // kick board
  return b.build({ name: 'shelfunit' });
}

// sacks of clay and wrapped blocks, stacked in a corner
function sacks() {
  const rnd = rng(5);
  const b = new Bucket();
  const lump = new THREE.IcosahedronGeometry(1, 1);
  const kraft = ['#c98f55', '#d9a466', '#bb8048'];
  const S = [
    [-0.18, 0.11, 0.05, 0.1, 0.34, 0.12, 0.22],
    [0.2, 0.11, -0.02, -0.15, 0.32, 0.12, 0.21],
    [0.02, 0.31, 0.02, 0.35, 0.33, 0.11, 0.21],
    [-0.1, 0.49, -0.03, -0.2, 0.3, 0.1, 0.2],
  ];
  S.forEach(([x, y, z, ry, sx, sy, sz], i) => b.add(lump, kraft[i % 3], { m: mtx([x, y, z], [0, ry, 0], [sx, sy, sz]), jitter: 0.3, rnd }));
  // a printed band on each sack (flat, just proud of the top)
  S.forEach(([x, y, z, ry, sx, sy, sz], i) => b.add(unitBox, i % 2 ? PAL.terracotta : PAL.teal, { m: mtx([x, y + sy * 0.93, z], [0, ry, 0], [sx * 0.7, 0.012, sz * 0.35]) }));
  // wrapped clay blocks (glossy plastic)
  b.add(unitBox, PAL.greyClay, { m: mtx([0.47, 0.08, 0.1], [0, 0.25, 0], [0.24, 0.16, 0.16]), mat: 'gloss' });
  b.add(unitBox, PAL.terracotta, { m: mtx([0.46, 0.24, 0.08], [0, -0.1, 0], [0.24, 0.16, 0.16]), mat: 'gloss' });
  return b.build({ name: 'sacks' });
}

// peg rail with a pleated mustard apron (clay smudges, a pocket) and a striped towel.
// Built facing +z; the room turns it onto the left wall.
function apronRack() {
  const b = new Bucket();
  bbox(b, -0.34, 0.34, -0.04, 0.04, 0, 0.025, PAL.woodDark);
  for (const x of [-0.22, 0, 0.22]) b.add(cyl(0.012, 0.014, 0.07, 6), PAL.woodPale, { m: mtx([x, 0, 0.055], [R90, 0, 0]) });
  // apron: bib + pleated skirt (a thin box with its front zig-zagged)
  const skirt = new THREE.BoxGeometry(0.46, 0.5, 0.012, 8, 1, 1);
  const p = skirt.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) + 0.23) / 0.46;
    p.setZ(i, p.getZ(i) + Math.abs(((u * 8) % 2) - 1) * 0.018);
    p.setX(i, p.getX(i) * (1 + (0.25 - p.getY(i)) * 0.18));
  }
  skirt.computeVertexNormals();
  b.add(skirt, PAL.mustard, { m: mtx([0, -0.63, 0.05]) });
  b.add(unitBox, PAL.mustard, { m: mtx([0, -0.26, 0.045], [0.04, 0, 0], [0.26, 0.26, 0.012]) });
  b.add(unitBox, '#c98a2c', { m: mtx([0, -0.35, 0.055], [0, 0, 0], [0.3, 0.03, 0.012]) }); // waist seam
  b.add(unitBox, '#c98a2c', { m: mtx([0.04, -0.6, 0.075], [0, 0, 0.02], [0.2, 0.12, 0.008]) }); // pocket
  // neck strap over the middle peg, waist ties
  b.add(unitBox, '#c98a2c', { m: mtx([-0.08, -0.07, 0.05], [0, 0, -0.5], [0.015, 0.3, 0.008]) });
  b.add(unitBox, '#c98a2c', { m: mtx([0.08, -0.07, 0.05], [0, 0, 0.5], [0.015, 0.3, 0.008]) });
  b.add(unitBox, '#c98a2c', { m: mtx([-0.25, -0.5, 0.05], [0, 0, 0.12], [0.014, 0.3, 0.008]) });
  b.add(unitBox, '#c98a2c', { m: mtx([0.25, -0.52, 0.05], [0, 0, -0.1], [0.014, 0.32, 0.008]) });
  // clay smudges
  for (const [x, y, s] of [[-0.12, -0.72, 0.07], [0.1, -0.8, 0.05], [-0.05, -0.5, 0.04], [0.14, -0.28, 0.035]]) {
    b.add(new THREE.CircleGeometry(s, 5), PAL.wetClay, { m: mtx([x, y, 0.078]) });
  }
  // towel on the right peg: cream with sage stripes
  bbox(b, 0.13, 0.31, -0.46, 0.0, 0.05, 0.062, PAL.cream);
  for (const y of [-0.08, -0.36]) bbox(b, 0.13, 0.31, y - 0.025, y, 0.062, 0.064, PAL.sageDeep);
  return b.build({ name: 'apron' });
}

// a row of pots along x (centred on 0, bottom at y = 0), filling `len` metres, in `parts`
// pieces (left to right): each piece its own merged mesh, all in the row's frame — so one
// can be lifted off the shelf alone and the row still looks exactly like one
function potRow(seed, len, { maxH = 0.36, kinds, glazes, body, depth = 0.2, gap = 0.035, stacks = true, parts = 1 } = {}) {
  const rnd = rng(seed);
  const items = [];
  let x = -len / 2;
  let guard = 0;
  while (guard++ < 40) {
    const stack = stacks && rnd() < 0.18;
    const p = stack ? null : randomPot(rnd, { maxH, kinds, glazes, body });
    const r = stack ? 0.1 + rnd() * 0.03 : p.r;
    if (x + 2 * r > len / 2) break;
    const cx = x + r;
    const cz = (rnd() - 0.5) * Math.max(0, depth - 2 * r) * 0.8;
    const ry = rnd() * Math.PI * 2;
    const add = [];
    if (stack) {
      // nested bowls
      const glaze = [PAL.cream, PAL.teal, PAL.sage, PAL.cobalt, PAL.oat][Math.floor(rnd() * 5)];
      const n = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        add.push([pot({ shape: 'bowl', h: 0.07, r, body: body ?? PAL.oat, glaze: glazes ? glazes[0] : glaze, dip: 0.15 }), mtx([cx, k * 0.026, cz], [0, ry + k, 0])]);
      }
    } else {
      add.push([p.parts, mtx([cx, 0, cz], [0, ry, 0])]);
    }
    items.push({ cx, add });
    x += 2 * r + gap * (0.6 + rnd() * 0.8);
  }
  const buckets = Array.from({ length: parts }, () => new Bucket());
  items.forEach((it, i) => {
    const b = buckets[Math.min(parts - 1, Math.floor((i * parts) / items.length))];
    for (const [list, m] of it.add) b.addPainted(list, m);
  });
  return buckets.map((b, k) => b.build({ name: `pots${seed}${parts > 1 ? `-${k}` : ''}` }));
}

// pieces built together in one frame, placed as the whole would be (placeAt), then each
// on its own with that world transform (they become separate furniture entries)
function placeApart(pieces, at) {
  const whole = new THREE.Group();
  for (const p of pieces) whole.add(p);
  placeAt(whole, at);
  const loose = new THREE.Group(); // (at the origin: attach() keeps the world transforms)
  for (const p of pieces) loose.attach(p);
  for (const p of pieces) p.removeFromParent();
  return pieces;
}

// freshly thrown greenware on a ware board. userData.pots: where each pot stands (the
// board's frame) and which vertices of the merged `mesh` are its own — a level dries them
// one by one (their colour here is bone dry)
function wareBoard() {
  const rnd = rng(31);
  const b = new Bucket();
  bbox(b, -0.62, 0.62, 0, 0.025, -0.13, 0.13, PAL.woodPale);
  const kinds = [['thrown', 0.16, 0.06], ['bowl', 0.08, 0.1], ['thrown', 0.2, 0.065], ['cup', 0.09, 0.05], ['vase', 0.22, 0.075], ['bowl', 0.07, 0.09]];
  let x = -0.52;
  const pots = [];
  for (const [shape, h, r] of kinds) {
    const body = rnd() < 0.5 ? PAL.greenware : '#cdb8a2'; // (the random draws in their old order)
    const z = (rnd() - 0.5) * 0.06;
    const before = b.mark().matte;
    b.addPainted(pot({ shape, h, r, body, glossy: false, seg: 10 }), mtx([x + r, 0.025, z]));
    pots.push({ x: x + r, y: 0.025, z, h, r, parts: [before, b.mark().matte] });
    x += 2 * r + 0.035;
  }
  const out = b.build({ name: 'wareboard' });
  const R = b.ranges.matte;
  for (const p of pots) {
    const [i0, i1] = p.parts;
    p.range = [R[i0][0], R[i1 - 1][0] + R[i1 - 1][1] - R[i0][0]];
    delete p.parts;
  }
  out.userData.pots = pots;
  out.userData.mesh = out.children.find((m) => m.name === 'wareboard:matte');
  return out;
}

// the work table's clutter (in the table's frame: top at y = 0, centre of the top at x = z = 0)
function tableClutter() {
  const b = new Bucket();
  const lump = new THREE.IcosahedronGeometry(1, 1);
  // wedged clay balls on the canvas
  b.add(lump, PAL.wetClay, { m: mtx([-0.62, 0.055, 0.02], [0.3, 0.5, 0], [0.1, 0.07, 0.09]), mat: 'gloss' });
  b.add(lump, '#a8623f', { m: mtx([-0.42, 0.045, -0.17], [0, 1.2, 0.2], [0.08, 0.055, 0.075]), mat: 'gloss' });
  b.add(lump, PAL.terracotta, { m: mtx([-0.47, 0.03, 0.14], [0, 0.4, 0], [0.05, 0.035, 0.05]), mat: 'gloss' });
  b.add(unitBox, PAL.greyClay, { m: mtx([-0.8, 0.075, -0.2], [0, 0.2, 0], [0.24, 0.15, 0.15]), mat: 'gloss' });
  // a rolled slab and the rolling pin
  b.add(unitBox, PAL.clay, { m: mtx([-0.12, 0.007, -0.08], [0, 0.1, 0], [0.34, 0.012, 0.24]) });
  b.add(cyl(0.032, 0.032, 0.36, 8), PAL.woodPale, { m: mtx([-0.14, 0.045, 0.18], [0, 0.15, R90]) });
  b.add(cyl(0.016, 0.016, 0.16, 6), PAL.woodDark, { m: mtx([-0.14, 0.045, 0.18], [0, 0.15, R90], [1, 3.4, 1]) });
  // tools in a cobalt jar, a sponge
  b.addPainted(pot({ shape: 'mug', h: 0.13, r: 0.05, body: PAL.oat, glaze: PAL.cobalt, dip: 0.1, seg: 8 }), mtx([0.45, 0, -0.22]));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.add(unitBox, [PAL.woodPale, PAL.woodDark, PAL.mustard, '#8c9491', PAL.woodPale][i], {
      m: mtx([0.45 + Math.cos(a) * 0.018, 0.14, -0.22 + Math.sin(a) * 0.018], [Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25], [0.012, 0.2, 0.012]),
    });
  }
  bbox(b, 0.3, 0.4, 0, 0.04, 0.12, 0.19, PAL.mustard);
  // bat with a trimmed bowl, a stack of bisque bowls
  b.add(cyl(0.14, 0.14, 0.02, 10), PAL.woodPale, { m: mtx([0.12, 0.01, -0.2]) });
  b.addPainted(pot({ shape: 'bowl', h: 0.07, r: 0.1, body: PAL.greenware, glossy: false }), mtx([0.12, 0.02, -0.2]));
  for (let k = 0; k < 3; k++) b.addPainted(pot({ shape: 'bowl', h: 0.065, r: 0.095, body: PAL.bisque, glossy: false }), mtx([0.68, k * 0.024, 0.02], [0, k, 0]));
  // a finished jug waiting for its handle
  b.addPainted(pot({ shape: 'pitcher', h: 0.2, r: 0.07, body: PAL.oat, glaze: PAL.teal, dip: 0.22, handle: true, spout: true }), mtx([0.34, 0, 0.0], [0, 2.4, 0]));
  return b.build({ name: 'tableclutter' });
}

// glaze jars and tins for the wall shelf (x centred, bottom at 0)
function glazeJars() {
  const b = new Bucket();
  const lids = [PAL.teal, PAL.cobalt, PAL.mustard, PAL.rust, PAL.sage, PAL.plum];
  lids.forEach((lid, i) => {
    const x = -0.62 + i * 0.13 + (i > 2 ? 0.08 : 0);
    const h = 0.12 + (i % 3) * 0.02;
    b.addPainted(pot({ shape: 'mug', h, r: 0.045, body: PAL.cream, glaze: PAL.cream, dip: 0, seg: 8 }), mtx([x, 0, 0]));
    b.add(cyl(0.048, 0.048, 0.022, 8), lid, { m: mtx([x, h + 0.011, 0]), mat: 'gloss' });
    b.add(unitBox, lid, { m: mtx([x, h * 0.5, 0.045], [0, 0, 0], [0.05, 0.03, 0.004]) }); // label
  });
  return b.build({ name: 'glazejars' });
}

// glaze buckets under the table (their lids show the glaze colour)
function glazeBuckets() {
  const b = new Bucket();
  [[PAL.teal, -0.6], [PAL.rust, -0.2], [PAL.cream, 0.2], [PAL.cobalt, 0.58]].forEach(([c, x], i) => {
    b.addPainted(pot({ shape: 'bucket', h: 0.3, r: 0.13, body: '#f3efe6', glaze: '#f3efe6', dip: 0, rim: c, seg: 10 }), mtx([x, 0, (i % 2) * 0.05]));
    b.add(cyl(0.12, 0.12, 0.015, 10), c, { m: mtx([x, 0.285, (i % 2) * 0.05]), mat: 'gloss' });
  });
  return b.build({ name: 'buckets' });
}

// sill pots: a succulent in a terracotta pot, a bottle, a vase, a small bisque jar — one
// piece each (in the sill's frame: placeApart puts them where the four stood together)
function sillPots() {
  const succ = new Bucket();
  succ.addPainted(pot({ shape: 'planter', h: 0.1, r: 0.06, body: PAL.terracotta, seg: 8 }), mtx([0, 0, -0.5]));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    succ.add(new THREE.ConeGeometry(0.022, 0.08, 4), PAL.sageDeep, { m: mtx([Math.cos(a) * 0.02, 0.12, -0.5 + Math.sin(a) * 0.02], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]) });
  }
  const one = (parts, m, name) => new Bucket().addPainted(parts, m).build({ name });
  return [
    succ.build({ name: 'sill:succulent' }),
    one(pot({ shape: 'bottle', h: 0.24, r: 0.055, body: PAL.oat, glaze: PAL.cobalt, dip: 0.15 }), mtx([0, 0, 0.62]), 'sill:bottle'),
    one(pot({ shape: 'vase', h: 0.18, r: 0.06, body: PAL.oat, glaze: PAL.teal, dip: 0.2 }), mtx([0, 0, 0.8]), 'sill:vase'),
    one(pot({ shape: 'jar', h: 0.12, r: 0.06, body: PAL.bisque, glossy: false }), mtx([0, 0, -0.84]), 'sill:jar'),
  ];
}

// tea for the visitor: a round teapot and two cups on the low table
function teaSet() {
  const b = new Bucket();
  b.addPainted(pot({ shape: 'jar', h: 0.15, r: 0.1, body: PAL.oat, glaze: PAL.teal, dip: 0.12, handle: true, seg: 10 }), mtx([0, 0, 0]));
  b.add(new THREE.ConeGeometry(0.025, 0.12, 5), PAL.teal, { m: mtx([-0.12, 0.1, 0], [0, 0, 0.9]), mat: 'gloss' });
  b.add(new THREE.SphereGeometry(0.02, 6, 3), PAL.mustard, { m: mtx([0, 0.165, 0]), mat: 'gloss' });
  b.addPainted(pot({ shape: 'cup', h: 0.065, r: 0.042, body: PAL.oat, glaze: PAL.mustard, dip: 0.2, seg: 8 }), mtx([0.2, 0, 0.1]));
  b.addPainted(pot({ shape: 'cup', h: 0.065, r: 0.042, body: PAL.oat, glaze: PAL.rust, dip: 0.2, seg: 8 }), mtx([0.12, 0, -0.16]));
  b.addPainted(pot({ shape: 'vase', h: 0.26, r: 0.07, body: PAL.terracotta, glaze: PAL.cream, dip: 0.3 }), mtx([-0.25, 0, 0.2]));
  // three dried stems in the vase
  for (let i = 0; i < 3; i++) {
    b.add(unitBox, '#b5894f', { m: mtx([-0.25 + (i - 1) * 0.02, 0.38, 0.2], [0, 0, (i - 1) * 0.3], [0.008, 0.26, 0.008]) });
    b.add(new THREE.IcosahedronGeometry(0.03, 0), [PAL.mustard, '#e8c27a', PAL.peach][i], { m: mtx([-0.25 + (i - 1) * 0.06, 0.5, 0.2]) });
  }
  return b.build({ name: 'teaset' });
}

// a framed print (flat shapes painted on a canvas: a vase, a sun, a sprig), facing +z
function framedPrint(w = 0.5, h = 0.64) {
  const W = 360;
  const H = Math.round((W * h) / w);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#f1dfc0';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#e59a5c';
  g.beginPath();
  g.arc(W * 0.62, H * 0.3, W * 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8fb07a';
  g.fillRect(0, H * 0.78, W, H * 0.22);
  // a faceted vase: polygon silhouette, two tones
  const vase = [[0.5, 0.36], [0.56, 0.37], [0.56, 0.42], [0.66, 0.52], [0.7, 0.64], [0.64, 0.8], [0.36, 0.8], [0.3, 0.64], [0.34, 0.52], [0.44, 0.42], [0.44, 0.37]];
  g.fillStyle = '#2f5fae';
  g.beginPath();
  vase.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
  g.fill();
  g.fillStyle = '#3f73c4';
  g.beginPath();
  [[0.5, 0.42], [0.66, 0.52], [0.7, 0.64], [0.64, 0.8], [0.5, 0.8]].forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
  g.fill();
  g.fillStyle = '#f1dfc0';
  g.fillRect(W * 0.31, H * 0.6, W * 0.38, H * 0.025);
  // a sprig out of the vase
  g.strokeStyle = '#4f8f45';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(W * 0.5, H * 0.37);
  g.quadraticCurveTo(W * 0.46, H * 0.2, W * 0.36, H * 0.12);
  g.stroke();
  g.fillStyle = '#6fae4f';
  for (const [x, y, a] of [[0.44, 0.24, -0.6], [0.39, 0.16, -0.9], [0.48, 0.3, 0.5], [0.42, 0.2, 0.7]]) {
    g.save();
    g.translate(x * W, y * H);
    g.rotate(a);
    g.beginPath();
    g.ellipse(0, 0, W * 0.05, W * 0.022, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#b9472d';
  g.font = `bold ${Math.round(W * 0.075)}px Georgia, serif`;
  g.textAlign = 'center';
  g.fillText('CLAY & SUN', W * 0.5, H * 0.92);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const grp = new THREE.Group();
  const b = new Bucket();
  const f = 0.035;
  bbox(b, -w / 2 - f, w / 2 + f, -h / 2 - f, -h / 2, 0, 0.03, PAL.woodDark);
  bbox(b, -w / 2 - f, w / 2 + f, h / 2, h / 2 + f, 0, 0.03, PAL.woodDark);
  bbox(b, -w / 2 - f, -w / 2, -h / 2, h / 2, 0, 0.03, PAL.woodDark);
  bbox(b, w / 2, w / 2 + f, -h / 2, h / 2, 0, 0.03, PAL.woodDark);
  grp.add(b.build({ name: 'frame' }));
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  art.position.z = 0.012;
  art.receiveShadow = true;
  grp.add(art);
  return grp;
}

// a teal plastic bucket of throwing water with a sponge, by the wheel
function waterBucket() {
  const b = new Bucket();
  b.addPainted(pot({ shape: 'bucket', h: 0.26, r: 0.13, body: '#3f9a8f', glaze: '#3f9a8f', dip: 0, inside: '#6fb5ab', seg: 10 }), mtx([0, 0, 0]));
  b.add(cyl(0.118, 0.118, 0.01, 10), '#9a7a62', { m: mtx([0, 0.2, 0]), mat: 'gloss' }); // slurry water
  bbox(b, -0.05, 0.05, 0.2, 0.235, -0.03, 0.04, PAL.mustard);
  b.add(new THREE.TorusGeometry(0.13, 0.006, 3, 10, Math.PI), '#8c9491', { m: mtx([0, 0.26, 0], [0, 0, 0.5]) });
  return b.build({ name: 'waterbucket' });
}

// straw-filled crate of wrapped pots, ready to ship (Kenney open box + fill)
async function crate() {
  const g = new THREE.Group();
  const box = await kenney('cardboardBoxOpen', { wood: '#d9b27a', woodDark: '#c49a62' });
  box.scale.setScalar(2.0);
  g.add(box);
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(box);
  const b = new Bucket();
  const rnd = rng(55);
  const lump = new THREE.IcosahedronGeometry(1, 0);
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  const top = bb.max.y - 0.14;
  for (let i = 0; i < 9; i++) {
    b.add(lump, rnd() < 0.5 ? '#e8c46e' : '#d9ae55', { m: mtx([cx + (rnd() - 0.5) * 0.45, top + rnd() * 0.04, cz + (rnd() - 0.5) * 0.25], [rnd() * 3, rnd() * 3, 0], [0.1, 0.05, 0.08]) });
  }
  b.addPainted(pot({ shape: 'vase', h: 0.3, r: 0.08, body: PAL.oat, glaze: PAL.cobalt, dip: 0.2 }), mtx([cx - 0.12, top - 0.12, cz]));
  b.addPainted(pot({ shape: 'jar', h: 0.2, r: 0.09, body: PAL.oat, glaze: PAL.mustard, dip: 0.1 }), mtx([cx + 0.15, top - 0.06, cz + 0.02]));
  g.add(b.build({ name: 'cratefill' }));
  return g;
}

// ---- layout ------------------------------------------------------------------------
// id · make() → Object3D · at: placeAt options (none: make() placed it; ry = its turn) · big: GI sees it (and probes are
// pushed out unless block: false) · small things render in the main view only ·
// boards: surfaces on it, in its own frame (see src/props.js) · yc: hangs on a wall
const K = 2.3; // Kenney kit units → metres
const TABLE = { x: -0.95, z: Z0 + 0.42, w: 2.0, d: 0.74, h: 0.826 };
const RACK = { x: X0 + 0.32, z: 1.4 }; // Kenney bookcaseOpen, turned to face +x
const RACK_Y = [0.13, 0.37, 0.61].map((y) => y * K); // its board tops (measured in the GLB)
const WARE = { x: X0 + 0.3, z: -0.3 }; // low table under the window, long side along the wall
const WS = WALL_SHELF;

export function layout() {
  // things built together and placed apart (placeApart): built on first ask, one entry each
  const apart = (make, at) => {
    let pieces = null;
    return (i) => (pieces ??= placeApart(make(), at))[i];
  };
  const shelfRows = SHELF_Y.map((y, i) => apart(
    () => potRow(100 + i, SHELF_X.w - 0.14, { maxH: i === 0 ? 0.4 : 0.37, kinds: i === 0 ? ['urn', 'planter', 'jar', 'bucket'] : null, depth: 0.3, parts: 2 }),
    { x: SHELF_X.x, z: Z0 + 0.21, y },
  ));
  const rackRows = RACK_Y.map((y, i) => apart(
    () => potRow(200 + i, 0.8, { maxH: 0.34, glazes: [PAL.terracotta], body: i === 1 ? PAL.bisque : PAL.greenware, depth: 0.4, parts: 2 }),
    { x: RACK.x, z: RACK.z, y, ry: R90 },
  ));
  const sill = apart(sillPots, { x: X0 + 0.1, z: -0.3, y: SILL.y });
  const AB = ['a', 'b'];
  return [
    { id: 'wheel', make: wheel, at: { x: WHEEL.x, z: WHEEL.z, s: 1.12 }, big: true },
    { id: 'stool', make: () => kenney('stoolBar', { carpet: PAL.mustard }), at: { x: WHEEL.x + 0.05, z: WHEEL.z - 0.72, s: 1.25, ry: 0.2 }, big: true, block: false },
    { id: 'worktable', make: () => workTable(TABLE.w, TABLE.d, 0.82), at: { x: TABLE.x, z: TABLE.z }, big: true, boards: [{ h: TABLE.h, hx: TABLE.w / 2 - 0.05, hz: TABLE.d / 2 - 0.03 }, { h: 0.19, hx: TABLE.w / 2 - 0.1, hz: TABLE.d / 2 - 0.06 }] },
    { id: 'tableclutter', make: tableClutter, at: { x: TABLE.x, z: TABLE.z, y: TABLE.h } },
    { id: 'buckets', make: glazeBuckets, at: { x: TABLE.x + 0.1, z: TABLE.z - 0.02, y: 0.19 } },
    { id: 'plant:table', make: () => kenney('plantSmall3', { wood: PAL.terracotta }), at: { x: TABLE.x - 0.05, z: TABLE.z - 0.22, y: TABLE.h, s: 1.6 } },
    { id: 'shelfunit', make: () => shelfUnit(SHELF_X.w, 0.38, 2.12), at: { x: SHELF_X.x, z: Z0 + 0.21 }, big: true, boards: [...SHELF_Y.map((h) => ({ h, hx: SHELF_X.w / 2 - 0.05, hz: 0.18 })), { h: 2.155, hx: SHELF_X.w / 2, hz: 0.2 }] },
    // each shelf's pots in two halves (a piece of furniture each: one comes out of a box at a time)
    ...SHELF_Y.flatMap((y, i) => AB.map((k, j) => ({ id: `pots:shelf${i}${k}`, make: () => shelfRows[i](j) }))),
    { id: 'plant:shelftop', make: () => kenney('plantSmall1', { wood: PAL.cobalt }), at: { x: SHELF_X.x + 0.45, z: Z0 + 0.22, y: 2.155, s: 1.9 } },
    { id: 'pots:shelftop', make: () => potRow(120, 0.8, { maxH: 0.3, kinds: ['urn', 'bottle', 'vase'], depth: 0.3, stacks: false })[0], at: { x: SHELF_X.x - 0.25, z: Z0 + 0.21, y: 2.155 } },
    { id: 'sacks', make: sacks, at: { x: X0 + 0.5, z: Z0 + 0.36, ry: 0.15 }, big: true },
    { id: 'apron', make: apronRack, at: { x: X0 + 0.05, z: -1.95, yc: 1.42, ry: R90 }, wall: true },
    { id: 'rack', make: () => kenney('bookcaseOpen', { wood: '#6f97a8' }), at: { x: RACK.x, z: RACK.z, s: K, ry: R90 }, big: true, boards: RACK_Y.map((h) => ({ h, hx: 0.4, hz: 0.24 })) },
    ...RACK_Y.flatMap((y, i) => AB.map((k, j) => ({ id: `greenware:${i}${k}`, make: () => rackRows[i](j), ry: R90 }))),
    { id: 'plant:big', make: () => kenney('pottedPlant', { wood: PAL.terracotta, woodDark: '#5a3b28' }), at: { x: X0 + 0.42, z: 2.12, s: 2.6, ry: 0.4 }, big: true, block: false },
    { id: 'waretable', make: () => kenney('tableCoffee', { wood: PAL.wood }), at: { x: WARE.x, z: WARE.z, s: [2.0, 2.3, 1.2], ry: R90 }, big: true, boards: [{ h: 0.23 * 2.3, hx: 0.63, hz: 0.22 }] },
    { id: 'wareboard', make: wareBoard, at: { x: WARE.x + 0.02, z: WARE.z, y: 0.23 * 2.3, ry: R90 } },
    ...['succulent', 'bottle', 'vase', 'jar'].map((n, j) => ({ id: `sill:${n}`, make: () => sill(j) })),
    { id: 'plant:sill', make: () => kenney('plantSmall2', { wood: PAL.cream }), at: { x: X0 + 0.1, z: -1.0, y: SILL.y, s: 1.7 } },
    { id: 'chair', make: () => kenney('loungeChair', { carpet: '#4f9a8e', wood: PAL.woodDark }), at: { x: 2.2, z: 0.75, s: 1.6, ry: -1.05 }, big: true },
    { id: 'lowtable', make: () => kenney('tableCoffeeSquare', { wood: PAL.woodPale }), at: { x: 1.25, z: 1.25, s: 2.0, ry: 0.2 }, big: true, block: false, boards: [{ h: 0.46, hx: 0.38, hz: 0.38 }] },
    { id: 'teaset', make: teaSet, at: { x: 1.25, z: 1.25, y: 0.46, ry: 0.3 } },
    { id: 'crate', make: crate, at: { x: 0.2, z: 2.05, ry: -0.25 }, big: true, block: false },
    { id: 'print', make: () => framedPrint(), at: { x: X0 + 0.02, z: 1.4, yc: 2.46, ry: R90 }, wall: true },
    { id: 'waterbucket', make: waterBucket, at: { x: WHEEL.x - 0.55, z: WHEEL.z + 0.3, ry: 0.6 } },
    { id: 'jars', make: glazeJars, at: { x: -1.2, z: Z0 + 0.13, y: WS.y } },
    { id: 'radio', make: () => kenney('radio', { metalMedium: PAL.teal, metal: PAL.cream }), at: { x: -0.38, z: Z0 + 0.13, y: WS.y, s: 1.3 } },
    { id: 'books', make: () => kenney('books', { carpetDarker: PAL.rust, carpetWhite: PAL.cream, plant: PAL.sageDeep, metal: PAL.mustard }), at: { x: -1.75, z: Z0 + 0.13, y: WS.y, s: 1.8, ry: 0.1 } },
  ];
}

// Loads/builds every piece and places it in world space (not yet in the scene).
export async function loadProps(onProgress) {
  const L = layout();
  let done = 0;
  const items = await Promise.all(L.map(async (e) => {
    try {
      const obj = await e.make();
      obj.name = e.id;
      if (e.at) placeAt(obj, e.at);
      const ry = e.at?.ry ?? e.ry ?? 0; // (a piece placed apart comes turned already: ry says how)
      if (!e.big) obj.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
      const entry = { id: e.id, ry, big: !!e.big, block: e.block, boards: e.boards };
      if (e.wall) entry.yc = e.at.yc;
      return { e: entry, obj };
    } catch (err) {
      console.warn('pottery prop failed', e.id, err);
      return null;
    } finally {
      onProgress?.(++done / L.length);
    }
  }));
  return items.filter(Boolean);
}
