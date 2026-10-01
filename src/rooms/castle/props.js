import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { mulberry } from '../../atmos.js';
import { place } from '../kit.js';
import { kaykit } from './kaykit.js';
import { tapestryTexture, pagesTexture, fabricTexture } from './art.js';
import { CASTLE, FIRE, WINDOWS } from './shell.js';

// The castle's furniture: KayKit pieces (Furniture Bits recoloured by swatch swaps; the
// Dungeon pack's chairs, table, chest, banners, candles, bottles, as they come) plus pieces
// built here in the same chunky spirit (a gothic bookcase, a lectern with an open book, the
// tapestries, goblets, a bowl of apples, a crown on its cushion, a basket of firewood, a
// sleeping hound). Same entry format as props.js / the cabin:
//   big: seen by GI probes (and blocks them) · y: height the lowest point sits on ·
//   yc: centre height (wall things) · boards: surfaces in the piece's own frame
const { X0, Z0 } = CASTLE;
const R90 = Math.PI / 2;
const S = 0.6; // KayKit Furniture Bits: ~1.6 units a metre
const MANTEL = FIRE.mantel;
const MZ = Z0 + (FIRE.hood.d0 + FIRE.md) / 2; // the mantel ledge's depth centre
export const BOOKCASE = { x: -2.42, z: Z0 + 0.2, w: 1.02, h: 2.1, d: 0.36, boards: [0.06, 0.52, 0.98, 1.44] };
const BZ = BOOKCASE.z + 0.02;
const bh = (i) => BOOKCASE.boards[i] + 0.035; // top of board i
const TABLE = { x: 1.5, z: 1.2, s: 0.66 };
const TH = TABLE.s; // the table's top (the model is 1 unit tall)
const SIDE = { x: -2.7, z: -0.74, s: 0.5 };
const CHEST = { x: X0 + 0.44, z: 2.02, s: 0.46 };
const CHEST_TOP = 1.3 * CHEST.s; // (the ridge of the lid)
const SILL = WINDOWS[0].y0;
const SILLX = X0 - 0.1;

