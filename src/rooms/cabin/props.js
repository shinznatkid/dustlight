import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { place } from '../kit.js';
import { kaykit, splitByRect } from './kaykit.js';
import { paintingTexture, knitTexture, plaidTexture } from './art.js';
import { CABIN, FIRE, WINDOWS } from './shell.js';

// The cabin's furniture: KayKit "cute chunky" pieces (recoloured to the cabin's
// warm palette by swatch swaps) plus a few pieces built here in the same spirit
// (bookcase, a big leafy plant, a knitted pouf). Same entry format as props.js:
//   big: seen by GI probes (and blocks them) · y: height the lowest point sits on ·
//   yc: centre height (wall art) · boards: surfaces in the piece's own frame
const { X0, Z0 } = CABIN;
const R90 = Math.PI / 2;
const fz = Z0 + FIRE.d; // chimney front
const MANTEL = FIRE.mantel;
const MZ = fz + 0.13; // mantel depth centre

// scale of the furniture pack: KayKit units are ~1.6x a real metre
const S = 0.58;
const COUCH = { x: 1.62, z: Z0 + 0.07 + 1.6 * S / 2 };
const TABLE = { x: 1.5, z: -0.52 };
const SIDE = { x: 2.78, z: Z0 + 0.36 };
const TEA = { x: 2.2, z: 1.45 };
export const BOOKCASE = { x: -2.46, z: Z0 + 0.07 + 0.19, w: 1.1, h: 1.98, d: 0.38, boards: [0.06, 0.52, 0.99, 1.47] };
const BZ = BOOKCASE.z + 0.02;
const bh = (i) => BOOKCASE.boards[i] + 0.035; // top of board i
const WA = WINDOWS[0];
const WB = WINDOWS[1];
const SILL = WA.y0 + 0.035;

