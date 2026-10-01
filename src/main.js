import * as THREE from 'three';
import { createWorld } from './world.js';
import { setupInput } from './input.js';
import { t, setLang, applyDom } from './i18n.js';
import { store, album } from './save.js';
import { createAudio } from './audio.js';
import { LEVELS, levelById, levelOfRoom, loadLevel, isOpen } from './levels.js';
import { createLevel } from './level.js';
import { createHud } from './hud.js';
import { createDemo } from './demo.js';
import { createReplay } from './replay.js';
import SAMPLES from './samples.json';
import { $, toast } from './ui/dom.js';
import { setupWalk, setupCamera } from './ui/camera.js';
import { setupAutosave } from './ui/autosave.js';
import { setupCues } from './ui/cues.js';
import { setupMenu } from './ui/menu.js';
import { setupModals } from './ui/modals.js';
import { setupSettings } from './ui/settings.js';
import { setupPhoto } from './ui/photo.js';
import { setupTimeflow } from './ui/timeflow.js';
import { setupReveal } from './ui/reveal.js';
import { setupAlbum } from './ui/album.js';
import { setupDev, PAINTS } from './ui/dev.js';
import { setupTimelapse } from './ui/timelapse.js';

// The game shell: screens (loading → menu → places → play ⇄ pause / photo →
// reveal), camera moves between them, settings, autosave, audio cues, the time of
// day following the work, the before / after reveal. The 3D side lives in world.js;
// each screen lives in src/ui/, and this file boots the page and wires them together
// (`app` below). URL flags: ?level=<id> (below) · ?nohud (screenshots: straight into
// play, no UI) · ?play (skip the menu) · ?go (straight into play: the "next room"
// button and the places cards of another room) · ?dev (lighting panel + fps) ·
// ?album (straight to the album; &open=<kept room id> opens one) · ?view=<sample>
// (below) · everything world.js reads.

const Q = new URLSearchParams(location.search);
const body = document.body;
const NOHUD = Q.has('nohud');
const DEV = Q.has('dev');
const REC_DEMO = Q.has('recdemo');
if (NOHUD) body.classList.add('nohud');

setLang(store.settings.lang ?? (navigator.language?.toLowerCase().startsWith('th') ? 'th' : 'en'));

// One level per page. A world stands up one room for good (GI grid sized to it, patched
// materials, lights and shadows, every shader compiled at load), so another place is
// another page load: ?level=<id> (src/levels.js). Without it the page opens the place
// played last, so "Continue" is instant; the title and the menus sit on that room.
// ?view=<id>: one of the album's sample rooms (src/samples.json), in photo mode, on the
// page of its room's level — or with no level at all if the room has none (LOOK_ONLY).
// A sample of the page's own room opens in place from the album too (viewAlbumRoom).
const VIEW = SAMPLES.find((s) => s.id === Q.get('view')) ?? null;
const ROOMS = import.meta.glob('./rooms/*.js');
const finishedOnce = (id) => !!store.level(id)?.meta?.complete;
function pageLevel() {
  if (VIEW) return levelOfRoom(VIEW.room);
  const asked = levelById(Q.get('level'));
  if (asked && !asked.soon) return asked;
  const last = levelById(store.last);
  return last && isOpen(last.id, finishedOnce) ? last : LEVELS[0];
}
const LEVEL = pageLevel();
const place = LEVEL ? await loadLevel(LEVEL.id) : null; // the level: its meta (levels.js) + def (levels/<id>.js)
if (place) applyDom(); // (its own words — some override the shared ones — came after the page's first pass)
const roomId = place?.room ?? VIEW.room;
const R = (await ROOMS[`./rooms/${roomId}.js`]()).default;
const LOOK_ONLY = !place;

const world = createWorld(Q, R);
const { camera, controls, decor } = world;
const audio = createAudio();
const S = store.settings;
for (const b of ['music', 'ambience', 'sfx']) audio.setVolume(b, S[b]);

