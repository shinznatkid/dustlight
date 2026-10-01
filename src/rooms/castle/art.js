import * as THREE from 'three';
import { mulberry } from '../../atmos.js';

// Canvas-painted textures for the castle room, in the chunky KayKit spirit (soft flat
// colours, no photo scans): the dressed stone of the walls, the tapestries, the rug, the
// pennant, the pages of the book on the lectern. Each canvas is fully painted before it
// becomes a texture (WebGL2 texture storage is immutable: docs/lighting-notes.md).

function tex(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.Texture();
  t.image = c;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
export function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

// ---- dressed stone (ashlar): courses of blocks with sunk mortar joints --------------------
// One seamless tile of TILE metres. `detail`: a grey map normalised around 1 (each block a
// touch lighter at the top, like KayKit's gradient swatches — the paint / stone colour
// comes from the material) · `normal`: rounded block edges, sunk joints.
export const ASHLAR_TILE = 2.4;
let ashlarCache = null;
export function ashlar() {
  if (ashlarCache) return ashlarCache;
  const N = 1024;
  const px = N / ASHLAR_TILE;
  const rnd = mulberry(5);
  // courses: heights that add up to the tile exactly
  const courses = [];
  let y = 0;
  const hs = [0.3, 0.26, 0.34, 0.28, 0.3, 0.32, 0.26, 0.34];
  for (const h of hs) {
    courses.push({ y0: y, y1: y + h });
    y += h;
  }
  const k = ASHLAR_TILE / y;
  for (const c of courses) { c.y0 *= k; c.y1 *= k; }
  const blocks = [];
  for (const c of courses) {
    let x = rnd() * 0.5;
    const start = x;
    while (x < start + ASHLAR_TILE - 0.2) {
      const len = Math.min(0.38 + rnd() * 0.42, start + ASHLAR_TILE - x);
      blocks.push({ x0: x, x1: x + len, y0: c.y0, y1: c.y1, v: 0.92 + rnd() * 0.09, tint: rnd() });
      x += len;
    }
    // the last block closes the loop onto the first
    blocks[blocks.length - 1].x1 = start + ASHLAR_TILE;
  }
  const J = 0.018; // half the joint width, metres
  const B = 0.035; // bevel
  const height = new Float32Array(N * N);
  const detail = canvas(N, N, (g) => {
    const img = g.createImageData(N, N);
    const d = img.data;
    // mortar first
    for (let i = 0; i < N * N; i++) {
      const n = 0.78 + 0.04 * rnd();
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(235 * n);
      d[i * 4 + 3] = 255;
    }
    for (const b of blocks) {
      for (const off of [-ASHLAR_TILE, 0, ASHLAR_TILE]) {
        const bx0 = b.x0 + off + J;
        const bx1 = b.x1 + off - J;
        const by0 = b.y0 + J;
        const by1 = b.y1 - J;
        const ix0 = Math.max(0, Math.floor(bx0 * px));
        const ix1 = Math.min(N, Math.ceil(bx1 * px));
        if (ix1 <= ix0) continue;
        for (let iy = Math.floor(by0 * px); iy < Math.ceil(by1 * px); iy++) {
          const yy = (iy + 0.5) / px;
          // canvas rows run down; the tile's y runs up
          const row = N - 1 - iy;
          if (row < 0 || row >= N) continue;
          const up = (yy - by0) / (by1 - by0);
          for (let ix = ix0; ix < ix1; ix++) {
            const xx = (ix + 0.5) / px;
            const e = Math.min(xx - bx0, bx1 - xx, yy - by0, by1 - yy);
            if (e < 0) continue;
            const bev = Math.min(1, e / B);
            const h = Math.sqrt(bev);
            height[row * N + ix] = h;
            // light top → a little deeper at the foot of the block; a speckle
            const v = b.v * (0.9 + 0.13 * up) * (0.97 + 0.06 * rnd()) * (0.86 + 0.14 * h);
            const i4 = (row * N + ix) * 4;
            const c = Math.min(255, Math.round(235 * v));
            d[i4] = d[i4 + 1] = d[i4 + 2] = c;
          }
        }
      }
    }
    g.putImageData(img, 0, 0);
  });
  // normal map from the height field (sobel), tangent space: x right, y up
  const normal = canvas(N, N, (g) => {
    const img = g.createImageData(N, N);
    const d = img.data;
    const H = (x, yy) => height[((yy + N) % N) * N + ((x + N) % N)];
    const s = 3.2;
    for (let yy = 0; yy < N; yy++) {
      for (let x = 0; x < N; x++) {
        const dx = (H(x + 1, yy) - H(x - 1, yy)) * s;
        const dy = (H(x, yy - 1) - H(x, yy + 1)) * s; // rows run down
        const l = Math.hypot(dx, dy, 1);
        const i4 = (yy * N + x) * 4;
        d[i4] = Math.round((-dx / l * 0.5 + 0.5) * 255);
        d[i4 + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
        d[i4 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
        d[i4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
  ashlarCache = {
    detail: tex(detail, { srgb: false, repeat: true }),
    normal: tex(normal, { srgb: false, repeat: true }),
  };
  for (const t of Object.values(ashlarCache)) t.repeat.set(1 / ASHLAR_TILE, 1 / ASHLAR_TILE);
  return ashlarCache;
}

// ---- tapestries: wool pictures with a border and a fringe along the bottom ---------------------
function wool(g, W, H, rnd, amt = 16) {
  const d = g.getImageData(0, 0, W, H);
  for (let i = 0; i < d.data.length; i += 4) {
    const x = (i / 4) % W;
    const n = (rnd() - 0.5) * amt + (x % 3 === 0 ? -6 : 0);
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
}
function border(g, W, H, { outer = '#b8322c', inner = '#e8b43a', dots = '#f4e2b0' } = {}) {
  g.fillStyle = outer;
  g.fillRect(0, 0, W, 34);
  g.fillRect(0, H - 60, W, 60);
  g.fillRect(0, 0, 34, H);
  g.fillRect(W - 34, 0, 34, H);
  g.strokeStyle = inner;
  g.lineWidth = 7;
  g.strokeRect(40, 40, W - 80, H - 106);
  g.fillStyle = dots;
  for (let x = 20; x < W; x += 36) {
    g.beginPath();
    g.arc(x, 17, 5, 0, Math.PI * 2);
    g.fill();
  }
  // the fringe
  g.fillStyle = inner;
  for (let x = 6; x < W; x += 12) g.fillRect(x, H - 22, 5, 22);
}
function flower(g, x, y, r, petal, heart) {
  g.fillStyle = petal;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    g.beginPath();
    g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = heart;
  g.beginPath();
  g.arc(x, y, r * 0.7, 0, Math.PI * 2);
  g.fill();
}
export function tapestryTexture(kind = 'tree') {
  const c = canvas(512, 768, (g, W, H) => {
    const rnd = mulberry(kind === 'tree' ? 7 : 13);
    if (kind === 'tree') {
      // a "thousand flowers" field with the tree of life, two birds, a little rabbit
      g.fillStyle = '#2f6a4a';
      g.fillRect(0, 0, W, H);
      for (let k = 0; k < 90; k++) {
        const col = ['#f2c14e', '#f28a8a', '#f6ead0', '#9fd0f0', '#e76f51'][Math.floor(rnd() * 5)];
        flower(g, 50 + rnd() * (W - 100), 50 + rnd() * (H - 150), 5 + rnd() * 5, col, '#f6ead0');
      }
      // trunk and crown
      g.fillStyle = '#7a4a2a';
      g.beginPath();
      g.moveTo(W / 2 - 22, H - 120);
      g.lineTo(W / 2 - 12, H * 0.45);
      g.lineTo(W / 2 + 12, H * 0.45);
      g.lineTo(W / 2 + 22, H - 120);
      g.fill();
      for (const [x, y, r, col] of [[W / 2, H * 0.34, 130, '#4f9a4c'], [W / 2 - 80, H * 0.42, 80, '#5fae55'], [W / 2 + 85, H * 0.41, 84, '#5fae55'], [W / 2, H * 0.24, 90, '#6fbd5e']]) {
        g.fillStyle = col;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#d6443a';
      for (let k = 0; k < 16; k++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * 150;
        g.beginPath();
        g.arc(W / 2 + Math.cos(a) * r, H * 0.33 + Math.sin(a) * r * 0.7, 9, 0, Math.PI * 2);
        g.fill();
      }
      // birds
      for (const [x, y, s] of [[W * 0.26, H * 0.16, 1], [W * 0.74, H * 0.2, -1]]) {
        g.fillStyle = '#3e7cc0';
        g.beginPath();
        g.ellipse(x, y, 26, 16, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(x + s * 22, y - 10, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f2c14e';
        g.beginPath();
        g.moveTo(x + s * 32, y - 12);
        g.lineTo(x + s * 44, y - 8);
        g.lineTo(x + s * 32, y - 5);
        g.fill();
      }
      // a white rabbit at the foot
      g.fillStyle = '#f6ead0';
      g.beginPath();
      g.ellipse(W * 0.3, H - 150, 34, 22, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(W * 0.3 + 30, H - 166, 15, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(W * 0.3 + 30, H - 196, 6, 18, 0.2, 0, Math.PI * 2);
      g.fill();
      border(g, W, H);
    } else {
      // a castle on a green hill under a big sun, pennants flying
      const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
      sky.addColorStop(0, '#3a6fb0');
      sky.addColorStop(1, '#9cc8e6');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#f2c14e';
      g.beginPath();
      g.arc(W * 0.78, H * 0.16, 44, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5fae55';
      g.beginPath();
      g.moveTo(0, H * 0.7);
      g.quadraticCurveTo(W * 0.5, H * 0.46, W, H * 0.66);
      g.lineTo(W, H);
      g.lineTo(0, H);
      g.fill();
      g.fillStyle = '#4f9a4c';
      g.beginPath();
      g.moveTo(0, H * 0.8);
      g.quadraticCurveTo(W * 0.4, H * 0.7, W, H * 0.84);
      g.lineTo(W, H);
      g.lineTo(0, H);
      g.fill();
      // the castle
      const cx = W / 2;
      const base = H * 0.56;
      g.fillStyle = '#efe0c0';
      g.fillRect(cx - 110, base - 120, 220, 120);
      for (const [x, w, h] of [[cx - 150, 60, 210], [cx + 90, 60, 210], [cx - 30, 60, 260]]) {
        g.fillRect(x, base - h, w, h);
        g.fillStyle = '#c0392b';
        g.beginPath();
        g.moveTo(x - 8, base - h);
        g.lineTo(x + w / 2, base - h - 60);
        g.lineTo(x + w + 8, base - h);
        g.fill();
        g.fillStyle = '#efe0c0';
      }
      for (let x = cx - 110; x < cx + 110; x += 30) g.fillRect(x, base - 140, 18, 20);
      g.fillStyle = '#7a4a2a';
      g.beginPath();
      g.arc(cx, base - 40, 28, Math.PI, 0);
      g.lineTo(cx + 28, base);
      g.lineTo(cx - 28, base);
      g.fill();
      g.fillStyle = '#3a4a6a';
      for (const [x, y] of [[cx - 120, base - 150], [cx + 120, base - 150], [cx, base - 200], [cx - 60, base - 80], [cx + 60, base - 80]]) g.fillRect(x - 7, y - 12, 14, 24);
      flower(g, W * 0.2, H * 0.82, 9, '#f28a8a', '#f2c14e');
      flower(g, W * 0.7, H * 0.86, 9, '#f6ead0', '#f2c14e');
      flower(g, W * 0.45, H * 0.9, 8, '#f2c14e', '#e76f51');
      border(g, W, H, { outer: '#2f4f86', inner: '#e8b43a', dots: '#f4e2b0' });
    }
    wool(g, W, H, rnd);
  });
  return tex(c);
}

// ---- the rug before the hearth: a deep red field, gold border, blue lozenges --------------------
export function rugTexture() {
  return tex(canvas(1024, 720, (g, W, H) => {
    const rnd = mulberry(23);
    g.fillStyle = '#a3302a';
    g.fillRect(0, 0, W, H);
    const band = (inset, w, col) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    };
    band(22, 26, '#e8b43a');
    band(56, 24, '#27477a');
    band(84, 8, '#f3dfb0');
    // little gold crosses along the blue band
    g.fillStyle = '#e8b43a';
    for (let x = 80; x < W - 60; x += 46) {
      for (const y of [56, H - 56]) {
        g.fillRect(x - 3, y - 9, 6, 18);
        g.fillRect(x - 9, y - 3, 18, 6);
      }
    }
    for (let y = 100; y < H - 80; y += 46) {
      for (const x of [56, W - 56]) {
        g.fillRect(x - 3, y - 9, 6, 18);
        g.fillRect(x - 9, y - 3, 18, 6);
      }
    }
    const lozenge = (cx, cy, rx, ry, col) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(cx, cy - ry);
      g.lineTo(cx + rx, cy);
      g.lineTo(cx, cy + ry);
      g.lineTo(cx - rx, cy);
      g.closePath();
      g.fill();
    };
    lozenge(W / 2, H / 2, 300, 200, '#27477a');
    lozenge(W / 2, H / 2, 250, 160, '#e8b43a');
    lozenge(W / 2, H / 2, 205, 128, '#a3302a');
    lozenge(W / 2, H / 2, 110, 70, '#f3dfb0');
    lozenge(W / 2, H / 2, 60, 38, '#27477a');
    for (const [x, y] of [[190, 170], [W - 190, 170], [190, H - 170], [W - 190, H - 170]]) {
      lozenge(x, y, 56, 40, '#e8b43a');
      lozenge(x, y, 30, 22, '#27477a');
    }
    wool(g, W, H, rnd, 22);
  }));
}

// ---- a pennant: red and gold halves, a little lion-ish sun ---------------------------------------
export function pennantTexture() {
  return tex(canvas(256, 128, (g, W, H) => {
    g.fillStyle = '#c0392b';
    g.fillRect(0, 0, W, H / 2);
    g.fillStyle = '#e8b43a';
    g.fillRect(0, H / 2, W, H / 2);
    g.fillStyle = '#f6ead0';
    g.beginPath();
    g.arc(48, H / 2, 22, 0, Math.PI * 2);
    g.fill();
  }));
}

// ---- the open book on the lectern: two pages, text lines, an illuminated initial -----------------
export function pagesTexture() {
  return tex(canvas(512, 320, (g, W, H) => {
    g.fillStyle = '#f5ead2';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(120, 90, 50, 0.25)';
    g.fillRect(W / 2 - 6, 0, 12, H);
    for (const x0 of [30, W / 2 + 26]) {
      g.fillStyle = '#c0392b';
      g.fillRect(x0, 36, 46, 46);
      g.fillStyle = '#e8b43a';
      g.font = 'bold 40px serif';
      g.fillText('A', x0 + 9, 74);
      g.fillStyle = '#5a4632';
      for (let y = 40; y < H - 30; y += 17) {
        const indent = y < 90 ? 56 : 0;
        g.fillRect(x0 + indent, y, 190 - indent - ((y * 7) % 30), 5);
      }
      g.fillStyle = '#3e7cc0';
      g.beginPath();
      g.arc(x0 + 190, H - 34, 10, 0, Math.PI * 2);
      g.fill();
    }
  }));
}

// ---- a cushion / fabric: plain colour with a woven grain --------------------------------------------
export function fabricTexture(col, seed = 3) {
  const t = tex(canvas(128, 128, (g, W, H) => {
    g.fillStyle = col;
    g.fillRect(0, 0, W, H);
    wool(g, W, H, mulberry(seed), 20);
  }), { repeat: true });
  return t;
}
