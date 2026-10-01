// The day going round by itself (planned after playtest round 2, 2026-09-29):
// a ten-minute loop, a long day that slows through golden hour and the evening, a short
// night, then dawn back to morning (world.js DAWN). The game runs it once a room's
// repairs are done (ui/timeflow.js; before that the time follows the work) and the room viewer
// has it on a button (proto.js).
//   LOOP: [from t, to t, share of the loop] — morning → afternoon 2 min · → golden 2 ·
//   → dusk 2 · → evening 1 · → night 1.5 · dawn 1.5
// Cost (measured, tools/daycycle.mjs): the sun, sky and exposure follow every `light` s
// with no GI; the bounce light is redone one soft sweep every `gi` s (a full pass per step
// kept the probes busy in every frame); a lamp or the fire switching as the time passes
// its hour (world.js) redoes it in full. Reflections are re-captured every 4 s meanwhile.
import { DAWN } from './world.js';

export const LOOP = [[0, 0.35, 0.2], [0.35, 0.62, 0.2], [0.62, 0.8, 0.2], [0.8, 0.88, 0.1], [0.88, 1, 0.15], [1, 1 + DAWN, 0.15]];

// the time of day at a point of the loop (0..1), and back
export function tAt(phase) {
  let p = phase;
  for (const [a, b, share] of LOOP) {
    if (p <= share) return a + (b - a) * (p / share);
    p -= share;
  }
  return 0;
}
export function phaseAt(t) {
  let p = 0;
  for (const [a, b, share] of LOOP) {
    if (t <= b) return p + share * Math.max(0, (t - a) / (b - a));
    p += share;
  }
  return 0;
}

export function createDayCycle(world, { length = 600, light = 0.1, gi = 2, sweeps = 1 } = {}) {
  let on = false;
  let phase = 0;
  let acc = 0;
  let giAcc = 0;
  return {
    get on() { return on; },
    get length() { return length; },
    set length(s) { length = s; },
    // from the time of day it is now
    start() {
      if (on) return;
      on = true;
      phase = phaseAt(world.time);
      acc = light;
      giAcc = gi;
      world.setEnvRefresh(4);
    },
    stop() {
      if (!on) return;
      on = false;
      world.setEnvRefresh(0);
    },
    // true when the time moved this frame
    update(dt) {
      if (!on) return false;
      phase = (phase + dt / length) % 1;
      giAcc -= dt;
      const giNow = giAcc <= 0;
      if (giNow) giAcc = gi;
      acc -= dt;
      if (acc > 0 && !giNow) return false;
      acc = light;
      world.applyTime(tAt(phase), { fromUser: true, sweeps: giNow ? sweeps : 0 });
      return true;
    },
  };
}
