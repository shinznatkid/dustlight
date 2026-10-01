import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { skyCard, skyDome, ceilingCaster, drift } from '../kit.js';
import { PAL, std, tiles, Bucket, mtx, pot, rng } from './kit.js';
import { ROOM, WIN, WAIN, SILL, FRAME, KITCHEN, HOB, SINK, AC } from './layout.js';

// The neon flat's shell: a cutaway diorama (back wall z = Z0, left wall x = X0, open
// towards +x / +z) in flat low-poly colours — peach plaster over a mint-tiled dado, a honey
// plank floor with a gloss that catches the neon, a wide teal-framed window onto the rainy
// city — plus the fixed kitchenette (tiled splash, open shelf, sink, a gas hob with the
// noodle pot: the room's "fire") and an air conditioner. Same lighting plumbing as the
// other rooms (../kit.js): a sky card behind the window (here the city at night: towers,
// lit windows, the neon across the street, rain), a capture-only sky dome for the probes,
// an invisible shadow ceiling.

// ---- the view: the city across the street ------------------------------------------------------
// world.js drives top / horizon / glow / treeCol (the buildings' tone) / glowZ / glowY by the time
// of day; uTime (room update) moves the rain and the signs' flicker. The city's lights come on as
// the sky darkens (`lights`), so by day it's a hazy pastel skyline with its signs dark.
const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 treeCol;
uniform float glowZ;
uniform float glowY;
uniform float uTime;
varying vec3 vW;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// inside a box (centre c, half size s) → 0..1 with a soft edge of e
float rect(vec2 p, vec2 c, vec2 s, float e) { vec2 d = abs(p - c) - s; return 1.0 - smoothstep(0.0, e, max(d.x, d.y)); }
// a neon line: distance to a segment → glow core + halo
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float tubeL(float d) { return smoothstep(0.012, 0.004, d); }
void main() {
  vec2 p = vec2(vW.z, vW.y);
  float lights = 1.0 - smoothstep(0.35, 1.5, top.b); // the city lights up as the sky darkens
  vec3 sky = mix(horizon, top, smoothstep(0.7, 3.0, p.y));
  sky += glow * exp(-length(vec2((p.x - glowZ) * 0.7, (p.y - glowY) * 1.1)) * 1.4);
  vec3 c = sky;
  // far towers (hazy), each with its own height, a few with a mast and a red light
  float cw = 0.36;
  float cell = floor(p.x / cw);
  float fx = fract(p.x / cw);
  float hF = 1.7 + 1.0 * h1(cell * 3.1 + 1.0);
  float inF = step(p.y, hF) * step(0.05, fx) * step(fx, 0.96);
  float mast = step(0.7, h1(cell + 9.0)) * step(abs(fx - 0.5), 0.02) * step(p.y, hF + 0.22) * step(hF, p.y);
  vec3 farCol = mix(treeCol * 2.0 + vec3(0.01, 0.01, 0.03), sky, 0.35);
  c = mix(c, farCol, max(inF, mast));
  c += vec3(2.5, 0.2, 0.2) * lights * step(0.7, h1(cell + 9.0)) * rect(p, vec2((cell + 0.5) * cw, hF + 0.23), vec2(0.012), 0.006) * (0.6 + 0.4 * sin(uTime * 2.0 + cell));
  vec2 wg = vec2(p.x / 0.06, p.y / 0.08);
  vec2 wi = floor(wg);
  vec2 wf = fract(wg);
  float win = step(0.28, wf.x) * step(wf.x, 0.72) * step(0.3, wf.y) * step(wf.y, 0.78) * step(p.y, hF - 0.1);
  float on = step(0.58, h2(wi + cell * 7.0));
  vec3 winCol = mix(vec3(1.0, 0.7, 0.38), vec3(0.45, 0.75, 1.2), step(0.78, h2(wi * 1.3 + 2.0)));
  c = mix(c, c * 0.82, inF * win * (1.0 - lights) * 0.6);
  c += inF * win * on * winCol * lights * 0.75;
  // the building across the street: a facade below ~1.4 m with big windows, air conditioners
  float nearTop = 1.38 + 0.06 * step(0.0, p.x);
  float inN = step(p.y, nearTop);
  vec3 nearCol = treeCol * 1.5 + vec3(0.012, 0.01, 0.025);
  c = mix(c, nearCol, inN);
  vec2 ng = vec2((p.x + 2.0) / 0.34, p.y / 0.36);
  vec2 ni = floor(ng);
  vec2 nf = fract(ng);
  float nwin = inN * step(0.14, nf.x) * step(nf.x, 0.86) * step(0.18, nf.y) * step(nf.y, 0.8) * step(p.y, nearTop - 0.1);
  float non = step(0.35, h2(ni + 31.0));
  vec3 ncol = mix(vec3(1.0, 0.62, 0.32), mix(vec3(1.0, 0.45, 0.7), vec3(0.4, 0.9, 1.1), step(0.5, h2(ni + 5.0))), step(0.72, h2(ni + 17.0)));
  c = mix(c, mix(nearCol * 0.6, ncol * (0.35 + 0.65 * lights) * mix(0.25, 1.0, non * lights), 1.0), nwin);
  // curtains half drawn in some
  c = mix(c, nearCol * 1.4 + vec3(0.02), nwin * step(0.6, h2(ni + 3.0)) * step(nf.x, 0.45));
  float acs = inN * rect(nf, vec2(0.5, 0.08), vec2(0.22, 0.07), 0.01) * step(0.55, h2(ni + 11.0));
  c = mix(c, vec3(0.55, 0.55, 0.6) * (0.25 + 0.75 * (1.0 - lights)) + nearCol * 0.3, acs);
  // its neon: a tall pink sign with three glyphs, a cyan band, a small amber bowl
  float flick = 0.85 + 0.15 * step(0.08, fract(uTime * 0.37 + 0.2)); // a tube that stutters
  vec3 PINK = vec3(3.2, 0.35, 1.6);
  vec3 CYAN = vec3(0.3, 2.4, 3.2);
  vec3 AMBER = vec3(3.0, 1.4, 0.3);
  vec2 vc = vec2(-0.78, 1.12);
  float vpanel = rect(p, vc, vec2(0.15, 0.62), 0.01);
  c = mix(c, vec3(0.03, 0.02, 0.05) + nearCol * 0.3, vpanel);
  float dv = abs(max(abs(p.x - vc.x) - 0.13, abs(p.y - vc.y) - 0.6));
  float g = 0.0;
  for (int k = 0; k < 3; k++) {
    vec2 q = p - vec2(vc.x, vc.y + 0.36 - float(k) * 0.36);
    float d = 1e3;
    if (k == 0) { d = min(seg(q, vec2(-0.08, 0.1), vec2(0.08, 0.1)), seg(q, vec2(0.0, 0.12), vec2(0.0, -0.12))); d = min(d, seg(q, vec2(-0.08, -0.05), vec2(0.08, -0.12))); }
    if (k == 1) { d = abs(length(q) - 0.09); d = min(d, seg(q, vec2(-0.09, 0.0), vec2(0.09, 0.0))); }
    if (k == 2) { d = min(seg(q, vec2(-0.09, -0.1), vec2(0.0, 0.1)), seg(q, vec2(0.0, 0.1), vec2(0.09, -0.1))); d = min(d, seg(q, vec2(-0.05, -0.02), vec2(0.05, -0.02))); }
    g = max(g, tubeL(d));
  }
  g = max(g, tubeL(dv));
  float band = rect(p, vec2(0.38, 1.18), vec2(0.34, 0.09), 0.01);
  c = mix(c, vec3(0.02, 0.03, 0.05) + nearCol * 0.3, band);
  float wave = abs(p.y - 1.18 - 0.035 * sin((p.x - 0.04) * 38.0)) ;
  float gc = tubeL(max(wave, abs(p.x - 0.38) - 0.3));
  gc = max(gc, tubeL(abs(max(abs(p.x - 0.38) - 0.32, abs(p.y - 1.18) - 0.07))));
  vec2 bq = p - vec2(-0.3, 0.72);
  float db = abs(length(bq * vec2(1.0, 1.6)) - 0.1);
  db = max(db, bq.y);
  db = min(db, seg(bq, vec2(-0.13, 0.0), vec2(0.13, 0.0)));
  float ga = tubeL(db) * rect(p, vec2(-0.3, 0.7), vec2(0.16, 0.1), 0.01);
  float lit = lights * flick;
  c = mix(c, PINK * lit + vec3(0.25, 0.2, 0.25) * (1.0 - lights), g * max(lights, 0.4));
  c = mix(c, CYAN * lights + vec3(0.2, 0.25, 0.27) * (1.0 - lights), gc * max(lights, 0.4));
  c = mix(c, AMBER * lights + vec3(0.25, 0.22, 0.18) * (1.0 - lights), ga * max(lights, 0.4));
  // their glow in the wet air
  float haloP = exp(-length((p - vc) * vec2(3.2, 1.3)) * 2.2);
  float haloC = exp(-length((p - vec2(0.38, 1.18)) * vec2(1.4, 4.0)) * 2.2);
  c += (PINK * haloP * 0.22 * lit + CYAN * haloC * 0.16 * lights);
  // rain: slanted streaks falling, brighter where the neon lights them
  vec2 r = vec2(p.x * 34.0 + p.y * 4.0, p.y * 1.4 + uTime * 6.5);
  float col = floor(r.x);
  float rf = fract(r.y * 0.8 + h1(col * 1.7) * 9.0);
  float streak = (1.0 - smoothstep(0.0, 0.14, abs(fract(r.x) - 0.5))) * smoothstep(0.0, 0.03, rf) * (1.0 - smoothstep(0.1, 0.16, rf));
  streak *= step(0.35, h1(col * 3.3));
  c += streak * (0.1 + 0.4 * lights) * (vec3(0.55, 0.62, 0.8) + (PINK * haloP + CYAN * haloC) * 0.6 * lights);
  gl_FragColor = vec4(c, 1.0);
}
`;

// ---- rain on the window glass: still beads, and drops that run down leaving a trail ------------------
const RAIN_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 top;
varying vec2 vUv;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 uv = vUv * vec2(1.9, 1.56); // metres on the glass
  vec2 g = uv * vec2(26.0, 22.0);
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5 - (vec2(h2(id + 1.0), h2(id + 2.0)) - 0.5) * 0.5;
  float r = 0.1 + 0.14 * h2(id);
  float bead = smoothstep(r, r * 0.45, length(f * vec2(1.0, 1.25))) * step(0.5, h2(id + 5.0));
  float col = floor(uv.x * 11.0);
  float ch = h2(vec2(col, 7.0));
  float y = fract(uv.y * 0.55 + uTime * (0.12 + ch * 0.2) + ch * 9.0);
  float fx = fract(uv.x * 11.0) - 0.5 - 0.12 * sin(uv.y * 14.0 + ch * 6.0);
  float drop = smoothstep(0.16, 0.05, length(vec2(fx * 1.1, (y - 0.06) * 5.0))) * step(0.3, ch);
  float trail = smoothstep(0.06, 0.0, abs(fx)) * smoothstep(0.06, 0.4, y) * (1.0 - smoothstep(0.4, 0.8, y)) * 0.5 * step(0.3, ch);
  float a = clamp(max(bead, drop) * 0.6 + trail * 0.35, 0.0, 1.0);
  float night = 1.0 - smoothstep(0.35, 1.5, top.b);
  vec3 c = mix(vec3(0.75, 0.8, 0.9), vec3(1.3, 0.75, 1.6), night) * (0.55 + 0.6 * max(bead, drop));
  gl_FragColor = vec4(c, a * (0.55 + 0.45 * night));
}
`;

