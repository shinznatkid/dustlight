// Mixer: music / ambience / sfx buses under one master. Sound files are listed
// in assets/audio/index.json (written by tools/fetch_audio.py):
//   { music: { id: file }, ambience: { id: file }, sfx: { id: file | [variants] } }
// Anything missing — the index, a file, or audio altogether — plays as silence.
//
// Music and ambience stream through <audio> elements (decoding a 3-minute track
// into a buffer costs ~60 MB); short SFX are decoded once and cached.

const BASE = 'assets/audio/';

// Layered cues: a few short samples at once, each with its own pitch spread, gain,
// delay and low-pass — for sounds no single file makes soft enough. Played through
// sfx(id) like any other effect. The crowbar's pry was a door creak (playtest round
// 2: "เอี๊ยดอ๊าด", energy up in 2–5 kHz); it is now a muffled wooden knock with a dry
// crackle of fibres under it, all below ~2 kHz (tools/soundcheck.mjs --cue=pry).
//   layer: { id (sfx id, variants picked at random), gain, rate: [lo, hi],
//            lp: low-pass Hz, at: [lo, hi] seconds after the cue }
//   gap: at most one play per this many seconds (a sweep lifts boards in bursts)
// A layer's id may be the cue's own (its files, not the cue): the shutter is its file, softened.
// The plank / bin / box / shutter cues were picked on the sound board (sounds.html,
// 2026-09-30); a call's rate (sfx(id, { rate })) speeds the whole cue up.
export const CUES = {
  pry: {
    gap: 0.07,
    layers: [
      { id: 'pry_knock', gain: 0.9, rate: [0.85, 1.0], lp: 2600 },
      { id: 'pry_crackle', gain: 0.32, rate: [0.75, 0.9], lp: 1800, at: [0.01, 0.04] },
    ],
  },
  // a plank going down: the old thump (all under 500 Hz: "เบาไม่ฟิน"), a wooden tok on top and a
  // small click as it locks into place
  plank: {
    layers: [
      { id: 'plank', gain: 0.8, rate: [0.95, 1.05] },
      { id: 'book_place', gain: 0.9, rate: [0.95, 1.1], lp: 3000 },
      { id: 'tick', gain: 0.35, rate: [0.9, 1.1], lp: 4000, at: [0.05, 0.07] },
    ],
  },
  // litter into the bin: a crinkle and a soft thump
  bin: {
    layers: [
      { id: 'crinkle', gain: 1, lp: 3500 },
      { id: 'thump_soft', gain: 0.45, at: [0.03, 0.05] },
    ],
  },
  // the next thing out of a box (and a box folding, faster): a flap of card, a soft thump, cloth
  box_open: {
    layers: [
      { id: 'box_crackle', gain: 0.7, rate: [0.8, 0.9], lp: 2400 },
      { id: 'thump_soft', gain: 0.45, at: [0.03, 0.05] },
      { id: 'cloth_soft', gain: 0.5 },
    ],
  },
  // the camera: the old shutter without its sharp top
  shutter: { layers: [{ id: 'shutter', lp: 3500 }] },
};
// One-shots made here from oscillators and noise, for sounds no file has — played through sfx(id)
// like any other effect: fn(context, destination, start time, gain).
//   fanfare — the room finished: a warm Cmaj9 swelling in under a breath of air and a few high
//             sparkles, then fading (~2.5 s) · picked on the sound board (sounds.html,
//             2026-09-30: none of the jingles — they read "level complete", not cozy)
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI note → Hz
function filt(c, type, f, q = 0.7) {
  const n = c.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}
