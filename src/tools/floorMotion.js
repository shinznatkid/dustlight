import * as THREE from 'three';

// Floor tools that keep working while the button is held (playtest 2026-09-30: the castle's broom
// just hovered while held — it should sweep; then "every floor tool too"). Held down, the tool's
// head goes over the floor by itself round the pointer, works the floor where it passes, throws
// up what comes off (none off a clean floor) and its rubbing sound swells and drops with each
// stroke. The pointer's path still works a band as before (the tool's own `work`), so dragging
// is as quick as ever; the motion is what the tool does between.
//
// The motion is the tool's own:
//   sweep — a stroke along the floor one way, lifted back for the next (a broom) · strokes go
//           the way you drag across the screen
//   wipe  — back and forth along the floor, both ways working (a mop)
//   orbit — small quick circles (a sander's pad, a sponge scrubbing)
//
// The model (local +z up, as surfaceTool places it) is turned so its local −y faces the camera
// (a mop's handle comes towards you; the besom's pole leans away) — the motion reads across the
// screen. `slide`: the parts that go with the
// head over the floor · `swing`: the parts that pivot at the hand (the top of the handle) to
// follow the head (a broom: the whole thing; a mop: its handle). `pose(s)` adds a tool's own
// touches each frame (twigs bending, a motor buzzing).
//
//   floorMotion(world, tool, { model, hand, swing, slide, pattern, reach, rate, dirt, footR,
//     strength, rub, rubKind, puff, puffEvery, pose, refSpeed })
//   puff(at, way, left, fast): what comes off — `left` = dirt under the head before it went
//     (0..1), `way` = the way the head is going (+ up), `fast` = 0..1

const STROKE = 0.42; // sweep: the stroke's share of each cycle (the rest: lifted back)
const ease = (s) => s * s * (3 - 2 * s);

