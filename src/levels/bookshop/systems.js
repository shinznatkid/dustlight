import * as THREE from 'three';
import { createMask, clearOf } from '../../masks.js';
import { LAYER_MAIN_ONLY } from '../../gi.js';
export { createPuffs } from '../../puffs.js';

// The bookshop level's own systems (src/levels/bookshop.js):
//   createDust  — dust over the shelves: a canvas over the shelf-front plane (x → right,
//                 height → up) patched into the books' material and the shelf wood, so a
//                 dusty spine is a grey, light, matte version of its own colour and a clean
//                 one is exactly the room's. The probes see the same books: every bay dusted
//                 gives the shop's bounce light its colour back (the level's twist).
//   createGild  — the shop sign's gold leaf: tarnished and flaked at the start, brushed back
//   floorGloss  — the floor mask's dirt also takes the floor's varnish (clearcoat) away
//   createPuffs — (now src/puffs.js, re-exported here)

// ---- dust on the shelves ------------------------------------------------------------------------
const DUST_PARS = /* glsl */`
uniform sampler2D dMask;
uniform vec4 dRect; // x0, y0, x1, y1 (the shelf-front plane: x and height)
uniform float dZ;   // only what stands behind this (the shelves' run)
uniform vec3 dCol;
varying vec3 vDustP;
varying vec3 vDustN;
`;
const DUST_COLOR = /* glsl */`
float dA = 0.0;
if (vDustP.z < dZ && vDustP.x > dRect.x && vDustP.x < dRect.z && vDustP.y > dRect.y && vDustP.y < dRect.w) {
  dA = texture2D(dMask, vec2((vDustP.x - dRect.x) / (dRect.z - dRect.x), (dRect.w - vDustP.y) / (dRect.w - dRect.y))).a;
  // dust settles thicker on what faces up (the tops of the books, the boards)
  dA = min(1.0, dA * (vDustN.y > 0.5 ? 1.3 : 1.0));
  float dL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  vec3 dusty = mix(vec3(dL), diffuseColor.rgb, 0.24) * 0.55 + dCol * 0.5;
  diffuseColor.rgb = mix(diffuseColor.rgb, dusty, dA);
}
`;

