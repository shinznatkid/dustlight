import * as THREE from 'three';
import { Effect, BlendFunction, Pass } from 'postprocessing';
import { LAYER_MAIN_ONLY } from './gi.js';

// bound until the sun's shadow map exists (a colour texture on a shadow sampler is a GL error)
const EMPTY_SHADOW = new THREE.DepthTexture(1, 1);
EMPTY_SHADOW.compareFunction = THREE.LessEqualCompare;

const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }
`;

// Volumetric sunlight: march each pixel's view ray through the room volume and
// test every sample against the sun's shadow map. Air the sun reaches glows, so
// window shafts (mullion stripes included) and furniture occlusion come for free.
const INSCATTER_FRAG = /* glsl */ `
uniform sampler2D depthBuffer;
uniform sampler2DShadow sunShadow;
uniform mat4 shadowMatrix;
uniform mat4 projInv;
uniform mat4 camWorld;
uniform vec3 camPos;
uniform vec3 boxMin;
uniform vec3 boxMax;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float density;
uniform float uTime;
#ifdef SPOT_SHAFT
uniform sampler2DShadow spotShadow;
uniform sampler2D spotMap;
uniform mat4 spotMatrix;
uniform vec3 spotColor;
#endif
varying vec2 vUv;
${NOISE}
void main() {
  vec3 col = vec3(0.0);
  if (density > 0.0) {
    float depth = texture2D(depthBuffer, vUv).r;
    vec4 vp = projInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vp /= vp.w;
    vec3 wp = (camWorld * vec4(vp.xyz, 1.0)).xyz;
    vec3 rd = wp - camPos;
    float tScene = length(rd);
    rd /= tScene;
    vec3 inv = 1.0 / rd;
    vec3 t0 = (boxMin - camPos) * inv;
    vec3 t1 = (boxMax - camPos) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tn = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    float tf = min(min(min(tmax.x, tmax.y), tmax.z), tScene);
    if (tf > tn) {
      const int STEPS = 56;
      float dt = (tf - tn) / float(STEPS);
      float j = hash12(gl_FragCoord.xy);
      float acc = 0.0;
#ifdef SPOT_SHAFT
      vec3 accS = vec3(0.0);
#endif
      for (int i = 0; i < STEPS; i++) {
        vec3 p = camPos + rd * (tn + (float(i) + j) * dt);
#ifdef SPOT_SHAFT
        // a room's extra light (a spot with a cookie): the cookie's colour wherever the spot's
        // own shadow map lets it through — coloured beams where the sun itself is kept out
        vec4 ss = spotMatrix * vec4(p, 1.0);
        if (ss.w > 0.0) {
          vec3 sp = ss.xyz / ss.w;
          if (sp.x > 0.0 && sp.x < 1.0 && sp.y > 0.0 && sp.y < 1.0 && sp.z < 1.0) {
            vec3 ck = textureLod(spotMap, sp.xy, 0.0).rgb;
            if (ck.r + ck.g + ck.b > 0.002) {
              float sl = textureLod(spotShadow, vec3(sp.xy, sp.z - 0.001), 0.0);
              float ns = vnoise(p * 1.4 + vec3(uTime * 0.05, uTime * 0.03, -uTime * 0.04));
              accS += ck * sl * (0.35 + 1.3 * ns * ns);
            }
          }
        }
#endif
        vec4 sc = shadowMatrix * vec4(p, 1.0);
        if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0) continue;
        float lit = textureLod(sunShadow, vec3(sc.xy, sc.z - 0.001), 0.0);
        float n = vnoise(p * 1.4 + vec3(uTime * 0.05, uTime * 0.03, -uTime * 0.04));
        acc += lit * (0.35 + 1.3 * n * n);
      }
      acc *= dt;
      // Henyey-Greenstein forward scattering, normalised to 1 at 90 degrees
      float g = 0.45;
      float c = dot(sunDir, -rd);
      float phase = pow(1.0 + g * g, 1.5) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
      col = sunColor * density * acc * phase;
#ifdef SPOT_SHAFT
      col += spotColor * density * accS * dt * phase;
#endif
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D src;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(src, vUv).rgb * 0.227;
  c += (texture2D(src, vUv + dir * 1.385).rgb + texture2D(src, vUv - dir * 1.385).rgb) * 0.316;
  c += (texture2D(src, vUv + dir * 3.231).rgb + texture2D(src, vUv - dir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(c, 1.0);
}
`;

// Renders the in-scattered light at half resolution and blurs it; the jittered
// march is noisy per pixel, the blur turns that grain into smooth beams.
// spot (optional — a room opts in): { light: a SpotLight with a `map` cookie and a shadow,
// weight: () => number } — its light scatters in the air too (the castle's stained glass).
// Without it the shader and its uniforms are exactly as before.
export class ShaftsPass extends Pass {
  constructor(camera, sun, box, { spot = null } = {}) {
    super('ShaftsPass');
    this.needsDepthTexture = true;
    this.needsSwap = false;
    this.cam = camera;
    this.sun = sun;
    this.strength = 0.007;
    this.on = true;
    this.still = false; // ?still: the haze stops drifting too (world.js)
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.inscatter = new THREE.ShaderMaterial({
      uniforms: {
        depthBuffer: { value: null },
        sunShadow: { value: EMPTY_SHADOW },
        shadowMatrix: { value: new THREE.Matrix4() },
        projInv: { value: new THREE.Matrix4() },
        camWorld: { value: new THREE.Matrix4() },
        camPos: { value: new THREE.Vector3() },
        boxMin: { value: box.min.clone() },
        boxMax: { value: box.max.clone() },
        sunColor: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(1, -1, 0).normalize() },
        density: { value: 0 },
        uTime: { value: 0 },
        ...(spot ? {
          spotShadow: { value: EMPTY_SHADOW },
          spotMap: { value: null },
          spotMatrix: { value: new THREE.Matrix4() },
          spotColor: { value: new THREE.Color() },
        } : {}),
      },
      ...(spot ? { defines: { SPOT_SHAFT: '' } } : {}),
      vertexShader: FS_VERT,
      fragmentShader: INSCATTER_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.spot = spot;
    this.blur = new THREE.ShaderMaterial({
      uniforms: { src: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fullscreenMaterial = this.inscatter;
  }

  get texture() {
    return this.rtA.texture;
  }

  setDepthTexture(depthTexture) {
    this.inscatter.uniforms.depthBuffer.value = depthTexture;
  }

  setSize(w, h) {
    this.rtA.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.rtB.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }

  render(renderer, inputBuffer, outputBuffer, dt) {
    const u = this.inscatter.uniforms;
    const cam = this.cam;
    const sun = this.sun;
    const map = sun.shadow.map?.depthTexture ?? null;
    u.projInv.value.copy(cam.projectionMatrixInverse);
    u.camWorld.value.copy(cam.matrixWorld);
    u.camPos.value.setFromMatrixPosition(cam.matrixWorld);
    if (!this.still) u.uTime.value += dt ?? 0.016;
    u.sunShadow.value = map ?? EMPTY_SHADOW;
    u.shadowMatrix.value.copy(sun.shadow.matrix);
    u.sunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
    u.sunDir.value.subVectors(sun.target.position, sun.position).normalize();
    u.density.value = this.on && map && sun.visible && sun.intensity > 0.01 ? this.strength : 0;
    if (this.spot) {
      const s = this.spot.light;
      u.spotShadow.value = s.shadow.map?.depthTexture ?? EMPTY_SHADOW;
      u.spotMap.value = s.map;
      u.spotMatrix.value.copy(s.shadow.matrix);
      u.spotColor.value.copy(s.color).multiplyScalar(s.intensity * (this.spot.weight?.() ?? 1));
    }

    this.fullscreenMaterial = this.inscatter;
    renderer.setRenderTarget(this.rtA);
    renderer.render(this.scene, this.camera);
    if (u.density.value === 0) return;
    const b = this.blur.uniforms;
    this.fullscreenMaterial = this.blur;
    for (let k = 0; k < 2; k++) {
      b.src.value = this.rtA.texture;
      b.dir.value.set(1 / this.rtA.width, 0);
      renderer.setRenderTarget(this.rtB);
      renderer.render(this.scene, this.camera);
      b.src.value = this.rtB.texture;
      b.dir.value.set(0, 1 / this.rtA.height);
      renderer.setRenderTarget(this.rtA);
      renderer.render(this.scene, this.camera);
    }
  }
}

// adds the blurred shafts to the HDR image and applies exposure before tone mapping
export class ShaftsCompositeEffect extends Effect {
  constructor(shafts) {
    super('ShaftsCompositeEffect', /* glsl */ `
      uniform sampler2D shaftsTex;
      uniform float exposure;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = vec4((inputColor.rgb + texture2D(shaftsTex, uv).rgb) * exposure, inputColor.a);
      }`, {
      blendFunction: BlendFunction.SET,
      uniforms: new Map([
        ['shaftsTex', new THREE.Uniform(shafts.texture)],
        ['exposure', new THREE.Uniform(1)],
      ]),
    });
  }
}

// Floating dust motes. Each mote samples the sun shadow map in the vertex shader,
// so it only lights up while drifting through a sunbeam, like real dust.
const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform sampler2DShadow sunShadow;
uniform mat4 shadowMatrix;
uniform vec3 sunColor;
uniform float pxScale;
uniform float amount;
uniform vec3 boxMin;
uniform vec3 boxMax;
#ifdef SPOT_SHAFT
uniform sampler2DShadow spotShadow;
uniform sampler2D spotMap;
uniform mat4 spotMatrix;
uniform vec3 spotColor;
#endif
attribute vec4 seed;
varying vec3 vColor;
void main() {
  vec3 ext = boxMax - boxMin;
  float t = uTime * (0.35 + seed.w * 0.5);
  vec3 p = position;
  p.x += sin(t * 0.21 + seed.x * 6.283) * 0.22 + t * 0.012;
  p.y += sin(t * 0.17 + seed.y * 6.283) * 0.15 + t * 0.006;
  p.z += cos(t * 0.19 + seed.z * 6.283) * 0.22;
  p = boxMin + mod(p - boxMin, ext);
  vec4 sc = shadowMatrix * vec4(p, 1.0);
  float inside = step(0.0, sc.x) * step(sc.x, 1.0) * step(0.0, sc.y) * step(sc.y, 1.0);
  float lit = inside * texture(sunShadow, vec3(sc.xy, sc.z - 0.002)); // VS: implicit lod 0 (textureLod on a shadow sampler fails on D3D11)
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min((0.5 + seed.w * seed.w * 1.6) * pxScale / -mv.z, 3.5);
  // slow twinkle: most motes are faint at any moment, a few catch the light
  float tw = sin(uTime * (0.6 + seed.x * 1.2) + seed.y * 40.0) * 0.5 + 0.5;
#ifdef SPOT_SHAFT
  // (and in the room's extra light: a mote drifting through the stained glass's beam turns its colour)
  vec4 ss = spotMatrix * vec4(p, 1.0);
  vec3 sp = ss.xyz / max(ss.w, 1e-4);
  float inS = step(0.0, ss.w) * step(0.0, sp.x) * step(sp.x, 1.0) * step(0.0, sp.y) * step(sp.y, 1.0);
  vec3 spot = spotColor * inS * textureLod(spotMap, sp.xy, 0.0).rgb * texture(spotShadow, vec3(sp.xy, sp.z - 0.002));
  vColor = (sunColor * lit + spot) * pow(tw, 3.0) * amount * smoothstep(1.5, 4.0, -mv.z);
#else
  vColor = sunColor * lit * pow(tw, 3.0) * amount * smoothstep(1.5, 4.0, -mv.z); // fade motes right at the lens
#endif
}
`;
const DUST_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  gl_FragColor = vec4(vColor * exp(-d * 3.5), 1.0);
}
`;

// spot: as ShaftsPass's (a room's extra light the motes glint in too; none = as before)
export function createDust(box, sun, count = 1400, { spot = null } = {}) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  const rnd = mulberry(7);
  const size = box.getSize(new THREE.Vector3());
  for (let i = 0; i < count; i++) {
    pos[i * 3] = box.min.x + rnd() * size.x;
    pos[i * 3 + 1] = box.min.y + rnd() * size.y;
    pos[i * 3 + 2] = box.min.z + rnd() * size.z;
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      sunShadow: { value: EMPTY_SHADOW },
      shadowMatrix: { value: new THREE.Matrix4() },
      sunColor: { value: new THREE.Color() },
      pxScale: { value: 900 },
      amount: { value: 1 },
      boxMin: { value: box.min.clone() },
      boxMax: { value: box.max.clone() },
      ...(spot ? {
        spotShadow: { value: EMPTY_SHADOW },
        spotMap: { value: null },
        spotMatrix: { value: new THREE.Matrix4() },
        spotColor: { value: new THREE.Color() },
      } : {}),
    },
    ...(spot ? { defines: { SPOT_SHAFT: '' } } : {}),
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.layers.set(LAYER_MAIN_ONLY);
  points.userData.update = (dt, viewportHeight) => {
    const u = mat.uniforms;
    u.uTime.value += dt;
    const map = sun.shadow.map?.depthTexture ?? null;
    u.sunShadow.value = map ?? EMPTY_SHADOW;
    u.shadowMatrix.value.copy(sun.shadow.matrix);
    u.sunColor.value.copy(sun.color).multiplyScalar(sun.intensity * 0.35);
    u.pxScale.value = viewportHeight * 0.024;
    if (spot) {
      const s = spot.light;
      u.spotShadow.value = s.shadow.map?.depthTexture ?? EMPTY_SHADOW;
      u.spotMap.value = s.map;
      u.spotMatrix.value.copy(s.shadow.matrix);
      u.spotColor.value.copy(s.color).multiplyScalar(s.intensity * 0.35 * (spot.weight?.() ?? 1));
    }
    points.visible = !!map && sun.visible && sun.intensity > 0.001 && u.amount.value > 0;
  };
  return points;
}

export function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
