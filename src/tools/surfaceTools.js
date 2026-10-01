import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../gi.js';

// Tools that work on a surface under the pointer: hold the left button and rub.
//   squeegee — wipes window grime (the blade turns across the stroke), lets the sun in
//   brush    — scrubs soot off the fireplace surround
//   roller   — paints the walls in one of the level's colours; runs dry, dip it
//              in the tray (click the tray) to reload
// Each shows a small model at the spot it works and refreshes the lighting as the
// surface changes (GI now and then; the level redraws the sun shadow when a
// window mask changes).

export function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
}
export function toMain(g) {
  g.traverse((o) => {
    o.layers.set(LAYER_MAIN_ONLY);
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// local +z = away from the surface (all tool models); the squeegee's blade lies
// in the glass plane and turns about that axis on an inner group
function squeegeeModel() {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.018), mat(0x2b2b2b, { roughness: 0.8 }));
  blade.position.z = 0.009;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.024, 0.02), mat(0x9aa0a4, { metalness: 0.7, roughness: 0.3 }));
  bar.position.z = 0.028;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.2, 10), mat(0x3f8fb0));
  handle.rotation.x = Math.PI / 2 + 0.5; // (its foot on the bar, leaning out and down)
  handle.position.set(0, -0.045, 0.12);
  inner.add(blade, bar, handle);
  g.userData.inner = inner;
  return toMain(g);
}
function brushModel() {
  const g = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.035), mat(0x9a6a3c, { roughness: 0.7 }));
  block.position.z = 0.045;
  const bristles = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.03), mat(0xd8c9a0, { roughness: 1 }));
  bristles.position.z = 0.015;
  g.add(block, bristles);
  return toMain(g);
}
// a wide roller (0.64 m of paint per pass — playtest: the narrow one made painting a chore)
const ROLL_R = 0.32;
export function rollerModel() {
  const g = new THREE.Group();
  const paint = mat(0xefe3cf, { roughness: 0.9 });
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, ROLL_R * 1.55, 20), paint);
  roll.rotation.z = Math.PI / 2; // axis along x (the wall's horizontal)
  roll.position.z = 0.05;
  const end = ROLL_R * 0.775 + 0.012;
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.007, 6, 12, Math.PI), mat(0x8c9296, { metalness: 0.7, roughness: 0.3 }));
  frame.position.set(end, -0.025, 0.09);
  frame.rotation.y = Math.PI / 2;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.24, 10), mat(0xc0392b));
  handle.position.set(end, -0.19, 0.13);
  g.add(roll, frame, handle);
  g.userData.paint = paint;
  return toMain(g);
}

// the paint tray on the floor (clicked to reload the roller)
export function makeTray() {
  const g = new THREE.Group();
  g.name = 'paint-tray';
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.28), mat(0x8a9196, { roughness: 0.5 }));
  shell.position.y = 0.025;
  const well = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2).rotateX(-Math.PI / 2), mat(0xefe3cf, { roughness: 0.35 }));
  well.position.set(0.0, 0.052, 0.0);
  g.add(shell, well);
  g.userData.paint = well.material;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// shared: rub along the pointer path between events, place the model, refresh light
