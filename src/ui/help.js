import { t, onLang } from '../i18n.js';
import { store } from '../save.js';
import { $ } from './dom.js';

// ---- how to play -------------------------------------------------------------------------------
// The controls sheet: the HUD's ? button, H (or ?) in play, the pause menu; H, Esc or a
// click outside closes it. The welcome card: the first time a room is played (once per
// game, not per level), three lines on what the game is — fix, decorate, enjoy — and
// where the controls are. Screenshot / test URLs (?nohud, &phase=…) never show it.
// Strings: help.* / welcome.* in i18n.js, where [X] marks a key (drawn as a key cap).
const COLS = [
  // heading · the mouse buttons it's about (lb / rb / wh = left, right, wheel) · rows
  ['help.camera', ['rb', 'wh'], ['orbit', 'zoom', 'move']],
  ['help.work', ['lb'], ['tools', 'use', 'box', 'boxMove']],
  ['help.hold', null, ['pick', 'turn', 'cancel', 'store']],
  ['help.more', null, ['lamp', 'pause', 'photo', 'help']],
];
const STEPS = [['🧹', 'fix'], ['📦', 'decor'], ['🌅', 'enjoy']];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
// "[W][A][S][D] / arrows" → key caps and plain text
function withKeys(s, cls) {
  const span = el('span', cls);
  s.split(/\[([^\]]+)\]/).forEach((part, i) => {
    if (part) span.append(i % 2 ? el('kbd', null, part) : part);
  });
  return span;
}

export function setupHelp(app) {
  const { place } = app;

  function fillSheet() {
    const cols = $('helpCols');
    cols.textContent = '';
    for (const [head, buttons, rows] of COLS) {
      const c = el('div', 'col');
      const h = el('h4', null, t(head));
      if (buttons) {
        const m = el('span', 'mouse');
        for (const b of buttons) m.append(el('i', b));
        h.append(m);
      }
      c.append(h);
      for (const r of rows) {
        const row = el('div', 'r');
        row.append(withKeys(t(`help.k.${r}`), 'k'), el('span', 'd', t(`help.d.${r}`)));
        c.append(row);
      }
      cols.append(c);
    }
  }
  function fillWelcome() {
    $('welcomeTitle').textContent = t('welcome.title', { name: place ? t(`level.${place.id}.name`) : '' });
    const ol = $('welcomeSteps');
    ol.textContent = '';
    for (const [icon, k] of STEPS) {
      const li = el('li');
      const text = el('span');
      text.append(el('b', null, t(`welcome.${k}`)), ` — ${t(`welcome.${k}.d`)}`);
      li.append(el('span', 'i', icon), text);
      ol.append(li);
    }
    $('welcomeKeys').replaceChildren(withKeys(t('welcome.keys')));
  }
  fillSheet();
  onLang(() => {
    fillSheet();
    fillWelcome();
  });

  const canOpen = () => app.state === 'play' && !app.modal && !app.fly;
  function openHelp() {
    app.input.release();
    app.openModal('help');
  }
  $('hudHelp').onclick = () => { if (canOpen()) openHelp(); };
  $('pHelp').onclick = () => app.openModal('help'); // (over the pause menu: closing goes back to it)
  $('helpClose').onclick = () => app.closeModal();
  $('welcomeGo').onclick = () => app.closeModal();
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.repeat || (e.key.toLowerCase() !== 'h' && e.key !== '?')) return;
    if (app.modal === 'help') app.closeModal();
    else if (canOpen()) openHelp();
    else return;
    e.preventDefault();
  });

  // the welcome card, the first time play begins (after the flight in)
  const never = app.NOHUD || app.Q.has('phase') || !place;
  app.world.onFrame(() => {
    if (never || store.settings.welcomed || !canOpen() || app.demo?.active || app.replay?.active || app.viewing) return;
    store.setSetting('welcomed', true);
    fillWelcome();
    app.input.release();
    app.openModal('welcome');
  });
  return {};
}
