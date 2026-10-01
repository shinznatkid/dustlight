import { t, getLang } from '../i18n.js';
import { store } from '../save.js';
import { LEVELS, levelById, isOpen } from '../levels.js';
import { $, fade } from './dom.js';

// The main menu and the places screen (the route of every level + the details of the
// picked stop), and the moves between them and play: into the menu, into play, this
// room started over, another place (its own page).
export function setupMenu(app) {
  const { world, controls, audio, place, finishedOnce } = app;

  // ---- transitions --------------------------------------------------------------------------
  async function enterMenu({ instant = false } = {}) {
    app.closeModal();
    app.setState('menu');
    refreshMenu();
    audio.music('menu');
    if (instant) {
      app.viewShift = app.MENU_SHIFT;
      return;
    }
    await app.flyTo((c) => app.menuPose(c), { dur: 1.6, shift: app.MENU_SHIFT });
  }

  async function enterPlay() {
    if (app.demo?.active) await app.endDemo();
    app.refreshHud();
    app.setState('play');
    controls.enabled = false;
    audio.music(app.musicFor('play'));
    await app.flyTo(app.HERO, { dur: 1.6, shift: 0 });
    await app.captureBefore();
    controls.enabled = true;
    app.saveNow();
  }

  // start this room over: default furniture, the run-down afternoon
  async function restartLevel() {
    if (app.demo?.active) {
      // the timelapse has the room: the fresh start is what play will load
      store.clearLevel(place.id);
      refreshMenu();
      renderCards();
      return;
    }
    await fade(true);
    store.clearLevel(place.id);
    app.game.fresh(app.defaultLayout);
    world.applyTime(place.start ?? place.time);
    app.resetTimeFollow();
    world.lightingChanged({ soft: false });
    app.hud.refresh();
    app.syncTimeUi();
    await new Promise((r) => setTimeout(r, 400));
    await fade(false);
    refreshMenu();
    renderCards();
  }

  // another place: its own page (the room here is saved first); `go` = straight into play
  async function goLevel(id, { go = true, extra = '' } = {}) {
    app.saveNow();
    await fade(true);
    location.href = `?level=${id}${go ? '&go' : ''}${extra}`;
  }

  // ---- menu + places -------------------------------------------------------------------------
  function refreshMenu() {
    $('mContinue').hidden = !store.last;
    $('mPlay').classList.toggle('primary', !store.last);
    for (const seg of [$('langSeg'), $('langSeg2')]) for (const b of seg.children) b.classList.toggle('on', b.dataset.lang === getLang());
  }
  $('mContinue').onclick = () => {
    const id = store.last;
    if (!place || (id && id !== place.id)) goLevel(id ?? LEVELS[0].id);
    else enterPlay();
  };
  $('mPlay').onclick = () => { pickedPlace = null; renderCards(); app.setState('levels'); };
  $('mSettings').onclick = () => app.openModal('settings');
  $('mCredits').onclick = () => app.openModal('credits');
  $('levelsBack').onclick = () => app.setState('menu');
  $('mAlbum').onclick = () => { app.renderAlbum(); app.setState('album'); };
  $('albumBack').onclick = () => app.setState('menu');

  const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  // where a place stands: finished · in progress (with how far) · not started · waiting
  // for the one before it · not built yet
  function levelStatus(L) {
    if (L.soon) return { key: 'soon', open: false };
    // (the page's own place is open however it was reached: ?level=, and so is one finished before)
    if (!isOpen(L.id, finishedOnce) && L.id !== place?.id && !finishedOnce(L.id)) return { key: 'locked', open: false };
    const sv = store.level(L.id);
    if (sv?.meta?.complete) return { key: 'complete', open: true, sv };
    if (sv) return { key: 'progress', open: true, sv, p: sv.progress ?? null };
    return { key: 'new', open: true };
  }
  function statusText(L, s) {
    if (s.key === 'soon') return t('levels.soon');
    if (s.key === 'locked') {
      const i = LEVELS.indexOf(L);
      return t('levels.lockedBy', { name: t(`level.${LEVELS[i - 1].id}.name`) });
    }
    if (s.key === 'complete') return t('levels.complete');
    if (s.key === 'progress') return s.p !== null ? t('levels.progress', { p: Math.round(s.p * 100) }) : t('levels.started');
    return t('levels.new');
  }

  const PIN_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  // a place's picture: the player's "after" once finished, else the card image; a place
  // that isn't open yet keeps its picture, faded, under a lock (it still reads as a place)
  function placePic(L, s) {
    const pic = el('div', 'ppic');
    const src = s.sv?.meta?.after ?? L.img;
    if (s.open) {
      if (src) pic.style.backgroundImage = `url(${src})`;
    } else {
      const faded = el('div', 'faded');
      if (src) faded.style.backgroundImage = `url(${src})`;
      const lock = el('div', 'lock');
      lock.innerHTML = LOCK_SVG;
      pic.append(faded, lock);
    }
    return pic;
  }

  // The places as a route 1→N (solid line = passed, dashed = not yet), every place in its
  // own order with its number, and under it the details of the stop picked on the route —
  // this page's place until the player picks another. (playtest 2026-09-30: the old big card
  // for this page's place, pulled out of the order, read as "the selected one" and the
  // rest as all there is.)
  let pickedPlace = null;
  function renderCards() {
    const wrap = $('cards');
    wrap.textContent = '';
    const here = (L) => L.id === place?.id;
    const pick = levelById(pickedPlace) ?? LEVELS.find(here) ?? LEVELS[0];
    const route = el('div', 'route');
    LEVELS.forEach((L, i) => {
      const s = levelStatus(L);
      if (i) route.append(el('div', `leg${levelStatus(LEVELS[i - 1]).key === 'complete' ? ' done' : ''}`));
      const stop = el('button', `stop st-${s.key}${here(L) ? ' here' : ''}${L === pick ? ' sel' : ''}`);
      stop.dataset.id = L.id;
      stop.setAttribute('aria-pressed', L === pick ? 'true' : 'false');
      stop.setAttribute('aria-label', `${i + 1}. ${t(`level.${L.id}.name`)} — ${statusText(L, s)}`);
      if (here(L)) stop.append(el('span', 'pin', t('levels.here')));
      const dot = el('span', 'dot');
      dot.append(placePic(L, s), el('span', 'n', s.key === 'complete' ? '✓' : `${i + 1}`));
      stop.append(dot, el('span', 'nm', t(`level.${L.id}.name`)));
      // (a locked stop's lock says it; the details say what opens it)
      stop.append(el('span', `sm status-${s.key}`, s.key === 'locked' ? '' : statusText(L, s)));
      stop.onclick = () => {
        pickedPlace = L.id;
        renderCards();
      };
      route.append(stop);
    });

    const s = levelStatus(pick);
    const i = LEVELS.indexOf(pick);
    const detail = el('div', `detail glass st-${s.key}`);
    const pic = placePic(pick, s);
    if (s.key === 'complete') pic.append(el('span', 'done', t('levels.complete')));
    const b = el('div', 'body');
    b.append(
      el('div', 'kick', `${t('levels.of', { n: i + 1, N: LEVELS.length })} · ${t(`level.${pick.id}.room`)}`),
      el('div', 'name', t(`level.${pick.id}.name`)),
      el('div', `stl status-${s.key}`, statusText(pick, s)),
    );
    if (here(pick)) {
      const note = el('div', 'here-note');
      note.innerHTML = PIN_SVG;
      note.append(t('levels.here'));
      b.append(note);
    }
    b.append(el('div', 'blurb', t(`level.${pick.id}.blurb`)));
    if (s.open) {
      // this page's place plays right here; another one loads its own page
      const acts = el('div', 'acts');
      const saved = !!s.sv;
      const go = el('button', 'btn primary', t(saved ? 'levels.continue' : 'levels.enter'));
      go.onclick = () => (here(pick) ? enterPlay() : goLevel(pick.id));
      acts.append(go);
      if (here(pick) && saved) {
        const again = el('button', 'btn', t('levels.restart'));
        again.onclick = () => app.confirmBox(t('levels.restartConfirm'), () => restartLevel());
        acts.append(again);
      }
      b.append(acts);
    }
    detail.append(pic, b);
    wrap.append(route, detail);
  }

  return { enterMenu, enterPlay, goLevel, refreshMenu, renderCards };
}