// ---- the stove's flames: gas blue at the root, a warm tip ------------------------------------------
const FLAME_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uOn;
varying vec2 vUv;
void main() {
  vec2 p = vUv;
  float w = (1.0 - p.y) * 0.45 + 0.05;
  float sway = sin(uTime * 17.0 + uSeed * 5.0) * 0.05 * p.y;
  float body = smoothstep(w, w * 0.3, abs(p.x - 0.5 + sway)) * smoothstep(1.0, 0.35, p.y + 0.12 * sin(uTime * 23.0 + uSeed * 9.0)) * smoothstep(0.0, 0.12, p.y);
  vec3 col = mix(vec3(0.25, 0.45, 1.6), vec3(1.6, 0.8, 0.35), smoothstep(0.35, 0.9, p.y));
  gl_FragColor = vec4(col * body * 4.0 * uOn, 1.0);
}
`;
function flameMat(seed) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uOn: { value: 0 } },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// soft round puff for steam
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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
const bbox = (b, x0, x1, y0, y1, z0, z1, hex, o = {}) => b.add(unitBox, hex, { m: mtx([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, 0], [x1 - x0, y1 - y0, z1 - z0]), ...o });
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

// a thin tiled panel with UVs in metres (tile texture repeats every `rep` m); normal along
// `axis` (+1 side), spanning (a0..a1) × (y0..y1) in the plane p[axis] = at
function tilePanel(axis, at, a0, a1, y0, y1, mat, rep = 0.4) {
  const g = new THREE.PlaneGeometry(a1 - a0, y1 - y0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (a0 + uv.getX(i) * (a1 - a0)) / rep, (y0 + uv.getY(i) * (y1 - y0)) / rep);
  const m = new THREE.Mesh(g, mat);
  if (axis === 'x') {
    m.rotation.y = Math.PI / 2;
    m.position.set(at, (y0 + y1) / 2, (a0 + a1) / 2);
  } else m.position.set((a0 + a1) / 2, (y0 + y1) / 2, at);
  m.receiveShadow = true;
  return m;
}

export function buildShell(scene) {
  const { X0, X1, Z0, Z1, H, T } = ROOM;
  const root = new THREE.Group();
  root.name = 'room';
  scene.add(root);
  const rnd = rng(13);

  // ---- materials
  const plaster = std(PAL.plaster, { roughness: 0.95 });
  const core = std('#8a8494'); // the cut wall's concrete core
  const slabMat = std(PAL.slab);
  const beamMat = std(PAL.beam);
  const mintTiles = new THREE.MeshStandardMaterial({ map: tiles(PAL.mint, PAL.grout, { n: 4, seed: 3 }), roughness: 0.3 });
  const creamTiles = new THREE.MeshStandardMaterial({ map: tiles(PAL.cream, '#d8cdbd', { n: 4, seed: 7, jitter: 0.03 }), roughness: 0.28 });

  // ---- floor: slab + honey planks (one merged mesh, a colour per plank; glossy enough to
  // catch the signs once it's clean — the level's mud mask makes the dirty parts dull)
  const PT = 0.035;
  root.add(box(X0 - T, X1 + 0.12, -0.3, -PT, Z0 - T, Z1 + 0.12, slabMat));
  const planks = [];
  const W = 0.18;
  const GAP = 0.006;
  for (let x = X0 - T, row = 0; x < X1 + 0.12 - 0.01; x += W, row++) {
    const xw = Math.min(W, X1 + 0.12 - x);
    let z = Z0 - T - (row % 3) * 0.4;
    while (z < Z1 + 0.12) {
      const len = 0.8 + rnd() * 1.0;
      const za = Math.max(z, Z0 - T);
      const zb = Math.min(z + len, Z1 + 0.12);
      if (zb - za > 0.05) planks.push({ x0: x + GAP / 2, x1: x + xw - GAP / 2, z0: za + GAP / 2, z1: zb - GAP / 2 });
      z += len;
    }
  }
  const plankMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, vertexColors: true });
  const base = new THREE.Color(PAL.floor);
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
  for (const [x, z] of [[-2.9, -2.4], [-2.9, 2.4], [2.9, -2.4], [2.9, 2.4], [0, 2.4], [2.9, 0], [-1.5, 2.4], [1.5, 2.4]]) {
    root.add(box(x - 0.16, x + 0.16, -0.6, -0.3, z - 0.16, z + 0.16, beamMat));
  }

  // ---- walls: plaster inside, concrete core on the cut faces
  root.add(box(X0, X1, 0, H, Z0 - T, Z0, [core, plaster, core, plaster, plaster, plaster]));
  const wx0 = X0 - T;
  const lm = (end = false, top = false) => [plaster, plaster, top ? core : plaster, plaster, end ? core : plaster, plaster];
  const { z0: wz0, z1: wz1 } = FRAME;
  root.add(box(wx0, X0, 0, WIN.y0, Z0 - T, Z1, lm(true)));
  root.add(box(wx0, X0, WIN.y1, H, Z0 - T, Z1, lm(true, true)));
  root.add(box(wx0, X0, WIN.y0, WIN.y1, Z0 - T, wz0, lm()));
  root.add(box(wx0, X0, WIN.y0, WIN.y1, wz1, Z1, lm(true)));

  // ---- the mint-tiled dado on both walls (the kitchen has its own tiles), a teal rail on it
  root.add(tilePanel('z', Z0 + 0.004, X0, KITCHEN.x0, 0.09, WAIN, mintTiles));
  root.add(tilePanel('z', Z0 + 0.004, KITCHEN.x1, X1, 0.09, WAIN, mintTiles));
  root.add(tilePanel('x', X0 + 0.004, Z0, Z1, 0.09, WAIN, mintTiles));
  root.add(tilePanel('z', Z0 + 0.004, KITCHEN.x0, KITCHEN.x1, KITCHEN.top, KITCHEN.splash, creamTiles, 0.36));

  const trim = new Bucket();
  bbox(trim, X0, X1, WAIN, WAIN + 0.05, Z0, Z0 + 0.04, PAL.teal);
  bbox(trim, X0, X0 + 0.04, WAIN, WAIN + 0.05, Z0, Z1, PAL.teal);
  bbox(trim, X0, X1, 0, 0.09, Z0, Z0 + 0.03, PAL.tealDark);
  bbox(trim, X0, X0 + 0.03, 0, 0.09, Z0, Z1, PAL.tealDark);
  // a trim along the top of the kitchen tiles
  bbox(trim, KITCHEN.x0, KITCHEN.x1, KITCHEN.splash, KITCHEN.splash + 0.025, Z0, Z0 + 0.025, PAL.teal);

  // window: frame (mid-wall), mullion, transom, a teal casing on the room side, a deep sill
  const fx = FRAME.x;
  const fr = (y0, y1, za, zb, d = 0.045) => bbox(trim, fx - d, fx + d, y0, y1, za, zb, PAL.teal);
  fr(WIN.y1 - 0.08, WIN.y1, wz0, wz1);
  fr(WIN.y0, WIN.y0 + 0.07, wz0, wz1);
  fr(WIN.y0, WIN.y1, wz0, wz0 + 0.08);
  fr(WIN.y0, WIN.y1, wz1 - 0.08, wz1);
  fr(WIN.y0, WIN.y1, FRAME.mullion - 0.035, FRAME.mullion + 0.035, 0.035);
  fr(FRAME.transom - 0.025, FRAME.transom + 0.025, wz0, wz1, 0.035);
  const cz = (za, zb, y0, y1) => bbox(trim, X0 - 0.01, X0 + 0.03, y0, y1, za, zb, PAL.teal);
  cz(wz0 - 0.1, wz0, WIN.y0, WIN.y1 + 0.1);
  cz(wz1, wz1 + 0.1, WIN.y0, WIN.y1 + 0.1);
  cz(wz0 - 0.1, wz1 + 0.1, WIN.y1, WIN.y1 + 0.1);
  bbox(trim, X0 - T * 0.5, SILL.x1, SILL.y - 0.05, SILL.y, SILL.z0, SILL.z1, PAL.woodPale);
  bbox(trim, X0, SILL.x1 - 0.03, SILL.y - 0.12, SILL.y - 0.05, SILL.z0 + 0.05, SILL.z1 - 0.05, PAL.teal);

  // ---- the kitchenette: mustard cabinets with a wood top, sink, gas hob; open shelf above
  const K = KITCHEN;
  const kz1 = Z0 + K.d;
  bbox(trim, K.x0 + 0.02, K.x1 - 0.02, 0, 0.1, Z0, kz1 - 0.05, PAL.dark); // plinth
  bbox(trim, K.x0, K.x1, 0.1, K.top - 0.04, Z0, kz1 - 0.02, PAL.mustard);
  const doors = 3;
  for (let i = 0; i < doors; i++) {
    const a = K.x0 + ((K.x1 - K.x0) * i) / doors;
    const b = K.x0 + ((K.x1 - K.x0) * (i + 1)) / doors;
    bbox(trim, a + 0.025, b - 0.025, 0.14, K.top - 0.1, kz1 - 0.02, kz1 - 0.005, '#f4c566');
    const kx = i % 2 ? a + 0.07 : b - 0.07;
    trim.add(new THREE.SphereGeometry(0.018, 6, 4), PAL.teal, { m: mtx([kx, K.top - 0.2, kz1 + 0.005]) });
  }
  bbox(trim, K.x0 - 0.02, K.x1 + 0.02, K.top - 0.04, K.top, Z0, kz1 + 0.02, PAL.wood); // worktop
  // sink: a steel rim and basin, a tap
  bbox(trim, SINK.x - 0.24, SINK.x + 0.24, K.top, K.top + 0.012, SINK.z - 0.17, SINK.z + 0.17, PAL.steel, { mat: 'gloss' });
  bbox(trim, SINK.x - 0.2, SINK.x + 0.2, K.top + 0.001, K.top + 0.013, SINK.z - 0.13, SINK.z + 0.13, '#6f777f', { mat: 'gloss' });
  trim.add(cyl(0.014, 0.018, 0.26, 8), PAL.steel, { m: mtx([SINK.x, K.top + 0.13, Z0 + 0.08]), mat: 'gloss' });
  trim.add(new THREE.TorusGeometry(0.07, 0.012, 5, 10, Math.PI), PAL.steel, { m: mtx([SINK.x, K.top + 0.26, Z0 + 0.15], [0, Math.PI / 2, 0]), mat: 'gloss' });
  // the shelf and its brackets, a rail of utensils under it
  bbox(trim, K.x0 + 0.05, K.x1 - 0.05, K.shelfY - 0.03, K.shelfY, Z0, Z0 + K.shelfD, PAL.woodPale);
  for (const x of [K.x0 + 0.2, K.x1 - 0.2]) trim.add(unitBox, PAL.woodDark, { m: mtx([x, K.shelfY - 0.12, Z0 + 0.09], [0.75, 0, 0], [0.035, 0.03, 0.24]) });
  bbox(trim, K.x0 + 0.4, K.x1 - 0.5, 1.68, 1.695, Z0 + 0.03, Z0 + 0.045, PAL.steel, { mat: 'gloss' });
  // ---- the air conditioner, high on the back wall (with its pipe running off to the side)
  bbox(trim, AC.x - 0.42, AC.x + 0.42, AC.y - 0.14, AC.y + 0.14, Z0, Z0 + 0.22, '#eef0ee');
  bbox(trim, AC.x - 0.38, AC.x + 0.38, AC.y - 0.13, AC.y - 0.1, Z0 + 0.18, Z0 + 0.23, '#cfd6d8');
  bbox(trim, AC.x + 0.25, AC.x + 0.33, AC.y + 0.02, AC.y + 0.05, Z0 + 0.22, Z0 + 0.225, PAL.cyan);
  bbox(trim, AC.x + 0.42, X1, AC.y - 0.04, AC.y + 0.0, Z0, Z0 + 0.05, '#dcdfe0');
  // a socket and a light switch
  bbox(trim, -0.55, -0.45, 0.32, 0.4, Z0 + 0.004, Z0 + 0.018, '#f3efe6');
  bbox(trim, X0 + 0.004, X0 + 0.018, 1.25, 1.35, 1.0, 1.08, '#f3efe6');
  const trimMesh = trim.build({ name: 'trim' });
  root.add(trimMesh);

  // utensils on the rail (too small for the probes)
  const small = new Bucket();
  for (const [x, col, kind] of [[K.x0 + 0.5, PAL.steel, 'ladle'], [K.x0 + 0.66, PAL.woodPale, 'spatula'], [K.x0 + 0.82, PAL.coral, 'whisk'], [K.x0 + 0.98, PAL.steel, 'ladle']]) {
    small.add(unitBox, col, { m: mtx([x, 1.58, Z0 + 0.045], [0, 0, 0], [0.012, 0.2, 0.01]) });
    if (kind === 'ladle') small.add(new THREE.SphereGeometry(0.04, 7, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), col, { m: mtx([x, 1.49, Z0 + 0.06]), mat: 'gloss' });
    else if (kind === 'spatula') small.add(unitBox, col, { m: mtx([x, 1.46, Z0 + 0.05], [0, 0, 0], [0.07, 0.09, 0.008]) });
    else small.add(new THREE.SphereGeometry(0.035, 6, 4), col, { m: mtx([x, 1.47, Z0 + 0.06], [0, 0, 0], [0.8, 1.3, 0.8]) });
  }
  const smallMesh = small.build({ name: 'utensils' });
  smallMesh.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
  root.add(smallMesh);

  // ---- the gas hob with the noodle pot and a kettle: the room's fire (lit, the burners
  // flame blue-and-gold under the pot, a warm light spills over the counter, steam rises)
  const stove = new Bucket();
  const hy = K.top;
  bbox(stove, HOB.x - 0.29, HOB.x + 0.29, hy, hy + 0.025, HOB.z - 0.2, HOB.z + 0.2, '#26252b', { mat: 'gloss' });
  const burners = [HOB.x - 0.14, HOB.x + 0.15];
  for (const bx of burners) {
    stove.add(new THREE.TorusGeometry(0.075, 0.012, 5, 12), '#4a4850', { m: mtx([bx, hy + 0.03, HOB.z], [Math.PI / 2, 0, 0]) });
    stove.add(cyl(0.035, 0.04, 0.02, 10), '#6d6a74', { m: mtx([bx, hy + 0.035, HOB.z]) });
  }
  for (const [i, bx] of burners.entries()) {
    stove.add(cyl(0.018, 0.018, 0.03, 8), i ? '#f3efe6' : PAL.coral, { m: mtx([bx, hy + 0.012, HOB.z + 0.19], [Math.PI / 2, 0, 0]) });
  }
  // the pot (coral enamel, a cream rim, broth inside) and its handles
  stove.addPainted(pot({ shape: 'bucket', h: 0.2, r: 0.13, body: PAL.coral, glaze: PAL.coral, dip: 0, inside: '#f4e6d0', rim: '#f6efe2', seg: 12 }), mtx([burners[0], hy + 0.045, HOB.z]));
  stove.add(cyl(0.118, 0.118, 0.012, 12), '#e0a24e', { m: mtx([burners[0], hy + 0.21, HOB.z]), mat: 'gloss' });
  for (const s of [-1, 1]) bbox(stove, burners[0] + s * 0.13, burners[0] + s * 0.17, hy + 0.2, hy + 0.22, HOB.z - 0.03, HOB.z + 0.03, PAL.dark);
  // the kettle (teal, a wooden grip)
  stove.addPainted(pot({ shape: 'jar', h: 0.17, r: 0.1, body: PAL.teal, glaze: PAL.teal, dip: 0, seg: 10 }), mtx([burners[1], hy + 0.045, HOB.z]));
  stove.add(new THREE.TorusGeometry(0.07, 0.012, 5, 10, Math.PI), PAL.woodDark, { m: mtx([burners[1], hy + 0.23, HOB.z]) });
  stove.add(new THREE.ConeGeometry(0.02, 0.12, 6), PAL.teal, { m: mtx([burners[1] - 0.12, hy + 0.16, HOB.z], [0, 0, 1.0]), mat: 'gloss' });
  const stoveMesh = stove.build({ name: 'stove' });
  root.add(stoveMesh);
  const flames = [];
  const flameGroup = new THREE.Group();
  const flameGeo = new THREE.PlaneGeometry(0.05, 0.085).translate(0, 0.042, 0);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const m = flameMat(k * 1.7);
    const f = new THREE.Mesh(flameGeo, m);
    f.position.set(burners[0] + Math.cos(a) * 0.118, hy + 0.028, HOB.z + Math.sin(a) * 0.118);
    f.rotation.y = -a;
    f.layers.set(LAYER_MAIN_ONLY);
    flameGroup.add(f);
    flames.push(m);
  }
  root.add(flameGroup);
  const fireLight = new THREE.PointLight(0xff9a50, 0, 6, 2);
  fireLight.position.set(burners[0] + 0.02, hy + 0.12, HOB.z + 0.38); // (low, in front of the burner: it lights the pot's side, the counter, the floor)
  root.add(fireLight);
  // steam off the broth
  const puff = new THREE.SpriteMaterial({ map: puffTexture(), color: new THREE.Color(1.7, 1.7, 1.8), transparent: true, depthWrite: false, opacity: 0 }); // (brighter than the pale tiles behind it)
  const steam = [];
  for (let k = 0; k < 6; k++) {
    const s = new THREE.Sprite(puff.clone());
    s.layers.set(LAYER_MAIN_ONLY);
    s.userData.ph = k / 6;
    root.add(s);
    steam.push(s);
  }
  const fire = { on: 0, target: 0, base: 3.4 };

  // ---- the rug under the low table (it comes with the movers: a level lays it once the repairs are done)
  const rugs = new Bucket();
  const cylU = new THREE.CylinderGeometry(1, 1, 1, 16);
  [[1.02, PAL.plum], [0.94, PAL.rose], [0.8, PAL.cream], [0.62, PAL.teal], [0.5, PAL.cream], [0.3, PAL.mustard]].forEach(([r, col], i) => {
    rugs.add(cylU, col, { m: mtx([-1.45, 0.004 + i * 0.001, 0.25], [0, 0.2, 0], [r * 1.18, 0.008 + i * 0.002, r]) });
  });
  const rugMesh = rugs.build({ name: 'rugs', cast: false });
  root.add(rugMesh);

  // ---- rugged cut edges: concrete blocks along the wall tops + toothing down the cut ends
  const blocks = [];
  const L = 0.34;
  const Hc = 0.11;
  const runs = [
    { a: Z0 - T, b: Z1, c: X0 - T / 2, axis: 'z' },
    { a: X0, b: X1, c: Z0 - T / 2, axis: 'x' },
  ];
  for (const r of runs) {
    for (let k = 0; k < 3; k++) {
      const off = (k % 2) * L * 0.5;
      for (let s = r.a + off; s < r.b - 0.05; s += L + 0.014) {
        const u = s / 1.3;
        const prof = 1.0 + Math.sin(u * 1.5 + r.c) * 0.9 + Math.sin(u * 4.1) * 0.5 + rnd() * 0.7;
        if (k > prof) continue;
        const len = Math.min(L, r.b - s);
        const cx = s + len / 2;
        const y = H + Hc * (k + 0.5) + 0.004;
        const pos = r.axis === 'z' ? [r.c, y, cx] : [cx, y, r.c];
        const scl = r.axis === 'z' ? [T - 0.02, Hc - 0.012, len] : [len, Hc - 0.012, T - 0.02];
        blocks.push({ pos, scl, rot: (rnd() - 0.5) * 0.04 });
      }
    }
  }
  for (let k = 0; k * (Hc + 0.004) < H + 0.2; k++) {
    const y = Hc * (k + 0.5) + k * 0.004;
    if (k % 2 === 0 && rnd() > 0.15) blocks.push({ pos: [X0 - T / 2, y, Z1 + L * 0.25], scl: [T - 0.02, Hc - 0.012, L * 0.5], rot: 0 });
    if (k % 2 === 1 && rnd() > 0.15) blocks.push({ pos: [X1 + L * 0.25, y, Z0 - T / 2], scl: [L * 0.5, Hc - 0.012, T - 0.02], rot: 0 });
  }
  const im = new THREE.InstancedMesh(unitBox, std(0xffffff, { roughness: 0.92 }), blocks.length);
  const bc = [new THREE.Color('#9a94a3'), new THREE.Color('#8a8494'), new THREE.Color('#aaa3b2'), new THREE.Color('#7d7888')];
  blocks.forEach((b, i) => {
    im.setMatrixAt(i, mtx(b.pos, [0, b.rot, 0], b.scl));
    c.copy(bc[Math.floor(rnd() * bc.length)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
    im.setColorAt(i, c);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  root.add(im);

  // floating bits off the cut: concrete chunks, flakes of plaster, and a few shards of neon
  const floaters = [];
  const chunkGeo = new THREE.IcosahedronGeometry(1, 0);
  const chunkMats = [std('#9a94a3'), std(PAL.plaster), std('#8a8494')];
  const shardMats = [PAL.magenta, PAL.cyan, PAL.amber].map((h) => new THREE.MeshBasicMaterial({ color: new THREE.Color(h).multiplyScalar(3) }));
  const spots = [
    [X0 - 0.12, H + 0.36, 1.9], [X0 - 0.2, H + 0.54, 0.2], [X0 - 0.08, H + 0.3, -1.5],
    [-1.9, H + 0.4, Z0 - 0.14], [0.5, H + 0.32, Z0 - 0.1], [2.2, H + 0.46, Z0 - 0.18],
    [X1 + 0.26, 2.2, Z0 - 0.12], [X1 + 0.22, 1.1, Z0 - 0.14], [X0 - 0.12, 2.0, Z1 + 0.26], [X0 - 0.1, 0.7, Z1 + 0.22],
  ];
  spots.forEach((p, i) => {
    const shard = i === 1 || i === 5 || i === 8;
    const m = new THREE.Mesh(shard ? new THREE.CylinderGeometry(0.012, 0.012, 1, 6) : chunkGeo, shard ? shardMats[i % 3] : chunkMats[i % 3]);
    if (shard) m.scale.set(1, 0.12, 1);
    else m.scale.set(0.08 + rnd() * 0.04, 0.05, 0.07);
    m.position.set(...p);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.layers.set(LAYER_MAIN_ONLY);
    m.userData.base = new THREE.Vector3(...p);
    m.userData.phase = rnd() * 6.28;
    m.userData.spin = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.25);
    root.add(m);
    floaters.push(m);
  });

  // ---- the city behind the window, the probes' sky, the shadow ceiling
  const sky = skyCard({ frag: SKY_FRAG, width: Z1 - Z0 + 0.1, height: 2.9, position: [X0 - T - 0.14, 1.45, (Z0 + Z1) / 2 - 0.1] });
  sky.material.uniforms.uTime = { value: 0 };
  root.add(sky.mesh);
  // rain on the glass: beads and drops running down the outside of both sashes, catching
  // the city's light (the same sky colours: brighter as the night comes); seen only, no shadow
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { uTime: sky.material.uniforms.uTime, top: sky.material.uniforms.top },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const rain = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, WIN.y1 - WIN.y0), rainMat);
  rain.rotation.y = Math.PI / 2;
  rain.position.set(FRAME.x - 0.012, (WIN.y0 + WIN.y1) / 2, WIN.zc);
  rain.layers.set(LAYER_MAIN_ONLY);
  rain.renderOrder = 2;
  root.add(rain);
  root.add(ceilingCaster(X0, X1 + 0.3, H - 0.02, H + 0.06, Z0, Z1 + 0.3));
  const dome = skyDome();
  root.add(dome.mesh);

  // ---- what the furniture layer (decorate.js) needs to know about the shell
  const B = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  const counterBox = B(K.x0 - 0.02, 0, Z0, K.x1 + 0.02, K.top, kz1 + 0.02);
  const surfaces = [
    { name: 'sill', box: B(X0, SILL.y - 0.05, SILL.z0, SILL.x1, SILL.y, SILL.z1) },
    // the worktop right of the hob (the pot and kettle have the left part)
    { name: 'counter', box: B(HOB.x + 0.34, K.top - 0.04, Z0, K.x1 + 0.02, K.top, kz1 + 0.02) },
    { name: 'shelf', box: B(K.x0 + 0.05, K.shelfY - 0.03, Z0, K.x1 - 0.05, K.shelfY, Z0 + K.shelfD) },
  ];
  const obstacles = [
    counterBox,
    B(X0, SILL.y - 0.12, SILL.z0, SILL.x1, SILL.y, SILL.z1),
    B(K.x0, K.shelfY - 0.26, Z0, K.x1, K.shelfY, Z0 + K.shelfD),
  ];
  const hang = [
    {
      name: 'left', axis: 'x', sign: 1, at: X0, u: 'z', min: Z0 + 0.03, max: Z1, y0: WAIN + 0.08, top: H - 0.05, ry: Math.PI / 2,
      keepOut: [{ u0: wz0 - 0.14, u1: wz1 + 0.14, y0: 0, y1: H }],
    },
    {
      name: 'back', axis: 'z', sign: 1, at: Z0, u: 'x', min: X0 + 0.03, max: X1, y0: WAIN + 0.08, top: H - 0.05, ry: 0,
      keepOut: [{ u0: K.x0 - 0.05, u1: K.x1 + 0.05, y0: 0, y1: K.shelfY + 0.3 }, { u0: AC.x - 0.46, u1: AC.x + 0.46, y0: AC.y - 0.18, y1: H }],
    },
  ];

  const stoveMeshes = [];
  stoveMesh.traverse((o) => { if (o.isMesh) stoveMeshes.push(o); });
  return {
    root,
    paint: plaster,
    sky: sky.material,
    dome: dome.material,
    // GI probes must not sit inside the kitchen counter
    blockers: [counterBox.clone().expandByScalar(-0.04)],
    surfaces,
    hang,
    obstacles,
    // for the level (src/levels/cyber.js): the planks (the mud goes on them), the rug,
    // the kitchen splash's tiles, the stove
    planks: plankMat,
    rug: rugMesh,
    stoveMeshes,
    fireLight,
    clickTargets: { fire: stoveMeshes },
    setFire(on) {
      fire.target = on ? 1 : 0;
    },
    get fireOn() {
      return fire.target > 0.5;
    },
    // snap = jump to the target instead of easing (frozen ?still screenshots)
    update(dt, time, snap = false) {
      fire.on += (fire.target - fire.on) * (snap ? 1 : Math.min(1, dt * 3));
      const flick = 0.93 + 0.04 * Math.sin(time * 9.1) + 0.03 * Math.sin(time * 15.7 + 1.3);
      fireLight.intensity = fire.base * fire.on * flick;
      for (const f of flames) {
        f.uniforms.uTime.value = time;
        f.uniforms.uOn.value = fire.on;
      }
      steam.forEach((s, k) => {
        const t = (time * 0.32 + s.userData.ph) % 1;
        s.position.set(burners[0] + Math.sin(t * 5 + k) * 0.05 * t, hy + 0.26 + t * 0.62, HOB.z + 0.02 + Math.cos(t * 4 + k * 2) * 0.03 * t);
        s.scale.setScalar(0.12 + t * 0.34);
        s.material.opacity = fire.on * Math.sin(t * Math.PI) * 0.75;
      });
      sky.material.uniforms.uTime.value = time;
      drift(floaters, dt, time);
    },
    // average fire power for GI captures (the flicker is too fast to bake)
    fireGI() {
      return fire.base * fire.target * 0.93;
    },
  };
}
