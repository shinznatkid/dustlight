import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_MAIN_ONLY } from '../../gi.js';

// The flat's three neon signs, made by the old sign-maker who lived here: a bowl of noodles
// (magenta), a sleepy moon (amber) and a cat (cyan) — and a fourth he made for the noodle bar
// downstairs, a lantern hung outside the window (street). Each is a dark backboard with glass
// tubes bent along strokes (sign-local metres, x right, y up, the board facing +z), plus
// the coloured light it throws into the room (fixtures.js: every sign is a lamp — it comes
// on at dusk and, like a city's signs, stays on all day; it can be hung anywhere along the
// walls, all but the lantern). A sign's colour can change (setColor: level 6's tube colours).
//
// Every tube knows, centimetre by centimetre, whether it's a new lit tube or the old dead
// one (grey, dusty, with broken-off gaps): level 6 has the player trace the dead tubes to
// relight them (src/levels/cyber/neon.js); the room viewer shows them all new.
//   stroke: { pts: [[x, y], …], closed?, sharp? (straight segments, else a smooth curve),
//             gaps?: [[from, to], …] (fractions of its length that broke off) }

const TUBE_R = 0.012; // tube radius (m) — chunkier than life so it reads from the diorama camera
export const TUBE_Z = 0.052; // tube axis off the board's back (board 0.02 thick + standoffs)
const BIN = 0.01; // coverage resolution along a tube (m)
const RING = 7; // vertices around a tube

const wave = (x0, y0, y1, amp, n = 6, ph = 0) => Array.from({ length: n }, (_, k) => [x0 + amp * Math.sin(ph + k * 1.35), y0 + ((y1 - y0) * k) / (n - 1)]);
function arcPts(cx, cy, r, a0, a1, n) {
  return Array.from({ length: n }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / (n - 1);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}
function star(cx, cy, r) {
  return Array.from({ length: 10 }, (_, k) => {
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
}
const deg = (d) => (d * Math.PI) / 180;

export const SIGNS = {
  // a steaming bowl of noodles with chopsticks — the biggest, over the sofa
  ramen: {
    color: '#ff2f9a', power: 9.4, w: 1.18, h: 0.9,
    strokes: [
      { pts: [[-0.44, -0.02], [-0.38, -0.17], [-0.22, -0.28], [0, -0.31], [0.22, -0.28], [0.38, -0.17], [0.44, -0.02]], gaps: [[0.18, 0.28], [0.7, 0.76]] },
      { pts: [[-0.5, -0.0], [0.5, -0.0]], sharp: true, gaps: [[0.4, 0.52]] },
      { pts: [[-0.15, -0.33], [-0.1, -0.37], [0.1, -0.37], [0.15, -0.33]] },
      { pts: [[-0.02, -0.08], [0.47, 0.33]], sharp: true, gaps: [[0.55, 0.7]] },
      { pts: [[0.08, -0.12], [0.53, 0.22]], sharp: true },
      { pts: wave(-0.3, 0.08, 0.36, 0.028, 6, 0.3), gaps: [[0.3, 0.55]] },
      { pts: wave(-0.15, 0.1, 0.4, 0.028, 6, 1.6) },
      { pts: wave(0.0, 0.08, 0.34, 0.028, 6, 2.9), gaps: [[0.6, 0.9]] },
    ],
  },
  // a crescent moon with a star, dozing (z z)
  moon: {
    color: '#ffa733', power: 5.8, w: 0.66, h: 0.78,
    strokes: [
      { pts: [...arcPts(-0.05, 0, 0.25, deg(55), deg(305), 12), ...arcPts(0.05, 0.02, 0.19, deg(-62), deg(-298), 10)], closed: true, gaps: [[0.35, 0.48]] },
      { pts: star(0.18, 0.24, 0.075), closed: true, sharp: true, gaps: [[0.6, 0.8]] },
      { pts: [[0.13, -0.08], [0.22, -0.08], [0.13, -0.18], [0.22, -0.18]], sharp: true },
      { pts: [[0.2, 0.05], [0.26, 0.05], [0.2, -0.02], [0.26, -0.02]], sharp: true },
    ],
  },
  // a cat's face: ears, happy closed eyes, a little ω mouth, whiskers
  cat: {
    color: '#2fe4ff', power: 6.8, w: 0.8, h: 0.72,
    strokes: [
      {
        pts: [[0, -0.25], [0.2, -0.21], [0.29, -0.06], [0.285, 0.1], [0.27, 0.28], [0.15, 0.18], [0, 0.2], [-0.15, 0.18], [-0.27, 0.28], [-0.285, 0.1], [-0.29, -0.06], [-0.2, -0.21]],
        closed: true, gaps: [[0.12, 0.2], [0.55, 0.62]],
      },
      { pts: [[-0.17, 0.0], [-0.12, 0.055], [-0.07, 0.0]] },
      { pts: [[0.07, 0.0], [0.12, 0.055], [0.17, 0.0]], gaps: [[0.2, 0.7]] },
      { pts: [[-0.07, -0.075], [-0.035, -0.115], [0, -0.08], [0.035, -0.115], [0.07, -0.075]] },
      { pts: [[-0.21, -0.1], [-0.35, -0.06]], sharp: true },
      { pts: [[0.21, -0.1], [0.35, -0.06]], sharp: true, gaps: [[0.3, 0.8]] },
    ],
  },
  // the noodle bar's sign downstairs, hung off the building right outside the window (it's
  // seen through the glass: fixtures.js): a round paper lantern — its ribs, caps, hook and
  // tassel — with a little steaming bowl in it. The same from either side, so it reads from in here
  street: {
    color: '#ff5a4f', power: 34, w: 0.62, h: 0.9,
    strokes: [
      { pts: [[-0.1, 0.24], [0.1, 0.24], [0.2, 0.17], [0.245, 0.0], [0.2, -0.17], [0.1, -0.24], [-0.1, -0.24], [-0.2, -0.17], [-0.245, 0.0], [-0.2, 0.17]], closed: true, gaps: [[0.3, 0.4], [0.72, 0.8]] },
      { pts: [[-0.08, 0.235], [-0.145, 0.0], [-0.08, -0.235]], gaps: [[0.45, 0.7]] },
      { pts: [[0.08, 0.235], [0.145, 0.0], [0.08, -0.235]] },
      { pts: [[-0.09, 0.3], [0.09, 0.3]], sharp: true },
      { pts: [[-0.09, -0.3], [0.09, -0.3]], sharp: true, gaps: [[0.2, 0.55]] },
      { pts: [[0, 0.31], [0, 0.4]], sharp: true },
      { pts: wave(0, -0.31, -0.42, 0.014, 5, 0.4) },
      { pts: [[-0.075, -0.02], [-0.05, -0.08], [0, -0.1], [0.05, -0.08], [0.075, -0.02]], gaps: [[0.55, 0.8]] },
      { pts: [[-0.085, -0.02], [0.085, -0.02]], sharp: true },
      { pts: wave(0, 0.02, 0.14, 0.018, 5, 1.2) },
    ],
  },
};

// a stroke → evenly spaced points along it (≈1 cm apart) with their arc length
function sample(st) {
  const P = st.pts.map(([x, y]) => new THREE.Vector3(x, y, 0));
  let pts;
  if (st.sharp) {
    const ring = st.closed ? [...P, P[0]] : P;
    pts = [];
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1];
      const b = ring[i];
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.01));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push(a.clone().lerp(b, k / n));
    }
    if (st.closed) pts.pop();
  } else {
    const curve = new THREE.CatmullRomCurve3(P, !!st.closed, 'centripetal');
    const n = Math.max(4, Math.ceil(curve.getLength() / 0.01));
    pts = curve.getSpacedPoints(n);
    if (st.closed) pts.pop();
  }
  const arc = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) arc[i] = arc[i - 1] + pts[i].distanceTo(pts[i - 1]);
  const len = arc[arc.length - 1] + (st.closed ? pts[pts.length - 1].distanceTo(pts[0]) : 0);
  return { pts, arc, len };
}

