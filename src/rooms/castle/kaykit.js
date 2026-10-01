import * as THREE from 'three';
import { gltfLoader } from '../../gltf.js';

// KayKit (Kay Lousberg, CC0) models for the castle — tools/fetch_room_castle.py. Every model
// of a pack is UV mapped onto one shared gradient atlas, so a whole pack draws with ONE
// material; colours change by moving a part's UVs onto another swatch ("swatch swap", as the
// cabin does: src/rooms/cabin/kaykit.js). The furniture atlas gets its spare bottom row
// repainted with the castle's own swatches (crimson, gold, royal blue …).
//
// Swatch rects are pixels of the 1024² atlas, top-left origin (glTF UVs: v = 0 at the top).

const BASE = 'assets/rooms/castle';
const loader = gltfLoader();

export const SWATCH = {
  furniture: {
    yellow: [0, 256, 256, 512],
    blue: [256, 256, 512, 512],
    white: [512, 256, 896, 512],
    darkwood: [0, 0, 384, 256],
    lightwood: [384, 0, 640, 256],
    tan: [640, 0, 768, 256],
    // the atlas' spare bottom row, repainted by castleAtlas()
    crimson: [128, 768, 256, 1024],
    gold: [256, 768, 384, 1024],
    royal: [384, 768, 512, 1024],
    forest: [512, 768, 640, 1024],
    cream: [640, 768, 768, 1024],
    plum: [768, 768, 896, 1024],
    oak: [896, 768, 1024, 1024],
  },
  // the dungeon atlas: 8 × 4 swatches of 128 × 256
  dungeon: {
    wood: [512, 0, 640, 256],
    darkwood: [896, 0, 1024, 256],
    tan: [128, 256, 256, 512],
    red: [384, 512, 512, 768],
    gold: [640, 512, 768, 768],
    blue: [768, 512, 896, 768],
    green: [128, 512, 256, 768],
    purple: [384, 256, 512, 512],
    flame: [896, 512, 1024, 768],
  },
};

// light top → deeper bottom, like KayKit's own swatches
const CUSTOM = {
  crimson: ['#ec6a5a', '#a8302a'],
  gold: ['#ffd978', '#d8962a'],
  royal: ['#7aa4ea', '#2f4f9a'],
  forest: ['#9ccc84', '#3f7a45'],
  cream: ['#fff6e6', '#ead2aa'],
  plum: ['#cf96c6', '#7a4a86'],
  oak: ['#d69a5c', '#8a5230'],
};

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

// the furniture atlas with the castle's swatches over its unused bottom row
// (the canvas is attached to the texture only once painted: WebGL2 storage is immutable)
async function castleAtlas() {
  const img = await loadImage(`${BASE}/furniture/furniturebits_texture.png`);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const k = img.width / 1024;
  for (const [name, [top, bot]] of Object.entries(CUSTOM)) {
    const [x0, y0, x1, y1] = SWATCH.furniture[name].map((v) => v * k);
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bot);
    g.fillStyle = gr;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  const t = new THREE.Texture();
  t.image = c;
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// one material per pack (soft, not glossy: KayKit reads best matte)
const packMats = new Map();
function packMaterial(pack, map) {
  if (!packMats.has(pack)) {
    packMats.set(pack, new THREE.MeshStandardMaterial({ map, roughness: 0.78, metalness: 0, name: `kaykit_${pack}` }));
  }
  return packMats.get(pack);
}

let atlasP = null;
const files = new Map();
// the dungeon pack: most models are .gltf.glb, a couple plain .glb
const GLB = new Set(['chest']);
function loadFile(pack, name) {
  const key = `${pack}/${name}`;
  if (!files.has(key)) {
    const url = pack === 'dungeon' ? `${BASE}/${pack}/${name}${GLB.has(name) ? '.glb' : '.gltf.glb'}` : `${BASE}/${pack}/${name}.gltf`;
    if (pack === 'furniture') atlasP ??= castleAtlas();
    files.set(key, Promise.all([loader.loadAsync(url), pack === 'furniture' ? atlasP : null]).then(([gltf, atlas]) => {
      const obj = gltf.scene;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.material = packMaterial(pack, atlas ?? o.material.map);
        o.castShadow = true;
        o.receiveShadow = true;
      });
      return obj;
    }));
  }
  return files.get(key);
}

const inRect = (u, v, r, eps = 0.5) => u * 1024 >= r[0] - eps && u * 1024 <= r[2] + eps && v * 1024 >= r[1] - eps && v * 1024 <= r[3] + eps;

// move every UV inside swatch `from` onto swatch `to` (keeps the position down the gradient)
function swapUV(geo, pairs) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    for (const [a, b] of pairs) {
      if (!inRect(u, v, a)) continue;
      const f = THREE.MathUtils.clamp((v * 1024 - a[1]) / (a[3] - a[1]), 0.02, 0.98);
      uv.setXY(i, ((b[0] + b[2]) / 2) / 1024, (b[1] + f * (b[3] - b[1])) / 1024);
      break;
    }
  }
  uv.needsUpdate = true;
}

// pull the triangles whose UVs all sit in `rect` out of a geometry: [rest, picked]
export function splitByRect(geo, rect) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const uv = g.attributes.uv;
  const keep = [];
  const pick = [];
  for (let t = 0; t < uv.count; t += 3) {
    const all = [0, 1, 2].every((k) => inRect(uv.getX(t + k), uv.getY(t + k), rect, 2));
    (all ? pick : keep).push(t);
  }
  const sub = (tris) => {
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const n = attr.itemSize;
      const arr = new Float32Array(tris.length * 3 * n);
      tris.forEach((t, j) => {
        for (let k = 0; k < 3 * n; k++) arr[j * 3 * n + k] = attr.array[t * n + k];
      });
      out.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    return out;
  };
  return [sub(keep), pick.length ? sub(pick) : null];
}

// A KayKit model, ready to place. opts:
//   swap: { fromSwatch: toSwatch } — recolour (names from SWATCH[pack])
//   glow: swatch name — those triangles become their own mesh (obj.userData.glow) with a
//         clone of the pack material (flames, lantern glass)
export async function kaykit(pack, name, { swap = null, glow = null } = {}) {
  const src = await loadFile(pack, name);
  const obj = src.clone(true);
  const S = SWATCH[pack] ?? {};
  if (swap) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry = o.geometry.clone();
      swapUV(o.geometry, Object.entries(swap).map(([a, b]) => [S[a] ?? a, S[b] ?? b]));
    });
  }
  if (glow) {
    const meshes = [];
    obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const base = Array.isArray(meshes[0].material) ? meshes[0].material[0] : meshes[0].material;
    const mat = base.clone();
    mat.name = `${mat.name}_glow`;
    for (const o of meshes) {
      const [rest, picked] = splitByRect(o.geometry, S[glow] ?? glow);
      if (!picked) continue;
      o.geometry = rest;
      const m = new THREE.Mesh(picked, mat);
      m.castShadow = false;
      m.receiveShadow = false;
      m.name = `${o.name}_glow`;
      o.add(m);
      obj.userData.glow = m;
    }
  }
  obj.name = name;
  return obj;
}
