import * as THREE from 'three';
import { createMask } from './masks.js';

// Wall paint. Every paintable face of a room is unfolded onto one atlas; a canvas
// over that atlas holds the new paint (rgb = colour, a = covered). The shader shows
// the tired old paint where a = 0 — so the roller really paints, colours can mix,
// and the GI probes see the same walls the player does.
//
// The room says which faces there are (room module `sites.walls`, e.g. src/room.js SITES):
//   faces: [{ face, axis, at, sign, along, lo, hi, ua, origin, holes? }] — a flat piece of
//          wall in the plane p[axis] = at, facing `sign` along that axis, running along
//          `along` from lo to hi; its pixels sit at atlas u = ua + (p[along] − origin),
//          atlas v = height. Holes ({ a0, a1, y0, y1 }, world units along the face) are
//          spots nobody can paint or see (windows, the fireplace surround): not counted.
//   base / top: heights the paint count starts / ends at (a baseboard hides the bottom);
//          a face may have its own (y0 / y1)
//   aw, ah: atlas size in metres (default: just big enough) · old: the starting colour
// Other masks over walls (a level's twist) can reuse this with their own material,
// id and look: createWalls(room, spec, { mat, id, oldGLSL, old, keep }) — keep(face, along, y)
// narrows what counts (e.g. only the gaps between logs).
const PX = 80; // canvas pixels per metre

// the tired paint of level 1: blotches, faint vertical water streaks, damp near the floor
const OLD_WALL = /* glsl */`
vec3 oldWall(vec2 m) {
  vec3 c = wOld;
  c *= mix(0.7, 1.04, smoothstep(0.22, 0.62, wf(m * 1.3)));
  c *= mix(0.84, 1.0, smoothstep(0.33, 0.55, wf(vec2(m.x * 7.0, m.y * 0.6))));
  c *= mix(0.76, 1.0, smoothstep(0.0, 0.75, m.y));
  return c;
}
`;

const f4 = (v) => v.toFixed(4);

// which face a fragment belongs to: the nearest face plane along whose run it lies,
// one that faces the same way winning a tie (reveals, corners, cylinders on a wall)
function atlasGLSL(faces) {
  const pick = faces.map((f) => `
  d = abs(p.${f.axis} - ${f4(f.at)})
    + (p.${f.along} < ${f4(f.lo - 0.3)} || p.${f.along} > ${f4(f.hi + 0.3)} ? 100.0 : 0.0)
    + (n.${f.axis} * ${f4(f.sign)} > 0.5 ? 0.0 : 0.5);
  if (d < best) { best = d; u = ${f4(f.ua)} + p.${f.along} - ${f4(f.origin)}; }`).join('');
  return /* glsl */`
vec2 wallAtlas() {
  vec3 p = vWallP;
  vec3 n = vWallN;
  float best = 1e9;
  float u = 0.0;
  float d;${pick}
  return vec2(u, p.y);
}
`;
}

const FRAG_PARS = /* glsl */`
uniform sampler2D wPaint;
uniform vec3 wOld;
varying vec3 vWallP;
varying vec3 vWallN;
float wh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y);
}
float wf(vec2 p) { return 0.5 * wn(p) + 0.25 * wn(p * 2.1) + 0.125 * wn(p * 4.3); }
`;

// the atlas extent of a face, in metres
const span = (f) => [f.ua + (f.lo - f.origin), f.ua + (f.hi - f.origin)];

// which atlas pixels are wall you can actually see (for the % count)
function validity(w, h, spec, ah, keep) {
  const ok = new Uint8Array(w * h);
  const { faces, base = 0, top } = spec;
  const runs = faces.map(span);
  for (let py = 0; py < h; py++) {
    const y = ah - (py + 0.5) / PX;
    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / PX;
      const i = runs.findIndex(([a, b]) => u >= a && u < b);
      if (i < 0) continue;
      const f = faces[i];
      if (y <= (f.y0 ?? base) || y >= (f.y1 ?? top)) continue;
      const along = f.origin + (u - f.ua);
      if ((f.holes ?? []).some((o) => along > o.a0 && along < o.a1 && y > o.y0 && y < o.y1)) continue;
      if (keep && !keep(f, along, y)) continue;
      ok[py * w + px] = 1;
    }
  }
  return ok;
}

