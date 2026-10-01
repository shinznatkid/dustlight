import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from './gi.js';
import { mulberry } from './atmos.js';

// The room's floor in three states, per spot, on the one floor mesh the room
// already has (so GI probes see exactly what the player sees, and a finished
// floor renders through the untouched herringbone code path):
//   old  — weathered boards, rows along x (pried up with the crowbar)
//   bare — the subfloor under them
//   new  — the herringbone parquet, laid in 0.4 m cells with the plank stack
// Two tiny textures hold the state: boards present (per board) and cells laid.
// The pop / drop animations are short-lived meshes on top.

// sizes (metres): level 1's — a room may give its own (room.floor.board = [w, l], .cell)
const BOARD_W0 = 0.26; // across the row (z)
const BOARD_L0 = 1.6;  // along the row (x)
const CELL0 = 0.4;     // laying grid for the new floor
const ROT_HOLES = 0.07; // share of old boards already missing at the start

const VERT_PARS = 'varying vec2 vFloorXZ;';
const FRAG_PARS = ({ BOARD_W, BOARD_L, CELL }) => /* glsl */`
uniform sampler2D fOld;
uniform sampler2D fNew;
uniform sampler2D fWorn;
uniform vec4 fRect;   // interior x0, z0, x1, z1
uniform vec4 fGrid;   // boards per row, rows, cells x, cells z
varying vec2 vFloorXZ;
float fHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// 2 = new parquet, 1 = old board, 0 = bare subfloor
float floorState(out vec2 bUV, out vec2 bId) {
  vec2 p = vFloorXZ;
  bUV = vec2(0.0);
  bId = vec2(0.0);
  if (p.x < fRect.x || p.x > fRect.z || p.y < fRect.y || p.y > fRect.w) return 2.0;
  ivec2 c = ivec2(min(floor((p - fRect.xy) / ${CELL.toFixed(3)}), fGrid.zw - 1.0));
  if (texelFetch(fNew, c, 0).r > 0.5) return 2.0;
  float r = min(floor((p.y - fRect.y) / ${BOARD_W.toFixed(3)}), fGrid.y - 1.0);
  float u = p.x - fRect.x + fract(r * 0.618) * ${BOARD_L.toFixed(3)};
  float b = min(floor(u / ${BOARD_L.toFixed(3)}), fGrid.x - 1.0);
  bId = vec2(b, r);
  bUV = vec2(u - b * ${BOARD_L.toFixed(3)}, p.y - fRect.y - r * ${BOARD_W.toFixed(3)});
  return texelFetch(fOld, ivec2(bId), 0).r > 0.5 ? 1.0 : 0.0;
}
`;
const FRAG_MAP = ({ BOARD_W, BOARD_L }) => /* glsl */`
vec2 fbUV;
vec2 fbId;
float fs = floorState(fbUV, fbId);
#include <map_fragment>
if (fs < 1.5) {
  vec3 fc;
  if (fs > 0.5) {
    // weathered boards: grey, tired wood along each board, a tint per board,
    // water stains in blotches and dark seams
    vec2 wuv = vec2(fbUV.x / 1.9 + fHash(fbId) * 7.0, fbUV.y / 1.9 + fHash(fbId + 3.1));
    vec3 w = texture2D(fWorn, wuv).rgb;
    w = mix(vec3(dot(w, vec3(0.3, 0.59, 0.11))), w, 0.4);
    fc = w * (0.4 + 0.2 * fHash(fbId + 1.7)) * vec3(0.96, 0.9, 0.82);
    float stain = texture2D(fWorn, vFloorXZ * 0.11 + 0.37).g;
    fc *= mix(0.5, 1.0, smoothstep(0.22, 0.55, stain));
    float edge = min(min(fbUV.x, ${BOARD_L.toFixed(3)} - fbUV.x) * 0.3, min(fbUV.y, ${BOARD_W.toFixed(3)} - fbUV.y));
    fc *= mix(0.2, 1.0, smoothstep(0.0, 0.01, edge));
  } else {
    // bare subfloor: dusty grey-brown with the joists showing through
    float n = texture2D(fWorn, vFloorXZ * 0.31).r;
    fc = vec3(0.3, 0.27, 0.23) * (0.7 + 0.6 * n);
    float j = abs(fract((vFloorXZ.x + 0.2) / 0.6) - 0.5);
    fc *= mix(1.0, 0.72, smoothstep(0.43, 0.47, j));
  }
  diffuseColor = vec4(diffuse * fc, opacity);
}
`;

