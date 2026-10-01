import * as THREE from 'three';
import { sitePoint } from './grime.js';

// The title-screen timelapse: behind the menu, the whole level plays itself in
// about forty seconds — litter into the bin, the rotten floor up, new parquet
// down, the windows wiped (the sun comes in), soot off, walls painted, the fire
// lit, the boxes unpacked, dusk and lamps — then fades and starts over. It works
// the level's own tools through a "virtual pointer" (world points projected
// through the drifting menu camera every frame), so what it shows is the game
// itself, not a recording. Captions say what each step is.
//
// The room it messes with is the live one: ui/cues.js and ui/autosave.js mute the level's sounds
// and saves while it runs, and ui/menu.js loads the player's real room when they press play.
// It plays the level's tasks in their order: the usual ones (litter, floor, windows,
// soot, paint, fire) are here; a level's own come from its def.demo[task id](game, api).

const v = new THREE.Vector3();

export function createDemo(world, { getGame, getLayout, paint, startTime, endTime = startTime + 0.17, onCaption = () => {} }) {
  const { camera } = world;
  // the steps glide the day on by offsets written for level 1's 0.45 → 0.62: each level's own
  // span instead (the neon alley's 0.8 → 0.9 ran on past 0.9 and then back to 0.8 for the dusk)
  const at = (d) => startTime + d * ((endTime - startTime) / 0.17);
  // the finale's dusk, as the reveal has it (ui/timeflow.js runTime): the level's own end if that's already evening
  const dusk = endTime >= 0.8 && endTime <= 0.9 ? endTime : 0.8;
  const { X0, X1, Z0, Z1 } = world.bounds;
  let run = 0; // bumps on stop: every pending step of an older run gives up
  let active = false;
  const ticks = new Set();
  world.onFrame((dt) => { for (const f of [...ticks]) f(dt); });

  const ndc = (p) => {
    v.copy(p).project(camera);
    return new THREE.Vector2(v.x, v.y);
  };
  // call fn(dt) every frame until it returns true (resolves true), or until the
  // run is stopped (resolves false)
  function frames(fn) {
    const id = run;
    return new Promise((res) => {
      const tick = (dt) => {
        if (id !== run) {
          ticks.delete(tick);
          res(false);
        } else if (fn(dt)) {
          ticks.delete(tick);
          res(true);
        }
      };
      ticks.add(tick);
    });
  }
  const wait = (s) => {
    let t = 0;
    return frames((dt) => (t += dt) >= s);
  };
  const P = (x, y, z) => new THREE.Vector3(x, y, z);

  // move a point along a polyline at `speed` m/s, calling at(p) each frame
  function along(pts, speed, at) {
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = pts[i].distanceTo(pts[i - 1]);
      seg.push(l);
      total += l;
    }
    let d = 0;
    const p = new THREE.Vector3();
    return frames((dt) => {
      d = Math.min(total, d + speed * dt);
      let r = d;
      let i = 0;
      while (i < seg.length - 1 && r > seg[i]) r -= seg[i++];
      p.lerpVectors(pts[i], pts[i + 1], seg[i] ? Math.min(1, r / seg[i]) : 1);
      at(p);
      return d >= total;
    });
  }
  // a tool stroke: press at the first point, drag along the rest, let go
  async function stroke(tool, pts, speed) {
    tool.down(ndc(pts[0]));
    const ok = await along(pts, speed, (p) => tool.move(ndc(p)));
    tool.up(ndc(pts[pts.length - 1]), { click: false });
    return ok;
  }
  // the time of day in a slow glide (keepSwitches: lamps and fire left alone)
  function glideTime(to, dur, keepSwitches = true) {
    const from = world.time;
    let t = 0;
    let acc = 0;
    return frames((dt) => {
      t = Math.min(1, t + dt / dur);
      acc -= dt;
      if (acc <= 0 || t >= 1) {
        acc = 0.12;
        world.applyTime(THREE.MathUtils.lerp(from, to, t * t * (3 - 2 * t)), { fromUser: true, keepSwitches });
      }
      return t >= 1;
    });
  }
  // wipe what's left of a mask away (a hurried tidy-up the camera barely sees)
  function fadeMask(mask, dur) {
    let t = 0;
    return frames((dt) => {
      t += dt;
      const g = mask.g;
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = Math.min(1, (dt / dur) * 2.5);
      g.fillRect(0, 0, mask.w, mask.h);
      g.restore();
      mask.touch();
      return t >= dur;
    });
  }

  // ---- the steps ----------------------------------------------------------------------------
  async function litter(game) {
    if (!await wait(1.2)) return false;
    const tr = game.L.trash;
    const bin = game.L.bin.holder.position;
    const binTop = P(bin.x, 0.52, bin.z);
    for (let loads = 0; loads < 6; loads++) {
      const left = tr.pieces.filter((p) => p.state === 'floor');
      if (!left.length) break;
      // a greedy walk from the piece nearest the bin, nine pieces a load
      const route = [];
      let at = binTop.clone().setY(0);
      for (let k = 0; k < 9 && left.length; k++) {
        let bi = 0;
        left.forEach((p, i) => { if (p.mesh.position.distanceTo(at) < left[bi].mesh.position.distanceTo(at)) bi = i; });
        const p = left.splice(bi, 1)[0];
        at = p.mesh.position.clone();
        route.push(at.clone().setY(0.03));
      }
      if (!tr.begin(ndc(route[0]))) break;
      if (!await along([...route, binTop], 9, (p) => tr.move(ndc(p)))) return false;
      tr.end();
      if (!await wait(0.15)) return false;
    }
    return true;
  }

  const rows = (step, pad) => {
    const pts = [];
    for (let z = Z0 + pad, k = 0; z <= Z1 - pad + 1e-6; z += step, k++) {
      pts.push(P(k % 2 ? X1 - pad : X0 + pad, 0, z), P(k % 2 ? X0 + pad : X1 - pad, 0, z));
    }
    return pts;
  };
  async function pry(game) {
    const { crowbar } = game.tools;
    if (!await stroke(crowbar, rows(0.4, 0.25), 24)) return false;
    crowbar.release();
    game.L.floor.pry(0, 0, 20, 999); // whatever the sweep missed goes in one last burst
    await glideTime(at(0.03), 0.6);
    return wait(0.5);
  }
  async function lay(game) {
    const { planks } = game.tools;
    if (!await stroke(planks, rows(0.5, 0.3), 24)) return false;
    planks.release();
    game.L.floor.lay(0, 0, 20, 999);
    return wait(0.6);
  }

  async function windows(game) {
    const sq = game.tools.squeegee;
    for (const { w } of game.L.grime.windows) {
      const pts = [];
      const e = w.w / 2 - 0.06;
      for (let y = -w.h / 2 + 0.1, k = 0; y < w.h / 2 - 0.05; y += 0.1, k++) {
        pts.push(sitePoint(w, k % 2 ? -e : e, y), sitePoint(w, k % 2 ? e : -e, y));
      }
      if (!await stroke(sq, pts, 11)) return false;
    }
    sq.release();
    await glideTime(at(0.08), 1.0);
    return true;
  }

  async function soot(game) {
    const br = game.tools.brush;
    const S = game.L.grime.soot.site;
    const hole = S.hole ?? { w: 0, h: 0 };
    const at = (x, y) => sitePoint(S, x, y - S.h / 2); // y from the bottom of the surround
    const pts = [];
    // the lintel and both legs, a quick scribble
    for (let y = S.h - 0.03, k = 0; y > hole.h + 0.02; y -= 0.05, k++) pts.push(at((k % 2 ? 1 : -1) * (S.w / 2 - 0.04), y));
    for (const side of [-1, 1]) for (let y = hole.h - 0.01, k = 0; y > 0.1; y -= 0.12, k++) pts.push(at(side * (k % 2 ? hole.w / 2 + 0.02 : S.w / 2 - 0.02), y));
    if (!await stroke(br, pts, 7)) return false;
    br.release();
    return fadeMask(game.L.grime.soot.mask, 0.5);
  }

  async function paintWalls(game) {
    const roller = game.tools.roller;
    const top = world.sites.walls?.top ?? world.bounds.H;
    roller.setColor(paint);
    for (let y = 0.3, k = 0; y < top - 0.05; y += 0.48, k++) {
      // along the left wall to the corner, then along the back wall (the chimney
      // breast is in front of it: the roller finds whichever face the ray meets)
      const row = [P(X0 + 0.01, y, Z1 - 0.25), P(X0 + 0.01, y, Z0 + 0.02), P(X0 + 0.02, y, Z0 + 0.01), P(X1 - 0.25, y, Z0 + 0.01)];
      roller.setColor(paint); // a fresh dip each row: it's a timelapse
      if (!await stroke(roller, k % 2 ? row.reverse() : row, 30)) return false;
    }
    roller.release();
    if (game.L.walls.progress < 0.92) game.L.walls.fillGaps(paint);
    return glideTime(at(0.13), 0.8);
  }

  async function fire() {
    if (!await wait(0.6)) return false;
    world.setFireAllowed(true, { lit: true });
    return true;
  }

  // the usual tasks; a level's own come with it (def.demo) and get these helpers
  const STEPS = { trash: litter, pry, lay, windows, soot, paint: paintWalls, fire };
  // (at(d): the time of day d into the repairs, in level 1's units — 0.03 after the floor, 0.08 after
  // the windows, 0.13 after the paint)
  const api = { world, frames, wait, along, stroke, glideTime, fadeMask, ndc, P, startTime, at };

  // things out of their boxes, each on a hop to where it belongs
  function fly(e, from, pose, dur) {
    const hol = e.holder;
    const to = P(pose[0], pose[1], pose[2]);
    const lift = 0.35 + from.distanceTo(to) * 0.12;
    hol.rotation.set(0, pose[3], 0);
    let t = 0;
    return frames((dt) => {
      t = Math.min(1, t + dt / dur);
      const k = 1 - (1 - t) ** 2;
      hol.position.lerpVectors(from, to, k);
      hol.position.y += Math.sin(t * Math.PI) * lift;
      hol.scale.setScalar(0.35 + 0.65 * Math.min(1, t * 2.2));
      world.shadowsDirty();
      if (t < 1) return false;
      hol.position.copy(to);
      hol.scale.set(1, 1, 1);
      return true;
    });
  }
  async function unpack(game) {
    const { boxes } = game.L;
    const layout = getLayout();
    const { decor } = world;
    for (const b of boxes.list) {
      const flights = [];
      for (;;) {
        const id = boxes.take(b);
        if (!id) break;
        const e = decor.entries.find((x) => x.id === id);
        const s = layout[id];
        if (!e || !s) continue;
        const from = b.e.holder.position.clone().setY(b.size.h * 0.7);
        decor.setStored(e, false);
        e.holder.position.copy(from);
        flights.push(fly(e, from, s, 0.55));
        if (!await wait(0.2)) return false;
      }
      if (!(await Promise.all(flights)).every(Boolean)) return false;
      decor.link();
      world.lightingChanged();
      boxes.foldIfEmpty(b);
    }
    return true;
  }

  async function play() {
    const id = run;
    const alive = () => id === run && active;
    const game = getGame();
    for (const k of game.tasks) {
      const step = game.def.demo?.[k.id] ?? STEPS[k.id];
      onCaption(k.id);
      if (!await (step ? step(game, api) : wait(1.2)) || !alive()) return;
    }
    // the level notices the repairs are done and the boxes arrive (a step that fell a
    // speck short is finished for it)
    let late = 0;
    if (!await frames((dt) => game.phase === 'unpack' || (late += dt) > 1.5) || !alive()) return;
    if (game.phase === 'restore') game.completeRepairs();
    onCaption('unpack');
    if (!await wait(1.0) || !await unpack(game) || !alive()) return;
    await frames(() => game.phase === 'done');
    onCaption('done');
    await glideTime(dusk, 3.2, false); // dusk: the lamps come on
    if (!await wait(7) || !alive()) return;
    onCaption(null);
    await reset();
    if (alive()) play();
  }

  // back to the run-down room, behind a quick fade of the room (not the menu)
  const canvas = world.renderer.domElement;
  canvas.style.transition = 'opacity 0.6s ease';
  async function reset({ fade = true } = {}) {
    const id = run;
    if (fade) {
      canvas.style.opacity = '0';
      await wait(0.65);
      if (id !== run) return;
    }
    const game = getGame();
    for (const t of Object.values(game.tools)) t.release?.();
    game.fresh(getLayout());
    game.tools.roller?.setColor(game.def.paints[0]);
    world.applyTime(startTime);
    world.lightingChanged({ soft: false });
    // let the bounce light settle before the room comes back
    let t = 0;
    await frames((dt) => (t += dt) > 3 || (t > 0.5 && !world.gi.busy));
    if (fade) canvas.style.opacity = '1';
  }

  return {
    get active() { return active; },
    // the room is expected fresh (main.js loads it that way for the title)
    start() {
      if (active) return;
      active = true;
      run++;
      play();
    },
    // leave everything where it is: the caller loads the real room next
    stop() {
      if (!active) return;
      active = false;
      run++;
      const game = getGame();
      for (const t of Object.values(game.tools)) t.release?.();
      canvas.style.opacity = '1';
      onCaption(null);
    },
  };
}