export const LAYOUT = [
  // ---- sitting area: terracotta couch against the back wall, facing the room
  {
    id: 'couch', pack: 'furniture', name: 'couch_pillows', x: COUCH.x, z: COUCH.z, scale: S, big: true,
    swap: { yellow: 'terracotta', blue: 'cream' }, boards: [{ h: 0.54 * S, hx: 1.2 * S, hz: 0.45 * S }],
  },
  {
    id: 'coffee_table', pack: 'furniture', name: 'table_low', x: TABLE.x, z: TABLE.z, scale: 0.55, big: true,
    swap: { darkwood: 'honey' }, boards: [{ h: 0.5 * 0.55, hx: 1.1 * 0.55, hz: 0.68 * 0.55 }],
  },
  {
    id: 'side_table', pack: 'furniture', name: 'table_small', x: SIDE.x, z: SIDE.z, scale: 0.5, big: true,
    swap: { darkwood: 'honey' }, boards: [{ h: 0.5, hx: 0.24, hz: 0.24 }],
  },
  { id: 'fig', x: 0.44, z: Z0 + 0.34, big: true, block: false },
  // ---- reading nook by the second window: mustard armchair, knitted pouf, floor lamp (fixtures.js)
  {
    id: 'armchair', pack: 'furniture', name: 'armchair_pillows', x: -2.3, z: 1.2, ry: 1.95, scale: S, big: true,
    swap: { yellow: 'mustard', blue: 'rose' },
  },
  { id: 'pouf', x: -1.25, z: 1.55, big: true, boards: [{ h: 0.36, hx: 0.2, hz: 0.2 }] },
  // an old chest under the first window, a folded plaid blanket on it
  { id: 'chest', pack: 'dungeon', name: 'trunk_medium_A', x: X0 + 0.07 + 0.29, z: WA.zc + 0.05, ry: R90, scale: 0.62, big: true, boards: [{ h: 0.45, hx: 0.28, hz: 0.25 }] },
  { id: 'blanket', x: X0 + 0.07 + 0.3, z: WA.zc + 0.08, y: 0.452, ry: 0.08 },
  // ---- tea for two at the front: a round honey table, two chairs with sage seats
  { id: 'teatable', x: TEA.x, z: TEA.z, big: true, boards: [{ h: 0.62, hx: 0.3, hz: 0.3 }] },
  { id: 'chair', pack: 'furniture', name: 'chair_A', x: TEA.x - 0.62, z: TEA.z + 0.16, ry: -R90 - 0.25, scale: 0.6, big: true, swap: { darkwood: 'honey', blue: 'sage' } },
  { id: 'chair', pack: 'furniture', name: 'chair_A', x: TEA.x + 0.18, z: TEA.z - 0.62, ry: Math.PI + 0.2, scale: 0.6, big: true, swap: { darkwood: 'honey', blue: 'sage' } },
  { id: 'plate', pack: 'restaurant', name: 'plate_small', x: TEA.x - 0.1, z: TEA.z + 0.1, y: 0.62, scale: 0.3 },
  { id: 'jar', pack: 'restaurant', name: 'jar_C_medium', x: TEA.x + 0.12, z: TEA.z - 0.08, y: 0.62, scale: 0.3 },
  { id: 'pumpkin', pack: 'halloween', name: 'pumpkin_orange_small', x: TEA.x - 0.08, z: TEA.z - 0.16, y: 0.62, scale: 0.26, ry: 0.5 },
  // ---- bookcase in the back-left corner
  {
    id: 'bookcase', x: BOOKCASE.x, z: BOOKCASE.z, big: true,
    boards: [...BOOKCASE.boards.map((h) => h + 0.035), BOOKCASE.h].map((h) => ({ h, hx: BOOKCASE.w / 2 - 0.06, hz: BOOKCASE.d / 2 - 0.04 })),
  },
  { id: 'books', pack: 'furniture', name: 'book_set', x: -2.7, z: BZ, y: bh(0), scale: 0.5, swap: { blue: 'terracotta' } },
  { id: 'basket', pack: 'restaurant', name: 'bowl_small', x: -2.18, z: BZ, y: bh(0), scale: 0.5 },
  { id: 'books', pack: 'furniture', name: 'book_set', x: -2.72, z: BZ, y: bh(1), scale: 0.5 },
  { id: 'books', pack: 'furniture', name: 'book_set', x: -2.28, z: BZ, y: bh(1), scale: 0.44, ry: Math.PI, swap: { yellow: 'rose', blue: 'teal' } },
  { id: 'books', pack: 'furniture', name: 'book_set', x: -2.2, z: BZ, y: bh(3), scale: 0.5, ry: Math.PI },
  { id: 'books', pack: 'furniture', name: 'book_set', x: -2.36, z: BZ, y: bh(2), scale: 0.46, swap: { blue: 'sage' } },
  { id: 'book', pack: 'furniture', name: 'book_single', x: -2.06, z: BZ, y: bh(2), scale: 0.5, ry: 0.2 },
  { id: 'jar', pack: 'restaurant', name: 'jar_B_small', x: -2.78, z: BZ, y: BOOKCASE.h, scale: 0.36 },
  { id: 'cactus', pack: 'furniture', name: 'cactus_small_A', x: -2.05, z: BZ, y: BOOKCASE.h, scale: 0.4 },
  { id: 'pumpkin', pack: 'halloween', name: 'pumpkin_orange_small', x: -2.75, z: BZ, y: bh(2), scale: 0.36 },
  { id: 'jar', pack: 'restaurant', name: 'jar_A_small', x: -2.72, z: BZ, y: bh(3), scale: 0.34 },
  { id: 'cactus', pack: 'furniture', name: 'cactus_medium_B', x: -2.42, z: BZ, y: BOOKCASE.h, scale: 0.4 },
  // ---- mantel + hearth + chimney
  { id: 'frame_mountain', pack: 'furniture', name: 'pictureframe_large_A', x: FIRE.x, z: fz + 0.09, yc: 2.2, scale: 0.6, art: 'mountain' },
  { id: 'cactus', pack: 'furniture', name: 'cactus_small_B', x: FIRE.x + 0.72, z: MZ, y: MANTEL, scale: 0.42 },
  { id: 'pumpkin', pack: 'halloween', name: 'pumpkin_yellow_small', x: FIRE.x + 0.42, z: MZ, y: MANTEL, scale: 0.34, ry: 0.6 },
  { id: 'frame_standing', pack: 'furniture', name: 'pictureframe_standing_A', x: FIRE.x - 0.5, z: MZ, y: MANTEL, scale: 0.42, ry: 0.15, art: 'flowers' },
  { id: 'pumpkin', pack: 'halloween', name: 'pumpkin_orange', x: FIRE.x - FIRE.hhw + 0.26, z: fz + 0.22, y: FIRE.hearth, scale: 0.42, ry: 0.4 },
  { id: 'pumpkin', pack: 'halloween', name: 'pumpkin_yellow_small', x: FIRE.x - FIRE.ow - 0.18, z: fz + 0.24, y: FIRE.hearth, scale: 0.36, ry: 1.1 },
  // someone asleep in front of the fire
  { id: 'cat', x: FIRE.x - 0.05, z: fz + FIRE.hd + 0.34, ry: 0.5, scale: 1.3 },
  // ---- walls: pictures above the couch
  { id: 'frame_flowers', pack: 'furniture', name: 'pictureframe_medium', x: 1.25, z: Z0 + 0.08, yc: 2.05, scale: 0.6, art: 'flowers', swap: { lightwood: 'sage' } },
  { id: 'frame_small', pack: 'furniture', name: 'pictureframe_small_A', x: 2.05, z: Z0 + 0.08, yc: 2.12, scale: 0.6, art: 'night', swap: { lightwood: 'terracotta' } },
  // ---- window sills, tables
  { id: 'cactus', pack: 'furniture', name: 'cactus_small_B', x: X0 - 0.03, z: WA.zc + 0.4, y: SILL, scale: 0.36 },
  { id: 'cactus', pack: 'furniture', name: 'cactus_medium_A', x: X0 - 0.03, z: WB.zc - 0.33, y: SILL, scale: 0.34 },
  { id: 'book', pack: 'furniture', name: 'book_single', x: TABLE.x - 0.34, z: TABLE.z + 0.08, y: 0.5 * 0.55, scale: 0.45, lay: true, ry: 0.3 },
  { id: 'bowl', pack: 'restaurant', name: 'bowl_small', x: TABLE.x + 0.36, z: TABLE.z - 0.04, y: 0.5 * 0.55, scale: 0.36 },
];

