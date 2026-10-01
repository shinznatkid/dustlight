// Screenshot the running dev server (http://127.0.0.1:5190) once GI has converged.
// Usage: node tools/shot.mjs <name> [--q=t=0.62&cam=hero] [--w=1600] [--h=900] [--gpu] [--wait=ms]
//        [--page=proto.html] [--port=5190]   (proto.html?room=<id> = one room on its own, src/rooms/)
//   --gpu  Edge on the real GPU, headless (SwiftShader is far too slow for the probe GI) · --headful = show the window
import './lowprio.mjs'; // below-normal priority for this and the browser it opens
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--')) ?? 'shot';
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const w = +opt('w', 1600);
const h = +opt('h', 900);
const q = opt('q', '');
const gpu = args.includes('--gpu');

const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(fs.existsSync);
if (!exe) throw new Error('No Edge/Chrome found');

const browser = await puppeteer.launch({
  executablePath: exe,
  // --gpu = the real GPU; new headless Edge renders on it with no window (covers.mjs) · --headful = watch it
  headless: !process.argv.includes('--headful'),
  args: [
    ...(gpu ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--enable-unsafe-swiftshader']),
    '--hide-scrollbars', `--window-size=${w},${h + 120}`, '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('response', (r) => { if (r.status() >= 400) console.error('[http]', r.status(), r.url()); });
  page.on('console', (m) => {
    if (['error', 'warning', 'warn'].includes(m.type())) console.error(`[console.${m.type()}]`, m.text());
  });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${opt('port', 5190)}/${opt('page', '')}?${q}${q ? '&' : ''}pr=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: +opt('timeout', 240000) });
  const settle = +opt('wait', 800);
  await new Promise((r) => setTimeout(r, settle));
  const info = await page.evaluate(() => {
    const r = window.__app.renderer;
    const gl = r.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?',
      calls: r.info.render.calls,
      tris: r.info.render.triangles,
      badge: document.getElementById('badge')?.textContent ?? '',
    };
  });
  const ev = opt('eval', '');
  if (ev) {
    console.log('eval:', JSON.stringify(await page.evaluate(ev)));
    // a scripted change (e.g. moving furniture) re-runs GI: let it land and converge
    await new Promise((r) => setTimeout(r, 500));
    await page.waitForFunction('!window.__app.gi.busy && !window.__app.decor?.busy', { timeout: 60000 });
    await new Promise((r) => setTimeout(r, settle));
  }
  if (args.includes('--noshot')) process.exit(0);
  fs.mkdirSync('shots', { recursive: true });
  const out = path.join('shots', `${name}.png`);
  await page.screenshot({ path: out });
  console.log('saved', out, `${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(info));
} finally {
  await browser.close();
}
