import * as THREE from 'three';

// The timelapse of a room the player made: their journal (journal.js) played back
// through the level's own tools and systems, sped up to under a minute, while the
// day goes by — morning as the work starts, golden hour as the boxes come out, dusk
// and the lamps coming on at the end, then a slow turn around the room at night.
// Like the title timelapse (demo.js) it works the live world and level: the caller
// mutes sounds and saves while it runs, and puts the real room back afterwards
// (play() ends with the room faded out).

const FLOOR_SPEED = 3; // m/s of a floor stroke at 1× (the pointer's pace, roughly)
const SURF_SPEED = 1.6;
const BUDGET = 48; // seconds the work may take on screen (sped up to fit; never slowed down)
const CHAPTER = 7; // at most this long on screen for one kind of work (sped up further)
const MOVE_GAP = 0.3; // seconds between things coming out of the boxes
const START = 0.04; // morning
const WORK_END = 0.66; // golden hour when the last thing is done
const CAPTION = { bin: 'trash', pry: 'pry', lay: 'lay', wipe: 'windows', scrub: 'soot', paint: 'paint', fire: 'fire', move: 'unpack' };
// a level's own kinds: its surface tools' strokes play like these (a tool whose `kind`
// is the entry's), anything else goes to the level's def.replay[kind](game, entry, speed)
// → Promise<boolean>; captions from def.captions[kind] (i18n demo.<caption>)

