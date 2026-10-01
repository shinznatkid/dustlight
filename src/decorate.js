import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from './gi.js';

// The furniture layer. Every movable thing in the room is an *entry*: a holder
// Group whose origin is the centre of the thing's footprint, on the surface it
// rests on, turned by `rotation.y` — so moving, turning and collision all work
// on (x, z, ry) alone. Adapted from an earlier low-poly prototype.
//
// Three kinds, by where they may go:
//   floor — furniture: the floor only (footprints must not overlap)
//   small — ornaments, books, lamps: the floor, or a *board* — the top of a
//           table, a bookshelf board, the sofa seat (entry.boards) or a fixed
//           room shelf (the mantel)
//   wall  — pictures: hang flat on a wall (keeping clear of windows and of
//           whatever already stands there)
// Anything carried past the open edges of the floor is "outside": dropping it
// there hands it to the caller (the level puts it in the put-aside box).

const Y = new THREE.Vector3(0, 1, 0);
const REST_EPS = 0.03;      // how far "resting on" may be off, in metres
const LIFT = 0.07;          // held things float this far above where they'd land
const WALL_OUT = 0.06;      // held pictures float this far off the wall
const HANG_GAP = 0.01;      // a hung picture's back sits this far off the wall (the hook)
const SHRINK = 0.03;        // footprints may touch without counting as overlap
const WALL_GAP = 0.02;      // baseboard thickness
const WALL_SNAP = 0.15;     // closer than this to a wall -> pushed flush against it
const STEP = Math.PI / 12;  // wheel rotation step (15°)
const DROP_T = 0.34;        // landing animation length, seconds
const OUT_M = 0.3;          // pointer this far past the open floor edges = outside
const FOLLOW = 20;          // held things chase their spot at this rate (1/s): a touch of weight
const TILT = 0.045;         // lean per m/s of motion (radians)
const TILT_MAX = 0.14;
const POP_T = 0.24;         // something new out of a box grows to full size this fast

// Re-parent an already-placed object into a holder without moving it on screen.
// The footprint is measured in the holder's own (unrotated) frame, so a chair
// turned 40° still gets its true width and depth rather than a padded AABB.
export function wrap(obj, ry = 0) {
  obj.updateWorldMatrix(true, true);
  const holder = new THREE.Group();
  holder.rotation.y = ry;
  holder.updateMatrixWorld(true);
  holder.attach(obj);
  holder.rotation.y = 0;
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  const c = box.getCenter(new THREE.Vector3());
  const off = new THREE.Vector3(c.x, box.min.y, c.z);
  obj.position.sub(off);
  holder.position.copy(off).applyAxisAngle(Y, ry);
  holder.rotation.y = ry;
  // yaw first, then lean about the world axes (the tilt while carried)
  holder.rotation.order = 'ZXY';
  holder.updateMatrixWorld(true);
  const size = box.getSize(new THREE.Vector3());
  return { holder, sx: size.x, sy: size.y, sz: size.z };
}

// --- 2D footprints (oriented rectangles on the floor) -------------------------
// three's rotation.y = θ maps local +x to world (cos θ, -sin θ) and +z to (sin θ, cos θ)
const rect = (x, z, ry, hx, hz) => ({ x, z, c: Math.cos(ry), s: Math.sin(ry), hx, hz });
const boxRect = (b) => rect((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, 0, (b.max.x - b.min.x) / 2, (b.max.z - b.min.z) / 2);

function radius(r, nx, nz) {
  return r.hx * Math.abs(r.c * nx - r.s * nz) + r.hz * Math.abs(r.s * nx + r.c * nz);
}

// separating-axis test on the four edge normals
function overlaps(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const r of [a, b]) {
    for (const [nx, nz] of [[r.c, -r.s], [r.s, r.c]]) {
      if (Math.abs(dx * nx + dz * nz) >= radius(a, nx, nz) + radius(b, nx, nz)) return false;
    }
  }
  return true;
}

// half extents of a (hx, hz) rectangle turned by `rel`, along the unturned axes
function extents(hx, hz, rel) {
  const c = Math.abs(Math.cos(rel));
  const s = Math.abs(Math.sin(rel));
  return [hx * c + hz * s, hx * s + hz * c];
}

const wrapAngle = (a) => THREE.MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;
const clampIn = (v, lo, hi) => (hi > lo ? THREE.MathUtils.clamp(v, lo, hi) : (lo + hi) / 2);