export const LAYOUT = [
  // ---- the fireside: the lord's chair left of the hearth, a footstool, a side table with candles
  { id: 'throne', pack: 'furniture', name: 'armchair_pillows', x: -1.95, z: 0.05, ry: 1.82, scale: S, big: true, swap: { yellow: 'crimson', blue: 'gold' } },
  { id: 'footstool', pack: 'dungeon', name: 'stool', x: -1.02, z: 0.18, ry: 0.3, scale: 0.6, big: true, boards: [{ h: 0.3, hx: 0.18, hz: 0.18 }] },
  { id: 'sidetable', pack: 'dungeon', name: 'table_small', x: SIDE.x, z: SIDE.z, scale: SIDE.s, big: true, boards: [{ h: SIDE.s, hx: 0.2, hz: 0.2 }] },
  // ---- the settle along the back wall right of the hearth, cushions on it
  {
    id: 'settle', pack: 'furniture', name: 'couch_pillows', x: 2.22, z: Z0 + 0.03 + (1.6 * S) / 2, scale: S, big: true,
    swap: { yellow: 'royal', blue: 'gold' }, boards: [{ h: 0.54 * S, hx: 1.2 * S, hz: 0.45 * S }],
  },
  { id: 'cushion', pack: 'furniture', name: 'pillow_A', x: 1.72, z: Z0 + 0.4, y: 0.54 * S, ry: 0.25, scale: 0.5, swap: { yellow: 'crimson' } },
  { id: 'cushion', pack: 'furniture', name: 'pillow_B', x: 2.62, z: Z0 + 0.42, y: 0.54 * S, ry: -0.3, scale: 0.5, swap: { blue: 'forest' } },
  // ---- the table at the front: a runner, two chairs, supper
  { id: 'table', pack: 'dungeon', name: 'table_medium_tablecloth', x: TABLE.x, z: TABLE.z, scale: TABLE.s, big: true, boards: [{ h: TH, hx: 0.58, hz: 0.58 }] },
  { id: 'chair', pack: 'dungeon', name: 'chair', x: TABLE.x + 0.05, z: TABLE.z - 0.78, ry: 0, scale: 0.72, big: true },
  { id: 'chair', pack: 'dungeon', name: 'chair', x: TABLE.x - 0.8, z: TABLE.z + 0.08, ry: R90, scale: 0.72, big: true },
  { id: 'roast', pack: 'dungeon', name: 'plate_food_A', x: TABLE.x + 0.12, z: TABLE.z - 0.18, y: TH, scale: 0.3, ry: 0.4 },
  { id: 'plate', pack: 'dungeon', name: 'plate_food_B', x: TABLE.x - 0.25, z: TABLE.z + 0.12, y: TH, scale: 0.28, ry: -0.3 },
  { id: 'goblet', x: TABLE.x + 0.3, z: TABLE.z + 0.2, y: TH },
  { id: 'goblet', x: TABLE.x - 0.2, z: TABLE.z - 0.32, y: TH },
  { id: 'apples', x: TABLE.x + 0.28, z: TABLE.z + 0.42, y: TH },
  // ---- the bookcase in the back-left corner
  {
    id: 'bookcase', x: BOOKCASE.x, z: BOOKCASE.z, big: true,
    boards: [...BOOKCASE.boards.map((h) => h + 0.035), BOOKCASE.h].map((h) => ({ h, hx: BOOKCASE.w / 2 - 0.08, hz: BOOKCASE.d / 2 - 0.04 })),
  },
  { id: 'books', pack: 'furniture', name: 'book_set', x: -2.68, z: BZ, y: bh(0), scale: 0.5, swap: { blue: 'crimson' } },
  { id: 'books', pack: 'furniture', name: 'book_set', x: -2.3, z: BZ, y: bh(1), scale: 0.46, ry: Math.PI, swap: { yellow: 'royal', blue: 'forest' } },
  { id: 'books', pack: 'furniture', name: 'book_set', x: -2.6, z: BZ, y: bh(2), scale: 0.48, swap: { yellow: 'gold', blue: 'plum' } },
  { id: 'book', pack: 'furniture', name: 'book_single', x: -2.12, z: BZ, y: bh(2), scale: 0.5, ry: 0.2, swap: { yellow: 'crimson' } },
  { id: 'book', pack: 'furniture', name: 'book_single', x: -2.2, z: BZ, y: bh(0), scale: 0.5, lay: true, ry: 0.3, swap: { yellow: 'royal' } },
  { id: 'potion', pack: 'dungeon', name: 'bottle_A_green', x: -2.72, z: BZ, y: bh(1), scale: 0.24 },
  { id: 'potion', pack: 'dungeon', name: 'bottle_B_brown', x: -2.62, z: BZ, y: bh(3), scale: 0.24 },
  { id: 'potion', pack: 'dungeon', name: 'bottle_C_green', x: -2.25, z: BZ, y: bh(3), scale: 0.22 },
  { id: 'coins', pack: 'dungeon', name: 'coin_stack_small', x: -2.3, z: BZ, y: BOOKCASE.h, scale: 0.22 },
  // ---- the chest under the stained glass, the crown on it; a lectern by the window seat
  { id: 'chest', pack: 'dungeon', name: 'chest', x: CHEST.x, z: CHEST.z, ry: R90, scale: CHEST.s, big: true, boards: [{ h: CHEST_TOP, hx: 0.32, hz: 0.07 }] },
  { id: 'crown', x: CHEST.x, z: CHEST.z - 0.14, y: CHEST_TOP, ry: 0.4 },
  { id: 'coins', pack: 'dungeon', name: 'coin_stack_medium', x: CHEST.x, z: CHEST.z + 0.2, y: CHEST_TOP, scale: 0.2 },
  { id: 'lectern', x: -1.72, z: 1.72, ry: 0.85, big: true },
  // ---- by the hearth: firewood; asleep in front of it, the hound
  { id: 'firewood', x: -1.32, z: Z0 + 0.4, ry: 0.15 },
  { id: 'hound', x: 0.25, z: -1.1, ry: 0.35, scale: 1.4 },
  // ---- the mantel and the window sill
  { id: 'potion', pack: 'dungeon', name: 'bottle_A_brown', x: FIRE.x + 0.62, z: MZ, y: MANTEL, scale: 0.22 },
  { id: 'goblet', x: FIRE.x + 0.84, z: MZ, y: MANTEL },
  { id: 'candle', pack: 'dungeon', name: 'candle_melted', x: SILLX - 0.02, z: WINDOWS[0].zc + 0.26, y: SILL, scale: 0.26 },
  // ---- the walls: two tapestries, two banners, the golden shield over the hood
  { id: 'tapestry', art: 'tree', x: -1.45, z: Z0 + 0.03, yc: 1.72 },
  { id: 'tapestry', art: 'castle', x: 2.3, z: Z0 + 0.03, yc: 2.0 },
  { id: 'banner', pack: 'dungeon', name: 'banner_red', x: X0 + 0.06, z: 2.2, yc: 1.9, ry: R90, scale: 0.34 },
  { id: 'shield', pack: 'dungeon', name: 'sword_shield_gold', x: FIRE.x, z: Z0 + FIRE.hood.d1 + 0.06, yc: 2.62, scale: 0.34 },
  { id: 'banner', pack: 'dungeon', name: 'banner_blue', x: X0 + 0.05, z: -2.2, yc: 1.75, ry: R90, scale: 0.3 },
];

