// The small page helpers every screen uses: an element by id, a pause, the toast line
// and the full-screen fade. (A leaf: the only module the other ui/* modules import.)

export const $ = (id) => document.getElementById(id);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- toast / fade ---------------------------------------------------------------------
let toastT = 0;
export function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2200);
}
export const fade = (on) => new Promise((r) => { $('fade').classList.toggle('on', on); setTimeout(r, 620); });
