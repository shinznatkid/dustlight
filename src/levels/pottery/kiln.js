import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { surfaceTool, mat, toMain } from '../../tools/surfaceTools.js';
import { MAT, paint } from '../../rooms/pottery/kit.js';

// The kiln's missing bricks (level 4): dark holes in its courses and a stack of new bricks
// by it on the floor. The trowel is swept over the kiln: every hole it passes gets the next
// brick off the stack, which hops across and sets in — once it lands, the hole and the brick
// go and the course is whole again (so the finished kiln is the prototype's, untouched).
// The kiln itself is the room's (shell.js: room.kiln — its object, radius, apothem): the
// holes are built in its frame. Courses: six rings of 8 facets (props.js kiln()), facet
// m = 0 is the door's, m counts round towards +x.
const COURSE = ['#c8633a', '#b9542f', '#d17447', '#bf5b33']; // (props.js kiln(): the courses' colours)
const courseY = (k) => 0.18 + k * 0.12;
const courseRot = (k) => (k % 2) * 0.05; // (the odd courses are turned a little)
// [facet, course] of each missing brick: the sides the usual camera sees, none on the door
const SLOTS = [[7, 1], [7, 2], [7, 4], [1, 0], [1, 2], [1, 3], [1, 5], [0, 5], [6, 3], [2, 1]];
const BRICK = { w: 0.3, h: 0.09, d: 0.07 };
const FLIGHT = 0.42;
const NEW = '#d8804f'; // a new brick on the stack (it takes its course's colour on the way up)

// a pointed trowel (local +z = away from the surface): a flat steel blade, a cranked handle
function trowelModel() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, 0.11);
  s.lineTo(0.065, -0.02);
  s.lineTo(0.045, -0.06);
  s.lineTo(-0.045, -0.06);
  s.lineTo(-0.065, -0.02);
  s.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false }), mat(0xb8bec2, { metalness: 0.7, roughness: 0.3 }));
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), mat(0x8c9296, { metalness: 0.7, roughness: 0.3 }));
  shank.rotation.x = Math.PI / 2;
  shank.position.set(0, -0.06, 0.04);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.13, 10), mat(0xc0703a, { roughness: 0.6 }));
  handle.position.set(0, -0.125, 0.075);
  g.add(blade, shank, handle);
  return toMain(g);
}

