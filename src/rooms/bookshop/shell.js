import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tex, detailMap, canvasTexture, mulberry, Batch, B3 } from './common.js';
import { skyCard, skyDome, ceilingCaster, brickRim, drift } from '../kit.js';
import { Shelf } from './books.js';
import { ROOM, DOOR, WIN, SHELF, COUNTER, SEAT, WALL_SHELVES, LADDER } from './plan.js';

// The bookshop's shell: floor, the two standing walls with the shop door and the
// big shop window, the built-in bookshelves (and the ~1000 books on them), the
// counter, the window seat, a library ladder — plus what the lighting needs, as
// in level 1's room (the shared pieces from ../kit.js): sky card behind the window,
// a capture-only sky dome, an invisible shadow-casting ceiling, GI blockers.

// gaps in the shelves kept free of books for ornaments (props.js puts things
// there): bay, row (board index), and the span as fractions of the bay's width
export const SHELF_GAPS = [
  { bay: 0, row: 4, a: 0.58, b: 0.98 },
  { bay: 1, row: 2, a: 0.02, b: 0.34 },
  { bay: 2, row: 5, a: 0.4, b: 0.78 },
  { bay: 3, row: 1, a: 0.6, b: 0.98 },
  { bay: 3, row: 6, a: 0.05, b: 0.4 },
  { bay: 4, row: 3, a: 0.3, b: 0.72 },
  { bay: 1, row: 6, a: 0.55, b: 0.95 },
  { bay: 4, row: 5, a: 0.02, b: 0.3 },
];
const bayW = (SHELF.x1 - SHELF.x0) / SHELF.bays;
const DIV = 0.03; // divider thickness
export function bayInner(i) {
  return [SHELF.x0 + i * bayW + (i === 0 ? 0.036 : DIV / 2), SHELF.x0 + (i + 1) * bayW - (i === SHELF.bays - 1 ? 0.036 : DIV / 2)];
}
// world-space centre of a shelf gap (on the board top, halfway into the shelf)
export function gapSpot(g) {
  const [a, b] = bayInner(g.bay);
  const x = a + (b - a) * (g.a + g.b) / 2;
  return { x, y: SHELF.boards[g.row], z: (SHELF.back + SHELF.front) / 2 + 0.02, w: (b - a) * (g.b - g.a) };
}

const C = (hex) => new THREE.Color(hex);