// straight into play on arrival (from another room's page)
const GO = Q.has('go') && !!place;
// the title screen plays the level as a timelapse (demo.js); flags that open a
// room directly (screenshots, tests) skip it, and ?nodemo turns it off
const DEMO = !NOHUD && !Q.has('play') && !Q.has('phase') && !Q.has('nodemo') && !VIEW && !GO && !Q.has('open') && !!place;

// ---- state --------------------------------------------------------------------------
// `app`: what the screens share. Every ui module (src/ui/*) is set up with this one
// object — the page's flags, level and world, and the state that more than one screen
// reads or writes, are its fields — and adds to it the functions the others call
// (app.enterPlay(), app.saveSoon() …). The modules don't import each other: a call
// goes through `app` when it runs, not when the module loads, so there is no import
// cycle to trip over at load (this file awaits the room module at the top level).
const app = {
  Q, world, camera, controls, decor, audio, S, place, R, VIEW, NOHUD, DEV, finishedOnce,
  state: 'loading', // loading | menu | levels | album | play | photo | reveal | replay
  // an album room on show (photo mode over it; the game in progress is put aside):
  // a kept room { state } or a sample { sample }
  viewing: VIEW ? { sample: VIEW } : null,
  game: null, // the level controller (level.js), made once the world has loaded
  defaultLayout: null,
  demo: null, // the title timelapse (demo.js)
  replay: null, // the timelapse of a room the player made (replay.js)
  modal: null, // the modal on top (ui/modals.js)
  fly: null, // the camera's flight under way (ui/camera.js): { from, to, t, dur, shift0, shift1, done }
  viewShift: 0, // the room slid sideways for the menu column (ui/camera.js)
};

function setState(s) {
  app.state = s;
  for (const c of [...body.classList]) if (c.startsWith('s-')) body.classList.remove(c);
  body.classList.add(`s-${s}`);
  if (s !== 'play') input.release();
  controls.enabled = s === 'play' || s === 'photo';
  input.playButtons(s === 'play'); // tools own the left button in play, the camera does in photo mode
  hud.refresh();
}
const playing = () => app.state === 'play' && !app.modal && !app.fly;

// The order of what follows is load-bearing: frame hooks run in the order they are
// added, and so do the window's key handlers. WASD walks the camera before input.js
// reads the pointer's hover, and the flight moves it after; input.js sees a key before
// photo mode does (ui/photo.js).
setupWalk(app);
const input = setupInput(world, {
  active: playing,
  tool: () => app.game?.tool,
  onPause: () => app.openModal('pause'),
  onPhoto: () => app.enterPhoto(),
  onToolKey: (i) => selectTool(app.game?.toolIds[i]),
  onSound: (id) => app.sound(id),
  onChange: () => hud.refresh(),
});

const hud = createHud({ world, getGame: () => app.game, onTool: (id) => selectTool(id), onFinish: () => app.reveal() });
function selectTool(id) {
  if (!app.game?.setTool(id)) return false;
  app.sound('rotate', { gain: 0.6 });
  hud.refresh();
  return true;
}
Object.assign(app, { setState, playing, input, hud, refreshHud, loadRoom });
Object.assign(app, setupCamera(app));

// ---- HUD --------------------------------------------------------------------------------
function refreshHud() {
  if (place) {
    $('locName').textContent = t(`level.${place.id}.name`);
    $('locRoom').textContent = t(`level.${place.id}.room`);
  }
  hud.refresh();
}
world.onFrame((dt) => {
  if (!app.game) return;
  // the timelapse's journal keeps what the player does, and nothing else
  // (?recdemo: what the title timelapse does — tools/samplejournal.mjs makes the sample's from it)
  app.game.journal.on = (playing() && !app.demo?.active && !app.replay?.active && !app.viewing) || (REC_DEMO && !!app.demo?.active);
  app.game.update(dt);
  hud.tick(dt);
});

// the screens (their frame hooks after the level's update: audio → the fps badge and the
// debug corner → the time of day)
for (const setup of [setupAutosave, setupCues, setupMenu, setupModals, setupSettings, setupPhoto,
  setupTimeflow, setupReveal, setupAlbum, setupDev, setupTimelapse]) Object.assign(app, setup(app));

