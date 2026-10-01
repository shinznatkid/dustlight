import { t } from '../i18n.js';
import { $ } from './dom.js';

// The modals over the game — pause, settings (its controls: settings.js), credits,
// confirm, the before / after (reveal.js), how to play and the welcome card (help.js) — stacked: settings opened from pause closes
// back onto pause. Esc or a click outside closes the top one (not a confirm, nor the
// before / after, which has its own ways out).
export function setupModals(app) {
  const { audio } = app;

  // ---- modals --------------------------------------------------------------------------------
  const MODALS = {
    pause: 'pauseWrap', settings: 'settingsWrap', credits: 'creditsWrap', confirm: 'confirmWrap', reveal: 'revealWrap',
    help: 'helpWrap', welcome: 'welcomeWrap', // (ui/help.js)
  };
  let modalStack = [];
  function openModal(name) {
    if (name === 'pause') {
      app.input.release();
      app.saveNow();
    }
    if (name === 'settings') app.syncSettingsUi();
    if (name === 'credits') fillCredits();
    if (app.modal) modalStack.push(app.modal);
    app.modal = name;
    for (const [k, id] of Object.entries(MODALS)) $(id).classList.toggle('open', k === name);
  }
  function closeModal() {
    const prev = modalStack.pop() ?? null;
    app.modal = prev;
    for (const [k, id] of Object.entries(MODALS)) $(id).classList.toggle('open', k === prev);
  }
  function closeAll() {
    modalStack = [];
    app.modal = null;
    for (const id of Object.values(MODALS)) $(id).classList.remove('open');
  }
  for (const id of Object.values(MODALS)) {
    $(id).addEventListener('pointerdown', (e) => { if (e.target === $(id) && app.modal !== 'confirm' && app.modal !== 'reveal') closeModal(); });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !app.modal) return;
    e.stopImmediatePropagation();
    if (app.modal === 'reveal') app.endReveal('stay');
    else closeModal();
  }, true);

  $('pResume').onclick = () => closeModal();
  $('pPhoto').onclick = () => { closeAll(); app.enterPhoto(); };
  $('pAlbum').onclick = async () => { closeAll(); await app.keepRoom(); };
  $('pSettings').onclick = () => openModal('settings');
  $('pMenu').onclick = () => { app.saveNow(); closeAll(); app.enterMenu(); };
  $('hudPause').onclick = () => openModal('pause');
  $('hudPhoto').onclick = () => app.enterPhoto();
  $('settingsClose').onclick = () => closeModal();
  $('creditsClose').onclick = () => closeModal();

  let confirmFn = null;
  function confirmBox(text, fn) {
    $('confirmText').textContent = text;
    confirmFn = fn;
    openModal('confirm');
  }
  $('confirmNo').onclick = () => closeModal();
  $('confirmYes').onclick = () => { closeModal(); confirmFn?.(); };

  // ---- credits ----------------------------------------------------------------------------------
  // every room's models, whichever level this page plays (CREDITS.md has the same list)
  const MODEL_CREDITS = [
    'Poly Haven (polyhaven.com) — models and textures · CC0',
    'KayKit by Kay Lousberg (kaylousberg.com) — Furniture Bits, Halloween Bits, Dungeon Remastered, Restaurant Bits · CC0',
    'Kenney (kenney.nl) — Furniture Kit · CC0',
  ];
  const fillList = (ul, lines) => {
    ul.textContent = '';
    for (const c of lines) {
      const li = document.createElement('li');
      li.textContent = c;
      ul.append(li);
    }
  };
  function fillCredits() {
    fillList($('creditModels'), MODEL_CREDITS);
    const list = audio.index.credits ?? [];
    fillList($('creditAudio'), list.length ? list : [t('credits.audioSoon')]);
  }

  return { openModal, closeModal, closeAll, confirmBox, fillCredits };
}