function materials() {
  const M = {};
  // walls: apricot-terracotta limewash over the weathered plaster's blotches (a
  // light value: the deep terracotta of the raw texture drank the bounce light)
  M.plaster = new THREE.MeshStandardMaterial({
    name: 'plaster',
    color: C('#e0a06a'),
    map: detailMap('red_plaster_weathered', 0.9, 0.16),
    normalMap: tex('red_plaster_weathered', 'nor'),
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: tex('red_plaster_weathered', 'rough'),
    roughness: 1,
  });
  M.plasterOut = new THREE.MeshStandardMaterial({ name: 'plasterOut', color: C('#b8745a'), roughness: 0.95 });
  M.brick = new THREE.MeshStandardMaterial({ name: 'brickFace', color: C('#9c4c33'), roughness: 0.92 });
  // honey-walnut joinery (dark_wood lifted towards honey)
  M.wood = new THREE.MeshStandardMaterial({
    name: 'shelfWood',
    map: tex('dark_wood', 'diff', { srgb: true }),
    normalMap: tex('dark_wood', 'nor'),
    roughnessMap: tex('dark_wood', 'rough'),
    roughness: 0.9,
    color: new THREE.Color(1.45, 1.08, 0.78),
  });
  M.woodBack = M.wood.clone();
  M.woodBack.name = 'shelfBack';
  M.woodBack.color = new THREE.Color(0.95, 0.66, 0.46);
  M.woodDark = M.wood.clone();
  M.woodDark.name = 'woodDark';
  M.woodDark.color = new THREE.Color(0.8, 0.56, 0.4);
  // lighter, waxed honey wood: counter top, window seat board, ladder, wall shelves
  // (rosewood veneer was tried: its figure reads as red granite at this scale)
  M.veneer = new THREE.MeshPhysicalMaterial({
    name: 'veneer',
    map: tex('dark_wood', 'diff', { srgb: true }),
    normalMap: tex('dark_wood', 'nor'),
    roughnessMap: tex('dark_wood', 'rough'),
    roughness: 0.8,
    color: new THREE.Color(1.9, 1.38, 0.9),
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
  });
  M.floor = new THREE.MeshPhysicalMaterial({
    name: 'floor',
    map: tex('wood_floor', 'diff', { srgb: true }),
    normalMap: tex('wood_floor', 'nor'),
    roughnessMap: tex('wood_floor', 'rough'),
    roughness: 1,
    color: new THREE.Color(1.5, 1.12, 0.74),
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
  });
  // painted joinery of the shop front: oxblood gloss paint over wood grain
  M.paint = new THREE.MeshStandardMaterial({
    name: 'paint',
    color: C('#8e2f25'),
    map: detailMap('dark_wood', 0.4, 0.06),
    normalMap: tex('dark_wood', 'nor'),
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.42,
  });
  // the same paint over raised-and-fielded panels
  M.panel = new THREE.MeshStandardMaterial({
    name: 'panel',
    color: C('#8e2f25'),
    map: detailMap('wooden_panels', 0.35, 0.08),
    normalMap: tex('wooden_panels', 'nor'),
    roughness: 0.45,
  });
  // the counter: forest-green panels (A/B'd against oxblood — too heavy — and
  // mustard — brightest, but read as a toy); it echoes the sign and sets off the reds
  M.counter = M.panel.clone();
  M.counter.name = 'counterPanel';
  M.counter.color = C('#2f5a3e');
  M.brass = new THREE.MeshStandardMaterial({ name: 'brass', color: C('#c89a52'), metalness: 0.85, roughness: 0.3 });
  M.velvet = new THREE.MeshStandardMaterial({
    name: 'velvet',
    color: C('#2f5a3a'),
    normalMap: tex('velour_velvet', 'nor'),
    roughnessMap: tex('velour_velvet', 'rough'),
    roughness: 1,
  });
  M.beam = new THREE.MeshStandardMaterial({ name: 'beam', color: C('#5a3a26'), roughness: 0.8 });
  return M;
}

// kilim-style rug in the room's palette
function rugTexture() {
  const W = 1024;
  const H = 736;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry(5);
  const OX = '#7e211c';
  const MU = '#d9a23a';
  const CR = '#ecdcb6';
  const GR = '#2f5a3e';
  const TE = '#c0592f';
  g.fillStyle = OX;
  g.fillRect(0, 0, W, H);
  const band = (inset, w, col) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  };
  band(22, 20, CR);
  band(46, 16, GR);
  band(66, 10, MU);
  band(84, 6, CR);
  // stepped-diamond border motifs
  g.fillStyle = MU;
  for (let x = 110; x < W - 110; x += 44) {
    for (const y of [104, H - 104]) {
      g.beginPath();
      g.moveTo(x, y - 10);
      g.lineTo(x + 10, y);
      g.lineTo(x, y + 10);
      g.lineTo(x - 10, y);
      g.fill();
    }
  }
  // central field: rows of stepped diamonds (kilim "gul"s)
  const gul = (cx, cy, s, cols) => {
    for (let k = 0; k < cols.length; k++) {
      const r = s * (1 - k / cols.length);
      g.fillStyle = cols[k];
      g.beginPath();
      const st = 6;
      for (let i = 0; i <= st; i++) g.lineTo(cx - r + (r * i) / st, cy - (r * 0.75 * i) / st + (i % 2) * 6);
      for (let i = 0; i <= st; i++) g.lineTo(cx + (r * i) / st, cy - r * 0.75 + (r * 0.75 * i) / st + (i % 2) * 6);
      for (let i = 0; i <= st; i++) g.lineTo(cx + r - (r * i) / st, cy + (r * 0.75 * i) / st - (i % 2) * 6);
      for (let i = 0; i <= st; i++) g.lineTo(cx - (r * i) / st, cy + r * 0.75 - (r * 0.75 * i) / st - (i % 2) * 6);
      g.closePath();
      g.fill();
    }
  };
  for (const [cx, cy, s] of [[W * 0.5, H * 0.5, 190], [W * 0.22, H * 0.5, 110], [W * 0.78, H * 0.5, 110]]) {
    gul(cx, cy, s, [CR, TE, MU, GR, OX, MU]);
  }
  for (const [cx, cy] of [[W * 0.33, H * 0.27], [W * 0.67, H * 0.27], [W * 0.33, H * 0.73], [W * 0.67, H * 0.73]]) gul(cx, cy, 52, [MU, GR, CR]);
  // abrash: the dye lots drift in horizontal bands, plus woven noise
  const d = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    const drift = Math.sin(y * 0.021) * 6 + Math.sin(y * 0.0071 + 1.3) * 7;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = (rnd() - 0.5) * 24 + (x % 3 === 0 ? -7 : 0) + drift;
      d.data[i] += n;
      d.data[i + 1] += n * 0.92;
      d.data[i + 2] += n * 0.85;
    }
  }
  g.putImageData(d, 0, 0);
  return canvasTexture(c);
}

