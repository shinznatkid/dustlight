import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from './gi.js';
import { mulberry } from './atmos.js';
import { flameMaterial, skyCard, skyDome, ceilingCaster, brickRim, drift } from './rooms/kit.js';

// Room frame (metres). Inner faces: left wall x = X0, back wall z = Z0. The
// front (z = Z1) and right (x = X1) sides are the open cutaway.
export const ROOM = { X0: -3.2, X1: 3.2, Z0: -2.6, Z1: 2.6, H: 3.0, T: 0.25 };
export const WINDOWS = [
  { zc: -1.05, w: 1.2, y0: 0.7, y1: 2.45 },
  { zc: 1.15, w: 1.2, y0: 0.7, y1: 2.45 },
];
export const FIRE_X = -0.9;
const BREAST_Z = ROOM.Z0 + 0.42; // chimney breast front
const BREAST_HW = 0.95;          // chimney breast half width

// What a level can work on here (room module `sites`, read by level.js and its systems):
//   windows — the glass panes (grime.js): centre just inside the frame, facing the room
//   soot    — the fireplace surround's face (grime.js), `hole` = the fire opening
//   walls   — the paintable faces (walls.js has the format), in this atlas layout:
//             [0, 5.2) left wall ← z · [5.2, 11.6) back wall + chimney front ← x ·
//             [11.6, 12.02) chimney side facing −x · [12.02, 12.44) side facing +x
const { X0, X1, Z0, Z1, H, T } = ROOM;
const BL = FIRE_X - BREAST_HW;
const BR = FIRE_X + BREAST_HW;
export const SITES = {
  windows: WINDOWS.map((w) => ({ at: [X0 - T * 0.5 + 0.004, (w.y0 + w.y1) / 2, w.zc], ry: Math.PI / 2, w: w.w, h: w.y1 - w.y0 })),
  soot: { at: [FIRE_X, 1.13 / 2, BREAST_Z + 0.083], ry: 0, w: 1.48, h: 1.13, hole: { w: 1.0, h: 0.86 } },
  walls: {
    aw: 12.8,
    ah: 3.2,
    base: 0.11, // baseboards
    top: H,
    old: '#b5ad95', // faded, dingy
    faces: [
      {
        face: 'left', axis: 'x', at: X0, sign: 1, along: 'z', lo: Z0, hi: Z1, ua: 0, origin: Z0,
        holes: WINDOWS.map((w) => ({ a0: w.zc - w.w / 2, a1: w.zc + w.w / 2, y0: w.y0 - 0.04, y1: w.y1 })),
      },
      { face: 'backL', axis: 'z', at: Z0, sign: 1, along: 'x', lo: X0, hi: BL, ua: 5.2, origin: X0 },
      {
        // the surround, mantel and fire opening cover the chimney front's lower part
        face: 'breast', axis: 'z', at: BREAST_Z, sign: 1, along: 'x', lo: BL, hi: BR, ua: 5.2, origin: X0,
        holes: [{ a0: FIRE_X - 0.84, a1: FIRE_X + 0.84, y0: -1, y1: 1.19 }],
      },
      { face: 'backR', axis: 'z', at: Z0, sign: 1, along: 'x', lo: BR, hi: X1, ua: 5.2, origin: X0 },
      { face: 'breastL', axis: 'x', at: BL, sign: -1, along: 'z', lo: Z0, hi: BREAST_Z, ua: 11.6, origin: Z0 },
      { face: 'breastR', axis: 'x', at: BR, sign: 1, along: 'z', lo: Z0, hi: BREAST_Z, ua: 12.02, origin: Z0 },
    ],
  },
};

