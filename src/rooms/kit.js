import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gltfLoader } from '../gltf.js';
import { LAYER_CAPTURE, LAYER_MAIN_ONLY } from '../gi.js';
import { mulberry } from '../atmos.js';

// Room kit: the pieces every room shell and furniture loader shares — level 1's
// versions (room.js / props.js), kept here so the style rooms (cabin, bookshop,
// pottery) stop carrying copies. The lighting plumbing: the fireplace flame card,
// the sky card behind the windows (each room brings its own view), the capture-only
// sky dome and the invisible shadow ceiling (why: docs/lighting-notes.md); the
// diorama's ragged brick rim with its floating chunks; and the glTF helpers
// (cached load, fabric recolour, placing a piece on the floor or a shelf).

// ---- fireplace flame card (additive, main view only; the fire light does the GI)
export const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uOn;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vUv;
  float t = uTime * 1.6 + uSeed * 10.0;
  float n = n2(vec2(p.x * 5.0 + uSeed * 3.0, p.y * 3.0 - t * 1.8)) * 0.6
          + n2(vec2(p.x * 11.0, p.y * 7.0 - t * 3.1)) * 0.4;
  float width = (1.0 - p.y) * 0.42 + 0.04;
  float dx = abs(p.x - 0.5 + (n - 0.5) * 0.18 * p.y);
  float body = smoothstep(width, width * 0.35, dx) * smoothstep(1.0, 0.25, p.y + n * 0.35);
  body *= smoothstep(0.0, 0.08, p.y);
  vec3 col = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.72, 0.28), smoothstep(0.1, 0.9, body));
  gl_FragColor = vec4(col * body * 7.0 * uOn, 1.0);
}
`;
// one flame card's material; the room drives uTime (clock) and uOn (0..1 fade)
export function flameMaterial(seed) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uOn: { value: 1 } },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// ---- sky card behind the windows (seen only through the openings). world.js
// applyTime drives its uniforms via room.sky.uniforms: top, horizon, glow, treeCol,
// glowZ, glowY; vW is the world position. Every room paints its own view with
// them — this default is level 1's rolling wooded hills.
export const SKY_VERT = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
export const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 treeCol;
uniform float glowZ;
uniform float glowY;
varying vec3 vW;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  vec3 sky = mix(horizon, top, smoothstep(0.4, 3.4, vW.y));
  float g = exp(-length(vec2((vW.z - glowZ) * 0.7, (vW.y - glowY) * 1.1)) * 1.4);
  sky += glow * g;
  float ridge = 0.55 + 0.55 * n1(vW.z * 1.1 + 3.0) + 0.22 * n1(vW.z * 3.7) + 0.08 * n1(vW.z * 11.0);
  float tree = smoothstep(ridge + 0.05, ridge - 0.05, vW.y);
  float far = smoothstep(0.35 + 0.25 * n1(vW.z * 0.6 + 9.0) + 0.05, 0.3 + 0.25 * n1(vW.z * 0.6 + 9.0), vW.y);
  vec3 col = mix(sky, mix(sky, treeCol, 0.45), far);
  col = mix(col, treeCol * (0.75 + 0.5 * n1(vW.z * 7.0 + vW.y * 5.0)), tree * 0.9);
  gl_FragColor = vec4(col, 1.0);
}
`;
// a width x height plane at `position`, turned by ry (default: facing +x, i.e.
// standing behind a left wall at x = X0) → { mesh, material }; the room adds the
// mesh and hands the material to world.js as `sky`
export function skyCard({ frag = SKY_FRAG, width, height, position, ry = Math.PI / 2 }) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(1.2, 1.9, 3.2) },
      horizon: { value: new THREE.Color(3.2, 3.1, 2.8) },
      glow: { value: new THREE.Color(0, 0, 0) },
      treeCol: { value: new THREE.Color(0.35, 0.5, 0.25) },
      glowZ: { value: 0 },
      glowY: { value: 2 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: frag,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.rotation.y = ry;
  mesh.position.set(...position);
  return { mesh, material };
}

// ---- capture-only sky dome: what GI "sees" through the open top and the cutaway
// sides. Hozy's rooms read bright and airy because skylight pours in everywhere;
// a sealed box gave a dim, moody room instead. world.js applyTime drives zenith /
// horizonC / ground via room.dome.uniforms. → { mesh, material }
export const DOME_VERT = 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
export const DOME_FRAG = /* glsl */ `
uniform vec3 zenith; uniform vec3 horizonC; uniform vec3 ground; varying vec3 vD;
void main(){
  float y = vD.y;
  vec3 c = y > 0.0 ? mix(horizonC, zenith, pow(y, 0.6)) : mix(horizonC, ground, smoothstep(0.0, 0.25, -y));
  gl_FragColor = vec4(c, 1.0);
}`;
export function skyDome({ radius = 30 } = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(1, 1, 1) },
      horizonC: { value: new THREE.Color(1, 1, 1) },
      ground: { value: new THREE.Color(0.2, 0.18, 0.15) },
    },
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  mesh.layers.set(LAYER_CAPTURE);
  mesh.renderOrder = -10;
  return { mesh, material };
}

