import { t, has, getLang } from './i18n.js';

// In-play HUD pieces that follow the level: the to-do list, the tool bar, the
// hint line (changes with what the tool is doing) and the "task done" banner.
// A level's own tools bring their icon (tool.icon, an SVG string); a tool with
// colours (the roller and its kin) gets the colour palette.
const ICONS = {
  squeegee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M5 9.5h14"/><path d="M12 9.5V20"/></svg>',
  brush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="6" rx="2"/><path d="M6 11v7M9 11v8M12 11v7M15 11v8M18 11v7"/></svg>',
  roller: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="15" height="6" rx="2"/><path d="M18 7h2.5v5H11v3"/><path d="M11 15v6"/></svg>',
  crowbar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20L17.5 6.5"/><path d="M17.5 6.5c.6-1.6 2.4-2.3 3.5-1.3"/><path d="M6 20l-2-.6 1.2-1.8"/></svg>',
  planks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 15l9-4 9 4-9 4z"/><path d="M3 12l9-4 9 4"/><path d="M3 9l9-4 9 4"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L4 15.2a1.6 1.6 0 0 1 2.4-2.1L8 14.8"/></svg>',
};

export function createHud({ getGame, onTool, onFinish = () => {} }) {
  const $ = (id) => document.getElementById(id);
  $('finishBtn').onclick = () => onFinish();
  let lastList = '';
  let lastTools = '';
  let lastHint = '';
  let acc = 0;

  function renderList(g) {
    const view = g.taskView();
    const key = `${getLang()}|${g.phase}|${g.meta?.complete}|${JSON.stringify(view.map((v) => [v.id, v.done, v.locked, v.count, Math.round(v.p * 50)]))}`;
    if (key === lastList) return;
    lastList = key;
    const ul = $('taskList');
    ul.textContent = '';
    for (const v of view) {
      const li = document.createElement('li');
      li.className = v.done ? 'done' : v.locked ? 'locked' : '';
      const box = document.createElement('span');
      box.className = 'box';
      box.innerHTML = v.done ? '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = v.label ?? t(`task.${v.id}`);
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = v.done ? '' : v.count ?? (v.p > 0 ? `${Math.floor(v.p * 100)}%` : '');
      const bar = document.createElement('i');
      bar.className = 'bar';
      bar.innerHTML = `<b style="width:${(v.p * 100).toFixed(1)}%"></b>`;
      li.append(box, lbl, cnt, bar);
      ul.append(li);
    }
    const doneN = view.filter((v) => v.done).length;
    $('tasksN').textContent = `${doneN}/${view.length}`;
    const free = g.phase !== 'restore';
    $('tasksFree').hidden = !free;
    $('tasksFree').textContent = free ? t(`phase.${g.phase}.note`) : '';
    // every box unpacked: the way to the reveal
    const fb = $('finishBtn');
    fb.hidden = g.phase !== 'done';
    fb.textContent = t(g.meta?.complete ? 'finish.again' : 'finish.go');
  }

  function renderTools(g) {
    const key = `${getLang()}|${g.toolIds.join(',')}|${g.toolId}`;
    if (key === lastTools) return;
    lastTools = key;
    const bar = $('toolbar');
    bar.textContent = '';
    g.toolIds.forEach((id, i) => {
      const b = document.createElement('button');
      b.className = `tool${id === g.toolId ? ' on' : ''}`;
      b.title = `${t(`tool.${id}`)} (${i + 1})`;
      b.setAttribute('aria-label', t(`tool.${id}`));
      b.innerHTML = `${ICONS[id] ?? g.tools[id]?.icon ?? ''}<span class="k">${i + 1}</span>`;
      b.onclick = () => onTool(id);
      bar.append(b);
    });
  }

  let lastPal = '';
  // a word per tool, if it has its own (paint.<tool>.<i>, paint.load.<tool>)
  const word = (key, id) => t(has(`${key}.${id}`) ? `${key}.${id}` : key);
  // (a tool may bring its own words — colorName(hex), paletteLabel() — and have no load at all:
  // the neon tube's colours are the sign's under it, and never run out)
  function renderPalette(g) {
    const r = g.tool?.colors ? g.tool : null;
    const el = $('palette');
    el.hidden = !r;
    if (!r) return;
    const label = r.paletteLabel?.() ?? word('paint.load', r.id);
    const key = `${r.id}|${r.colors.join()}|${r.color}|${Math.round((r.load ?? 1) * 20)}|${label}|${getLang()}`;
    if (key === lastPal) return;
    lastPal = key;
    el.textContent = '';
    r.colors.forEach((hex, i) => {
      const b = document.createElement('button');
      b.className = `pc${hex === r.color ? ' on' : ''}`;
      b.style.background = hex;
      b.title = r.colorName?.(hex) ?? t(has(`paint.${r.id}.${i}`) ? `paint.${r.id}.${i}` : `paint.${i}`);
      b.onclick = () => r.setColor(hex);
      el.append(b);
    });
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = label;
    el.append(lbl);
    if (r.load === undefined) return;
    const load = document.createElement('i');
    load.className = 'load';
    load.innerHTML = `<b style="width:${Math.round(r.load * 100)}%"></b>`;
    el.append(load);
  }

  return {
    refresh() {
      const g = getGame();
      if (!g) return;
      renderList(g);
      renderTools(g);
      renderPalette(g);
      // a hint is a string key, or [key, vars]
      const hk = g.tool?.hint?.() ?? 'hint.hand';
      const h = Array.isArray(hk) ? t(hk[0], hk[1]) : t(hk);
      if (h !== lastHint) {
        lastHint = h;
        $('hint').textContent = h;
      }
    },
    tick(dt) {
      acc += dt;
      if (acc < 0.15) return;
      acc = 0;
      this.refresh();
    },
    banner(text, { long = false } = {}) {
      const el = $('banner');
      el.textContent = text;
      el.classList.remove('on');
      void el.offsetWidth; // restart the animation
      el.classList.add('on');
      el.style.animationDuration = long ? '4.2s' : '2.6s';
    },
  };
}