const tl = new THREE.TextureLoader();
const texCache = new Map();
const pending = [];
// resolves once every room texture (incl. the canvas-processed ones) is in memory
export const roomTexturesReady = () => Promise.all(pending);
function tex(name, map, { srgb = false, size = 1 } = {}) {
  const key = `${name}/${map}`;
  let t = texCache.get(key);
  if (!t) {
    let done;
    pending.push(new Promise((r) => { done = r; }));
    t = tl.load(`assets/textures/${name}/${map}.jpg`, done, undefined, done);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  t.repeat.set(1 / size, 1 / size);
  return t;
}

// grayscale copy of a diffuse map normalised to mean 1 (+-8%): lets painted walls
// keep the plaster's blotchiness while taking any paint colour
function detailMap(name, size) {
  // the canvas is attached only once filled: WebGL2 texture storage is immutable,
  // so a first upload at the default 300x150 size would stay black forever
  const canvas = document.createElement('canvas');
  const t = new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / size, 1 / size);
  t.anisotropy = 8;
  const img = new Image();
  let done;
  pending.push(new Promise((r) => { done = r; }));
  img.onerror = done;
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height);
    const px = d.data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    const mean = sum / (px.length / 4);
    for (let i = 0; i < px.length; i += 4) {
      const l = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / mean;
      const v = Math.round(235 * THREE.MathUtils.clamp(1 + (l - 1) * 0.6, 0.92, 1.08));
      px[i] = px[i + 1] = px[i + 2] = Math.min(255, v);
    }
    ctx.putImageData(d, 0, 0);
    t.image = canvas;
    t.needsUpdate = true;
    done();
  };
  img.src = `assets/textures/${name}/diff.jpg`;
  return t;
}

// planar UVs in metres from the dominant normal axis, so textures tile at real size
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
  uv.needsUpdate = true;
  return g;
}