// ---- invisible shadow-casting ceiling (keeps high sun out of the open top, so it
// comes in through the windows only): a box that writes neither colour nor depth
export function ceilingCaster(x0, x1, y0, y1, z0, z1) {
  const hidden = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const m = new THREE.Mesh(g, hidden);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

// ---- rugged brick edges on the cut + floating chunks (Hozy's "floating building
// bits"): courses of bricks along the tops of the two walls (x = X0, z = Z0),
// toothing down their open ends, and ten chunks drifting off the cut — every third
// a flake of plaster in `plaster`. Adds it all to root → { floaters } for drift().
export function brickRim(root, { X0, X1, Z0, Z1, H, T }, { plaster = 0xe9dfcf } = {}) {
  const rnd = mulberry(3);
  const brickGeo = new RoundedBoxGeometry(1, 1, 1, 1, 0.08);
  const brickMat = new THREE.MeshStandardMaterial({ color: 0xa8573d, roughness: 0.92 });
  const bricks = [];
  const L = 0.24;
  const Hc = 0.075;
  // tops of the two walls: [start, end, fixed coordinate, axis]
  const runs = [
    { a: Z0 - T, b: Z1, c: X0 - T / 2, axis: 'z' },
    { a: X0, b: X1, c: Z0 - T / 2, axis: 'x' },
  ];
  for (const r of runs) {
    for (let k = 0; k < 4; k++) {
      const off = (k % 2) * L * 0.5;
      for (let s = r.a + off; s < r.b - 0.05; s += L + 0.012) {
        const u = s / 1.3;
        const prof = 1.4 + Math.sin(u * 1.9 + r.c) * 0.9 + Math.sin(u * 4.7) * 0.5 + rnd() * 0.8;
        if (k > prof) continue;
        const len = Math.min(L, r.b - s);
        const cx = s + len / 2;
        const y = H + Hc * (k + 0.5) + 0.004;
        const pos = r.axis === 'z' ? [r.c, y, cx] : [cx, y, r.c];
        const scl = r.axis === 'z' ? [T - 0.02, Hc - 0.008, len] : [len, Hc - 0.008, T - 0.02];
        bricks.push({ pos, scl, rot: (rnd() - 0.5) * 0.04 });
      }
    }
  }
  // toothing along the two cut ends (left wall front end, back wall right end)
  for (let k = 0; k * (Hc + 0.004) < H + 0.2; k++) {
    const y = Hc * (k + 0.5) + k * 0.004;
    if (k % 2 === 0 && rnd() > 0.15) bricks.push({ pos: [X0 - T / 2, y, Z1 + L * 0.25], scl: [T - 0.02, Hc - 0.008, L * 0.5], rot: 0 });
    if (k % 2 === 1 && rnd() > 0.15) bricks.push({ pos: [X1 + L * 0.25, y, Z0 - T / 2], scl: [L * 0.5, Hc - 0.008, T - 0.02], rot: 0 });
  }
  const im = new THREE.InstancedMesh(brickGeo, brickMat, bricks.length);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  bricks.forEach((b, i) => {
    q.setFromEuler(new THREE.Euler(0, b.rot, 0));
    mtx.compose(new THREE.Vector3(...b.pos), q, new THREE.Vector3(...b.scl));
    im.setMatrixAt(i, mtx);
    col.setHSL(0.03 + rnd() * 0.02, 0.45 + rnd() * 0.15, 0.36 + rnd() * 0.12);
    im.setColorAt(i, col);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  root.add(im);

  const floaters = [];
  const chunkMat = new THREE.MeshStandardMaterial({ color: 0xa8573d, roughness: 0.9 });
  const plasterChunk = new THREE.MeshStandardMaterial({ color: plaster, roughness: 0.95 });
  const spots = [
    [X0 - 0.12, H + 0.32, 1.9], [X0 - 0.2, H + 0.5, 0.4], [X0 - 0.08, H + 0.26, -1.3],
    [-1.9, H + 0.36, Z0 - 0.14], [0.4, H + 0.28, Z0 - 0.1], [2.1, H + 0.42, Z0 - 0.18],
    [X1 + 0.26, 2.3, Z0 - 0.12], [X1 + 0.22, 1.2, Z0 - 0.14], [X0 - 0.12, 2.1, Z1 + 0.26], [X0 - 0.1, 0.8, Z1 + 0.22],
  ];
  spots.forEach((p, i) => {
    const isPlaster = i % 3 === 2;
    const m = new THREE.Mesh(brickGeo, isPlaster ? plasterChunk : chunkMat);
    const s = isPlaster ? [0.09, 0.03, 0.07] : [0.12 + rnd() * 0.08, 0.06, 0.1];
    m.scale.set(...s);
    m.position.set(...p);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.layers.set(LAYER_MAIN_ONLY);
    m.userData.base = new THREE.Vector3(...p);
    m.userData.phase = rnd() * 6.28;
    m.userData.spin = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.25);
    root.add(m);
    floaters.push(m);
  });
  return { floaters };
}

// bob + tumble for floating bits (userData: base position, phase, spin), per frame
export function drift(floaters, dt, time) {
  for (const m of floaters) {
    const b = m.userData.base;
    m.position.set(b.x, b.y + Math.sin(time * 0.6 + m.userData.phase) * 0.05, b.z);
    m.rotation.x += m.userData.spin.x * dt;
    m.rotation.y += m.userData.spin.y * dt;
  }
}

// ---- glTF furniture. Each file is fetched and parsed once; every call gets a
// clone. Meshes cast and receive shadows; alpha-cut foliage renders both sides;
// frame glass is hidden (it hid the artwork behind a dark reflection).
// fixTransmission: transmission glass makes three re-render every opaque thing
// into an extra target each frame (-25% fps for one pair of glasses) — swap it
// for plain see-through glass that casts no shadow.
const loader = gltfLoader();
const gltfCache = new Map();
export function loadGLTF(url, { fixTransmission = false } = {}) {
  const key = `${url}|${fixTransmission}`;
  if (!gltfCache.has(key)) {
    gltfCache.set(key, loader.loadAsync(url).then((gltf) => {
      const obj = gltf.scene;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        if (fixTransmission && o.material.transmission > 0) {
          const m = o.material;
          o.material = new THREE.MeshStandardMaterial({ name: m.name, color: m.color, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false });
          o.castShadow = false;
        }
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map) m.map.anisotropy = 8;
          if (m.alphaTest > 0 || m.transparent) m.side = THREE.DoubleSide;
          if (/frame.*_glass$/.test(m.name)) o.visible = false;
        }
      });
      return obj;
    }));
  }
  return gltfCache.get(key).then((obj) => obj.clone(true));
}