// rubKind: its rubbing sound (audio.js RUB), as loud as the pointer is fast while
// the tool is really working · rec: the level's journal (journal.js), told of every
// hit while the button is held · tool.replay: the timelapse (replay.js) working the
// tool with recorded hits instead of a pointer; target(key) = what a recorded stroke's
// item key (journal.js) was on: { item, normal } · a level's own surface tools use this too
export function surfaceTool(world, { id, hint, model, find, work, onDown, onMove, offset = 0.06, wheel, giEvery = 1.5, spacing = 3, rub = () => {}, rubKind = null, rec = null, target = () => null }) {
  const scene = world.scene;
  scene.add(model);
  model.visible = false;
  let down = false;
  let last = null;
  let changed = false;
  let giT = 0;
  let over = null;
  const q = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  let lastNdc = null;
  let travel = 0; // screen pixels rubbed since the last frame
  let loud = 0;
  let rubbing = false;
  const el = world.renderer.domElement;
  world.onFrame((dt) => {
    const want = down ? Math.min(1, travel / Math.max(dt, 1e-3) / 900) : 0;
    travel = 0;
    loud += (want - loud) * Math.min(1, dt * 10);
    // (only while this tool makes it, and once more to hush it: an idle tool with the same
    // sound — the bookshop's duster and gilder next to the squeegee — setting it to 0
    // every frame silenced the one in use, playtest 2026-09-30)
    if (rubKind) {
      const lv = loud > 0.03 ? 0.3 + 0.7 * loud : 0;
      if (lv || rubbing) rub(rubKind, lv);
      rubbing = lv > 0;
    }
    if (!down) return;
    giT -= dt;
    if (changed && giT <= 0) {
      giT = giEvery;
      changed = false;
      world.lightingChanged();
    }
  });
  function place(h) {
    model.visible = !!h;
    if (!h) return;
    model.position.copy(h.point).addScaledVector(h.normal, offset);
    model.quaternion.copy(q.setFromUnitVectors(Z, h.normal));
  }
  function rubAt(ndc) {
    const h = find(ndc);
    const moved = lastNdc ? Math.hypot((ndc.x - lastNdc.x) * el.clientWidth / 2, (ndc.y - lastNdc.y) * el.clientHeight / 2) : 0;
    lastNdc = ndc.clone();
    rubHit(h, moved);
  }
  function rubHit(h, moved = 0) {
    over = h;
    place(h);
    if (!h || !down) return;
    rec?.point(h);
    let worked = false;
    // work(h, px, py, step): `step` = pixels travelled since the previous call
    if (last && last.item === h.item) {
      const dx = h.px - last.px;
      const dy = h.py - last.py;
      const d = Math.hypot(dx, dy);
      onMove?.(dx, dy, d);
      const steps = Math.max(1, Math.ceil(d / spacing));
      for (let s = 1; s <= steps; s++) {
        const k = s / steps;
        if (work(h, last.px + dx * k, last.py + dy * k, d / steps)) worked = true;
      }
    } else if (work(h, h.px, h.py, 0)) worked = true;
    if (worked) {
      changed = true;
      travel += moved;
    }
    last = h;
  }
  function up() {
    down = false;
    last = null;
    rec?.up();
    if (changed) world.lightingChanged();
    changed = false;
  }
  return {
    id,
    hint,
    kind: rec?.kind ?? null, // its strokes' kind in the journal
    down(ndc) {
      if (onDown?.(ndc)) return;
      down = true;
      last = null;
      giT = giEvery;
      lastNdc = null;
      rec?.down();
      rubAt(ndc);
    },
    move(ndc) { rubAt(ndc); },
    up,
    // h: { item, px, py, point, normal } as find() makes them
    replay: {
      target,
      down(h) {
        down = true;
        last = null;
        giT = giEvery;
        rubHit(h);
      },
      move(h) { rubHit(h); },
      up() {
        up();
        model.visible = false;
        over = null;
      },
    },
    wheel(dir) { return wheel?.(dir) ?? false; },
    get wantsWheel() { return !!wheel && !!over; },
    cursor: () => (over ? 'none' : ''),
    release() {
      down = false;
      model.visible = false;
      over = null;
    },
    get busy() { return down; },
    get over() { return over; },
  };
}

export function createSqueegee(world, grime, { rub, rec }) {
  const model = squeegeeModel();
  // The blade turns itself across the way you drag, like a hand would, so any
  // stroke (up-down, side to side, circles) clears a full blade-wide band.
  // `ang` is the blade's angle in mask pixels (0 = level, y down); a blade looks
  // the same turned by π, so it takes the nearest equivalent and a zig-zag's
  // reversal doesn't spin it.
  let ang = 0;
  return surfaceTool(world, {
    id: 'squeegee',
    rub,
    rec,
    rubKind: 'glass',
    hint: () => 'hint.squeegee',
    model,
    offset: 0.02,
    find: (ndc) => grime.hit(ndc, world.camera, 'window'),
    target: (i) => (grime.windows[i] ? { item: grime.windows[i], normal: grime.windows[i].normal } : null),
    onMove: (dx, dy, d) => {
      if (d < 1.5) return;
      let diff = Math.atan2(dy, dx) + Math.PI / 2 - ang;
      diff -= Math.PI * Math.round(diff / Math.PI);
      ang += diff * Math.min(1, d / 10);
      ang -= Math.PI * Math.round(ang / Math.PI); // keep the handle below the blade
      model.userData.inner.rotation.z = -ang; // pixel y runs down, the model's y up
    },
    work: (h, px, py) => {
      const m = h.item.mask;
      const ppm = m.w / h.item.w.w; // pixels per metre on this pane
      m.wipe(px, py, 0.22 * ppm, 0.035 * ppm, ang);
      return true;
    },
  });
}

