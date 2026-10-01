import * as THREE from 'three';

// What the player did in a level, kept small enough to go in the save: the timelapse
// (replay.js) plays it back through the level's own tools. Recorded at the level of
// the systems — where a tool touched the wall, the glass, the floor — not the pointer,
// so it plays back from any camera.
//
// entries: [t, kind, ...] with t = seconds of play when it began
//   ['pry'|'lay', [x, z, …]]                        a floor stroke (metres)
//   ['wipe'|'scrub', item, [px, py, x, y, z, …]]    a stroke on a window pane (item = its
//                                                   index) or the soot (0): mask pixels + world
//   ['paint', face, color, [px, py, x, y, z, …]]    a roller stroke on one face of the walls
//   ['bin', [i, …]]                                 litter gathered into a ball and binned
//   ['fire', on] · ['lamp', name, on]
//   ['move', { id: [x, y, z, ry, stored] }]         furniture that moved (out of a box too)
//   a level's own tools record their strokes the same way under their own kind
//   (surface(kind) → ['<kind>', item, (color,) [px, py, x, y, z, …]]), and one-off events
//   with mark(kind, …) — replay.js hands kinds it doesn't know to the level (def.replay)
// A save from before the journal (or a room set up by a flag) is `partial`: no timelapse.

const R2 = (v) => Math.round(v * 100) / 100;
const R1 = (v) => Math.round(v * 10) / 10;
const MAX_NUMBERS = 150000; // ~1 MB of JSON: past it strokes stop being kept (the rest still is)

export function createJournal({ decor, room, fixtures }) {
  let entries = [];
  let clock = 0;
  let size = 0;
  let partial = false;
  let on = false;
  let stroke = null; // the stroke being drawn: its entry + the last point kept
  let pollT = 0;
  let lastLayout = null;
  let lastFire = null;
  let lastLamps = null;

  const skip = (id) => id === 'bin' || id.startsWith('box:');
  function layout() {
    const s = decor.snapshot();
    for (const id of Object.keys(s)) if (skip(id)) delete s[id];
    return s;
  }
  // what's there now is the baseline: changes made while not recording aren't the player's
  function rebase() {
    lastLayout = layout();
    lastFire = room.fireOn ?? null;
    lastLamps = fixtures.lamps.map((l) => (l.target > 0.5 ? 1 : 0));
  }
  function push(e) {
    entries.push([R1(clock), ...e]);
  }

  function poll() {
    const now = layout();
    const moved = {};
    for (const [id, p] of Object.entries(now)) {
      const q = lastLayout?.[id];
      if (!q || p.some((v, k) => Math.abs(v - q[k]) > 1e-3)) moved[id] = p.map((v, k) => (k === 4 ? v : Math.round(v * 1000) / 1000));
    }
    if (Object.keys(moved).length) push(['move', moved]);
    lastLayout = now;
    const fire = room.fireOn ?? null;
    if (fire !== lastFire && fire !== null) push(['fire', fire ? 1 : 0]);
    lastFire = fire;
    fixtures.lamps.forEach((l, i) => {
      const v = l.target > 0.5 ? 1 : 0;
      if (v !== lastLamps[i]) push(['lamp', l.name, v]);
      lastLamps[i] = v;
    });
  }

  // a tool's stroke: begin → points → end. `spacing`: metres between kept points
  function recorder(kind, { spacing, floor = false, itemOf = () => 0, colorOf = null }) {
    return {
      kind,
      down() { if (on) stroke = null; },
      // surface tools: point(h) with h = { item, px, py, point } · floor tools: point(x, z)
      point(a, b) {
        if (!on || size > MAX_NUMBERS) return;
        const p = floor ? new THREE.Vector3(a, 0, b) : a.point;
        const item = floor ? null : itemOf(a.item);
        if (!stroke || stroke.item !== item) {
          // a new stroke (or the roller crossed onto another face: its own stroke)
          const pts = [];
          const e = floor ? [kind, pts] : colorOf ? [kind, item, colorOf(), pts] : [kind, item, pts];
          push(e);
          stroke = { pts, item, last: null, pending: null };
        }
        const add = () => {
          if (floor) stroke.pts.push(R2(a), R2(b));
          else stroke.pts.push(R1(a.px), R1(a.py), R2(p.x), R2(p.y), R2(p.z));
          size += floor ? 2 : 5;
          stroke.last = p.clone();
          stroke.pending = null;
        };
        if (!stroke.last || stroke.last.distanceTo(p) >= spacing) add();
        else stroke.pending = add; // the end of a stroke is kept even when it's close
      },
      up() {
        stroke?.pending?.();
        stroke = null;
      },
    };
  }

  return {
    get on() { return on; },
    // main.js: recording only while the player is really playing
    set on(v) {
      if (v === on) return;
      on = v;
      if (v) rebase();
      else stroke = null;
    },
    get entries() { return entries; },
    get partial() { return partial; },
    // something to watch: a whole history from the run-down room
    get playable() { return !partial && entries.length > 0; },
    floor: (kind) => recorder(kind, { spacing: 0.08, floor: true }),
    surface: (kind, opts) => recorder(kind, { spacing: 0.03, ...opts }),
    binned(ids) {
      if (on && ids.length) push(['bin', ids]);
    },
    mark(kind, ...data) {
      if (on) push([kind, ...data]);
    },
    update(dt) {
      if (!on) return;
      clock += dt;
      pollT -= dt;
      if (pollT > 0) return;
      pollT = 0.4;
      poll();
    },
    // the moment the level changes phase by itself (boxes delivered / put away): what the
    // player did up to here is kept, what the level does next is not theirs
    rebase() {
      if (!on) return;
      poll();
      rebase();
    },
    // a brand-new room: an empty history · a room with no history (flags, finished) : partial
    clear({ partial: p = false } = {}) {
      entries = [];
      clock = 0;
      size = 0;
      partial = p;
      stroke = null;
      if (on) rebase();
    },
    serialize() {
      return { v: 1, t: R1(clock), partial, e: entries };
    },
    restore(s) {
      entries = s?.e ?? [];
      clock = s?.t ?? 0;
      partial = !s || !!s.partial;
      size = entries.reduce((n, e) => n + (Array.isArray(e[e.length - 1]) ? e[e.length - 1].length : 1), 0);
      stroke = null;
      if (on) rebase();
    },
  };
}
