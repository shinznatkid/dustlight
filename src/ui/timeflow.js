import * as THREE from 'three';
import { t } from '../i18n.js';
import { createDayCycle } from '../daycycle.js';
import { $ } from './dom.js';

// ---- the time of day: it moves with the work, then goes round by itself ------------------------------
// While the repairs go on, the time of day follows the level's progress in small steps
// (each a soft GI update), from the run-down afternoon (`place.start`) to the finished
// look (`place.time`) — the sun that rewards clean windows is there, and it's never dark
// to scrub or paint in. The lamps and the fire are left alone: lighting the fire is the
// player's job. A time picked in photo mode stays until the next bit of progress.
// Once the repairs are done (unpacking, decorating, after the reveal) the day goes round
// by itself, ten minutes a loop (daycycle.js), from wherever it is — the lamps and the
// fire come on at dusk and go off in the morning by themselves (the player can still
// switch them). Settings → "time of day: goes round / stays"; sliding the time in photo
// mode holds it there until photo mode is left. (?daylen=<s>: a shorter loop, for tests)
// Also here: the time by hand (photo mode's slider and its ticks) and the reveal's run to dusk.
export function setupTimeflow(app) {
  const { Q, world, place, S, NOHUD } = app;

  const FOLLOW_TIME = !NOHUD && !Q.has('t');
  let timeGoal = null;
  let lastStep = null;
  let timeT = 0;
  let tween = null; // the reveal's run to dusk: { from, to, t, dur, acc, done }
  const day = createDayCycle(world, { length: +(Q.get('daylen') ?? 600) });
  let dayHeld = false; // the time was slid in photo mode: it stays until photo mode is left
  let daySaveT = 0;
  const timeFor = (p) => {
    const t0 = place.start ?? place.time;
    return t0 + (place.time - t0) * p;
  };
  function runTime(to, dur) {
    return new Promise((done) => { tween = { from: world.time, to, t: 0, dur, acc: 0, done }; });
  }
  // the room changed under the clock (started over, an album room, the player's own room
  // after the title timelapse): the time follows the work again from where it is now
  function resetTimeFollow() {
    lastStep = null;
    timeGoal = null;
  }
  // the reveal takes the clock: no step of the work is left to walk to
  const dropTimeGoal = () => { timeGoal = null; };
  const holdDay = (on) => { dayHeld = on; };
  world.onFrame((dt) => {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      tween.acc -= dt;
      if (tween.acc <= 0 || tween.t >= 1) {
        tween.acc = 0.1;
        const k = tween.t * tween.t * (3 - 2 * tween.t);
        world.applyTime(THREE.MathUtils.lerp(tween.from, tween.to, k), { fromUser: true });
      }
      if (tween.t >= 1) {
        const d = tween.done;
        tween = null;
        d();
      }
      return;
    }
    // the day going round: after the repairs (once the time has caught up with the work),
    // while the player is in the room
    const inRoom = (app.state === 'play' || app.state === 'photo') && !app.viewing && !app.demo?.active && !app.replay?.active;
    const loop = FOLLOW_TIME && inRoom && !!app.game?.live && app.game.phase !== 'restore' && timeGoal === null && S.daycycle !== 'stop' && !dayHeld;
    if (loop) {
      day.start();
      day.update(dt);
      daySaveT -= dt;
      if (daySaveT <= 0) {
        daySaveT = 30;
        app.saveSoon();
      }
      if (app.state === 'photo') syncTimeValue();
      return;
    }
    day.stop();
    if (!FOLLOW_TIME || !app.game?.live || app.state !== 'play') return;
    // (the repairs are 65% of the level's progress: by their end the time has come
    // most of the way to golden hour; from there the day goes round)
    const step = Math.round(app.game.progress * 20);
    if (step !== lastStep && app.game.phase === 'restore') {
      if (lastStep !== null) timeGoal = timeFor(step / 20);
      lastStep = step;
    }
    if (timeGoal === null) return;
    timeT -= dt;
    if (timeT > 0) return;
    timeT = 0.25;
    const d = timeGoal - world.time;
    world.applyTime(world.time + Math.sign(d) * Math.min(Math.abs(d), 0.006), { fromUser: true, keepSwitches: true });
    if (Math.abs(d) <= 0.006) {
      timeGoal = null;
      app.saveSoon();
    }
  });

  // ---- the time by hand: photo mode's slider and its ticks ----------------------------------------
  const TICKS = [[0, 'morning'], [0.35, 'afternoon'], [0.62, 'golden'], [0.8, 'dusk'], [1, 'night']];
  function syncTimeUi() {
    $('time').value = world.time;
    $('timeName').textContent = t(`time.${world.timeKey}`);
    const ticks = $('ticks');
    ticks.textContent = '';
    for (const [v, k] of TICKS) {
      const s = document.createElement('span');
      s.textContent = t(`time.${k}`);
      s.onclick = () => setTime(v);
      ticks.append(s);
    }
  }
  // the slider and its label follow a clock that moves by itself (a few times a second)
  let timeUiT = 0;
  function syncTimeValue() {
    if ((timeUiT -= 1) > 0) return;
    timeUiT = 12;
    $('time').value = Math.min(1, world.time);
    $('timeName').textContent = t(`time.${world.timeKey}`);
  }
  function setTime(v) {
    dayHeld = true;
    world.applyTime(v, { fromUser: true });
    $('time').value = v;
    $('timeName').textContent = t(`time.${world.timeKey}`);
    if ($('devTime')) $('devTime').value = v;
    app.saveSoon();
  }
  $('time').addEventListener('input', (e) => setTime(+e.target.value));

  return { runTime, resetTimeFollow, dropTimeGoal, holdDay, syncTimeUi, setTime };
}
