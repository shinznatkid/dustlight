// The album's sample-room covers: each sample of src/samples.json opened on its own page
// (index.html?view=<id>, its own time and camera), shot once the lighting has converged
// → public/ui/sample-<id>.jpg (tracked in git). Needs the dev server (http://127.0.0.1:5190).
// Usage: node tools/covers.mjs [--only=meadow,cabin] [--w=960] [--h=540] [--pr=2] [--q=85]
//   rendered at pr× the size and scaled down by the browser: smooth edges at card size
// --cards: the places cards' pictures instead — each level's finished room at golden hour (or its
//   own `cardTime` in src/levels.js: the neon alley with its signs lit)
//   (index.html?level=<id>&nohud, its hero camera) → public/ui/level-<id>.jpg at 720 × 450
//   (16:10, the card's shape: the middle of a 16:9 shot); --only picks levels
import './lowprio.mjs'; // below-normal priority for this and the browser it opens
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const W = +opt('w', 960);
const H = +opt('h', 540);
const only = opt('only', '') ? opt('only', '').split(',') : null;
const CARDS = process.argv.includes('--cards');
const samples = JSON.parse(fs.readFileSync('src/samples.json', 'utf8')).filter((s) => !only || only.includes(s.id));

const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(fs.existsSync);
if (!exe) throw new Error('No Edge/Chrome found');

const browser = await puppeteer.launch({
  executablePath: exe,
  // the real GPU (SwiftShader is far too slow for the probe GI): new headless Edge renders on it
  // with no window in the way (same image and frame times, 2026-09-30) · --headful = watch it
  headless: !process.argv.includes('--headful'),
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars', `--window-size=${W},${H + 120}`,
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  if (CARDS) {
    const levels = [...fs.readFileSync('src/levels.js', 'utf8').matchAll(/\{ id: '(\w+)'[^}]*\}/g)]
      .filter((m) => !/soon: true/.test(m[0])).map((m) => ({ id: m[1], t: +(/cardTime: ([\d.]+)/.exec(m[0])?.[1] ?? 0.62) }))
      .filter(({ id }) => !only || only.includes(id));
    for (const { id, t } of levels) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => console.error(`[${id} pageerror]`, e.message));
      await page.goto(`http://127.0.0.1:${opt('port', 5190)}/?level=${id}&nohud&still&t=${t}&pr=1.5`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction('window.__ready === true', { timeout: 240000 });
      await new Promise((r) => setTimeout(r, 1000));
      const png = await page.screenshot({ clip: { x: 80, y: 0, width: 1440, height: 900 } });
      // scaled down in the page itself (a canvas), so no image library is needed here
      const url = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 720;
        c.height = 450;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, 720, 450);
        return c.toDataURL('image/jpeg', 0.86);
      }, Buffer.from(png).toString('base64'));
      const out = `public/ui/level-${id}.jpg`;
      fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
      console.log('saved', out, `${Math.round(fs.statSync(out).size / 1024)} KB`);
      await page.close();
    }
    samples.length = 0;
  }
  for (const s of samples) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error(`[${s.id} pageerror]`, e.message));
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${opt('port', 5190)}/?view=${s.id}&nohud&still&pr=${opt('pr', 2)}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__ready === true', { timeout: 240000 });
    await new Promise((r) => setTimeout(r, 1000));
    const out = `public/ui/sample-${s.id}.jpg`;
    await page.screenshot({ path: out, type: 'jpeg', quality: +opt('q', 85) });
    console.log('saved', out, `${Math.round(fs.statSync(out).size / 1024)} KB`, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await page.close();
  }
} finally {
  await browser.close();
}
