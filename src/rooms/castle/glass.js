import * as THREE from 'three';

// The stained-glass lancet in the castle's left wall, and the coloured sunlight it throws.
//
// three.js shadows can't be coloured, so the sun itself is kept out of this window (the glass
// is opaque to the sun's shadow map) and a second light does its job: a SpotLight far out
// along the sun's direction, aimed at the window, whose `map` (a light cookie) is the window's
// glass as the spot sees it — each pane's colour, black for the leading and for any pane that
// isn't there. Its projection lands on the floor exactly where the sun through this window
// would, so the room gets a patch of ruby / sapphire / gold light that moves with the day.
// It is a real light: the GI probes see the coloured patch and bounce it, furniture in the way
// catches the colour and casts a shadow in it (the spot's shadow map starts past the wall —
// camera `near` — so the window's own glass and stone don't block it).
//
// Window space: s across the glass (the room's view: s grows to the viewer's right, world −z),
// t = height. Canvases over the window's bounding rectangle (w × (yA − y0)), top row = yA —
// the same frame as the grime sheet on it (grime.js), so the level's grime mask can be laid
// straight over the panes.
//
//   buildStainedGlass(root, { sun, win, x }) → { mesh, spot, panes, paneAt(s, t), set(i, on),
//     setAll(on), flash(i), setGrime(mask | null), update(dt), changed (a counter: bumps when
//     the light it throws changed — the level redoes the bounce light) }

export const GLASS = {
  ruby: '#f0352c',
  sapphire: '#2f6bff',
  emerald: '#27c85a',
  gold: '#ffc23a',
  rose: '#ff7aa8',
  violet: '#9b5cff',
  pale: '#fff1c8',
};
const LEAD = 0.014; // half the width of a lead came, metres
const PX = 300; // canvas pixels per metre of glass
const D = 24; // how far out along the sun the spot stands
const MAP = 512;
const GAIN = 1.8;

// the lancet's outline in window space: straight jambs up to the springing line ys, an
// equilateral pointed arch to the apex yA
export function lancetPath(ctx, { w, y0, ys }, toPx) {
  const [lx, ly] = toPx(-w / 2, y0);
  const [rx] = toPx(w / 2, y0);
  const [, sy] = toPx(0, ys);
  const r = w * PX;
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(lx, sy);
  // left arc: centred on the right springing point, from the left springing point up to the apex
  ctx.arc(rx, sy, r, Math.PI, Math.PI + Math.PI / 3, false);
  // right arc: centred on the left springing point, from the apex down to the right springing point
  ctx.arc(lx, sy, r, -Math.PI / 3, 0, false);
  ctx.lineTo(rx, ly);
  ctx.closePath();
}

// the panes: a 3 × 4 grid in the straight part, a roundel of four quarters and two
// spandrels in the arch head
function layout({ w, y0, ys, yA }) {
  const panes = [];
  const cols = [-w / 2, -w / 2 + w * 0.31, w / 2 - w * 0.31, w / 2];
  const rows = 4;
  const rh = (ys - y0) / rows;
  // (bottom row first) ruby and sapphire down the sides in turn, a gold / green spine;
  // each pane has a little round "jewel" of another colour leaded into it
  const grid = [
    ['sapphire', 'emerald', 'ruby'],
    ['ruby', 'gold', 'sapphire'],
    ['sapphire', 'rose', 'ruby'],
    ['ruby', 'gold', 'sapphire'],
  ];
  const jewel = { ruby: 'gold', sapphire: 'pale', emerald: 'gold', gold: 'ruby', rose: 'sapphire' };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 3; c++) {
      const k = grid[r][c];
      panes.push({ kind: 'rect', s0: cols[c], s1: cols[c + 1], t0: y0 + r * rh, t1: y0 + (r + 1) * rh, color: GLASS[k], jewel: GLASS[jewel[k]] });
    }
  }
  const head = yA - ys;
  const ro = { s: 0, t: ys + head * 0.42, r: Math.min(w * 0.3, head * 0.4) };
  panes.push({ kind: 'spandrel', side: -1, color: GLASS.sapphire });
  panes.push({ kind: 'spandrel', side: 1, color: GLASS.sapphire });
  ['gold', 'ruby', 'gold', 'ruby'].forEach((c, q) => panes.push({ kind: 'quarter', q, ro, color: GLASS[c] }));
  panes.push({ kind: 'boss', ro, color: GLASS.violet });
  panes.forEach((p, i) => {
    p.i = i;
    p.on = true;
    p.flash = 0;
  });
  return { panes, ro };
}

