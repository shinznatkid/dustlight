// Frame-time profile of real play against the running dev server (http://127.0.0.1:5190):
// a fresh room at the default quality, then each tool used by mouse the way a player
// would (pick it, hover, rub for a while, let go). Every frame is logged with what ran
// in it — GI probe captures, shadow-map redraws, new shader programs, reflection
// captures, time-of-day steps, saves, long tasks — and each phase reports its frame
// times plus the worst frames and what they had in common.
// Usage: node tools/perf.mjs [--level=cabin] [--port=5190] [--dwell=s] [--only=roller,squeegee] [--phase=unpack [--items=12]] [--w=1600] [--h=900] [--q=extra&flags]
//        [--json=shots/perf.json]    (Edge on the real GPU, no window — --headful to watch)
import './lowprio.mjs'; // below-normal priority for this and the browser it opens
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const W = +opt('w', 1600);
const H = +opt('h', 900);
const extra = opt('q', '');
const only = opt('only', '') ? opt('only', '').split(',') : null;
const PHASE = opt('phase', 'restore'); // restore: the tools · unpack: the boxes
const LEVEL = opt('level', 'meadow');
const PORT = process.argv.slice(2).find((a) => a.startsWith('--port='))?.slice(7) ?? '5190';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(fs.existsSync);
if (!exe) throw new Error('No Edge/Chrome found');

// runs before the page's own scripts: time every animation-frame callback and
// catch long tasks (pointer handlers, saves, anything outside the frame loop)
function probe() {
  const P = (window.__perf = { frames: new Map(), long: [], label: 'boot', cur: null, marks: [] });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => {
    let f = P.frames.get(ts);
    if (!f) {
      f = { ts, js: 0, label: P.label, ev: {} };
      P.frames.set(ts, f);
    }
    P.cur = f;
    const t0 = performance.now();
    try { cb(ts); } finally { f.js += performance.now() - t0; }
  });
  P.mark = (k, n = 1) => {
    const f = P.cur;
    if (f) f.ev[k] = (f.ev[k] ?? 0) + n;
  };
  P.markT = (k, ms) => {
    const f = P.cur;
    if (f) f.ev[k] = +((f.ev[k] ?? 0) + ms).toFixed(2);
  };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.long.push({ at: e.startTime, dur: e.duration, label: P.label });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* no long-task timing here */ }
}

