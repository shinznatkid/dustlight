import * as THREE from 'three';
import { canvasTexture, mulberry } from './common.js';

// Procedural books. A 2048² canvas atlas holds 128 spine designs (64 x 512 px
// cells: the spine on top, a 64 x 128 front cover below it) plus a strip of page
// edges; a parallel canvas carries roughness (G) and metalness (B) so gold foil
// glints and cloth stays matte. Every book is a 6-face box whose faces point into
// that atlas, and all the books of the room bake into ONE merged mesh (a few
// hundred separate meshes would be as many draw calls, per GI probe face too).

const W = 2048;
const CW = 64; // cell width
const CH = 512; // cell height: spine 0..SP, cover SP..CH
const SP = 384;
const COLS = W / CW; // 32
const ROWS = 4;
export const DESIGNS = COLS * ROWS - 2; // the last two cells hold the page edges

// warm, saturated cloth/leather colours with weights; a little navy/teal keeps it
// from turning into one orange smear
const PALETTE = [
  ['#7c1f1c', 3.2], // oxblood
  ['#a3302a', 2], // brick red
  ['#b9502c', 2.2], // terracotta
  ['#cf7a2c', 1.8], // burnt orange
  ['#d8a23a', 2.2], // mustard
  ['#e5c56b', 1], // straw
  ['#2f5b3e', 2.6], // forest green
  ['#5d7432', 1.1], // olive
  ['#1f535a', 1.1], // deep teal
  ['#2b3a60', 0.9], // navy
  ['#5c2a4c', 1], // plum
  ['#efe1bf', 1.6], // cream
  ['#7a4524', 1.6], // tan leather
  ['#43291d', 0.9], // chocolate
  ['#c9685a', 1], // dusty coral
  ['#8f6a2e', 0.8], // ochre brown
];
const GOLD = '#d9b25a';
const INK = '#20170f';
const PAPER = '#efe3c4';

function pick(rnd, list) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = rnd() * total;
  for (const [c, w] of list) {
    r -= w;
    if (r <= 0) return c;
  }
  return list[0][0];
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k);
  c.g = Math.min(1, c.g * k);
  c.b = Math.min(1, c.b * k);
  return `#${c.getHexString()}`;
};
const lum = (hex) => {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
};

