import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { mulberry } from '../../atmos.js';
import { flameMaterial, skyCard, skyDome, ceilingCaster } from '../kit.js';
import { SKY_FRAG } from './shaders.js';
import { ashlar, rugTexture, pennantTexture, fabricTexture } from './art.js';
import { buildStainedGlass, lancetPath } from './glass.js';

// The castle room's shell: the solar at the top of a tower. Thick stone walls (back z = Z0,
// left x = X0) — limewashed inside over dressed blocks, honey sandstone on their tops, round
// the openings and at the cut — crenellations along the top, a flagstone floor on a block
// plinth, a big hooded hearth in the back wall, and two pointed windows in the left wall: a
// stained-glass lancet (glass.js: its coloured sunlight) and a leaded window with a
// cushioned seat in its deep embrasure. Open towards the camera (+x, +z) like the other
// rooms, with the same GI helpers (../kit.js): a probe-only sky dome and an invisible
// shadow-casting ceiling (docs/lighting-notes.md).

export const CASTLE = { X0: -3.1, X1: 3.1, Z0: -2.5, Z1: 2.5, H: 3.2, T: 0.45 };
const SPRING = Math.sqrt(3) / 2; // an equilateral pointed arch rises 0.866 of its span
const win = (o) => ({ ...o, ys: o.yA - o.w * SPRING });
export const WINDOWS = [
  win({ id: 'stained', zc: -1.2, w: 0.84, y0: 0.62, yA: 2.3 }),
  win({ id: 'seat', zc: 1.05, w: 1.1, y0: 0.52, yA: 2.62 }),
];
export const GLASS_X = CASTLE.X0 - CASTLE.T * 0.5; // the glass stands halfway through the wall
// the hearth: x of its middle · half the opening · the jambs (width, depth) · the lintel · the
// mantel ledge (top) · the hood (bottom → top of its slope, depth there) · the hearthstone
export const FIRE = {
  x: 0.15, ow: 0.62, oh: 1.3, jw: 0.36, jd: 0.55, lintel: 1.5, mantel: 1.57, mhw: 1.06, md: 0.82,
  hood: { y1: 2.1, d0: 0.62, d1: 0.42, hw0: 1.0, hw1: 0.72 }, hearth: { hw: 1.14, d: 1.0, h: 0.045 },
};
export const RUG = { x: 1.42, z: 1.15, w: 2.3, d: 1.7 };

const col = (hex) => new THREE.Color(hex);
export const PAL = {
  limewash: col('#f4e3c3'),
  stone: col('#e0b27a'), // dressed sandstone (tops, surrounds, the hood)
  stones: ['#d9a86c', '#e6ba82', '#cf9a60', '#e9c38e', '#d4a26a', '#c99258'].map(col),
  flags: ['#c79063', '#b98258', '#d29c6c', '#bf8a5e', '#ae7a52', '#cc9868'].map(col),
  grout: col('#6e5642'),
  soot: col('#2a211d'),
  iron: col('#3a3432'),
  cushion: '#c8413a',
};