// soft value noise in r/g (grain, stains), repeating, for rooms without a worn-wood photo
function noiseTexture(n = 128) {
  const rand = mulberry(17);
  const cells = 16;
  const grid = Array.from({ length: cells * cells * 2 }, () => rand());
  const at = (c, i, j) => grid[(((j + cells) % cells) * cells + ((i + cells) % cells)) * 2 + c];
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x / n) * cells;
      const v = (y / n) * cells;
      const i = Math.floor(u);
      const j = Math.floor(v);
      const fu = (u - i) * (u - i) * (3 - 2 * (u - i));
      const fv = (v - j) * (v - j) * (3 - 2 * (v - j));
      for (let c = 0; c < 2; c++) {
        const a = at(c, i, j) + (at(c, i + 1, j) - at(c, i, j)) * fu;
        const b = at(c, i, j + 1) + (at(c, i + 1, j + 1) - at(c, i, j + 1)) * fu;
        data[(y * n + x) * 4 + c] = Math.round((a + (b - a) * fv) * 255);
      }
      data[(y * n + x) * 4 + 2] = data[(y * n + x) * 4];
      data[(y * n + x) * 4 + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, n, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// state textures: one byte per board / per cell
function stateTex(w, h) {
  const t = new THREE.DataTexture(new Uint8Array(w * h), w, h, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function createFloor(scene, { room, bounds, gi, seed = 5 }) {
  const { x0, x1, z0, z1 } = bounds;
  const [BOARD_W, BOARD_L] = room.floor.board ?? [BOARD_W0, BOARD_L0];
  const CELL = room.floor.cell ?? CELL0;
  const sizes = { BOARD_W, BOARD_L, CELL };
  // the old boards' grain + stains (a room with no photo textures gets soft noise)
  const worn = room.floor.worn ?? noiseTexture();
  const rows = Math.ceil((z1 - z0) / BOARD_W);
  const perRow = Math.ceil((x1 - x0) / BOARD_L) + 1;
  const nx = Math.ceil((x1 - x0) / CELL);
  const nz = Math.ceil((z1 - z0) / CELL);
  const oldTex = stateTex(perRow, rows);
  const newTex = stateTex(nx, nz);
  const hidden = (x, z) => (room.fireplace ?? []).some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z);

  // ---- boards: the visible (in-room) span of each, and whether any of it shows
  const boards = [];
  for (let r = 0; r < rows; r++) {
    const stag = ((r * 0.618) % 1) * BOARD_L;
    for (let b = 0; b < perRow; b++) {
      const a = Math.max(x0, x0 + b * BOARD_L - stag);
      const e = Math.min(x1, x0 + (b + 1) * BOARD_L - stag);
      const za = z0 + r * BOARD_W;
      const ze = Math.min(z1, za + BOARD_W);
      const zc = (za + ze) / 2;
      const real = e - a > 0.02;
      // under the chimney breast / hearth nobody sees it: never counts
      const seen = real && [0.1, 0.3, 0.5, 0.7, 0.9].some((k) => !hidden(a + (e - a) * k, zc));
      boards.push({ i: r * perRow + b, r, b, x0: a, x1: e, z0: za, z1: ze, seen });
    }
  }
  const cells = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * CELL;
      const cz = z0 + (j + 0.5) * CELL;
      cells.push({ i: j * nx + i, cx, cz, x0: x0 + i * CELL, z0: z0 + j * CELL, seen: !hidden(cx, cz) });
    }
  }
  const counted = { boards: boards.filter((b) => b.seen), cells: cells.filter((c) => c.seen) };

  // ---- the floor material learns the three looks ----------------------------------
  const mat = room.floor.mat;
  const uniforms = {
    fOld: { value: oldTex },
    fNew: { value: newTex },
    fWorn: { value: worn },
    fRect: { value: new THREE.Vector4(x0, z0, x1, z1) },
    fGrid: { value: new THREE.Vector4(perRow, rows, nx, nz) },
  };
  // the laid-cell pop-in boxes wear the plain parquet: cloned before our patch,
  // and re-patched for GI (a clone copies giPatched but not the shader hook)
  const plain = mat.clone();
  delete plain.userData.giPatched;
  gi.patch(plain);
  const prevHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFloorXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS(sizes)}`)
      .replace('#include <map_fragment>', FRAG_MAP(sizes))
      .replace('#include <normal_fragment_maps>', 'if (fs > 1.5) {\n#include <normal_fragment_maps>\n}')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (fs < 1.5) roughnessFactor = 0.95;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nif (fs < 1.5) material.clearcoat = 0.0;\n#endif');
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `floor1|${BOARD_W}|${BOARD_L}|${CELL}|${prevKey ? prevKey() : ''}`;
  mat.needsUpdate = true;

  // ---- state -----------------------------------------------------------------------------
  const present = new Uint8Array(boards.length); // 1 = old board still down
  const laid = new Uint8Array(cells.length);     // 1 = new parquet laid
  // laid: 0 empty · 2 falling (reserved, not drawn yet) · 1 down
  function upload() {
    for (const b of boards) oldTex.image.data[b.i] = present[b.i] ? 255 : 0;
    for (const c of cells) newTex.image.data[c.i] = laid[c.i] === 1 ? 255 : 0;
    oldTex.needsUpdate = true;
    newTex.needsUpdate = true;
  }
  function setAll(state) {
    const rand = mulberry(seed);
    // boards nobody can see (under the hearth) start gone, so they never block laying
    for (const b of boards) present[b.i] = state === 'old' && b.seen && rand() >= ROT_HOLES ? 1 : 0;
    // hidden cells count as laid from the start (the hearth covers them anyway)
    for (const c of cells) laid[c.i] = state === 'new' || !c.seen ? 1 : 0;
    upload();
  }
  setAll('new');

  // ---- short-lived pieces: boards flying out, new cells dropping in ----------------------
  const fx = new THREE.Group();
  fx.name = 'floor-fx';
  scene.add(fx);
  const wornMat = new THREE.MeshStandardMaterial({ map: worn, color: 0x9a8670, roughness: 0.95 });
  gi.patch(wornMat);
  // a hidden stand-in per piece material, so the load-time shader compile
  // (world.js precompile) sees them before the first board flies out
  for (const pm of [wornMat, plain]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), pm);
    s.visible = false;
    s.castShadow = true;
    fx.add(s);
  }
  const anims = [];
  const rand = mulberry(seed + 1);

  function popBoard(b) {
    const len = b.x1 - b.x0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.024, b.z1 - b.z0 - 0.004), wornMat);
    m.position.set((b.x0 + b.x1) / 2, 0.012, (b.z0 + b.z1) / 2);
    m.castShadow = true;
    m.layers.set(LAYER_MAIN_ONLY);
    fx.add(m);
    // out over the nearest open (cut-away) edge
    const outX = x1 - m.position.x < z1 - m.position.z;
    const to = m.position.clone().add(outX ? new THREE.Vector3(x1 - m.position.x + 1.4, 0, (rand() - 0.5) * 0.6) : new THREE.Vector3((rand() - 0.5) * 0.6, 0, z1 - m.position.z + 1.4));
    anims.push({ m, t: 0, dur: 0.9 + rand() * 0.25, from: m.position.clone(), to, spin: new THREE.Vector3(rand() * 4 - 2, rand() * 3, rand() * 4 - 2), kind: 'pop' });
  }
  function dropCell(c) {
    const g = new THREE.BoxGeometry(CELL, 0.02, CELL);
    g.translate(c.x0 + CELL / 2, -0.01, c.z0 + CELL / 2);
    // world-space UVs baked at the final spot, as room.js does for the floor
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k), p.getZ(k));
    const m = new THREE.Mesh(g, plain);
    m.position.y = 0.28;
    m.castShadow = true;
    m.layers.set(LAYER_MAIN_ONLY);
    fx.add(m);
    anims.push({ m, t: 0, dur: 0.2, kind: 'drop', cell: c });
  }

  const flat = new THREE.Vector2();
  function nearBoard(b, x, z, r) {
    flat.set(THREE.MathUtils.clamp(x, b.x0, b.x1), THREE.MathUtils.clamp(z, b.z0, b.z1));
    return Math.hypot(flat.x - x, flat.y - z) < r;
  }

  return {
    boards,
    cells,
    get pryProgress() { return 1 - counted.boards.filter((b) => present[b.i]).length / counted.boards.length; },
    get layProgress() { return counted.cells.filter((c) => laid[c.i] === 1).length / counted.cells.length; },
    get boardsLeft() { return counted.boards.filter((b) => present[b.i]).length; },
    plainMat: plain,
    // any old board left within r of (x, z)?
    oldNear(x, z, r) { return boards.some((b) => present[b.i] && nearBoard(b, x, z, r)); },
    // can new parquet go at (x, z)? only where no old board is left
    canLay(c) {
      return !boards.some((b) => present[b.i] && b.x0 < c.x0 + CELL && b.x1 > c.x0 && b.z0 < c.z0 + CELL && b.z1 > c.z0);
    },
    // crowbar: lift every old board within r of (x, z); returns how many
    pry(x, z, r = 0.2, max = 2) {
      let n = 0;
      for (const b of boards) {
        if (n >= max) break;
        if (!present[b.i] || !nearBoard(b, x, z, r)) continue;
        present[b.i] = 0;
        if (b.seen) popBoard(b);
        n++;
      }
      if (n) upload();
      return n;
    },
    // plank stack: lay new parquet in empty cells within r of (x, z); returns how many
    lay(x, z, r = 0.32, max = 3) {
      let n = 0;
      const near = cells
        .filter((c) => !laid[c.i] && Math.hypot(c.cx - x, c.cz - z) < r)
        .sort((a, b) => Math.hypot(a.cx - x, a.cz - z) - Math.hypot(b.cx - x, b.cz - z));
      for (const c of near) {
        if (n >= max) break;
        if (!this.canLay(c)) continue;
        laid[c.i] = 2; // reserved while the piece is falling; drawn as laid when it lands
        dropCell(c);
        n++;
      }
      return n;
    },
    update(dt) {
      let landed = 0;
      for (let k = anims.length - 1; k >= 0; k--) {
        const a = anims[k];
        a.t += dt / a.dur;
        const t = Math.min(1, a.t);
        if (a.kind === 'pop') {
          // a quick lift, then an arc out of the room, shrinking away
          const lift = Math.min(1, t / 0.18);
          const fly = Math.max(0, (t - 0.18) / 0.82);
          a.m.position.lerpVectors(a.from, a.to, fly * fly);
          a.m.position.y = 0.012 + lift * 0.1 + Math.sin(fly * Math.PI) * 0.9 - fly * 0.6;
          a.m.rotation.set(a.spin.x * fly - lift * 0.35, a.spin.y * fly, a.spin.z * fly);
          a.m.scale.setScalar(1 - Math.max(0, fly - 0.6) * 2.4);
        } else {
          a.m.position.y = 0.28 * (1 - t) * (1 - t);
        }
        if (t >= 1) {
          if (a.kind === 'drop') {
            laid[a.cell.i] = 1;
            landed++;
          }
          fx.remove(a.m);
          a.m.geometry.dispose();
          anims.splice(k, 1);
        }
      }
      if (landed) upload();
      return { moving: anims.length > 0, landed };
    },
    get busy() { return anims.length > 0; },

    setAll,
    serialize() {
      return {
        old: boards.map((b) => (present[b.i] ? 1 : 0)).join(''),
        laid: cells.map((c) => (laid[c.i] === 1 ? 1 : 0)).join(''),
      };
    },
    restore(s) {
      if (!s) return;
      for (const b of boards) present[b.i] = b.seen && s.old?.[b.i] === '1' ? 1 : 0;
      for (const c of cells) laid[c.i] = s.laid?.[c.i] === '1' || !c.seen ? 1 : 0;
      upload();
    },
  };
}
