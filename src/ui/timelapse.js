import { t, has } from '../i18n.js';
import { store } from '../save.js';
import { $, sleep } from './dom.js';

// The two timelapses on the page: the title's (demo.js — the level played by itself
// behind the menu) and the player's own (replay.js — their journal, from the before /
// after or an album card), with the caption card they share.
export function setupTimelapse(app) {
  const { world, controls, place } = app;

  // ---- the title timelapse --------------------------------------------------------------------------
  const DEMO_STEPS = [...(place?.tasks.map((k) => k.id) ?? []), 'unpack'];
  // a caption: the level's own words for a step (demo.<level>.<step>), else the shared ones
  const demoText = (k) => t(place && has(`demo.${place.id}.${k}`) ? `demo.${place.id}.${k}` : `demo.${k}`);
  function demoCaption(k) {
    const el = $('demoCap');
    el.classList.remove('on');
    if (!k) return;
    const i = DEMO_STEPS.indexOf(k);
    el.querySelector('.step').textContent = i >= 0 ? `${i + 1}/${DEMO_STEPS.length}` : '';
    el.querySelector('.what').textContent = demoText(k);
    void el.offsetWidth; // restart the fade-in
    el.classList.add('on');
  }
  // ---- the player's own timelapse (replay.js) ---------------------------------------------------------
  // the same caption card: "your room" over it, the clock of the day instead of a step number
  function replayCaption(k) {
    const el = $('demoCap');
    el.classList.remove('on');
    if (!k) return;
    el.querySelector('.what').textContent = demoText(k);
    void el.offsetWidth;
    el.classList.add('on');
  }
  function captionLabel(key) {
    const l = $('demoCap').querySelector('.lbl');
    l.dataset.i18n = key;
    l.textContent = t(key);
  }
  // play a journal in the live room, then put the room right with `after` (behind a fade);
  // Esc / the skip button cut it short
  async function playTimelapse(journal, after) {
    app.input.release();
    app.setState('replay');
    controls.enabled = false;
    captionLabel('replay.label');
    await app.replay.play(journal);
    replayCaption(null);
    captionLabel('demo.label');
    await app.swapRoom(after);
  }
  function skipTimelapse() {
    if (app.state === 'replay') app.replay.stop();
  }
  $('replaySkip').onclick = skipTimelapse;
  window.addEventListener('keydown', (e) => {
    if (app.state === 'replay' && e.key === 'Escape') skipTimelapse();
  });
  const canReplay = (j) => !!j && !j.partial && j.e?.length > 0;
  // from the before / after: the room is put back exactly as it was, then the before / after again
  async function revealTimelapse() {
    if (!app.game?.journal.playable) return;
    app.closeAll();
    const final = { ...app.game.serialize(), time: +world.time.toFixed(3) };
    await playTimelapse(structuredClone(final.journal), async () => {
      await app.game.restore(final);
      world.applyTime(final.time, { keepSwitches: true });
    });
    app.setState('reveal');
    app.showReveal();
  }
  $('rvTimelapse').onclick = revealTimelapse;

  // play pressed: the timelapse stops and the player's own room (their save, or a
  // fresh start) takes its place behind a quick fade of the room
  async function endDemo() {
    app.demo.stop();
    const cv = world.renderer.domElement;
    cv.style.opacity = '0';
    await sleep(350);
    await app.loadRoom();
    world.applyTime(store.level(place.id)?.time ?? place.start ?? place.time);
    app.game.tools.roller?.setColor(place.paints[0]);
    app.resetTimeFollow();
    world.lightingChanged({ soft: false });
    app.hud.refresh();
    app.syncTimeUi();
    setTimeout(() => { cv.style.opacity = '1'; }, 250);
  }

  return { demoCaption, replayCaption, playTimelapse, revealTimelapse, canReplay, endDemo };
}
