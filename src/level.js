import { createTrash, makeBin } from './trash.js';
import { createFloor } from './floor.js';
import { createWalls } from './walls.js';
import { createGrime } from './grime.js';
import { createHand } from './tools/hand.js';
import { createCrowbar, createPlanks } from './tools/floorTools.js';
import { createSqueegee, createBrush, createRoller, makeTray } from './tools/surfaceTools.js';
import { createBoxes } from './boxes.js';
import { createJournal } from './journal.js';
import { liveMasks } from './masks.js';
import { t, has } from './i18n.js';

// One playable place: its phases (restore → unpack → done), the task list, the
// systems the tasks read (litter, floor, walls, grime, and whatever the level adds),
// the tools, and its save.
//   restore : checklist of repairs — furniture is packed away
//   unpack  : moving boxes on the floor; each click on one hands you the next thing
//             to place (boxes.js). The list shows what's left per box.
//   done    : every box empty — the room is the player's
// The level (def, src/levels/<id>.js — format in levels/meadow.js) says what the room
// starts with and what to do; the room (world.room + its module's sites) says where.
// Only the systems its tasks' tools need are made: a level without a paint task has
// no walls system and no roller.
const TOOL_ORDER = ['hand', 'crowbar', 'planks', 'squeegee', 'brush', 'roller'];