// ---- procedural pieces ------------------------------------------------------------------------

function bookcase() {
  const g = new THREE.Group();
  const { w, h, d, boards } = BOOKCASE;
  const mat = new THREE.MeshStandardMaterial({ color: 0xd99550, roughness: 0.7 });
  const back = new THREE.MeshStandardMaterial({ color: 0xb8743f, roughness: 0.8 });
  const rb = (sx, sy, sz, x, y, z, m = mat) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(0.025, sx / 2.01, sy / 2.01, sz / 2.01)), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  rb(0.07, h, d, -w / 2 + 0.035, h / 2, 0);
  rb(0.07, h, d, w / 2 - 0.035, h / 2, 0);
  rb(w, 0.07, d + 0.03, 0, h - 0.035, 0.0);
  rb(w - 0.1, h - 0.1, 0.03, 0, h / 2, -d / 2 + 0.02, back);
  for (const b of boards) rb(w - 0.1, 0.035, d - 0.04, 0, b + 0.0175, 0.01);
  // little feet
  for (const sx of [-1, 1]) rb(0.1, 0.06, 0.1, sx * (w / 2 - 0.08), 0.03, 0.1);
  return g;
}

// a chunky fiddle-leaf-ish plant: terracotta pot, a few round leaf clusters
function fig() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.LatheGeometry([[0.0, 0], [0.15, 0], [0.19, 0.3], [0.21, 0.32], [0.21, 0.36], [0.0, 0.36]].map(([x, y]) => new THREE.Vector2(x, y)), 24),
    new THREE.MeshStandardMaterial({ color: 0xd9704a, roughness: 0.8 }),
  );
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0x5a3b28, roughness: 1 }));
  soil.position.y = 0.34;
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.9, 8), trunkMat);
  trunk.position.y = 0.75;
  const leaf = new THREE.MeshStandardMaterial({ color: 0x6fb05a, roughness: 0.7, flatShading: true });
  const leaf2 = new THREE.MeshStandardMaterial({ color: 0x4f9a4c, roughness: 0.7, flatShading: true });
  const blobs = [[0, 1.3, 0, 0.3, leaf], [-0.17, 1.02, 0.08, 0.22, leaf2], [0.18, 1.1, -0.04, 0.24, leaf], [0.05, 1.52, 0.03, 0.2, leaf2], [-0.1, 1.25, -0.12, 0.2, leaf2]];
  for (const [x, y, z, r, m] of blobs) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m);
    b.position.set(x, y, z);
    b.scale.set(1, 0.85, 1);
    g.add(b);
  }
  g.add(pot, soil, trunk);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// knitted pouf: a squashed drum with a cable-knit texture
function pouf() {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const a = t * Math.PI;
    pts.push(new THREE.Vector2(Math.max(0.001, 0.22 + 0.06 * Math.sin(a)) * Math.min(1, Math.sin(a) * 3 + 0.02), 0.18 - Math.cos(a) * 0.18));
  }
  const geo = new THREE.LatheGeometry(pts, 32);
  const tex = knitTexture();
  tex.repeat.set(6, 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5fb3a6, map: tex, roughness: 1 }));
  m.castShadow = true;
  m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// a round honey tea table on a turned pedestal