let atlas = null;
// { map, props, pages: [u0, v0, u1, v1], cell(i) → { spine: [u0, v0, u1, v1], cover: [...] } }
export function bookAtlas() {
  if (atlas) return atlas;
  const col = document.createElement('canvas');
  col.width = col.height = W;
  const pr = document.createElement('canvas');
  pr.width = pr.height = W;
  const g = col.getContext('2d');
  const p = pr.getContext('2d');
  const rnd = mulberry(20260929);
  // props: G = roughness, B = metalness (three's roughnessMap / metalnessMap channels)
  const PROP = { cloth: 'rgb(0,225,0)', leather: 'rgb(0,150,0)', gloss: 'rgb(0,110,0)', gold: 'rgb(0,80,255)', paper: 'rgb(0,235,0)' };
  p.fillStyle = PROP.cloth;
  p.fillRect(0, 0, W, W);

  const rect = (x, y, w, h, c, prop) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
    if (prop) {
      p.fillStyle = PROP[prop];
      p.fillRect(x, y, w, h);
    }
  };

  for (let i = 0; i < DESIGNS; i++) {
    const x0 = (i % COLS) * CW;
    const y0 = Math.floor(i / COLS) * CH;
    const base = pick(rnd, PALETTE);
    const kind = rnd();
    const light = lum(base) > 0.55;
    const foil = light ? INK : rnd() < 0.8 ? GOLD : PAPER;
    const foilProp = foil === GOLD ? 'gold' : null;
    const surf = kind < 0.28 ? 'leather' : kind < 0.62 ? 'cloth' : 'gloss';
    rect(x0, y0, CW, CH, base, surf);

    if (surf === 'leather') {
      // old leather: raised bands, gold rules, a dark title label
      const bands = 4 + Math.floor(rnd() * 2);
      const top = 28;
      const bot = SP - 28;
      const step = (bot - top) / bands;
      for (let b = 0; b <= bands; b++) {
        const y = y0 + top + b * step;
        rect(x0, y - 5, CW, 10, shade(base, 0.62), 'leather');
        rect(x0, y - 7, CW, 2, foil, foilProp);
        rect(x0, y + 5, CW, 2, foil, foilProp);
      }
      const lab = rnd() < 0.6 ? (lum(base) < 0.2 ? '#7c1f1c' : '#231812') : null;
      const ly = y0 + top + step * 0.18;
      if (lab) rect(x0 + 6, ly, CW - 12, step * 0.64, lab, 'leather');
      for (let k = 0; k < 2; k++) rect(x0 + 16 + rnd() * 6, ly + step * (0.2 + k * 0.24), 22 + rnd() * 8, 4, GOLD, 'gold');
      // small ornaments in the other panels
      for (let b = 1; b < bands; b++) rect(x0 + 26, y0 + top + b * step + step * 0.42, 12, 12, GOLD, 'gold');
    } else if (surf === 'cloth') {
      // cloth hardback: head/tail bands, a title block, the author, a publisher mark
      const band = rnd() < 0.65;
      const bc = rnd() < 0.5 ? foil : shade(base, 0.55);
      if (band) {
        rect(x0, y0 + 18, CW, 8, bc, bc === GOLD ? 'gold' : 'cloth');
        rect(x0, y0 + SP - 26, CW, 8, bc, bc === GOLD ? 'gold' : 'cloth');
      }
      const panel = rnd() < 0.35;
      const ty = y0 + 50 + rnd() * 40;
      if (panel) rect(x0 + 8, ty - 8, CW - 16, 110, rnd() < 0.5 ? PAPER : shade(base, 0.6), 'paper');
      const tc = panel ? INK : foil;
      const lines = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < lines; k++) {
        const w = 20 + rnd() * 26;
        rect(x0 + (CW - w) / 2, ty + k * 16, w, 7, tc, tc === GOLD ? 'gold' : null);
      }
      const aw = 18 + rnd() * 20;
      rect(x0 + (CW - aw) / 2, y0 + SP - 80 - rnd() * 30, aw, 5, foil, foilProp);
      if (rnd() < 0.5) rect(x0 + 26, y0 + SP - 50, 12, 10, foil, foilProp);
    } else {
      // modern jacket: colour blocks, a long vertical title, a logo
      const second = pick(rnd, PALETTE);
      const split = y0 + 60 + rnd() * 220;
      if (rnd() < 0.55) rect(x0, split, CW, y0 + SP - split, second, 'gloss');
      if (rnd() < 0.4) rect(x0, y0 + 30 + rnd() * 40, CW, 6, lum(base) > 0.5 ? INK : PAPER, 'gloss');
      const tl = lum(base) > 0.5 ? INK : PAPER;
      const words = 2 + Math.floor(rnd() * 3);
      let y = y0 + 40 + rnd() * 30;
      const tw = 10 + rnd() * 8;
      for (let k = 0; k < words && y < y0 + SP - 110; k++) {
        const h = 26 + rnd() * 50;
        rect(x0 + (CW - tw) / 2, y, tw, h, tl, 'gloss');
        y += h + 9;
      }
      rect(x0 + 22, y0 + SP - 44, 20, 20, rnd() < 0.5 ? PAPER : shade(second, 0.7), 'gloss');
    }

    // front cover (below the spine in the cell)
    const cy = y0 + SP;
    rect(x0, cy, CW, CH - SP, base, surf);
    if (surf === 'gloss') {
      rect(x0 + 6, cy + 20, CW - 12, 50, pick(rnd, PALETTE), 'gloss');
      rect(x0 + 12, cy + 82, CW - 24, 6, lum(base) > 0.5 ? INK : PAPER, 'gloss');
      rect(x0 + 18, cy + 94, CW - 36, 4, lum(base) > 0.5 ? INK : PAPER, 'gloss');
    } else {
      g.strokeStyle = foil;
      g.lineWidth = 2;
      g.strokeRect(x0 + 7, cy + 8, CW - 14, CH - SP - 16);
      rect(x0 + 16, cy + 36, CW - 32, 6, foil, foilProp);
      rect(x0 + 22, cy + 48, CW - 44, 4, foil, foilProp);
    }

    // rounded-spine shading, wear, grain
    const sh = g.createLinearGradient(x0, 0, x0 + CW, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.38)');
    sh.addColorStop(0.18, 'rgba(0,0,0,0.05)');
    sh.addColorStop(0.45, 'rgba(255,255,255,0.06)');
    sh.addColorStop(0.82, 'rgba(0,0,0,0.05)');
    sh.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = sh;
    g.fillRect(x0, y0, CW, SP);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x0, y0, CW, 4);
    g.fillRect(x0, y0 + SP - 4, CW, 4);
  }

  // page edges: cream with fine vertical lines (u runs across the page block)
  const px0 = (DESIGNS % COLS) * CW;
  const py0 = Math.floor(DESIGNS / COLS) * CH;
  rect(px0, py0, CW * 2, CH, PAPER, 'paper');
  for (let x = 0; x < CW * 2; x += 2) {
    g.fillStyle = `rgba(120,90,50,${0.08 + rnd() * 0.16})`;
    g.fillRect(px0 + x, py0, 1, CH);
  }

  // noise over everything (cloth weave / paper tooth)
  const d = g.getImageData(0, 0, W, W);
  const r2 = mulberry(7);
  for (let k = 0; k < d.data.length; k += 4) {
    const n = (r2() - 0.5) * 16;
    d.data[k] += n;
    d.data[k + 1] += n;
    d.data[k + 2] += n;
  }
  g.putImageData(d, 0, 0);

  const U = (px) => px / W;
  const V = (py) => 1 - py / W; // flipY: canvas top = v 1
  const inset = 1.5;
  atlas = {
    map: canvasTexture(col),
    props: canvasTexture(pr, { srgb: false }),
    pages: [U(px0 + inset), V(py0 + CH - inset), U(px0 + CW * 2 - inset), V(py0 + inset)],
    cell(i) {
      const x0 = (i % COLS) * CW;
      const y0 = Math.floor(i / COLS) * CH;
      return {
        spine: [U(x0 + inset), V(y0 + SP - inset), U(x0 + CW - inset), V(y0 + inset)],
        cover: [U(x0 + inset), V(y0 + CH - inset), U(x0 + CW - inset), V(y0 + SP + inset)],
      };
    },
  };
  return atlas;
}