// ---- procedural pieces ------------------------------------------------------------------------------
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const rb = (sx, sy, sz, r = 0.02) => new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(r, sx / 2.01, sy / 2.01, sz / 2.01));

// a tall oak bookcase with a pointed-arch top board
function bookcase() {
  const g = new THREE.Group();
  const { w, h, d, boards } = BOOKCASE;
  const oak = std(0xa0643a, { roughness: 0.7 });
  const back = std(0x7a4a2a, { roughness: 0.8 });
  g.add(mesh(rb(0.08, h, d), oak, -w / 2 + 0.04, h / 2, 0));
  g.add(mesh(rb(0.08, h, d), oak, w / 2 - 0.04, h / 2, 0));
  g.add(mesh(rb(w - 0.1, h - 0.1, 0.03), back, 0, h / 2, -d / 2 + 0.02));
  for (const b of boards) g.add(mesh(rb(w - 0.12, 0.035, d - 0.04), oak, 0, b + 0.0175, 0.01));
  g.add(mesh(rb(w + 0.04, 0.06, d + 0.04), oak, 0, h - 0.03, 0));
  // the crest: a pointed arch cut from a board, a gold knob
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + 0.02, 0);
  s.lineTo(w / 2 - 0.02, 0);
  s.quadraticCurveTo(w / 2 - 0.1, 0.18, 0, 0.3);
  s.quadraticCurveTo(-w / 2 + 0.1, 0.18, -w / 2 + 0.02, 0);
  const crest = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }), oak);
  crest.position.set(0, h, -d / 2 + 0.03);
  crest.castShadow = true;
  g.add(crest);
  g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), std(0xe8b43a, { metalness: 0.6, roughness: 0.35 }), 0, h + 0.33, -d / 2 + 0.05));
  return g;
}

// a lectern: a turned post on a cross foot, a sloping desk with an open book (faces +z)
function lectern() {
  const g = new THREE.Group();
  const oak = std(0x9a5c34, { roughness: 0.7 });
  for (const a of [0, R90]) {
    const foot = mesh(rb(0.5, 0.06, 0.08), oak, 0, 0.03, 0);
    foot.rotation.y = a;
    g.add(foot);
  }
  g.add(mesh(new THREE.LatheGeometry([[0, 0.05], [0.06, 0.05], [0.05, 0.2], [0.035, 0.3], [0.045, 0.6], [0.03, 0.85], [0.06, 0.9], [0, 0.9]].map(([x, y]) => new THREE.Vector2(x, y)), 16), oak));
  const desk = new THREE.Group();
  desk.position.set(0, 1.0, 0);
  desk.rotation.x = 0.5; // sloping towards the reader
  desk.add(mesh(rb(0.5, 0.035, 0.38), oak));
  desk.add(mesh(rb(0.5, 0.05, 0.03), oak, 0, 0.03, 0.19)); // the ledge the book leans on
  const pages = new THREE.MeshStandardMaterial({ map: pagesTexture(), roughness: 0.9 });
  const cover = std(0x8a2a24, { roughness: 0.7 });
  for (const sg of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.position.set(0, 0.025, 0);
    leaf.rotation.z = -sg * 0.08;
    const c = mesh(rb(0.22, 0.012, 0.3, 0.005), cover, sg * 0.11, 0, 0);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.28), [cover, cover, pages, cover, cover, cover]);
    p.position.set(sg * 0.105, 0.016, 0);
    // each page shows its own half of the spread
    const uv = p.geometry.attributes.uv;
    for (let i = 8; i < 12; i++) uv.setX(i, sg < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
    p.castShadow = true;
    leaf.add(c, p);
    desk.add(leaf);
  }
  g.add(desk);
  return g;
}

