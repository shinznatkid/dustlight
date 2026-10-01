import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { PAL, Bucket, mtx, pot, kenney, placeAt } from './kit.js';
import { ROOM, WIN, SILL, KITCHEN } from './layout.js';

// The neon flat's furniture: Kenney Furniture Kit pieces (CC0, re-tinted to the room's
// palette) and procedural low-poly things — a window seat, floor cushions, a chunky CRT, a
// rice cooker, a lucky cat, a lava lamp, posters, a wall clock and a ginger cat asleep.
// loadProps() returns [{ e, obj }] entries for decorate.js, like src/props.js.

const { X0, Z0 } = ROOM;
const R90 = Math.PI / 2;
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const bbox = (b, x0, x1, y0, y1, z0, z1, hex, o = {}) => b.add(unitBox, hex, { m: mtx([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, 0], [x1 - x0, y1 - y0, z1 - z0]), ...o });
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const ico = new THREE.IcosahedronGeometry(1, 1);

// ---- procedural pieces (built around their own origin, bottom at y = 0) -----------------

// the window seat: a wooden bench along the wall under the window (length along z), a
// mustard seat cushion, three cushions leaning on the wall
const SEAT = { len: 1.7, d: 0.52, h: 0.4, top: 0.47 };
function windowSeat() {
  const b = new Bucket();
  const hz = SEAT.len / 2;
  bbox(b, 0, SEAT.d, 0, SEAT.h, -hz, hz, PAL.woodDark);
  for (let k = 0; k < 6; k++) {
    const z = -hz + 0.05 + ((SEAT.len - 0.1) * (k + 0.5)) / 6;
    bbox(b, SEAT.d - 0.005, SEAT.d + 0.012, 0.06, SEAT.h - 0.05, z - 0.11, z + 0.11, PAL.wood);
  }
  bbox(b, 0.02, SEAT.d, SEAT.h, SEAT.top, -hz + 0.02, hz - 0.02, PAL.mustard);
  const back = [[PAL.rose, -0.5], [PAL.teal, 0.02], [PAL.cream, 0.5]];
  for (const [col, z] of back) {
    // (low enough to slide under the sill: the seat must fit back where it stood)
    b.add(new THREE.BoxGeometry(0.11, 0.19, 0.4, 1, 2, 2), col, { m: mtx([0.09, SEAT.top + 0.095, z], [0, 0, -0.14]) });
  }
  return b.build({ name: 'seat' });
}

// a flat floor cushion (zabuton) with a tuft in the middle
function zabuton(col) {
  const b = new Bucket();
  const g = new THREE.BoxGeometry(0.52, 0.08, 0.52, 2, 1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 0.01 && Math.abs(p.getZ(i)) < 0.01) p.setY(i, p.getY(i) * 0.4);
  g.computeVertexNormals();
  b.add(g, col, { m: mtx([0, 0.04, 0]) });
  b.add(cyl(0.02, 0.02, 0.012, 6), PAL.cream, { m: mtx([0, 0.078, 0]) });
  return b.build({ name: 'zabuton' });
}

// a chunky old monitor (facing +z) with a glowing screen: a little terminal and a cat
function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#0c2a2a';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#5ff2c8';
  for (let y = 12; y < 60; y += 9) g.fillRect(10, y, 20 + ((y * 37) % 60), 4);
  g.fillRect(10, 66, 8, 5);
  // a pixel cat in the corner
  g.fillStyle = '#ffd36e';
  const cat = ['1.....1', '11...11', '1111111', '1.111.1', '1111111', '.11111.'];
  cat.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '1') g.fillRect(84 + i * 4, 60 + j * 4, 4, 4); }));
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < 96; y += 3) g.fillRect(0, y, 128, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function crt() {
  const b = new Bucket();
  bbox(b, -0.22, 0.22, 0.03, 0.39, -0.18, 0.18, '#e6dccb');
  b.add(new THREE.BoxGeometry(0.34, 0.3, 0.2), '#d9cdb8', { m: mtx([0, 0.22, -0.26]) });
  bbox(b, -0.12, 0.12, 0, 0.03, -0.16, 0.12, '#cfc3ae');
  bbox(b, 0.12, 0.18, 0.06, 0.08, 0.18, 0.19, PAL.coral); // power light
  const g = b.build({ name: 'crt' });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.27), new THREE.MeshStandardMaterial({ map: screenTexture(), emissiveMap: null, emissive: 0xffffff, roughness: 0.2 }));
  scr.material.emissiveMap = scr.material.map;
  scr.material.emissiveIntensity = 1.5;
  scr.position.set(-0.01, 0.22, 0.181);
  g.add(scr);
  return g;
}