// faces: [+x, -x, +y, -y, +z, -z]
function box(x0, x1, y0, y1, z0, z1, mat) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  worldUV(g);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function rugTexture() {
  const W = 1024;
  const H = 720;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry(11);
  g.fillStyle = '#8a2e24';
  g.fillRect(0, 0, W, H);
  const band = (inset, w, col) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  };
  band(26, 22, '#e6d2ab');
  band(52, 18, '#2e3d5a');
  band(76, 10, '#d39a45');
  band(96, 6, '#e6d2ab');
  // zig-zag border between bands
  g.fillStyle = '#e6d2ab';
  for (let x = 60; x < W - 60; x += 28) {
    g.beginPath();
    g.moveTo(x, 44);
    g.lineTo(x + 14, 60);
    g.lineTo(x + 28, 44);
    g.fill();
    g.beginPath();
    g.moveTo(x, H - 44);
    g.lineTo(x + 14, H - 60);
    g.lineTo(x + 28, H - 44);
    g.fill();
  }
  // central medallions
  const diamond = (cx, cy, r, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r * 1.3, cy);
    g.lineTo(cx, cy + r);
    g.lineTo(cx - r * 1.3, cy);
    g.closePath();
    g.fill();
  };
  for (const [cx, k] of [[W * 0.3, 0], [W * 0.5, 1], [W * 0.7, 0]]) {
    diamond(cx, H / 2, 170 - k * -20, '#2e3d5a');
    diamond(cx, H / 2, 130, '#d39a45');
    diamond(cx, H / 2, 95, '#8a2e24');
    diamond(cx, H / 2, 60, '#e6d2ab');
    diamond(cx, H / 2, 30, '#2e3d5a');
  }
  g.fillStyle = '#d39a45';
  for (let i = 0; i < 40; i++) {
    const x = 130 + rnd() * (W - 260);
    const y = 130 + rnd() * (H - 260);
    g.fillRect(x, y, 6, 6);
  }
  // woven noise
  const d = g.getImageData(0, 0, W, H);
  for (let i = 0; i < d.data.length; i += 4) {
    const y = Math.floor(i / 4 / W);
    const n = (rnd() - 0.5) * 26 + (y % 3 === 0 ? -8 : 0);
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildRoom(scene) {
  const { X0, X1, Z0, Z1, H, T } = ROOM;
  const root = new THREE.Group();
  root.name = 'room';
  scene.add(root);

  // ---- materials
  const plasterDetail = detailMap('plastered_wall_04', 3.2);
  const paint = new THREE.MeshStandardMaterial({
    color: 0xefe3cf,
    map: plasterDetail,
    normalMap: tex('plastered_wall_04', 'nor', { size: 3.2 }),
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: tex('plastered_wall_04', 'rough', { size: 3.2 }),
    roughness: 1,
  });
  const brick = new THREE.MeshStandardMaterial({
    map: tex('brown_brick_02', 'diff', { srgb: true, size: 1 }),
    normalMap: tex('brown_brick_02', 'nor', { size: 1 }),
    roughnessMap: tex('brown_brick_02', 'rough', { size: 1 }),
    roughness: 1,
  });
  const fireBrick = brick.clone();
  fireBrick.color = new THREE.Color(0x5a4038);
  const soot = new THREE.MeshStandardMaterial({ color: 0x1c1714, roughness: 0.95 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf0ebe2, roughness: 0.42 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x3b3834, roughness: 0.55 });
  const parquet = new THREE.MeshPhysicalMaterial({
    map: tex('herringbone_parquet', 'diff', { srgb: true, size: 3.4 }),
    normalMap: tex('herringbone_parquet', 'nor', { size: 3.4 }),
    roughnessMap: tex('herringbone_parquet', 'rough', { size: 3.4 }),
    roughness: 0.85,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
  });
  const slabSide = new THREE.MeshStandardMaterial({
    map: tex('wood_floor_worn', 'diff', { srgb: true, size: 2 }),
    normalMap: tex('wood_floor_worn', 'nor', { size: 2 }),
    roughnessMap: tex('wood_floor_worn', 'rough', { size: 2 }),
    roughness: 1,
    color: 0x8a7462,
  });
  const beam = new THREE.MeshStandardMaterial({ color: 0x5e4535, roughness: 0.8 });

  // ---- floor slab + supports
  const slab = box(X0 - T, X1 + 0.12, -0.3, 0, Z0 - T, Z1 + 0.12,
    [slabSide, slabSide, parquet, slabSide, slabSide, slabSide]);
  root.add(slab);
  for (const [x, z] of [[-3.1, -2.5], [-3.1, 2.4], [3.0, -2.5], [3.0, 2.4], [0, 2.4], [3.0, 0], [-1.5, 2.4], [1.5, 2.4]]) {
    root.add(box(x - 0.16, x + 0.16, -0.62, -0.3, z - 0.16, z + 0.16, beam));
  }

  // ---- back wall (z = Z0), full length incl. chimney breast
  root.add(box(X0, X1, 0, H, Z0 - T, Z0, [brick, paint, brick, paint, paint, brick]));

  // ---- left wall (x = X0) with two window openings
  const wallX0 = X0 - T;
  const lm = (o = {}) => [paint, paint, o.top ? brick : paint, paint, o.end ? brick : paint, paint];
  const yb = WINDOWS[0].y0;
  const yt = WINDOWS[0].y1;
  root.add(box(wallX0, X0, 0, yb, Z0 - T, Z1, lm({ end: true })));
  root.add(box(wallX0, X0, yt, H, Z0 - T, Z1, lm({ top: true, end: true })));
  const piers = [[Z0 - T, WINDOWS[0].zc - WINDOWS[0].w / 2]];
  piers.push([WINDOWS[0].zc + WINDOWS[0].w / 2, WINDOWS[1].zc - WINDOWS[1].w / 2]);
  piers.push([WINDOWS[1].zc + WINDOWS[1].w / 2, Z1]);
  piers.forEach(([a, b], i) => root.add(box(wallX0, X0, yb, yt, a, b, lm({ end: i === 2 }))));

  // ---- windows: frames, mullions, sills
  const frameX = X0 - T * 0.5;
  for (const w of WINDOWS) {
    const z0 = w.zc - w.w / 2;
    const z1 = w.zc + w.w / 2;
    const f = 0.03;
    const add = (y0, y1, za, zb, d = f) => root.add(box(frameX - d, frameX + d, y0, y1, za, zb, trim));
    add(w.y1 - 0.07, w.y1, z0, z1);
    add(w.y0, w.y0 + 0.08, z0, z1);
    add(w.y0, w.y1, z0, z0 + 0.07);
    add(w.y0, w.y1, z1 - 0.07, z1);
    add(w.y0, w.y1, w.zc - 0.025, w.zc + 0.025, 0.022);
    const hy = w.y0 + (w.y1 - w.y0) * 0.68;
    add(hy - 0.022, hy + 0.022, z0, z1, 0.022);
    const hy2 = w.y0 + (w.y1 - w.y0) * 0.36;
    add(hy2 - 0.02, hy2 + 0.02, z0, z1, 0.02);
    root.add(box(X0 - 0.06, X0 + 0.08, w.y0 - 0.04, w.y0, z0 - 0.08, z1 + 0.08, trim));
  }

  // ---- linen curtains on brass rods
  const linen = new THREE.MeshStandardMaterial({ color: 0xf1e8d8, roughness: 1, side: THREE.DoubleSide });
  const rodMat = new THREE.MeshStandardMaterial({ color: 0xb08a4e, metalness: 0.6, roughness: 0.35 });
  const curtainGeo = (w, h, folds, seed) => {
    const g = new THREE.PlaneGeometry(w, h, 56, 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / w;
      const t = (p.getY(i) + h / 2) / h; // 0 at the hem, 1 at the rod
      const amp = 0.03 + 0.025 * (1 - t);
      p.setZ(i, Math.sin(u * Math.PI * 2 * folds + seed) * amp + Math.sin(u * Math.PI * 9 + seed * 2) * 0.005);
    }
    g.computeVertexNormals();
    return g;
  };
  for (const w of WINDOWS) {
    const top = w.y1 + 0.22;
    const bottom = 0.05;
    const h = top - bottom;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, w.w + 0.78, 12), rodMat);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(X0 + 0.12, top + 0.02, w.zc);
    rod.castShadow = true;
    root.add(rod);
    for (const side of [-1, 1]) {
      const cw = 0.32;
      const c = new THREE.Mesh(curtainGeo(cw, h, 3.5, side * 1.7 + w.zc * 3), linen);
      c.rotation.y = Math.PI / 2;
      c.position.set(X0 + 0.12, bottom + h / 2, w.zc + side * (w.w / 2 + 0.04));
      c.castShadow = true;
      c.receiveShadow = true;
      root.add(c);
    }
  }

  // ---- chimney breast + fireplace
  const fx = FIRE_X;
  const bz = Z0 + 0.42;
  const ow = 0.5;
  const oh = 0.86;
  root.add(box(fx - 0.95, fx - ow, 0, H, Z0, bz, [fireBrick, paint, brick, paint, paint, paint]));
  root.add(box(fx + ow, fx + 0.95, 0, H, Z0, bz, [paint, fireBrick, brick, paint, paint, paint]));
  root.add(box(fx - ow, fx + ow, oh, H, Z0, bz, [paint, paint, brick, soot, paint, paint]));
  root.add(box(fx - ow, fx + ow, 0, oh, Z0, Z0 + 0.012, fireBrick));
  root.add(box(fx - ow, fx + ow, 0, 0.02, Z0, bz, slate));
  root.add(box(fx - 0.74, fx - ow, 0, 1.1, bz, bz + 0.08, trim));
  root.add(box(fx + ow, fx + 0.74, 0, 1.1, bz, bz + 0.08, trim));
  root.add(box(fx - 0.74, fx + 0.74, oh, 1.13, bz, bz + 0.08, trim));
  root.add(box(fx - 0.84, fx + 0.84, 1.13, 1.18, bz, bz + 0.2, trim));
  root.add(box(fx - 0.82, fx + 0.82, 0, 0.025, bz, bz + 0.42, slate));

  // ---- baseboards
  const bb = 0.11;
  root.add(box(X0, fx - 0.95, 0, bb, Z0, Z0 + 0.02, trim));
  root.add(box(fx + 0.95, X1, 0, bb, Z0, Z0 + 0.02, trim));
  root.add(box(fx - 0.97, fx - 0.95, 0, bb, Z0, bz + 0.02, trim));
  root.add(box(fx + 0.95, fx + 0.97, 0, bb, Z0, bz + 0.02, trim));
  root.add(box(fx - 0.97, fx - 0.74, 0, bb, bz, bz + 0.02, trim));
  root.add(box(fx + 0.74, fx + 0.97, 0, bb, bz, bz + 0.02, trim));
  root.add(box(X0, X0 + 0.02, 0, bb, Z0, Z1, trim));

  // ---- logs + flames + fire light
  const fire = new THREE.Group();
  root.add(fire);
  const bark = new THREE.MeshStandardMaterial({ color: 0x3d2a1e, roughness: 0.9, emissive: 0xff5a1a, emissiveIntensity: 0 });
  const logGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.62, 10);
  for (const [x, y, z, ry, rz] of [[0, 0.075, 0.2, 0.12, Math.PI / 2], [0, 0.075, 0.08, -0.1, Math.PI / 2], [0.02, 0.17, 0.14, 0.5, Math.PI / 2 - 0.08]]) {
    const log = new THREE.Mesh(logGeo, bark);
    log.position.set(fx + x, y, Z0 + z);
    log.rotation.set(0, ry, rz);
    log.castShadow = true;
    fire.add(log);
  }
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const m = flameMaterial(i * 1.37);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.52), m);
    p.position.set(fx + (i - 1.5) * 0.06, 0.34, Z0 + 0.16 + (i % 2) * 0.05);
    p.rotation.y = (i - 1.5) * 0.45;
    p.layers.set(LAYER_MAIN_ONLY);
    fire.add(p);
    flames.push(m);
  }
  const fireLight = new THREE.PointLight(0xff8a3c, 0, 9, 2);
  fireLight.position.set(fx, 0.38, Z0 + 0.3);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.bias = -0.002;
  fireLight.shadow.radius = 3;
  fireLight.shadow.camera.near = 0.05;
  fire.add(fireLight);

  // ---- rug
  const rug = box(-0.95, 1.55, 0.002, 0.016, -0.55, 1.35, new THREE.MeshStandardMaterial({
    map: rugTexture(),
    normalMap: tex('caban', 'nor', { size: 0.27 }),
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.96,
  }));
  // rug UVs: map 0..1 over the top face instead of world metres
  const ruv = rug.geometry.attributes.uv;
  const rpos = rug.geometry.attributes.position;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, (rpos.getX(i) + 0.95) / 2.5, (rpos.getZ(i) + 0.55) / 1.9);
  // its own repeat on a copy — made once loaded: a copy of a texture still in
  // flight is "marked for update" with no image, and three warns every frame
  roomTexturesReady().then(() => {
    rug.material.normalMap = rug.material.normalMap.clone();
    rug.material.normalMap.repeat.set(2.5 / 0.27, 1.9 / 0.27);
  });
  rug.castShadow = false;
  root.add(rug);

  // ---- rugged brick edges on the cut + floating chunks (Hozy's "floating building bits")
  const { floaters } = brickRim(root, ROOM);

  // ---- sky cards behind the windows (seen only through the openings)
  const sky = skyCard({ width: Z1 - Z0 + 0.1, height: 2.75, position: [X0 - T - 0.14, 1.375, (Z0 + Z1) / 2 - 0.1] });
  root.add(sky.mesh);

  // ---- invisible shadow-casting ceiling (keeps high sun out of the open top)
  root.add(ceilingCaster(X0, X1 + 0.3, H - 0.02, H + 0.06, Z0, Z1 + 0.3));

  // ---- capture-only sky dome: what GI "sees" through the open top and the
  // cutaway sides. Hozy's rooms read bright and airy because skylight pours in
  // everywhere; a sealed box gave a dim, moody room instead.
  const dome = skyDome();
  root.add(dome.mesh);

  // GI probes must not sit inside the chimney breast
  const blockers = [new THREE.Box3(new THREE.Vector3(fx - 0.95, 0, Z0), new THREE.Vector3(fx + 0.95, H, bz))];
  // fixed shelves the furniture layer can set things on (top face = box.max.y)
  const surfaces = [{ name: 'mantel', box: new THREE.Box3(new THREE.Vector3(fx - 0.84, 1.13, bz), new THREE.Vector3(fx + 0.84, 1.18, bz + 0.2)) }];
  // fixed things floor furniture must not overlap (y matters: a low ottoman fits under a sill)
  const B = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  const obstacles = [
    B(fx - 0.95, 0, Z0, fx + 0.95, H, bz), // chimney breast
    B(fx - 0.84, 0, bz, fx + 0.84, 1.18, bz + 0.42), // surround, mantel, hearth
  ];
  for (const w of WINDOWS) {
    const z0 = w.zc - w.w / 2;
    const z1 = w.zc + w.w / 2;
    obstacles.push(B(X0, w.y0 - 0.04, z0 - 0.08, X0 + 0.08, w.y0, z1 + 0.08)); // sill
    obstacles.push(B(X0, 0, z0 - 0.2, X0 + 0.2, H, z0 + 0.12), B(X0, 0, z1 - 0.12, X0 + 0.2, H, z1 + 0.2)); // curtains
  }

  // walls pictures hang on (decorate.js): a vertical rectangle each, `u` running
  // along it; keepOut = spans a picture would vanish behind (curtains + windows)
  const hang = [
    {
      name: 'left', axis: 'x', sign: 1, at: X0, u: 'z', min: Z0 + 0.03, max: Z1, y0: 0.35, top: H - 0.05, ry: Math.PI / 2,
      keepOut: WINDOWS.map((w) => ({ u0: w.zc - w.w / 2 - 0.2, u1: w.zc + w.w / 2 + 0.2, y0: 0, y1: H })),
    },
    { name: 'back', axis: 'z', sign: 1, at: Z0, u: 'x', min: X0 + 0.03, max: fx - 0.95, y0: 0.35, top: H - 0.05, ry: 0 },
    { name: 'back2', axis: 'z', sign: 1, at: Z0, u: 'x', min: fx + 0.95, max: X1, y0: 0.35, top: H - 0.05, ry: 0 },
    // the chimney breast: above the mantel and what stands on it
    { name: 'chimney', axis: 'z', sign: 1, at: bz, u: 'x', min: fx - 0.95, max: fx + 0.95, y0: 1.26, top: H - 0.05, ry: 0 },
  ];

  const state = { fireOn: 1, fireTarget: 1, fireBase: 11 };
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
    fireplace: obstacles.slice(0, 2), // chimney breast + hearth: floor there is never seen
    rug,
    // the floor's top face (floor.js swaps looks per cell) and the worn-wood maps
    floor: { mat: parquet, worn: slabSide.map, wornNormal: slabSide.normalMap },
    clickTargets: { fire: fire.children.filter((c) => c.isMesh && c.geometry === logGeo) },
    setFire(on) {
      state.fireTarget = on ? 1 : 0;
    },
    get fireOn() {
      return state.fireTarget > 0.5;
    },
    // snap = jump to the target instead of easing (frozen ?still screenshots)
    update(dt, time, snap = false) {
      state.fireOn += (state.fireTarget - state.fireOn) * (snap ? 1 : Math.min(1, dt * 3));
      const flick = 0.82 + 0.1 * Math.sin(time * 13.1) + 0.06 * Math.sin(time * 23.7 + 1.3) + 0.05 * Math.sin(time * 5.3);
      fireLight.intensity = state.fireBase * state.fireOn * flick;
      bark.emissiveIntensity = 1.6 * state.fireOn * (0.8 + 0.2 * flick);
      for (const f of flames) {
        f.uniforms.uTime.value = time;
        f.uniforms.uOn.value = state.fireOn;
      }
      drift(floaters, dt, time);
    },
    // average fire power for GI captures (flicker is too fast to bake)
    fireGI() {
      return state.fireBase * state.fireTarget * 0.85;
    },
  };
}