const whites = new WeakMap(); // a second of white noise per context
function white(c) {
  if (!whites.has(c)) {
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    whites.set(c, b);
  }
  return whites.get(c);
}
// a struck, bell-like note: a few sine partials, each dying away at its own pace
function tine(c, dest, t, f, g, { decay = 0.7, partials = [[1, 1, 1], [2, 0.22, 0.45], [3, 0.07, 0.25], [5.4, 0.035, 0.08]] } = {}) {
  for (const [mul, amp, dk] of partials) {
    const o = c.createOscillator();
    o.frequency.value = f * mul;
    const e = c.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g * amp, t + 0.004);
    e.gain.setTargetAtTime(0, t + 0.004, decay * dk);
    o.connect(e).connect(dest);
    o.start(t);
    o.stop(t + 0.1 + decay * dk * 7);
  }
}
export const SYNTHS = {
  fanfare(c, dest, t, g) {
    const pad = c.createGain();
    pad.gain.setValueAtTime(0, t);
    pad.gain.linearRampToValueAtTime(0.055 * g, t + 0.45);
    pad.gain.setTargetAtTime(0, t + 1.1, 0.6);
    const lp = filt(c, 'lowpass', 700, 0.6);
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1800, t + 0.6);
    pad.connect(lp).connect(dest);
    for (const n of [60, 64, 67, 71, 74]) { // Cmaj9, each note two slightly detuned triangles
      for (const det of [-5, 5]) {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = NOTE(n);
        o.detune.value = det;
        o.connect(pad);
        o.start(t);
        o.stop(t + 4.5);
      }
    }
    // a soft breath of air rising under it
    const src = c.createBufferSource();
    src.buffer = white(c);
    src.loop = true;
    const bp = filt(c, 'bandpass', 500, 0.9);
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.9);
    const ag = c.createGain();
    ag.gain.setValueAtTime(0, t);
    ag.gain.linearRampToValueAtTime(0.05 * g, t + 0.35);
    ag.gain.setTargetAtTime(0, t + 0.6, 0.25);
    src.connect(bp).connect(ag).connect(dest);
    src.start(t);
    src.stop(t + 2.5);
    // sparkles: high pentatonic pings scattered over the swell
    [[84, 0.3], [88, 0.46], [91, 0.6], [86, 0.78], [93, 0.95], [96, 1.15]].forEach(([n, at]) => tine(c, dest, t + at, NOTE(n), 0.07 * g, { decay: 0.35, partials: [[1, 1, 1], [2.76, 0.12, 0.3]] }));
  },
};

const pickOne = (f) => (Array.isArray(f) ? f[Math.floor(Math.random() * f.length)] : f);
const within = (r, d = 0) => (Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : r ?? d);

// the files one play of a cue will use (variants chosen now)
function cueFiles(cue, sfxIndex) {
  return cue.layers.map((L) => pickOne(sfxIndex[L.id]) ?? null);
}
// schedule a cue on any context (the live one, or an offline one for measuring)
function scheduleCue(c, dest, cue, bufs, gain = 1, rate = 1) {
  const t0 = c.currentTime + 0.005;
  cue.layers.forEach((L, i) => {
    const buf = bufs[i];
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = within(L.rate, 1) * rate;
    let node = src;
    if (L.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = L.lp;
      f.Q.value = 0.5;
      node = node.connect(f);
    }
    const g = c.createGain();
    g.gain.value = (L.gain ?? 1) * gain;
    node.connect(g).connect(dest);
    src.start(t0 + within(L.at));
  });
}