// a rice cooker: white body, a pink band, a domed lid with a handle
function riceCooker() {
  const b = new Bucket();
  b.addPainted(pot({ shape: 'bucket', h: 0.17, r: 0.13, body: '#f6f1e8', glaze: '#f6f1e8', dip: 0, rim: PAL.rose, seg: 12 }), mtx([0, 0, 0]));
  b.add(new THREE.SphereGeometry(0.13, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#f6f1e8', { m: mtx([0, 0.17, 0], [0, 0, 0], [1, 0.45, 1]), mat: 'gloss' });
  b.add(new THREE.TorusGeometry(0.04, 0.01, 4, 8, Math.PI), PAL.rose, { m: mtx([0, 0.225, 0]) });
  bbox(b, -0.03, 0.03, 0.06, 0.1, 0.12, 0.135, PAL.teal);
  return b.build({ name: 'ricecooker' });
}

// a stack of noodle bowls and a pair of chopsticks
function bowls() {
  const b = new Bucket();
  const cols = [PAL.cream, PAL.teal, PAL.cream, PAL.coral];
  cols.forEach((c, k) => b.addPainted(pot({ shape: 'bowl', h: 0.075, r: 0.1, body: PAL.cream, glaze: c, dip: 0.15, rim: k % 2 ? null : PAL.teal }), mtx([0, k * 0.028, 0], [0, k, 0])));
  for (const dz of [-0.012, 0.012]) b.add(unitBox, PAL.woodDark, { m: mtx([0.16, 0.012, dz], [0, 0.2, 0], [0.22, 0.012, 0.012]) });
  return b.build({ name: 'bowls' });
}

// three jars of dry things: noodles, rice, chillies
function jars() {
  const b = new Bucket();
  [[-0.13, '#f0d27a', 0.2], [0, '#f5f0e6', 0.17], [0.13, '#d9533a', 0.14]].forEach(([x, fill, h]) => {
    b.addPainted(pot({ shape: 'mug', h, r: 0.055, body: '#dfeee9', glaze: '#dfeee9', dip: 0, seg: 8 }), mtx([x, 0, 0]));
    b.add(cyl(0.048, 0.048, h * 0.7, 8), fill, { m: mtx([x, h * 0.37, 0]) });
    b.add(cyl(0.058, 0.058, 0.025, 8), PAL.woodPale, { m: mtx([x, h + 0.012, 0]) });
  });
  return b.build({ name: 'jars' });
}

// a lucky cat: white, a raised paw, a red collar with a gold bell, a gold coin
function luckyCat() {
  const b = new Bucket();
  const W = '#fbf6ee';
  b.add(ico, W, { m: mtx([0, 0.085, 0], [0, 0, 0], [0.085, 0.09, 0.075]) });
  b.add(ico, W, { m: mtx([0, 0.2, 0.01], [0, 0, 0], [0.075, 0.065, 0.065]) });
  for (const s of [-1, 1]) {
    b.add(new THREE.ConeGeometry(0.025, 0.045, 4), W, { m: mtx([s * 0.045, 0.265, 0.005], [0, 0, -s * 0.3]) });
    b.add(new THREE.ConeGeometry(0.014, 0.026, 4), PAL.rose, { m: mtx([s * 0.045, 0.262, 0.018], [0, 0, -s * 0.3]) });
    b.add(ico, '#2b2a30', { m: mtx([s * 0.028, 0.21, 0.068], [0, 0, 0], [0.008, 0.004, 0.004]) });
  }
  b.add(ico, W, { m: mtx([0.07, 0.24, 0.03], [0, 0, 0.3], [0.024, 0.05, 0.024]) }); // the raised paw
  b.add(new THREE.TorusGeometry(0.058, 0.01, 4, 10), '#d9412f', { m: mtx([0, 0.155, 0.01], [R90, 0, 0]) });
  b.add(ico, '#f2c14e', { m: mtx([0, 0.14, 0.07], [0, 0, 0], [0.016, 0.016, 0.016]), mat: 'gloss' });
  b.add(cyl(0.035, 0.035, 0.01, 10), '#f2c14e', { m: mtx([-0.03, 0.08, 0.075], [R90, 0, 0.2]), mat: 'gloss' });
  b.add(ico, '#f0a24e', { m: mtx([0.03, 0.28, 0.0], [0, 0, 0], [0.018, 0.012, 0.012]) }); // a ginger patch
  return b.build({ name: 'luckycat' });
}

// a lava lamp: a gold base and cap, a glowing magenta glass with its blobs
function lavaLamp() {
  const g = new THREE.Group();
  const b = new Bucket();
  b.add(cyl(0.04, 0.07, 0.1, 8), '#d9a441', { m: mtx([0, 0.05, 0]), mat: 'gloss' });
  b.add(cyl(0.025, 0.035, 0.05, 8), '#d9a441', { m: mtx([0, 0.345, 0]), mat: 'gloss' });
  g.add(b.build({ name: 'lava' }));
  const glass = new THREE.Mesh(cyl(0.035, 0.06, 0.22, 10), new THREE.MeshStandardMaterial({ color: '#7a2a6a', emissive: new THREE.Color(1.0, 0.25, 0.7), emissiveIntensity: 0.9, roughness: 0.2 }));
  glass.position.y = 0.21;
  g.add(glass);
  const blob = new THREE.MeshStandardMaterial({ color: '#ffb35c', emissive: new THREE.Color(1.0, 0.55, 0.2), emissiveIntensity: 1.6, roughness: 0.3 });
  for (const [y, r] of [[0.14, 0.03], [0.24, 0.022], [0.29, 0.016]]) {
    const m = new THREE.Mesh(ico, blob);
    m.scale.set(r, r * 1.3, r);
    m.position.y = y;
    g.add(m);
  }
  return g;
}

// a stack of cassettes
function cassettes() {
  const b = new Bucket();
  [PAL.coral, PAL.teal, PAL.mustard, PAL.lilac].forEach((col, k) => {
    bbox(b, -0.06, 0.06, k * 0.018, k * 0.018 + 0.016, -0.04, 0.04, col);
    b.add(unitBox, '#f3efe6', { m: mtx([0, k * 0.018 + 0.008, 0.0405], [0, 0, 0], [0.07, 0.008, 0.001]) });
  });
  return b.build({ name: 'cassettes' });
}

// a folded blanket: striped layers
function blanket() {
  const b = new Bucket();
  for (let k = 0; k < 3; k++) {
    bbox(b, -0.22, 0.22, k * 0.042, k * 0.042 + 0.04, -0.16, 0.16, k % 2 ? PAL.coral : PAL.cream);
    bbox(b, -0.222, 0.222, k * 0.042 + 0.014, k * 0.042 + 0.026, -0.162, 0.162, k % 2 ? PAL.cream : PAL.teal);
  }
  return b.build({ name: 'blanket' });
}

// a ginger cat asleep, curled up (facing +z)
function sleepingCat() {
  const b = new Bucket();
  const G = '#f0924a';
  const D = '#d9722e';
  b.add(ico, G, { m: mtx([0, 0.085, 0], [0, 0, 0], [0.2, 0.09, 0.15]) });
  b.add(ico, G, { m: mtx([0.13, 0.1, 0.07], [0, 0.3, 0], [0.085, 0.075, 0.08]) });
  for (const s of [-1, 1]) b.add(new THREE.ConeGeometry(0.028, 0.05, 4), G, { m: mtx([0.12 + s * 0.045, 0.175, 0.07 - s * 0.012], [0.2, 0, -s * 0.4]) });
  b.add(new THREE.TorusGeometry(0.15, 0.028, 5, 10, Math.PI * 1.1), D, { m: mtx([0.0, 0.035, 0.02], [R90, 0, 1.4]) }); // the tail round the front
  for (const x of [-0.1, -0.03, 0.04]) b.add(ico, D, { m: mtx([x, 0.16, 0], [0, 0, 0], [0.02, 0.012, 0.13]) }); // stripes
  b.add(ico, '#2b2a30', { m: mtx([0.19, 0.105, 0.11], [0, 0, 0], [0.006, 0.003, 0.012]) });
  b.add(ico, '#f6d7c0', { m: mtx([0.2, 0.085, 0.1], [0, 0, 0], [0.03, 0.022, 0.03]) });
  return b.build({ name: 'cat' });
}

// a poster in a thin frame (facing +z): a canvas picture
function poster(draw, w = 0.5, h = 0.7, frame = PAL.woodDark) {
  const W = 300;
  const Hp = Math.round((W * h) / w);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = Hp;
  draw(cv.getContext('2d'), W, Hp);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const grp = new THREE.Group();
  const b = new Bucket();
  const f = 0.025;
  bbox(b, -w / 2 - f, w / 2 + f, -h / 2 - f, -h / 2, 0, 0.025, frame);
  bbox(b, -w / 2 - f, w / 2 + f, h / 2, h / 2 + f, 0, 0.025, frame);
  bbox(b, -w / 2 - f, -w / 2, -h / 2, h / 2, 0, 0.025, frame);
  bbox(b, w / 2, w / 2 + f, -h / 2, h / 2, 0, 0.025, frame);
  grp.add(b.build({ name: 'frame' }));
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  art.position.z = 0.01;
  art.receiveShadow = true;
  grp.add(art);
  return grp;
}
// a noodle bowl poster: teal ground, a big bowl, steam, a sun
function drawNoodles(g, W, H) {
  g.fillStyle = '#2f8a8c';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2c14e';
  g.beginPath();
  g.arc(W * 0.72, H * 0.24, W * 0.14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f7ead2';
  g.beginPath();
  g.ellipse(W * 0.5, H * 0.6, W * 0.36, W * 0.08, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ef7a63';
  g.beginPath();
  g.moveTo(W * 0.14, H * 0.6);
  g.quadraticCurveTo(W * 0.18, H * 0.86, W * 0.5, H * 0.87);
  g.quadraticCurveTo(W * 0.82, H * 0.86, W * 0.86, H * 0.6);
  g.fill();
  g.strokeStyle = '#f7ead2';
  g.lineWidth = 7;
  g.lineCap = 'round';
  for (const x of [0.36, 0.5, 0.64]) {
    g.beginPath();
    g.moveTo(W * x, H * 0.52);
    g.bezierCurveTo(W * (x - 0.06), H * 0.44, W * (x + 0.06), H * 0.38, W * x, H * 0.3);
    g.stroke();
  }
  g.strokeStyle = '#9c5f36';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(W * 0.55, H * 0.58);
  g.lineTo(W * 0.9, H * 0.36);
  g.moveTo(W * 0.6, H * 0.61);
  g.lineTo(W * 0.93, H * 0.43);
  g.stroke();
}
// the city at dusk: a pink sun behind towers over the water
function drawCity(g, W, H) {
  const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
  sky.addColorStop(0, '#3a2a6e');
  sky.addColorStop(0.6, '#c24f8e');
  sky.addColorStop(1, '#f6a15a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffd36e';
  g.beginPath();
  g.arc(W * 0.5, H * 0.55, W * 0.22, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a1f4a';
  let x = 0;
  let k = 0;
  while (x < W) {
    const w = 18 + ((k * 37) % 30);
    const h = H * (0.12 + ((k * 53) % 17) / 60);
    g.fillRect(x, H * 0.7 - h, w - 3, h);
    x += w;
    k++;
  }
  g.fillStyle = '#1d1638';
  g.fillRect(0, H * 0.7, W, H * 0.3);
  g.fillStyle = 'rgba(255,211,110,0.5)';
  for (let y = H * 0.73; y < H; y += 9) g.fillRect(W * 0.5 - (H - y) * 0.2 - 10, y, (H - y) * 0.4 + 20, 3);
}

// a round wall clock (facing +z)
function wallClock() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#fbf3e4';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2b2a30';
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.fillRect(64 + Math.cos(a) * 50 - 3, 64 + Math.sin(a) * 50 - 3, 6, 6);
  }
  g.strokeStyle = '#2b2a30';
  g.lineCap = 'round';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(64, 64);
  g.lineTo(64 + 26, 64 - 18);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(64, 64);
  g.lineTo(64 - 8, 64 - 42);
  g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const b = new Bucket();
  b.add(new THREE.TorusGeometry(0.16, 0.025, 6, 20), PAL.coral, { m: mtx([0, 0, 0.025]) });
  b.add(cyl(0.16, 0.16, 0.02, 20), '#f6efe2', { m: mtx([0, 0, 0.01], [R90, 0, 0]) });
  grp.add(b.build({ name: 'clockrim' }));
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  face.position.z = 0.021;
  grp.add(face);
  return grp;
}

// ---- layout -------------------------------------------------------------------------------
// id · make() → Object3D · at: placeAt options · big: GI sees it (and probes are pushed out
// unless block: false) · small things render in the main view only · boards: surfaces on it,
// in its own frame (see src/props.js) · wall: hangs on a wall (at.yc = its middle)
const SOFA = { x: -1.5, z: Z0 + 0.43, s: 1.9 };
const TABLE = { x: -1.45, z: 0.25 };
const DESK = { x: X0 + 0.37, z: 1.62, s: 1.85 };
const SHELF = { x: X0 + 0.29, z: -1.95, s: 2.2 };
const FRIDGE = { x: 2.62, z: Z0 + 0.26, s: 1.65 };
const SEAT_AT = { x: X0 + SEAT.d / 2 + 0.01, z: WIN.zc };

// measured board heights (the tops things can stand on)
export const BOARDS = {
  sofa: 0.4,
  table: 0.46,
  desk: 0.7,
  shelf: [0.05, 0.47, 0.88],
  fridge: 0.99,
};

export function layout() {
  const K = KITCHEN;
  return [
    // ---- furniture
    { id: 'sofa', make: () => kenney('loungeSofa', { carpet: PAL.terracotta, wood: PAL.woodDark }), at: { x: SOFA.x, z: SOFA.z, s: SOFA.s }, big: true, boards: [{ h: BOARDS.sofa, hx: 0.72, hz: 0.18 }] },
    { id: 'seat', make: windowSeat, at: { x: SEAT_AT.x, z: SEAT_AT.z }, big: true, boards: [{ h: SEAT.top, hx: 0.2, hz: 0.78 }] },
    { id: 'table', make: () => kenney('tableCoffeeSquare', { wood: PAL.woodPale }), at: { x: TABLE.x, z: TABLE.z, s: [2.0, 2.0, 2.0] }, big: true, block: false, boards: [{ h: BOARDS.table, hx: 0.36, hz: 0.36 }] },
    { id: 'desk', make: () => kenney('desk', { wood: PAL.wood, metal: '#3b3942' }), at: { x: DESK.x, z: DESK.z, s: DESK.s, ry: R90 }, big: true, block: false, boards: [{ h: BOARDS.desk, hx: 0.64, hz: 0.33 }] },
    { id: 'chair', make: () => kenney('chairDesk', { carpet: PAL.teal, metalMedium: '#3b3942' }), at: { x: X0 + 1.02, z: 1.5, s: 1.9, ry: -R90 }, big: true, block: false },
    { id: 'shelf', make: () => kenney('bookcaseOpenLow', { wood: PAL.woodPale }), at: { x: SHELF.x, z: SHELF.z, s: SHELF.s, ry: R90 }, big: true, boards: BOARDS.shelf.map((h) => ({ h, hx: 0.4, hz: 0.24 })) },
    { id: 'fridge', make: () => kenney('kitchenFridgeSmall', { metalLight: '#a9dcc9', metal: '#e8e1d6', metalDark: '#3b3942' }), at: { x: FRIDGE.x, z: FRIDGE.z, s: FRIDGE.s }, big: true, boards: [{ h: BOARDS.fridge, hx: 0.33, hz: 0.2 }] },
    { id: 'plant:big', make: () => kenney('pottedPlant', { wood: PAL.terracotta, woodDark: '#5a3b28' }), at: { x: 2.55, z: -0.75, s: 2.6, ry: 0.4 }, big: true, block: false },
    { id: 'cushion', make: () => zabuton(PAL.coral), at: { x: TABLE.x - 0.15, z: TABLE.z + 0.72, ry: 0.15 } },
    { id: 'cushion#2', make: () => zabuton(PAL.teal), at: { x: TABLE.x + 0.75, z: TABLE.z + 0.05, ry: -0.2 } },
    // ---- on the desk
    { id: 'crt', make: crt, at: { x: X0 + 0.34, z: 1.72, y: BOARDS.desk, ry: R90 } },
    { id: 'keyboard', make: () => kenney('computerKeyboard', { metalDark: '#e6dccb', metalMedium: '#cfc3ae' }), at: { x: X0 + 0.63, z: 1.7, y: BOARDS.desk, s: 1.6, ry: R90 } },
    { id: 'speaker', make: () => kenney('speakerSmall', { wood: PAL.woodDark, metalMedium: '#3b3942' }), at: { x: X0 + 0.3, z: 2.14, y: BOARDS.desk, s: 1.4, ry: R90 } },
    { id: 'lavalamp', make: lavaLamp, at: { x: X0 + 0.3, z: 1.27, y: BOARDS.desk } },
    // ---- the kitchen
    { id: 'ricecooker', make: riceCooker, at: { x: 1.62, z: Z0 + 0.3, y: K.top } },
    { id: 'microwave', make: () => kenney('kitchenMicrowave', { metalMedium: '#f3efe6', carpetWhite: '#e8e1d6', metalDark: '#3b3942' }), at: { x: 2.6, z: Z0 + 0.25, y: BOARDS.fridge, s: 1.5 } },
    { id: 'bowls', make: bowls, at: { x: 0.85, z: Z0 + 0.12, y: K.shelfY } },
    { id: 'jars', make: jars, at: { x: 1.45, z: Z0 + 0.12, y: K.shelfY } },
    { id: 'luckycat', make: luckyCat, at: { x: 2.0, z: Z0 + 0.13, y: K.shelfY, ry: 0.2 } },
    { id: 'toaster', make: () => kenney('toaster', { metalMedium: PAL.coral, metal: '#e8e1d6' }), at: { x: 2.02, z: Z0 + 0.28, y: K.top, s: 1.5 } },
    // ---- books and things on the low shelf, the sofa, the seat
    { id: 'books', make: () => kenney('books', { carpetDarker: PAL.plum, carpetWhite: PAL.cream, plant: PAL.teal, metal: PAL.mustard }), at: { x: SHELF.x, z: SHELF.z - 0.18, y: BOARDS.shelf[2], s: 1.9, ry: R90 } },
    { id: 'books#2', make: () => kenney('books', { carpetDarker: PAL.coral, carpetWhite: PAL.cream, plant: PAL.lilac, metal: PAL.teal }), at: { x: SHELF.x, z: SHELF.z + 0.08, y: BOARDS.shelf[1], s: 1.9, ry: R90 } },
    { id: 'books#3', make: () => kenney('books', { carpetDarker: PAL.teal, carpetWhite: PAL.mustard, plant: PAL.coral, metal: PAL.cream }), at: { x: SHELF.x, z: SHELF.z - 0.15, y: BOARDS.shelf[0], s: 1.9, ry: R90 } },
    { id: 'radio', make: () => kenney('radio', { metalMedium: PAL.coral, wood: PAL.woodDark, metal: PAL.cream }), at: { x: SHELF.x, z: SHELF.z + 0.16, y: BOARDS.shelf[2], s: 1.2, ry: R90 } },
    { id: 'cassettes', make: cassettes, at: { x: SHELF.x, z: SHELF.z - 0.16, y: BOARDS.shelf[1], ry: R90 } },
    { id: 'pillow', make: () => kenney('pillow', { carpet: PAL.mustard }), at: { x: SOFA.x - 0.6, z: SOFA.z + 0.02, y: BOARDS.sofa, s: 1.6 } },
    { id: 'pillow#2', make: () => kenney('pillow', { carpet: PAL.teal }), at: { x: SOFA.x + 0.62, z: SOFA.z + 0.02, y: BOARDS.sofa, s: 1.6, ry: -0.2 } },
    { id: 'blanket', make: blanket, at: { x: SEAT_AT.x + 0.05, z: WIN.zc - 0.55, y: SEAT.top, ry: R90 + 0.1 } },
    // ---- plants
    { id: 'plant:sill', make: () => kenney('plantSmall2', { wood: PAL.cream }), at: { x: X0 + 0.09, z: WIN.zc + 0.62, y: SILL.y, s: 1.9 } },
    { id: 'plant:desk', make: () => kenney('plantSmall1', { wood: PAL.coral }), at: { x: X0 + 0.25, z: 1.04, y: BOARDS.desk, s: 1.7 } },
    { id: 'plant:shelf', make: () => kenney('plantSmall3', { wood: PAL.teal }), at: { x: SHELF.x, z: SHELF.z, y: BOARDS.shelf[2], s: 1.8 } },
    { id: 'plant:fridge', make: () => kenney('plantSmall1', { wood: PAL.mustard }), at: { x: 2.35, z: Z0 + 0.3, y: BOARDS.fridge, s: 1.7 } },
    // ---- on the walls
    { id: 'poster:noodles', make: () => poster(drawNoodles, 0.46, 0.62), at: { x: X0 + 0.01, z: 0.98, yc: 1.72, ry: R90 }, wall: true },
    { id: 'poster:city', make: () => poster(drawCity, 0.56, 0.42, PAL.plum), at: { x: -0.05, z: Z0 + 0.01, yc: 1.95 }, wall: true },
    { id: 'clock', make: wallClock, at: { x: X0 + 0.01, z: -1.35 + 0.02, yc: 2.62, ry: R90 }, wall: true },
    // the cat, asleep on the window seat (the last thing out of the boxes)
    { id: 'cat', make: sleepingCat, at: { x: SEAT_AT.x + 0.08, z: WIN.zc + 0.35, y: SEAT.top, ry: -0.6 } },
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
      const ry = e.at?.ry ?? e.ry ?? 0;
      if (!e.big) obj.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
      const entry = { id: e.id, ry, big: !!e.big, block: e.block, boards: e.boards };
      if (e.wall) entry.yc = e.at.yc;
      return { e: entry, obj };
    } catch (err) {
      console.warn('cyber prop failed', e.id, err);
      return null;
    } finally {
      onProgress?.(++done / L.length);
    }
  }));
  return items.filter(Boolean);
}
