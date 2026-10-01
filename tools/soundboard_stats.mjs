// Numbers for the sound board (sounds.html): renders the board's processed options — layered
// cues, synths, rubs, files at another pitch / low-pass, the neon-alley ambience synths —
// offline to WAVs under public/assets/audio/candidates/_render/, runs tools/soundcheck.mjs on
// them and on every current + candidate file, and writes
// public/assets/audio/candidates/soundcheck.json, which the board shows next to each option.
//   python tools/fetch_sound_candidates.py      (the candidate files, once)
//   node tools/soundboard_stats.mjs [--port=5190]   (needs the dev server running)
import './lowprio.mjs'; // below-normal priority for this and the browser it opens
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const port = opt('port', 5190);
const AUDIO = path.join('public', 'assets', 'audio');
const OUT = path.join(AUDIO, 'candidates');
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(fs.existsSync);

function wav(pcm, sr) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// 1. render the processed options in a page that has the board's module
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
let list;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/assets/audio/index.json`, { waitUntil: 'load' });
  list = await page.evaluate(async () => (await import('/src/soundboard.js')).measureList('/assets/audio/'));
  fs.mkdirSync(path.join(OUT, '_render'), { recursive: true });
  for (const r of list.renders) {
    const { sr, b64 } = await page.evaluate(async ({ row, opt: o }) => (await import('/src/soundboard.js')).renderOption(row, o), r);
    fs.writeFileSync(path.join(AUDIO, r.out), wav(Buffer.from(b64, 'base64'), sr));
  }
  console.log(`rendered ${list.renders.length} options · ${list.files.length} files to measure`);
} finally {
  await browser.close();
}

// 2. soundcheck.mjs on everything (its table → JSON)
const all = [...list.files, ...list.renders.map((r) => r.out)];
const text = execFileSync(process.execPath, [path.join('tools', 'soundcheck.mjs'), `--port=${port}`, ...all], { encoding: 'utf8', maxBuffer: 64 << 20 });
const files = {};
const row = /^(.+?\.(?:ogg|wav|mp3|flac))\s*(-?\d+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(\d+)\s+(\d+)\/(\d+)\/(\d+)\/(\d+)\s+([\d.]+)\s*$/;
for (const line of text.split(/\r?\n/)) {
  const m = line.match(row);
  if (m) {
    files[m[1]] = { ms: +m[2], peak: +m[3], rms: +m[4], centroid: +m[5], bands: [+m[6], +m[7], +m[8], +m[9]], flat: +m[10] };
  } else if (/ERROR/.test(line)) {
    const [f] = line.trim().split(/\s+/);
    files[f] = { error: line.trim() };
  }
}
const missing = all.filter((f) => !files[f]);
fs.writeFileSync(path.join(OUT, 'soundcheck.json'), JSON.stringify({
  made: new Date().toISOString(),
  by: 'node tools/soundboard_stats.mjs → tools/soundcheck.mjs',
  reading: 'ms = active length · peak/rms dBFS · centroid Hz (brightness) · bands % of energy <500 / 500–2k / 2–5k / >5k Hz · flat: 0 = tonal, 0.3+ = noisy. centroid > ~2.5 kHz with > ~35% in 2–5 kHz = where playtesters said "แสบหู"',
  files,
}, null, 1));
console.log(`soundcheck.json: ${Object.keys(files).length} measured${missing.length ? ` · MISSING ${missing.length}: ${missing.join(' ')}` : ''}`);
if (missing.length) process.exitCode = 1;
