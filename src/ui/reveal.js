import { t } from '../i18n.js';
import { nextLevel } from '../levels.js';
import { $, sleep } from './dom.js';

// ---- before / after ---------------------------------------------------------------------------------
// The "before" taken on the way into a fresh room, and the finish: the run to dusk, the
// "after", then the before / after modal with its wipe and its divider to drag.
export function setupReveal(app) {
  const { world, audio, place, NOHUD } = app;

  // a small JPEG of what the camera sees now (the canvas only: no HUD)
  async function snapshot(w = 960) {
    const blob = await world.capture();
    if (!blob) return null;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((w * bmp.height) / bmp.width);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return c.toDataURL('image/jpeg', 0.82);
  }
  // the "before": the run-down room from the entry view, taken once
  async function captureBefore() {
    if (!app.game?.live || NOHUD || app.game.meta.before || app.game.phase !== 'restore') return;
    for (let i = 0; i < 12 && world.gi.busy; i++) await sleep(100);
    app.game.meta.before = await snapshot();
    app.saveSoon();
  }

  // the finish: back to the entry view while dusk falls and the lamps and the fire
  // come on, then the before / after
  let revealing = false;
  async function reveal() {
    if (revealing || !app.game || app.game.phase !== 'done') return;
    revealing = true;
    app.input.release();
    app.saveNow();
    app.setState('reveal');
    audio.sfx('sting');
    app.dropTimeGoal();
    if (app.game.fireUnlocked && world.room.setFire) world.setFireAllowed(true, { lit: true });
    // (dusk — or stay, if the day going round is already between dusk and evening)
    const dusk = world.time >= 0.8 && world.time <= 0.9 ? world.time : 0.8;
    await Promise.all([app.flyTo(app.HERO, { dur: 2.2, shift: 0 }), app.runTime(dusk, 3.4)]);
    audio.music(app.musicFor('play'));
    for (let i = 0; i < 80 && world.gi.busy; i++) await sleep(100); // the bounce light settles first
    await sleep(300);
    app.game.meta.after = await snapshot(1280);
    const first = !app.game.meta.complete;
    app.game.meta.complete = true;
    app.saveNow();
    if (first) await app.keepRoom({ thumb: app.game.meta.after }); // (again later: from the pause menu)
    app.renderCards();
    audio.sfx('fanfare');
    showReveal();
  }
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  const setCmp = (x) => $('cmp').style.setProperty('--x', `${(Math.max(0, Math.min(1, x)) * 100).toFixed(2)}%`);
  let cmpDrag = false;
  function showReveal() {
    const { before, after } = app.game.meta;
    $('rvTimelapse').hidden = !app.game.journal.playable; // (a room from before the journal has no history)
    // the next place, open now that this one is finished
    const next = nextLevel(place.id);
    $('rvNext').hidden = !next || next.soon;
    if (next) $('rvNext').textContent = t('reveal.next', { name: t(`level.${next.id}.name`) });
    $('rvStay').classList.toggle('primary', $('rvNext').hidden);
    $('cmp').classList.toggle('solo', !before);
    $('cmpAfter').src = after ?? '';
    $('cmpBefore').src = before ?? '';
    $('revealSub').textContent = `${t(`level.${place.id}.name`)} · ${t(`level.${place.id}.room`)}`;
    cmpDrag = false;
    setCmp(1);
    app.openModal('reveal');
    if (!before) return;
    // all "before", a wipe across to "after", then it rests in the middle
    const t0 = performance.now();
    const step = (now) => {
      if (cmpDrag || app.modal !== 'reveal') return;
      const k = Math.min(1, (now - t0 - 500) / 2800);
      if (k > 0) setCmp(k < 0.62 ? 1 - ease(k / 0.62) : 0.5 * ease((k - 0.62) / 0.38));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  {
    const cmp = $('cmp');
    const at = (e) => {
      const r = cmp.getBoundingClientRect();
      setCmp((e.clientX - r.left) / r.width);
    };
    cmp.addEventListener('pointerdown', (e) => {
      cmpDrag = true;
      cmp.setPointerCapture(e.pointerId);
      at(e);
    });
    cmp.addEventListener('pointermove', (e) => { if (cmpDrag && e.buttons) at(e); });
  }
  function endReveal(to) {
    app.closeAll();
    revealing = false;
    if (to === 'menu') {
      app.enterMenu();
      return;
    }
    app.setState('play');
    app.refreshHud();
    if (to === 'photo') app.enterPhoto();
  }
  $('rvStay').onclick = () => endReveal('stay');
  $('rvPhoto').onclick = () => endReveal('photo');
  $('rvMenu').onclick = () => endReveal('menu');
  $('rvNext').onclick = () => { app.closeAll(); app.goLevel(nextLevel(place.id).id); };

  return { snapshot, captureBefore, reveal, showReveal, endReveal };
}
