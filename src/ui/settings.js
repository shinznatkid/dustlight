import { setLang, onLang } from '../i18n.js';
import { store } from '../save.js';
import { $ } from './dom.js';

// ---- settings --------------------------------------------------------------------------------
// The settings modal's controls — volumes, language (the menu's switch too), render
// quality, the day going round, fps, debug — kept in save.js; and what two of them show:
// the fps badge and the debug corner.
export function setupSettings(app) {
  const { Q, world, audio, S, decor, DEV } = app;

  const pct = (v) => `${Math.round(v * 100)}%`;
  function syncSettingsUi() {
    for (const [k, id] of [['music', 'Music'], ['ambience', 'Ambience'], ['sfx', 'Sfx']]) {
      $(`s${id}`).value = S[k];
      $(`v${id}`).textContent = pct(S[k]);
    }
    for (const b of $('qualSeg').children) b.classList.toggle('on', b.dataset.q === S.quality);
    for (const b of $('daySeg').children) b.classList.toggle('on', b.dataset.d === (S.daycycle ?? 'auto'));
    $('sFps').checked = S.showFps;
    $('sDebug').checked = debugOn();
    app.refreshMenu();
  }
  for (const [k, id] of [['music', 'Music'], ['ambience', 'Ambience'], ['sfx', 'Sfx']]) {
    $(`s${id}`).addEventListener('input', (e) => {
      const v = +e.target.value;
      audio.setVolume(k, v);
      $(`v${id}`).textContent = pct(v);
      store.setSetting(k, v);
    });
  }
  for (const seg of [$('langSeg'), $('langSeg2')]) {
    seg.addEventListener('click', (e) => {
      const l = e.target.dataset?.lang;
      if (!l) return;
      setLang(l);
      store.setSetting('lang', l);
    });
  }
  onLang(() => { app.refreshMenu(); app.refreshHud(); app.renderCards(); app.syncTimeUi(); app.fillCredits(); if (app.state === 'album') app.renderAlbum(); });

  // pr: render scale — capped by the screen for low/medium; high supersamples (up to
  // 1.5x even on a plain 1x screen, within a pixel budget): smooth edges and fine textures
  const dpr = () => window.devicePixelRatio || 1;
  const QUALITY = {
    low: { pr: () => Math.min(dpr(), 0.8), msaa: 0, fx: false },
    medium: { pr: () => Math.min(dpr(), 1), msaa: 4, fx: true },
    // up to 1.5x, within ~3.5 MP of drawing buffer: a 1440p window at 1.5x would be
    // rendering 4K (playtest: ~50 fps, against 90+ on medium)
    high: { pr: () => Math.max(Math.min(dpr(), 1), Math.min(Math.max(dpr(), 1.5), Math.sqrt(3.5e6 / (innerWidth * innerHeight)))), msaa: 4, fx: true },
  };
  function applyQuality(q) {
    const Qs = QUALITY[q] ?? QUALITY.high;
    if (!Q.has('pr')) world.setPixelRatio(Qs.pr());
    world.setMultisampling(Q.has('nomsaa') ? 0 : Qs.msaa);
    world.layers.ao = Qs.fx && !Q.has('noao');
    world.layers.shafts = Qs.fx && !Q.has('noshafts');
    if (world.ready) world.applyLayers();
  }
  $('qualSeg').addEventListener('click', (e) => {
    const q = e.target.dataset?.q;
    if (!q) return;
    store.setSetting('quality', q);
    applyQuality(q);
    syncSettingsUi();
  });
  $('daySeg').addEventListener('click', (e) => {
    const d = e.target.dataset?.d;
    if (!d) return;
    store.setSetting('daycycle', d);
    syncSettingsUi();
  });
  $('sFps').addEventListener('change', (e) => {
    store.setSetting('showFps', e.target.checked);
    $('badge').hidden = !(e.target.checked || DEV);
  });
  applyQuality(S.quality);
  let qualT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(qualT);
    qualT = setTimeout(() => applyQuality(S.quality), 300);
  });
  $('badge').hidden = !(S.showFps || DEV);
  world.onFrame(() => {
    if ($('badge').hidden) return;
    $('badge').textContent = `${world.fps} fps${world.gi.busy ? ' · GI…' : ''}`;
  });

  // debug (settings, or ?debug for this page): the id of the thing in hand — or, with
  // nothing in hand, the one under the pointer — in the corner, so an odd one can be
  // named exactly (playtest 2026-09-30)
  const DEBUG_Q = Q.has('debug');
  const debugOn = () => DEBUG_Q || !!S.debug;
  $('sDebug').checked = debugOn();
  $('sDebug').addEventListener('change', (e) => store.setSetting('debug', e.target.checked));
  let dbgNdc = null;
  let dbgT = 0;
  let dbgText = '';
  world.onFrame((dt) => {
    const on = debugOn() && app.state === 'play' && !!app.game;
    $('dbg').hidden = !on;
    if (!on) return;
    let text;
    const held = decor.held;
    if (held) text = `✋ ${held.e.id}`;
    else {
      // (a raycast into the scanned models: only when the pointer moved, a few times a second)
      dbgT -= dt;
      if (dbgT > 0 || (dbgNdc && dbgNdc.equals(app.input.ndc))) return;
      dbgT = 0.1;
      dbgNdc = app.input.ndc.clone();
      const h = decor.hover(app.input.ndc);
      text = h ? `<span class="dim">↖</span> ${h.e.id}` : `<span class="dim">${app.game.toolId}</span>`;
    }
    if (text === dbgText) return;
    dbgText = text;
    $('dbg').innerHTML = text;
  });

  return { syncSettingsUi };
}
