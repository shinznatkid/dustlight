// Load time of each level page as a first-time visitor gets it: bytes over the wire until
// the room is ready to play (window.__ready: GI converged and shaders compiled — the click
// to start shows), split by kind, and the time to get there on slower links. Then what a
// returning visitor downloads again for the next level (URLs already fetched by the levels
// before it count as cached).
// Usage: node tools/loadtime.mjs [--dist=dist[,other]] [--port=5198] [--levels=meadow,cabin]
//        [--profiles=local,fast,slow] [--runs=1] [--json=out.json]
//   --dist=a,b  compares builds: each level loads from a, then from b, so a machine that gets
//               busier halfway hits both alike · --runs=n: best of n (time; bytes don't vary)
//   serves the build itself, like GitHub Pages would: gzip for text (js, html, json, glTF
//   json), none for binaries. The link is shaped in that server — one shared token bucket
//   for all connections plus a round trip before each response — because DevTools'
//   emulated throttling gave erratic times here (resets on big files, 50 Mbps slower than 10)
//   profiles: local = no shaping (the GPU / CPU floor) · fast = 50 Mbps, 20 ms RTT ·
//             slow = 10 Mbps, 60 ms RTT — every page load cold (fresh context, cache off)
// Runs on the real GPU (new headless Edge, no window — as --gpu in the other tools): readiness
// includes the GI bake, so ready times carry GPU noise; `net` = when the last byte before
// ready landed (the network's share). Web fonts come from Google, unshaped.
import './lowprio.mjs'; // below-normal priority for this and the browser it opens
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const DISTS = opt('dist', 'dist').split(',').map((d) => path.resolve(d));
const RUNS = +opt('runs', '1');
let DIST = DISTS[0]; // the build being served
const PORT = +opt('port', '5198');
const LEVELS = opt('levels', 'meadow,cabin,bookshop,pottery,castle,cyber').split(',');
const PROFILES = {
  local: null,
  fast: { mbps: 50, rtt: 20 },
  slow: { mbps: 10, rtt: 60 },
};
const profiles = opt('profiles', 'local,fast,slow').split(',');
const KINDS = ['js', 'models', 'textures', 'audio', 'other'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(fs.existsSync);
if (!exe) throw new Error('No Edge/Chrome found');
for (const d of DISTS) if (!fs.existsSync(path.join(d, 'index.html'))) throw new Error(`no build at ${d}`);

// what a request is, by its path (glTF textures count as textures, not models)
function kind(url) {
  const p = new URL(url).pathname.toLowerCase();
  if (/\.m?js$/.test(p)) return 'js';
  if (/\.(gltf|glb|bin)$/.test(p)) return 'models';
  if (/\/assets\/.*\.(jpe?g|png|webp|avif|ktx2)$/.test(p)) return 'textures';
  if (/\.(mp3|ogg|wav|m4a|opus)$/.test(p) || p.endsWith('/audio/index.json')) return 'audio';
  return 'other'; // the page, css, json, ui pictures, web fonts
}

// ---- the static server with a shaped link
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.txt': 'text/plain', '.svg': 'image/svg+xml',
};
const GZIP = /\.(html|js|css|json|gltf|txt|svg)$/;
let link = null; // the current profile's { mbps, rtt }
let wire = 0; // when the shared link is free again (ms)
const gz = new Map();
const server = http.createServer(async (req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(DIST, u.endsWith('/') ? `${u}index.html` : u);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = null;
  if (link) await sleep(link.rtt);
  if (!f) {
    res.writeHead(404).end();
    return;
  }
  const ext = path.extname(f).toLowerCase();
  let body = fs.readFileSync(f);
  const head = { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range) {
    const a = range[1] ? +range[1] : body.length - +range[2];
    const b = range[1] && range[2] ? Math.min(+range[2], body.length - 1) : body.length - 1;
    head['Content-Range'] = `bytes ${a}-${b}/${body.length}`;
    body = body.subarray(a, b + 1);
    status = 206;
  } else if (GZIP.test(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    if (!gz.has(f)) gz.set(f, zlib.gzipSync(body, { level: 6 }));
    body = gz.get(f);
    head['Content-Encoding'] = 'gzip';
  }
  head['Content-Length'] = body.length;
  res.writeHead(status, head);
  if (!link) {
    res.end(body);
    return;
  }
  // each 16 KB goes out when the shared link would have finished sending it
  for (let i = 0; i < body.length; i += 16384) {
    const c = body.subarray(i, i + 16384);
    const now = performance.now();
    wire = Math.max(now, wire) + (c.length * 8) / (link.mbps * 1e3);
    await sleep(wire - now);
    if (res.destroyed) return;
    res.write(c);
  }
  res.end();
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// one cold page load: every finished request (url, bytes, kind, ms after the page's
// request) and when the room was ready (ms after navigation start)
async function measure(browser, level) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`  [pageerror] ${e.message}`));
  // the moment the page flags itself ready, taken in the page (no polling lag)
  await page.evaluateOnNewDocument(() => {
    let v;
    Object.defineProperty(window, '__ready', {
      configurable: true,
      get: () => v,
      set: (x) => { v = x; if (x && window.__readyAt === undefined) window.__readyAt = performance.now(); },
    });
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const reqs = new Map();
  let t0 = null;
  cdp.on('Network.requestWillBeSent', (e) => {
    if (!/^https?:/.test(e.request.url)) return;
    if (t0 === null && e.type === 'Document') t0 = e.timestamp;
    reqs.set(e.requestId, { url: e.request.url, start: e.timestamp });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = reqs.get(e.requestId);
    if (r) r.status = e.response.status;
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) Object.assign(r, { bytes: e.encodedDataLength, end: e.timestamp });
  });
  cdp.on('Network.loadingFailed', (e) => {
    const r = reqs.get(e.requestId);
    if (r) Object.assign(r, { failed: e.errorText, bytes: 0, end: e.timestamp });
  });
  await page.goto(`http://127.0.0.1:${PORT}/?level=${level}`, { waitUntil: 'load', timeout: 600000 });
  await page.waitForFunction('window.__readyAt !== undefined', { timeout: 600000, polling: 250 });
  const readyMs = await page.evaluate(() => window.__readyAt);
  const state = await page.evaluate(() => window.__app?.state);
  await sleep(1500); // what the menu fetches right after (not counted as before-ready)
  const list = [...reqs.values()].filter((r) => r.end !== undefined).map((r) => ({
    url: r.url.replace(/^http:\/\/127\.0\.0\.1:\d+/, ''),
    kind: kind(r.url),
    bytes: r.bytes,
    status: r.status,
    failed: r.failed,
    endMs: (r.end - t0) * 1000,
  }));
  await ctx.close();
  const before = list.filter((r) => r.endMs <= readyMs);
  const by = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const r of before) by[r.kind] += r.bytes;
  return {
    level,
    readyMs,
    state,
    netMs: Math.max(...before.map((r) => r.endMs)),
    total: before.reduce((s, r) => s + r.bytes, 0),
    by,
    count: before.length,
    after: list.filter((r) => r.endMs > readyMs),
    bad: list.filter((r) => r.failed || r.status >= 400),
    requests: before,
  };
}

