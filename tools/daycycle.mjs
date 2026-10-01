// The day going round by itself in the room viewer (proto.html's "▶ day", src/proto.js):
// frame times over one whole loop per room, what ran in the worst frames, and whether any
// shader got compiled on the way (a light crossing zero must not recompile the room).
// With --shots: a strip of the loop instead (screenshots at even steps → shots/day-<room>.jpg).
// Usage: node tools/daycycle.mjs [--rooms=meadow,cabin,bookshop,pottery] [--cycle=40] [--measure=s] [--t=start] [--q=gi=2&sweeps=1] [--w=1600 --h=900]
//        [--shots [--n=8]]    (Edge on the real GPU, no window — --headful to watch; needs the dev server on :5190)
import './lowprio.mjs'; // below-normal priority for this and the browser it opens
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const W = +opt('w', 1600);
const H = +opt('h', 900);
const CYCLE = +opt('cycle', 40);
const rooms = opt('rooms', 'meadow,cabin,bookshop,pottery').split(',');
const SHOTS = args.includes('--shots');
const N = +opt('n', 8);
const MEASURE = +opt('measure', CYCLE); // seconds recorded (a slow day: a stretch of it is enough)
const EXTRA = opt('q', ''); // extra proto.html flags, e.g. gi=0.25&sweeps=3 (the loop's GI schedule)
const PORT = process.argv.slice(2).find((a) => a.startsWith('--port='))?.slice(7) ?? '5190';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(fs.existsSync);
if (!exe) throw new Error('No Edge/Chrome found');

// before the page's scripts: time every animation-frame callback
function probe() {
  const P = (window.__perf = { frames: [], cur: null });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => {
    const f = { ts, js: 0, ev: {} };
    P.cur = f;
    const t0 = performance.now();
    try { cb(ts); } finally {
      f.js = performance.now() - t0;
      if (P.on) P.frames.push(f);
    }
  });
  P.mark = (k) => { if (P.cur) P.cur.ev[k] = (P.cur.ev[k] ?? 0) + 1; };
}

// after boot: count what each frame did (GI probes, reflection captures, time steps, new programs)
function instrument() {
  const A = window.__app;
  const P = window.__perf;
  const r = A.renderer;
  const wrap = (obj, fn, key) => {
    const orig = obj[fn];
    obj[fn] = function (...a) { P.mark(key); return orig.apply(this, a); };
  };
  wrap(A.THREE.PMREMGenerator.prototype, 'fromCubemap', 'env');
  wrap(A.gi.cubeCam, 'update', 'gi.probe');
  P.compiled = [];
  let progs = new Set(r.info.programs);
  A.onFrame(() => {
    const now = r.info.programs;
    if (now.length !== progs.size) {
      for (const p of now) if (!progs.has(p)) P.compiled.push(`${p.type}:${p.name || '-'} @t=${A.time.toFixed(3)}`);
      progs = new Set(now);
    }
  });
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1] };
};

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: !process.argv.includes('--headful'), // real GPU, no window (covers.mjs)
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars', `--window-size=${W},${H + 120}`,
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  for (const room of rooms) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error(`[${room} pageerror]`, e.message));
    await page.evaluateOnNewDocument(probe);
    await page.goto(`http://127.0.0.1:${PORT}/proto.html?room=${room}&t=${opt('t', 0)}&pr=1${SHOTS ? '&nohud' : ''}${EXTRA ? `&${EXTRA}` : ''}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 240000 });
    await page.evaluate(instrument);
    await sleep(1500);
    await page.evaluate((c) => { window.__perf.on = true; window.__app.setDay(true, c); }, CYCLE);
    if (SHOTS) {
      const files = [];
      for (let i = 0; i < N; i++) {
        await sleep((CYCLE * 1000) / N);
        const f = `shots/day-${room}-${i}.png`;
        await page.screenshot({ path: f });
        files.push(f);
      }
      execFileSync('python', ['tools/sheet.py', `shots/day-${room}.jpg`, ...files, `--cols=${Math.ceil(N / 2)}`, '--w=640']);
      console.log(`${room}: shots/day-${room}.jpg`);
    } else {
      await sleep(MEASURE * 1000 + 500);
      const res = await page.evaluate(() => {
        const P = window.__perf;
        P.on = false;
        const fr = P.frames;
        const dts = fr.slice(1).map((f, i) => f.ts - fr[i].ts);
        const worst = fr.slice(1).map((f, i) => ({ dt: +(f.ts - fr[i].ts).toFixed(1), js: +f.js.toFixed(1), ...f.ev })).sort((a, b) => b.dt - a.dt).slice(0, 5);
        const count = (k) => fr.filter((f) => f.ev[k]).length;
        return { dts, js: fr.map((f) => f.js), worst, env: count('env'), giFrames: count('gi.probe'), n: fr.length, compiled: P.compiled };
      });
      const d = stats(res.dts);
      const j = stats(res.js);
      const sec = res.dts.reduce((a, b) => a + b, 0) / 1000;
      console.log(`== ${room}: ${res.n} frames in ${sec.toFixed(1)} s · ${Math.round(res.n / sec)} fps · frame p50 ${d.p50.toFixed(1)} p95 ${d.p95.toFixed(1)} p99 ${d.p99.toFixed(1)} max ${d.max.toFixed(1)} ms`
        + ` · >33ms ${res.dts.filter((x) => x > 33).length} · >50ms ${res.dts.filter((x) => x > 50).length}`
        + ` · js p50 ${j.p50.toFixed(1)} p95 ${j.p95.toFixed(1)} ms · GI busy ${Math.round((100 * res.giFrames) / res.n)}% of frames · reflection captures ${res.env}`);
      for (const w of res.worst) console.log('   worst', JSON.stringify(w));
      console.log(`   shaders compiled during the loop: ${res.compiled.length ? res.compiled.join(', ') : 'none'}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