export function createLevel(world, def, { sound, rub = () => {}, onTask = () => {}, onPhase = () => {}, onToolChange = () => {}, onNote = () => {} }) {
  const { decor, scene, camera, room, gi } = world;
  const sites = world.sites ?? {};
  const bounds = { x0: world.bounds.X0, x1: world.bounds.X1, z0: world.bounds.Z0, z1: world.bounds.Z1 };
  // what the player does, for the timelapse (replay.js); main.js switches it on while they play
  const journal = createJournal({ decor, room, fixtures: world.fixtures });
  const used = new Set(['hand', ...def.tasks.map((k) => k.tool), ...(def.tools ?? [])]);
  const uses = (id) => used.has(id);

  // the bin is a floor item like any other: it can be moved, and things collide with it
  let bin = null;
  if (def.bin) {
    const binObj = makeBin();
    binObj.position.set(def.bin.x, 0, def.bin.z);
    bin = decor.adopt(binObj, { id: 'bin', big: true });
    gi.patchScene(bin.holder);
  }

  const trash = def.trash ? createTrash(scene, {
    camera, bounds, avoid: room.obstacles, counts: def.trash.counts, seed: def.trash.seed,
    kinds: def.trash.kinds, blownIn: def.trash.blownIn,
    getBin: () => (!bin || bin.stored ? null : bin.holder),
    onBinned: (ids) => journal.binned(ids),
  }) : null;
  if (trash) gi.patchScene(trash.group);
  const trash0 = trash?.serialize();
  const floor = uses('crowbar') || uses('planks') ? createFloor(scene, { room, bounds, gi }) : null;
  const walls = uses('roller') ? createWalls(room, sites.walls) : null;
  const grime = uses('squeegee') || uses('brush')
    ? createGrime(scene, { gi, sites: { windows: uses('squeegee') ? sites.windows : [], soot: uses('brush') ? sites.soot : null } })
    : null;
  let tray = null;
  if (walls) {
    tray = makeTray();
    tray.position.set(def.tray.x, 0, def.tray.z);
    tray.rotation.y = def.tray.ry ?? 0;
    scene.add(tray);
    gi.patchScene(tray);
  }

  const boxes = createBoxes(world, def, { sound });

  const L = { trash, bin, floor, walls, grime, room, boxes, world };
  const tools = {};
  const make = {
    hand: () => createHand(world, { trash, boxes, sound }),
    crowbar: () => createCrowbar(world, floor, { sound, rec: journal.floor('pry') }),
    planks: () => createPlanks(world, floor, { sound, rec: journal.floor('lay'), plainMat: floor.plainMat }),
    squeegee: () => createSqueegee(world, grime, { rub, rec: journal.surface('wipe', { itemOf: (it) => grime.windows.indexOf(it) }) }),
    brush: () => createBrush(world, grime, { rub, rec: journal.surface('scrub') }),
    roller: () => createRoller(world, walls, {
      sound, rub, colors: def.paints, tray, onChange: () => onToolChange(),
      rec: journal.surface('paint', { itemOf: (face) => face, colorOf: () => tools.roller.color }),
    }),
  };
  for (const id of TOOL_ORDER) if (uses(id)) tools[id] = make[id]();

  // the level's own systems and tools (its twist): each system can
  //   fresh() · finished() · serialize() · restore(s, { early }) (may be async) ·
  //   update(dt) → true when something that casts shadows moved · complete() (all done at once)
  // (ctx.state() = { phase, toolId, done(taskId) } for systems that follow the game ·
  // ctx.note(text): a line for the player, e.g. why something just happened)
  const state = () => ({ phase, toolId, done: (id) => !!task(id)?.done });
  const extra = def.setup?.({ world, L, journal, sound, rub, onToolChange, tools, def, state, note: onNote }) ?? {};
  const own = extra.systems ?? {};
  Object.assign(L, own);
  Object.assign(tools, extra.tools ?? {});
  const order = def.tools ?? Object.keys(tools);
  const toolIds = order.filter((id) => tools[id]);

  let toolId = 'hand';
  const tasks = def.tasks.map((k) => ({ ...k, p: 0, done: false }));
  let phase = 'restore';
  let evalT = 0;
  // no task is judged until the room is set up: a save restores its masks from
  // images (async), and an empty mask in the meantime would read as "all clean"
  let live = false;
  // the level's story so far: the room as first seen and as finished (small JPEGs
  // for the reveal and the places card), and whether it was ever finished
  let meta = { before: null, after: null, complete: false };

  // (what the level leaves in the room from the start — def.stay — is never packed)
  const stay = new Set(def.stay ?? []);
  const furniture = () => decor.entries.filter((e) => e !== bin && !e.crate && !stay.has(e.id));
  const task = (id) => tasks.find((x) => x.id === id);
  const locked = (k) => (k.requires ?? []).some((id) => !task(id)?.done);
  // a task's name: the level's own words for it, else the shared ones (i18n)
  const label = (id) => t(has(`task.${def.id}.${id}`) ? `task.${def.id}.${id}` : `task.${id}`);

  // what goes with a phase (the furniture itself is packed / unpacked by the callers)
  function setPhase(p, { quiet = false } = {}) {
    phase = p;
    journal.rebase(); // the boxes coming and going are the level's doing, not the player's
    // restore: bin out · later: the bin goes, the rug is down (it came with the movers)
    const early = p === 'restore';
    if (bin) decor.setStored(bin, !early);
    if (room.rug) room.rug.visible = !early;
    syncTray();
    if (!quiet) onPhase(p);
  }
  function packAll() {
    for (const e of furniture()) decor.setStored(e, true);
    decor.link();
  }
  // the paint tray stands out during the repairs; later only while the roller is in hand
  function syncTray() {
    if (tray) tray.visible = phase === 'restore' || toolId === 'roller';
  }

  function evaluate() {
    if (!live) return;
    if (phase === 'restore') {
      for (const k of tasks) {
        if (k.done || locked(k)) continue;
        // shown against the threshold: the bar is full exactly when it's done
        k.p = Math.min(1, k.progress(L) / (k.threshold ?? 1));
        if (k.p >= 1) {
          k.done = true;
          k.p = 1;
          finishFading(k);
          syncFire();
          onTask(k);
          world.lightingChanged();
          toHandIfDone();
        }
      }
    }
    if (phase === 'restore' && tasks.every((k) => k.done)) {
      boxes.fill();
      setPhase('unpack');
      world.lightingChanged();
    } else if (phase === 'unpack' && boxes.left === 0 && !decor.held) {
      setPhase('done');
    }
  }

  // a job done at its threshold tidies up the rest — the last specks of dirt, the missed bits
  // of paint — and whatever that changed fades there over ~1.5 s instead of snapping in one
  // frame (playtest 2026-09-30); the light is worked out again once it has landed
  const FINISH_FADE = 1.5;
  function finishFading(k) {
    const before = liveMasks().map((m) => ({ m, v: m.version, from: m.snapshot() }));
    k.finish?.(L, { world, tools });
    const fades = before.filter((b) => b.m.version !== b.v).map((b) => b.m.fadeFrom(b.from, FINISH_FADE));
    if (fades.length) Promise.all(fades).then(() => world.lightingChanged());
  }

  // once all that's left is work for the hand (lighting the fire, the last litter, the
  // boxes), the hand comes back by itself: the other tools have nothing more to do, and
  // players kept clicking the fireplace with the brush still in hand (playtest 2026-09-30)
  // (a job still locked behind the hand's — the neon alley's lantern waits on the stove — isn't
  // the next thing to do: it doesn't keep the brush in hand)
  function toHandIfDone() {
    if (toolId === 'hand' || tasks.some((x) => !x.done && !locked(x) && x.tool !== 'hand')) return;
    tools[toolId].release?.();
    toolId = 'hand';
    syncTray();
    onToolChange();
  }

  // the fireplace may be lit once what the fire task waits on is done (level 1: the soot)
  const fireUnlocked = () => {
    const f = task('fire');
    return f ? !locked(f) : true;
  };
  function syncFire({ lit } = {}) {
    world.setFireAllowed(fireUnlocked(), { lit });
  }

  // every repair done at once (the timelapse, if its replay of them fell a speck short)
  function completeRepairs() {
    for (const k of tasks) {
      if (k.done) continue;
      k.done = true;
      k.p = 1;
      k.finish?.(L, { world, tools });
    }
    // what no task tidies up by itself
    if (floor && (floor.pryProgress < 1 || floor.layProgress < 1)) floor.setAll('new');
    if (trash && trash.progress < 1) trash.clearAll();
    for (const s of Object.values(own)) s.complete?.();
    if (room.setFire && !room.fireOn) world.setFireAllowed(true, { lit: true });
    if (phase === 'restore') {
      boxes.fill();
      setPhase('unpack', { quiet: true });
    }
    world.lightingChanged();
  }

  return {
    def,
    L,
    tasks,
    journal,
    completeRepairs,
    get phase() { return phase; },
    get live() { return live; },
    get meta() { return meta; },
    get fireUnlocked() { return fireUnlocked(); },
    // 0..1 over the whole level: the repairs weigh 65%, the unpacking the rest
    get progress() {
      const rp = tasks.reduce((a, k) => a + (k.done ? 1 : k.p), 0) / tasks.length;
      if (phase === 'restore') return 0.65 * rp;
      return 0.65 + 0.35 * (boxes.total ? 1 - boxes.left / boxes.total : 1);
    },
    get tool() { return tools[toolId]; },
    get toolId() { return toolId; },
    get toolIds() { return toolIds; },
    tools,
    setTool(id) {
      if (!tools[id] || id === toolId) return false;
      tools[toolId].release?.();
      toolId = id;
      syncTray();
      return true;
    },
    // the to-do list: the repairs, then the boxes
    taskView() {
      if (phase !== 'restore') return boxes.view(t);
      return tasks.map((k) => ({ id: k.id, label: label(k.id), p: k.p, done: k.done, locked: locked(k), count: k.count?.(L) ?? null }));
    },
    label,
    // why the fire won't light yet (the level's own words, else the usual)
    lockedText: () => t(has(`hint.${def.id}.fireLocked`) ? `hint.${def.id}.fireLocked` : 'hint.fireLocked'),

    // a brand-new room: litter where the seed put it, rotten floor, grimy glass,
    // sooty surround, tired paint, cold fireplace, furniture packed, bin out
    fresh(defaultLayout) {
      if (defaultLayout) decor.restore(defaultLayout);
      packAll();
      boxes.clear();
      if (trash) trash.restore(trash0);
      floor?.setAll('old');
      walls?.clear();
      grime?.dirty();
      for (const s of Object.values(own)) s.fresh();
      for (const k of tasks) {
        k.done = false;
        k.p = 0;
      }
      setPhase('restore', { quiet: true });
      syncFire({ lit: false });
      meta = { before: null, after: null, complete: false };
      journal.clear();
      live = true;
    },
    // the finished room (screenshots, or a level already completed)
    finished(defaultLayout, wallColor = def.paints?.[0]) {
      if (defaultLayout) decor.restore(defaultLayout);
      boxes.clear();
      trash?.clearAll();
      floor?.setAll('new');
      walls?.fill(wallColor);
      grime?.finishWindows();
      grime?.finishSoot();
      for (const s of Object.values(own)) s.finished();
      for (const k of tasks) {
        k.done = true;
        k.p = 1;
      }
      setPhase('done', { quiet: true });
      syncFire();
      journal.clear({ partial: true }); // no history: nothing to play back
      live = true;
    },
    // the repairs done, the boxes just delivered (dev: ?phase=unpack)
    unpackNow(defaultLayout, wallColor) {
      this.finished(defaultLayout, wallColor);
      packAll();
      boxes.fill();
      setPhase('unpack', { quiet: true });
    },
    serialize() {
      const s = {
        v: 2,
        phase,
        done: tasks.filter((k) => k.done).map((k) => k.id),
        fire: room.fireOn,
        layout: decor.snapshot(),
        boxes: boxes.serialize(),
        meta,
        journal: journal.serialize(),
      };
      if (trash) s.trash = trash.serialize();
      if (floor) s.floor = floor.serialize();
      if (walls) s.walls = walls.serialize();
      if (grime) s.grime = grime.serialize();
      for (const [key, sys] of Object.entries(own)) s[key] = sys.serialize();
      return s;
    },
    // async: the painted walls and grime come back as images
    async restore(s) {
      live = false;
      meta = { before: null, after: null, complete: false, ...s.meta };
      decor.restore(s.layout);
      trash?.restore(s.trash);
      for (const k of tasks) {
        k.done = s.done.includes(k.id);
        k.p = k.done ? 1 : 0;
      }
      phase = s.phase;
      const early = phase === 'restore';
      if (early) {
        packAll();
        boxes.clear();
      } else {
        boxes.restore(s.boxes);
        // anything packed but in no box (an older save) goes to the put-aside box
        const loose = furniture().filter((e) => e.stored && !boxes.contains(e.id));
        if (loose.length) boxes.lose(loose, { quiet: true });
      }
      // saves from before a system existed: as it was at the start if still
      // restoring, else finished
      if (floor) {
        if (s.floor) floor.restore(s.floor);
        else floor.setAll(early ? 'old' : 'new');
      }
      if (walls) {
        if (s.walls) await walls.restore(s.walls);
        else if (early) walls.clear();
        else walls.fill(def.paints[0]);
      }
      if (grime) {
        if (s.grime) await grime.restore(s.grime);
        else if (early) grime.dirty();
        else {
          grime.finishWindows();
          grime.finishSoot();
        }
      }
      for (const [key, sys] of Object.entries(own)) {
        if (s[key] !== undefined) await sys.restore(s[key], { early });
        else if (early) sys.fresh();
        else sys.finished();
      }
      if (room.rug) room.rug.visible = !early;
      syncTray();
      syncFire({ lit: task('fire')?.done ? s.fire ?? true : false });
      journal.restore(s.journal);
      live = true;
    },

    update(dt) {
      journal.update(dt);
      if (trash?.update(dt)) world.shadowsDirty();
      if (trash?.takeBinned()) sound('bin', { gain: 0.7 });
      if (floor) {
        const f = floor.update(dt);
        if (f.moving) world.shadowsDirty();
        if (f.landed) sound('plank', { gain: 0.5 });
      }
      walls?.flush();
      if (grime?.flush()) world.shadowsDirty(); // window grime shapes the sun
      for (const s of Object.values(own)) if (s.update?.(dt)) world.shadowsDirty();
      if (boxes.update(dt)) world.shadowsDirty();
      evalT -= dt;
      if (evalT <= 0) {
        evalT = 0.2;
        evaluate();
      }
    },
  };
}
