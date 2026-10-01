// What a sound effect is like, in numbers — we can't listen, so "harsh" and "soft"
// have to be measured. Decodes each file in the browser (the dev server serves
// public/assets/audio/), optionally runs it through a playback rate + low-pass the
// way audio.js would, and prints: length, peak / loudness, brightness (spectral
// centroid), how its energy splits across bands, and how tonal it is (a creak's
// squeal is a tone; a knock or a crackle is noise-like).
//   node tools/soundcheck.mjs sfx/creak_1.ogg _cand/*.ogg [--rate=0.85] [--lp=2400]
//   node tools/soundcheck.mjs --cue=pry        (the game's own cue from audio.js, 12 renders)
// Rough reading: >2k–5k Hz share above ~35% and a centroid above ~2.5 kHz is where
// playtesters said "แสบหู"; flatness near 0 = a whistle/squeal, near 0.3+ = noisy.
import './lowprio.mjs'; // below-normal priority for this and the browser it opens
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const files = args.filter((a) => !a.startsWith('--')).map((f) => f.replace(/^.*public\/assets\/audio\//, ''));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(fs.existsSync);

// ---- runs in the page ----------------------------------------------------------------
async function analyse({ files, rate, lp, cue }) {
  const SR = 48000;
  const fft = (re, im) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const a = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < len / 2; k++) {
          const c = Math.cos(a * k), s = Math.sin(a * k);
          const xr = re[i + k + len / 2] * c - im[i + k + len / 2] * s;
          const xi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
          re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
          re[i + k] += xr; im[i + k] += xi;
        }
      }
    }
  };
  function metrics(d) {
    let peak = 0;
    for (const v of d) peak = Math.max(peak, Math.abs(v));
    // active part: until the envelope stays 50 dB under the peak
    const W = 480;
    let end = 0;
    for (let i = 0; i < d.length; i += W) {
      let m = 0;
      for (let j = i; j < Math.min(d.length, i + W); j++) m = Math.max(m, Math.abs(d[j]));
      if (m > peak * 0.00316) end = Math.min(d.length, i + W);
    }
    let sq = 0;
    for (let i = 0; i < end; i++) sq += d[i] * d[i];
    const rms = Math.sqrt(sq / Math.max(1, end));
    // spectrum: 2048-point frames with a Hann window, power summed over the active part
    const N = 2048;
    const pow = new Float64Array(N / 2);
    for (let s = 0; s + N <= Math.max(end, N); s += N / 2) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = (d[s + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      fft(re, im);
      for (let k = 1; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    }
    const hz = (k) => (k * SR) / N;
    let tot = 0, cen = 0;
    const bands = [0, 0, 0, 0]; // <500 · 500–2k · 2k–5k · >5k
    let lg = 0, ar = 0, nb = 0; // flatness over 150 Hz–6 kHz, where these sounds live
    for (let k = 1; k < N / 2; k++) {
      const p = pow[k] + 1e-20;
      tot += p;
      cen += p * hz(k);
      const f = hz(k);
      bands[f < 500 ? 0 : f < 2000 ? 1 : f < 5000 ? 2 : 3] += p;
      if (f >= 150 && f <= 6000) { lg += Math.log(p); ar += p; nb++; }
    }
    const flat = Math.exp(lg / nb) / (ar / nb);
    const db = (x) => +(20 * Math.log10(x + 1e-9)).toFixed(1);
    return {
      ms: Math.round((end / SR) * 1000),
      peak: db(peak),
      rms: db(rms),
      centroid: Math.round(cen / tot),
      bands: bands.map((b) => Math.round((b / tot) * 100)),
      flat: +flat.toFixed(3),
    };
  }
  const out = [];
  if (cue) {
    // the game's cue, rendered offline by audio.js itself
    const { renderCue } = await import('/src/audio.js');
    for (let i = 0; i < 12; i++) {
      const buf = await renderCue(cue, SR, '/assets/audio/');
      if (!buf) return [{ file: `cue:${cue}`, error: 'renderCue returned nothing' }];
      out.push({ file: `cue:${cue}#${i + 1}`, ...metrics(buf.getChannelData(0)) });
    }
    return out;
  }
  const decoder = new OfflineAudioContext(1, 1, SR);
  for (const f of files) {
    try {
      const raw = await (await fetch(`/assets/audio/${f}`)).arrayBuffer();
      const src0 = await decoder.decodeAudioData(raw);
      const len = Math.ceil((src0.duration / rate) * SR) + SR / 10;
      const ctx = new OfflineAudioContext(1, len, SR);
      const src = ctx.createBufferSource();
      src.buffer = src0;
      src.playbackRate.value = rate;
      let node = src;
      if (lp) {
        const f2 = ctx.createBiquadFilter();
        f2.type = 'lowpass';
        f2.frequency.value = lp;
        f2.Q.value = 0.5;
        node = node.connect(f2);
      }
      node.connect(ctx.destination);
      src.start();
      const r = await ctx.startRendering();
      out.push({ file: f, ...metrics(r.getChannelData(0)) });
    } catch (e) {
      out.push({ file: f, error: String(e) });
    }
  }
  return out;
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${opt('port', '5190')}/assets/audio/index.json`, { waitUntil: 'load' });
  const rows = await page.evaluate(analyse, { files, rate: +opt('rate', 1), lp: +opt('lp', 0), cue: opt('cue', '') });
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('file', 34)}${pad('ms', 6)}${pad('peak', 7)}${pad('rms', 7)}${pad('centroid', 9)}${pad('<500/-2k/-5k/>5k %', 20)}flat`);
  for (const r of rows) {
    if (r.error) { console.log(pad(r.file, 34), 'ERROR', r.error); continue; }
    console.log(`${pad(r.file, 34)}${pad(r.ms, 6)}${pad(r.peak, 7)}${pad(r.rms, 7)}${pad(r.centroid, 9)}${pad(r.bands.join('/'), 20)}${r.flat}`);
  }
} finally {
  await browser.close();
}