// ---- boot ------------------------------------------------------------------------------------------
const loadbar = $('loadbar');
const loadmsg = $('loadmsg');
const saved = place ? store.level(place.id) : null;
// ?paint=<i>: the wall colour of a finished room (screenshots) — the level's own colours
const paintOf = (i) => place?.paints?.[i] ?? PAINTS[i] ?? place?.paints?.[0];
const progress = (f, stage) => {
  loadbar.style.width = `${Math.round(f * 100)}%`;
  loadmsg.textContent = t(stage === 'gi' ? 'load.gi' : 'load.models');
};
if (VIEW) {
  const p = VIEW.cam ? app.pose(VIEW.cam) : app.HERO;
  camera.position.copy(p.pos);
  controls.target.copy(p.look);
  camera.fov = world.fitFov(p.fov);
  camera.updateProjectionMatrix();
  controls.update();
}
if (LOOK_ONLY) {
  // a sample room with no level: its furniture, time and switches, then photo mode (onReady)
  world.boot({ time: app.sampleTime(VIEW), layout: VIEW.layout, wallColor: VIEW.wall, progress }).then(() => {
    app.sampleSwitches(VIEW);
    app.syncTimeUi();
    app.fillCredits();
  });
} else world.boot({
  wallColor: paintOf(+(Q.get('paint') ?? 0)),
  // a new game starts in the run-down afternoon; ?nohud shows the finished look
  time: VIEW ? app.sampleTime(VIEW) : DEMO ? place.start ?? place.time : saved?.time ?? (NOHUD ? place.time : place.start ?? place.time),
  progress,
}).then(async (r) => {
  app.defaultLayout = r.defaultLayout;
  app.game = createLevel(world, place, {
    sound: app.sound,
    rub: (kind, level) => { if (!app.demo?.active && !app.replay?.active) audio.rub(kind, level); },
    onToolChange: () => hud.refresh(),
    onNote: (msg) => { if (playing()) toast(msg); },
    onTask: (task) => {
      if (app.demo?.active || app.replay?.active) return;
      app.sound('task');
      hud.banner(`✓ ${app.game.label(task.id)}`);
      app.saveSoon();
    },
    onPhase: (p) => {
      if (app.demo?.active || app.replay?.active) return;
      if (p === 'unpack') {
        app.sound('sting');
        hud.banner(t('phase.unpack'), { long: true });
      } else if (p === 'done') {
        app.sound('fanfare');
        hud.banner(t('phase.done'), { long: true });
      }
      app.saveSoon();
    },
  });
  world.onFireLocked(() => { if (playing()) toast(app.game.lockedText()); });
  app.demo = createDemo(world, {
    getGame: () => app.game,
    getLayout: () => app.defaultLayout,
    paint: place.demoPaint ?? place.paints?.[1], // (level 1: sage — the change reads from across the room)
    startTime: place.start ?? place.time,
    endTime: place.time,
    onCaption: app.demoCaption,
  });
  app.replay = createReplay(world, {
    getGame: () => app.game,
    getLayout: () => app.defaultLayout,
    hero: app.HERO,
    onCaption: app.replayCaption,
    onClock: (c) => { $('demoCap').querySelector('.step').textContent = c; },
  });
  // the title shows the run-down room (the timelapse starts from it); the
  // player's own room is loaded when they press play
  if (VIEW) app.applySample(VIEW);
  else if (DEMO) app.game.fresh(app.defaultLayout);
  else await loadRoom({ boot: true });
  world.lightingChanged({ soft: false });
  hud.refresh();
  app.syncTimeUi();
  app.fillCredits();
  if (DEV) {
    $('devTime').value = world.time;
    for (const b of document.querySelectorAll('#chips .chip')) b.classList.toggle('on', world.layers[b.dataset.k]);
  }
});

