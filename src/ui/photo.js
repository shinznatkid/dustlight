import { t } from '../i18n.js';
import { $, toast } from './dom.js';

// ---- photo mode --------------------------------------------------------------------------------
// Over the room in play (P, the HUD's camera button, the pause menu) or over an album
// room (album.js): the camera is free, the time slider (timeflow.js) sets the time of
// day, Space / Enter shoots a PNG of the 3D view.
export function setupPhoto(app) {
  const { world, audio } = app;

  function enterPhoto() {
    if (app.state !== 'play') return;
    app.syncTimeUi();
    app.setState('photo');
  }
  function exitPhoto() {
    app.holdDay(false);
    if (app.viewing) app.leaveAlbumRoom();
    else if (app.state === 'photo') app.setState('play');
  }
  $('photoExit').onclick = exitPhoto;
  // (added after input.js's handler, which marks the keys it used: its P opens photo mode,
  // this one closes it — the other way round, one press would do both)
  window.addEventListener('keydown', (e) => {
    if (app.state !== 'photo' || app.modal || e.defaultPrevented) return;
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') exitPhoto();
    else if (e.key === ' ' || e.key === 'Enter') shoot();
  });
  async function shoot() {
    audio.sfx('shutter');
    const blob = await world.capture();
    $('flash').classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => $('flash').classList.remove('on')));
    if (!blob) return;
    const a = document.createElement('a');
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    a.download = `dustlight-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(t('photo.saved'));
  }
  $('shoot').onclick = shoot;

  return { enterPhoto };
}
