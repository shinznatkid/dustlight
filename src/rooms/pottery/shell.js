import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { skyCard, skyDome, ceilingCaster, drift } from '../kit.js';
import { PAL, Bucket, mtx, rng, col, pot } from './kit.js';
import { kiln, placeAt } from './props.js';
import { ROOM, WIN, WAIN, SILL, WALL_SHELF, KILN, FLUE_Y, WHEEL, PLANTER } from './layout.js';

// The pottery studio's shell: a cutaway diorama (back wall z = Z0, left wall x = X0,
// open towards +x / +z) in flat low-poly colours — apricot plaster over sage
// boards, honey floor planks, a big teal-framed window the sun comes through —
// plus the built-in fittings (wall shelf, test tiles, tool rail, the kiln's flue,
// a hanging plant, rugs) and the brick kiln, which is the room's fire. Same lighting
// plumbing as the living room (the shared pieces from ../kit.js): a sky card behind
// the window, a capture-only sky dome for the probes, an invisible shadow ceiling.

// the sky seen through the window: flat bands and faceted low-poly hills
const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 treeCol;
uniform float glowZ;
uniform float glowY;
varying vec3 vW;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
// linear (not smoothed) value noise: straight-edged ridges, like a low-poly model
float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  vec3 sky = mix(horizon, top, smoothstep(0.6, 3.2, vW.y));
  float g = exp(-length(vec2((vW.z - glowZ) * 0.7, (vW.y - glowY) * 1.1)) * 1.4);
  sky += glow * g;
  float far = 1.2 + 0.4 * n1(vW.z * 0.9 + 4.0) + 0.12 * n1(vW.z * 2.3);
  float near = 0.95 + 0.3 * n1(vW.z * 1.6 + 11.0) + 0.1 * n1(vW.z * 4.1 + 2.0);
  vec3 c = sky;
  c = mix(c, mix(sky, treeCol * 1.6 + vec3(0.05, 0.05, 0.08), 0.5), step(vW.y, far));
  c = mix(c, treeCol * 1.1, step(vW.y, near));
  // a few cone trees on the near ridge
  float cell = floor(vW.z * 2.2);
  float cx = (cell + 0.5) / 2.2;
  float tallT = 0.1 + 0.16 * h1(cell + 3.0);
  float cone = step(abs(vW.z - cx) * 3.4, tallT - (vW.y - near + 0.02)) * step(near - 0.02, vW.y) * step(0.45, h1(cell));
  c = mix(c, treeCol * 0.8, cone);
  gl_FragColor = vec4(c, 1.0);
}
`;

const std = (hex, o = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0, flatShading: true, ...o });

// faces: [+x, -x, +y, -y, +z, -z]
function box(x0, x1, y0, y1, z0, z1, mat) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);
// a box as a bucket piece (min/max corners)
function bbox(b, x0, x1, y0, y1, z0, z1, hex, o = {}) {
  b.add(unitBox, hex, { m: mtx([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, 0], [x1 - x0, y1 - y0, z1 - z0]), ...o });
}

export function buildShell(scene) {
  const { X0, X1, Z0, Z1, H, T } = ROOM;
  const root = new THREE.Group();
  root.name = 'room';
  scene.add(root);
  const rnd = rng(7);

  // ---- materials (flat colours, no textures)
  const plaster = std(PAL.wall, { roughness: 0.96 });
  const core = std('#c56a42'); // the cut wall's brick core, seen on the cut ends and tops
  const slabMat = std(PAL.slab);
  const beamMat = std(PAL.beam);

  // ---- floor: slab + honey planks (one instanced mesh, a touch of colour per plank)
  const PT = 0.035; // plank thickness; plank tops at y = 0
  root.add(box(X0 - T, X1 + 0.12, -0.3, -PT, Z0 - T, Z1 + 0.12, slabMat));
  const planks = [];
  const W = 0.2;
  const GAP = 0.006;
  for (let z = Z0 - T, row = 0; z < Z1 + 0.12 - 0.01; z += W, row++) {
    const zw = Math.min(W, Z1 + 0.12 - z);
    let x = X0 - T - (row % 3) * 0.45;
    while (x < X1 + 0.12) {
      const len = 0.9 + rnd() * 1.1;
      const xa = Math.max(x, X0 - T);
      const xb = Math.min(x + len, X1 + 0.12);
      if (xb - xa > 0.05) planks.push({ x0: xa + GAP / 2, x1: xb - GAP / 2, z0: z + GAP / 2, z1: z + zw - GAP / 2 });
      x += len;
    }
  }
  // (one merged mesh with a colour per plank, not an InstancedMesh: a level's floor mask
  // (floormask.js) finds its spot from the model matrix, which an instance's isn't)
  const plankMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, vertexColors: true });
  const base = col(PAL.floor);
  const c = new THREE.Color();
  const plankGeos = planks.map((p) => {
    const g = unitBox.clone().applyMatrix4(mtx([(p.x0 + p.x1) / 2, -PT / 2, (p.z0 + p.z1) / 2], [0, 0, 0], [p.x1 - p.x0, PT, p.z1 - p.z0]));
    c.copy(base).offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.07);
    if (rnd() < 0.12) c.offsetHSL(0, 0.02, -0.06);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
  const floorMesh = new THREE.Mesh(mergeGeometries(plankGeos, false), plankMat);
  floorMesh.castShadow = false;
  floorMesh.receiveShadow = true;
  floorMesh.name = 'floor';
  root.add(floorMesh);
  // supports under the slab (the diorama sits on little beams)
  for (const [x, z] of [[-2.9, -2.4], [-2.9, 2.4], [2.9, -2.4], [2.9, 2.4], [0, 2.4], [2.9, 0], [-1.5, 2.4], [1.5, 2.4]]) {
    root.add(box(x - 0.16, x + 0.16, -0.6, -0.3, z - 0.16, z + 0.16, beamMat));
  }

  // ---- walls: plaster inside, brick core on the cut faces
  // back wall (z = Z0)
  root.add(box(X0, X1, 0, H, Z0 - T, Z0, [core, plaster, core, plaster, plaster, plaster]));
  // left wall (x = X0) around the window opening
  const wx0 = X0 - T;
  const lm = (end = false, top = false) => [plaster, plaster, top ? core : plaster, plaster, end ? core : plaster, plaster];
  const wz0 = WIN.zc - WIN.w / 2;
  const wz1 = WIN.zc + WIN.w / 2;
  root.add(box(wx0, X0, 0, WIN.y0, Z0 - T, Z1, lm(true)));
  root.add(box(wx0, X0, WIN.y1, H, Z0 - T, Z1, lm(true, true)));
  root.add(box(wx0, X0, WIN.y0, WIN.y1, Z0 - T, wz0, lm()));
  root.add(box(wx0, X0, WIN.y0, WIN.y1, wz1, Z1, lm(true)));

  // ---- trim: wainscot boards, rails, baseboards, the window frame and sill (one merged mesh)
  const trim = new Bucket();
  const BW = 0.14;
  // back wall boards
  bbox(trim, X0, X1, 0, WAIN, Z0, Z0 + 0.012, PAL.sageDeep);
  for (let x = X0; x < X1 - 0.02; x += BW) {
    bbox(trim, x + 0.006, Math.min(x + BW, X1) - 0.006, 0.09, WAIN, Z0 + 0.012, Z0 + 0.024, PAL.wainscot, { jitter: 0.25, rnd });
  }
  // left wall boards
  bbox(trim, X0, X0 + 0.012, 0, WAIN, Z0, Z1, PAL.sageDeep);
  for (let z = Z0 + 0.024; z < Z1 - 0.02; z += BW) {
    bbox(trim, X0 + 0.012, X0 + 0.024, 0.09, WAIN, z + 0.006, Math.min(z + BW, Z1) - 0.006, PAL.wainscot, { jitter: 0.25, rnd });
  }
  // rails on top, baseboards below
  bbox(trim, X0, X1, WAIN, WAIN + 0.05, Z0, Z0 + 0.045, PAL.rail);
  bbox(trim, X0, X0 + 0.045, WAIN, WAIN + 0.05, Z0, Z1, PAL.rail);
  bbox(trim, X0, X1, 0, 0.09, Z0, Z0 + 0.034, PAL.woodDark);
  bbox(trim, X0, X0 + 0.034, 0, 0.09, Z0, Z1, PAL.woodDark);
  // window frame (in the middle of the wall's thickness), 3 panes + a transom
  const fx = X0 - T * 0.5;
  const fr = (y0, y1, za, zb, d = 0.045) => bbox(trim, fx - d, fx + d, y0, y1, za, zb, PAL.frame);
  fr(WIN.y1 - 0.08, WIN.y1, wz0, wz1);
  fr(WIN.y0, WIN.y0 + 0.07, wz0, wz1);
  fr(WIN.y0, WIN.y1, wz0, wz0 + 0.08);
  fr(WIN.y0, WIN.y1, wz1 - 0.08, wz1);
  for (const k of [1, 2]) {
    const z = wz0 + (WIN.w * k) / 3;
    fr(WIN.y0, WIN.y1, z - 0.03, z + 0.03, 0.035);
  }
  const ty = WIN.y0 + (WIN.y1 - WIN.y0) * 0.72;
  fr(ty - 0.025, ty + 0.025, wz0, wz1, 0.035);
  // teal casing on the room side
  const cz = (za, zb, y0, y1) => bbox(trim, X0 - 0.01, X0 + 0.03, y0, y1, za, zb, PAL.frame);
  cz(wz0 - 0.1, wz0, WIN.y0, WIN.y1 + 0.1);
  cz(wz1, wz1 + 0.1, WIN.y0, WIN.y1 + 0.1);
  cz(wz0 - 0.1, wz1 + 0.1, WIN.y1, WIN.y1 + 0.1);
  // deep wooden sill (pots dry on it)
  bbox(trim, X0 - T * 0.5, SILL.x1, SILL.y - 0.05, SILL.y, SILL.z0, SILL.z1, PAL.woodPale);
  bbox(trim, X0, SILL.x1 - 0.03, SILL.y - 0.12, SILL.y - 0.05, SILL.z0 + 0.05, SILL.z1 - 0.05, PAL.frame);

  // ---- built-in fittings on the back wall: a shelf over the work table (glaze jars
  // stand on it), a board of glaze test tiles, a tool rail; the kiln's flue
  const WS = WALL_SHELF;
  bbox(trim, WS.x0, WS.x1, WS.y - 0.04, WS.y, Z0, Z0 + WS.d, PAL.woodPale);
  for (const x of [WS.x0 + 0.18, WS.x1 - 0.18]) {
    bbox(trim, x - 0.02, x + 0.02, WS.y - 0.26, WS.y - 0.04, Z0, Z0 + 0.03, PAL.woodDark);
    trim.add(unitBox, PAL.woodDark, { m: mtx([x, WS.y - 0.14, Z0 + 0.1], [0.72, 0, 0], [0.04, 0.03, 0.26]) });
  }
  bbox(trim, -1.88, -1.18, 1.0, 1.42, Z0, Z0 + 0.02, PAL.woodDark); // test tile board
  bbox(trim, -1.02, -0.3, 1.26, 1.31, Z0, Z0 + 0.035, PAL.woodDark); // tool rail
  // flue: from the kiln's pipe (at FLUE_Y) straight back into the wall
  const flueLen = KILN.z - Z0;
  trim.add(new THREE.CylinderGeometry(0.075, 0.075, flueLen, 8), '#4d4642', { m: mtx([KILN.x, FLUE_Y, KILN.z - flueLen / 2], [Math.PI / 2, 0, 0]) });
  trim.add(new THREE.SphereGeometry(0.085, 8, 4), '#4d4642', { m: mtx([KILN.x, FLUE_Y, KILN.z]) });
  trim.add(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 8), '#6b625c', { m: mtx([KILN.x, FLUE_Y, Z0 + 0.015], [Math.PI / 2, 0, 0]) });
  const trimMesh = trim.build({ name: 'trim' });
  root.add(trimMesh);

  // small fittings the probes can ignore: test tiles, hanging tools, the hanging plant
  const small = new Bucket();
  const glazes = [PAL.teal, PAL.cobalt, PAL.mustard, PAL.rust, PAL.sage, PAL.cream, PAL.plum, PAL.peach, PAL.sageDeep, PAL.oat, PAL.terracotta, '#3c6f8f'];
  glazes.forEach((g, i) => {
    const x = -1.8 + (i % 4) * 0.165 + 0.02;
    const y = 1.05 + Math.floor(i / 4) * 0.125;
    bbox(small, x, x + 0.13, y, y + 0.1, Z0 + 0.02, Z0 + 0.034, PAL.bisque);
    bbox(small, x, x + 0.13, y + 0.035, y + 0.1, Z0 + 0.034, Z0 + 0.038, g, { mat: 'gloss' });
  });
  const toolCols = [PAL.mustard, '#8c9491', PAL.teal, PAL.rust, '#8c9491'];
  toolCols.forEach((tc, i) => {
    const x = -0.92 + i * 0.13;
    bbox(small, x - 0.01, x + 0.01, 1.06, 1.26, Z0 + 0.035, Z0 + 0.05, PAL.woodPale);
    if (i % 2) small.add(new THREE.TorusGeometry(0.035, 0.006, 4, 8), tc, { m: mtx([x, 1.04, Z0 + 0.045]) });
    else small.add(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 6), tc, { m: mtx([x, 1.03, Z0 + 0.048], [Math.PI / 2, 0, 0], [1, 1, 0.8]) });
  });
  // hanging planter in the window (its leaves throw a shadow into the sun patch)
  const { x: hx, y: hy, z: hz } = PLANTER;
  bbox(small, X0, hx + 0.03, WIN.y1 + 0.04, WIN.y1 + 0.07, hz - 0.02, hz + 0.02, PAL.woodDark);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const dx = Math.cos(a) * 0.07;
    const dz = Math.sin(a) * 0.07;
    const len = WIN.y1 + 0.04 - (hy + 0.1);
    small.add(unitBox, PAL.cream, { m: mtx([hx + dx / 2, hy + 0.1 + len / 2, hz + dz / 2], [-dz * 0.6, 0, dx * 0.6], [0.008, len, 0.008]) });
  }
  small.addPainted(pot({ shape: 'planter', h: 0.13, r: 0.09, body: PAL.cream, glaze: PAL.cream, dip: 0, seg: 8 }), mtx([hx, hy, hz]));
  const leaf = new THREE.IcosahedronGeometry(1, 0);
  for (let v = 0; v < 6; v++) {
    const a = (v / 6) * Math.PI * 2 + 0.3;
    const n = 3 + ((v * 7) % 4);
    for (let k = 0; k < n; k++) {
      const r = 0.085 + k * 0.012;
      small.add(leaf, k % 2 ? PAL.leaf : PAL.leafDark, {
        m: mtx([hx + Math.cos(a) * r, hy + 0.12 - k * 0.075, hz + Math.sin(a) * r], [k, a, 0], [0.035, 0.022, 0.03]),
        jitter: 0.3,
        rnd,
      });
    }
  }
  small.add(leaf, PAL.leafDark, { m: mtx([hx, hy + 0.17, hz], [0, 0, 0], [0.09, 0.05, 0.09]) });
  const smallMesh = small.build({ name: 'fittings' });
  smallMesh.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
  root.add(smallMesh);

  // ---- rugs: a round rug in the visitors' corner, a splattered drop cloth under the wheel
  const rugs = new Bucket();
  const disc = (r, h, x, z) => mtx([x, h / 2, z], [0, 0.2, 0], [r, h, r]);
  const cylU = new THREE.CylinderGeometry(1, 1, 1, 14);
  [[1.05, PAL.mustard], [0.93, PAL.cream], [0.8, PAL.terracotta], [0.58, PAL.cream], [0.46, PAL.teal], [0.2, PAL.cream]].forEach(([r, c], i) => {
    rugs.add(cylU, c, { m: disc(r, 0.008 + i * 0.002, 1.3, 1.15) });
  });
  rugs.add(new THREE.CylinderGeometry(1, 1, 1, 11), PAL.canvas, { m: mtx([WHEEL.x, 0.003, WHEEL.z - 0.12], [0, 0.3, 0], [0.82, 0.006, 0.82]) });
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.68;
    const s = 0.025 + rnd() * 0.05;
    rugs.add(new THREE.CylinderGeometry(1, 1, 1, 6), [PAL.wetClay, PAL.terracotta, '#b98a6a'][i % 3], {
      m: mtx([WHEEL.x + Math.cos(a) * r, 0.0068, WHEEL.z - 0.12 + Math.sin(a) * r], [0, rnd() * 3, 0], [s, 0.002, s * (0.6 + rnd() * 0.6)]),
    });
  }
  // (a level lays them once the repairs are done: they come with the movers)
  const rugMesh = rugs.build({ name: 'rugs', cast: false });
  root.add(rugMesh);

  // ---- the brick kiln in the back-right corner: a fixed part of the room (its flue runs
  // into the back wall) and the room's fire — lit, its door glows and a warm light spills
  // out in front (world.js fire hooks: fireLight, setFire, fireOn, fireGI, clickTargets.fire)
  const K = kiln();
  placeAt(K.obj, { x: KILN.x, z: KILN.z, ry: KILN.ry });
  root.add(K.obj);
  const fireLight = new THREE.PointLight(0xff8a3c, 0, 6, 2);
  fireLight.position.set(KILN.x, 0.36, KILN.z).addScaledVector(new THREE.Vector3(Math.sin(KILN.ry), 0, Math.cos(KILN.ry)), K.doorZ + 0.22);
  root.add(fireLight);
  const kilnMeshes = [];
  K.obj.traverse((o) => { if (o.isMesh) kilnMeshes.push(o); });
  const fire = { on: 0, target: 0, base: 3.2 };
  const kilnBox = new THREE.Box3().setFromObject(K.obj);

  // ---- rugged cut edges: adobe bricks along the wall tops + toothing down the cut ends
  const bricks = [];
  const L = 0.26;
  const Hc = 0.085;
  const runs = [
    { a: Z0 - T, b: Z1, c: X0 - T / 2, axis: 'z' },
    { a: X0, b: X1, c: Z0 - T / 2, axis: 'x' },
  ];
  for (const r of runs) {
    for (let k = 0; k < 4; k++) {
      const off = (k % 2) * L * 0.5;
      for (let s = r.a + off; s < r.b - 0.05; s += L + 0.014) {
        const u = s / 1.3;
        const prof = 1.2 + Math.sin(u * 1.7 + r.c) * 0.9 + Math.sin(u * 4.3) * 0.5 + rnd() * 0.8;
        if (k > prof) continue;
        const len = Math.min(L, r.b - s);
        const cx = s + len / 2;
        const y = H + Hc * (k + 0.5) + 0.004;
        const pos = r.axis === 'z' ? [r.c, y, cx] : [cx, y, r.c];
        const scl = r.axis === 'z' ? [T - 0.02, Hc - 0.01, len] : [len, Hc - 0.01, T - 0.02];
        bricks.push({ pos, scl, rot: (rnd() - 0.5) * 0.05 });
      }
    }
  }
  for (let k = 0; k * (Hc + 0.004) < H + 0.2; k++) {
    const y = Hc * (k + 0.5) + k * 0.004;
    if (k % 2 === 0 && rnd() > 0.15) bricks.push({ pos: [X0 - T / 2, y, Z1 + L * 0.25], scl: [T - 0.02, Hc - 0.01, L * 0.5], rot: 0 });
    if (k % 2 === 1 && rnd() > 0.15) bricks.push({ pos: [X1 + L * 0.25, y, Z0 - T / 2], scl: [L * 0.5, Hc - 0.01, T - 0.02], rot: 0 });
  }
  const brickMat = std(0xffffff, { roughness: 0.9 });
  const im = new THREE.InstancedMesh(unitBox, brickMat, bricks.length);
  const bc = [col('#c8653c'), col('#d98352'), col('#b7502f'), col('#e39a68')];
  bricks.forEach((b, i) => {
    im.setMatrixAt(i, mtx(b.pos, [0, b.rot, 0], b.scl));
    c.copy(bc[Math.floor(rnd() * bc.length)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
    im.setColorAt(i, c);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  root.add(im);

  // floating bits (Hozy's drifting building pieces), faceted
  const floaters = [];
  const chunkGeo = new THREE.IcosahedronGeometry(1, 0);
  const chunkMats = [std('#c8653c'), std(PAL.wall), std('#d98352')];
  const spots = [
    [X0 - 0.12, H + 0.34, 1.9], [X0 - 0.2, H + 0.52, 0.2], [X0 - 0.08, H + 0.28, -1.5],
    [-1.9, H + 0.38, Z0 - 0.14], [0.5, H + 0.3, Z0 - 0.1], [2.2, H + 0.44, Z0 - 0.18],
    [X1 + 0.26, 2.2, Z0 - 0.12], [X1 + 0.22, 1.1, Z0 - 0.14], [X0 - 0.12, 2.0, Z1 + 0.26], [X0 - 0.1, 0.7, Z1 + 0.22],
  ];
  spots.forEach((p, i) => {
    const m = new THREE.Mesh(chunkGeo, chunkMats[i % 3]);
    m.scale.set(0.07 + rnd() * 0.04, 0.045, 0.06);
    m.position.set(...p);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.layers.set(LAYER_MAIN_ONLY);
    m.userData.base = new THREE.Vector3(...p);
    m.userData.phase = rnd() * 6.28;
    m.userData.spin = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.25);
    root.add(m);
    floaters.push(m);
  });

  // ---- sky card behind the window (only seen through the opening)
  const sky = skyCard({ frag: SKY_FRAG, width: Z1 - Z0 + 0.1, height: 2.9, position: [X0 - T - 0.14, 1.45, (Z0 + Z1) / 2 - 0.1] });
  root.add(sky.mesh);

  // ---- invisible shadow-casting ceiling (the sun only comes in through the window)
  root.add(ceilingCaster(X0, X1 + 0.3, H - 0.02, H + 0.06, Z0, Z1 + 0.3));

  // ---- capture-only sky dome: the skylight the probes see through the open sides
  const dome = skyDome();
  root.add(dome.mesh);

  // ---- what the furniture layer (decorate.js) needs to know about the shell
  const B = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  const surfaces = [
    { name: 'sill', box: B(X0, SILL.y - 0.05, SILL.z0, SILL.x1, SILL.y, SILL.z1) },
    { name: 'wallshelf', box: B(WS.x0, WS.y - 0.04, Z0, WS.x1, WS.y, Z0 + WS.d) },
  ];
  // (the kiln: the square inside its round plinth — its corners would keep the shelf unit
  // and the floor lamp off their spots)
  const kilnFoot = B(KILN.x - 0.44, 0, KILN.z - 0.44, KILN.x + 0.44, kilnBox.max.y, KILN.z + 0.44);
  const obstacles = [
    B(X0, SILL.y - 0.12, SILL.z0, SILL.x1, SILL.y, SILL.z1),
    B(WS.x0, WS.y - 0.26, Z0, WS.x1, WS.y, Z0 + WS.d),
    kilnFoot,
  ];
  const hang = [
    {
      name: 'left', axis: 'x', sign: 1, at: X0, u: 'z', min: Z0 + 0.03, max: Z1, y0: WAIN + 0.1, top: H - 0.05, ry: Math.PI / 2,
      keepOut: [{ u0: wz0 - 0.15, u1: wz1 + 0.15, y0: 0, y1: H }],
    },
    { name: 'back', axis: 'z', sign: 1, at: Z0, u: 'x', min: X0 + 0.03, max: X1, y0: WAIN + 0.1, top: H - 0.05, ry: 0 },
  ];

  return {
    root,
    paint: plaster,
    sky: sky.material,
    dome: dome.material,
    // GI probes must not sit inside the kiln (as when it was a piece of furniture)
    blockers: [kilnBox.clone().expandByScalar(-0.06)],
    surfaces,
    hang,
    obstacles,
    // for the level (src/levels/pottery.js): the planks (dirt goes on them), the rugs,
    // the fixed fittings (the hanging planter shades the sun patch) and the kiln itself
    planks: plankMat,
    rug: rugMesh,
    fittings: smallMesh,
    kiln: { obj: K.obj, R: K.R, ap: K.doorZ, meshes: kilnMeshes, foot: kilnFoot },
    fireLight,
    clickTargets: { fire: kilnMeshes },
    setFire(on) {
      fire.target = on ? 1 : 0;
    },
    get fireOn() {
      return fire.target > 0.5;
    },
    // snap = jump to the target instead of easing (frozen ?still screenshots)
    update(dt, time, snap = false) {
      fire.on += (fire.target - fire.on) * (snap ? 1 : Math.min(1, dt * 3));
      const flick = 0.9 + 0.06 * Math.sin(time * 7.3) + 0.04 * Math.sin(time * 13.1 + 1.1);
      fireLight.intensity = fire.base * fire.on * flick;
      K.glowMat.emissiveIntensity = 2.6 * fire.on * flick;
      drift(floaters, dt, time);
    },
    // average fire power for GI captures (the flicker is too fast to bake)
    fireGI() {
      return fire.base * fire.target * 0.9;
    },
  };
}
