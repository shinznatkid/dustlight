import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Low-poly toolkit for the pottery room: the palette, a few flat-shaded shared
// materials, lathe-turned pots, and a "bucket" that merges many small painted
// pieces into one mesh per material (a shelf of 12 pots = 1-2 draw calls).
//
// Every piece carries its colour as a vertex colour, so one material serves a
// whole shelf and the look stays flat: one colour per facet, no textures.

// sRGB hex; flat, warm and saturated — the look comes from the objects' own colours
export const PAL = {
  // shell
  wall: '#f4caa1', // warm apricot plaster
  wainscot: '#8fb07a', // sage boards
  rail: '#f3e7d2',
  floor: '#d99256', // honey planks
  floorDark: '#b8733f',
  slab: '#a45f38',
  frame: '#3f8c8c', // teal window frame
  beam: '#7a4a2e',
  // wood
  wood: '#d8975c',
  woodDark: '#a4643a',
  woodPale: '#e9bf86',
  // clay & glazes
  terracotta: '#c8633a',
  clay: '#dc8a52', // clay orange
  wetClay: '#9a5a3c',
  greyClay: '#b39c86',
  peach: '#f2b48a',
  cream: '#f4e6cb',
  oat: '#e5d0a8',
  sage: '#9dbb82',
  sageDeep: '#6f9a5e',
  teal: '#2c918b',
  cobalt: '#2f5fae',
  mustard: '#e3a83a',
  rust: '#b9472d',
  plum: '#8e4a5e',
  greenware: '#d8cdbd', // unfired, bone dry
  bisque: '#f0c7a6', // fired once, unglazed
  leaf: '#6fae4f',
  leafDark: '#4f8f45',
  canvas: '#efe2c6',
  metal: '#6d7b78',
};
export const col = (hex) => new THREE.Color(hex);

// flat-shaded standard materials (lit by sun, shadows and the probe GI)
export const MAT = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 }),
  gloss: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.34, metalness: 0 }),
};

// ---- painting & merging --------------------------------------------------------

// non-indexed copy with only position + normal + a flat colour (mergeable with any other)
export function paint(geo, hex, jitter = 0, rnd = Math.random) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(hex);
  if (jitter) c.offsetHSL((rnd() - 0.5) * jitter * 0.1, (rnd() - 0.5) * jitter * 0.3, (rnd() - 0.5) * jitter);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.morphAttributes = {};
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
// matrix from position [x,y,z], rotation [rx,ry,rz] and scale (number or [sx,sy,sz])
export function mtx(p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(...s);
  return _m.clone().compose(_p.set(...p), _q, _s);
}

// collects painted pieces per material, then builds one mesh per material
export class Bucket {
  constructor() {
    this.parts = { matte: [], gloss: [] };
  }

  // geo is consumed (painted copy transformed by m)
  add(geo, hex, { m = null, mat = 'matte', jitter = 0, rnd } = {}) {
    const g = paint(geo, hex, jitter, rnd);
    if (m) g.applyMatrix4(m);
    this.parts[mat].push(g);
    return this;
  }

  // a list of already painted geometries (from pot()) under matrix m
  addPainted(list, m = null) {
    for (const { geo, mat } of list) {
      const g = geo.clone();
      if (m) g.applyMatrix4(m);
      this.parts[mat].push(g);
    }
    return this;
  }

  // how many pieces each material has so far (build() then says where each one's
  // vertices went: see `ranges`)
  mark() {
    return { matte: this.parts.matte.length, gloss: this.parts.gloss.length };
  }

