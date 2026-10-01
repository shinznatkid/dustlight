import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { mulberry } from '../../atmos.js';
import { flameMaterial, skyCard, skyDome, ceilingCaster } from '../kit.js';
import { SKY_FRAG } from './shaders.js';
import { endGrainTexture, ginghamTexture, braidedRugTexture, mapleLeafTexture } from './art.js';

// The cabin's shell: honey log walls (back z = Z0, left x = X0) with cream chinking,
// wide plank floor on a stone plinth, a round-stone fireplace with a log mantel,
// two green-framed windows with gingham curtains. Open towards the camera (+x, +z)
// like level 1's room, with the same GI helpers (../kit.js): a probe-only sky dome
// and an invisible shadow-casting ceiling (see docs/lighting-notes.md).

export const CABIN = { X0: -3.1, X1: 3.1, Z0: -2.5, Z1: 2.5, H: 3.0, T: 0.28 };
export const LOG = { r: 0.115, p: 0.26 };
const LOG_FRONT = 0.07; // how far the logs stand proud of the wall plane, into the room
// left-wall logs sit at y = i·p, so openings go from gap to gap ((i + 0.5)·p)
export const WINDOWS = [
  { zc: -0.95, w: 1.2, y0: 2.5 * LOG.p, y1: 9.5 * LOG.p },
  { zc: 1.3, w: 1.0, y0: 2.5 * LOG.p, y1: 9.5 * LOG.p },
];
// fireplace: chimney breast centre x, half width, depth; firebox half width / height
export const RUG = { x: 0.75, z: -0.45, rx: 1.8, rz: 1.22 };
export const RUG2 = { x: -1.85, z: 1.4, r: 0.95 };
export const FIRE = { x: -0.75, hw: 1.0, d: 0.55, ow: 0.47, oh: 0.84, mantel: 1.36, hearth: 0.12, hd: 0.44, hhw: 1.18 };

const col = (hex) => new THREE.Color(hex);
const PAL = {
  bark: col('#eab26a'),
  chink: col('#f7e2bd'),
  plank: col('#c4804a'),
  slab: col('#9b5f35'),
  stone: ['#b9ada2', '#a89b90', '#c7bbb0', '#9d948d', '#b5a393', '#cdb9a2'].map(col),
  mortar: col('#8f857d'),
  soot: col('#2a211d'),
  frame: col('#6aa27a'),
  sill: col('#e8ad66'),
  mantel: col('#a8653a'),
};