// walls: [{ axis: 'x'|'z', sign, at, u: 'z'|'x', min, max, y0, top, ry, keepOut: [{u0,u1,y0,y1}] }]
//   a vertical rectangle facing `sign` along `axis`, at axis = `at`; pictures on
//   it turn to `ry`; keepOut = spans a picture may not cover (curtains, windows)
export function createDecor(scene, { camera, bounds, obstacles = [], walls = [], onLight = () => {} }) {
  const group = new THREE.Group();
  group.name = 'furniture';
  scene.add(group);
  const entries = [];
  const scratch = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enableAll(); // small props live on LAYER_MAIN_ONLY
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const obstacleRects = obstacles.map((b) => ({ r: boxRect(b), y0: b.min.y, y1: b.max.y }));
  const anims = [];

  // held: { e, subtree, gi, fresh, from, ry, grab, grabY, p, ndc, target, goal, goalRy, lean, shake, pop, boxes }
  let held = null;
  let linkedSurfaces = [];

  // footprint marker under the held thing (green = fits, red = doesn't); a
  // standing one on the wall for pictures
  const padMat = new THREE.MeshBasicMaterial({ color: 0x7bbf4a, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), padMat);
  const wpad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), padMat);
  for (const p of [pad, wpad]) {
    p.layers.set(LAYER_MAIN_ONLY);
    p.renderOrder = 1;
    p.visible = false;
    scene.add(p);
  }

  // is world point (x, z) inside e's footprint (grown by pad)?
  function covers(e, x, z, grow = 0) {
    const p = e.holder.worldToLocal(scratch.set(x, e.holder.position.y, z));
    return Math.abs(p.x) <= e.sx / 2 + grow && Math.abs(p.z) <= e.sz / 2 + grow;
  }

  function entryOf(obj) {
    for (let o = obj; o; o = o.parent) if (o.userData.entry) return o.userData.entry;
    return null;
  }

  const onFloor = (e) => !e.wall && !e.support;
  const landing = (e) => anims.some((a) => a.h.subtree.includes(e));
  const kindOf = (e) => (e.wall ? 'wall' : e.small ? 'small' : 'floor');

  // "stored" = packed away in a box: meshes hidden (so no shadow, no GI capture)
  // and ignored by collision, picking and probe blockers. Lights stay in the scene
  // graph (removing one would recompile every shader); lamps read
  // holder.userData.stored and go dark instead.
  function setStored(e, on) {
    if (!!e.stored === on) return;
    e.stored = on;
    e.holder.userData.stored = on;
    e.holder.traverse((o) => {
      if (!o.isMesh) return;
      if (on) {
        o.userData.vis0 = o.visible;
        o.visible = false;
      } else if (o.userData.vis0 !== undefined) {
        o.visible = o.userData.vis0;
        delete o.userData.vis0;
      }
    });
  }
  const footprint = (e, x, z, ry) => rect(x, z, ry, e.sx / 2 - SHRINK, e.sz / 2 - SHRINK);

  function tree(e, out = []) {
    out.push(e);
    for (const k of e.kids) tree(k, out);
    return out;
  }

  // take e off whatever it rests on
  function unlink(e) {
    const s = e.support;
    if (s?.kids) {
      const i = s.kids.indexOf(e);
      if (i >= 0) s.kids.splice(i, 1);
    }
    e.support = null;
  }

  // --- where the held thing would land ---------------------------------------
  // on the floor: clamped inside the walls, pushed flush when close, must not
  // overlap the room's fixed parts or other floor things
  function solve(px, pz, ry, e = held.e, skip = held?.subtree ?? [e]) {
    const hx = e.sx / 2;
    const hz = e.sz / 2;
    const [ex, ez] = extents(hx, hz, ry); // world-axis half extents of the turned footprint
    const x0 = bounds.x0 + WALL_GAP + ex;
    const z0 = bounds.z0 + WALL_GAP + ez;
    let x = THREE.MathUtils.clamp(px, x0, Math.max(x0, bounds.x1 - ex));
    let z = THREE.MathUtils.clamp(pz, z0, Math.max(z0, bounds.z1 - ez));
    if (x - x0 < WALL_SNAP) x = x0;
    if (z - z0 < WALL_SNAP) z = z0;

    const me = footprint(e, x, z, ry);
    let ok = true;
    let blocker = null;
    for (const o of obstacleRects) {
      if (o.y0 < e.sy && o.y1 > 0 && overlaps(me, o.r)) { ok = false; blocker = 'room'; break; }
    }
    if (ok) {
      for (const o of entries) {
        if (o.stored || !onFloor(o) || skip.includes(o)) continue;
        if (overlaps(me, footprint(o, o.holder.position.x, o.holder.position.z, o.holder.rotation.y))) {
          ok = false;
          blocker = o.id;
          break;
        }
      }
    }
    return { mode: 'floor', x, y: 0, z, ry, ok, blocker, support: null };
  }

  // on a board: the footprint kept on it, headroom under the next board up,
  // clear of what already stands there
  function settleOn({ x, y, z, ry, support, clear, siblings, fits }) {
    const { e } = held;
    let ok = fits;
    let blocker = fits ? null : 'size';
    if (ok && e.sy > clear) {
      ok = false;
      blocker = 'height';
    }
    if (ok) {
      const me = footprint(e, x, z, ry);
      for (const k of siblings) {
        if (k.stored || k.wall || held.subtree.includes(k)) continue;
        if (Math.abs(k.holder.position.y - y) > REST_EPS) continue;
        if (overlaps(me, footprint(k, k.holder.position.x, k.holder.position.z, k.holder.rotation.y))) {
          ok = false;
          blocker = k.id;
          break;
        }
      }
    }
    return { mode: 'surface', x, y, z, ry, ok, blocker, support };
  }

  // a board of entry o: { h, hx, hz, clear } in o's own frame
  function onBoard(o, b, px, pz, ry) {
    const { e } = held;
    o.holder.updateWorldMatrix(true, false);
    const lp = o.holder.worldToLocal(v1.set(px, 0, pz));
    const [ex, ez] = extents(e.sx / 2, e.sz / 2, ry - o.holder.rotation.y);
    const lx = clampIn(lp.x, -b.hx + ex, b.hx - ex);
    const lz = clampIn(lp.z, -b.hz + ez, b.hz - ez);
    const w = o.holder.localToWorld(v1.set(lx, b.h, lz));
    return settleOn({
      x: w.x, y: w.y, z: w.z, ry, support: o, clear: b.clear, siblings: o.kids,
      fits: ex <= b.hx + 0.06 && ez <= b.hz + 0.06,
    });
  }

  // a fixed room shelf (the mantel): world-aligned box, top face = box.max.y
  function onSurface(s, px, pz, ry) {
    const { e } = held;
    const b = s.box;
    const [ex, ez] = extents(e.sx / 2, e.sz / 2, ry);
    const x = clampIn(px, b.min.x + ex, b.max.x - ex);
    const z = clampIn(pz, b.min.z + ez, b.max.z - ez);
    return settleOn({
      x, y: b.max.y, z, ry, support: s, clear: Infinity,
      siblings: entries.filter((k) => k.support === s),
      fits: ex <= (b.max.x - b.min.x) / 2 + 0.06 && ez <= (b.max.z - b.min.z) / 2 + 0.06,
    });
  }

  // small things: the first piece of furniture under the pointer decides — its
  // board just below the hit (so pointing into a bookshelf picks that shelf), the
  // board under a thing already standing there, or the floor under anything else
  // (which will then be in the way). Fixed shelves compete by distance.
  function aimSmall() {
    const ray = raycaster.ray;
    let best = null;
    for (const hit of raycaster.intersectObject(group, true)) {
      if (!hit.object.visible) continue;
      const o = entryOf(hit.object);
      if (!o || o.stored || o.wall || held.subtree.includes(o) || landing(o)) continue;
      let s = o;
      let y = hit.point.y;
      if (!s.boards && s.support) {
        y = s.holder.position.y + 0.01;
        s = s.support;
      }
      if (s.boards) {
        const base = s.holder.position.y;
        let b = null;
        for (const bb of s.boards) if (base + bb.h <= y + 0.05 && (!b || bb.h > b.h)) b = bb;
        const p = hit.point.clone();
        // where the pointer meets the board's height, if that's over the piece
        // (a sofa seen from behind: past the backrest, onto the seat); else the hit
        // (into a bookshelf: the back panel, the board below it)
        if (b && ray.direction.y < -1e-4) {
          ray.at((base + b.h - ray.origin.y) / ray.direction.y, v2);
          if (covers(s, v2.x, v2.z, 0.05)) p.copy(v2);
        }
        best = b ? { t: hit.distance, place: () => onBoard(s, b, p.x, p.z, held.ry) } : { t: hit.distance, floorAt: p };
      } else if (s.box?.isBox3) {
        const p = hit.point.clone();
        best = { t: hit.distance, place: () => onSurface(s, p.x, p.z, held.ry) };
      } else best = { t: hit.distance, floorAt: hit.point.clone() };
      break;
    }
    // fixed shelves: their top, or the wall just above them (they stand against a
    // wall facing +z) — pointing a little high still lands on the shelf
    for (const s of linkedSurfaces) {
      const b = s.box;
      let hitP = null;
      let t = 0;
      if (ray.direction.y < -1e-4) {
        t = (b.max.y - ray.origin.y) / ray.direction.y;
        ray.at(t, v2);
        if (t > 0 && v2.x > b.min.x && v2.x < b.max.x && v2.z > b.min.z - 0.05 && v2.z < b.max.z + 0.12) hitP = v2.clone();
      }
      if (!hitP && ray.direction.z < -1e-4) {
        t = (b.min.z - ray.origin.z) / ray.direction.z;
        ray.at(t, v2);
        if (t > 0 && v2.x > b.min.x && v2.x < b.max.x && v2.y > b.max.y && v2.y < b.max.y + 0.45) hitP = v2.clone();
      }
      if (hitP && (!best || t < best.t)) best = { t, place: () => onSurface(s, hitP.x, hitP.z, held.ry) };
    }
    if (best?.place) return best.place();
    if (best?.floorAt) return solve(best.floorAt.x, best.floorAt.z, held.ry);
    plane.constant = 0;
    if (!ray.intersectPlane(plane, v2)) return null;
    return solve(v2.x, v2.z, held.ry);
  }

  // pictures: the nearest wall under the pointer; kept on it, off the windows and
  // clear of anything already there (a bookshelf, another picture)
  function aimWall() {
    const ray = raycaster.ray;
    let best = null;
    for (const w of walls) {
      if (ray.direction[w.axis] * w.sign > -1e-4) continue; // must face the camera
      const t = (w.at - ray.origin[w.axis]) / ray.direction[w.axis];
      if (t <= 0 || (best && t >= best.t)) continue;
      ray.at(t, v2);
      const u = v2[w.u];
      if (u < w.min || u > w.max || v2.y < 0 || v2.y > w.top) continue;
      best = { t, w, u, y: v2.y };
    }
    if (!best) return null;
    const { e } = held;
    const { w } = best;
    const hw = e.sx / 2;
    const hh = e.sy / 2;
    const off = w.at + w.sign * (HANG_GAP + e.sz / 2);
    const [u0, u1, y0, y1] = [w.min + hw, w.max - hw, w.y0 + hh, w.top - hh];
    // what stops it hanging at (u, cy): a window / door (keepOut) or a thing already there
    const fit = (u, cy) => {
      for (const k of w.keepOut ?? []) {
        if (u + hw > k.u0 && u - hw < k.u1 && cy + hh > k.y0 && cy - hh < k.y1) return 'window';
      }
      const x = w.axis === 'x' ? off : u;
      const z = w.axis === 'z' ? off : u;
      mine.min.set(w.axis === 'x' ? x - e.sz / 2 : x - hw, cy - hh, w.axis === 'z' ? z - e.sz / 2 : z - hw).addScalar(0.01);
      mine.max.set(w.axis === 'x' ? x + e.sz / 2 : x + hw, cy + hh, w.axis === 'z' ? z + e.sz / 2 : z + hw).addScalar(-0.01);
      for (const { k, b } of held.boxes) if (b.intersectsBox(mine)) return k.id;
      return null;
    };
    let u = clampIn(best.u, u0, u1);
    let cy = clampIn(best.y, y0, y1);
    let blocker = fit(u, cy);
    if (blocker) {
      // taken here: the nearest free spot close by (rings of 5 cm out to 0.6 m), so a
      // narrow bit of wall — between a door and a window — can be found without hunting
      // for the exact pixel (playtest 2026-09-30: the bookshop's clock "only hung in one spot")
      let near = null;
      for (let r = 1; r <= 12 && !near; r++) {
        for (let i = -r; i <= r; i++) {
          for (let j = -r; j <= r; j++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
            const cu = u + i * 0.05;
            const cc = cy + j * 0.05;
            if (cu < u0 - 1e-6 || cu > u1 + 1e-6 || cc < y0 - 1e-6 || cc > y1 + 1e-6) continue;
            const d = i * i + j * j;
            if ((!near || d < near.d) && !fit(cu, cc)) near = { u: cu, cy: cc, d };
          }
        }
      }
      if (near) {
        ({ u, cy } = near);
        blocker = null;
      }
    }
    const x = w.axis === 'x' ? off : u;
    const z = w.axis === 'z' ? off : u;
    return { mode: 'wall', x, y: cy - hh, z, ry: w.ry, ok: !blocker, blocker, wall: w };
  }
  const mine = new THREE.Box3();

  // the wall a hung picture is on now
  function wallOf(e) {
    const p = e.holder.position;
    let best = null;
    for (const w of walls) {
      const d = Math.abs(p[w.axis] - (w.at + w.sign * (HANG_GAP + e.sz / 2)));
      if (p[w.u] >= w.min - 0.05 && p[w.u] <= w.max + 0.05 && (!best || d < best.d)) best = { w, d };
    }
    return best?.w ?? walls[0];
  }

  // past the open edges of the floor (the camera side) = outside the room
  function outside() {
    plane.constant = 0;
    if (!raycaster.ray.intersectPlane(plane, v2)) return { x: null, z: null }; // at the sky
    if (v2.x > bounds.x1 + OUT_M || v2.z > bounds.z1 + OUT_M) return { x: v2.x, z: v2.z };
    return null;
  }

  function aim(ndc) {
    held.ndc = ndc.clone();
    raycaster.setFromCamera(ndc, camera);
    const kind = kindOf(held.e);
    let t = kind === 'wall' ? aimWall() : null;
    const out = held.e.crate ? null : outside(); // a box can't be put in a box
    if (!t && out) {
      const last = held.target ?? { x: held.e.holder.position.x, z: held.e.holder.position.z };
      t = { mode: 'out', x: out.x ?? last.x, y: 0, z: out.z ?? last.z, ry: held.ry, ok: true };
    }
    if (!t && kind === 'small') t = aimSmall();
    if (!t && kind === 'floor') {
      plane.constant = -held.grabY;
      if (raycaster.ray.intersectPlane(plane, scratch)) {
        held.p = { x: scratch.x - held.grab.x, z: scratch.z - held.grab.z };
        t = solve(held.p.x, held.p.z, held.ry);
      }
    }
    if (!t) return; // a picture pointed off the walls stays where it was
    held.target = t;
    show();
  }

  function show() {
    const { e, target: t } = held;
    pad.visible = false;
    wpad.visible = false;
    if (!t) {
      held.goal.copy(e.holder.position).setY(e.holder.position.y + LIFT);
      return;
    }
    held.goalRy = t.ry;
    if (t.mode === 'wall') {
      const n = t.wall;
      const nx = n.axis === 'x' ? n.sign : 0;
      const nz = n.axis === 'z' ? n.sign : 0;
      held.goal.set(t.x + nx * WALL_OUT, t.y, t.z + nz * WALL_OUT);
      wpad.visible = true;
      wpad.scale.set(e.sx, e.sy, 1);
      wpad.rotation.set(0, t.ry, 0);
      const at = n.at + n.sign * 0.004;
      wpad.position.set(n.axis === 'x' ? at : t.x, t.y + e.sy / 2, n.axis === 'z' ? at : t.z);
    } else if (t.mode === 'out') {
      held.goal.set(t.x, LIFT * 2, t.z);
    } else {
      held.goal.set(t.x, t.y + LIFT, t.z);
      pad.visible = true;
      pad.scale.set(e.sx, 1, e.sz);
      pad.position.set(t.x, t.y + (t.mode === 'surface' ? 0.006 : 0.02), t.z);
      pad.rotation.y = t.ry;
    }
    padMat.color.set(t.ok ? 0x7bbf4a : 0xd0432c);
    padMat.opacity = t.ok ? 0.4 : 0.55;
  }

  // held things leave the GI capture (probes must not photograph a floating sofa)
  // but stay in the main view and keep casting shadows. A lamp's light stays: the
  // probes seeing one light fewer is a new light count for every shader they draw,
  // and the whole room recompiled while a lamp was in hand (~2 s)
  function setHeldLayers(on) {
    held.e.holder.traverse((o) => {
      if (on) {
        if (o.isLight || !o.layers.isEnabled(0)) return;
        o.userData.heldMask = o.layers.mask;
        o.layers.set(LAYER_MAIN_ONLY);
      } else if (o.userData.heldMask !== undefined) {
        o.layers.mask = o.userData.heldMask;
        delete o.userData.heldMask;
      }
    });
  }

  // fresh = just out of a box: it grows out of the box, and a cancel packs it again
  function begin(e, point, { fresh = false } = {}) {
    const subtree = tree(e);
    // things resting on it ride along: nest their holders so they follow and turn with it
    for (const p of subtree) for (const k of p.kids) p.holder.attach(k.holder);
    let gi = false;
    e.holder.traverse((o) => { if (o.layers.isEnabled(0)) gi = true; });
    const { x, y, z } = e.holder.position;
    held = {
      e,
      subtree,
      gi,
      fresh,
      from: { x, y, z, ry: e.holder.rotation.y },
      ry: e.holder.rotation.y,
      grab: fresh ? { x: 0, z: 0 } : { x: point.x - x, z: point.z - z }, // world-space: turning spins it about its centre
      grabY: fresh ? Math.min(e.sy * 0.5, 0.5) : point.y,
      p: { x, z }, // where the pointer wants the centre (before clamping/snapping)
      ndc: null,
      target: null,
      goal: new THREE.Vector3(),
      goalRy: e.holder.rotation.y,
      lean: { x: 0, z: 0 },
      shake: 0,
      pop: fresh ? 0 : 1,
      // what a picture must not overlap (nothing else moves while one is carried)
      boxes: e.wall ? entries.filter((k) => !k.stored && !subtree.includes(k)).map((k) => ({ k, b: new THREE.Box3().setFromObject(k.holder) })) : [],
    };
    setHeldLayers(true);
    // until the pointer moves it, it would land back where it was
    if (!fresh) {
      const kind = kindOf(e);
      if (kind === 'wall') held.target = { mode: 'wall', x, y, z, ry: held.ry, ok: true, wall: wallOf(e) };
      else if (e.support) held.target = { mode: 'surface', x, y, z, ry: held.ry, ok: true, support: e.support };
      else held.target = solve(x, z, held.ry);
    }
    show();
  }

  // the riders go back to being their own holders once it has landed
  function settle(h) {
    for (const p of h.subtree) for (const k of p.kids) group.attach(k.holder);
  }

  function unheld() {
    const h = held;
    setHeldLayers(false);
    held = null;
    pad.visible = false;
    wpad.visible = false;
    const hol = h.e.holder;
    hol.rotation.x = 0;
    hol.rotation.z = 0;
    hol.scale.set(1, 1, 1);
    return h;
  }

  function release(animate) {
    const h = unheld();
    const hol = h.e.holder;
    if (animate) {
      const t = h.target;
      const to = new THREE.Vector3(t.x, t.y, t.z);
      const from = hol.position.clone(); // from where it hangs now (it trails the pointer a little)
      hol.rotation.y = t.ry;
      // start the bounce light now, measured where it will land, so GI converges
      // while it drops instead of after (the fall is only a few cm)
      hol.position.copy(to);
      hol.updateMatrixWorld(true);
      onLight({ gi: h.gi });
      hol.position.copy(from);
      anims.push({ h, t: 0, from, to, squash: t.mode !== 'wall' });
    } else {
      settle(h);
      onLight({ gi: h.gi });
    }
  }

  // a snapshot must not catch things mid-air: held ones count where they came
  // from (fresh ones are still in their box), landing ones where they land
  function atRest(fn) {
    const saved = [];
    const put = (hol, p, ry) => {
      saved.push([hol, hol.position.clone(), hol.rotation.clone(), hol.scale.clone()]);
      hol.position.copy(p);
      hol.rotation.set(0, ry, 0);
      hol.scale.set(1, 1, 1);
    };
    if (held) put(held.e.holder, new THREE.Vector3(held.from.x, held.from.y, held.from.z), held.from.ry);
    for (const a of anims) put(a.h.e.holder, a.to, a.h.e.holder.rotation.y);
    if (saved.length) group.updateMatrixWorld(true);
    try {
      return fn();
    } finally {
      for (const [hol, p, r, s] of saved) {
        hol.position.copy(p);
        hol.rotation.copy(r);
        hol.scale.copy(s);
      }
      if (saved.length) group.updateMatrixWorld(true);
    }
  }

  return {
    group,
    entries,
    get held() { return held; },

    // big: seen by GI probes · block: probes get pushed out of it · wall: hangs
    // on a wall · small: may stand on boards (see the header) · boards: the
    // surfaces on it, [{ h, hx, hz }] in its own frame (h above its base)
    adopt(obj, { id, ry = 0, big = false, block = false, wall = false, small = false, boards = null }) {
      const { holder, sx, sy, sz } = wrap(obj, ry);
      holder.name = `item:${id}`;
      group.add(holder);
      let bs = null;
      if (boards?.length) {
        bs = boards.map((b) => ({ ...b })).sort((a, b) => a.h - b.h);
        // headroom: up to the underside of the next board (boards are ~3 cm thick)
        bs.forEach((b, i) => { b.clear = i + 1 < bs.length ? bs[i + 1].h - b.h - 0.03 : Infinity; });
      }
      const e = { id, holder, sx, sy, sz, big, block, wall, small: small && !wall, boards: bs, support: null, kids: [] };
      holder.userData.entry = e;
      entries.push(e);
      return e;
    },

    // Work out what each thing rests on from where it is: the floor (support
    // null), another entry (books → bookshelf), or a fixed room surface (the
    // mantel). Picking something up later carries its kids along.
    link(surfaces = linkedSurfaces) {
      linkedSurfaces = surfaces;
      for (const e of entries) {
        e.support = null;
        e.kids.length = 0;
      }
      for (const e of entries) {
        const { x, y, z } = e.holder.position;
        if (e.stored || e.wall || y < REST_EPS) continue;
        let best = null;
        for (const o of entries) {
          if (o === e || o.wall || o.stored) continue;
          const y0 = o.holder.position.y;
          if (y < y0 + REST_EPS || y > y0 + o.sy + REST_EPS || !covers(o, x, z, 0.05)) continue;
          if (!best || y0 > best.holder.position.y) best = o;
        }
        if (!best) {
          best = surfaces.find((s) => Math.abs(y - s.box.max.y) < REST_EPS
            && x >= s.box.min.x && x <= s.box.max.x && z >= s.box.min.z && z <= s.box.max.z) ?? null;
        }
        if (!best) console.warn('decor: nothing under', e.id, y.toFixed(3));
        e.support = best;
        if (best?.kids) best.kids.push(e);
      }
    },

    // GI probe blockers — same boxes the old props loader produced
    blockers() {
      return entries.filter((e) => e.block && !e.stored).map((e) => new THREE.Box3().setFromObject(e.holder).expandByScalar(-0.06));
    },

    // what a click at ndc would pick up: the first thing under the cursor
    // (clicking a book never grabs the shelf)
    hover(ndc) {
      raycaster.setFromCamera(ndc, camera);
      // the raycaster hits hidden meshes too: skip anything packed away
      for (const hit of raycaster.intersectObject(group, true)) {
        if (!hit.object.visible) continue;
        const e = entryOf(hit.object);
        if (!e || e.stored) continue;
        return landing(e) ? null : { e, point: hit.point };
      }
      return null;
    },

    setStored(e, on) { setStored(typeof e === 'string' ? entries.find((o) => o.id === e) : e, on); },
    get storedEntries() { return entries.filter((e) => e.stored); },
    // would a floor thing fit at (x, z, ry) — ignoring e itself
    fitsFloor(e, x, z, ry = 0) { return solve(x, z, ry, e, [e]).ok; },

    // --- player actions ---------------------------------------------------------
    pick(ndc) {
      if (held) return null;
      const h = this.hover(ndc);
      if (!h) return null;
      begin(h.e, h.point);
      held.ndc = ndc.clone();
      return h.e;
    },
    // something packed takes the stage at `at` (a box's mouth) and goes straight
    // into the hand
    grab(e, at, ndc) {
      if (held) this.cancel();
      unlink(e);
      e.kids.length = 0;
      setStored(e, false);
      e.holder.position.copy(at);
      e.holder.rotation.set(0, e.holder.rotation.y, 0);
      e.holder.scale.setScalar(0.35);
      e.holder.updateMatrixWorld(true);
      begin(e, at, { fresh: true });
      if (ndc) aim(ndc);
      return e;
    },
    aim(ndc) { if (held) aim(ndc); },
    // false: it doesn't turn (pictures follow their wall)
    rotate(steps = 1, step = STEP) {
      if (!held || held.e.wall) return false;
      held.ry = wrapAngle(held.ry + steps * step);
      if (held.ndc) aim(held.ndc);
      else {
        held.target = solve(held.p.x, held.p.z, held.ry);
        show();
      }
      return true;
    },
    // { ok } · { ok: true, out: true, entries } = carried outside: those are now
    // packed (the caller keeps them somewhere) · { ok: false } = blocked, it shakes
    drop() {
      if (!held) return { ok: false, reason: 'nothing held' };
      const t = held.target;
      if (!t) return { ok: false, reason: 'no spot yet' };
      if (t.mode === 'out') {
        const h = unheld();
        settle(h);
        for (const k of h.subtree) {
          unlink(k);
          k.kids.length = 0;
          k.holder.rotation.set(0, k.holder.rotation.y, 0);
          setStored(k, true);
        }
        onLight({ gi: h.gi });
        return { ok: true, out: true, entries: h.subtree };
      }
      if (!t.ok) {
        held.shake = 0.3;
        return { ok: false, reason: `blocked by ${t.blocker}` };
      }
      const { e } = held;
      unlink(e);
      if (t.mode === 'surface') {
        e.support = t.support;
        if (e.support.kids) e.support.kids.push(e);
      }
      release(true);
      return { ok: true };
    },
    // { e, fresh }: a fresh thing is packed again (the caller puts it back in its box)
    cancel() {
      if (!held) return null;
      const { e, from, fresh } = held;
      if (fresh) {
        unheld();
        setStored(e, true);
        return { e, fresh: true };
      }
      e.holder.position.set(from.x, from.y, from.z);
      e.holder.rotation.set(0, from.ry, 0);
      release(false);
      return { e, fresh: false };
    },

    // scripted move for the screenshot tool: same rules as the mouse
    moveTo(id, x, z, ryDeg) {
      const e = entries.find((o) => o.id === id);
      if (!e) return { ok: false, reason: 'unknown id' };
      if (!onFloor(e)) return { ok: false, reason: 'not a floor item (yet)' };
      if (landing(e)) return { ok: false, reason: 'still landing' };
      if (held) this.cancel();
      begin(e, e.holder.position);
      if (ryDeg !== undefined) held.ry = THREE.MathUtils.degToRad(ryDeg);
      held.p = { x, z };
      held.target = solve(x, z, held.ry);
      show();
      const t = held.target;
      const r = this.drop();
      if (!r.ok) {
        this.cancel();
        return r;
      }
      return { ok: true, at: [+t.x.toFixed(3), +t.z.toFixed(3)] };
    },

    get busy() { return !!held || anims.length > 0; },

    // save / load: every entry's world transform, { id: [x, y, z, ry, stored?1:0] }
    snapshot() {
      return atRest(() => {
        const r = (v) => Math.round(v * 1e4) / 1e4;
        const q = new THREE.Quaternion();
        const eul = new THREE.Euler();
        const out = {};
        for (const e of entries) {
          const p = e.holder.getWorldPosition(new THREE.Vector3());
          let ry = eul.setFromQuaternion(e.holder.getWorldQuaternion(q), 'YXZ').y;
          if (ry < -Math.PI + 1e-4) ry += Math.PI * 2; // π and -π are the same turn: one spelling
          const packed = e.stored || (held?.fresh && held.e === e);
          out[e.id] = [r(p.x), r(p.y), r(p.z), r(ry), packed ? 1 : 0];
        }
        return out;
      });
    },
    // puts everything where a snapshot says, then re-derives what rests on what;
    // the caller refreshes the lighting
    restore(snap) {
      if (held) this.cancel();
      for (const a of anims.splice(0)) {
        a.h.e.holder.position.copy(a.to);
        a.h.e.holder.scale.set(1, 1, 1);
        settle(a.h);
      }
      for (const e of entries) {
        const s = snap?.[e.id];
        if (!s) continue;
        e.holder.position.set(s[0], s[1], s[2]);
        e.holder.rotation.set(0, s[3], 0);
        e.holder.scale.set(1, 1, 1);
        setStored(e, !!s[4]);
      }
      this.link(linkedSurfaces);
    },

    // returns true while something is moving (shadow map must re-render)
    update(dt) {
      if (held) {
        const hol = held.e.holder;
        const k = 1 - Math.exp(-dt * FOLLOW);
        prev.copy(hol.position);
        hol.position.lerp(held.goal, k);
        hol.rotation.y += wrapAngle(held.goalRy - hol.rotation.y) * Math.min(1, dt * 18);
        // lean into the motion, like something carried by its top
        const inv = 1 / Math.max(dt, 1e-3);
        const vx = (hol.position.x - prev.x) * inv;
        const vz = (hol.position.z - prev.z) * inv;
        const lk = Math.min(1, dt * 10);
        held.lean.x += (THREE.MathUtils.clamp(vz * TILT, -TILT_MAX, TILT_MAX) - held.lean.x) * lk;
        held.lean.z += (THREE.MathUtils.clamp(-vx * TILT, -TILT_MAX, TILT_MAX) - held.lean.z) * lk;
        hol.rotation.x = held.lean.x;
        hol.rotation.z = held.lean.z;
        // blocked: a short shake, "no"
        if (held.shake > 0) {
          held.shake = Math.max(0, held.shake - dt);
          hol.rotation.y += Math.sin(held.shake * 70) * 0.06 * (held.shake / 0.3);
        }
        if (held.pop < 1) {
          held.pop = Math.min(1, held.pop + dt / POP_T);
          const p = held.pop - 1;
          hol.scale.setScalar(0.35 + 0.65 * (1 + 2.2 * p * p * p + 1.2 * p * p)); // ease-out with a small overshoot
        }
      }
      for (let i = anims.length - 1; i >= 0; i--) {
        const a = anims[i];
        const hol = a.h.e.holder;
        a.t = Math.min(1, a.t + dt / DROP_T);
        const fall = Math.min(1, a.t / 0.42);
        hol.position.lerpVectors(a.from, a.to, 1 - (1 - fall) ** 3);
        if (a.squash) {
          const k = a.t < 0.42 ? 0 : (a.t - 0.42) / 0.58;
          const sq = a.t < 0.42 ? 0 : Math.sin(k * Math.PI) * Math.exp(-2.2 * k) * Math.min(1, 0.6 / Math.max(a.h.e.sy, 0.3));
          hol.scale.set(1 + sq * 0.08, 1 - sq * 0.12, 1 + sq * 0.08);
        }
        if (a.t >= 1) {
          hol.scale.set(1, 1, 1);
          hol.position.copy(a.to);
          anims.splice(i, 1);
          settle(a.h);
          onLight({ gi: false }); // cube shadows at the final spot
        }
      }
      return !!held || anims.length > 0;
    },

    // debug read-out for the screenshot tool (--eval)
    describe() {
      const r = (v) => Math.round(v * 1000) / 1000;
      const q = new THREE.Quaternion();
      const eul = new THREE.Euler();
      return entries.map((e) => ({
        id: e.id,
        at: e.holder.getWorldPosition(new THREE.Vector3()).toArray().map(r),
        ry: r(eul.setFromQuaternion(e.holder.getWorldQuaternion(q), 'YXZ').y),
        size: [r(e.sx), r(e.sy), r(e.sz)],
        on: e.wall ? 'wall' : e.support ? (e.support.id ?? e.support.name) : 'floor',
        kind: kindOf(e),
        stored: !!e.stored,
      }));
    },
  };
}