// a tapestry on a rod: a woollen picture, a little wave in it, gold finials
const tapCache = new Map();
function tapestry(art) {
  if (!tapCache.has(art)) tapCache.set(art, new THREE.MeshStandardMaterial({ map: tapestryTexture(art), roughness: 1, side: THREE.DoubleSide }));
  const g = new THREE.Group();
  const w = 0.82;
  const h = 1.23;
  const geo = new THREE.PlaneGeometry(w, h, 16, 4);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.015 + Math.sin((p.getX(i) / w) * Math.PI * 5) * 0.008);
  geo.computeVertexNormals();
  const cloth = new THREE.Mesh(geo, tapCache.get(art));
  cloth.position.y = h / 2;
  cloth.receiveShadow = true;
  cloth.castShadow = true;
  g.add(cloth);
  const wood = std(0x6b3f22);
  const rod = mesh(new THREE.CylinderGeometry(0.018, 0.018, w + 0.16, 10), wood, 0, h + 0.01, 0.03);
  rod.rotation.z = R90;
  g.add(rod);
  const gold = std(0xe8b43a, { metalness: 0.6, roughness: 0.35 });
  for (const sg of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.03, 12, 8), gold, sg * (w / 2 + 0.09), h + 0.01, 0.03));
  return g;
}

