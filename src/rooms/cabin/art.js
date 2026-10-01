import * as THREE from 'three';
import { mulberry } from '../../atmos.js';

// Canvas-painted textures for the cabin: flat, soft colours in the KayKit spirit
// (no photo scans). Each canvas is fully painted before it becomes a texture.

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.Texture();
  t.image = c;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// log end grain: honey rings around a darker heart, a bark rim
export function endGrainTexture() {
  return canvas(256, 256, (g, W) => {
    const c = W / 2;
    g.fillStyle = '#8a5a30';
    g.fillRect(0, 0, W, W);
    g.fillStyle = '#f3cf92';
    g.beginPath();
    g.arc(c, c, c * 0.9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(196, 128, 66, 0.55)';
    for (let r = c * 0.14; r < c * 0.86; r += c * 0.13) {
      g.lineWidth = 4;
      g.beginPath();
      g.arc(c + 2, c - 1, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#d99a58';
    g.beginPath();
    g.arc(c + 2, c - 1, c * 0.08, 0, Math.PI * 2);
    g.fill();
  });
}

// red/cream gingham for the café curtains (tiles)
export function ginghamTexture() {
  const t = canvas(128, 128, (g, W) => {
    const s = W / 4;
    g.fillStyle = '#fff3e2';
    g.fillRect(0, 0, W, W);
    g.fillStyle = 'rgba(214, 72, 60, 0.55)';
    for (let i = 0; i < 4; i += 2) {
      g.fillRect(i * s, 0, s, W);
      g.fillRect(0, i * s, W, s);
    }
    g.fillStyle = 'rgba(190, 50, 44, 0.5)';
    for (let i = 0; i < 4; i += 2) for (let j = 0; j < 4; j += 2) g.fillRect(i * s, j * s, s, s);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// oval braided rug: concentric rings of braid, UV 0..1 over the rug's footprint
export function braidedRugTexture({
  cols = ['#c84a36', '#f0b54a', '#f6e7cc', '#3f8f8a', '#e27a4a', '#f6e7cc', '#c84a36', '#8fb573', '#f0b54a', '#f6e7cc'],
  rings = 17, W: w = 1024, H: h = 720, seed = 7,
} = {}) {
  return canvas(w, h, (g, W, H) => {
    const rnd = mulberry(seed);
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < rings; i++) {
      const k = 1 - i / rings;
      const rx = (W / 2) * k;
      const ry = (H / 2) * k;
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.ellipse(W / 2, H / 2, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      // braid ticks along the ring
      g.strokeStyle = 'rgba(80, 40, 20, 0.16)';
      g.lineWidth = 3;
      const n = Math.max(12, Math.round(80 * k));
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2;
        const r0 = 0.97;
        const r1 = 1 - 0.5 / rings / k;
        g.beginPath();
        g.moveTo(W / 2 + Math.cos(a) * rx * r0, H / 2 + Math.sin(a) * ry * r0);
        g.lineTo(W / 2 + Math.cos(a + 0.05 / k) * rx * r1, H / 2 + Math.sin(a + 0.05 / k) * ry * r1);
        g.stroke();
      }
    }
    const d = g.getImageData(0, 0, W, H);
    for (let i = 0; i < d.data.length; i += 4) {
      if (d.data[i + 3] === 0) continue;
      const n = (rnd() - 0.5) * 14;
      d.data[i] += n;
      d.data[i + 1] += n;
      d.data[i + 2] += n;
    }
    g.putImageData(d, 0, 0);
  });
}

// buffalo-ish plaid for the throw
export function plaidTexture() {
  const t = canvas(256, 256, (g, W) => {
    g.fillStyle = '#d8483a';
    g.fillRect(0, 0, W, W);
    const band = (x, w, col, vert) => {
      g.fillStyle = col;
      if (vert) g.fillRect(x, 0, w, W);
      else g.fillRect(0, x, W, w);
    };
    for (const vert of [true, false]) {
      band(0, 72, 'rgba(90, 30, 30, 0.45)', vert);
      band(128, 72, 'rgba(90, 30, 30, 0.45)', vert);
      band(96, 8, 'rgba(255, 236, 200, 0.7)', vert);
      band(224, 8, 'rgba(255, 236, 200, 0.7)', vert);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// chunky knit (vertical rows of Vs) — white, tinted by the material colour
export function knitTexture() {
  const t = canvas(128, 128, (g, W) => {
    g.fillStyle = '#e9e9e9';
    g.fillRect(0, 0, W, W);
    const cw = W / 4;
    const ch = W / 6;
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 6; y++) {
        const cx = x * cw;
        const cy = y * ch;
        g.fillStyle = '#ffffff';
        for (const s of [0, 1]) {
          g.beginPath();
          g.ellipse(cx + cw * (0.3 + s * 0.4), cy + ch * 0.55, cw * 0.2, ch * 0.62, s ? -0.5 : 0.5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(0,0,0,0.13)';
        g.fillRect(cx + cw / 2 - 1, cy, 2, ch);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// a maple leaf cut-out (white, tinted by the material; alpha = the shape)
export function mapleLeafTexture() {
  return canvas(128, 128, (g, W) => {
    const c = W / 2;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#ffffff';
    g.beginPath();
    // five lobes, each a pointy fan
    const lobes = [[-90, 0.46], [-30, 0.4], [30, 0.4], [-150, 0.4], [150, 0.4], [-62, 0.3], [-118, 0.3]];
    g.moveTo(c, c + 6);
    for (let a = -180; a <= 180; a += 4) {
      let r = 0.1;
      for (const [la, lr] of lobes) {
        const d = Math.abs(((a - la + 540) % 360) - 180);
        r = Math.max(r, lr * Math.max(0, 1 - d / 26) ** 0.7);
      }
      const rad = (a * Math.PI) / 180;
      g.lineTo(c + Math.cos(rad) * r * W, c + 6 + Math.sin(rad) * r * W);
    }
    g.closePath();
    g.fill();
    // stem + veins
    g.fillRect(c - 2, c + 6, 4, W * 0.36);
    g.strokeStyle = 'rgba(120, 40, 0, 0.35)';
    g.lineWidth = 3;
    for (const [la, lr] of lobes.slice(0, 5)) {
      const rad = (la * Math.PI) / 180;
      g.beginPath();
      g.moveTo(c, c + 6);
      g.lineTo(c + Math.cos(rad) * lr * W * 0.8, c + 6 + Math.sin(rad) * lr * W * 0.8);
      g.stroke();
    }
  });
}

// little paintings for the KayKit frames
export function paintingTexture(kind = 'mountain') {
  return canvas(256, 320, (g, W, H) => {
    if (kind === 'mountain') {
      const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
      sky.addColorStop(0, '#f7c98b');
      sky.addColorStop(1, '#f6e1b8');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#f08a5d';
      g.beginPath();
      g.arc(W * 0.66, H * 0.3, 34, 0, Math.PI * 2);
      g.fill();
      const peak = (x, y, w, col) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(x - w, H);
        g.lineTo(x, y);
        g.lineTo(x + w, H);
        g.fill();
      };
      peak(W * 0.3, H * 0.36, 150, '#8c9fb8');
      peak(W * 0.78, H * 0.46, 130, '#6f86a3');
      g.fillStyle = '#f6f1e8';
      g.beginPath();
      g.moveTo(W * 0.3 - 33, H * 0.36 + 33 * (H / 150) * 0.43);
      g.lineTo(W * 0.3, H * 0.36);
      g.lineTo(W * 0.3 + 33, H * 0.36 + 33 * (H / 150) * 0.43);
      g.fill();
      for (let i = 0; i < 9; i++) {
        const x = 12 + i * 30 + (i % 2) * 8;
        const y = H * 0.66 + (i % 3) * 10;
        g.fillStyle = i % 2 ? '#3f7a5a' : '#2f6a4e';
        g.beginPath();
        g.moveTo(x - 17, H);
        g.lineTo(x, y);
        g.lineTo(x + 17, H);
        g.fill();
      }
    } else if (kind === 'night') {
      // moon over the pines: a cool note in a warm room
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#2d3f6b');
      sky.addColorStop(1, '#5a6f9c');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff1c9';
      g.beginPath();
      g.arc(W * 0.68, H * 0.28, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff6dc';
      for (const [x, y] of [[40, 50], [90, 110], [150, 40], [200, 150], [60, 170], [120, 80]]) g.fillRect(x, y, 4, 4);
      for (let i = 0; i < 7; i++) {
        const x = 10 + i * 40;
        const y = H * 0.55 + (i % 3) * 18;
        g.fillStyle = i % 2 ? '#1f3a3a' : '#28474a';
        g.beginPath();
        g.moveTo(x - 24, H);
        g.lineTo(x, y);
        g.lineTo(x + 24, H);
        g.fill();
      }
    } else {
      // a cheerful flower print
      g.fillStyle = '#f7e7cd';
      g.fillRect(0, 0, W, H);
      const flower = (x, y, r, col) => {
        g.fillStyle = col;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#f5c44e';
        g.beginPath();
        g.arc(x, y, r * 0.7, 0, Math.PI * 2);
        g.fill();
      };
      g.strokeStyle = '#6f9e6a';
      g.lineWidth = 6;
      for (const [x, y] of [[80, 110], [170, 170], [110, 230]]) {
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 10, (y + H) / 2, W / 2, H);
        g.stroke();
      }
      flower(80, 110, 22, '#e2735f');
      flower(170, 170, 26, '#f09a86');
      flower(110, 230, 18, '#dc5b4a');
    }
  });
}
