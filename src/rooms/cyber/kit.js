import * as THREE from 'three';
import { gltfLoader } from '../../gltf.js';
// the flat low-poly toolkit of the pottery studio: painted pieces merged per material
// (Bucket), lathe-turned pots, seeded random — this room is built the same way
export { Bucket, mtx, paint, pot, rng, MAT } from '../pottery/kit.js';

// The neon flat's palette (sRGB): a warm, lived-in inside — peach plaster, mint tiles,
// honey floor, mustard and terracotta furniture — against the cool city outside, with the
// three signs' colours as the accents.
export const PAL = {
  plaster: '#efe3d6', // the room's own wall colour (the roller's first): a light cream that shows the neon true
  mint: '#8fcfb8', // dado tiles
  grout: '#e7f0ea',
  cream: '#f5ecdc', // kitchen tiles
  teal: '#3a8a8f', // window frame, rails
  tealDark: '#2d6d72',
  floor: '#c4834f',
  slab: '#4b4559',
  beam: '#3a3444',
  wood: '#d8975c',
  woodDark: '#9c5f36',
  woodPale: '#e9bf86',
  mustard: '#efb54a',
  terracotta: '#d4674a',
  coral: '#ef7a63',
  rose: '#e79aa6',
  lilac: '#b9a3d6',
  plum: '#6e4a78',
  navy: '#2c3a5c',
  steel: '#a7aeb5',
  dark: '#2b2a30',
  leaf: '#5fae5a',
  leafDark: '#3f8f4a',
  concrete: '#8f8a96',
  magenta: '#ff2f9a',
  cyan: '#2fe4ff',
  amber: '#ffa733',
};

export const std = (hex, o = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.88, metalness: 0, flatShading: true, ...o });

// Kenney material names → the room's palette (a piece may override per name)
const KDEF = {
  wood: PAL.wood, woodDark: PAL.woodDark, carpet: PAL.terracotta, carpetDarker: PAL.plum, carpetWhite: PAL.cream, carpetBlue: PAL.teal,
  metal: '#e8e1d6', metalMedium: PAL.teal, metalDark: '#3b3942', metalLight: '#f3efe6', lamp: '#fff0c8',
  plant: PAL.leaf, glass: '#bfe0dc', fur: '#c98a55', _defaultMat: PAL.cream,
};
const loader = gltfLoader();
const cache = new Map();
// a Kenney Furniture Kit GLB (public/assets/rooms/cyber/kenney/, tools/fetch_room_cyber.py)
// with its own tinted, flat-shaded standard materials
export async function kenney(name, tint = {}) {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(`assets/rooms/cyber/kenney/${name}.glb`).then((g) => g.scene));
  const obj = (await cache.get(name)).clone(true);
  const mats = new Map();
  const conv = (m) => {
    if (!mats.has(m)) {
      const n = new THREE.MeshStandardMaterial({
        color: tint[m.name] ?? KDEF[m.name] ?? '#cccccc',
        roughness: m.name.startsWith('metal') ? 0.5 : 0.85,
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

// a tileable canvas of square tiles (n × n per texture) with grout lines
export function tiles(face, grout, { n = 4, px = 256, jitter = 0.05, seed = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  g.fillStyle = grout;
  g.fillRect(0, 0, px, px);
  const s = px / n;
  let a = seed;
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const base = new THREE.Color(face);
  const col = new THREE.Color();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      col.copy(base).offsetHSL(0, 0, (rnd() - 0.5) * jitter);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      // a soft sheen along the top of each tile
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(i * s + 3, j * s + 3, s - 6, s * 0.18);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