// one play of a cue rendered offline (tools/soundcheck.mjs), or null without the files
export async function renderCue(name, sampleRate = 48000, base = BASE) {
  const cue = CUES[name];
  const index = await fetch(`${base}index.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!cue || !index) return null;
  const c = new OfflineAudioContext(1, sampleRate * 2, sampleRate);
  const bufs = await Promise.all(cueFiles(cue, index.sfx).map((f) => (f
    ? fetch(base + f).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).catch(() => null)
    : null)));
  scheduleCue(c, c.destination, cue, bufs);
  return c.startRendering();
}

export function createAudio() {
  let ctx = null;
  let master = null;
  const buses = {};
  const vol = { music: 0.7, ambience: 0.6, sfx: 0.8 };
  let index = { music: {}, ambience: {}, sfx: {} };
  const buffers = new Map();
  const loops = { music: null, ambience: new Map() };
  let playlist = null;
  let tone = null;  // low-pass on the music: muffled in a run-down room, clear when it's done
  let toneQ = 1;

  const ready = fetch(`${BASE}index.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) index = { music: {}, ambience: {}, sfx: {}, ...j }; })
    .catch(() => {});

  // browsers keep audio suspended until a real click / key press
  function unlock() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return;
      }
      master = ctx.createGain();
      master.connect(ctx.destination);
      for (const b of ['music', 'ambience', 'sfx']) {
        buses[b] = ctx.createGain();
        buses[b].gain.value = vol[b];
        buses[b].connect(master);
      }
      tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.Q.value = 0.4;
      tone.frequency.value = toneHz(toneQ);
      buses.music.disconnect();
      buses.music.connect(tone).connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (warm.size) preload([]);
    if (pending) {
      const p = pending;
      pending = null;
      p();
    }
  }
  let pending = null; // music asked for before unlock starts right after it

  // 0 → ~500 Hz (behind a wall), 1 → 20 kHz (open); exponential, as the ear hears it
  const toneHz = (q) => 500 * 40 ** Math.max(0, Math.min(1, q));
  function setTone(q) {
    toneQ = q;
    if (tone) tone.frequency.setTargetAtTime(toneHz(q), ctx.currentTime, 1.5);
  }

  function setVolume(bus, v) {
    vol[bus] = v;
    if (buses[bus]) buses[bus].gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  // one streamed, looping-or-not element faded in on a bus (gain / lp: an ambience's mix)
  function stream(bus, file, { loop = true, fade = 1.5, gain = 1, lp = 0 } = {}) {
    const el = new Audio(BASE + file);
    el.loop = loop;
    el.crossOrigin = 'anonymous';
    let node = ctx.createMediaElementSource(el);
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      f.Q.value = 0.5;
      node = node.connect(f);
    }
    const g = ctx.createGain();
    g.gain.value = 0;
    node.connect(g).connect(buses[bus]);
    el.play().catch(() => {});
    g.gain.setTargetAtTime(gain, ctx.currentTime, fade / 3);
    return { el, g, gain };
  }
  function fadeOut(h, fade = 1.5) {
    if (!h) return;
    h.g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
    setTimeout(() => { h.el.pause(); h.el.src = ''; }, fade * 1000 + 200);
  }

  // play one track, or cycle through a list (crossfading when each ends)
  function music(ids, { fade = 2 } = {}) {
    const key = [ids].flat().join('|');
    if (playlist?.key === key) return; // already playing this
    const pl = { key, list: [], i: 0 };
    playlist = pl;
    ready.then(() => {
      if (playlist !== pl) return; // a newer call took over
      pl.list = [ids].flat().filter((id) => index.music[id]);
      pl.i = Math.floor(Math.random() * Math.max(1, pl.list.length));
      const start = () => {
        if (playlist !== pl) return;
        fadeOut(loops.music, fade);
        loops.music = null;
        const next = () => {
          if (playlist !== pl || !pl.list.length) return;
          const h = stream('music', index.music[pl.list[pl.i]], { loop: pl.list.length === 1, fade });
          h.el.addEventListener('ended', () => {
            pl.i = (pl.i + 1) % pl.list.length;
            if (loops.music === h) next();
          });
          loops.music = h;
        };
        next();
      };
      if (ctx) start();
      else pending = start;
    });
  }

  // set which ambience loops are running (others fade out). An entry is an id, or
  // { id, gain, lp } — a level's own mix (the neon alley's rain is a quiet file, and heard
  // through the glass: low-passed); a loop that stays glides to a new gain
  function ambience(ids) {
    const want = new Map([ids].flat().map((a) => (typeof a === 'string' ? [a, {}] : [a.id, a])));
    ready.then(() => {
      if (!ctx) return;
      for (const [id, h] of loops.ambience) {
        if (!want.has(id)) {
          fadeOut(h, 2.5);
          loops.ambience.delete(id);
        }
      }
      for (const [id, o] of want) {
        const h = loops.ambience.get(id);
        if (h) {
          if (h.gain !== (o.gain ?? 1)) {
            h.gain = o.gain ?? 1;
            h.g.gain.setTargetAtTime(h.gain, ctx.currentTime, 2.5 / 3);
          }
        } else if (index.ambience[id]) loops.ambience.set(id, stream('ambience', index.ambience[id], { fade: 2.5, gain: o.gain ?? 1, lp: o.lp ?? 0 }));
      }
    });
  }

  function buffer(file) {
    if (!buffers.has(file)) {
      buffers.set(file, fetch(BASE + file)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => null));
    }
    return buffers.get(file);
  }

  // a layered cue (CUES above, or a spec passed in to try one out from the console)
  const cueAt = new Map();
  function cue(spec, { gain = 1, rate = 1, key = spec } = {}) {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (spec.gap && now - (cueAt.get(key) ?? -1) < spec.gap) return;
    cueAt.set(key, now);
    Promise.all(cueFiles(spec, index.sfx).map((f) => (f ? buffer(f) : null)))
      .then((bufs) => scheduleCue(ctx, buses.sfx, spec, bufs, gain, rate));
  }

  // fire-and-forget effect; `vary` detunes each play a little so repeats don't sound canned
  function sfx(id, { gain = 1, rate = 1, vary = 0.05 } = {}) {
    if (!ctx) return;
    if (SYNTHS[id]) return SYNTHS[id](ctx, buses.sfx, ctx.currentTime + 0.01, gain);
    if (CUES[id]) return cue(CUES[id], { gain, rate, key: id });
    const f = index.sfx[id];
    if (!f) return;
    const file = Array.isArray(f) ? f[Math.floor(Math.random() * f.length)] : f;
    buffer(file).then((buf) => {
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(buses.sfx);
      src.start();
    });
  }

  // Rubbing sounds, made here from soft (pink) noise rather than files: the
  // squeegee's swish, the brush's scrub, the roller's squelch. A tool sets how hard
  // it's rubbing (0..1, from how fast the pointer moves) every frame and the level
  // glides — re-triggering short scratch samples, as before, stuttered and grated
  // (playtest 2026-09-29). f/q: the filter that gives each its colour · lfo: a
  // slow wobble of that filter (Hz, depth) · top: everything above is cut (no hiss).
  const RUB = {
    // the squeegee, the gilder, the neon tube, the glazier: a damp cloth, soft and low (picked
    // on the sound board, 2026-09-30 — was a brighter swish at 950 Hz)
    glass: { type: 'bandpass', f: 700, q: 0.6, lfo: [1.2, 120], top: 1800, gain: 0.36, body: { f: 300, q: 0.7, gain: 0.5 } },
    scrub: { type: 'bandpass', f: 1100, q: 0.7, lfo: [6, 260], top: 2300, gain: 0.34 },
    roll: { type: 'bandpass', f: 650, q: 0.9, lfo: [2.4, 200], top: 1800, gain: 0.3 },
    // the feather duster (playtest 2026-09-30: an ASMR brush): an airy, fluttering hush over a
    // soft, breathy body low down (body: a second band from the same noise) — softer and less
    // hiss than first made (picked on the sound board: top 7.5 → 5 kHz)
    feather: { type: 'bandpass', f: 2200, q: 0.5, lfo: [6, 700], top: 5000, gain: 0.27, body: { f: 400, q: 0.7, gain: 0.6 } },
    // a twig besom on stone (castle): a dry, twiggy "shh" — higher and brighter than the scrub
    // brush, a quick flutter for the twigs catching, a little body for the stroke; the broom
    // swells and drops it with each stroke
    sweep: { type: 'bandpass', f: 2300, q: 0.6, lfo: [13, 650], top: 6200, gain: 0.3, body: { f: 750, q: 0.8, gain: 0.4 } },
  };
  let noise = null;
  function noiseBuffer() {
    if (noise) return noise;
    const n = ctx.sampleRate * 3;
    noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noise.getChannelData(0);
    // pink-ish noise (Paul Kellet's economy filter): softer than white, less hiss
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    const fade = Math.floor(ctx.sampleRate * 0.05); // no click where the loop wraps
    for (let i = 0; i < fade; i++) d[n - fade + i] = d[n - fade + i] * (1 - i / fade) + d[i] * (i / fade);
    return noise;
  }
  const rubs = new Map();
  function rub(kind, level) {
    if (!ctx || ctx.state !== 'running' || !RUB[kind]) return;
    let r = rubs.get(kind);
    if (!r) {
      if (level <= 0) return;
      const spec = RUB[kind];
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer();
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = spec.type;
      f.frequency.value = spec.f;
      f.Q.value = spec.q;
      const top = ctx.createBiquadFilter();
      top.type = 'lowpass';
      top.frequency.value = spec.top;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(top).connect(g).connect(buses.sfx);
      if (spec.body) {
        const b = ctx.createBiquadFilter();
        b.type = 'bandpass';
        b.frequency.value = spec.body.f;
        b.Q.value = spec.body.q;
        const bg = ctx.createGain();
        bg.gain.value = spec.body.gain;
        src.connect(b).connect(bg).connect(g);
      }
      const lfo = ctx.createOscillator();
      lfo.frequency.value = spec.lfo[0];
      const depth = ctx.createGain();
      depth.gain.value = spec.lfo[1];
      lfo.connect(depth).connect(f.frequency);
      lfo.start();
      src.start(0, Math.random() * 3);
      r = { g, spec, level: 0 };
      rubs.set(kind, r);
    }
    const v = Math.max(0, Math.min(1, level));
    if (v === r.level) return;
    r.level = v;
    r.g.gain.setTargetAtTime(v * r.spec.gain, ctx.currentTime, v > 0 ? 0.05 : 0.14);
  }

  // warm the cache for effects that must play instantly (pick-up, drop, UI);
  // decoding needs the context, so ids asked for before unlock wait for it
  const warm = new Set();
  function preload(ids) {
    for (const id of ids) {
      warm.add(id);
      for (const L of CUES[id]?.layers ?? []) warm.add(L.id); // a cue warms its layers
    }
    ready.then(() => {
      if (!ctx) return;
      for (const id of warm) for (const f of [index.sfx[id]].flat()) if (f) buffer(f);
    });
  }

  // debug read-out (we can't hear in automated tests — check that things play)
  function status() {
    const m = loops.music;
    return {
      ctx: ctx?.state ?? 'none',
      music: m ? { src: m.el.src.split('/').pop(), t: +m.el.currentTime.toFixed(1), paused: m.el.paused } : null,
      ambience: [...loops.ambience].map(([id, h]) => ({ id, t: +h.el.currentTime.toFixed(1), paused: h.el.paused })),
      sfxCached: buffers.size,
      rubs: Object.fromEntries([...rubs].map(([k, r]) => [k, +r.level.toFixed(2)])),
    };
  }

  return {
    unlock, setVolume, setTone, music, ambience, sfx, cue, rub, preload, status,
    get index() { return index; },
    get unlocked() { return !!ctx && ctx.state === 'running'; },
  };
}