// grayscale copy of a glTF base-colour map so any fabric colour can be applied
// while keeping the tufting, seams and baked shading of the original
const grayCache = new WeakMap();
export function grayOf(tex) {
  if (grayCache.has(tex)) return grayCache.get(tex);
  const img = tex.image;
  const w = Math.min(img.width, 1024);
  const h = Math.min(img.height, 1024);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h);
  const px = d.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
  const mean = sum / (px.length / 4);
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / mean;
    const v = Math.max(0, Math.min(255, Math.round(205 * (1 + (l - 1) * 0.75))));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.Texture(c);
  t.flipY = tex.flipY;
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  t.channel = tex.channel;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  grayCache.set(tex, t);
  return t;
}

// fabric swap: spec = { materialName: '#hex' }; a matching textured material becomes
// a copy on the grey map in the new colour (roughness: set on the copy, or null to
// keep the model's own)
export function recolor(obj, spec, { roughness = 1 } = {}) {
  const swapped = new Map();
  const swap = (m) => {
    const hex = spec[m.name];
    if (!hex || !m.map) return m;
    if (!swapped.has(m)) {
      const n = m.clone();
      n.map = grayOf(m.map);
      n.color.set(hex);
      if (roughness !== null) n.roughness = roughness;
      swapped.set(m, n);
    }
    return swapped.get(m);
  };
  obj.traverse((o) => {
    if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}

// a LAYOUT entry's pose: scale, yaw (then an optional lean back about its own x),
// the footprint at (x, z) and the lowest point at y — or the middle at yc (wall art)
export function place(obj, e) {
  obj.scale.setScalar(e.scale ?? 1);
  if (e.lean !== undefined) obj.rotation.set(e.lean, e.ry ?? 0, 0, 'YXZ');
  else obj.rotation.set(0, e.ry ?? 0, 0);
  obj.position.set(e.x, 0, e.z);
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  if (e.yc !== undefined) obj.position.y += e.yc - (b.min.y + b.max.y) / 2;
  else obj.position.y += (e.y ?? 0) - b.min.y;
  obj.updateMatrixWorld(true);
}