let mat = null;
export function bookMaterial() {
  if (mat) return mat;
  const a = bookAtlas();
  mat = new THREE.MeshStandardMaterial({
    map: a.map,
    roughnessMap: a.props,
    metalnessMap: a.props,
    roughness: 1,
    metalness: 1,
    vertexColors: true,
  });
  mat.name = 'books';
  return mat;
}

// Collects books into one geometry. A book in its own frame: thickness along x
// (-w/2..w/2), height along y (0..h), depth along z (-d..0) with the spine at z = 0.
export class Shelf {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
    this.i = [];
    this.count = 0;
  }

  // m: Matrix4 placing the book · design: 0..DESIGNS-1 · tint: brightness jitter
  book(w, h, d, design, m, tint = 1) {
    const a = bookAtlas();
    const cell = a.cell(design % DESIGNS);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const x0 = -w / 2;
    const x1 = w / 2;
    // [normal, 4 corners (ccw from outside), uv rect, uv orientation]
    const faces = [
      // spine (+z): u across the thickness, v up the height
      [[0, 0, 1], [[x0, 0, 0], [x1, 0, 0], [x1, h, 0], [x0, h, 0]], cell.spine],
      // fore-edge (-z)
      [[0, 0, -1], [[x1, 0, -d], [x0, 0, -d], [x0, h, -d], [x1, h, -d]], a.pages],
      // top / bottom (page block): u across thickness
      [[0, 1, 0], [[x0, h, 0], [x1, h, 0], [x1, h, -d], [x0, h, -d]], a.pages],
      [[0, -1, 0], [[x0, 0, -d], [x1, 0, -d], [x1, 0, 0], [x0, 0, 0]], a.pages],
      // covers (+x front, -x back): u from spine to fore-edge
      [[1, 0, 0], [[x1, 0, 0], [x1, 0, -d], [x1, h, -d], [x1, h, 0]], cell.cover],
      [[-1, 0, 0], [[x0, 0, -d], [x0, 0, 0], [x0, h, 0], [x0, h, -d]], cell.cover],
    ];
    const v = new THREE.Vector3();
    const tc = new THREE.Color(tint, tint * (0.98 + (tint - 1) * 0.2), tint * 0.97);
    for (const [nrm, pts, r] of faces) {
      const base = this.p.length / 3;
      const N = new THREE.Vector3(...nrm).applyMatrix3(nm).normalize();
      const uvs = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
      pts.forEach((q, k) => {
        v.set(...q).applyMatrix4(m);
        this.p.push(v.x, v.y, v.z);
        this.n.push(N.x, N.y, N.z);
        this.uv.push(...uvs[k]);
        this.c.push(tc.r, tc.g, tc.b);
      });
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    this.count++;
  }

  // a run of standing books between x0 and x1 on a board at height y, spines at
  // z = front (facing +z); returns the x where it stopped
  fillRun(x0, x1, y, front, rnd, { headroom = 0.32, series = 0.25, lean = 0.5, flat = 0.1, gap = 0.08 } = {}) {
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3(1, 1, 1);
    const P = new THREE.Vector3();
    let x = x0;
    let set = null;
    const maxH = Math.max(0.12, headroom - 0.015);
    while (x < x1 - 0.02) {
      const room = x1 - x;
      // a stack lying flat
      if (rnd() < flat && room > 0.3) {
        const n = 2 + Math.floor(rnd() * 4);
        let yy = y;
        const len = 0.2 + rnd() * 0.07;
        for (let k = 0; k < n && yy < y + maxH - 0.05; k++) {
          const t = 0.025 + rnd() * 0.03;
          const l = Math.min(len - rnd() * 0.03, maxH);
          const dd = 0.14 + rnd() * 0.06;
          // lying on its back cover: book x (thickness) → world y, book y (height) → world -x
          Q.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2 + (rnd() - 0.5) * 0.04));
          P.set(x + l + (rnd() - 0.5) * 0.02, yy + t / 2, front - rnd() * 0.02);
          M.compose(P, Q, S);
          this.book(t, l, dd, Math.floor(rnd() * DESIGNS), M, 0.9 + rnd() * 0.18);
          yy += t;
        }
        x += len + 0.03;
        continue;
      }
      if (!set || set.left <= 0) {
        set = rnd() < series
          ? { design: Math.floor(rnd() * DESIGNS), h: 0.22 + rnd() * 0.08, w: 0.03 + rnd() * 0.02, d: 0.17 + rnd() * 0.05, left: 4 + Math.floor(rnd() * 7) }
          : { design: -1, left: 1 };
      }
      const design = set.design >= 0 ? set.design : Math.floor(rnd() * DESIGNS);
      const h = Math.min(maxH, set.design >= 0 ? set.h : 0.18 + rnd() * 0.13);
      const w = set.design >= 0 ? set.w : 0.017 + rnd() * rnd() * 0.05;
      const d = set.design >= 0 ? set.d : 0.13 + rnd() * 0.1;
      set.left--;
      if (w > room) break;
      // the last one leans into the leftover space
      const leftover = room - w;
      if (leftover < 0.2 && leftover > 0.04 && rnd() < lean) {
        // tilted top-left ("\"): stands on its bottom-left corner at bx, the top-left
        // corner resting on the previous book — needs h·sinθ + w·cosθ of room
        const th = Math.min(0.42, Math.asin(Math.min(0.9, (leftover - 0.01) / h)) * (0.6 + rnd() * 0.35));
        const bx = x + h * Math.sin(th);
        Q.setFromEuler(new THREE.Euler(0, 0, th));
        // the book's origin is its bottom centre: BL corner (-w/2, 0) turned by θ sits at (bx, y)
        P.set(bx + (w / 2) * Math.cos(th), y + (w / 2) * Math.sin(th), front - rnd() * 0.015);
        M.compose(P, Q, S);
        this.book(w, h, d, design, M, 0.88 + rnd() * 0.2);
        return x1;
      }
      Q.setFromEuler(new THREE.Euler(0, (rnd() - 0.5) * 0.03, 0));
      P.set(x + w / 2, y, front - rnd() * rnd() * 0.03);
      M.compose(P, Q, S);
      this.book(w, h, d, design, M, 0.86 + rnd() * 0.22);
      x += w + (rnd() < gap ? 0.004 + rnd() * 0.03 : 0.0015);
    }
    return x;
  }

  // a stack of books lying flat (display table, counter): centre (x, z), base y,
  // turned by ry; returns the top height
  stack(x, y, z, ry, n, rnd, { big = false } = {}) {
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3(1, 1, 1);
    const P = new THREE.Vector3();
    let yy = y;
    for (let k = 0; k < n; k++) {
      const t = 0.022 + rnd() * 0.03;
      const h = (big ? 0.24 : 0.19) + rnd() * 0.07; // lying: height runs along world x before ry
      const d = (big ? 0.17 : 0.13) + rnd() * 0.05;
      const r = ry + (rnd() - 0.5) * 0.25;
      // lying on the back cover, spine towards local +z
      Q.setFromEuler(new THREE.Euler(0, r, Math.PI / 2, 'YXZ'));
      // book origin = bottom-centre of the spine; lying down, the book's centre is
      // at (-h/2, 0, -d/2) from it, turned by r — shift so the centre lands on (x, z)
      const centre = new THREE.Vector3(h / 2, 0, d / 2).applyEuler(new THREE.Euler(0, r, 0));
      P.set(x + centre.x + (rnd() - 0.5) * 0.02, yy + t / 2, z + centre.z + (rnd() - 0.5) * 0.02);
      M.compose(P, Q, S);
      this.book(t, h, d, Math.floor(rnd() * DESIGNS), M, 0.9 + rnd() * 0.16);
      yy += t;
    }
    return yy;
  }

  mesh({ cast = true, receive = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const m = new THREE.Mesh(g, bookMaterial());
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.name = `books(${this.count})`;
    return m;
  }
}
