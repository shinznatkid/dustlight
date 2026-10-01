import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from './gi.js';

// Puffs of dust (or sawdust, or gold dust, or chaff off a broom) where a tool works — shared by
// the levels (first made for the bookshop's duster).
// soft round points that swell, drift and fade; main view only (the probes never see them).
// In the scene from the start (world.js compiles every shader at load), drawn only while alive.
const PUFF_VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vA;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vA = aAlpha;
  vC = aColor;
}
`;
const PUFF_FRAG = /* glsl */`
varying float vA;
varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC, a);
}
`;
export function createPuffs(world, { n = 900 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  const color = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: PUFF_VERT,
    fragmentShader: PUFF_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'puffs';
  points.frustumCulled = false;
  points.layers.set(LAYER_MAIN_ONLY);
  points.renderOrder = 4;
  points.visible = false;
  world.scene.add(points);
  const P = Array.from({ length: n }, () => ({ life: 0, age: 0, v: new THREE.Vector3(), s0: 0, s1: 0, a0: 0, mote: false, drop: 0, ph: 0 }));
  let next = 0;
  let alive = 0;
  const cam = world.camera;
  world.onFrame((dt) => {
    if (!alive) return;
    const h = world.renderer.domElement.height;
    mat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    alive = 0;
    for (let i = 0; i < n; i++) {
      const q = P[i];
      if (q.life <= 0) continue;
      q.age += dt;
      const k = q.age / q.life;
      if (k >= 1) {
        q.life = 0;
        alpha[i] = 0;
        continue;
      }
      alive++;
      if (q.drop) {
        // a droplet: thrown out, falls, and is gone where it lands
        q.v.multiplyScalar(Math.max(0, 1 - dt * 0.6));
        q.v.y -= dt * q.drop;
        if (pos[i * 3 + 1] + q.v.y * dt < 0.004) q.age = q.life;
      } else if (q.mote) {
        // a fine mote: slowed by the air, then drifting down with a lazy sway
        q.v.multiplyScalar(Math.max(0, 1 - dt * 1.6));
        q.v.y -= dt * 0.035;
        q.v.x += Math.sin(q.age * 2.3 + q.ph) * dt * 0.05;
        q.v.z += Math.cos(q.age * 1.9 + q.ph) * dt * 0.05;
      } else {
        q.v.multiplyScalar(Math.max(0, 1 - dt * 2.2));
        q.v.y -= dt * 0.05; // it settles, slowly
      }
      pos[i * 3] += q.v.x * dt;
      pos[i * 3 + 1] += q.v.y * dt;
      pos[i * 3 + 2] += q.v.z * dt;
      size[i] = q.s0 + (q.s1 - q.s0) * Math.sqrt(k);
      alpha[i] = q.a0 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    }
    for (const a of Object.values(geo.attributes)) a.needsUpdate = true;
    points.visible = alive > 0;
  });
  const c = new THREE.Color();
  return {
    // a few puffs at p, blown out along `normal` (and about); color: linear rgb ·
    // mote: a fine speck that keeps its size and drifts down instead of a swelling cloud ·
    // drop: a droplet (water off a mop, clay slip off a sponge) that falls at this many m/s²
    emit(p, normal, count, { color: col = '#cfc4b0', size: s = 0.1, spread = 0.12, speed = 0.35, life = 1.4, alpha: a = 0.34, mote = false, drop = 0 } = {}) {
      c.set(col);
      for (let k = 0; k < count; k++) {
        const i = next;
        next = (next + 1) % n;
        const q = P[i];
        q.life = life * (0.7 + Math.random() * 0.6);
        q.age = 0;
        q.mote = mote || drop > 0;
        q.drop = drop;
        q.ph = Math.random() * 6.3;
        q.s0 = s * (q.mote ? 0.6 + Math.random() * 0.8 : 0.4 + Math.random() * 0.3);
        q.s1 = q.mote ? q.s0 : s * (1.2 + Math.random() * 0.9);
        q.a0 = a * (0.6 + Math.random() * 0.4);
        q.v.set((Math.random() - 0.5) * 2, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 2).multiplyScalar(speed * 0.6).addScaledVector(normal, speed * (0.4 + Math.random() * 0.8));
        pos[i * 3] = p.x + (Math.random() - 0.5) * spread;
        pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread;
        pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
        size[i] = q.s0;
        alpha[i] = 0;
        color[i * 3] = c.r;
        color[i * 3 + 1] = c.g;
        color[i * 3 + 2] = c.b;
      }
      alive = Math.max(alive, 1);
      points.visible = true;
    },
    clear() {
      for (const q of P) q.life = 0;
      alpha.fill(0);
      alive = 0;
      points.visible = false;
    },
  };
}
