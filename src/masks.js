import * as THREE from 'three';

// A canvas the player works on with a brush: paint a colour in, or wipe grime /
// soot away. The canvas is also the texture the surface's material reads, so
// what you see is exactly the state. Coverage is measured over the pixels that
// count (`valid`): window holes, spots behind the fireplace surround etc. don't.
// flipY: true (three's default) for meshes with ordinary 0..1 UVs, where the
// canvas top is the top of the mesh; false when a shader computes v itself with
// v = 0 meaning the canvas's top row (walls.js)
// The same colour at zero alpha. Canvas gradients blend unpremultiplied, so a
// fade to 'rgba(0,0,0,0)' darkens on the way out — overlapping soft dabs then
// leave dark seams between strokes.
export function clearOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return hex.length === 7 ? `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0)` : 'rgba(0,0,0,0)';
}

// every mask on the page: a level that finishes a job fades the ones the finish changed
// (level.js — playtest 2026-09-30: the last of the dirt / the missed bits of paint used to snap
// away in one frame at the task's x%)
const LIVE = new Set();
export const liveMasks = () => [...LIVE];

export function createMask(w, h, { valid = null, srgb = true, flipY = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = flipY;
  const ok = valid ?? new Uint8Array(w * h).fill(1);
  const total = ok.reduce((a, b) => a + b, 0) || 1;
  let dirty = false;
  let version = 0; // bumps on every change; coverage and the saved PNG are cached per version
  const cache = new Map();
  // the last PNG made for a save: a save re-encodes only the masks that changed since
  // (encoding every mask took ~15 ms of main thread per save — a hitch mid-stroke)
  let png = null;
  const touch = () => {
    dirty = true;
    version++;
  };
  const copyOf = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    // (read back while it's the truth during a fade: the % count)
    c.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0);
    return c;
  };

  // a fade from an earlier look into the current one: { from, to (canvases), t, k, dur, v, done }.
  // The canvas shows the blend (premultiplied: from·(1−k) + to·k); `to` is the truth for
  // saving and counting. The mask's own brushes draw on both ends and let it play on (a
  // player still scrubbing as the job completed used to land it: the rest snapped away in
  // one frame — playtest 2026-09-30); code that draws on `g` directly and touches (a fresh
  // room's dirt) simply ends it (v ≠ version).
  let fade = null;
  const live = () => fade && fade.v === version;
  let raf = 0;
  function show(k) {
    fade.k = k;
    g.save();
    g.globalCompositeOperation = 'copy';
    g.globalAlpha = 1 - k;
    g.drawImage(fade.from, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = k;
    g.drawImage(fade.to, 0, 0);
    g.restore();
    touch();
    tex.needsUpdate = true;
    fade.v = version;
  }
  function drop() {
    const f = fade;
    fade = null;
    cancelAnimationFrame(raf);
    for (const r of f.done) r();
  }
  function land() {
    if (!fade) return;
    if (!live()) {
      drop();
      return;
    }
    const f = fade;
    fade = null;
    cancelAnimationFrame(raf);
    g.save();
    g.globalCompositeOperation = 'copy';
    g.drawImage(f.to, 0, 0);
    g.restore();
    touch();
    tex.needsUpdate = true;
    for (const r of f.done) r();
  }
  function step(now) {
    if (!fade) return;
    if (!live()) {
      drop();
      return;
    }
    fade.t += Math.min(0.1, (now - (fade.last ?? now)) / 1000);
    fade.last = now;
    const k = fade.t / fade.dur;
    if (k >= 1) {
      land();
      return;
    }
    show(k * k * (3 - 2 * k));
    raf = requestAnimationFrame(step);
  }
  // a brush stroke: on the canvas, or during a fade on both of its ends (then shown at the
  // fade's current blend) — fn(ctx) draws, inside a save/restore
  function paint(fn) {
    if (!live()) {
      land();
      g.save();
      fn(g);
      g.restore();
      touch();
      return;
    }
    for (const c of [fade.from, fade.to]) {
      const cg = c.getContext('2d');
      cg.save();
      fn(cg);
      cg.restore();
    }
    show(fade.k);
  }

  const self = {
    canvas,
    g,
    tex,
    w,
    h,
    // round soft brush: paint `color` (alpha builds up) or erase · core: the share of the
    // radius at full strength (then a soft edge)
    dab(x, y, r, { color = null, erase = false, strength = 1, core = 0.62 } = {}) {
      paint((cg) => {
        cg.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
        const grd = cg.createRadialGradient(x, y, 0, x, y, r);
        const c = color ?? '#000';
        grd.addColorStop(0, c);
        grd.addColorStop(core, c);
        grd.addColorStop(1, clearOf(c));
        cg.globalAlpha = strength;
        cg.fillStyle = grd;
        cg.beginPath();
        cg.arc(x, y, r, 0, Math.PI * 2);
        cg.fill();
      });
    },
    // a squeegee blade: a rotated rectangle that wipes clean
    wipe(x, y, len, thick, angle) {
      paint((cg) => {
        cg.globalCompositeOperation = 'destination-out';
        cg.translate(x, y);
        cg.rotate(angle);
        cg.fillStyle = '#000';
        cg.fillRect(-len / 2, -thick / 2, len, thick);
      });
    },
    fill(color) {
      land();
      g.clearRect(0, 0, w, h);
      if (color) {
        g.fillStyle = color;
        g.fillRect(0, 0, w, h);
      }
      touch();
    },
    // share of the counted pixels with alpha above `thr` (0..255); cached until the next change
    coverage(thr = 128) {
      const c = cache.get(thr);
      if (c && c.v === version) return c.n;
      const d = (live() ? fade.to.getContext('2d') : g).getImageData(0, 0, w, h).data;
      let n = 0;
      for (let i = 0, p = 3; i < ok.length; i++, p += 4) if (ok[i] && d[p] > thr) n++;
      cache.set(thr, { v: version, n: n / total });
      return n / total;
    },
    // after drawing on `g` directly
    touch,
    // push canvas changes to the GPU at most once per frame
    flush() {
      if (!dirty) return false;
      tex.needsUpdate = true;
      dirty = false;
      return true;
    },
    toDataURL() {
      if (png?.v !== version) png = { v: version, url: (live() ? fade.to : canvas).toDataURL('image/png') };
      return png.url;
    },
    get version() { return version; },
    // the mask as it is now (a canvas), to fade from later
    snapshot: copyOf,
    // show `from` now and blend into the current state over `dur` s → resolves when done
    fadeFrom(from, dur = 1.5) {
      land();
      fade = { from, to: copyOf(), t: 0, dur, done: [] };
      show(0);
      raf = requestAnimationFrame(step);
      return new Promise((r) => fade.done.push(r));
    },
    // resolves once no fade is running
    settled: () => (fade ? new Promise((r) => fade.done.push(r)) : Promise.resolve()),
    load(url) {
      return new Promise((res) => {
        if (!url) return res(false);
        const img = new Image();
        img.onload = () => {
          land();
          g.clearRect(0, 0, w, h);
          g.drawImage(img, 0, 0);
          touch();
          res(true);
        };
        img.onerror = () => res(false);
        img.src = url;
      });
    },
  };
  LIVE.add(self);
  return self;
}
