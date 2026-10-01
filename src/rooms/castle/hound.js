import * as THREE from 'three';

// The sleeping hound's idle (playtest 2026-09-30): slow breathing, now and then a couple of
// tail thumps, an ear twitch, and once in a while a sleepy lift of the head. Everything moves
// inside the hound's own group (props.js hound(): the parts are in userData.parts), so it keeps
// going wherever the player puts it down, and picking it up / placing it (decorate.js) sees
// the same object as ever.
//
// Cheap on purpose: a handful of transforms a frame, no new materials, and no shadow-map
// redraws — breathing only ever swells the body from the pose the shadow maps were drawn in
// (never sinks under it, so no self-shadow creeping over the fur), and the rest is too small
// to see in a shadow; whatever redraws the shadows anyway (the sun moving, furniture moving)
// catches the pose of that moment.
//
// Deterministic from the clock (events come from a hash of their time slot), so it needs no
// state; userData.pose = { breath, tail, ear, head } (0..1 each) pins a pose for screenshots.
//
//   rigHound(obj) → tick(dt, time)

const BREATH_T = 3.8; // seconds a breath
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// an event every `slot` seconds (with probability `p`, somewhere in its slot) lasting `dur`:
// its progress 0..1 at time t, or -1 between events
function event(t, slot, dur, seed, p) {
  const k = Math.floor(t / slot);
  if (k < 1 || hash(k * 7.13 + seed) > p) return -1; // (nothing in the first slot: the room is still loading)
  const start = k * slot + hash(k * 3.71 + seed * 1.9 + 0.5) * (slot - dur);
  const u = (t - start) / dur;
  return u >= 0 && u <= 1 ? u : -1;
}
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

// move `parts` into a new pivot at `at` (the parent's frame), keeping them where they are
function pivot(parent, at, parts) {
  const p = new THREE.Group();
  p.position.copy(at);
  parent.add(p);
  for (const o of parts) {
    o.position.sub(at);
    p.add(o);
  }
  return p;
}

export function rigHound(obj) {
  const P = obj.userData.parts;
  if (!P) return () => {};
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // the head swings up from the neck, taking the muzzle, the ears and the closed eyes with it
  const headAt = V(0.2, 0.13, 0.1);
  const head = pivot(obj, headAt, [P.head, ...P.face, ...P.ears, ...P.eyes]);
  // each ear hangs from a point near the top of the head
  const ears = P.ears.map((ear, i) => {
    const s = i === 0 ? -1 : 1;
    const at = V(0.26, 0.19, 0.1 + s * 0.05).sub(headAt);
    return { p: pivot(head, at, [ear]), s };
  });
  // the tail curls round the rump: it swishes about the curl's centre and lifts a little
  const tail = pivot(obj, V(-0.08, 0.05, 0.02), [P.tail, P.tip]);
  const tailAxis = V(-0.58, 0, -0.815).normalize(); // from the curl's centre to where it leaves the body
  const q = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const Y = V(0, 1, 0);
  const body = [P.body, P.chest];
  const rest = body.map((b) => b.scale.clone());
  Object.defineProperty(obj.userData, 'houndRig', { value: { head, ears, tail } }); // (for tests / screenshots)

  return function tick(dt, time) {
    const pin = obj.userData.pose;
    const t = obj.userData.dogT ?? time;
    // breathing: a quicker breath in, a long slow breath out
    let b;
    if (pin) b = pin.breath ?? 0;
    else {
      const f = (t / BREATH_T) % 1;
      b = f < 0.38 ? smooth(0, 0.38, f) : 1 - smooth(0.38, 1, f);
    }
    body.forEach((m, i) => m.scale.set(rest[i].x * (1 + 0.02 * b), rest[i].y * (1 + 0.085 * b), rest[i].z * (1 + 0.05 * b)));
    // the head: rides the breath a touch; a rare sleepy lift (up, a look, back down)
    let lift;
    if (pin) lift = pin.head ?? 0;
    else {
      const u = event(t, 26, 4.2, 3, 0.65);
      lift = u < 0 ? 0 : smooth(0, 0.2, u) * (1 - smooth(0.62, 1, u));
    }
    head.position.y = headAt.y + b * 0.004;
    head.rotation.z = lift * 0.3;
    head.rotation.x = lift * 0.08 * Math.sin(t * 2.1); // (a slow sleepy sway while it's up)
    // an ear twitch: one quick flick, sometimes two
    let ew = 0;
    let which = 1;
    if (pin) {
      ew = pin.ear ?? 0;
    } else {
      const u = event(t, 6.5, 0.55, 11, 0.7);
      if (u >= 0) {
        const k = Math.floor(t / 6.5);
        which = hash(k * 5.3 + 2) < 0.5 ? 0 : 1;
        const two = hash(k * 9.1 + 4) < 0.45;
        // a flick is half the event: the first half, or both halves (the second one smaller)
        const x = u * 2;
        ew = x < 1 ? Math.sin(Math.PI * x) : two ? Math.sin(Math.PI * (x - 1)) * 0.7 : 0;
      }
    }
    for (const [i, e] of ears.entries()) e.p.rotation.x = i === which ? -e.s * 0.4 * ew : 0;
    // the tail: two or three sleepy thumps (a swish along the curl, the tip lifting and dropping)
    let sw = 0;
    let up = 0;
    if (pin) {
      up = pin.tail ?? 0;
      sw = pin.swish ?? up * 0.7;
    } else {
      const u = event(t, 9, 1.6, 7, 0.75);
      if (u >= 0) {
        const n = hash(Math.floor(t / 9) * 2.9 + 6) < 0.5 ? 2 : 3;
        const x = u * n;
        const ph = x % 1;
        const env = Math.sin(Math.PI * u);
        up = Math.sin(Math.PI * ph) ** 2 * env;
        sw = Math.sin(Math.PI * 2 * ph) * env;
      }
    }
    qy.setFromAxisAngle(Y, sw * 0.3);
    q.setFromAxisAngle(tailAxis, up * 0.35);
    tail.quaternion.copy(qy).multiply(q);
  };
}