// a golden goblet
const goldMat = () => std(0xe8b43a, { metalness: 0.65, roughness: 0.3 });
function goblet() {
  const g = new THREE.Group();
  const pts = [[0, 0], [0.045, 0], [0.045, 0.008], [0.012, 0.02], [0.01, 0.07], [0.018, 0.08], [0.042, 0.1], [0.046, 0.16], [0.04, 0.16], [0.036, 0.1], [0.0, 0.09]];
  g.add(mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 20), goldMat()));
  const red = mesh(new THREE.SphereGeometry(0.009, 8, 6), std(0xd6443a, { roughness: 0.3 }), 0, 0.125, 0.043);
  g.add(red);
  return g;
}
// a wooden bowl heaped with red and green apples
function apples() {
  const g = new THREE.Group();
  const rnd = mulberry(3);
  const bowl = new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.12, 0.05], [0.13, 0.075], [0.12, 0.075], [0.105, 0.05], [0, 0.03]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  g.add(mesh(bowl, std(0x9a5c34)));
  const reds = [std(0xd63a2e, { roughness: 0.45 }), std(0xe8b43a, { roughness: 0.45 }), std(0x8cc152, { roughness: 0.45 })];
  const stem = std(0x5a3322);
  const at = [[0, 0.09, 0], [0.05, 0.075, 0.03], [-0.05, 0.075, 0.03], [0.02, 0.075, -0.055], [-0.035, 0.12, -0.02]];
  at.forEach(([x, y, z], i) => {
    const a = mesh(new THREE.SphereGeometry(0.036, 14, 10), reds[i % 3 === 2 ? 2 : i % 2], x, y, z);
    a.scale.y = 0.9;
    g.add(a);
    const s = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.025, 5), stem, x + (rnd() - 0.5) * 0.01, y + 0.04, z);
    g.add(s);
  });
  return g;
}
// a golden crown on a red velvet cushion (tassels at the corners)
function crown() {
  const g = new THREE.Group();
  const velvet = new THREE.MeshStandardMaterial({ map: fabricTexture('#b8322c', 11), roughness: 0.9 });
  g.add(mesh(rb(0.26, 0.07, 0.26, 0.035), velvet, 0, 0.035, 0));
  const gold = goldMat();
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), gold, x * 0.12, 0.03, z * 0.12));
  const band = mesh(new THREE.CylinderGeometry(0.07, 0.068, 0.05, 20, 1, true), gold, 0, 0.1, 0);
  band.material.side = THREE.DoubleSide;
  g.add(band);
  const gems = [std(0xd6443a, { roughness: 0.2 }), std(0x2f6bff, { roughness: 0.2 }), std(0x27c85a, { roughness: 0.2 })];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const pt = mesh(new THREE.ConeGeometry(0.018, 0.05, 6), gold, Math.sin(a) * 0.066, 0.145, Math.cos(a) * 0.066);
    g.add(pt);
    g.add(mesh(new THREE.SphereGeometry(0.009, 8, 6), gold, Math.sin(a) * 0.066, 0.175, Math.cos(a) * 0.066));
    g.add(mesh(new THREE.SphereGeometry(0.011, 8, 6), gems[k % 3], Math.sin(a + 0.63) * 0.071, 0.1, Math.cos(a + 0.63) * 0.071));
  }
  return g;
}
// a basket of split logs by the hearth
function firewood() {
  const g = new THREE.Group();
  const wick = std(0xc8904f, { roughness: 0.95 });
  const basket = new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.24, 0.2], [0.25, 0.22], [0.23, 0.22], [0.215, 0.03], [0, 0.03]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  const b = mesh(basket, wick);
  b.scale.set(1.25, 1, 0.9);
  g.add(b);
  const bark = std(0x7a4a2a, { roughness: 0.9 });
  const end = std(0xe0b27a, { roughness: 0.8 });
  const rnd = mulberry(8);
  for (let k = 0; k < 7; k++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.46, 8), [bark, end, end]);
    log.rotation.z = R90;
    log.rotation.y = (rnd() - 0.5) * 0.3;
    log.position.set((rnd() - 0.5) * 0.06, 0.1 + Math.floor(k / 3) * 0.07, (k % 3 - 1) * 0.085 + (rnd() - 0.5) * 0.02);
    log.castShadow = true;
    g.add(log);
  }
  return g;
}
// a big sleepy hound curled up on the rug: chunky blobs, floppy ears, a wagging-still tail
function hound() {
  const g = new THREE.Group();
  const fur = std(0xc98a52, { roughness: 0.85 });
  const cream = std(0xf4e2c0, { roughness: 0.85 });
  const dark = std(0x3a2418, { roughness: 0.6 });
  const collar = std(0x2f6bff, { roughness: 0.5 });
  const blob = (m, sx, sy, sz, x, y, z) => {
    const b = mesh(new THREE.SphereGeometry(1, 24, 16), m, x, y, z);
    b.scale.set(sx, sy, sz);
    g.add(b);
    return b;
  };
  blob(fur, 0.3, 0.14, 0.19, 0, 0.14, 0); // body
  blob(cream, 0.2, 0.08, 0.12, 0.05, 0.08, 0.08); // chest
  blob(fur, 0.1, 0.06, 0.08, -0.22, 0.07, 0.12); // haunch
  // head resting on the front paws
  blob(cream, 0.07, 0.035, 0.05, 0.3, 0.04, 0.16);
  blob(cream, 0.07, 0.035, 0.05, 0.32, 0.04, 0.05);
  const head = blob(fur, 0.11, 0.09, 0.1, 0.3, 0.12, 0.1);
  blob(cream, 0.07, 0.05, 0.06, 0.39, 0.1, 0.13); // muzzle
  blob(dark, 0.02, 0.016, 0.018, 0.45, 0.115, 0.14); // nose
  for (const s of [-1, 1]) {
    const ear = blob(dark.clone(), 0.06, 0.02, 0.09, 0.26, 0.15, 0.1 + s * 0.09);
    ear.material.color.set(0x8a5230);
    ear.rotation.set(s * 0.6, 0, 0.5);
    const eye = mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), dark, 0.38, 0.145, 0.1 + s * 0.04);
    eye.rotation.set(0, 0.4 * s, 0.25);
    g.add(eye);
  }
  const c = mesh(new THREE.TorusGeometry(0.085, 0.014, 8, 20), collar, 0.24, 0.12, 0.1);
  c.rotation.set(0, R90, 0.4);
  g.add(c);
  const tail = mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20, Math.PI * 0.8), fur, -0.08, 0.05, 0.02);
  tail.rotation.set(R90, 0, 1.6);
  g.add(tail);
  const tip = blob(cream, 0.04, 0.03, 0.04, -0.12, 0.05, 0.21); // tail tip
  head.rotation.z = -0.15;
  // the parts castle/hound.js moves
  const kids = g.children;
  // (not enumerable: userData stays plain data — a copy/serialisation never walks into meshes)
  Object.defineProperty(g.userData, 'parts', { value: { body: kids[0], chest: kids[1], head, face: kids.slice(6, 8), ears: [kids[8], kids[10]], eyes: [kids[9], kids[11]], tail, tip } });
  return g;
}

const BUILDERS = { bookcase, lectern, tapestry: (e) => tapestry(e.art), goblet, apples, crown, firewood, hound };

export async function loadCastleProps(onProgress) {
  let done = 0;
  const items = await Promise.all(LAYOUT.map(async (e) => {
    try {
      let obj;
      if (BUILDERS[e.id]) obj = BUILDERS[e.id](e);
      else {
        obj = await kaykit(e.pack, e.name, { swap: e.swap });
        if (e.lay) {
          // a book lying flat: its thickness (x) turned upright, inside a holder group
          const g = new THREE.Group();
          obj.rotation.z = R90;
          g.add(obj);
          obj = g;
        }
      }
      obj.name = e.id;
      place(obj, e);
      if (!e.big) obj.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
      return { e, obj };
    } catch (err) {
      console.warn('castle prop failed', e.id, err);
      return null;
    } finally {
      onProgress?.(++done / LAYOUT.length);
    }
  }));
  return items.filter(Boolean);
}
