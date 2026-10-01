import * as THREE from 'three';
import { createMask, clearOf } from './masks.js';

// Dirt on the floor: a canvas over the room's floor seen from above (x → right,
// z → down), patched into the floor material, so what the player sees is what the
// GI probes see — a muddy floor bounces less light, a clean one gives it back. A level
// that has something to wipe off the floor (mud, dust, dried clay) makes one of these
// with its room's floor material; the mop / sponge is a surface tool on it (see
// levels/cabin.js). Only up-facing fragments inside the room take the dirt (the same
// material may cover a slab's sides).
//   createFloorMask({ mat, bounds, id, px, hidden }) — hidden: boxes where the floor is
//   never seen (the hearth …): not counted
const FRAG_PARS = /* glsl */`
uniform sampler2D fmMask;
uniform vec4 fmRect; // x0, z0, x1, z1
varying vec3 vFmP;
varying vec3 vFmN;
`;

export function createFloorMask({ mat, bounds, id = 'floor', px = 64, hidden = [] }) {
  const { x0, x1, z0, z1 } = bounds;
  const W = Math.round((x1 - x0) * px);
  const H = Math.round((z1 - z0) * px);
  const valid = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 + (i + 0.5) / px;
      const z = z0 + (j + 0.5) / px;
      valid[j * W + i] = hidden.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) ? 0 : 1;
    }
  }
  const mask = createMask(W, H, { valid, flipY: false });
  const uniforms = {
    fmMask: { value: mask.tex },
    fmRect: { value: new THREE.Vector4(x0, z0, x1, z1) },
  };
  const prevHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFmP;\nvarying vec3 vFmN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFmP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFmN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float fmA = 0.0;
if (vFmN.y > 0.5 && vFmP.x > fmRect.x && vFmP.x < fmRect.z && vFmP.z > fmRect.y && vFmP.z < fmRect.w) {
  vec4 fm = texture2D(fmMask, (vFmP.xz - fmRect.xy) / (fmRect.zw - fmRect.xy));
  fmA = fm.a;
  diffuseColor.rgb = mix(diffuseColor.rgb, fm.rgb, fm.a);
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, fmA);');
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `floormask1|${id}|${prevKey ? prevKey() : ''}`;
  mat.needsUpdate = true;

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const at = new THREE.Vector3();
  const pix = (x, z) => ({ px: (x - x0) * px, py: (z - z0) * px });

  return {
    mask,
    px,
    // the floor point under a ray, as a surface tool's hit ({ item, point, normal, px, py })
    hit(ray) {
      if (!ray.intersectPlane(plane, at)) return null;
      if (at.x < x0 || at.x > x1 || at.z < z0 || at.z > z1) return null;
      return { item: id, point: at.clone(), normal: new THREE.Vector3(0, 1, 0), ...pix(at.x, at.z) };
    },
    pixelOf: (p) => pix(p.x, p.z),
    // how much dirt is under a spot (0..1): the mean alpha of the few pixels round it (a tool's
    // puffs of dust go with it — none off a clean floor)
    alpha(ppx, ppy, r = 2) {
      const i = Math.round(ppx) - r;
      const j = Math.round(ppy) - r;
      const n = 2 * r + 1;
      if (i < 0 || j < 0 || i + n > W || j + n > H) return 0;
      const d = mask.g.getImageData(i, j, n, n).data;
      let s = 0;
      for (let k = 3; k < d.length; k += 4) s += d[k];
      return s / (n * n * 255);
    },
    // clean share (a faint haze doesn't count as dirt)
    get progress() { return 1 - mask.coverage(70); },
    // a messy floor: a film of grime (film = its alpha), soft blotches, then whatever the
    // level draws on top — draw(g, W, H, px, rand)
    dirty(rand, { color = '#5a4632', film = 0, alpha = 0.55, blobs = 60, draw = null } = {}) {
      const g = mask.g;
      g.clearRect(0, 0, W, H);
      if (film > 0) {
        g.globalAlpha = film;
        g.fillStyle = color;
        g.fillRect(0, 0, W, H);
      }
      for (let k = 0; k < blobs; k++) {
        const x = rand() * W;
        const y = rand() * H;
        const r = (0.25 + rand() * 0.7) * px;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, color);
        grd.addColorStop(1, clearOf(color));
        g.globalAlpha = alpha * (0.35 + rand() * 0.65);
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      draw?.(g, W, H, px, rand);
      mask.touch();
      mask.flush();
    },
    clean() { mask.fill(null); mask.flush(); },
    // the job done at ~90%: the last specks go
    finish() { this.clean(); },
    // a pass cleans the tool's whole footprint: full strength out to 85% of r, and each dab
    // takes more (playtest 2026-09-30: the mop / sander left all but a strip down the middle of
    // their 40 cm heads dirty — "it doesn't line up with the tool")
    wipe(ppx, ppy, r, strength = 0.35) { mask.dab(ppx, ppy, r, { erase: true, strength: Math.min(1, strength * 1.6), core: 0.85 }); },
    flush: () => mask.flush(),
    serialize: () => mask.toDataURL(),
    restore: (url) => mask.load(url).then(() => mask.flush()),
  };
}