// ---- small geometry helpers -----------------------------------------------------
function boxGeo(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
function rbox(sx, sy, sz, r, seg = 2) {
  return new RoundedBoxGeometry(sx, sy, sz, seg, Math.min(r, sx / 2, sy / 2, sz / 2) * 0.999);
}
// paint a geometry one colour (merged meshes use vertex colours)
function tint(g, c) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// merged static meshes: one draw call per material
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
          // mergeGeometries needs the same attributes everywhere
          if (mat.vertexColors && !g.attributes.color) tint(g, new THREE.Color(1, 1, 1));
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
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

export function buildCabin(scene) {
  const { X0, X1, Z0, Z1, H, T } = CABIN;
  const { r: LR, p: LP } = LOG;
  const root = new THREE.Group();
  root.name = 'cabin';
  scene.add(root);
  const rnd = mulberry(21);

  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const vc = (name, o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, name, ...o });
  const chinkMat = std(PAL.chink, { name: 'chink', roughness: 0.95 });
  const woodVC = vc('wood', { roughness: 0.7 });
  const floorVC = vc('floor', { roughness: 0.7 }); // (the planks alone: a level puts dirt on them)
  const stoneVC = vc('stone', { roughness: 0.92 });
  const mortarMat = std(PAL.mortar, { name: 'mortar', roughness: 1 });
  const sootMat = std(PAL.soot, { name: 'soot', roughness: 1 });
  const frameMat = std(PAL.frame, { name: 'frame', roughness: 0.55 });
  const M = merger();

  // ---- logs: one instanced mesh for every log of both walls ------------------------
  // (side = bark, caps = end grain with rings; instance colour = a little variation)
  const barkMat = std(PAL.bark, { name: 'bark', roughness: 0.75 });
  const grainMat = std(0xffffff, { name: 'grain', map: endGrainTexture(), roughness: 0.8 });
  const logGeo = new THREE.CylinderGeometry(LR, LR, 1, 20, 1);
  logGeo.rotateZ(Math.PI / 2); // axis along x; caps face ±x
  const logs = []; // { x, y, z, len, alongZ }
  const OVER = 0.2; // logs run this far past the corner and past the cut ends
  const backZ = Z0 - LR * 0.45;
  const leftX = X0 - LR * 0.45;
  for (let i = 0; i < 12; i++) {
    const y = 0.13 + i * LP;
    logs.push({ a: X0 - T - OVER, b: X1 + OVER * 0.6, y, c: backZ, alongZ: false });
  }
  for (let i = 0; i <= 12; i++) {
    const y = i * LP;
    const cut = WINDOWS.filter((w) => y > w.y0 && y < w.y1);
    let a = Z0 - T - OVER;
    for (const w of cut.sort((p, q) => p.zc - q.zc)) {
      logs.push({ a, b: w.zc - w.w / 2, y, c: leftX, alongZ: true });
      a = w.zc + w.w / 2;
    }
    logs.push({ a, b: Z1 + OVER * 0.6, y, c: leftX, alongZ: true });
  }
  const logMesh = new THREE.InstancedMesh(logGeo, [barkMat, grainMat, grainMat], logs.length);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tmpC = new THREE.Color();
  logs.forEach((l, i) => {
    const len = l.b - l.a;
    const mid = (l.a + l.b) / 2;
    const wob = (rnd() - 0.5) * 0.012;
    q.setFromEuler(new THREE.Euler(0, l.alongZ ? -Math.PI / 2 : 0, 0));
    const pos = l.alongZ ? new THREE.Vector3(l.c + wob, l.y, mid) : new THREE.Vector3(mid, l.y, l.c + wob);
    const s = 0.96 + rnd() * 0.08;
    mtx.compose(pos, q, new THREE.Vector3(len, s, s));
    logMesh.setMatrixAt(i, mtx);
    tmpC.setRGB(1, 0.93 + rnd() * 0.07, 0.86 + rnd() * 0.14).multiplyScalar(0.88 + rnd() * 0.12);
    logMesh.setColorAt(i, tmpC);
  });
  logMesh.castShadow = true;
  logMesh.receiveShadow = true;
  logMesh.name = 'logs';
  root.add(logMesh);

  // chinking (and the wall's real body): cream boxes behind the logs, recessed to
  // the logs' centre line so it shows as a stripe between them
  M.add(boxGeo(X0 - T, X1, 0, H + 0.08, Z0 - T, Z0), chinkMat);
  {
    const x0 = X0 - T;
    const x1 = X0;
    const ys = [WINDOWS[0].y0, WINDOWS[0].y1];
    M.add(boxGeo(x0, x1, 0, ys[0], Z0 - T, Z1), chinkMat);
    M.add(boxGeo(x0, x1, ys[1], H + 0.2, Z0 - T, Z1), chinkMat);
    const ws = [...WINDOWS].sort((a, b) => a.zc - b.zc);
    let a = Z0 - T;
    for (const w of ws) {
      M.add(boxGeo(x0, x1, ys[0], ys[1], a, w.zc - w.w / 2), chinkMat);
      a = w.zc + w.w / 2;
    }
    M.add(boxGeo(x0, x1, ys[0], ys[1], a, Z1), chinkMat);
  }

  // ---- floor: wide honey planks on a slab, the slab on a stone plinth ----------------
  {
    const PW = 0.27;
    const rows = Math.ceil((Z1 + 0.06 - Z0) / PW);
    for (let j = 0; j < rows; j++) {
      const z0 = Z0 + j * PW;
      const z1 = Math.min(Z1 + 0.06, z0 + PW);
      let x = X0 - 0.02 - rnd() * 1.4;
      while (x < X1 + 0.06) {
        const len = 1.3 + rnd() * 1.5;
        const a = Math.max(X0 - 0.02, x);
        const b = Math.min(X1 + 0.06, x + len);
        if (b - a > 0.05) {
          const g = rbox(b - a - 0.008, 0.07, z1 - z0 - 0.008, 0.018);
          g.translate((a + b) / 2, -0.035, (z0 + z1) / 2);
          const c = PAL.plank.clone().offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.07);
          M.add(g, floorVC, c);
        }
        x += len;
      }
    }
    M.add(tint(boxGeo(X0 - T, X1 + 0.1, -0.3, -0.066, Z0 - T, Z1 + 0.1), PAL.slab), woodVC);
    // plinth: chunky stones along the two open edges, a dark core behind them
    M.add(boxGeo(X0 - T + 0.1, X1 - 0.06, -0.62, -0.3, Z0 - T + 0.1, Z1 - 0.06), mortarMat);
    const edge = (fixed, a, b, alongZ) => {
      let s = a;
      while (s < b - 0.08) {
        const len = Math.min(0.32 + rnd() * 0.3, b - s);
        const h = 0.3;
        const g = rbox(alongZ ? 0.16 : len - 0.03, h - 0.02, alongZ ? len - 0.03 : 0.16, 0.06);
        const cm = s + len / 2;
        g.translate(alongZ ? fixed : cm, -0.46, alongZ ? cm : fixed);
        M.add(g, stoneVC, PAL.stone[Math.floor(rnd() * PAL.stone.length)].clone().multiplyScalar(0.92));
        s += len;
      }
    };
    edge(Z1 - 0.06, X0 - T + 0.1, X1 - 0.06, false);
    edge(X1 - 0.06, Z0 - T + 0.1, Z1 - 0.14, true);
  }

  // ---- windows: green frames, a honey sill, a log curtain rod, gingham side panels --------
  const sillTops = [];
  for (const w of WINDOWS) {
    const za = w.zc - w.w / 2;
    const zb = w.zc + w.w / 2;
    const f = 0.075;
    // jambs lining the opening through the wall
    M.add(boxGeo(X0 - T, X0 + 0.02, w.y0 - 0.02, w.y0 + 0.03, za, zb), frameMat);
    M.add(boxGeo(X0 - T, X0 + 0.02, w.y1 - 0.03, w.y1 + 0.02, za, zb), frameMat);
    M.add(boxGeo(X0 - T, X0 + 0.02, w.y0, w.y1, za - 0.02, za + 0.03), frameMat);
    M.add(boxGeo(X0 - T, X0 + 0.02, w.y0, w.y1, zb - 0.03, zb + 0.02), frameMat);
    // chunky casing on the room side, over the log ends
    const cx0 = X0 + 0.02;
    const cx1 = X0 + LOG_FRONT + 0.05;
    const casing = (y0, y1, z0, z1) => {
      const g = rbox(cx1 - cx0, y1 - y0, z1 - z0, 0.025);
      g.translate((cx0 + cx1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      M.add(g, frameMat);
    };
    casing(w.y1 - 0.02, w.y1 + 0.13, za - 0.13, zb + 0.13);
    casing(w.y0 - 0.02, w.y1 + 0.02, za - 0.13, za + 0.01);
    casing(w.y0 - 0.02, w.y1 + 0.02, zb - 0.01, zb + 0.13);
    // sash: frame + a cross of glazing bars, halfway through the wall
    const sx = X0 - T * 0.55;
    const bar = (y0, y1, z0, z1, d = 0.035) => M.add(boxGeo(sx - d, sx + d, y0, y1, z0, z1), frameMat);
    bar(w.y0, w.y0 + f, za, zb);
    bar(w.y1 - f, w.y1, za, zb);
    bar(w.y0, w.y1, za, za + f);
    bar(w.y0, w.y1, zb - f, zb);
    bar(w.y0, w.y1, w.zc - 0.025, w.zc + 0.025, 0.028);
    const hy = w.y0 + (w.y1 - w.y0) * 0.56;
    bar(hy - 0.025, hy + 0.025, za, zb, 0.028);
    // sill: a thick honey plank, a shelf for small things
    const sill = rbox(0.36, 0.07, zb - za + 0.34, 0.025);
    const sillTop = w.y0 + 0.02;
    sill.translate(X0 - 0.1, sillTop - 0.035, w.zc);
    M.add(sill, woodVC, PAL.sill);
    sillTops.push({ w, top: sillTop, z0: za - 0.1, z1: zb + 0.1 });
  }

  const gingham = ginghamTexture();
  const curtainMat = new THREE.MeshStandardMaterial({ map: gingham, roughness: 1, side: THREE.DoubleSide, name: 'curtain' });
  const curtainGeo = (w, h, folds, seed) => {
    const g = new THREE.PlaneGeometry(w, h, 40, 8);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / w;
      const t = (p.getY(i) + h / 2) / h;
      const amp = 0.03 + 0.02 * (1 - t);
      p.setZ(i, Math.sin(u * Math.PI * 2 * folds + seed) * amp);
      uv.setXY(i, (u + 0.5) * w / 0.26, t * h / 0.26);
    }
    g.computeVertexNormals();
    return g;
  };
  const rodMat = std(PAL.mantel, { name: 'rod', roughness: 0.6 });
  for (const w of WINDOWS) {
    const top = w.y1 + 0.19;
    const bottom = w.y0 - 0.12;
    const h = top - bottom;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, w.w + 0.9, 12), rodMat);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(X0 + 0.17, top + 0.02, w.zc);
    rod.castShadow = true;
    root.add(rod);
    for (const knob of [-1, 1]) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 10), rodMat);
      k.position.set(X0 + 0.17, top + 0.02, w.zc + knob * (w.w / 2 + 0.45));
      root.add(k);
    }
    for (const side of [-1, 1]) {
      const cw = 0.32;
      const c = new THREE.Mesh(curtainGeo(cw, h, 2.5, side * 1.7 + w.zc * 3), curtainMat);
      c.rotation.y = Math.PI / 2;
      c.position.set(X0 + 0.16, bottom + h / 2, w.zc + side * (w.w / 2 + 0.22));
      c.castShadow = true;
      c.receiveShadow = true;
      root.add(c);
    }
  }

  // ---- stone fireplace -------------------------------------------------------------------
  const fx = FIRE.x;
  const fz = Z0 + FIRE.d; // chimney front face
  const top = H + 0.42;
  const { ow, oh } = FIRE;
  // box faces: [+x, -x, +y, -y, +z, -z] — soot on the ones facing into the firebox
  const core = [
    [boxGeo(fx - FIRE.hw + 0.03, fx - ow, 0, top, Z0, fz - 0.03), [sootMat, mortarMat, mortarMat, mortarMat, mortarMat, mortarMat]],
    [boxGeo(fx + ow, fx + FIRE.hw - 0.03, 0, top, Z0, fz - 0.03), [mortarMat, sootMat, mortarMat, mortarMat, mortarMat, mortarMat]],
    [boxGeo(fx - ow, fx + ow, oh, top, Z0, fz - 0.03), [mortarMat, mortarMat, mortarMat, sootMat, mortarMat, mortarMat]],
    [boxGeo(fx - ow, fx + ow, 0, oh, Z0, Z0 + 0.05), sootMat],
  ];
  for (const [g, m] of core) {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const stone = (cx, cy, cz, sx, sy, sz) => {
    const g = rbox(sx, sy, sz, Math.min(0.07, sy * 0.42));
    g.rotateZ((rnd() - 0.5) * 0.05);
    g.translate(cx, cy, cz);
    const c = PAL.stone[Math.floor(rnd() * PAL.stone.length)].clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
    M.add(g, stoneVC, c);
  };
  // front face, row by row, leaving the firebox open; a long lintel stone over it
  {
    let y = 0.0;
    let lintel = false;
    while (y < top - 0.05) {
      const rh = Math.min(0.17 + rnd() * 0.08, top - y);
      const cy = y + rh / 2;
      const row = [];
      let x = fx - FIRE.hw - rnd() * 0.15;
      while (x < fx + FIRE.hw) {
        const w = 0.24 + rnd() * 0.2;
        row.push([Math.max(x, fx - FIRE.hw), Math.min(x + w, fx + FIRE.hw)]);
        x += w;
      }
      const inOpening = y < oh - 0.02;
      const onLintel = !inOpening && !lintel;
      for (let [a, b] of row) {
        if (inOpening) {
          if (b > fx - ow - 0.02 && a < fx + ow + 0.02) {
            if (a < fx - ow) b = fx - ow - 0.01;
            else if (b > fx + ow) a = fx + ow + 0.01;
            else continue;
          }
        } else if (onLintel && b > fx - ow - 0.18 && a < fx + ow + 0.18) {
          if (a < fx - ow - 0.18) b = fx - ow - 0.19;
          else if (b > fx + ow + 0.18) a = fx + ow + 0.19;
          else continue;
        }
        if (b - a < 0.04) continue;
        stone((a + b) / 2, cy, fz, b - a - 0.028, rh - 0.028, 0.12 + rnd() * 0.04);
      }
      if (onLintel) {
        lintel = true;
        stone(fx, cy, fz + 0.01, ow * 2 + 0.34, rh - 0.02, 0.15);
      }
      y += rh;
    }
    // side faces
    for (const sgn of [-1, 1]) {
      let yy = 0;
      while (yy < top - 0.05) {
        const rh = Math.min(0.17 + rnd() * 0.08, top - yy);
        let z = Z0;
        while (z < fz - 0.04) {
          const w = Math.min(0.2 + rnd() * 0.25, fz - z);
          stone(fx + sgn * FIRE.hw, yy + rh / 2, z + w / 2, 0.12 + rnd() * 0.03, rh - 0.028, w - 0.028);
          z += w;
        }
        yy += rh;
      }
    }
    // chimney cap
    const cap = rbox(FIRE.hw * 2 + 0.16, 0.1, FIRE.d + 0.14, 0.04);
    cap.translate(fx, top + 0.05, Z0 + FIRE.d / 2 - 0.02);
    M.add(cap, stoneVC, PAL.stone[3]);
  }
  // hearth: a raised row of flat stones in front of the firebox
  {
    const y1 = FIRE.hearth;
    M.add(boxGeo(fx - FIRE.hhw + 0.03, fx + FIRE.hhw - 0.03, 0, y1 - 0.02, fz - 0.05, fz + FIRE.hd - 0.03), mortarMat);
    let x = fx - FIRE.hhw;
    for (const w of [0.46, 0.5, 0.42, 0.54, 0.44]) {
      const b = Math.min(x + w, fx + FIRE.hhw);
      const g = rbox(b - x - 0.025, y1, FIRE.hd - 0.02, 0.035);
      g.translate((x + b) / 2, y1 / 2, fz + FIRE.hd / 2 - 0.02);
      M.add(g, stoneVC, PAL.stone[Math.floor(rnd() * PAL.stone.length)].clone().multiplyScalar(0.95));
      x = b;
    }
    // the firebox floor
    M.add(boxGeo(fx - ow, fx + ow, 0, 0.04, Z0 + 0.05, fz), sootMat);
  }
  // mantel: a chunky half-log beam
  const mantelTop = FIRE.mantel;
  {
    const g = rbox(FIRE.hw * 2 + 0.3, 0.15, 0.3, 0.05, 3);
    g.translate(fx, mantelTop - 0.075, fz + 0.12);
    M.add(g, woodVC, PAL.mantel);
  }

  // firewood on the hearth's right end: a neat stack of little logs, end grain out
  {
    const n = [4, 3, 2];
    const r = 0.055;
    const x0 = fx + ow + 0.17;
    // (its own bark: the wall logs' material gets the level's weathering mask)
    const wood = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, 1, 12, 1).rotateX(Math.PI / 2), [barkMat.clone(), grainMat, grainMat], 9);
    let k = 0;
    n.forEach((cnt, row) => {
      for (let i = 0; i < cnt; i++) {
        const x = x0 + (i + row * 0.5) * r * 2.05;
        const y = FIRE.hearth + r + row * r * 1.75;
        mtx.compose(new THREE.Vector3(x, y, fz + FIRE.hd * 0.47 + (rnd() - 0.5) * 0.03), q.identity(), new THREE.Vector3(1, 1, 0.34 + rnd() * 0.04));
        wood.setMatrixAt(k, mtx);
        wood.setColorAt(k, tmpC.setRGB(0.85 + rnd() * 0.12, 0.8 + rnd() * 0.1, 0.72 + rnd() * 0.1));
        k++;
      }
    });
    wood.castShadow = true;
    wood.receiveShadow = true;
    wood.layers.set(LAYER_MAIN_ONLY);
    root.add(wood);
  }

  // ---- fire: chunky logs, flame cards, the light ----------------------------------------------
  const fire = new THREE.Group();
  root.add(fire);
  const fireBark = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.9, emissive: 0xff5a1a, emissiveIntensity: 0, name: 'fireBark' });
  const fireLogGeo = new THREE.CylinderGeometry(0.06, 0.065, 0.6, 10);
  for (const [x, y, z, ry, rz] of [[0, 0.1, 0.24, 0.12, Math.PI / 2], [0, 0.1, 0.11, -0.1, Math.PI / 2], [0.02, 0.2, 0.17, 0.5, Math.PI / 2 - 0.08]]) {
    const log = new THREE.Mesh(fireLogGeo, fireBark);
    log.position.set(fx + x, y, Z0 + z);
    log.rotation.set(0, ry, rz);
    log.castShadow = true;
    fire.add(log);
  }
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const m = flameMaterial(i * 1.37);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.5), m);
    p.position.set(fx + (i - 1.5) * 0.06, 0.37, Z0 + 0.2 + (i % 2) * 0.05);
    p.rotation.y = (i - 1.5) * 0.45;
    p.layers.set(LAYER_MAIN_ONLY);
    fire.add(p);
    flames.push(m);
  }
  const fireLight = new THREE.PointLight(0xff8a3c, 0, 9, 2);
  fireLight.position.set(fx, 0.4, Z0 + 0.34);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.bias = -0.002;
  fireLight.shadow.radius = 3;
  fireLight.shadow.camera.near = 0.05;
  fire.add(fireLight);

  M.build(root, 'shell');

  // ---- braided oval rug (the cap's circular UVs map the painted oval exactly) -------------------
  const rugTex = braidedRugTexture();
  const rugTop = new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1, name: 'rug' });
  const rugSide = new THREE.MeshStandardMaterial({ color: 0xc84a36, roughness: 1, name: 'rugSide' });
  const rugGeo = new THREE.CylinderGeometry(1, 1, 0.018, 72, 1);
  const rug = new THREE.Mesh(rugGeo, [rugSide, rugTop, rugSide]);
  rug.scale.set(RUG.rx, 1, RUG.rz);
  rug.position.set(RUG.x, 0.009, RUG.z);
  rug.receiveShadow = true;
  // both rugs come with the movers (level: hidden until the repairs are done)
  const rugs = new THREE.Group();
  rugs.name = 'rugs';
  root.add(rugs);
  rugs.add(rug);
  // a small round crocheted one in the reading nook
  const rug2Top = new THREE.MeshStandardMaterial({
    map: braidedRugTexture({ cols: ['#f6e7cc', '#8fb573', '#f6e7cc', '#e9a0a0', '#f0c05a', '#f6e7cc', '#8fb573', '#e9a0a0'], rings: 9, W: 512, H: 512, seed: 5 }),
    roughness: 1,
    name: 'rug2',
  });
  const rug2 = new THREE.Mesh(rugGeo, [rugSide, rug2Top, rugSide]);
  rug2.scale.set(RUG2.r, 1, RUG2.r);
  rug2.position.set(RUG2.x, 0.009, RUG2.z);
  rug2.receiveShadow = true;
  rugs.add(rug2);

  // ---- a macramé planter hanging on the pier between the windows ------------------------------
  {
    const g = new THREE.Group();
    const hx = X0 + LOG_FRONT + 0.2;
    const hz = (WINDOWS[0].zc + WINDOWS[0].w / 2 + WINDOWS[1].zc - WINDOWS[1].w / 2) / 2;
    const potY = 1.72;
    const rope = new THREE.MeshStandardMaterial({ color: 0xf1e2c4, roughness: 1 });
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), rodMat);
    hook.position.set(hx - 0.1, 2.62, hz);
    g.add(hook);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const bx = hx + Math.cos(a) * 0.1;
      const bz = hz + Math.sin(a) * 0.1;
      const top = new THREE.Vector3(hx, 2.6, hz);
      const bot = new THREE.Vector3(bx, potY + 0.1, bz);
      const len = top.distanceTo(bot);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 5), rope);
      c.position.copy(top).add(bot).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bot.clone().sub(top).normalize());
      g.add(c);
    }
    const pot = new THREE.Mesh(
      new THREE.LatheGeometry([[0, 0], [0.07, 0.0], [0.11, 0.06], [0.12, 0.13], [0.0, 0.13]].map(([x, y]) => new THREE.Vector2(x, y)), 20),
      new THREE.MeshStandardMaterial({ color: 0xf2a65a, roughness: 0.7 }),
    );
    pot.position.set(hx, potY, hz);
    g.add(pot);
    // trailing vines: strings of little leaf blobs
    const leafA = new THREE.MeshStandardMaterial({ color: 0x7bbd5e, roughness: 0.7, flatShading: true });
    const leafB = new THREE.MeshStandardMaterial({ color: 0x5aa052, roughness: 0.7, flatShading: true });
    const blob = new THREE.IcosahedronGeometry(1, 0);
    const vr = mulberry(9);
    for (let v = 0; v < 6; v++) {
      const a = (v / 6) * Math.PI * 2 + 0.3;
      const len = 3 + Math.floor(vr() * 5);
      for (let i = 0; i < len; i++) {
        const t = i / 7;
        const m = new THREE.Mesh(blob, (i + v) % 2 ? leafA : leafB);
        const r = 0.1 + t * 0.05;
        m.position.set(hx + Math.cos(a) * r, potY + 0.14 - i * 0.075, hz + Math.sin(a) * r);
        m.scale.setScalar(0.045 - t * 0.012);
        m.rotation.set(vr() * 3, vr() * 3, vr() * 3);
        g.add(m);
      }
    }
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.layers.set(LAYER_MAIN_ONLY);
    });
    root.add(g);
  }

  // ---- floating autumn leaves around the cut (Hozy's floating building bits) --------------------
  const floaters = [];
  {
    // a maple-leaf cut-out, bowed a little along its spine
    const leafGeo = new THREE.PlaneGeometry(1, 1, 4, 1);
    const lp = leafGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) lp.setZ(i, Math.abs(lp.getX(i)) * 0.25);
    leafGeo.computeVertexNormals();
    const leafMap = mapleLeafTexture();
    const leafCols = [0xe8743b, 0xf2b53d, 0xd94f30, 0xf0913a, 0xc8a13a];
    // (a touch of self-glow: out past the walls the GI has little to give them)
    const mats = leafCols.map((c) => new THREE.MeshStandardMaterial({
      color: c, map: leafMap, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.3,
    }));
    const spots = [
      [X0 - 0.2, H + 0.45, 1.6], [X0 - 0.1, H + 0.3, -0.2], [X0 + 0.3, H + 0.55, -1.7],
      [-1.9, H + 0.4, Z0 - 0.2], [0.9, H + 0.35, Z0 - 0.1], [2.3, H + 0.5, Z0 - 0.25],
      [X1 + 0.35, 2.4, Z0 + 0.1], [X1 + 0.3, 1.1, Z0 - 0.1], [X0 + 0.2, 2.2, Z1 + 0.35], [X0 - 0.1, 0.9, Z1 + 0.3],
      [1.2, H + 0.7, -1.2],
    ];
    spots.forEach((p, i) => {
      const m = new THREE.Mesh(leafGeo, mats[i % mats.length]);
      m.scale.setScalar(0.36 + rnd() * 0.12);
      m.position.set(...p);
      // mostly face up (towards the camera above), tumbling a little
      m.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 0.8, rnd() * 6.28);
      m.layers.set(LAYER_MAIN_ONLY);
      m.userData.base = new THREE.Vector3(...p);
      m.userData.phase = rnd() * 6.28;
      m.userData.rx = m.rotation.x;
      m.userData.spin = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.5);
      root.add(m);
      floaters.push(m);
    });
  }

  // ---- sky card behind the windows (seen only through them): the pine forest -----------------
  // (ends well short of the wall's open end, or it peeks out beside it)
  const skyZ0 = Z0 - 0.4;
  const skyZ1 = 2.0;
  const sky = skyCard({ frag: SKY_FRAG, width: skyZ1 - skyZ0, height: 2.9, position: [X0 - T - 0.2, 1.45, (skyZ0 + skyZ1) / 2] });
  root.add(sky.mesh);

  // ---- invisible shadow-casting ceiling (the sun comes in through the windows only) ------------
  root.add(ceilingCaster(X0, X1 + 0.3, H - 0.02, H + 0.06, Z0, Z1 + 0.3));

  // ---- capture-only sky dome (skylight through the open sides — see lighting-notes) ------------
  const dome = skyDome();
  root.add(dome.mesh);

  // ---- what the furniture layer and the probes need to know -------------------------------------
  const B = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  const chimney = B(fx - FIRE.hw - 0.08, 0, Z0, fx + FIRE.hw + 0.08, H, fz + 0.08);
  const hearth = B(fx - FIRE.hhw, 0, fz, fx + FIRE.hhw, FIRE.hearth, fz + FIRE.hd);
  const blockers = [chimney];
  const surfaces = [
    { name: 'mantel', box: B(fx - FIRE.hw - 0.15, mantelTop - 0.05, fz - 0.03, fx + FIRE.hw + 0.15, mantelTop, fz + 0.27) },
    // the hearth's left end (the firewood fills the right one)
    { name: 'hearth', box: B(fx - FIRE.hhw + 0.03, 0, fz + 0.02, fx - ow - 0.02, FIRE.hearth, fz + FIRE.hd - 0.04) },
    ...sillTops.map((s, i) => ({ name: `sill${i + 1}`, box: B(X0 - 0.2, s.top - 0.05, s.z0, X0 + 0.07, s.top, s.z1) })),
  ];
  const obstacles = [chimney, hearth];
  for (const w of WINDOWS) {
    const za = w.zc - w.w / 2;
    const zb = w.zc + w.w / 2;
    obstacles.push(B(X0, w.y0 - 0.06, za - 0.17, X0 + 0.09, w.y0 + 0.02, zb + 0.17)); // sill
    obstacles.push(B(X0, w.y0 - 0.14, za - 0.4, X0 + 0.2, H, za - 0.05), B(X0, w.y0 - 0.14, zb + 0.05, X0 + 0.2, H, zb + 0.4)); // curtains
  }
  const wallAt = LOG_FRONT + 0.005;
  const hang = [
    {
      name: 'left', axis: 'x', sign: 1, at: X0 + wallAt, u: 'z', min: Z0 + 0.03, max: Z1, y0: 0.35, top: H - 0.05, ry: Math.PI / 2,
      keepOut: WINDOWS.map((w) => ({ u0: w.zc - w.w / 2 - 0.4, u1: w.zc + w.w / 2 + 0.4, y0: 0, y1: H })),
    },
    { name: 'back', axis: 'z', sign: 1, at: Z0 + wallAt, u: 'x', min: X0 + 0.03, max: fx - FIRE.hw - 0.1, y0: 0.35, top: H - 0.05, ry: 0 },
    { name: 'back2', axis: 'z', sign: 1, at: Z0 + wallAt, u: 'x', min: fx + FIRE.hw + 0.1, max: X1, y0: 0.35, top: H - 0.05, ry: 0 },
    { name: 'chimney', axis: 'z', sign: 1, at: fz + 0.07, u: 'x', min: fx - FIRE.hw, max: fx + FIRE.hw, y0: mantelTop + 0.12, top: H - 0.05, ry: 0 },
  ];

  const state = { fireOn: 1, fireTarget: 1, fireBase: 10 };
  return {
    root,
    sky: sky.material,
    dome: dome.material,
    fireLight,
    blockers,
    surfaces,
    hang,
    obstacles,
    fireplace: [chimney, hearth],
    rug: rugs,
    // for the level (src/levels/cabin.js): the wall logs' bark and the chinking between them
    logs: barkMat,
    chink: chinkMat,
    planks: floorVC,
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
        const ph = time * 0.6 + m.userData.phase;
        m.position.set(b.x, b.y + Math.sin(ph) * 0.06, b.z);
        // a lazy spin about the leaf's own face, a gentle rock
        m.rotation.z += m.userData.spin.z * dt;
        m.rotation.x = m.userData.rx + Math.sin(ph * 1.3) * 0.18;
      }
    },
    fireGI() {
      return state.fireBase * state.fireTarget * 0.85;
    },
  };
}