export function createKiln(world, { journal, rub, sound = () => {} }) {
  const K = world.room.kiln;
  const { obj } = K;
  const unit = new THREE.BoxGeometry(1, 1, 1);
  // a slot's pose in the kiln's frame: on the facet, facing out
  const slotPose = ([m, k], out = 0) => {
    const phi = (m * Math.PI) / 4 + courseRot(k);
    const r = K.ap + out;
    return { phi, pos: new THREE.Vector3(Math.sin(phi) * r, courseY(k), Math.cos(phi) * r), rot: phi };
  };
  // a hole reads as a hole whatever the light: unlit (like the boxes' mouths)
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x1f130d });
  // the stack of new bricks by the kiln's left, on the floor: two rows of three, four across on top
  const pile = new THREE.Vector3(1.55, 0, -1.0);
  const pileRy = 0.35;
  const stackAt = (i) => {
    const bottom = i < 6;
    const j = bottom ? i : i - 6;
    const local = bottom
      ? new THREE.Vector3((Math.floor(j / 3) - 0.5) * (BRICK.w + 0.01), BRICK.d / 2, (j % 3 - 1) * (BRICK.h + 0.01))
      : new THREE.Vector3((j - 1.5) * (BRICK.h + 0.01), BRICK.d * 1.5 + 0.003, 0);
    const ry = pileRy + (bottom ? 0 : Math.PI / 2);
    return {
      pos: local.applyAxisAngle(new THREE.Vector3(0, 1, 0), pileRy).add(pile),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, ry, 0, 'YXZ')),
    };
  };

  const slots = SLOTS.map((s, i) => {
    const pose = slotPose(s, -0.009);
    const hole = new THREE.Mesh(unit, holeMat);
    hole.scale.set(BRICK.w + 0.03, 0.1, 0.03);
    hole.position.copy(pose.pos);
    hole.rotation.y = pose.rot;
    hole.layers.set(LAYER_MAIN_ONLY);
    hole.name = `kiln-hole-${i}`;
    obj.add(hole);
    // where a brick ends up in it (the kiln's frame): just proud of the facet
    const end = slotPose(s, -BRICK.d / 2 + 0.004);
    return { m: s[0], k: s[1], phi: pose.phi, y: courseY(s[1]), colour: new THREE.Color(COURSE[s[1] % 4]), hole, end, filled: false };
  });
  // the stack: bricks[i] at stack place i (0 = bottom); the top one goes first
  const newCol = new THREE.Color(NEW);
  const bricks = slots.map((_, i) => {
    const b = new THREE.Mesh(paint(unit, NEW), MAT.matte);
    b.scale.set(BRICK.w, BRICK.h, BRICK.d);
    b.castShadow = true;
    b.receiveShadow = true;
    b.layers.set(LAYER_MAIN_ONLY);
    b.name = `kiln-brick-${i}`;
    world.scene.add(b);
    return b;
  });
  const tint = (b, c) => {
    const a = b.geometry.attributes.color;
    for (let v = 0; v < a.count; v++) a.setXYZ(v, c.r, c.g, c.b);
    a.needsUpdate = true;
  };
  const flights = []; // { brick, slot, t, from, to }
  const worldPose = (sl) => {
    obj.updateWorldMatrix(true, false);
    const pos = obj.localToWorld(sl.end.pos.clone());
    const q = new THREE.Quaternion();
    obj.getWorldQuaternion(q);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sl.end.rot));
    return { pos, quat: q };
  };
  const onStack = () => slots.length - slots.filter((s) => s.filled).length;
  // the stack as it is with n bricks left on it
  function stack(n) {
    bricks.forEach((b, i) => {
      b.visible = i < n;
      const p = stackAt(i);
      b.position.copy(p.pos);
      b.quaternion.copy(p.quat);
      tint(b, newCol);
    });
  }
  function reset() {
    flights.length = 0;
    for (const sl of slots) {
      sl.filled = false;
      sl.hole.visible = true;
    }
    stack(slots.length);
  }
  function land(f) {
    f.slot.hole.visible = false;
    f.brick.visible = false;
  }
  function fill(sl, { quick = false } = {}) {
    if (sl.filled) return false;
    const n = onStack(); // (the brick on top of the stack is bricks[n - 1])
    sl.filled = true;
    if (quick) {
      sl.hole.visible = false;
      bricks[n - 1].visible = false;
      return true;
    }
    const b = bricks[n - 1];
    flights.push({ brick: b, slot: sl, t: 0, from: { pos: b.position.clone(), quat: b.quaternion.clone() }, to: worldPose(sl) });
    return true;
  }

  // ---- the trowel: whatever of the kiln is under the pointer, as (angle, height) on it
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  const targets = [...K.meshes, ...slots.map((s) => s.hole)];
  const local = new THREE.Vector3();
  const nearest = (phi, y) => {
    let best = null;
    let bd = Infinity;
    for (const sl of slots) {
      if (sl.filled) continue;
      let d = phi - sl.phi;
      d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
      const du = Math.abs(d) * K.ap;
      const dy = Math.abs(y - sl.y);
      if (du > BRICK.w * 0.62 || dy > 0.07) continue;
      const s = du * du + dy * dy * 4;
      if (s < bd) {
        bd = s;
        best = sl;
      }
    }
    return best;
  };
  const doorNormal = () => new THREE.Vector3(0, 0, 1).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
  const tool = surfaceTool(world, {
    id: 'trowel',
    rub,
    rec: journal.surface('brick', { itemOf: () => 0 }),
    hint: () => 'hint.trowel',
    model: trowelModel(),
    offset: 0.02,
    spacing: 2,
    find: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      const h = ray.intersectObjects(targets, false).find((x) => x.object.visible);
      if (!h) return null;
      obj.worldToLocal(local.copy(h.point));
      const phi = Math.atan2(local.x, local.z);
      const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : doorNormal();
      return { item: 'kiln', point: h.point.clone(), normal, px: phi * 100, py: -local.y * 100 };
    },
    target: () => ({ item: 'kiln', normal: doorNormal() }),
    work: (h, px, py) => {
      const sl = nearest(px / 100, -py / 100);
      if (!sl) return false;
      fill(sl);
      return true;
    },
  });
  tool.icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3l6 9-6 3-6-3z"/><path d="M13 15v2.5"/><path d="M13 17.5l-2.5 3.5"/><rect x="3" y="17" width="6" height="3.5" rx="0.6"/></svg>';

  const sys = {
    slots,
    get total() { return slots.length; },
    get filled() { return slots.filter((s) => s.filled).length; },
    get progress() { return this.filled / slots.length; },
    get left() { return onStack(); },
    fresh: reset,
    finished() {
      flights.length = 0;
      for (const sl of slots) {
        sl.filled = true;
        sl.hole.visible = false;
      }
      stack(0);
    },
    complete() {
      for (const f of flights.splice(0)) land(f);
      for (const sl of slots) if (!sl.filled) fill(sl, { quick: true });
    },
    serialize: () => slots.map((s) => (s.filled ? 1 : 0)),
    restore(s) {
      reset();
      slots.forEach((sl, i) => { if (Array.isArray(s) && s[i]) fill(sl, { quick: true }); });
    },
    // true while a brick is in the air (its shadow moves)
    update(dt) {
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        f.t = Math.min(1, f.t + dt / FLIGHT);
        const k = f.t * f.t * (3 - 2 * f.t);
        f.brick.position.lerpVectors(f.from.pos, f.to.pos, k);
        f.brick.position.y += Math.sin(f.t * Math.PI) * 0.45;
        f.brick.quaternion.slerpQuaternions(f.from.quat, f.to.quat, k);
        tint(f.brick, newCol.clone().lerp(f.slot.colour, k));
        if (f.t >= 1) {
          land(f);
          flights.splice(i, 1);
          sound('plank', { gain: 0.45, rate: 1.35 });
        }
      }
      return flights.length > 0;
    },
    tool,
  };
  reset();
  return sys;
}