export function buildStainedGlass(root, { sun, win, x }) {
  const { w, y0, ys, yA, zc } = win;
  const h = yA - y0;
  const CW = Math.round(w * PX);
  const CH = Math.round(h * PX);
  const toPx = (s, t) => [(s + w / 2) * PX, (yA - t) * PX];
  const { panes, ro } = layout(win);

  const mk = (W, H) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };
  const albedo = mk(CW, CH); // what the glass looks like lit from the room side
  const light = mk(CW, CH); // what shines through (the emissive map): colour, black lead, black plugs
  const lit = mk(CW, CH); // the light through the grime (the spot's source)
  const dark = mk(CW, CH); // scratch: the grime as black
  const cookie = mk(MAP, MAP); // the spot's map, in the spot's own frame

  // ---- drawing the panes ---------------------------------------------------------------------
  function panePath(g, p) {
    g.beginPath();
    if (p.kind === 'rect') {
      const [a, b] = toPx(p.s0 + LEAD, p.t1 - LEAD);
      const [c, d] = toPx(p.s1 - LEAD, p.t0 + LEAD);
      g.rect(a, b, c - a, d - b);
    } else if (p.kind === 'spandrel') {
      // half the head, inside the arch, outside the roundel (drawn clipped: see drawPanes)
      const [a, b] = toPx(p.side < 0 ? -w / 2 : LEAD, yA);
      const [c, d] = toPx(p.side < 0 ? -LEAD : w / 2, ys + LEAD);
      g.rect(a, b, c - a, d - b);
    } else {
      const [cx, cy] = toPx(ro.s, ro.t);
      const R = (ro.r - LEAD) * PX;
      if (p.kind === 'boss') {
        g.arc(cx, cy, ro.r * 0.34 * PX, 0, Math.PI * 2);
      } else {
        const a0 = (p.q * Math.PI) / 2 + (LEAD / ro.r);
        const a1 = ((p.q + 1) * Math.PI) / 2 - (LEAD / ro.r);
        const ri = ro.r * 0.34 * PX + LEAD * PX * 2;
        g.arc(cx, cy, R, a0, a1, false);
        g.arc(cx, cy, ri, a1, a0, true);
        g.closePath();
      }
    }
  }
  // clip the head's spandrels to the arch and to outside the roundel; everything to the outline
  function drawPanes(g, fill, lead) {
    g.save();
    lancetPath(g, win, toPx);
    g.clip();
    for (const p of panes) {
      g.save();
      if (p.kind === 'spandrel') {
        // inside the arch less a lead's width, outside the roundel's ring
        const [cx, cy] = toPx(ro.s, ro.t);
        g.beginPath();
        g.rect(0, 0, CW, CH);
        g.arc(cx, cy, (ro.r + LEAD) * PX, 0, Math.PI * 2, true);
        g.clip('evenodd');
      }
      panePath(g, p);
      g.fillStyle = fill(p);
      g.fill();
      if (p.jewel && p.on) {
        // the jewel: a lead ring, then its own colour
        const [cx, cy] = toPx((p.s0 + p.s1) / 2, (p.t0 + p.t1) / 2);
        const r = Math.min(p.s1 - p.s0, p.t1 - p.t0) * 0.26 * PX;
        g.beginPath();
        g.arc(cx, cy, r + LEAD * PX, 0, Math.PI * 2);
        g.fillStyle = lead;
        g.fill();
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fillStyle = fill({ ...p, color: p.jewel });
        g.fill();
      }
      g.restore();
    }
    g.restore();
  }
  const col = new THREE.Color();
  const hex = (c) => `#${c.getHexString()}`;
  // an old rag stuffed into a missing pane: brown-grey cloth, a fold or two
  let ragPattern = null;
  function rag(g) {
    if (!ragPattern) {
      const c = mk(64, 64);
      const r = c.getContext('2d');
      r.fillStyle = '#7d6a55';
      r.fillRect(0, 0, 64, 64);
      r.strokeStyle = 'rgba(40, 30, 22, 0.55)';
      r.lineWidth = 4;
      for (const [a, b, cc, d] of [[0, 20, 64, 34], [10, 64, 40, 0], [0, 52, 64, 46]]) {
        r.beginPath();
        r.moveTo(a, b);
        r.quadraticCurveTo(32, (b + d) / 2 + 10, cc, d);
        r.stroke();
      }
      r.fillStyle = 'rgba(160, 140, 110, 0.5)';
      r.fillRect(8, 8, 18, 10);
      ragPattern = g.createPattern(c, 'repeat');
    }
    return ragPattern;
  }
  function drawAlbedo() {
    const g = albedo.getContext('2d');
    g.fillStyle = '#2b2622'; // lead
    g.fillRect(0, 0, CW, CH);
    drawPanes(g, (p) => (p.on ? hex(col.set(p.color).multiplyScalar(0.55)) : rag(g)), '#2b2622');
    albedoTex.needsUpdate = true;
  }
  function drawLight() {
    const g = light.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, CW, CH);
    drawPanes(g, (p) => (p.on ? hex(col.set(p.color).lerp(new THREE.Color(1, 1, 1), p.flash * 0.8)) : '#000'), '#000');
    lightTex.needsUpdate = true;
    litDirty = true;
  }

  // ---- the glass itself ----------------------------------------------------------------------------
  const texOf = (c) => {
    const t = new THREE.Texture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const albedoTex = texOf(albedo);
  // (the glow through the glass: the panes as they are — the grime sheet in front already dims it)
  const lightTex = texOf(light);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, y0);
  shape.lineTo(-w / 2, ys);
  shape.absarc(w / 2, ys, w, Math.PI, Math.PI * 2 / 3, true);
  shape.absarc(-w / 2, ys, w, Math.PI / 3, 0, true);
  shape.lineTo(w / 2, y0);
  const geo = new THREE.ShapeGeometry(shape, 24);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) - y0) / h);
  const mat = new THREE.MeshStandardMaterial({
    name: 'stained-glass', map: albedoTex, emissive: 0xffffff, emissiveMap: lightTex, emissiveIntensity: 2, roughness: 0.25, metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.PI / 2; // shape +x → world −z (the room's view), +z → world +x (into the room)
  mesh.position.set(x, 0, zc);
  mesh.castShadow = true; // (keeps the plain sun out: this window's light is the spot's)
  mesh.receiveShadow = false;
  mesh.name = 'stained-glass';
  root.add(mesh);

  // ---- the coloured sun ------------------------------------------------------------------------------
  const cookieTex = new THREE.Texture(cookie);
  cookieTex.colorSpace = THREE.SRGBColorSpace;
  const spot = new THREE.SpotLight(0xffffff, 0, D * 3, 0.1, 0, 0);
  spot.map = cookieTex;
  spot.castShadow = true;
  spot.shadow.mapSize.set(512, 512); // (only furniture standing in the light needs it; the cookie draws the pattern)
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  spot.shadow.radius = 2;
  spot.shadow.camera.near = D + 0.75; // (starts past the wall: the window doesn't shadow its own light)
  spot.name = 'stained-glass-sun';
  const centre = new THREE.Vector3(x, (y0 + yA) / 2, zc);
  spot.target.position.copy(centre);
  root.add(spot, spot.target);
  // the cone: wide enough for the whole window whichever way the sun comes in
  spot.angle = Math.atan((0.5 * Math.hypot(w, h) + 0.15) / D);

  // the window's rectangle corners in the world (canvas (0,0), (CW,0), (0,CH))
  const corner = (s, t) => new THREE.Vector3(x, t, zc - s);
  const corners = [corner(-w / 2, yA), corner(w / 2, yA), corner(-w / 2, y0)];
  const v = new THREE.Vector3();
  let grime = null; // { mask, visible: () => bool }
  let grimeVer = -1;
  const dir = new THREE.Vector3();
  const lastDir = new THREE.Vector3();
  let litDirty = true;
  let cookieDirty = true;
  let litAt = -1e9;
  let cookieAt = -1e9;
  let flashing = false;
  const state = { changed: 0 };

  function composeLit() {
    const g = lit.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, CW, CH);
    g.drawImage(light, 0, 0);
    if (grime && grime.visible()) {
      // the grime as black at its own alpha, over the panes (dirty glass lets less through)
      const d = dark.getContext('2d');
      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, CW, CH);
      d.drawImage(grime.mask.canvas, 0, 0, CW, CH);
      d.globalCompositeOperation = 'source-in';
      d.fillStyle = '#000';
      d.fillRect(0, 0, CW, CH);
      g.drawImage(dark, 0, 0);
    }
  }
  function drawCookie() {
    spot.updateMatrixWorld();
    spot.target.updateMatrixWorld();
    spot.shadow.updateMatrices(spot);
    const cam = spot.shadow.camera;
    const P = corners.map((c) => {
      v.copy(c).project(cam);
      return [(v.x * 0.5 + 0.5) * MAP, (0.5 - v.y * 0.5) * MAP];
    });
    const g = cookie.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, MAP, MAP);
    g.setTransform(
      (P[1][0] - P[0][0]) / CW, (P[1][1] - P[0][1]) / CW,
      (P[2][0] - P[0][0]) / CH, (P[2][1] - P[0][1]) / CH,
      P[0][0], P[0][1],
    );
    g.drawImage(lit, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    cookieTex.needsUpdate = true;
  }

  const api = {
    mesh,
    spot,
    panes,
    win,
    get changed() { return state.changed; },
    // the pane at a window-space point (null: lead, stone, or outside)
    paneAt(s, t) {
      if (Math.abs(s) > w / 2 || t < y0 || t > yA) return null;
      if (t < ys) {
        return panes.find((p) => p.kind === 'rect' && s >= p.s0 && s < p.s1 && t >= p.t0 && t < p.t1) ?? null;
      }
      const dx = s - ro.s;
      const dy = t - ro.t;
      const d = Math.hypot(dx, dy);
      if (d < ro.r * 0.34) return panes.find((p) => p.kind === 'boss');
      if (d < ro.r) {
        // canvas angles run clockwise from +x with y down: flip t
        let a = Math.atan2(-dy, dx);
        if (a < 0) a += Math.PI * 2;
        return panes.find((p) => p.kind === 'quarter' && p.q === Math.floor(a / (Math.PI / 2)));
      }
      // inside the pointed arch?
      const inArch = Math.hypot(s - w / 2, t - ys) <= w && Math.hypot(s + w / 2, t - ys) <= w;
      return inArch ? panes.find((p) => p.kind === 'spandrel' && p.side === (s < 0 ? -1 : 1)) : null;
    },
    // a pane's centre in window space (the level's tools and timelapse aim at it)
    centreOf(p) {
      if (p.kind === 'rect') return [(p.s0 + p.s1) / 2, (p.t0 + p.t1) / 2];
      if (p.kind === 'spandrel') return [p.side * w * 0.36, ys + (yA - ys) * 0.12];
      if (p.kind === 'boss') return [ro.s, ro.t];
      const a = (p.q + 0.5) * (Math.PI / 2);
      return [ro.s + Math.cos(a) * ro.r * 0.68, ro.t - Math.sin(a) * ro.r * 0.68];
    },
    // window space ↔ world
    toWorld: (s, t, out = new THREE.Vector3()) => out.set(x, t, zc - s),
    toWindow: (p) => [zc - p.z, p.y],
    set(i, on) {
      const p = panes[i];
      if (!p || p.on === on) return;
      p.on = on;
      p.flash = 0;
      drawAlbedo();
      drawLight();
      litDirty = true;
    },
    setAll(on) {
      for (const p of panes) {
        p.on = typeof on === 'function' ? on(p) : on;
        p.flash = 0;
      }
      drawAlbedo();
      drawLight();
      litDirty = true;
    },
    // a pane just set in: it glows white for a moment
    flash(i) {
      if (!panes[i]) return;
      panes[i].flash = 1;
      flashing = true;
    },
    // the level's grime mask on this window (grime.js), or null
    setGrime(g) {
      grime = g;
      grimeVer = -1;
      litDirty = true;
    },
    // per frame (from the room's update): follow the sun; redraw what changed
    update(dt) {
      if (flashing) {
        flashing = false;
        for (const p of panes) {
          if (p.flash <= 0) continue;
          p.flash = Math.max(0, p.flash - dt * 2.5);
          flashing = true;
        }
        drawLight();
      }
      // the grime being wiped (its canvas texture's version moves on every change)
      const gv = grime ? (grime.visible() ? grime.mask.tex.version : -2) : -3;
      if (gv !== grimeVer) {
        grimeVer = gv;
        litDirty = true;
      }
      // (while the glass is being worked on — wiped every frame, a pane flashing — the canvases
      // are redrawn and uploaded at most ~16 times a second; wall-clock time: ?still has dt = 0)
      const now = performance.now();
      if (litDirty && now - litAt > 60) {
        litDirty = false;
        litAt = now;
        composeLit();
        cookieDirty = true;
        state.changed++;
      }
      // the sun: same colour and strength; the cookie is redrawn when it swings round (at
      // once: the spot and its cookie must move together, or the pattern slides off the window)
      let swung = false;
      dir.copy(sun.target.position).sub(sun.position);
      if (dir.lengthSq() > 1e-6 && dir.normalize().distanceToSquared(lastDir) > 1e-7) {
        lastDir.copy(dir);
        spot.position.copy(centre).addScaledVector(dir, -D);
        cookieDirty = true;
        swung = true;
      }
      // (coloured glass passes a fraction of the light — a deep ruby ~20% — so the spot is
      // brighter than the sun it stands for: the patch should read, not be true to the glass)
      spot.color.copy(sun.color);
      spot.intensity = sun.intensity * GAIN;
      // the glass glows with the daylight behind it (a little even at night)
      mat.emissiveIntensity = 0.1 + sun.intensity * 0.16;
      if (cookieDirty && (swung || now - cookieAt > 60)) {
        cookieDirty = false;
        cookieAt = now;
        drawCookie();
      }
    },
  };
  drawAlbedo();
  drawLight();
  return api;
}