export function createBrush(world, grime, { rub, rec }) {
  const model = brushModel();
  let jig = 0;
  world.onFrame((dt, time) => {
    jig = Math.max(0, jig - dt * 4);
    model.children.forEach((c) => { c.position.x = Math.sin(time * 40) * 0.012 * jig; });
  });
  return surfaceTool(world, {
    id: 'brush',
    rub,
    rec,
    rubKind: 'scrub',
    hint: () => 'hint.brush',
    model,
    offset: 0.01,
    find: (ndc) => grime.hit(ndc, world.camera, 'soot'),
    target: () => (grime.soot ? { item: grime.soot, normal: grime.soot.normal } : null),
    work: (h, px, py) => {
      const m = h.item.mask;
      m.dab(px, py, 12, { erase: true, strength: 0.35 });
      jig = 1;
      return true;
    },
  });
}

// (a level's own "roller" — an oil brush, a trowel — gives its id, model (userData.paint =
// the material that shows the load), hint keys, rubbing sound and how far a load goes;
// width: the band it lays, metres)
export function createRoller(world, walls, {
  sound, rub, rec, colors, tray, onChange = () => {},
  id = 'roller', model = rollerModel(), hints = { use: 'hint.roller', dry: 'hint.rollerDry' }, rubKind = 'roll', cap = 40, width = ROLL_R * 2,
}) {
  const R = width / 2;
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  // one dip paints about this many metres of stroke (0.64 m wide ≈ 25 m² of wall):
  // two trips to the tray for the room (18 m of a narrow roller felt like constant dipping)
  const CAP = cap;
  let load = CAP;
  let color = colors[0];
  let dryT = 0;
  world.onFrame((dt) => { dryT -= dt; });
  const tint = () => {
    const c = new THREE.Color(color);
    // a dry roller goes pale
    model.userData.paint.color.copy(c).lerp(new THREE.Color(0xd8d2c4), 1 - Math.min(1, load / CAP * 1.5));
    tray.userData.paint.color.set(color);
  };
  tint();
  const tool = surfaceTool(world, {
    id,
    rub,
    rec,
    rubKind,
    hint: () => (load <= 0 ? hints.dry : hints.use),
    model,
    offset: 0.005,
    giEvery: 1.2,
    spacing: 5,
    // clicking the tray reloads (and is not a paint stroke)
    onDown: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      if (tray.visible && ray.intersectObject(tray, true).length) {
        load = CAP;
        tint();
        sound('drop_soft', { gain: 0.7, rate: 0.8 });
        onChange();
        return true;
      }
      return false;
    },
    find: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      const h = walls.hit(ray.ray);
      if (h) h.item = h.face; // strokes join up within one face only (walls.js)
      return h;
    },
    target: (face) => ({ item: face, normal: walls.faceNormal(face) }),
    work: (h, px, py, step) => {
      if (load <= 0) {
        if (dryT <= 0) {
          dryT = 1;
          sound('blocked', { gain: 0.35 });
          onChange();
        }
        return false;
      }
      walls.mask.dab(px, py, R * walls.PX, { color });
      // paint goes with the distance rolled; the first touch of a stroke costs a little
      const before = Math.ceil(load * 2); // HUD + tint every half metre
      load = Math.max(0, load - (step > 0 ? step / walls.PX : 0.02));
      if (Math.ceil(load * 2) !== before || load <= 0) {
        tint();
        onChange();
      }
      return true;
    },
  });
  // (defineProperties, not Object.assign: assign would freeze the getters' values)
  return Object.defineProperties(tool, {
    colors: { value: colors },
    color: { get: () => color },
    load: { get: () => load / CAP },
    setColor: {
      value(c) {
        color = c;
        load = CAP;
        tint();
        onChange();
      },
    },
  });
}
