// The sample meadow room's timelapse history: the title timelapse (demo.js) works the
// level's own tools, so recording it (index.html?recdemo) gives a real journal
// (journal.js); its furniture then goes where the sample has it (src/samples.json) and
// its paint takes the sample's wall colour → public/samples/<level>-journal.json (then point
// the sample's "journal" in src/samples.json at it). Needs the dev server (http://127.0.0.1:5190).
// Usage: node tools/samplejournal.mjs [--level=cabin]   (default: meadow)
// Level 1 also gets the demo's quick tidy-ups written in as strokes; other levels' leftovers
// are finished by the replay itself (completeRepairs, before the boxes)
import './lowprio.mjs'; // below-normal priority for this and the browser it opens
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(fs.existsSync);
if (!exe) throw new Error('No Edge/Chrome found');
const LEVEL = process.argv.slice(2).find((a) => a.startsWith('--level='))?.slice(8) ?? 'meadow';
const PORT = process.argv.slice(2).find((a) => a.startsWith('--port='))?.slice(7) ?? '5190';
const sample = JSON.parse(fs.readFileSync('src/samples.json', 'utf8')).find((s) => s.id === LEVEL);

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: !process.argv.includes('--headful'), // real GPU, no window (covers.mjs)
  args: ['--ignore-gpu-blocklist', '--window-size=1600,1020', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?recdemo&pr=1&level=${LEVEL}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 240000 });
  await sleep(500);
  await page.mouse.click(800, 450); // click to start: the timelapse begins
  await page.waitForFunction(() => window.__app.demo?.active, { timeout: 10000 });
  // the demo's last step: everything unpacked, before it resets
  await page.waitForFunction(() => window.__app.game.phase === 'done', { timeout: 180000, polling: 200 });
  await sleep(1500);
  const j = await page.evaluate(() => window.__app.game.journal.serialize());
  const kinds = {};
  for (const e of j.e) kinds[e[1]] = (kinds[e[1]] ?? 0) + 1;
  // the sample's own furniture and paint
  for (const e of j.e) {
    if (e[1] === 'paint' && sample.wall) e[3] = sample.wall;
    if (e[1] === 'move' && sample.layout) for (const id of Object.keys(e[2])) if (sample.layout[id]) e[2][id] = sample.layout[id];
  }
  if (LEVEL === 'meadow') tidy(j);
  j.partial = false;
  fs.mkdirSync('public/samples', { recursive: true });
  const out = `public/samples/${LEVEL}-journal.json`;
  fs.writeFileSync(out, JSON.stringify(j));
  console.log('saved', out, `${Math.round(fs.statSync(out).size / 1024)} KB`, JSON.stringify(kinds));
} finally {
  await browser.close();
}

function tidy(j) {
  // the demo tidies up what its sweeps missed straight through the systems (floor.pry/lay
  // bursts, fading the last soot): as strokes here, so the replay finishes them by itself
  const [X0, X1, Z0, Z1] = [-3.2, 3.2, -2.6, 2.6];
  const rows = (z0, step, pad) => {
    const pts = [];
    for (let z = z0, k = 0; z <= Z1 - pad + 1e-6; z += step, k++) pts.push(k % 2 ? X1 - pad : X0 + pad, +z.toFixed(2), k % 2 ? X0 + pad : X1 - pad, +z.toFixed(2));
    return pts;
  };
  const after = (kind, entry) => {
    const i = j.e.findIndex((e) => e[1] === kind);
    if (i >= 0) j.e.splice(i + 1, 0, [j.e[i][0], ...entry]);
  };
  after('pry', ['pry', rows(Z0 + 0.45, 0.4, 0.22)]);
  after('lay', ['lay', rows(Z0 + 0.55, 0.5, 0.3)]);
  const SW = 1.48;
  const SH = 1.13;
  const soot = [];
  for (let py = 8, k = 0; py < 196; py += 11, k++) {
    for (const px of k % 2 ? [248, 8] : [8, 248]) {
      soot.push(px, py, +(-0.9 - SW / 2 + ((px + 0.5) / 256) * SW).toFixed(2), +(SH - ((py + 0.5) / 196) * SH).toFixed(2), -2.1);
    }
  }
  after('scrub', ['scrub', 0, soot]);
}