// after boot: wrap the engine's expensive calls so each frame says what it did
function instrument() {
  const A = window.__app;
  const P = window.__perf;
  const W = A.world;
  const r = W.renderer;
  const wrap = (obj, key, name, { time = true, when = () => true } = {}) => {
    const fn = obj[key];
    obj[key] = function (...a) {
      if (!when.call(this, ...a)) return fn.apply(this, a);
      const t0 = performance.now();
      try { return fn.apply(this, a); } finally {
        if (time) P.markT(name, performance.now() - t0);
        else P.mark(name);
      }
    };
  };
  // GI: probes captured this frame
  const gi = W.gi;
  const upd = gi.update.bind(gi);
  gi.update = (budget) => {
    if (gi.sweepsLeft <= 0) return upd(budget);
    const t0 = performance.now();
    upd(budget);
    P.markT('gi.ms', performance.now() - t0);
    P.mark('gi.probes', budget);
  };
  // shadow maps: the sun's (autoUpdate off → needsUpdate) and the cube ones (per light)
  const sm = r.shadowMap;
  const smRender = sm.render;
  sm.render = function (lights, scene, camera) {
    const on = sm.enabled && (sm.autoUpdate || sm.needsUpdate);
    if (on && camera === W.camera) {
      let cubes = 0;
      let sun = 0;
      for (const l of lights) {
        if (!l.castShadow || !l.visible) continue;
        const due = l.shadow.autoUpdate || l.shadow.needsUpdate;
        if (!due) continue;
        if (l.isPointLight) cubes++;
        else sun++;
      }
      const t0 = performance.now();
      smRender.call(this, lights, scene, camera);
      if (sun) P.mark('shadow.sun');
      if (cubes) P.mark('shadow.cube', cubes);
      P.markT('shadow.ms', performance.now() - t0);
      return;
    }
    return smRender.call(this, lights, scene, camera);
  };
  // reflections (captureEnv → PMREM), world-level lighting requests, time of day
  wrap(A.THREE.PMREMGenerator.prototype, 'fromCubemap', 'env.pmrem');
  wrap(W, 'lightingChanged', 'call.lightingChanged', { time: false });
  wrap(W, 'bounceChanged', 'call.bounceChanged', { time: false });
  wrap(W, 'applyTime', 'call.applyTime', { time: false });
  // saves: serialising the masks to PNG is synchronous work
  const ls = Object.getPrototypeOf(localStorage);
  const setItem = ls.setItem;
  ls.setItem = function (k, v) {
    const t0 = performance.now();
    try { return setItem.call(this, k, v); } finally { P.markT('save.setItem', performance.now() - t0); P.mark('save.kb', Math.round(String(v).length / 1024)); }
  };
  wrap(HTMLCanvasElement.prototype, 'toDataURL', 'canvas.toDataURL');
  wrap(CanvasRenderingContext2D.prototype, 'getImageData', 'canvas.getImageData');
  // new shader programs + texture uploads: sampled per frame from renderer.info
  let progs = new Set(r.info.programs);
  let texs = r.info.memory.textures;
  P.compiled = []; // [label, material name] of every program made during play
  const tick = () => {
    const now = r.info.programs;
    const added = now.filter((p) => !progs.has(p));
    if (added.length) {
      P.mark('programs.new', added.length);
      for (const p of added) P.compiled.push([P.label, `${p.type}:${p.name || '-'}`]);
    }
    if (added.length || now.length !== progs.size) progs = new Set(now);
    const t = r.info.memory.textures;
    if (t !== texs) P.mark('textures.new', t - texs);
    texs = t;
  };
  W.onFrame(tick);
  // what the texture uploads cost: canvas masks go up whenever they were drawn on
  const gl = r.getContext();
  for (const k of ['texImage2D', 'texSubImage2D']) wrap(gl, k, `gl.${k}`);
  return { programs: progs.size, calls: r.info.render.calls };
}

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: !process.argv.includes('--headful'), // real GPU, no window (covers.mjs)
  args: ['--ignore-gpu-blocklist', `--window-size=${W},${H + 120}`, '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const results = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(probe);
  await page.goto(`http://127.0.0.1:${PORT}/?play`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://127.0.0.1:${PORT}/?play&level=${LEVEL}&phase=${PHASE}${extra ? `&${extra}` : ''}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true && window.__app?.game?.live', { timeout: 240000 });
  const info = await page.evaluate(instrument);
  const env = await page.evaluate(() => {
    const r = window.__app.world.renderer;
    const gl = r.getContext();
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return { gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?', pr: r.getPixelRatio(), buf: [gl.drawingBufferWidth, gl.drawingBufferHeight], msaa: window.__app.world.post.composer.multisampling };
  });
  console.log('env', JSON.stringify({ ...env, ...info }));
  // let the opening GI / flight / before-shot settle
  await page.waitForFunction('!window.__app.world.gi.busy', { timeout: 60000 });
  await sleep(2500);

  const label = (l) => page.evaluate((l) => { window.__perf.label = l; }, l);
  const scr = (x, y, z) => page.evaluate((x, y, z) => {
    const A = window.__app;
    const v = new A.THREE.Vector3(x, y, z).project(A.world.camera);
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }, x, y, z);
  // a zig-zag rub over a world-space rectangle, `secs` long, like a hand scrubbing
  const rub = async (pts, secs) => {
    const sp = [];
    for (const p of pts) sp.push(await scr(...p));
    await page.mouse.move(sp[0][0], sp[0][1], { steps: 6 });
    await sleep(150);
    await page.mouse.down();
    const end = Date.now() + secs * 1000;
    let i = 1;
    while (Date.now() < end) {
      const p = sp[i % sp.length];
      await page.mouse.move(p[0], p[1], { steps: 14 });
      i++;
    }
    await page.mouse.up();
  };
  const zig = (fn, n) => Array.from({ length: n }, (_, k) => fn(k, n));
  // per level: each tool's key on the tool bar, a spot to hover, and a zig-zag to rub
  // (world points in that level's room)
  const BY_LEVEL = {};
  BY_LEVEL.meadow = {
    // back wall right of the chimney breast, 0.4..2.6 m up
    roller: { key: '6', hover: [1.6, 1.4, -2.6], pts: zig((k) => [0.4 + (k % 2) * 2.3, 0.5 + (k / 12) * 2.0, -2.6], 13) },
    squeegee: { key: '4', hover: [-3.2, 1.5, -1.05], pts: zig((k) => [-3.2, 0.85 + (k / 10) * 1.45, -1.05 + ((k % 2) - 0.5) * 1.0], 11) },
    brush: { key: '5', hover: [-1.2, 0.9, -2.1], pts: zig((k) => [-0.9 + ((k % 2) - 0.5) * 1.4, 0.2 + (k / 10) * 0.95, -2.1], 11) },
    crowbar: { key: '2', hover: [0, 0, 0.4], pts: zig((k) => [(k % 2 ? 1.8 : -1.8), 0, -0.6 + k * 0.25], 9) },
    // new parquet over the strip the crowbar just cleared
    planks: { key: '3', hover: [0, 0, 0.4], pts: zig((k) => [(k % 2 ? 1.8 : -1.8), 0, -0.6 + k * 0.25], 9) },
  };
  BY_LEVEL.cabin = {
    // the logs right of the chimney · the first window · gaps left of the chimney · the stones · the floor
    oil: { key: '6', hover: [1.6, 1.4, -2.43], pts: zig((k) => [0.4 + (k % 2) * 2.3, 0.4 + (k / 12) * 2.2, -2.43], 13) },
    squeegee: { key: '3', hover: [-3.21, 1.5, -0.95], pts: zig((k) => [-3.21, 0.8 + (k / 10) * 1.5, -0.95 + ((k % 2) - 0.5) * 1.0], 11) },
    caulk: { key: '4', hover: [-2.5, 1.2, -2.5], pts: zig((k) => [(k % 2 ? -1.95 : -3.0), 0.26 * (1 + Math.min(k, 10)) + 0.13, -2.5], 11) },
    brush: { key: '5', hover: [-0.75, 0.9, -1.86], pts: zig((k) => [-0.75 + ((k % 2) - 0.5) * 1.4, 0.2 + (k / 10) * 0.95, -1.86], 11) },
    mop: { key: '2', hover: [0, 0, 0.4], pts: zig((k) => [(k % 2 ? 1.8 : -1.8), 0, -0.6 + k * 0.25], 9) },
  };
  BY_LEVEL.bookshop = {
    // the shop window · the floor · the plaster behind the counter · the shelf fronts
    // (the gilder waits for the paint: nothing to do in a fresh room)
    squeegee: { key: '2', hover: [-3.36, 1.5, 0.45], pts: zig((k) => [-3.36, 0.8 + (k / 10) * 1.6, 0.45 + ((k % 2) - 0.5) * 1.8], 11) },
    sander: { key: '3', hover: [0, 0, 0.4], pts: zig((k) => [(k % 2 ? 1.8 : -1.8), 0, -0.6 + k * 0.25], 9) },
    roller: { key: '4', hover: [2.2, 1.4, -2.6], pts: zig((k) => [1.45 + (k % 2) * 1.6, 0.5 + (k / 12) * 2.2, -2.6], 13) },
    duster: { key: '5', hover: [-1.0, 1.4, -2.26], pts: zig((k) => [(k % 2 ? 1.0 : -3.0), 0.3 + (k / 12) * 2.2, -2.26], 13) },
  };
  BY_LEVEL.pottery = {
    // the back wall over the work table · the big window · the floor · the kiln's front
    roller: { key: '4', hover: [0.9, 1.6, -2.5], pts: zig((k) => [-0.2 + (k % 2) * 2.0, 0.95 + (k / 12) * 1.9, -2.5], 13) },
    squeegee: { key: '3', hover: [-3.12, 1.6, -0.3], pts: zig((k) => [-3.12, 0.95 + (k / 10) * 1.35, -0.3 + ((k % 2) - 0.5) * 1.6], 11) },
    sponge: { key: '2', hover: [0, 0, 0.4], pts: zig((k) => [(k % 2 ? 1.8 : -1.8), 0, -0.6 + k * 0.25], 9) },
    trowel: { key: '5', hover: [2.64, 0.5, -1.29], pts: zig((k) => (k % 2 ? [2.87, 0.18 + (k / 10) * 0.6, -1.58] : [2.26, 0.18 + (k / 10) * 0.6, -1.25]), 11) },
  };
  BY_LEVEL.castle = {
    // the back wall right of the hearth · the leaded window · the stained glass · the hearth · the flags
    limewash: { key: '6', hover: [2.2, 1.4, -2.5], pts: zig((k) => [1.4 + (k % 2) * 1.5, 0.4 + (k / 12) * 2.3, -2.5], 13) },
    squeegee: { key: '3', hover: [-3.32, 1.5, 1.05], pts: zig((k) => [-3.32, 0.7 + (k / 10) * 1.6, 1.05 + ((k % 2) - 0.5) * 0.9], 11) },
    glazier: { key: '4', hover: [-3.32, 1.3, -1.2], pts: zig((k) => [-3.32, 0.75 + (k / 10) * 1.4, -1.2 + ((k % 2) - 0.5) * 0.7], 11) },
    brush: { key: '5', hover: [0.15, 1.0, -1.93], pts: zig((k) => [0.15 + ((k % 2) - 0.5) * 1.8, 0.2 + (k / 10) * 1.2, -1.93], 11) },
    broom: { key: '2', hover: [0, 0, 0.4], pts: zig((k) => [(k % 2 ? 1.8 : -1.8), 0, -0.6 + k * 0.25], 9) },
  };
  BY_LEVEL.cyber = {
    // the back wall left of the kitchen · the big window · the floor · the noodle sign's bowl · the kitchen tiles
    roller: { key: '6', hover: [-1.6, 1.4, -2.5], pts: zig((k) => [-2.7 + (k % 2) * 2.3, 1.05 + (k / 12) * 1.8, -2.5], 13) },
    squeegee: { key: '3', hover: [-3.12, 1.6, -0.2], pts: zig((k) => [-3.12, 0.9 + (k / 10) * 1.35, -0.2 + ((k % 2) - 0.5) * 1.6], 11) },
    mop: { key: '2', hover: [0, 0, 0.4], pts: zig((k) => [(k % 2 ? 1.8 : -1.8), 0, -0.6 + k * 0.25], 9) },
    tube: { key: '4', hover: [-1.45, 1.71, -2.436], pts: [[-1.89, 2.0, -2.436], [-1.67, 1.74, -2.436], [-1.45, 1.71, -2.436], [-1.23, 1.74, -2.436], [-1.01, 2.0, -2.436], [-1.23, 1.74, -2.436], [-1.45, 1.71, -2.436], [-1.67, 1.74, -2.436]] },
    brush: { key: '5', hover: [0.95, 1.2, -2.49], pts: zig((k) => [0.55 + (k % 2) * 0.8, 0.95 + (k / 10) * 0.55, -2.49], 11) },
  };
  const TOOLS = BY_LEVEL[LEVEL] ?? {};
  const order = Object.keys(TOOLS).filter((t) => !only || only.includes(t));

  await label('idle');
  await sleep(3000);
  // --phase=unpack: take things out of the boxes one by one and put each where the
  // default layout has it (every piece appears for the first time in the hand)
  if (PHASE === 'unpack') {
    const next = () => page.evaluate(() => {
      const A = window.__app;
      const b = A.game.L.boxes.list.find((x) => x.items.length && !x.lost);
      if (!b) return null;
      const id = b.items[0];
      const s = A.defaultLayout[id];
      const p = b.e.holder.position;
      return { box: b.id, id, at: [p.x, b.size.h * 0.45, p.z], to: s ? [s[0], s[1], s[2]] : [0, 0, 0.8] };
    });
    for (let k = 0; k < +opt('items', 12); k++) {
      const n = await next();
      if (!n) break;
      await label(`unpack:${n.id}`);
      const b = await scr(...n.at);
      await page.mouse.move(b[0], b[1], { steps: 6 });
      await sleep(120);
      await page.mouse.down();
      await page.mouse.up();
      const to = await scr(...n.to);
      await page.mouse.move(to[0], to[1], { steps: 20 });
      await sleep(400);
      await page.mouse.down();
      await page.mouse.up();
      await sleep(700);
      // still in hand (the box is in the way there): cancel, then set it down by
      // script where it belongs so the next piece comes up
      if (await page.evaluate(() => !!window.__app.decor.held)) {
        await page.mouse.click(to[0], to[1], { button: 'right' });
        await sleep(300);
        await page.evaluate((id) => {
          const A = window.__app;
          const b = A.game.L.boxes.list.find((x) => x.items.includes(id));
          if (b) b.items.splice(b.items.indexOf(id), 1);
          const e = A.decor.entries.find((x) => x.id === id);
          const s = A.defaultLayout[id];
          A.decor.setStored(e, false);
          if (s) {
            e.holder.position.set(s[0], s[1], s[2]);
            e.holder.rotation.set(0, s[3], 0);
          }
          A.decor.link();
          A.world.lightingChanged();
        }, n.id);
        await sleep(500);
      }
    }
  }
  for (const t of PHASE === 'unpack' ? [] : order) {
    const T = TOOLS[t];
    await label(`${t}:pick`);
    await page.keyboard.press(T.key);
    const h = await scr(...T.hover);
    await page.mouse.move(h[0], h[1], { steps: 10 });
    await sleep(1500);
    await label(`${t}:use`);
    await rub(T.pts, 8);
    await label(`${t}:after`);
    await sleep(3500);
  }
  // --dwell=<s>: then just stay in the room (e.g. with --q=daylen=40: the day going round),
  // reported in 5-second slices with the time of day each started at
  for (let k = 0; k < +opt('dwell', 0); k += 5) {
    const tod = await page.evaluate(() => window.__app.world.time.toFixed(2));
    await label(`dwell:${k}s@t${tod}`);
    await sleep(5000);
  }
  await label('end');
  await sleep(200);

  const data = await page.evaluate(() => ({
    frames: [...window.__perf.frames.values()].sort((a, b) => a.ts - b.ts),
    long: window.__perf.long,
    compiled: window.__perf.compiled,
  }));
  // per-phase report: frame intervals (what the player feels) and the worst frames
  const fr = data.frames;
  for (let i = 1; i < fr.length; i++) fr[i].dt = fr[i].ts - fr[i - 1].ts;
  const phases = [...new Set(fr.map((f) => f.label))].filter((l) => l !== 'boot' && l !== 'end');
  const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  for (const ph of phases) {
    const fs_ = fr.filter((f) => f.label === ph && f.dt !== undefined);
    const dts = fs_.map((f) => f.dt).sort((a, b) => a - b);
    const secs = dts.reduce((a, b) => a + b, 0) / 1000;
    const row = {
      phase: ph,
      frames: dts.length,
      fps: +(dts.length / secs).toFixed(0),
      p50: +pct(dts, 0.5).toFixed(1),
      p95: +pct(dts, 0.95).toFixed(1),
      max: +dts[dts.length - 1].toFixed(1),
      over33: dts.filter((d) => d > 33.4).length,
      over50: dts.filter((d) => d > 50).length,
      jsP50: +pct(fs_.map((f) => f.js).sort((a, b) => a - b), 0.5).toFixed(1),
      long: data.long.filter((l) => l.label === ph).map((l) => Math.round(l.dur)),
    };
    // in how many frames each kind of work ran (new programs / saved KB: totals)
    const ev = {};
    for (const f of fs_) {
      for (const [k, v] of Object.entries(f.ev)) {
        if (k.endsWith('.ms') || k.startsWith('gl.') || k.startsWith('canvas.') || k === 'save.setItem') continue;
        ev[k] = (ev[k] ?? 0) + (k === 'programs.new' || k === 'save.kb' ? v : 1);
      }
    }
    row.ev = ev;
    row.worst = [...fs_].sort((a, b) => b.dt - a.dt).slice(0, 5).map((f) => ({ dt: +f.dt.toFixed(1), js: +f.js.toFixed(1), ...f.ev }));
    results.push(row);
  }
  for (const r of results) {
    console.log(`\n== ${r.phase}: ${r.frames} frames · ${r.fps} fps · p50 ${r.p50} · p95 ${r.p95} · max ${r.max} ms · >33ms ${r.over33} · >50ms ${r.over50} · js p50 ${r.jsP50} ms${r.long.length ? ` · long tasks ${r.long.join(',')}` : ''}`);
    console.log('   ran:', JSON.stringify(r.ev));
    for (const w of r.worst) console.log('   worst', JSON.stringify(w));
  }
  console.log(`\nshaders compiled during play: ${data.compiled.length ? data.compiled.map(([l, n]) => `${n} @${l}`).join(', ') : 'none'}`);
  if (opt('json', '')) fs.writeFileSync(opt('json', ''), JSON.stringify({ env, results, compiled: data.compiled, frames: fr }, null, 1));
  if (errors.length) console.log('errors', errors);
} finally {
  await browser.close();
}