// which room to play: the save (old v1 saves start over), else a fresh start. At
// boot the flags come first: ?nohud = the finished room (the look reference),
// ?phase=restore = the run-down start, ?phase=unpack = repaired with the boxes in
async function loadRoom({ boot = false } = {}) {
  const ph = boot ? Q.get('phase') : null;
  const sv = store.level(place.id);
  if (ph === 'restore') app.game.fresh(app.defaultLayout);
  else if (ph === 'unpack') app.game.unpackNow(app.defaultLayout, paintOf(+(Q.get('paint') ?? 0)));
  else if ((boot && NOHUD) || ph === 'done') app.game.finished(app.defaultLayout, paintOf(+(Q.get('paint') ?? 0)));
  else if (sv?.v === 2) await restoreOrRecover(sv);
  else app.game.fresh(app.defaultLayout);
}
// a save this build can't read (one made by an older version of the level) must never
// leave the page stuck: a room the player finished comes back finished (its own layout
// is lost) and still counts as done, so the places after it stay open; one they hadn't
// finished starts over
async function restoreOrRecover(sv) {
  try {
    await app.game.restore(sv);
  } catch (e) {
    console.warn('[save] could not restore this room, recovering', e);
    if (sv.meta?.complete) {
      app.game.finished(app.defaultLayout);
      Object.assign(app.game.meta, sv.meta);
    } else app.game.fresh(app.defaultLayout);
  }
}

// browsers keep audio off until a real click or key press
function onFirstGesture(fn) {
  const go = () => {
    fn();
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}

world.onReady(async () => {
  if (VIEW) {
    // a sample's page: straight into photo mode (the click that opened it was on the page
    // before) — its timelapse first, if that's what was asked for (&timelapse)
    $('loading').classList.add('done');
    $('photoExit').dataset.i18n = 'album.back';
    $('photoExit').textContent = t('album.back');
    onFirstGesture(() => audio.unlock());
    const journal = Q.has('timelapse') && app.game && VIEW.journal ? await fetch(VIEW.journal).then((r) => r.json()).catch(() => null) : null;
    if (journal) {
      await app.playTimelapse(journal, async () => app.applySample(VIEW));
      if (VIEW.cam) await app.flyTo(app.pose(VIEW.cam), { dur: 1.2, shift: 0 });
    }
    app.syncTimeUi();
    setState('photo');
    return;
  }
  if (GO) {
    // from another room's page (its "next room" button, a places card): straight in
    history.replaceState(null, '', `?level=${place.id}`);
    $('loading').classList.add('done');
    onFirstGesture(() => audio.unlock());
    app.enterPlay();
    return;
  }
  if (NOHUD || Q.has('play')) {
    $('loading').classList.add('done');
    refreshHud();
    setState('play');
    app.captureBefore();
    return;
  }
  app.viewShift = app.MENU_SHIFT;
  app.enterMenu({ instant: true });
  if (Q.has('album')) {
    // back from a sample's page: onto the album, no "click to start" in between
    // (&open=<id>: a kept room of this place, sent here from another room's album)
    history.replaceState(null, '', location.pathname);
    $('loading').classList.add('done');
    app.renderAlbum();
    setState('album');
    onFirstGesture(() => audio.unlock());
    const a = Q.has('open') ? (await album.list()).find((x) => x.id === Q.get('open')) : null;
    if (a) app.viewAlbumRoom(a, { timelapse: Q.has('timelapse') });
    else if (DEMO) app.demo?.start();
    return;
  }
  // the menu starts on a click: that click is also what lets the browser play audio
  $('tapStart').hidden = false;
  $('loading').classList.add('tap');
  onFirstGesture(() => {
    audio.unlock();
    $('loading').classList.add('done');
    if (DEMO) app.demo?.start();
  });
});

const { setPaint, enterPlay, enterMenu, enterPhoto, reveal, snapshot, captureBefore, keepRoom, playTimelapse, revealTimelapse, viewAlbumRoom } = app;
window.__app = {
  THREE, world, audio, store,
  ...world,
  setPaint,
  get state() { return app.state; },
  get game() { return app.game; },
  get defaultLayout() { return app.defaultLayout; },
  get demo() { return app.demo; },
  enterPlay, enterMenu, enterPhoto, reveal, snapshot, captureBefore, keepRoom, album,
  playTimelapse, revealTimelapse, viewAlbumRoom, get replay() { return app.replay; },
  get viewing() { return app.viewing; },
};