export function createWalls(room, spec, { mat = room.paint, id = 'walls', oldGLSL = OLD_WALL, old = spec.old ?? '#b5ad95', keep = null } = {}) {
  const top = spec.top ?? 3;
  const aw = spec.aw ?? Math.ceil(Math.max(...spec.faces.map((f) => span(f)[1])) * 10) / 10;
  const ah = spec.ah ?? Math.max(top, ...spec.faces.map((f) => f.y1 ?? 0)) + 0.2;
  const W = Math.round(aw * PX);
  const Hp = Math.round(ah * PX);
  const mask = createMask(W, Hp, { valid: validity(W, Hp, { ...spec, top }, ah, keep), flipY: false });
  const uniforms = {
    wPaint: { value: mask.tex },
    wOld: { value: new THREE.Color(old) },
  };
  const FRAG_MAP = /* glsl */`
vec4 wDetail = vec4(1.0);
#ifdef USE_MAP
wDetail = texture2D(map, vMapUv);
#endif
vec2 wm = wallAtlas();
vec4 wl = texture2D(wPaint, vec2(wm.x / ${aw.toFixed(2)}, (${ah.toFixed(2)} - wm.y) / ${ah.toFixed(2)}));
diffuseColor.rgb = mix(oldWall(wm), wl.rgb, wl.a) * wDetail.rgb;
`;
  const prevHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWallP;\nvarying vec3 vWallN;')
      // (an instanced mesh — the cabin's logs — places each copy with instanceMatrix,
      // which `transformed` doesn't include: without it every log read the same spot)
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 wWorld = vec4(transformed, 1.0);
vec3 wNorm = objectNormal;
#ifdef USE_INSTANCING
wWorld = instanceMatrix * wWorld;
wNorm = mat3(instanceMatrix) * wNorm;
#endif
vWallP = (modelMatrix * wWorld).xyz;
vWallN = normalize(mat3(modelMatrix) * wNorm);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\n${atlasGLSL(spec.faces)}\n${oldGLSL}`)
      .replace('#include <map_fragment>', FRAG_MAP);
  };
  // (each mask's shader differs: the key must too, or three reuses one program for all)
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `walls1|${id}|${prevKey ? prevKey() : ''}`;
  mat.needsUpdate = true;

  // ---- aiming: intersect the face planes directly (curtains and frames don't stop paint)
  // `face` names each flat piece: the atlas jumps between them (level 1's left wall
  // ends at u = 0 in the corner where the back wall starts at u = 5.2), so a stroke is
  // only joined up within one face — joining across the corner painted a strip along
  // the whole wall in one frame (playtest round 2)
  const planes = spec.faces.map((f) => ({
    face: f.face,
    axis: f.axis,
    d: f.at,
    n: new THREE.Vector3().setComponent('xyz'.indexOf(f.axis), f.sign),
    ok: (p) => p[f.along] > f.lo && p[f.along] < f.hi && p.y <= (f.y1 ?? top),
    uv: (p) => [f.ua + p[f.along] - f.origin, p.y],
  }));
  const tmp = new THREE.Vector3();
  function hit(ray) {
    let best = null;
    for (const pl of planes) {
      const denom = ray.direction.dot(pl.n);
      if (denom >= -1e-4) continue; // must face the camera
      const t = (pl.d - ray.origin[pl.axis]) / ray.direction[pl.axis];
      if (t <= 0 || (best && t >= best.t)) continue;
      ray.at(t, tmp);
      if (tmp.y < 0 || !pl.ok(tmp)) continue;
      const [u, y] = pl.uv(tmp);
      best = { t, face: pl.face, point: tmp.clone(), normal: pl.n.clone(), px: u * PX, py: (ah - y) * PX };
    }
    return best;
  }

  return {
    mask,
    PX,
    ah, // atlas height (m): pixel row py is at height ah − py / PX
    hit,
    faces: spec.faces,
    // which way a face looks (the timelapse puts the roller on it)
    faceNormal: (face) => planes.find((p) => p.face === face)?.n.clone() ?? new THREE.Vector3(1, 0, 0),
    // a world point → its atlas pixel (a level's own tools, the title timelapse)
    pixelOf(face, p) {
      const pl = planes.find((q) => q.face === face);
      const [u, y] = pl.uv(p);
      return { px: u * PX, py: (ah - y) * PX };
    },
    get progress() { return mask.coverage(128); },
    // dev / finished room: the whole wall one colour
    fill(hex) { mask.fill(hex); mask.flush(); },
    clear() { mask.fill(null); mask.flush(); },
    // the task is done at ~96%: paint the missed spots (under what's already there)
    fillGaps(hex) {
      const g = mask.g;
      g.save();
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = hex;
      g.fillRect(0, 0, W, Hp);
      g.restore();
      mask.touch();
      mask.flush();
    },
    paint(px, py, r, color) { mask.dab(px, py, r * PX, { color }); },
    flush: () => mask.flush(),
    serialize: () => mask.toDataURL(),
    restore: (url) => mask.load(url).then(() => mask.flush()),
  };
}
