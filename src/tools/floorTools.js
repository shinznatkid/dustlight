import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../gi.js';

// Floor tools: hold the left button and sweep. A ring on the floor shows the
// reach; a small model of the tool floats over it and jerks when it works.
//   crowbar — lifts old boards (floor.pry), they fly out of the room
//   planks  — lays new parquet cells (floor.lay) where no old board is left

function cursorKit(scene, camera, { radius, color, prop }) {
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const at = new THREE.Vector3();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.86, radius, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  ring.renderOrder = 2;
  const g = new THREE.Group();
  g.add(ring, prop);
  g.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
  g.visible = false;
  scene.add(g);
  let kick = 0;
  return {
    point(ndc) {
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(plane, at) ? at : null;
    },
    show(p) {
      g.visible = !!p;
      if (p) g.position.set(p.x, 0.006, p.z);
    },
    hide() { g.visible = false; },
    kick() { kick = 1; },
    update(dt, time) {
      kick = Math.max(0, kick - dt * 6);
      prop.position.y = 0.3 + Math.sin(time * 2.4) * 0.015 - kick * 0.12;
      prop.rotation.z = 0.5 + kick * 0.35;
    },
    set tint(c) { ring.material.color.set(c); },
  };
}

function crowbarModel() {
  const iron = new THREE.MeshStandardMaterial({ color: 0x7a2a22, metalness: 0.5, roughness: 0.45 });
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 10), iron);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 16, Math.PI * 1.1), iron);
  hook.position.set(0.045, 0.25, 0);
  const claw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.016, 0.03), iron);
  claw.position.set(0.02, -0.25, 0);
  claw.rotation.z = 0.5;
  g.add(shaft, hook, claw);
  for (const m of g.children) m.castShadow = true;
  return g;
}

function planksModel(mat) {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.018, 0.075), mat);
    b.position.set((k % 2) * 0.02, k * 0.02, (k - 1.5) * 0.004);
    b.rotation.y = (k % 2 ? 0.08 : -0.05);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

// shared stroke logic: work while held, refresh the bounce light now and then ·
// rec: the level's journal (journal.js) · tool.replay: the timelapse working it with
// recorded floor points instead of a pointer
function floorTool(world, floor, { id, hintKey, kit, work, onStrokeEnd, rec = null }) {
  let down = false;
  let giT = 0;
  let changed = false;
  let last = null;
  world.onFrame((dt, time) => {
    kit.update(dt, time);
    if (!down) return;
    giT -= dt;
    if (changed && giT <= 0) {
      giT = 1.5;
      changed = false;
      world.lightingChanged(); // the floor's colour feeds the bounce light
    }
  });
  function apply(ndc) {
    const p = kit.point(ndc);
    if (p && down) rec?.point(p.x, p.z);
    applyAt(p);
  }
  function applyAt(p) {
    kit.show(p);
    if (!p || !down) return;
    // sweep: also work the spots between two pointer events
    const from = last ?? p.clone();
    const steps = Math.max(1, Math.ceil(from.distanceTo(p) / 0.12));
    for (let s = 1; s <= steps; s++) {
      const q = from.clone().lerp(p, s / steps);
      if (work(q.x, q.z)) {
        changed = true;
        kit.kick();
      }
    }
    last = p.clone();
  }
  function up() {
    down = false;
    last = null;
    rec?.up();
    if (changed) world.lightingChanged();
    changed = false;
    onStrokeEnd?.();
  }
  return {
    id,
    hint: () => hintKey(),
    down(ndc) {
      down = true;
      last = null;
      giT = 1.5;
      rec?.down();
      apply(ndc);
    },
    move(ndc) { apply(ndc); },
    up,
    // p: a floor point { x, z }
    replay: {
      down(p) {
        down = true;
        last = null;
        giT = 1.5;
        applyAt(new THREE.Vector3(p.x, 0, p.z));
      },
      move(p) { applyAt(new THREE.Vector3(p.x, 0, p.z)); },
      up() {
        up();
        kit.hide();
      },
    },
    cursor: () => '',
    release() {
      down = false;
      kit.hide();
    },
    deselect() { kit.hide(); },
    get busy() { return down; },
  };
}

export function createCrowbar(world, floor, { sound, rec }) {
  const kit = cursorKit(world.scene, world.camera, { radius: 0.22, color: 0xf2b56b, prop: crowbarModel() });
  return floorTool(world, floor, {
    id: 'crowbar',
    kit,
    rec,
    hintKey: () => 'hint.crowbar',
    work: (x, z) => {
      const n = floor.pry(x, z, 0.22, 2);
      if (n) sound('pry', { gain: 0.55 });
      return n > 0;
    },
  });
}

export function createPlanks(world, floor, { sound, rec, plainMat }) {
  const kit = cursorKit(world.scene, world.camera, { radius: 0.32, color: 0x9fd07a, prop: planksModel(plainMat) });
  let blockedT = 0;
  let blockedHint = false;
  world.onFrame((dt) => { blockedT -= dt; if (blockedT < -1.5) blockedHint = false; });
  return floorTool(world, floor, {
    id: 'planks',
    kit,
    rec,
    hintKey: () => (blockedHint ? 'hint.planksBlocked' : 'hint.planks'),
    work: (x, z) => {
      const n = floor.lay(x, z, 0.32, 3);
      if (!n && floor.oldNear(x, z, 0.32) && blockedT <= 0) {
        // there's still old floor here: say so (not too often)
        blockedT = 0.8;
        blockedHint = true;
        sound('blocked', { gain: 0.4 });
      }
      return n > 0;
    },
  });
}
