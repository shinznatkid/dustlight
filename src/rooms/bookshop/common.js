import * as THREE from 'three';

// Shared helpers of the bookshop room: its own texture loader (assets live under
// public/assets/rooms/bookshop/, fetched by tools/fetch_room_bookshop.py) and a
// batcher that bakes the whole static shell into one mesh per material — the
// shelving alone is ~150 boxes, and every draw call is paid again by each GI
// probe capture (5 probes x 6 faces per frame while the lighting settles).

export const BASE = 'assets/rooms/bookshop/';

const tl = new THREE.TextureLoader();
// a map's file: WebP in a release build (vite.config.js), normal maps JPEG (tools/optimize_assets.mjs)
const EXT = import.meta.env.TEXTURE_EXT ?? 'jpg';
const file = (map) => `${map}.${map === 'nor' ? 'jpg' : EXT}`;
const texCache = new Map();
const pending = [];
// resolves once every texture (incl. the canvas-processed ones) is in memory
export const texturesReady = () => Promise.all(pending);
export function track(promise) {
  pending.push(promise);
  return promise;
}

// one texture per map; tiling is baked into the UVs (Batch uses metres / size),
// so the same texture serves boxes of every scale without clones
export function tex(name, map, { srgb = false } = {}) {
  const key = `${name}/${map}`;
  let t = texCache.get(key);
  if (!t) {
    let done;
    track(new Promise((r) => { done = r; }));
    t = tl.load(`${BASE}textures/${name}/${file(map)}`, done, undefined, done);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return t;
}

// grayscale copy of a diffuse map normalised to mean ~0.92 (+-amount): paint over
// wood or plaster keeps the material's grain and blotches under any colour.
// The canvas is attached only once filled (WebGL2 storage is immutable: a first
// upload of an empty 300x150 canvas would stay black forever — lighting-notes).
export function detailMap(name, amount = 0.6, clampTo = 0.1) {
  const key = `detail:${name}:${amount}:${clampTo}`;
  if (texCache.has(key)) return texCache.get(key);
  const t = new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  const img = new Image();
  let done;
  track(new Promise((r) => { done = r; }));
  img.onerror = done;
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    const mean = sum / (px.length / 4);
    for (let i = 0; i < px.length; i += 4) {
      const l = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / mean;
      const v = Math.round(235 * THREE.MathUtils.clamp(1 + (l - 1) * amount, 1 - clampTo, 1 + clampTo));
      px[i] = px[i + 1] = px[i + 2] = Math.min(255, v);
    }
    g.putImageData(d, 0, 0);
    t.image = c;
    t.needsUpdate = true;
    done();
  };
  img.src = `${BASE}textures/${name}/${file('diff')}`;
  return t;
}

// a canvas texture made once the canvas is drawn (see detailMap)
export function canvasTexture(canvas, { srgb = true, flipY = true, repeat = false } = {}) {
  const t = new THREE.Texture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.flipY = flipY;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// deterministic random
export function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const B3 = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
export { B3 };

// ---- Batch: axis-aligned boxes (optionally transformed) collected per material,
// built into one mesh per material. UVs are world metres / size (size = number or
// [u, v]); `grain: 'v'` swaps u and v (wood grain up a post instead of along it).
// faces: [+x, -x, +y, -y, +z, -z]; `skip` lists faces never seen (against a wall).
const FACES = [
  { n: [1, 0, 0], u: 2, v: 1 },
  { n: [-1, 0, 0], u: 2, v: 1 },
  { n: [0, 1, 0], u: 0, v: 2 },
  { n: [0, -1, 0], u: 0, v: 2 },
  { n: [0, 0, 1], u: 0, v: 1 },
  { n: [0, 0, -1], u: 0, v: 1 },
];

export class Batch {
  constructor() {
    this.parts = new Map();
  }

  _get(mat) {
    let a = this.parts.get(mat);
    if (!a) this.parts.set(mat, (a = { p: [], n: [], uv: [], i: [] }));
    return a;
  }

  box(x0, x1, y0, y1, z0, z1, mat, { size = 1, grain = 'u', skip = [], matrix = null, uvOff = [0, 0] } = {}) {
    const lo = [x0, y0, z0];
    const hi = [x1, y1, z1];
    const [su, sv] = Array.isArray(size) ? size : [size, size];
    const v3 = new THREE.Vector3();
    const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    FACES.forEach((f, fi) => {
      if (skip.includes(fi)) return;
      const m = Array.isArray(mat) ? mat[fi] : mat;
      if (!m) return;
      const a = this._get(m);
      const ax = f.n.findIndex((c) => c !== 0);
      const side = f.n[ax] > 0 ? hi[ax] : lo[ax];
      const base = a.p.length / 3;
      // corners in (u, v) order, wound counter-clockwise seen from outside
      const cu = [lo[f.u], hi[f.u], hi[f.u], lo[f.u]];
      const cv = [lo[f.v], lo[f.v], hi[f.v], hi[f.v]];
      const nrm = new THREE.Vector3(...f.n);
      if (nm) nrm.applyMatrix3(nm).normalize();
      for (let k = 0; k < 4; k++) {
        const p = [0, 0, 0];
        p[ax] = side;
        p[f.u] = cu[k];
        p[f.v] = cv[k];
        v3.set(...p);
        if (matrix) v3.applyMatrix4(matrix);
        a.p.push(v3.x, v3.y, v3.z);
        a.n.push(nrm.x, nrm.y, nrm.z);
        let u = cu[k] / su + uvOff[0];
        let v = cv[k] / sv + uvOff[1];
        if (grain === 'v') [u, v] = [cv[k] / sv + uvOff[0], cu[k] / su + uvOff[1]];
        a.uv.push(u, v);
      }
      // winding: the (u, v) axes form a right- or left-handed frame with the normal
      const cross = new THREE.Vector3().crossVectors(
        new THREE.Vector3().setComponent(f.u, 1),
        new THREE.Vector3().setComponent(f.v, 1),
      ).dot(new THREE.Vector3(...f.n));
      if (cross > 0) a.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else a.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
    });
  }

  // any BufferGeometry (non-indexed or indexed) with position/normal/uv
  geometry(g, mat, matrix = null) {
    const a = this._get(mat);
    const base = a.p.length / 3;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const v3 = new THREE.Vector3();
    const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    for (let k = 0; k < pos.count; k++) {
      v3.fromBufferAttribute(pos, k);
      if (matrix) v3.applyMatrix4(matrix);
      a.p.push(v3.x, v3.y, v3.z);
      v3.fromBufferAttribute(nor, k);
      if (nm) v3.applyMatrix3(nm).normalize();
      a.n.push(v3.x, v3.y, v3.z);
      a.uv.push(uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0);
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) a.i.push(base + g.index.getX(k));
    else for (let k = 0; k < pos.count; k++) a.i.push(base + k);
  }

  build(parent, { cast = true, receive = true, name = 'batch' } = {}) {
    const meshes = [];
    for (const [mat, a] of this.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(a.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
      g.setIndex(a.i);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.name = `${name}:${mat.name || 'mat'}`;
      m.castShadow = cast;
      m.receiveShadow = receive;
      parent.add(m);
      meshes.push(m);
    }
    this.parts.clear();
    return meshes;
  }
}