// ---- small geometry helpers ---------------------------------------------------------------------
function boxGeo(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
function rbox(sx, sy, sz, r, seg = 2) {
  return new RoundedBoxGeometry(sx, sy, sz, seg, Math.min(r, sx / 2, sy / 2, sz / 2) * 0.999);
}
function rboxAt(x0, x1, y0, y1, z0, z1, r = 0.03) {
  const g = rbox(x1 - x0, y1 - y0, z1 - z0, r);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
function tint(g, c) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// merged static meshes: one draw call per material (vertex colours for the variation)
function merger() {
  const parts = new Map();
  return {
    add(g, mat, c = null) {
      if (c) tint(g, c);
      if (!parts.has(mat)) parts.set(mat, []);
      parts.get(mat).push(g.index ? g.toNonIndexed() : g);
    },
    build(root, name) {
      for (const [mat, gs] of parts) {
        for (const g of gs) {
          if (mat.vertexColors && !g.attributes.color) tint(g, new THREE.Color(1, 1, 1));
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          if (!g.attributes.normal) g.computeVertexNormals();
        }
        const m = new THREE.Mesh(mergeGeometries(gs), mat);
        m.name = `${name}:${mat.name}`;
        m.castShadow = true;
        m.receiveShadow = true;
        root.add(m);
      }
      parts.clear();
    },
  };
}
// planar UVs in metres from the dominant normal axis (textures tile at real size)
function worldUV(g) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else if (ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}

// a pointed-arch outline as a THREE.Path in (along, y) — `along` = the wall's own horizontal
function lancetShape(path, a, { w, y0, ys }) {
  path.moveTo(a - w / 2, y0);
  path.lineTo(a - w / 2, ys);
  path.absarc(a + w / 2, ys, w, Math.PI, Math.PI * 2 / 3, true);
  path.absarc(a - w / 2, ys, w, Math.PI / 3, 0, true);
  path.lineTo(a + w / 2, y0);
  path.closePath?.();
  return path;
}

export function buildCastle(scene) {
  const { X0, X1, Z0, Z1, H, T } = CASTLE;
  const root = new THREE.Group();
  root.name = 'castle';
  scene.add(root);
  const rnd = mulberry(31);
  const A = ashlar();
  const sun = scene.children.find((o) => o.isDirectionalLight);

  // ---- materials -------------------------------------------------------------------------------
  // the limewash over the dressed blocks: the level's paint mask (walls.js) takes the colour
  const paint = new THREE.MeshStandardMaterial({
    name: 'limewash', color: PAL.limewash, map: A.detail, normalMap: A.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95,
  });
  const stoneTex = new THREE.MeshStandardMaterial({
    name: 'stone', color: PAL.stone, map: A.detail, normalMap: A.normal, normalScale: new THREE.Vector2(1, 1), roughness: 0.9,
  });
  const vc = (name, o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, name, ...o });
  const stoneVC = vc('stoneVC', { roughness: 0.88 });
  const floorVC = vc('flags', { roughness: 0.82 }); // (the flags alone: the level puts dirt on them)
  const groutMat = new THREE.MeshStandardMaterial({ name: 'grout', color: PAL.grout, roughness: 1 });
  const sootMat = new THREE.MeshStandardMaterial({ name: 'soot', color: PAL.soot, roughness: 1 });
  const ironMat = new THREE.MeshStandardMaterial({ name: 'iron', color: PAL.iron, roughness: 0.55, metalness: 0.5 });
  const M = merger();

  // ---- the two walls: extruded outlines with the openings cut through ----------------------------
  // caps = the limewashed faces, sides = stone (the tops, the cut ends, the window reveals)
  const ext = (shape) => new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 18 });
  {
    // left wall: shape (z, y), extruded out through the wall (−x)
    const s = new THREE.Shape();
    s.moveTo(Z0 - T, 0);
    s.lineTo(Z1, 0);
    s.lineTo(Z1, H);
    s.lineTo(Z0 - T, H);
    s.closePath();
    for (const w of WINDOWS) {
      // (the shape's x is world z here, and the room sees it mirrored: s = zc − z)
      s.holes.push(lancetShape(new THREE.Path(), w.zc, w));
    }
    const g = ext(s);
    g.rotateY(-Math.PI / 2);
    g.translate(X0, 0, 0);
    const m = new THREE.Mesh(g, [paint, stoneTex]);
    m.name = 'wall-left';
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  const fx = FIRE.x;
  {
    // back wall: shape (x, y), notched at the bottom for the hearth's opening, extruded to −z
    const s = new THREE.Shape();
    s.moveTo(X0, 0);
    s.lineTo(fx - FIRE.ow, 0);
    s.lineTo(fx - FIRE.ow, FIRE.oh);
    s.lineTo(fx + FIRE.ow, FIRE.oh);
    s.lineTo(fx + FIRE.ow, 0);
    s.lineTo(X1, 0);
    s.lineTo(X1, H);
    s.lineTo(X0, H);
    s.closePath();
    const g = ext(s);
    g.translate(0, 0, Z0 - T);
    const m = new THREE.Mesh(g, [paint, stoneTex]);
    m.name = 'wall-back';
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }

  // ---- crenellations along the tops, toothing down the cut ends ----------------------------------
  const stoneCol = () => PAL.stones[Math.floor(rnd() * PAL.stones.length)].clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
  {
    const MER = 0.5;
    const GAP = 0.32;
    const mh = 0.36;
    const merlon = (x0, x1, z0, z1) => M.add(rboxAt(x0, x1, H - 0.02, H + mh, z0, z1, 0.05), stoneVC, stoneCol());
    // a coping course along the tops, then the merlons on it
    M.add(rboxAt(X0 - T - 0.03, X0 + 0.03, H - 0.06, H + 0.02, Z0 - T - 0.03, Z1 + 0.03, 0.02), stoneVC, PAL.stones[3]);
    M.add(rboxAt(X0, X1 + 0.03, H - 0.06, H + 0.02, Z0 - T - 0.03, Z0 + 0.03, 0.02), stoneVC, PAL.stones[3]);
    merlon(X0 - T - 0.02, X0 + 0.02, Z0 - T - 0.02, Z0 - T + MER);
    for (let z = Z0 - T + MER + GAP; z < Z1 - 0.1; z += MER + GAP) merlon(X0 - T - 0.02, X0 + 0.02, z, Math.min(z + MER, Z1 + 0.02));
    for (let x = X0 + GAP; x < X1 - 0.1; x += MER + GAP) merlon(x, Math.min(x + MER, X1 + 0.02), Z0 - T - 0.02, Z0 + 0.02);
    // toothing: every other course of blocks stands proud of the cut ends
    const ch = 0.3;
    for (let k = 0, y = 0; y < H - 0.1; k++, y += ch) {
      if (k % 2) continue;
      const y1 = Math.min(H - 0.06, y + ch - 0.015);
      M.add(rboxAt(X0 - T + 0.02, X0 - 0.02, y + 0.01, y1, Z1 - 0.02, Z1 + 0.16, 0.03), stoneVC, stoneCol());
      M.add(rboxAt(X1 - 0.02, X1 + 0.16, y + 0.01, y1, Z0 - T + 0.02, Z0 - 0.02, 0.03), stoneVC, stoneCol());
    }
  }

  // ---- the floor: big flagstones on a block plinth ---------------------------------------------------
  {
    const x0 = X0;
    const x1 = X1 + 0.1;
    let z = Z0;
    while (z < Z1 + 0.1 - 0.05) {
      const rw = Math.min(0.5 + rnd() * 0.22, Z1 + 0.1 - z);
      let x = x0 - rnd() * 0.5;
      while (x < x1) {
        const len = 0.55 + rnd() * 0.45;
        const a = Math.max(x0, x);
        const b = Math.min(x1, x + len);
        if (b - a > 0.08) {
          const g = rbox(b - a - 0.028, 0.08, rw - 0.028, 0.025);
          g.translate((a + b) / 2, -0.04 + (rnd() - 0.5) * 0.006, z + rw / 2);
          M.add(g, floorVC, PAL.flags[Math.floor(rnd() * PAL.flags.length)].clone().offsetHSL((rnd() - 0.5) * 0.015, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05));
        }
        x += len;
      }
      z += rw;
    }
    // the grout between them, and the slab under everything
    M.add(boxGeo(X0 - T, x1, -0.3, -0.03, Z0 - T, Z1 + 0.1), groutMat);
    // plinth: big blocks along the two open edges, a dark core behind them
    const edge = (fixed, a, b, alongZ) => {
      let s;
      let row = 0;
      for (const [y0, y1] of [[-0.3, -0.62], [-0.62, -0.92]]) {
        s = a - (row++ % 2) * 0.25;
        while (s < b - 0.08) {
          const len = Math.min(0.5 + rnd() * 0.35, b - s);
          const lo = Math.max(a, s);
          if (s + len - lo > 0.1) {
            const g = rbox(alongZ ? 0.2 : s + len - lo - 0.03, y0 - y1 - 0.03, alongZ ? s + len - lo - 0.03 : 0.2, 0.05);
            const cm = (lo + s + len) / 2;
            g.translate(alongZ ? fixed : cm, (y0 + y1) / 2, alongZ ? cm : fixed);
            M.add(g, stoneVC, stoneCol().multiplyScalar(0.94));
          }
          s += len;
        }
      }
    };
    M.add(boxGeo(X0 - T + 0.1, X1, -0.92, -0.3, Z0 - T + 0.1, Z1), groutMat);
    edge(Z1 + 0.02, X0 - T + 0.05, X1 + 0.12, false);
    edge(X1 + 0.02, Z0 - T + 0.05, Z1 - 0.08, true);
  }

  // ---- windows: dressed-stone surrounds, sills, the glass ----------------------------------------------
  const sillTops = [];
  for (const w of WINDOWS) {
    const za = w.zc - w.w / 2;
    const zb = w.zc + w.w / 2;
    const out0 = X0 - 0.005;
    const out1 = X0 + 0.04; // the surround stands a little proud of the limewash
    const R = 0.19; // ring width
    // jambs: quoins, long and short in turn
    for (const side of [-1, 1]) {
      let y = w.y0 - 0.02;
      let k = 0;
      while (y < w.ys - 0.05) {
        const hgt = Math.min(0.28 + (k % 2) * 0.06, w.ys - y);
        const deep = k % 2 ? R + 0.07 : R;
        const e = side < 0 ? za : zb;
        const g = rboxAt(out0, out1, y + 0.008, y + hgt - 0.008, side < 0 ? e - deep : e, side < 0 ? e : e + deep, 0.02);
        M.add(g, stoneVC, stoneCol());
        y += hgt;
        k++;
      }
    }
    // the arch: voussoirs round the two arcs, a keystone at the apex (the shape's own frame:
    // `a` along z, turned about x)
    const X = new THREE.Vector3(1, 0, 0);
    const vous = (cz, cy, ang0, ang1, n) => {
      for (let i = 0; i < n; i++) {
        const a = ang0 + ((i + 0.5) / n) * (ang1 - ang0);
        const len = (w.w * Math.abs(ang1 - ang0)) / n;
        const rMid = w.w + R / 2;
        const pz = cz + Math.cos(a) * rMid;
        const py = cy + Math.sin(a) * rMid;
        const radial = new THREE.Vector3(0, Math.sin(a), Math.cos(a));
        const tang = new THREE.Vector3().crossVectors(X, radial);
        const g = rbox(out1 - out0, R - 0.016, len * (1 + R / (2 * w.w)) - 0.016, 0.02);
        g.applyMatrix4(new THREE.Matrix4().makeBasis(X, radial, tang));
        g.translate((out0 + out1) / 2, py, pz);
        M.add(g, stoneVC, stoneCol());
      }
    };
    // left arc (centred on the far springing point, from the near one to the apex) …
    vous(zb, w.ys, Math.PI, Math.PI * 2 / 3, 4);
    vous(za, w.ys, Math.PI / 3, 0, 4);
    // … the key stone
    const key = rboxAt(out0, out1 + 0.015, w.yA - 0.05, w.yA + R + 0.03, w.zc - 0.11, w.zc + 0.11, 0.025);
    M.add(key, stoneVC, PAL.stones[3]);
    // the sill: a lip on the room side; the reveal's bottom is the deep sill itself
    M.add(rboxAt(X0 - 0.02, X0 + 0.08, w.y0 - 0.07, w.y0, za - 0.2, zb + 0.2, 0.02), stoneVC, PAL.stones[1]);
    sillTops.push({ w, top: w.y0, z0: za + 0.04, z1: zb - 0.04 });
  }
  // the stained glass (the twist's window) — glass.js
  const glass = buildStainedGlass(root, { sun, win: WINDOWS[0], x: GLASS_X });
  // the leaded window: diamond quarries in lead (an alpha-tested lattice: its shadow lands in
  // the patch of sun), a stone mullion up to the springing line
  {
    const w = WINDOWS[1];
    const h = w.yA - w.y0;
    const CW = 256;
    const CH = Math.round((CW * h) / w.w);
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, CW, CH);
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    const q = (0.14 / w.w) * CW; // quarry width
    for (let k = -30; k < 30; k++) {
      g.beginPath();
      g.moveTo(k * q, 0);
      g.lineTo(k * q + CH * 0.7, CH);
      g.moveTo(k * q, 0);
      g.lineTo(k * q - CH * 0.7, CH);
      g.stroke();
    }
    // the frame round the edge
    g.lineWidth = 8;
    g.beginPath();
    lancetPath(g, { w: w.w, y0: w.y0, ys: w.ys }, (s, t) => [(s + w.w / 2) / w.w * CW, (w.yA - t) / h * CH]);
    g.stroke();
    const alpha = new THREE.Texture(c);
    alpha.needsUpdate = true;
    const shape = new THREE.Shape();
    lancetShape(shape, 0, w);
    const geo = new THREE.ShapeGeometry(shape, 24);
    const uv = geo.attributes.uv;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w.w / 2) / w.w, (p.getY(i) - w.y0) / h);
    const lead = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: 'lead', color: 0x3a3632, roughness: 0.6, metalness: 0.4, alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide }));
    lead.rotation.y = Math.PI / 2;
    lead.position.set(GLASS_X - 0.004, 0, w.zc);
    lead.castShadow = true;
    lead.name = 'leaded-window';
    root.add(lead);
    M.add(rboxAt(GLASS_X - 0.05, GLASS_X + 0.05, w.y0, w.ys + 0.02, w.zc - 0.035, w.zc + 0.035, 0.015), stoneVC, PAL.stones[1]);
  }
  // the window seat: a long cushion in the leaded window's embrasure, two little pillows
  const cushionMat = new THREE.MeshStandardMaterial({ name: 'cushion', map: fabricTexture(PAL.cushion, 7), roughness: 1 });
  const pillowMat = new THREE.MeshStandardMaterial({ name: 'pillow', map: fabricTexture('#e8b43a', 9), roughness: 1 });
  const seat = WINDOWS[1];
  {
    const cz0 = seat.zc - seat.w / 2 + 0.02;
    const cz1 = seat.zc + seat.w / 2 - 0.02;
    const cu = new THREE.Mesh(rboxAt(GLASS_X + 0.02, X0 + 0.1, seat.y0, seat.y0 + 0.09, cz0, cz1, 0.04), cushionMat);
    const p1 = new THREE.Mesh(rbox(0.12, 0.2, 0.26, 0.06, 3), pillowMat);
    p1.position.set(X0 - 0.08, seat.y0 + 0.18, cz0 + 0.12);
    p1.rotation.set(0, 0.2, 0.25);
    const p2 = new THREE.Mesh(rbox(0.12, 0.18, 0.24, 0.06, 3), cushionMat);
    p2.position.set(X0 - 0.1, seat.y0 + 0.17, cz1 - 0.12);
    p2.rotation.set(0, -0.3, 0.2);
    for (const m of [cu, p1, p2]) {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
  }

  // ---- the hearth -----------------------------------------------------------------------------------------
  const { ow, oh, jw, jd } = FIRE;
  const fz = Z0 + jd; // the jambs' front
  {
    // firebox: soot all round inside, back into the wall's thickness
    M.add(boxGeo(fx - ow, fx + ow, 0, oh + 0.3, Z0 - T, Z0 - T + 0.04), sootMat);
    M.add(boxGeo(fx - ow, fx - ow + 0.03, 0, oh, Z0 - T, fz), sootMat);
    M.add(boxGeo(fx + ow - 0.03, fx + ow, 0, oh, Z0 - T, fz), sootMat);
    M.add(boxGeo(fx - ow, fx + ow, oh - 0.03, oh, Z0 - T, fz), sootMat);
    M.add(boxGeo(fx - ow, fx + ow, 0, 0.02, Z0 - T, fz), sootMat);
    // jambs: stacked blocks, a capital on each
    for (const sg of [-1, 1]) {
      const a = fx + sg * ow;
      const b = fx + sg * (ow + jw);
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      let y = 0;
      for (const hb of [0.44, 0.42, 0.32]) {
        M.add(rboxAt(lo + 0.005, hi - 0.005, y + 0.006, y + hb - 0.006, Z0, fz, 0.03), stoneVC, stoneCol());
        y += hb;
      }
      M.add(rboxAt(lo - 0.03, hi + 0.03, 1.18, oh + 0.01, Z0, fz + 0.035, 0.025), stoneVC, PAL.stones[3]);
    }
    // lintel, then the mantel ledge
    M.add(rboxAt(fx - FIRE.mhw + 0.06, fx + FIRE.mhw - 0.06, oh, FIRE.lintel, Z0, fz, 0.03), stoneVC, PAL.stones[1]);
    M.add(rboxAt(fx - FIRE.mhw, fx + FIRE.mhw, FIRE.lintel, FIRE.mantel, Z0, Z0 + FIRE.md, 0.025), stoneVC, PAL.stones[3]);
    // the hood: a sloping stone frustum, then the chimney breast straight up to the top
    const { y1, d0, d1, hw0, hw1 } = FIRE.hood;
    const y0 = FIRE.mantel;
    const hood = new THREE.BufferGeometry();
    const P = [
      [fx - hw0, y0, Z0], [fx + hw0, y0, Z0], [fx + hw0, y0, Z0 + d0], [fx - hw0, y0, Z0 + d0],
      [fx - hw1, y1, Z0], [fx + hw1, y1, Z0], [fx + hw1, y1, Z0 + d1], [fx - hw1, y1, Z0 + d1],
    ];
    const quad = (a, b, c, d) => [P[a], P[b], P[c], P[a], P[c], P[d]];
    const tri = [
      ...quad(3, 2, 6, 7), // front (slopes back)
      ...quad(0, 3, 7, 4), // left
      ...quad(2, 1, 5, 6), // right
      ...quad(7, 6, 5, 4), // top
    ];
    hood.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
    hood.computeVertexNormals();
    hood.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(tri.length * 2), 2));
    worldUV(hood);
    const hoodMesh = new THREE.Mesh(hood, stoneTex);
    const breast = new THREE.Mesh(worldUV(boxGeo(fx - hw1, fx + hw1, y1 - 0.01, H + 0.02, Z0 - 0.01, Z0 + d1)), stoneTex);
    for (const m of [hoodMesh, breast]) {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
    // a band of blocks where the hood meets the breast
    M.add(rboxAt(fx - hw1 - 0.03, fx + hw1 + 0.03, y1 - 0.02, y1 + 0.08, Z0, Z0 + d1 + 0.04, 0.02), stoneVC, PAL.stones[3]);
    // hearthstone
    const hs = FIRE.hearth;
    M.add(rboxAt(fx - hs.hw, fx + hs.hw, -0.02, hs.h, Z0, Z0 + hs.d, 0.02), stoneVC, col('#a98262'));
  }

  // ---- fire: logs on the fire-dogs, flame cards, the light ----------------------------------------------
  const fire = new THREE.Group();
  root.add(fire);
  const fireBark = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.9, emissive: 0xff5a1a, emissiveIntensity: 0, name: 'fireBark' });
  const fireLogGeo = new THREE.CylinderGeometry(0.07, 0.075, 0.78, 10);
  const fzBox = Z0 - T * 0.4; // the fire sits back in the wall's thickness
  for (const [x, y, z, ry, rz] of [[0, 0.16, 0.16, 0.1, Math.PI / 2], [0, 0.16, 0.0, -0.08, Math.PI / 2], [0.03, 0.28, 0.08, 0.45, Math.PI / 2 - 0.08]]) {
    const log = new THREE.Mesh(fireLogGeo, fireBark);
    log.position.set(fx + x, y, fzBox + z);
    log.rotation.set(0, ry, rz);
    log.castShadow = true;
    fire.add(log);
  }
  // fire-dogs: two iron andirons
  for (const sg of [-1, 1]) {
    M.add(boxGeo(fx + sg * 0.3 - 0.025, fx + sg * 0.3 + 0.025, 0, 0.09, fzBox - 0.2, fzBox + 0.36), ironMat);
    M.add(boxGeo(fx + sg * 0.3 - 0.025, fx + sg * 0.3 + 0.025, 0, 0.36, fzBox + 0.33, fzBox + 0.38), ironMat);
    const ball = new THREE.SphereGeometry(0.045, 12, 8);
    ball.translate(fx + sg * 0.3, 0.4, fzBox + 0.355);
    M.add(ball, ironMat);
  }
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const m = flameMaterial(i * 1.37);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.66), m);
    p.position.set(fx + (i - 2) * 0.08, 0.5, fzBox + 0.06 + (i % 2) * 0.06);
    p.rotation.y = (i - 2) * 0.35;
    p.layers.set(LAYER_MAIN_ONLY);
    fire.add(p);
    flames.push(m);
  }
  const fireLight = new THREE.PointLight(0xff8a3c, 0, 10, 2);
  fireLight.position.set(fx, 0.5, fzBox + 0.42);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.bias = -0.002;
  fireLight.shadow.radius = 3;
  fireLight.shadow.camera.near = 0.05;
  fire.add(fireLight);

  M.build(root, 'shell');

  // ---- the rug before the hearth (comes with the movers: the level shows it after the repairs) ----------
  const rug = new THREE.Group();
  rug.name = 'rug';
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(RUG.w, 0.016, RUG.d), [
      ...Array(2).fill(new THREE.MeshStandardMaterial({ color: 0x8a2a24, roughness: 1 })),
      new THREE.MeshStandardMaterial({ name: 'rug', map: rugTexture(), roughness: 1 }),
      ...Array(3).fill(new THREE.MeshStandardMaterial({ color: 0x8a2a24, roughness: 1 })),
    ]);
    top.position.set(RUG.x, 0.008, RUG.z);
    top.receiveShadow = true;
    rug.add(top);
    // fringes on the short ends
    const fringe = new THREE.MeshStandardMaterial({ color: 0xe8c47a, roughness: 1 });
    for (const sg of [-1, 1]) {
      for (let k = 0; k < 26; k++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, 0.018), fringe);
        f.position.set(RUG.x + sg * (RUG.w / 2 + 0.03), 0.004, RUG.z - RUG.d / 2 + 0.05 + (k / 25) * (RUG.d - 0.1));
        f.layers.set(LAYER_MAIN_ONLY);
        rug.add(f);
      }
    }
  }
  root.add(rug);

  // ---- a pennant on the corner merlon, and a few stones drifting off the cut -----------------------------
  const pennant = { mesh: null, base: null };
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.62, 8), ironMat);
    // (on the last merlon at the cut end of the left wall: the usual camera sees it whole)
    const px = X0 - T / 2;
    const pz = Z1 - 0.3;
    pole.position.set(px, H + 0.36 + 0.31, pz);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe8b43a, metalness: 0.6, roughness: 0.35 }));
    knob.position.set(px, H + 0.36 + 0.64, pz);
    const geo = new THREE.PlaneGeometry(0.7, 0.32, 14, 3);
    geo.translate(0.35, 0, 0);
    const p = geo.attributes.position;
    // a swallowtail: the free end narrows to a notch
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 0.7;
      p.setY(i, p.getY(i) * (1 - u * 0.55));
    }
    pennant.base = Float32Array.from(p.array);
    const pt = pennantTexture();
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: pt, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.15, emissiveMap: pt }));
    flag.position.set(px, H + 0.36 + 0.46, pz);
    flag.rotation.y = 0.5; // (streaming back over the wall, towards the camera's left)
    pennant.mesh = flag;
    for (const m of [pole, knob, flag]) {
      m.castShadow = true;
      m.layers.set(LAYER_MAIN_ONLY);
      root.add(m);
    }
  }
  const floaters = [];
  {
    const chunk = new THREE.MeshStandardMaterial({ color: PAL.stone, roughness: 0.9 });
    const spots = [
      [X0 - T - 0.2, H + 0.5, 1.7], [X0 - 0.3, H + 0.75, -0.4], [-1.6, H + 0.62, Z0 - T - 0.2],
      [1.3, H + 0.8, Z0 - 0.35], [X1 + 0.3, 2.4, Z0 - 0.2], [X1 + 0.28, 1.0, Z0 - T], [X0 - 0.1, 2.3, Z1 + 0.35], [X0 - T, 0.9, Z1 + 0.3],
    ];
    const blk = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
    spots.forEach((p, i) => {
      const m = new THREE.Mesh(blk, chunk);
      m.scale.set(0.16 + rnd() * 0.08, 0.1 + rnd() * 0.04, 0.12 + rnd() * 0.06);
      m.position.set(...p);
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      m.layers.set(LAYER_MAIN_ONLY);
      m.castShadow = true;
      m.userData.base = new THREE.Vector3(...p);
      m.userData.phase = i * 1.3;
      m.userData.spin = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.25);
      root.add(m);
      floaters.push(m);
    });
  }

  // ---- sky card behind the windows: the view from a tower (ends short of the wall's cut end) ------------
  const skyZ0 = Z0 - 0.3;
  const skyZ1 = WINDOWS[1].zc + WINDOWS[1].w / 2 + 0.45;
  // (its top stays under the battlements: from the usual camera it would show over the wall)
  const sky = skyCard({ frag: SKY_FRAG, width: skyZ1 - skyZ0, height: H - 0.35, position: [X0 - T - 0.25, (H - 0.35) / 2 + 0.05, (skyZ0 + skyZ1) / 2] });
  root.add(sky.mesh);

  // ---- invisible shadow-casting ceiling, capture-only sky dome (docs/lighting-notes.md) ----------------------
  root.add(ceilingCaster(X0, X1 + 0.3, H - 0.02, H + 0.06, Z0, Z1 + 0.3));
  const dome = skyDome();
  root.add(dome.mesh);

  // ---- what the furniture layer and the probes need to know ---------------------------------------------------
  const B = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  const hs = FIRE.hearth;
  const chimney = B(fx - FIRE.mhw, 0, Z0, fx + FIRE.mhw, H, Z0 + FIRE.hood.d0);
  const hearth = B(fx - hs.hw, 0, Z0, fx + hs.hw, H, Z0 + hs.d);
  const blockers = [chimney];
  const surfaces = [
    { name: 'mantel', box: B(fx - FIRE.mhw + 0.02, FIRE.mantel - 0.05, Z0 + FIRE.hood.d0 - 0.02, fx + FIRE.mhw - 0.02, FIRE.mantel, Z0 + FIRE.md - 0.01) },
    // the deep sill of the stained window, and the window seat's cushion
    { name: 'sill1', box: B(GLASS_X + 0.03, sillTops[0].top - 0.05, sillTops[0].z0, X0 + 0.06, sillTops[0].top, sillTops[0].z1) },
    { name: 'seat', box: B(GLASS_X + 0.04, seat.y0 + 0.04, seat.zc - seat.w / 2 + 0.24, X0 + 0.06, seat.y0 + 0.09, seat.zc + seat.w / 2 - 0.24) },
  ];
  const obstacles = [chimney, hearth];
  for (const w of WINDOWS) {
    obstacles.push(B(X0, w.y0 - 0.08, w.zc - w.w / 2 - 0.22, X0 + 0.1, w.y0 + 0.1, w.zc + w.w / 2 + 0.22)); // sill lip / seat
  }
  // pictures, banners and torches hang on: the left wall (off the windows and their
  // surrounds), the back wall either side of the hearth, the chimney breast over the hood
  const hang = [
    {
      name: 'left', axis: 'x', sign: 1, at: X0, u: 'z', min: Z0 + 0.03, max: Z1, y0: 0.3, top: H - 0.05, ry: Math.PI / 2,
      keepOut: WINDOWS.map((w) => ({ u0: w.zc - w.w / 2 - 0.3, u1: w.zc + w.w / 2 + 0.3, y0: 0, y1: H })),
    },
    { name: 'back', axis: 'z', sign: 1, at: Z0, u: 'x', min: X0 + 0.03, max: fx - FIRE.mhw - 0.04, y0: 0.3, top: H - 0.05, ry: 0 },
    { name: 'back2', axis: 'z', sign: 1, at: Z0, u: 'x', min: fx + FIRE.mhw + 0.04, max: X1, y0: 0.3, top: H - 0.05, ry: 0 },
    { name: 'chimney', axis: 'z', sign: 1, at: Z0 + FIRE.hood.d1, u: 'x', min: fx - FIRE.hood.hw1, max: fx + FIRE.hood.hw1, y0: FIRE.hood.y1 + 0.1, top: H - 0.05, ry: 0 },
  ];

  const state = { fireOn: 1, fireTarget: 1, fireBase: 12 };
  return {
    root,
    paint,
    sky: sky.material,
    dome: dome.material,
    fireLight,
    blockers,
    surfaces,
    hang,
    obstacles,
    fireplace: [chimney, hearth],
    rug,
    // for the level (src/levels/castle.js): the flagstones, the stone, the stained glass
    flags: floorVC,
    stone: stoneTex,
    glass,
    clickTargets: { fire: fire.children.filter((c) => c.isMesh && c.geometry === fireLogGeo) },
    setFire(on) {
      state.fireTarget = on ? 1 : 0;
    },
    get fireOn() {
      return state.fireTarget > 0.5;
    },
    update(dt, time, snap = false) {
      state.fireOn += (state.fireTarget - state.fireOn) * (snap ? 1 : Math.min(1, dt * 3));
      const flick = 0.82 + 0.1 * Math.sin(time * 13.1) + 0.06 * Math.sin(time * 23.7 + 1.3) + 0.05 * Math.sin(time * 5.3);
      fireLight.intensity = state.fireBase * state.fireOn * flick;
      fireBark.emissiveIntensity = 1.6 * state.fireOn * (0.8 + 0.2 * flick);
      for (const f of flames) {
        f.uniforms.uTime.value = time;
        f.uniforms.uOn.value = state.fireOn;
      }
      for (const m of floaters) {
        const b = m.userData.base;
        m.position.set(b.x, b.y + Math.sin(time * 0.6 + m.userData.phase) * 0.05, b.z);
        m.rotation.x += m.userData.spin.x * dt;
        m.rotation.y += m.userData.spin.y * dt;
      }
      // the pennant flutters (a travelling wave, stronger towards the free end)
      const p = pennant.mesh.geometry.attributes.position;
      const b0 = pennant.base;
      for (let i = 0; i < p.count; i++) {
        const u = b0[i * 3] / 0.7;
        p.setZ(i, Math.sin(time * 5 - u * 7) * 0.06 * u + Math.sin(time * 3.1 - u * 4) * 0.03 * u);
      }
      p.needsUpdate = true;
      glass.update(dt);
    },
    fireGI() {
      return state.fireBase * state.fireTarget * 0.85;
    },
  };
}