const MB = (b) => (b / 1e6).toFixed(2);
const S = (ms) => (ms / 1000).toFixed(1);
const out = { dists: DISTS, profiles: {} };
const label = (d) => (DISTS.length > 1 ? ` [${path.basename(d)}]` : '');
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  protocolTimeout: 900000, // a slow profile's wait for readiness is one long call
  args: [
    '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars', '--window-size=1600,900',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ],
});
try {
  for (const p of profiles) {
    link = PROFILES[p];
    out.profiles[p] = Object.fromEntries(DISTS.map((d) => [d, []]));
    console.log(`\n== ${p} ${link ? `(${link.mbps} Mbps, ${link.rtt} ms RTT)` : '(no shaping)'}${RUNS > 1 ? `, best of ${RUNS}` : ''}`);
    console.log('level     total MB   js      models  textures audio   other   reqs  net s  ready s');
    for (const l of LEVELS) {
      for (const d of DISTS) {
        DIST = d;
        let m = null;
        for (let k = 0; k < RUNS; k++) {
          const r = await measure(browser, l);
          if (!m) m = r;
          m.netMs = Math.min(m.netMs, r.netMs);
          m.readyMs = Math.min(m.readyMs, r.readyMs);
        }
        out.profiles[p][d].push(m);
        console.log(`${l.padEnd(9)} ${MB(m.total).padStart(8)} ${KINDS.map((k) => MB(m.by[k]).padStart(7)).join(' ')} ${String(m.count).padStart(5)} ${S(m.netMs).padStart(6)} ${S(m.readyMs).padStart(8)}${label(d)}${m.state === 'loading' ? '  (state still loading?)' : ''}`);
        for (const r of m.bad) console.log(`  !! ${r.status ?? ''} ${r.failed ?? ''} ${r.url}`);
        if (m.after.length) console.log(`  after ready: ${m.after.length} requests, ${MB(m.after.reduce((s, r) => s + r.bytes, 0))} MB (${[...new Set(m.after.map((r) => r.kind))].join(', ')})`);
      }
    }
  }
  // returning visitor: the levels in order, each URL fetched once (a stable file name stays cached)
  out.shared = {};
  for (const d of DISTS) {
    const rows = out.profiles[profiles[0]][d];
    const seen = new Map();
    console.log(`\n== returning visitor${label(d)} (levels in order; URLs a previous level fetched are cached)`);
    console.log('level     cold MB  new MB  (js / models / textures / audio / other)');
    for (const m of rows) {
      const fresh = m.requests.filter((r) => !seen.has(r.url));
      const by = Object.fromEntries(KINDS.map((k) => [k, 0]));
      for (const r of fresh) by[r.kind] += r.bytes;
      console.log(`${m.level.padEnd(9)} ${MB(m.total).padStart(7)} ${MB(fresh.reduce((s, r) => s + r.bytes, 0)).padStart(7)}  (${KINDS.map((k) => MB(by[k])).join(' / ')})`);
      for (const r of m.requests) seen.set(r.url, r.bytes);
    }
    const common = rows.map((m) => new Set(m.requests.map((r) => r.url))).reduce((a, b) => new Set([...a].filter((u) => b.has(u))));
    const sharedBytes = [...common].reduce((s, u) => s + (rows[0].requests.find((r) => r.url === u)?.bytes ?? 0), 0);
    console.log(`fetched by every level: ${common.size} files, ${MB(sharedBytes)} MB`);
    out.shared[d] = { files: common.size, bytes: sharedBytes };
  }
  const json = opt('json', '');
  if (json) fs.writeFileSync(json, JSON.stringify(out, null, 1));
} finally {
  await browser.close();
  server.close();
  server.closeAllConnections?.();
}