// the time of day as a wall clock (07:00 in the morning … 22:00 at night)
const CLOCK = [[0, 7], [0.35, 13.5], [0.62, 17.5], [0.8, 19], [0.88, 20], [1, 22]];
export function clockOf(t) {
  let i = 0;
  while (i < CLOCK.length - 2 && t > CLOCK[i + 1][0]) i++;
  const [a, ha] = CLOCK[i];
  const [b, hb] = CLOCK[i + 1];
  const h = ha + (hb - ha) * THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  const m = Math.round(h * 60 / 10) * 10;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function createReplay(world, { getGame, getLayout, hero, onCaption = () => {}, onClock = () => {} }) {
  const { camera, controls, decor } = world;
  let run = 0;
  let active = false;
  let stats = null; // the last run: how much there was, how fast it went, whether the repairs needed a push
  const ticks = new Set();
  world.onFrame((dt) => { for (const f of [...ticks]) f(dt); });

  // fn(dt) every frame until it returns true (→ true), or until stopped (→ false)
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
  // along points at `speed` m/s: at(i, k) with the segment and how far along it
  function walk(pts, speed, at) {
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      seg.push(pts[i].distanceTo(pts[i - 1]));
      total += seg[i - 1];
    }
    let d = 0;
    return frames((dt) => {
      d = Math.min(total, d + speed * dt);
      let r = d;
      let i = 0;
      while (i < seg.length - 1 && r > seg[i]) r -= seg[i++];
      at(i, seg[i] ? Math.min(1, r / seg[i]) : 1);
      return d >= total;
    });
  }
  const lengthOf = (pts) => pts.reduce((a, p, i) => (i ? a + p.distanceTo(pts[i - 1]) : 0), 0);

  // ---- entries → something to play, and how long it takes at 1× ------------------------------
  function floorPts(flat) {
    const out = [];
    for (let i = 0; i < flat.length; i += 2) out.push(new THREE.Vector3(flat[i], 0, flat[i + 1]));
    return out;
  }
  function surfPts(flat) {
    const out = [];
    for (let i = 0; i < flat.length; i += 5) out.push({ px: flat[i], py: flat[i + 1], p: new THREE.Vector3(flat[i + 2], flat[i + 3], flat[i + 4]) });
    return out;
  }
  const surfaceTool = (game, kind) => Object.values(game.tools).find((t) => t.kind === kind && t.replay?.target);
  const captionOf = (game, kind) => game.def.captions?.[kind] ?? CAPTION[kind];
  function plan(entries, game) {
    return entries.map((e) => {
      const kind = e[1];
      if (kind === 'pry' || kind === 'lay') {
        const pts = floorPts(e[2]);
        return { kind, pts, cost: lengthOf(pts) / FLOOR_SPEED + 0.08 };
      }
      if (surfaceTool(game, kind)) {
        const pts = surfPts(e[e.length - 1]);
        return { kind, surface: true, item: e[2], color: e.length > 4 ? e[3] : null, pts, cost: lengthOf(pts.map((q) => q.p)) / SURF_SPEED + 0.08 };
      }
      if (kind === 'bin') {
        const pieces = e[2].map((i) => game.L.trash.pieces[i]).filter(Boolean);
        const pts = pieces.map((p) => p.mesh.position.clone().setY(0));
        return { kind, ids: e[2], cost: 0.4 + lengthOf(pts) / 5 };
      }
      // (what the level leaves in the room from the start — def.stay — may be moved during the
      // repairs, e.g. level 4's pots carried into the sun: that isn't the unpacking starting)
      if (kind === 'move') return { kind, poses: e[2], cost: 0.25, stay: Object.keys(e[2]).every((id) => game.def.stay?.includes(id)) };
      if (kind === 'fire') return { kind, on: !!e[2], cost: 0.7 };
      if (kind === 'lamp') return { kind, name: e[2], on: !!e[3], cost: 0.3 };
      if (game.def.replay?.[kind]) return { kind, entry: e, cost: game.def.replayCost?.[kind]?.(e) ?? 0.4 };
      return { kind, cost: 0 };
    });
  }

  // ---- playing each kind ---------------------------------------------------------------------------
  async function floorStroke(game, s, speed) {
    const tool = s.kind === 'pry' ? game.tools.crowbar : game.tools.planks;
    tool.replay.down(s.pts[0]);
    const ok = s.pts.length < 2 || await walk(s.pts, speed, (i, k) => tool.replay.move(s.pts[i].clone().lerp(s.pts[i + 1] ?? s.pts[i], k)));
    tool.replay.up();
    return ok;
  }
  async function surfStroke(game, s, speed) {
    const tool = surfaceTool(game, s.kind);
    const target = tool?.replay.target(s.item);
    if (target?.item == null) return true; // (an item can be 0: the first face of the walls)
    const { item, normal } = target;
    if (s.color) tool.setColor?.(s.color); // a fresh dip every stroke: the trips to the tray aren't kept
    const hit = (a, b, k) => ({
      item, normal,
      px: a.px + (b.px - a.px) * k,
      py: a.py + (b.py - a.py) * k,
      point: a.p.clone().lerp(b.p, k),
    });
    tool.replay.down(hit(s.pts[0], s.pts[0], 0));
    const ok = s.pts.length < 2 || await walk(s.pts.map((q) => q.p), speed, (i, k) => tool.replay.move(hit(s.pts[i], s.pts[i + 1] ?? s.pts[i], k)));
    tool.replay.up();
    return ok;
  }
  // litter gathered in the order it was, the ball carried to the bin
  async function binBall(game, s, speed) {
    const tr = game.L.trash;
    const b = tr.bin;
    const ids = s.ids.filter((i) => tr.pieces[i]?.state === 'floor');
    if (!ids.length || !b) return true;
    const route = ids.map((i) => tr.pieces[i].mesh.position.clone().setY(0));
    route.push(new THREE.Vector3(b.x, 0, b.z));
    tr.pick(ids[0], route[0]);
    let k = 1;
    const at = new THREE.Vector3();
    const ok = await walk(route, speed * 1.2, (i, f) => {
      // reaching a piece takes it into the ball
      for (; k <= i && k < ids.length; k++) tr.pick(ids[k], route[k]);
      tr.carry(at.copy(route[i]).lerp(route[i + 1] ?? route[i], f));
    });
    tr.toBin();
    tr.end();
    return ok;
  }
  // things out of their boxes (or across the room), each on a hop to where it went
  function fly(e, from, pose, dur) {
    const hol = e.holder;
    const to = new THREE.Vector3(pose[0], pose[1], pose[2]);
    const lift = 0.3 + from.distanceTo(to) * 0.1;
    const r0 = hol.rotation.y;
    let t = 0;
    return frames((dt) => {
      t = Math.min(1, t + dt / dur);
      const k = 1 - (1 - t) ** 2;
      hol.position.lerpVectors(from, to, k);
      hol.position.y += Math.sin(t * Math.PI) * lift;
      hol.rotation.y = r0 + (pose[3] - r0) * k;
      world.shadowsDirty();
      if (t < 1) return false;
      hol.position.copy(to);
      hol.rotation.y = pose[3];
      return true;
    });
  }
  const landing = [];
  let inFlight = 0;
  function moveThings(game, s) {
    const { boxes } = game.L;
    const flights = [];
    const emptied = new Set();
    for (const [id, p] of Object.entries(s.poses)) {
      const e = decor.entries.find((x) => x.id === id);
      if (!e) continue;
      if (p[4]) {
        // carried out: into the put-aside box
        if (!e.stored) {
          decor.setStored(e, true);
          boxes.lose([e], { quiet: true });
        }
        continue;
      }
      let from = e.holder.position.clone();
      if (e.stored) {
        const b = boxes.takeOut(id);
        if (b) {
          from = b.e.holder.position.clone().setY(b.size.h * 0.7);
          emptied.add(b);
        }
        decor.setStored(e, false);
        e.holder.position.copy(from);
        e.holder.scale.setScalar(1);
      }
      flights.push(fly(e, from, p, 0.55));
    }
    // (not awaited: the next thing may come out while these land) — what rests on what
    // is worked out once nothing is in the air
    inFlight++;
    landing.push(Promise.all(flights).then(() => {
      if (--inFlight === 0) decor.link();
      world.lightingChanged();
      for (const b of emptied) boxes.foldIfEmpty(b);
    }));
  }

  // ---- the day and the camera ---------------------------------------------------------------------
  let dayT = START;
  let lightAcc = 0;
  let giAcc = 0;
  function setTime(t) {
    dayT = t;
    onClock(clockOf(t));
  }
  // the sun and sky follow every 0.1 s; the bounce light is redone a sweep at a time
  world.onFrame((dt) => {
    if (!active) return;
    lightAcc -= dt;
    giAcc -= dt;
    if (lightAcc > 0) return;
    lightAcc = 0.1;
    const gi = giAcc <= 0;
    if (gi) giAcc = 1.2;
    world.applyTime(dayT, { fromUser: true, keepSwitches: !switches, sweeps: gi ? 1 : 0 });
  });
  let switches = false; // the lamps may switch themselves (the dusk at the end)
  let working = null; // while the work plays: moves the day on (dt)
  world.onFrame((dt) => working?.(dt));
  function glide(to, dur) {
    const from = dayT;
    let t = 0;
    return frames((dt) => {
      t = Math.min(1, t + dt / dur);
      setTime(THREE.MathUtils.lerp(from, to, t * t * (3 - 2 * t)));
      return t >= 1;
    });
  }
  // a slow swing around the room, from a little left of the usual view to a little right
  let orbit = 0;
  let orbitTotal = 1;
  let filming = false; // (not while the room is being reset behind the fade)
  const up = new THREE.Vector3(0, 1, 0);
  world.onFrame((dt) => {
    if (!active || !filming) return;
    orbit += dt;
    const k = Math.min(1, orbit / orbitTotal);
    const a = -0.32 + 0.6 * (k * k * (3 - 2 * k));
    const off = hero.pos.clone().sub(hero.look).applyAxisAngle(up, a).multiplyScalar(1.04 - 0.06 * k);
    camera.position.copy(hero.look).add(off);
    controls.target.copy(hero.look);
    camera.lookAt(hero.look);
  });

  // ---- the whole thing -------------------------------------------------------------------------------
  const canvas = world.renderer.domElement;
  async function fadeTo(on) {
    canvas.style.transition = 'opacity 0.6s ease';
    canvas.style.opacity = on ? '1' : '0';
    return wait(0.65);
  }

  // one run of the same kind of work, at its own speed
  async function chapter(game, c) {
    for (const s of c.steps) {
      if (s.kind === 'move' && !s.stay && game.phase === 'restore') {
        // the boxes come once every repair is done: the level notices by itself, or is told
        await frames(((t) => (dt) => (t += dt) > 1.5 || game.phase !== 'restore')(0));
        if (game.phase === 'restore') {
          stats.toldToFinish = game.taskView().filter((k) => !k.done).map((k) => `${k.id}:${Math.round(k.p * 100)}`).join(' ');
          game.completeRepairs();
        }
      }
      let ok = true;
      if (s.kind === 'pry' || s.kind === 'lay') ok = await floorStroke(game, s, FLOOR_SPEED * c.speed);
      else if (s.surface) ok = await surfStroke(game, s, SURF_SPEED * c.speed);
      else if (s.kind === 'bin') ok = await binBall(game, s, 5 * c.speed);
      else if (s.kind === 'move') {
        moveThings(game, s);
        ok = await wait(c.moveGap);
      } else if (s.kind === 'fire') {
        world.setFireAllowed(true, { lit: s.on });
        ok = await wait(s.cost / c.speed);
      } else if (s.kind === 'lamp') {
        const l = world.fixtures.lamps.find((x) => x.name === s.name);
        if (l) l.target = s.on ? 1 : 0;
        ok = await wait(s.cost / c.speed);
      } else if (s.entry) ok = await game.def.replay[s.kind](game, s.entry, c.speed, { frames, wait, walk });
      if (!ok) return false;
    }
    return true;
  }

  // pace: everything sped up alike to fit BUDGET, but no chapter (a run of the same kind
  // of work) longer than CHAPTER on screen, and the unpacking never rushed
  function pace(steps, game) {
    const chapters = [];
    for (const s of steps) {
      const cap = captionOf(game, s.stay ? 'stay' : s.kind) ?? chapters.at(-1)?.cap ?? null;
      if (!chapters.length || chapters.at(-1).cap !== cap) chapters.push({ cap, steps: [], raw: 0, moves: 0 });
      const c = chapters.at(-1);
      c.steps.push(s);
      if (s.kind === 'move') c.moves++;
      else c.raw += s.cost;
    }
    const raw = chapters.reduce((a, c) => a + c.raw, 0);
    const speed0 = Math.max(1, raw / BUDGET);
    let total = 0;
    for (const c of chapters) {
      c.speed = Math.max(speed0, c.raw / CHAPTER);
      c.moveGap = c.moves ? Math.min(MOVE_GAP, (CHAPTER + 2) / c.moves) : 0;
      c.time = c.raw / c.speed + c.moves * c.moveGap + 0.35;
      total += c.time;
    }
    return { chapters, raw, speed0, total };
  }

  async function play(journal) {
    const game = getGame();
    run++;
    active = true;
    const id = run;
    const alive = () => id === run;
    switches = false;
    filming = false;
    working = null;
    orbit = 0;
    landing.length = 0;
    inFlight = 0;
    // back to the run-down room, behind a fade, the bounce light settled first
    if (!await fadeTo(false)) return false;
    for (const t of Object.values(game.tools)) t.release?.();
    game.fresh(getLayout());
    game.tools.roller?.setColor(game.def.paints[0]);
    for (const l of world.fixtures.lamps) l.target = 0; // they come on at dusk, by themselves
    camera.fov = world.fitFov(hero.fov);
    camera.updateProjectionMatrix();
    setTime(START);
    world.applyTime(START, { keepSwitches: true });
    world.lightingChanged({ soft: false });
    let settle = 0;
    await frames((dt) => (settle += dt) > 3 || (settle > 0.5 && !world.gi.busy));
    if (!alive()) return false;

    const { chapters, raw, speed0, total } = pace(plan(journal?.e ?? [], game), game);
    stats = {
      entries: journal?.e?.length ?? 0, raw: +raw.toFixed(1), speed: +speed0.toFixed(2), work: +total.toFixed(1),
      chapters: chapters.map((c) => `${c.cap}:${c.time.toFixed(1)}`).join(' '), toldToFinish: false,
    };
    orbitTotal = total + 12;
    // the day moves on with the work, smoothly
    let elapsed = 0;
    working = (dt) => {
      elapsed += dt;
      setTime(THREE.MathUtils.lerp(START, WORK_END, Math.min(1, elapsed / total)));
    };
    filming = true;
    await fadeTo(true);
    for (const c of chapters) {
      if (!alive()) return false;
      if (c.cap) onCaption(c.cap);
      if (!await wait(0.35) || !await chapter(game, c)) return false;
    }
    working = null;
    await Promise.all(landing);
    if (!alive()) return false;
    // the evening: the lamps come on by themselves, then a while at night
    onCaption('done');
    switches = true;
    if (!await glide(0.8, 3.2) || !await glide(0.93, 4) || !await wait(3)) return false;
    onCaption(null);
    await fadeTo(false);
    active = false;
    return alive();
  }

  return {
    get active() { return active; },
    get stats() { return stats; },
    play,
    // anything in progress gives up; the caller puts the room back (the canvas is left faded)
    stop() {
      if (!active) return;
      active = false;
      working = null;
      run++;
      const game = getGame();
      for (const t of Object.values(game.tools)) t.release?.();
      onCaption(null);
    },
  };
}
