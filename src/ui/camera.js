import * as THREE from 'three';
import { CAMS } from '../world.js';

// The camera between the screens: WASD walking it across the room, the slow drift
// behind the menu, the flights in and out of play. Two setups, because main.js sets
// input.js up between them: the frame hooks run in the order they are added, and the
// walk moves the camera before the pointer's hover is read, the flight after.

// WASD / the arrow keys walk the camera across the room: along the way it faces, level
// with the floor, as fast as it is far (playtest 2026-09-30) — in play and in photo mode;
// the point it looks at stays over the room
export function setupWalk(app) {
  const { world, camera, controls } = app;
  const MOVE_KEYS = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
  const moveHeld = new Set();
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!MOVE_KEYS[k] || e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
    moveHeld.add(k);
  });
  window.addEventListener('keyup', (e) => moveHeld.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => moveHeld.clear());
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const step = new THREE.Vector3();
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  world.onFrame((dt) => {
    if (!moveHeld.size || !(app.playing() || (app.state === 'photo' && !app.modal)) || !controls.enabled) return;
    let mx = 0;
    let mz = 0;
    for (const k of moveHeld) {
      mx += MOVE_KEYS[k][0];
      mz += MOVE_KEYS[k][1];
    }
    camera.getWorldDirection(fwd).setY(0);
    if ((!mx && !mz) || fwd.lengthSq() < 1e-6) return;
    fwd.normalize();
    side.crossVectors(fwd, camera.up).normalize();
    step.copy(fwd).multiplyScalar(mz).addScaledVector(side, mx).normalize()
      .multiplyScalar(0.22 * camera.position.distanceTo(controls.target) * dt);
    const B = world.bounds;
    const tg = controls.target;
    step.x = clamp(tg.x + step.x, B.X0 - 1, B.X1 + 1) - tg.x;
    step.z = clamp(tg.z + step.z, B.Z0 - 1, B.Z1 + 1) - tg.z;
    tg.add(step);
    camera.position.add(step);
  });
}

// ---- camera: slow drift behind the menu, flights in and out of play ---------------------
export function setupCamera(app) {
  const { world, camera, controls, R } = app;
  const V = (a) => new THREE.Vector3(...a);
  const pose = (c) => ({ pos: V(c.pos), look: V(c.look), fov: c.fov });
  const HERO = pose((R?.cams ?? CAMS).hero);
  const MENU_SHIFT = 0.17; // room slides right so the menu column has the left side

  function menuPose(time) {
    // the hero framing, swung gently around the room (a touch further out: the
    // sideways shift would otherwise crop the right-hand wall)
    const a = 0.18 * Math.sin(time * 0.05) - 0.05;
    const off = HERO.pos.clone().sub(HERO.look).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).multiplyScalar(1.06);
    return { pos: HERO.look.clone().add(off), look: HERO.look.clone(), fov: HERO.fov };
  }

  function flyTo(to, { dur = 1.4, shift = 0 } = {}) {
    return new Promise((done) => {
      app.fly = {
        from: { pos: camera.position.clone(), look: controls.target.clone(), fov: camera.fov },
        to, t: 0, dur, shift0: app.viewShift, shift1: shift, done,
      };
    });
  }

  let clock = 0;
  world.onFrame((dt) => {
    clock += dt;
    const { fly } = app;
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.dur);
      const k = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
      const to = typeof fly.to === 'function' ? fly.to(clock) : fly.to;
      camera.position.lerpVectors(fly.from.pos, to.pos, k);
      controls.target.lerpVectors(fly.from.look, to.look, k);
      camera.fov = world.fitFov(THREE.MathUtils.lerp(fly.from.fov, to.fov, k));
      camera.updateProjectionMatrix();
      app.viewShift = THREE.MathUtils.lerp(fly.shift0, fly.shift1, k);
      world.setViewShift(app.viewShift);
      camera.lookAt(controls.target);
      if (fly.t >= 1) {
        const d = fly.done;
        app.fly = null;
        d();
      }
    } else if (app.state === 'menu' || app.state === 'levels' || app.state === 'album') {
      const p = menuPose(clock);
      camera.position.copy(p.pos);
      controls.target.copy(p.look);
      camera.lookAt(p.look);
      world.setViewShift(app.viewShift);
    }
  });

  return { pose, HERO, MENU_SHIFT, menuPose, flyTo };
}