// coarse coir with an oxblood border
function doormatTexture() {
  const W = 256;
  const H = 384;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#b8864a';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#7e2a20';
  g.lineWidth = 22;
  g.strokeRect(20, 20, W - 40, H - 40);
  const rnd = mulberry(21);
  const d = g.getImageData(0, 0, W, H);
  for (let i = 0; i < d.data.length; i += 4) {
    const x = (i / 4) % W;
    const n = (rnd() - 0.5) * 60 + ((x >> 1) % 2 ? 10 : -10);
    d.data[i] += n;
    d.data[i + 1] += n * 0.85;
    d.data[i + 2] += n * 0.6;
  }
  g.putImageData(d, 0, 0);
  return canvasTexture(c);
}

// the sky behind the shop window: evening glow over the roofline of the houses
// across the street (lit windows once it's dark). Same uniforms as room.js's sky
// card, which world.js drives with the time of day.
const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 treeCol;
uniform float glowZ;
uniform float glowY;
varying vec3 vW;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  vec3 sky = mix(horizon, top, smoothstep(0.6, 3.6, vW.y));
  float g = exp(-length(vec2((vW.z - glowZ) * 0.7, (vW.y - glowY) * 1.1)) * 1.4);
  sky += glow * g;
  float lum = dot(treeCol, vec3(0.33));
  vec3 house = vec3(1.7, 0.72, 0.4) * lum * 0.95; // brick and ochre facades in shade
  // far row: pale, low
  float fz = vW.z * 0.9 + 17.0;
  float fc = floor(fz);
  float far = 0.95 + 0.35 * h1(fc) + (h1(fc + 2.0) > 0.5 ? (0.5 - abs(fract(fz) - 0.5)) * 0.4 : 0.0);
  vec3 col = mix(sky, mix(sky, house * 1.4, 0.45), smoothstep(far + 0.01, far - 0.01, vW.y));
  // near row: townhouses with gables and chimneys
  float bz = vW.z * 1.35;
  float cell = floor(bz);
  float fx = fract(bz);
  float roof = 1.25 + 0.5 * h1(cell + 3.0);
  roof += h1(cell + 11.0) > 0.45 ? (0.5 - abs(fx - 0.5)) * 0.5 : 0.0;
  float cx = 0.2 + 0.6 * h1(cell + 5.0);
  roof += smoothstep(0.045, 0.035, abs(fx - cx)) * step(0.35, h1(cell + 7.0)) * 0.22;
  float inHouse = smoothstep(roof + 0.008, roof - 0.008, vW.y);
  vec3 hc = house * (0.8 + 0.4 * h1(cell + 1.0));
  // windows: dim panes by day, warm lamplight after dusk
  vec2 wg = vec2(fract(vW.z * 4.2 + h1(cell) * 0.5), fract(vW.y * 2.4));
  float win = step(0.3, wg.x) * step(wg.x, 0.72) * step(0.25, wg.y) * step(wg.y, 0.8) * step(vW.y, roof - 0.2);
  float lit = step(0.45, h1(floor(vW.z * 4.2 + h1(cell) * 0.5) * 3.1 + floor(vW.y * 2.4) * 7.7));
  float night = 1.0 - smoothstep(0.01, 0.07, lum);
  hc = mix(hc, hc * 0.6 + vec3(1.0, 0.62, 0.3) * 1.6 * lit * night, win);
  col = mix(col, hc, inHouse);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function buildShell(scene) {
  const { X0, X1, Z0, Z1, H, T } = ROOM;
  const root = new THREE.Group();
  root.name = 'bookshop';
  scene.add(root);
  const M = materials();
  const B = new Batch();
  const P = { size: 2 };

  // ---- floor slab + supports
  B.box(X0 - T, X1 + 0.12, -0.3, 0, Z0 - T, Z1 + 0.12, M.floor, { size: 1.7, skip: [0, 1, 3, 4, 5] });
  B.box(X0 - T, X1 + 0.12, -0.3, 0, Z0 - T, Z1 + 0.12, M.woodDark, { size: 2, skip: [1, 2, 3, 5] });
  for (const [x, z] of [[-3.1, -2.5], [-3.1, 2.4], [3.0, -2.5], [3.0, 2.4], [0, 2.4], [3.0, 0], [-1.5, 2.4], [1.5, 2.4]]) {
    B.box(x - 0.16, x + 0.16, -0.62, -0.3, z - 0.16, z + 0.16, M.beam, { skip: [3] });
  }

  // ---- back wall (z = Z0)
  B.box(X0, X1, 0, H, Z0 - T, Z0, [M.brick, null, M.brick, null, M.plaster, null], P);

  // ---- left wall (x = X0): shop door + shop window
  const lw = (z0, z1, y0, y1, o = {}) => B.box(X0 - T, X0, y0, y1, z0, z1,
    [M.plaster, M.plasterOut, o.top ?? M.brick, o.bottom ?? M.plaster, o.end ? M.brick : M.plaster, M.plaster], P);
  lw(Z0 - T, DOOR.z0, 0, H);
  lw(DOOR.z1, WIN.z0, 0, WIN.y1);
  lw(WIN.z1, Z1, 0, WIN.y1, { end: true });
  lw(DOOR.z0, Z1, WIN.y1, H, { end: true });
  lw(WIN.z0, WIN.z1, 0, WIN.y0, { top: M.veneer });

  // baseboards (oxblood) where plaster meets the floor
  B.box(SHELF.x1, X1, 0, 0.12, Z0, Z0 + 0.02, M.paint, P);
  B.box(X0, X0 + 0.02, 0, 0.12, SHELF.front, DOOR.z0, M.paint, P);
  B.box(X0, X0 + 0.02, 0, 0.12, DOOR.z1, SEAT.z0, M.paint, P);
  B.box(X0, X0 + 0.02, 0, 0.12, SEAT.z1, Z1, M.paint, P);

  // ---- shop window: frame, mullions, transom lights
  {
    const f = WIN.fx;
    const d = 0.035;
    const z0 = WIN.z0;
    const z1 = WIN.z1;
    const fr = (y0, y1, za, zb, dd = d) => B.box(f - dd, f + dd, y0, y1, za, zb, M.paint, P);
    fr(WIN.y1 - 0.08, WIN.y1, z0, z1);
    fr(WIN.y0, WIN.y0 + 0.07, z0, z1, 0.045);
    fr(WIN.y0, WIN.y1, z0, z0 + 0.08);
    fr(WIN.y0, WIN.y1, z1 - 0.08, z1);
    fr(WIN.transom - 0.035, WIN.transom + 0.035, z0, z1, 0.04);
    const w = z1 - z0;
    for (const k of [1, 2]) fr(WIN.y0, WIN.transom, z0 + (w * k) / 3 - 0.03, z0 + (w * k) / 3 + 0.03);
    for (let k = 1; k < 6; k++) fr(WIN.transom, WIN.y1, z0 + (w * k) / 6 - 0.018, z0 + (w * k) / 6 + 0.018, 0.025);
    // a slim glazing bar across each big light, low down (a stall-board line)
    fr(0.95 - 0.015, 0.95 + 0.015, z0, z1, 0.02);
  }

  // ---- shop door: frame, transom, leaf with glazed upper half, knob
  {
    const f = DOOR.fx;
    const z0 = DOOR.z0;
    const z1 = DOOR.z1;
    const fr = (y0, y1, za, zb, x0 = f - 0.04, x1 = f + 0.04) => B.box(x0, x1, y0, y1, za, zb, M.paint, P);
    fr(DOOR.y1 - 0.08, DOOR.y1, z0, z1);
    fr(0, DOOR.y1, z0, z0 + 0.07);
    fr(0, DOOR.y1, z1 - 0.07, z1);
    fr(2.22, 2.3, z0, z1);
    fr(2.3, DOOR.y1, (z0 + z1) / 2 - 0.015, (z0 + z1) / 2 + 0.015, f - 0.02, f + 0.02);
    // leaf (closed), a touch inside the frame
    const lx0 = f + 0.01;
    const lx1 = f + 0.06;
    const a = z0 + 0.07;
    const b = z1 - 0.07;
    fr(0, 2.22, a, a + 0.1, lx0, lx1);
    fr(0, 2.22, b - 0.1, b, lx0, lx1);
    fr(0, 0.24, a, b, lx0, lx1);
    fr(0.96, 1.08, a, b, lx0, lx1);
    fr(2.12, 2.22, a, b, lx0, lx1);
    B.box(lx0 + 0.01, lx1 - 0.012, 0.24, 0.96, a + 0.1, b - 0.1, M.panel, { size: [1.1, 2.1], uvOff: [0.1, 0.2] });
    fr(1.08, 2.12, (a + b) / 2 - 0.015, (a + b) / 2 + 0.015, lx0 + 0.01, lx1 - 0.01);
    fr(1.56, 1.59, a, b, lx0 + 0.012, lx1 - 0.012);
    const knob = new THREE.SphereGeometry(0.03, 16, 12);
    B.geometry(knob, M.brass, new THREE.Matrix4().makeTranslation(lx1 + 0.03, 1.02, b - 0.16));
    B.box(lx1, lx1 + 0.012, 0.9, 1.14, b - 0.19, b - 0.13, M.brass);
    // letter plate
    B.box(lx1, lx1 + 0.006, 0.7, 0.76, (a + b) / 2 - 0.14, (a + b) / 2 + 0.14, M.brass);
  }

  // ---- built-in bookshelves along the back wall
  {
    const { x0, x1, back, front, boards } = SHELF;
    const W = { size: 2 };
    B.box(x0, x1, 0, 0.095, back, front - 0.035, M.woodDark, { ...W, skip: [1, 3, 5] }); // plinth
    B.box(x0 + 0.012, x1 - 0.012, 0.095, SHELF.top - 0.03, back, back + 0.012, M.woodBack, { ...W, skip: [0, 1, 2, 3, 5] }); // back panel
    for (const y of boards) B.box(x0, x1, y - 0.025, y, back + 0.012, front - 0.004, M.wood, { ...W, skip: [0, 1, 5] });
    B.box(x0, x1, SHELF.top - 0.03, SHELF.top, back, front, M.wood, { ...W, skip: [1, 5] });
    for (let i = 0; i <= SHELF.bays; i++) {
      const cx = x0 + i * bayW;
      const a = i === 0 ? x0 : i === SHELF.bays ? x1 - 0.036 : cx - DIV / 2;
      const b = i === 0 ? x0 + 0.036 : i === SHELF.bays ? x1 : cx + DIV / 2;
      B.box(a, b, 0, SHELF.top, back, front + 0.012, M.wood, { ...W, grain: 'v', skip: [5] });
    }
    // cornice
    B.box(x0, x1 + 0.03, SHELF.top, SHELF.top + 0.045, back, front + 0.035, M.wood, { ...W, skip: [1, 3, 5] });
    B.box(x0, x1 + 0.055, SHELF.top + 0.045, SHELF.cornice, back, front + 0.06, M.wood, { ...W, skip: [1, 5] });
    // brass library rail + brackets
    const rail = new THREE.CylinderGeometry(0.016, 0.016, x1 - x0 - 0.1, 14);
    B.geometry(rail, M.brass, new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition((x0 + x1) / 2, SHELF.rail.y, SHELF.rail.z));
    for (let i = 0; i <= SHELF.bays; i++) {
      const cx = THREE.MathUtils.clamp(x0 + i * bayW, x0 + 0.06, x1 - 0.06);
      B.box(cx - 0.012, cx + 0.012, SHELF.rail.y - 0.012, SHELF.rail.y + 0.012, front, SHELF.rail.z, M.brass);
    }
  }

  // ---- library ladder, hooked on the rail
  {
    const L = (SHELF.rail.y + 0.07) / Math.cos(LADDER.tilt);
    const m = new THREE.Matrix4().makeRotationX(-LADDER.tilt);
    m.setPosition(LADDER.x, 0, SHELF.rail.z + L * Math.sin(LADDER.tilt));
    const hw = LADDER.w / 2;
    for (const s of [-1, 1]) {
      B.box(s * hw - 0.022, s * hw + 0.022, 0, L, -0.04, 0.02, M.veneer, { size: 2.4, grain: 'v', matrix: m });
      // hook over the rail + a little wheel at the foot
      const hook = new THREE.TorusGeometry(0.035, 0.009, 8, 16, Math.PI * 1.1);
      B.geometry(hook, M.brass, m.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(s * hw, L - 0.045, -0.035)));
      const wheel = new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16);
      B.geometry(wheel, M.brass, m.clone().multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(s * hw, 0.035, 0)));
    }
    const rung = new THREE.CylinderGeometry(0.017, 0.017, LADDER.w, 12);
    for (let y = 0.3; y < L - 0.2; y += 0.29) {
      B.geometry(rung, M.veneer, m.clone().multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, y, -0.01)));
    }
  }

  // ---- shop counter: panelled oxblood front, honey top
  {
    const { x0, x1, z0, z1, h } = COUNTER;
    B.box(x0 + 0.04, x1 - 0.04, 0, 0.08, z0 + 0.04, z1 - 0.04, M.woodDark, { size: 2 }); // recessed plinth
    B.box(x0, x1, 0.08, h - 0.05, z0, z1, [M.counter, M.counter, null, null, M.counter, M.counter], { size: [1.07, 2.1], uvOff: [0.05, 0.44] });
    B.box(x0 - 0.035, x1 + 0.035, h - 0.05, h, z0 - 0.03, z1 + 0.035, M.veneer, { size: 2.4 });
    B.box(x0 - 0.01, x1 + 0.01, h - 0.08, h - 0.05, z1, z1 + 0.012, M.brass); // brass rail under the top
    B.box(x0 - 0.012, x0, h - 0.08, h - 0.05, z0, z1, M.brass);
    B.box(x1, x1 + 0.012, h - 0.08, h - 0.05, z0, z1, M.brass);
  }

  // ---- floating shelves on the plastered wall behind the counter
  for (const s of WALL_SHELVES) {
    B.box(s.x0, s.x1, s.y - 0.035, s.y, Z0, Z0 + s.d, M.veneer, { size: 2.4 });
    for (const x of [s.x0 + 0.12, s.x1 - 0.12]) B.box(x - 0.012, x + 0.012, s.y - 0.16, s.y - 0.035, Z0, Z0 + s.d * 0.8, M.brass);
  }

  // ---- window seat: panelled front, honey board, green velvet cushion
  {
    const { x1, z0, z1, h } = SEAT;
    B.box(X0, x1 - 0.03, 0, 0.07, z0 + 0.02, z1 - 0.02, M.woodDark, { size: 2, skip: [1] });
    B.box(X0, x1, 0.07, h - 0.03, z0, z1, [M.panel, null, null, null, M.paint, M.paint], { size: [1.07, 2.1], uvOff: [0.3, 0.52] });
    B.box(X0, x1 + 0.035, h - 0.03, h, z0 - 0.03, z1 + 0.03, M.veneer, { size: 2.4, skip: [1] });
    const cg = new RoundedBoxGeometry(0.46, 0.1, 1.45, 3, 0.035);
    const uv = cg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 3, uv.getY(k) * 3);
    B.geometry(cg, M.velvet, new THREE.Matrix4().makeTranslation(X0 + 0.27, h + 0.05, z1 - 0.8));
  }

  // ---- rug under the reading corner
  const RUG = { x0: -2.55, x1: -0.35, z0: 0.35, z1: 2.25 };
  const rugMat = new THREE.MeshStandardMaterial({
    name: 'rug',
    map: rugTexture(),
    normalMap: tex('caban', 'nor'),
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.96,
  });
  rugMat.normalMap.repeat.set((RUG.x1 - RUG.x0) / 0.27, (RUG.z1 - RUG.z0) / 0.27);
  const rw = RUG.x1 - RUG.x0;
  const rd = RUG.z1 - RUG.z0;
  B.box(RUG.x0, RUG.x1, 0.002, 0.014, RUG.z0, RUG.z1, rugMat, { size: [rw, rd], uvOff: [-RUG.x0 / rw, -RUG.z0 / rd], skip: [3] });

  // coir doormat inside the shop door
  const MAT = { x0: X0 + 0.04, x1: X0 + 0.62, z0: DOOR.z0 + 0.1, z1: DOOR.z1 - 0.1 };
  const matMat = new THREE.MeshStandardMaterial({ name: 'doormat', map: doormatTexture(), roughness: 1 });
  const mw = MAT.x1 - MAT.x0;
  const md = MAT.z1 - MAT.z0;
  B.box(MAT.x0, MAT.x1, 0.002, 0.02, MAT.z0, MAT.z1, matMat, { size: [mw, md], uvOff: [-MAT.x0 / mw, -MAT.z0 / md], skip: [3] });

  const shellMeshes = B.build(root, { name: 'shell' });
  for (const m of shellMeshes) if (m.material === rugMat || m.material === matMat) m.castShadow = false;
  // (a level keeps the rug rolled up until the repairs are done)
  const rugMesh = shellMeshes.find((m) => m.material === rugMat);

  // ---- the books: one merged mesh for everything on the built-in shelves
  const books = new Shelf();
  {
    const rnd = mulberry(1234);
    const { boards } = SHELF;
    for (let i = 0; i < SHELF.bays; i++) {
      const [a, b] = bayInner(i);
      boards.forEach((y, k) => {
        const head = (k + 1 < boards.length ? boards[k + 1] - 0.025 : SHELF.top - 0.03) - y;
        const gaps = SHELF_GAPS.filter((g) => g.bay === i && g.row === k).map((g) => [a + (b - a) * g.a, a + (b - a) * g.b]);
        const spans = [];
        let s = a + 0.004;
        for (const [ga, gb] of gaps.sort((p, q) => p[0] - q[0])) {
          if (ga - s > 0.03) spans.push([s, ga]);
          s = gb;
        }
        if (b - 0.004 - s > 0.03) spans.push([s, b - 0.004]);
        for (const [sa, sb] of spans) books.fillRun(sa, sb, y, SHELF.front - 0.012, rnd, { headroom: head });
      });
    }
    // on the floating shelves and the counter
    for (const s of WALL_SHELVES) {
      books.fillRun(s.x0 + 0.02, s.x0 + 0.45, s.y, Z0 + s.d - 0.01, rnd, { headroom: 0.36, lean: 1, flat: 0 });
    }
  }
  const bookMesh = books.mesh();
  root.add(bookMesh);

  // ---- rugged brick edges on the cut + floating chunks (Hozy's diorama look, as room.js)
  const { floaters } = brickRim(root, ROOM, { plaster: 0xd08a64 });

  // ---- sky card behind the shop front (seen only through the openings)
  const sky = skyCard({ frag: SKY_FRAG, width: WIN.z1 - DOOR.z0 + 0.8, height: 3.0, position: [X0 - T - 0.14, 1.5, (DOOR.z0 + WIN.z1) / 2] });
  root.add(sky.mesh);

  // ---- invisible shadow-casting ceiling (keeps the sun out of the open top)
  root.add(ceilingCaster(X0, X1 + 0.3, H - 0.02, H + 0.06, Z0, Z1 + 0.3));

  // ---- capture-only sky dome (what GI sees through the open top and sides)
  const dome = skyDome();
  root.add(dome.mesh);

  // ---- what the rest of the game needs to know about the fixed parts
  const shelfBox = B3(SHELF.x0, 0, SHELF.back, SHELF.x1 + 0.06, SHELF.cornice, SHELF.front + 0.06);
  const counterBox = B3(COUNTER.x0 - 0.04, 0, COUNTER.z0 - 0.03, COUNTER.x1 + 0.04, COUNTER.h, COUNTER.z1 + 0.04);
  const seatBox = B3(X0, 0, SEAT.z0 - 0.03, SEAT.x1 + 0.04, SEAT.h, SEAT.z1 + 0.03);
  // GI probes must not sit inside the shelving, the counter or the seat
  const blockers = [shelfBox, counterBox, seatBox];
  // floor nobody sees (under the fixed joinery and the doormat): a level's floor dirt skips it
  const floorHidden = [shelfBox, counterBox, seatBox, B3(MAT.x0, 0, MAT.z0, MAT.x1, 0.02, MAT.z1)];
  // fixed boards small things can stand on (top face = box.max.y)
  const surfaces = [
    ...SHELF.boards.map((y, k) => ({ name: `shelf${k}`, box: B3(SHELF.x0, y - 0.025, SHELF.back, SHELF.x1, y, SHELF.front) })),
    { name: 'shelfTop', box: B3(SHELF.x0, SHELF.cornice - 0.03, SHELF.back, SHELF.x1 + 0.055, SHELF.cornice, SHELF.front + 0.06) },
    { name: 'counter', box: B3(COUNTER.x0 - 0.035, COUNTER.h - 0.05, COUNTER.z0 - 0.03, COUNTER.x1 + 0.035, COUNTER.h, COUNTER.z1 + 0.035) },
    { name: 'seat', box: B3(X0, SEAT.h - 0.03, SEAT.z0 - 0.03, SEAT.x1 + 0.035, SEAT.h, SEAT.z1 + 0.03) },
    { name: 'cushion', box: B3(X0 + 0.04, SEAT.h, SEAT.z1 - 1.525, X0 + 0.5, SEAT.h + 0.1, SEAT.z1 - 0.075) },
    { name: 'sill', box: B3(WIN.fx + 0.045, WIN.y0 - 0.03, WIN.z0, X0, WIN.y0, WIN.z1) },
    ...WALL_SHELVES.map((s, k) => ({ name: `wallShelf${k}`, box: B3(s.x0, s.y - 0.035, Z0, s.x1, s.y, Z0 + s.d) })),
  ];
  const ladderFoot = SHELF.rail.z + ((SHELF.rail.y + 0.07) / Math.cos(LADDER.tilt)) * Math.sin(LADDER.tilt);
  const obstacles = [
    shelfBox,
    counterBox,
    seatBox,
    B3(LADDER.x - LADDER.w / 2 - 0.03, 0, SHELF.front, LADDER.x + LADDER.w / 2 + 0.03, SHELF.rail.y, ladderFoot + 0.05),
    ...WALL_SHELVES.map((s) => B3(s.x0, s.y - 0.16, Z0, s.x1, s.y, Z0 + s.d)),
    B3(X0, 0, DOOR.z0, X0 + 0.8, 2.2, DOOR.z1), // keep the door clear
  ];
  // walls pictures can hang on (decorate.js). There isn't much free wall in a shop (the
  // door, the shop window, the bookshelves, the sign): the margins are tight so the clock
  // (0.34 m) fits between the door and the window where it came from, and the back wall
  // goes down past the little shelves behind the counter (kept clear) — the clock could
  // only go in the top right corner before (playtest 2026-09-30)
  const hang = [
    {
      name: 'left', axis: 'x', sign: 1, at: X0, u: 'z', min: SHELF.front + 0.02, max: Z1, y0: 0.35, top: H - 0.05, ry: Math.PI / 2,
      keepOut: [
        { u0: DOOR.z0 - 0.02, u1: DOOR.z1 + 0.02, y0: 0, y1: DOOR.y1 + 0.05 },
        { u0: WIN.z0 - 0.02, u1: WIN.z1 + 0.02, y0: 0, y1: WIN.y1 + 0.05 },
      ],
    },
    {
      name: 'back', axis: 'z', sign: 1, at: Z0, u: 'x', min: SHELF.x1 + 0.08, max: X1, y0: 0.8, top: H - 0.05, ry: 0,
      keepOut: WALL_SHELVES.map((s) => ({ u0: s.x0 - 0.03, u1: s.x1 + 0.03, y0: s.y - 0.2, y1: s.y + 0.03 })),
    },
  ];

  return {
    root,
    paint: M.plaster,
    sky: sky.material,
    dome: dome.material,
    blockers,
    surfaces,
    hang,
    obstacles,
    books: bookMesh,
    rug: rugMesh,
    floorHidden,
    materials: M,
    update(dt, time) {
      drift(floaters, dt, time);
    },
  };
}