export function floorMotion(world, tool, {
  model, hand = null, swing = [], slide = [], pattern = 'wipe', reach = 0.15, rate = 1.5,
  dirt, footR = 0.15, strength = 4, rub = () => {}, rubKind = 'scrub', puff = null, puffEvery = 0.07,
  pose = null, refSpeed = null,
}) {
  // model → yaw → { swing pivot at the hand → swing parts, slide → slide parts, the rest }
  const yaw = new THREE.Group();
  for (const o of [...model.children]) yaw.add(o);
  model.add(yaw);
  const pivot = new THREE.Group();
  const slider = new THREE.Group();
  yaw.add(pivot, slider);
  const H = hand ?? new THREE.Vector3();
  pivot.position.copy(H);
  for (const o of swing) {
    o.position.sub(H);
    pivot.add(o);
  }
  for (const o of slide) slider.add(o);
  const rest = new THREE.Vector3().sub(H); // the hand to the head at rest (the model's origin)
  const ref = refSpeed ?? (pattern === 'sweep' ? reach * 10 : pattern === 'wipe' ? 2 * Math.PI * reach * rate : 2 * Math.PI * reach * rate);

  const up = new THREE.Vector3(0, 1, 0);
  const across = new THREE.Vector3();
  const lastAt = new THREE.Vector3();
  const moved = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const prev = new THREE.Vector3();
  let amp = 0; // 0 at rest … 1 working
  let u = pattern === 'sweep' ? 0.2 : 0;
  let dir = 1;
  let drag = 0; // the pointer's speed across the screen (m/s, smoothed; + = right)
  let hadAt = false;
  let puffT = 0;
  let loud = 0;
  let rubbing = false;
  let swept = false;
  let giT = 0;

  // the head's offset (yaw frame: x across the screen, y away from the camera, z lift) at `u`
  function path(out) {
    let lift = 0;
    if (pattern === 'sweep') {
      if (u < STROKE) out.set(dir * reach * (2 * ease(u / STROKE) - 1), 0, 0);
      else {
        const s = ease((u - STROKE) / (1 - STROKE));
        out.set(dir * reach * (1 - 2 * s), 0, 0);
        lift = 0.045 * Math.sin(Math.PI * s);
      }
    } else if (pattern === 'wipe') {
      const a = u * Math.PI * 2;
      out.set(reach * Math.sin(a), reach * 0.18 * Math.sin(2 * a), 0);
    } else {
      const a = u * Math.PI * 2;
      out.set(reach * Math.cos(a), reach * 0.8 * Math.sin(a), 0);
    }
    out.multiplyScalar(amp);
    out.z = lift * amp;
    return out;
  }

  world.onFrame((dt) => {
    if (!dt) return;
    const down = tool.busy && !!tool.over;
    // local −y towards the camera
    const cam = world.camera.position;
    yaw.rotation.z = Math.atan2(cam.x - model.position.x, cam.z - model.position.z);
    across.set(Math.cos(yaw.rotation.z), 0, -Math.sin(yaw.rotation.z));
    if (down) {
      if (hadAt) drag += (moved.subVectors(model.position, lastAt).dot(across) / dt - drag) * Math.min(1, dt * 8);
      lastAt.copy(model.position);
      hadAt = true;
    } else {
      hadAt = false;
      drag = 0;
    }
    amp += ((down ? 1 : 0) - amp) * Math.min(1, dt * (down ? 9 : 6));
    prev.copy(foot);
    if (down) {
      const was = u;
      u += dt * rate * (pattern === 'sweep' ? 1 + Math.min(1, Math.abs(drag) / 1.5) * 0.4 : 1);
      if (pattern === 'sweep') {
        // at the end of a stroke the head is out on the side it swept to: a turn of direction
        // starts the next stroke from there, with no lift back
        const want = Math.abs(drag) > 0.25 ? Math.sign(drag) : dir;
        if (was < STROKE && u >= STROKE && want !== dir) {
          dir = want;
          u = 0;
        }
      }
      u %= 1;
    }
    path(foot);
    vel.subVectors(foot, prev).divideScalar(dt);
    const speed = Math.hypot(vel.x, vel.y);
    // the head goes to its spot; the handle swings round the hand to follow it
    slider.position.set(foot.x, foot.y, foot.z);
    if (swing.length) {
      aim.subVectors(foot, H).normalize();
      pivot.quaternion.setFromUnitVectors(tip.copy(rest).normalize(), aim);
    }
    pose?.({ amp, vx: vel.x, vy: vel.y, speed, lift: foot.z, dt, down });

    puffT -= dt;
    let lv = 0;
    if (down && amp > 0.3) {
      const fast = Math.min(1, speed / ref);
      const onFloor = foot.z < 0.012;
      if (onFloor && fast > 0.05) {
        model.updateMatrixWorld(true);
        yaw.localToWorld(tip.set(foot.x, foot.y, 0));
        const p = dirt.pixelOf(tip);
        const left = puff && puffT <= 0 ? dirt.alpha(p.px, p.py) : 0;
        dirt.wipe(p.px, p.py, footR * dirt.px, Math.min(0.5, dt * strength * fast));
        swept = true;
        if (left > 0.05 && fast > 0.35) {
          puffT = puffEvery;
          // the way the head is going, in the world (+ a little up)
          const way = yaw.localToWorld(new THREE.Vector3(vel.x, vel.y, 0).normalize()).sub(yaw.localToWorld(new THREE.Vector3()));
          way.multiplyScalar(0.9).addScaledVector(up, 0.55).normalize();
          puff(tip.clone().addScaledVector(up, 0.04), way, left, fast);
        }
      }
      // the sound: loud while the head goes over the floor, hushed as it comes back
      lv = onFloor ? 0.2 + 0.8 * fast : 0.12;
    }
    // (the floor's colour feeds the bounce light: now and then while working, and once at the end)
    giT -= dt;
    if (swept && (giT <= 0 || !down)) {
      swept = false;
      giT = 1.5;
      world.lightingChanged();
    }
    loud += (lv - loud) * Math.min(1, dt * 18);
    const out = loud > 0.03 ? loud : 0;
    if (out || rubbing) rub(rubKind, out);
    rubbing = out > 0;
  });
  return { yaw, pivot, slider };
}