function teatable() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xe6aa62, roughness: 0.65 });
  const r = 0.4;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r - 0.02, 0.06, 40), wood);
  top.position.y = 0.59;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.01, 0.022, 10, 40), wood);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.598;
  const leg = new THREE.Mesh(
    new THREE.LatheGeometry([[0.0, 0.0], [0.22, 0.0], [0.24, 0.04], [0.07, 0.1], [0.05, 0.3], [0.07, 0.45], [0.05, 0.56], [0.0, 0.56]].map(([x, y]) => new THREE.Vector2(x, y)), 24),
    wood,
  );
  g.add(top, rim, leg);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// a folded plaid blanket: a soft slab with rolled edges
function blanket() {
  const tex = plaidTexture();
  tex.repeat.set(1.6, 1.6);
  const m = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.09, 0.46, 3, 0.04), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.castShadow = true;
  m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// a ginger cat curled up asleep: chunky blobs in the KayKit spirit
function cat() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xf0924a, roughness: 0.85 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfbe6c8, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a3322, roughness: 0.6 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xf2a0a0, roughness: 0.8 });
  const blob = (m, sx, sy, sz, x, y, z) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m);
    b.scale.set(sx, sy, sz);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  blob(fur, 0.2, 0.1, 0.15, 0, 0.1, 0); // body
  blob(cream, 0.13, 0.06, 0.1, 0.03, 0.06, 0.07); // belly fluff
  const head = blob(fur, 0.085, 0.075, 0.08, 0.15, 0.1, 0.09);
  blob(cream, 0.045, 0.035, 0.04, 0.2, 0.08, 0.14); // muzzle
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.06, 4), fur);
    ear.position.set(0.15 + s * 0.045, 0.17, 0.07);
    ear.rotation.set(-0.3, 0, -s * 0.35);
    g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.035, 4), pink);
    inner.position.set(0.15 + s * 0.045, 0.165, 0.085);
    inner.rotation.copy(ear.rotation);
    g.add(inner);
    // closed eyes: little dark dashes
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), dark);
    eye.position.set(0.19 + s * 0.028, 0.11, 0.155);
    eye.rotation.set(0, -0.5, s * 0.2);
    g.add(eye);
  }
  // tail wrapped round the front
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 10, 24, Math.PI * 0.95), fur);
  tail.rotation.set(Math.PI / 2, 0, 0.35);
  tail.position.set(-0.02, 0.04, 0.0);
  g.add(tail);
  blob(cream, 0.04, 0.035, 0.04, 0.13, 0.04, 0.16); // tail tip
  // stripes on the back
  for (const x of [-0.1, -0.02, 0.06]) {
    const st = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 16, Math.PI * 0.7), new THREE.MeshStandardMaterial({ color: 0xd9733a, roughness: 0.85 }));
    st.position.set(x, 0.07, 0);
    st.rotation.set(0, Math.PI / 2, 0.15 * Math.PI);
    st.scale.set(0.8, 0.95, 1);
    g.add(st);
  }
  head.rotation.z = 0.2;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

const BUILDERS = { bookcase, fig, pouf, teatable, blanket, cat };

// art on a KayKit frame: the frame's blank canvas (its triangles on the atlas'
// white swatch) is split off and gets a painting, UVs spread over its own extent
const artCache = new Map();
function addArt(obj, kind) {
  if (!artCache.has(kind)) {
    artCache.set(kind, new THREE.MeshStandardMaterial({ map: paintingTexture(kind), roughness: 0.9, name: `art_${kind}` }));
  }
  const mat = artCache.get(kind);
  const meshes = [];
  obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const [rest, canvas] = splitByRect(o.geometry, [896, 0, 1024, 256]);
    if (!canvas) continue;
    o.geometry = rest;
    canvas.computeBoundingBox();
    const bb = canvas.boundingBox;
    const p = canvas.attributes.position;
    const uv = canvas.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    }
    const m = new THREE.Mesh(canvas, mat);
    m.receiveShadow = true;
    o.add(m);
  }
}

export async function loadCabinProps(onProgress) {
  let done = 0;
  const items = await Promise.all(LAYOUT.map(async (e) => {
    try {
      let obj;
      if (BUILDERS[e.id]) obj = BUILDERS[e.id]();
      else {
        obj = await kaykit(e.pack, e.name, { swap: e.swap });
        if (e.art) addArt(obj, e.art);
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
      console.warn('cabin prop failed', e.id, err);
      return null;
    } finally {
      onProgress?.(++done / LAYOUT.length);
    }
  }));
  return items.filter(Boolean);
}