  // ranges[mat][i] = [first vertex, vertex count] of piece i in that material's merged
  // mesh (filled by build(); every painted piece is non-indexed, so they merge in order) —
  // for recolouring one thing of a merged mesh later (a pot drying on its board)
  build({ name = 'bucket', cast = true, receive = true } = {}) {
    const group = new THREE.Group();
    group.name = name;
    this.ranges = {};
    for (const [k, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      let at = 0;
      this.ranges[k] = list.map((g) => {
        const r = [at, g.attributes.position.count];
        at += r[1];
        return r;
      });
      const geo = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(geo, MAT[k]);
      mesh.name = `${name}:${k}`;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      group.add(mesh);
    }
    return group;
  }
}

// ---- lathe pots ------------------------------------------------------------------

// outer silhouettes: [t = height fraction, s = radius fraction]
const SHAPES = {
  vase: [[0, 0.55], [0.06, 0.66], [0.32, 1], [0.58, 0.82], [0.76, 0.42], [0.9, 0.4], [1, 0.56]],
  jar: [[0, 0.62], [0.1, 0.84], [0.42, 1], [0.76, 0.86], [0.9, 0.72], [1, 0.76]],
  bowl: [[0, 0.46], [0.14, 0.56], [0.55, 0.88], [1, 1]],
  plate: [[0, 0.55], [0.4, 0.62], [0.7, 0.95], [1, 1]],
  mug: [[0, 0.88], [0.06, 1], [1, 1]],
  cup: [[0, 0.62], [0.2, 0.8], [1, 1]],
  planter: [[0, 0.72], [0.78, 0.94], [0.78, 1.06], [1, 1.06]],
  bottle: [[0, 0.8], [0.45, 1], [0.6, 0.72], [0.7, 0.3], [0.94, 0.26], [1, 0.34]],
  pitcher: [[0, 0.7], [0.35, 1], [0.72, 0.74], [0.88, 0.72], [1, 0.88]],
  urn: [[0, 0.5], [0.08, 0.6], [0.45, 1], [0.8, 0.72], [0.9, 0.6], [1, 0.7]],
  bucket: [[0, 0.82], [1, 1]],
  thrown: [[0, 1.05], [0.15, 1], [0.7, 0.86], [0.88, 0.8], [1, 0.9]], // a cylinder mid-throw
  pan: [[0, 0.9], [0.2, 0.97], [1, 1]], // the wheel's splash pan
};
// shapes you can see into (inner wall goes to the bottom); the rest get a shallow cap
const OPEN = new Set(['bowl', 'plate', 'mug', 'cup', 'planter', 'bucket', 'thrown', 'jar', 'pitcher', 'pan']);

// One pot as painted geometries [{ geo, mat }], standing on y = 0, centred on the axis.
//   shape: key of SHAPES · h, r: height and max radius (m)
//   body: outer colour · glaze: colour above the dip line (null = body all over)
//   dip: height fraction where the glaze stops (0 = glazed to the foot)
//   inside: inner colour (default: glaze ?? body) · glossy: glazed parts shine
//   seg: radial segments (low = faceted) · handle: add a loop handle
export function pot({ shape = 'vase', h = 0.3, r = 0.1, body = PAL.terracotta, glaze = null, dip = 0.25, inside = null, glossy = true, seg = 10, handle = false, spout = false, rim = null }) {
  const S = SHAPES[shape] ?? SHAPES.vase;
  const th = Math.min(0.012, r * 0.12); // wall thickness
  const open = OPEN.has(shape);
  const outer = [[0, 0], ...S.map(([t, s]) => [Math.max(0.001, s * r), t * h])];
  const top = outer[outer.length - 1];
  const inner = [];
  inner.push([Math.max(0.001, top[0] - th), h]);
  if (open) {
    for (let i = S.length - 2; i >= 0; i--) {
      const [t, s] = S[i];
      const y = Math.max(th * 1.5, t * h);
      inner.push([Math.max(0.001, s * r - th), y]);
    }
    inner.push([0.001, th * 1.5]);
  } else {
    inner.push([Math.max(0.001, top[0] - th), h * 0.94], [0.001, h * 0.92]);
  }
  const glazeCol = glaze ?? body;
  const insideCol = inside ?? glazeCol;
  const out = [];
  const lathe = (pts, hex, mat) => {
    if (pts.length < 2) return;
    const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
    out.push({ geo: paint(g, hex), mat });
  };
  const gm = glossy ? 'gloss' : 'matte';
  if (glaze && dip > 0) {
    // split the outer wall at the dip line: raw foot below (matte), glaze above
    const yd = dip * h;
    const below = [];
    const above = [];
    for (let i = 0; i < outer.length; i++) {
      const [x, y] = outer[i];
      if (y <= yd) below.push([x, y]);
      if (i > 0 && outer[i - 1][1] < yd && y > yd) {
        const [x0, y0] = outer[i - 1];
        const k = (yd - y0) / (y - y0);
        const xd = x0 + (x - x0) * k;
        below.push([xd, yd]);
        above.push([xd, yd]);
      }
      if (y > yd) above.push([x, y]);
    }
    lathe(below, body, 'matte');
    lathe([...above, ...inner], glazeCol, gm);
  } else {
    lathe(outer, glaze ? glazeCol : body, glaze ? gm : 'matte');
    lathe([top, ...inner], insideCol, glaze ? gm : 'matte');
  }
  if (rim) {
    // a contrasting band at the lip (a second glaze, or a painted line)
    const g = new THREE.CylinderGeometry(top[0] + 0.002, top[0] + 0.002, Math.max(0.008, h * 0.06), seg, 1, true);
    g.translate(0, h - h * 0.03, 0);
    out.push({ geo: paint(g, rim), mat: gm });
  }
  if (handle) {
    const hr = h * 0.26;
    const g = new THREE.TorusGeometry(hr, Math.max(0.006, r * 0.09), 4, 7, Math.PI * 1.15);
    g.rotateZ(-Math.PI * 0.575);
    g.translate(r * 0.92, h * 0.55, 0);
    out.push({ geo: paint(g, glazeCol), mat: glaze ? gm : 'matte' });
  }
  if (spout) {
    const g = new THREE.ConeGeometry(r * 0.22, r * 0.5, 4, 1, true);
    g.rotateZ(Math.PI / 2 + 0.5);
    g.translate(-top[0] - r * 0.12, h * 0.95, 0);
    out.push({ geo: paint(g, glazeCol), mat: glaze ? gm : 'matte' });
  }
  return out;
}

// seeded random (mulberry32) so layouts are stable between reloads
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a random pot from a recipe list, for filling shelves
const GLAZES = [PAL.teal, PAL.cobalt, PAL.cream, PAL.sage, PAL.mustard, PAL.rust, PAL.peach, PAL.oat, PAL.plum, PAL.terracotta];
export function randomPot(rnd, { maxH = 0.34, kinds = null, glazes = GLAZES, body = null } = {}) {
  const kind = kinds ? kinds[Math.floor(rnd() * kinds.length)] : ['vase', 'jar', 'bowl', 'mug', 'bottle', 'pitcher', 'cup', 'urn', 'planter'][Math.floor(rnd() * 9)];
  const dims = {
    vase: [0.22, 0.32, 0.07, 0.1], jar: [0.14, 0.24, 0.07, 0.1], bowl: [0.07, 0.1, 0.1, 0.14],
    mug: [0.09, 0.11, 0.04, 0.045], bottle: [0.2, 0.3, 0.05, 0.07], pitcher: [0.18, 0.26, 0.06, 0.08],
    cup: [0.07, 0.09, 0.04, 0.05], urn: [0.26, 0.34, 0.09, 0.12], planter: [0.12, 0.18, 0.07, 0.1],
    plate: [0.03, 0.04, 0.12, 0.15], bucket: [0.2, 0.28, 0.1, 0.12],
  }[kind];
  const h = Math.min(maxH, dims[0] + rnd() * (dims[1] - dims[0]));
  const r = dims[2] + rnd() * (dims[3] - dims[2]);
  const glaze = glazes[Math.floor(rnd() * glazes.length)];
  const clayBody = body ?? (rnd() < 0.6 ? PAL.terracotta : PAL.oat);
  const plain = glaze === PAL.terracotta;
  return {
    kind,
    h,
    r,
    parts: pot({
      shape: kind,
      h,
      r,
      body: clayBody,
      glaze: plain ? null : glaze,
      dip: kind === 'bowl' || kind === 'plate' ? 0.12 : 0.1 + rnd() * 0.3,
      handle: kind === 'mug' || kind === 'pitcher',
      spout: kind === 'pitcher',
      rim: !plain && rnd() < 0.25 ? GLAZES[Math.floor(rnd() * 4)] : null,
      seg: kind === 'mug' || kind === 'cup' ? 8 : 10,
    }),
  };
}