// one tube along sampled points: rings of RING vertices facing out of the axis; the board
// plane holds the axis, so the rings are spanned by the in-plane normal and +z
function tube(s, closed) {
  const { pts } = s;
  const n = pts.length;
  const pos = new Float32Array(n * RING * 3);
  const nor = new Float32Array(n * RING * 3);
  const t = new THREE.Vector3();
  const side = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    t.subVectors(b, a).normalize();
    side.crossVectors(Z, t).normalize();
    for (let k = 0; k < RING; k++) {
      const ang = (k / RING) * Math.PI * 2;
      const nx = side.x * Math.cos(ang);
      const ny = side.y * Math.cos(ang);
      const nz = Math.sin(ang);
      const j = (i * RING + k) * 3;
      nor[j] = nx;
      nor[j + 1] = ny;
      nor[j + 2] = nz;
      pos[j] = pts[i].x + nx * TUBE_R;
      pos[j + 1] = pts[i].y + ny * TUBE_R;
      pos[j + 2] = TUBE_Z + nz * TUBE_R;
    }
  }
  const idx = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const i2 = (i + 1) % n;
    for (let k = 0; k < RING; k++) {
      const k2 = (k + 1) % RING;
      const a = i * RING + k;
      const b = i * RING + k2;
      const c = i2 * RING + k;
      const d = i2 * RING + k2;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// dark tubes of dead glass (diffuse) ↔ new glass (a pale tint of the sign's colour) that
// glows when on: aLit per vertex (0 dead, 1 new) · a dead tube's broken-off bits (aGap)
// collapse onto its axis, so they show as gaps until a new tube goes in
function tubeMaterial(color) {
  const c = new THREE.Color(color);
  const uniforms = {
    uDead: { value: new THREE.Color('#4a4650') },
    uGlass: { value: c.clone().lerp(new THREE.Color(1, 1, 1), 0.55) },
    uGlow: { value: c.clone().multiplyScalar(7.5) },
    uOn: { value: 1 },
    uRadius: { value: TUBE_R },
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLit;\nattribute float aGap;\nvarying float vLit;\nuniform float uRadius;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit;\ntransformed -= objectNormal * uRadius * 0.97 * aGap * (1.0 - step(0.5, aLit));');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uDead;\nuniform vec3 uGlass;\nuniform vec3 uGlow;\nuniform float uOn;\nvarying float vLit;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(uDead, uGlass, vLit);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = uGlow * vLit * uOn;');
  };
  m.customProgramCacheKey = () => 'neon-tube-1';
  m.userData.neon = uniforms;
  return m;
}