function patchDust(mat, uniforms, id) {
  const prevHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDustP;\nvarying vec3 vDustN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDustP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDustN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DUST_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${DUST_COLOR}`)
      // dusty cloth and foil are matte: the gold titles glint again once they're clean
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, dA);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, dA);');
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `dust1|${id}|${prevKey ? prevKey() : ''}`;
  mat.needsUpdate = true;
}

// which mask pixels are the spines of books (what the % counts): every book of the merged
// mesh (books.js Shelf: 6 faces × 4 vertices, the spine first) whose spine faces out in the frame
function spineArea(geo, { x0, y0, y1, zMax }, W, H, px) {
  const ok = new Uint8Array(W * H);
  const p = geo.attributes.position.array;
  const n = geo.attributes.normal.array;
  const books = Math.floor(p.length / 3 / 24);
  for (let b = 0; b < books; b++) {
    const v = b * 24;
    if (n[v * 3 + 2] < 0.5) continue; // spine not facing the room
    let ax = Infinity;
    let bx = -Infinity;
    let ay = Infinity;
    let by = -Infinity;
    let z = 0;
    for (let k = 0; k < 4; k++) {
      const i = (v + k) * 3;
      ax = Math.min(ax, p[i]);
      bx = Math.max(bx, p[i]);
      ay = Math.min(ay, p[i + 1]);
      by = Math.max(by, p[i + 1]);
      z += p[i + 2] / 4;
    }
    if (z > zMax) continue;
    const i0 = Math.max(0, Math.round((ax - x0) * px));
    const i1 = Math.min(W, Math.round((bx - x0) * px));
    const j0 = Math.max(0, Math.round((y1 - by) * px));
    const j1 = Math.min(H, Math.round((y1 - ay) * px));
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) ok[j * W + i] = 1;
  }
  return ok;
}

// spec: sites.dust ({ x0, x1, y0, y1, zMax }) · planes: sites.shelves (what the duster aims at:
// [{ item, at, x0, x1, y0, y1 }], planes z = at facing the room) · books: the merged books mesh
// (what counts) · mats: every material the dust lies on
export function createDust({ spec, planes, books, mats, id = 'dust', px = 80 }) {
  const { x0, x1, y0, y1, zMax } = spec;
  const W = Math.round((x1 - x0) * px);
  const H = Math.round((y1 - y0) * px);
  const mask = createMask(W, H, { valid: spineArea(books.geometry, spec, W, H, px), flipY: false });
  const uniforms = {
    dMask: { value: mask.tex },
    dRect: { value: new THREE.Vector4(x0, y0, x1, y1) },
    dZ: { value: zMax },
    dCol: { value: new THREE.Color('#bdb3a3') },
  };
  for (const m of mats) patchDust(m, uniforms, id);
  const pix = (x, y) => ({ px: (x - x0) * px, py: (y1 - y) * px });
  const N = new THREE.Vector3(0, 0, 1);
  const at = new THREE.Vector3();
  const alpha = (ppx, ppy) => {
    const i = Math.round(ppx);
    const j = Math.round(ppy);
    if (i < 0 || j < 0 || i >= W || j >= H) return 0;
    return mask.g.getImageData(i, j, 1, 1).data[3] / 255;
  };

  return {
    mask,
    px,
    planes,
    // the shelf front under a ray (nearest plane whose run it falls on), as a surface
    // tool's hit ({ item, point, normal, px, py })
    hit(ray) {
      let best = null;
      for (const pl of planes) {
        if (ray.direction.z >= -1e-4) continue;
        const t = (pl.at - ray.origin.z) / ray.direction.z;
        if (t <= 0 || (best && t >= best.t)) continue;
        ray.at(t, at);
        if (at.x < pl.x0 || at.x > pl.x1 || at.y < pl.y0 || at.y > pl.y1) continue;
        best = { t, item: pl.item, point: at.clone(), normal: N.clone(), ...pix(at.x, at.y) };
      }
      return best;
    },
    plane: (item) => planes.find((p) => p.item === item),
    pixelOf: (p) => pix(p.x, p.y),
    // how much dust is left under a spot (0..1): the puffs
    alpha,
    // clean share of the spines (a faint haze doesn't count)
    get progress() { return 1 - mask.coverage(70); },
    // years of it: an even blanket, heavier up high (and on the top boards nobody reached),
    // a little lighter where a hand pulled a book now and then
    dirty(rand) {
      const g = mask.g;
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#000';
      g.globalAlpha = 0.84;
      g.fillRect(0, 0, W, H);
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.5, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.6;
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
      for (let k = 0; k < 70; k++) {
        const x = rand() * W;
        const y = rand() * H;
        const r = (0.12 + rand() * 0.4) * px;
        const b = g.createRadialGradient(x, y, 0, x, y, r);
        b.addColorStop(0, '#000');
        b.addColorStop(1, clearOf('#000000'));
        g.globalAlpha = 0.25 + rand() * 0.35;
        g.fillStyle = b;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 16; k++) {
        const x = rand() * W;
        const y = H * (0.35 + rand() * 0.6);
        g.globalAlpha = 0.18 + rand() * 0.2;
        g.fillRect(x, y, (0.03 + rand() * 0.08) * px, (0.12 + rand() * 0.15) * px);
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      mask.touch();
      mask.flush();
    },
    clean() { mask.fill(null); mask.flush(); },
    wipe(ppx, ppy, r, strength) { mask.dab(ppx, ppy, r, { erase: true, strength }); },
    flush: () => mask.flush(),
    serialize: () => mask.toDataURL(),
    restore: (url) => mask.load(url).then(() => mask.flush()),
  };
}

// ---- cobwebs in the shelves' corners: they go with the dust under them --------------------------------
// sites.webs: [{ at: corner [x, y, z], side: -1 (hangs right of a left corner) | 1, r }] on the
// shelf fronts. A web tears away (a puff, a fade) once the duster has taken the dust under it.
function webTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(240,236,228,0.9)';
  g.lineCap = 'round';
  // threads out from the corner (top-left of the canvas), a sagging spiral across them
  const spokes = 7;
  const ang = (k) => (k / (spokes - 1)) * (Math.PI / 2) * 0.96 + 0.02;
  g.lineWidth = 4.5;
  for (let k = 0; k < spokes; k++) {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(ang(k)) * S * 1.02, Math.sin(ang(k)) * S * 1.02);
    g.stroke();
  }
  g.lineWidth = 3.2;
  for (let r = 22; r < S * 0.98; r += 20 + r * 0.06) {
    g.beginPath();
    for (let k = 0; k < spokes; k++) {
      const a = ang(k);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (!k) g.moveTo(x, y);
      else {
        const m = (ang(k - 1) + a) / 2;
        const rr = r * 0.9; // the thread sags between spokes
        g.quadraticCurveTo(Math.cos(m) * rr, Math.sin(m) * rr, x, y);
      }
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function createWebs(world, dust, puffs, spots) {
  const map = webTexture();
  const webs = spots.map((s) => {
    const mat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, color: 0xffffff });
    // the unit plane with its top-left corner at the origin, hanging down and inwards
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, -0.5, 0), mat);
    m.scale.set(-s.side * s.r, s.r, 1);
    m.position.fromArray(s.at);
    m.layers.set(LAYER_MAIN_ONLY);
    m.renderOrder = 2;
    m.name = 'cobweb';
    world.scene.add(m);
    // the dust that holds it: a little way in from the corner
    const p = new THREE.Vector3(s.at[0] - s.side * s.r * 0.3, s.at[1] - s.r * 0.3, s.at[2]);
    return { m, mat, s, p, px: dust.pixelOf(p), fade: 0, on: true };
  });
  const set = (w, on) => {
    w.on = on;
    w.fade = 0;
    w.m.visible = on;
    w.mat.opacity = 1;
    w.m.scale.set(-w.s.side * w.s.r, w.s.r, 1);
  };
  let checkT = 0;
  return {
    webs,
    fresh() { for (const w of webs) set(w, true); },
    clean() { for (const w of webs) set(w, false); },
    // after a save comes back: only where the dust still is
    sync() { for (const w of webs) set(w, dust.alpha(w.px.px, w.px.py) > 0.35); },
    update(dt) {
      checkT -= dt;
      const check = checkT <= 0;
      if (check) checkT = 0.12;
      for (const w of webs) {
        if (w.fade > 0) {
          w.fade = Math.max(0, w.fade - dt / 0.35);
          w.mat.opacity = w.fade;
          w.m.scale.y *= 1 - dt * 1.5; // it tears and falls away
          if (w.fade <= 0) set(w, false);
        } else if (check && w.on && dust.alpha(w.px.px, w.px.py) < 0.35) {
          w.on = false;
          w.fade = 1;
          puffs.emit(w.p, new THREE.Vector3(0, 0, 1), 6, { color: '#ece6da', size: 0.12, spread: 0.1, speed: 0.25, life: 1.2, alpha: 0.45 });
        }
      }
    },
  };
}

// ---- the shop sign's gold leaf -------------------------------------------------------------------
// the sign face (props.js signMesh): a canvas map + a props canvas whose blue channel is the
// metalness, i.e. where the gold leaf is. Tarnished: the leaf flaked off down to the brown
// size underneath, the green board faded by years of sun through the window
const GILD_COLOR = /* glsl */`
float tA = texture2D(tMask, vMapUv).a;
{
  // (the letters' soft edges count as leaf too: no pale rim round the brown)
  float gold = smoothstep(0.1, 0.45, texture2D(metalnessMap, vMetalnessMapUv).b);
  vec3 size = vec3(0.15, 0.08, 0.028);
  float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  vec3 faded = mix(vec3(l), diffuseColor.rgb, 0.45) * 1.7 + vec3(0.02, 0.019, 0.016);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(faded, size, gold), tA);
}
`;
export function createGild(world, { entryId = 'sign' }) {
  const e = world.decor.entries.find((x) => x.id === entryId);
  let mesh = null;
  e.holder.traverse((o) => { if (o.userData.face) mesh = o; });
  const face = mesh.userData.face;
  const [SW, SH] = mesh.userData.size;
  const W = 256;
  const H = Math.round((W * SH) / SW);
  // what counts: the gold leaf (letters, rules, dots), from the sign's own props canvas
  const src = face.metalnessMap.image;
  const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
  const valid = new Uint8Array(W * H);
  const sx = src.width / W;
  const sy = src.height / H;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let gold = 0;
      for (let b = 0; b < sy && !gold; b++) for (let a = 0; a < sx; a++) if (d[((Math.floor(j * sy + b)) * src.width + Math.floor(i * sx + a)) * 4 + 2] > 128) { gold = 1; break; }
      valid[j * W + i] = gold;
    }
  }
  const mask = createMask(W, H, { valid });
  const prevHook = face.onBeforeCompile;
  face.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(face, shader, renderer);
    shader.uniforms.tMask = { value: mask.tex };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tMask;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GILD_COLOR}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, tA);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, tA);');
  };
  const prevKey = face.customProgramCacheKey?.bind(face);
  face.customProgramCacheKey = () => `gild1|${prevKey ? prevKey() : ''}`;
  face.needsUpdate = true;

  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  const normal = () => new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
  const sys = {
    mesh,
    mask,
    ppm: W / SW, // mask pixels per metre
    size: [SW, SH],
    // the sign face under the pointer: a surface tool's hit
    hit(ndc, camera) {
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObject(mesh, false)[0];
      if (!h || h.face?.materialIndex !== 4 || !h.uv) return null;
      return { item: sys, point: h.point, normal: normal(), px: h.uv.x * W, py: (1 - h.uv.y) * H };
    },
    normal,
    // a point on the face, (u, v) metres from its centre (the title timelapse)
    point(u, v) {
      return new THREE.Vector3(u, v, 0.018).applyMatrix4(mesh.matrixWorld);
    },
    get progress() { return 1 - mask.coverage(70); },
    dirty(rand) {
      const g = mask.g;
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      // a few flecks of the old leaf still hang on
      g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 26; k++) {
        g.globalAlpha = 0.3 + rand() * 0.4;
        g.beginPath();
        g.arc(rand() * W, rand() * H, 1 + rand() * 3.5, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      mask.touch();
      mask.flush();
    },
    clean() { mask.fill(null); mask.flush(); },
    brush(ppx, ppy, r, strength) { mask.dab(ppx, ppy, r, { erase: true, strength }); },
    flush: () => mask.flush(),
    serialize: () => mask.toDataURL(),
    restore: (url) => mask.load(url).then(() => mask.flush()),
  };
  return sys;
}

// ---- the floor's varnish ------------------------------------------------------------------------------
// floormask.js greys and dulls the floor (colour, roughness); the clearcoat of a varnished floor
// would still shine through as if wet: it goes with the dirt (fmA: floormask's dirt at the fragment)
export function floorGloss(mat) {
  const prevHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - fmA;\n#endif');
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `floorgloss1|${prevKey ? prevKey() : ''}`;
  mat.needsUpdate = true;
}