// a rounded-corner board (a flat box with its corners cut round), back at z = 0
function board(w, h, d, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 4 });
}

const boardMat = new THREE.MeshStandardMaterial({ color: '#232638', roughness: 0.55, metalness: 0.1 });
const rimMat = new THREE.MeshStandardMaterial({ color: '#4b4f66', roughness: 0.45, metalness: 0.3 });
const capMat = new THREE.MeshStandardMaterial({ color: '#2b2a30', roughness: 0.5, metalness: 0.4 });

// a sign: its object (board, tubes, electrode caps, standoffs; facing +z, back at z = 0,
// centred on its board) and the coverage of its tubes
export function makeSign(name) {
  const spec = SIGNS[name];
  const g = new THREE.Group();
  g.name = `sign:${name}`;
  const b = new THREE.Mesh(board(spec.w, spec.h, 0.02, 0.07), boardMat);
  const rim = new THREE.Mesh(board(spec.w + 0.03, spec.h + 0.03, 0.012, 0.085), rimMat);
  rim.position.z = 0.002;
  b.castShadow = true;
  b.receiveShadow = true;
  g.add(rim, b);

  const strokes = [];
  const geos = [];
  const bits = [];
  let v0 = 0;
  const capGeo = new THREE.CylinderGeometry(TUBE_R * 1.35, TUBE_R * 1.35, 0.035, 8).rotateX(Math.PI / 2);
  const clipGeo = new THREE.CylinderGeometry(0.006, 0.006, TUBE_Z - 0.02, 5).rotateX(Math.PI / 2);
  const q = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  for (const st of spec.strokes) {
    const s = sample(st);
    const geo = tube(s, !!st.closed);
    const n = s.pts.length;
    const gap = new Float32Array(n * RING);
    for (const [a, c] of st.gaps ?? []) {
      for (let i = 0; i < n; i++) {
        const f = s.arc[i] / s.len;
        if (f >= a && f <= c) gap.fill(1, i * RING, (i + 1) * RING);
      }
    }
    geo.setAttribute('aGap', new THREE.BufferAttribute(gap, 1));
    geo.setAttribute('aLit', new THREE.BufferAttribute(new Float32Array(n * RING), 1));
    geos.push(geo);
    strokes.push({ ...s, closed: !!st.closed, v0, n, bins: new Uint8Array(Math.ceil(s.len / BIN) + 1) });
    v0 += n; // (in rings: vertex = (v0 + ring) * RING + k)
    // electrode caps where an open tube ends (where it would dive into the board)
    if (!st.closed) {
      for (const [i, j] of [[0, 1], [n - 1, n - 2]]) {
        const dir = s.pts[i].clone().sub(s.pts[j]).normalize();
        const cap = capGeo.clone();
        q.setFromUnitVectors(Z, dir);
        cap.applyQuaternion(q).translate(s.pts[i].x + dir.x * 0.012, s.pts[i].y + dir.y * 0.012, TUBE_Z);
        bits.push(cap);
      }
    }
    // standoff clips every ~22 cm
    const clips = Math.max(2, Math.round(s.len / 0.22));
    for (let k = 0; k < clips; k++) {
      const i = Math.min(n - 1, Math.round(((k + 0.5) / clips) * (n - 1)));
      bits.push(clipGeo.clone().translate(s.pts[i].x, s.pts[i].y, 0.02 + (TUBE_Z - 0.02) / 2));
    }
  }
  const mat = tubeMaterial(spec.color);
  const tubes = new THREE.Mesh(mergeGeometries(geos, false), mat);
  tubes.name = `tubes:${name}`;
  const lit = tubes.geometry.getAttribute('aLit');
  lit.setUsage(THREE.DynamicDrawUsage);
  const capMesh = new THREE.Mesh(mergeGeometries(bits.filter((x) => x.attributes.position.count && x.index).map((x) => x.toNonIndexed()), false), capMat);
  g.add(tubes, capMesh);
  for (const o of [rim, tubes, capMesh]) o.castShadow = false;
  g.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
  const total = strokes.reduce((a, s) => a + s.len, 0);

  // ---- coverage ----
  const binOf = (s, arc) => THREE.MathUtils.clamp(Math.round(arc / BIN), 0, s.bins.length - 1);
  function refresh(s) {
    const a = lit.array;
    for (let i = 0; i < s.n; i++) a.fill(s.bins[binOf(s, s.arc[i])], (s.v0 + i) * RING, (s.v0 + i + 1) * RING);
    lit.needsUpdate = true;
  }
  let litLen = 0;
  const count = () => {
    let n = 0;
    let all = 0;
    for (const s of strokes) {
      for (const v of s.bins) n += v;
      all += s.bins.length;
    }
    litLen = n / all;
  };
  const glass = new THREE.Color(1, 1, 1);
  const sign = {
    name,
    spec,
    object: g,
    board: b,
    tubes,
    strokes,
    total,
    material: mat,
    // its colour: the tubes' glass and glow (the light it throws is the lamp's: fixtures.js)
    color: spec.color,
    setColor(hex) {
      sign.color = hex;
      const u = mat.userData.neon;
      u.uGlass.value.set(hex).lerp(glass, 0.55);
      u.uGlow.value.set(hex).multiplyScalar(7.5);
    },
    // 0..1: how much of its tubing is new
    get lit() { return litLen; },
    get done() { return litLen >= 0.999; },
    // every tube new (1) or old (0)
    setAll(v) {
      for (const s of strokes) {
        s.bins.fill(v ? 1 : 0);
        refresh(s);
      }
      count();
    },
    // new tube along stroke si from arc a to arc b (metres; the short way round on a
    // closed tube), `pad` either side → bins newly lit
    light(si, a, b, pad = 0.02) {
      const s = strokes[si];
      let lo = Math.min(a, b) - pad;
      let hi = Math.max(a, b) + pad;
      if (s.closed && Math.abs(b - a) > s.len / 2) {
        // across the join: the two ends
        lo = Math.max(a, b) - pad;
        hi = Math.min(a, b) + s.len + pad;
      }
      let fresh = 0;
      for (let d = lo; d <= hi + 1e-6; d += BIN) {
        let x = d;
        if (s.closed) x = ((x % s.len) + s.len) % s.len;
        else if (x < 0 || x > s.len) continue;
        const k = binOf(s, x);
        if (!s.bins[k]) {
          s.bins[k] = 1;
          fresh++;
        }
      }
      if (fresh) {
        refresh(s);
        count();
      }
      return fresh;
    },
    // the nearest point of stroke si (or of any stroke) to (x, y) on the board:
    // { si, arc, d } — near: only look within `span` metres of arc `near`
    nearest(x, y, si = null, near = null, span = 0.3) {
      let best = null;
      const list = si === null ? strokes.map((_, i) => i) : [si];
      for (const i of list) {
        const s = strokes[i];
        for (let k = 0; k < s.n; k++) {
          if (near !== null) {
            let da = Math.abs(s.arc[k] - near);
            if (s.closed) da = Math.min(da, s.len - da);
            if (da > span) continue;
          }
          const d = Math.hypot(s.pts[k].x - x, s.pts[k].y - y);
          if (!best || d < best.d) best = { si: i, arc: s.arc[k], d };
        }
      }
      return best;
    },
    // a point of stroke si at arc (board frame)
    pointAt(si, arc) {
      const s = strokes[si];
      let k = 0;
      while (k < s.n - 1 && s.arc[k + 1] < arc) k++;
      return s.pts[k].clone().setZ(TUBE_Z);
    },
    // what's lit, compactly: per stroke the runs of lit bins [from, to, from, to, …]
    serialize() {
      return strokes.map((s) => {
        const runs = [];
        let start = -1;
        for (let i = 0; i <= s.bins.length; i++) {
          const v = i < s.bins.length ? s.bins[i] : 0;
          if (v && start < 0) start = i;
          if (!v && start >= 0) {
            runs.push(start, i - 1);
            start = -1;
          }
        }
        return runs;
      });
    },
    restore(data) {
      strokes.forEach((s, i) => {
        s.bins.fill(0);
        const runs = data?.[i] ?? [];
        for (let k = 0; k + 1 < runs.length; k += 2) s.bins.fill(1, runs[k], Math.min(s.bins.length, runs[k + 1] + 1));
        refresh(s);
      });
      count();
    },
  };
  sign.setAll(1);
  return sign;
}
