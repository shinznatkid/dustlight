import { $ } from './dom.js';

// ---- dev panel (?dev) ----------------------------------------------------------------------------
// The old lighting panel: wall paints, the time of day, each render layer on / off.
export const PAINTS = ['#efe3cf', '#9fae8f', '#c98f6f', '#9fb2c2', '#e2bfb3'];

export function setupDev(app) {
  const { world, DEV } = app;
  function setPaint(i) {
    // the walls take their colour from the paint canvas (walls.js): fill it all
    app.game?.L.walls?.fill(PAINTS[i]);
    world.bounceChanged();
    for (const [k, el] of [...document.querySelectorAll('.sw')].entries()) el.classList.toggle('on', k === i);
  }
  if (DEV) {
    $('devpanel').hidden = false;
    $('devTitle').onclick = () => $('devpanel').classList.toggle('min');
    PAINTS.forEach((hex, i) => {
      const el = document.createElement('div');
      el.className = 'sw';
      el.style.background = hex;
      el.onclick = () => setPaint(i);
      $('swatches').appendChild(el);
    });
    $('devTime').addEventListener('input', (e) => {
      app.setTime(+e.target.value);
      $('devTimeName').textContent = world.timeKey;
    });
    for (const b of document.querySelectorAll('#chips .chip')) {
      b.onclick = () => {
        world.layers[b.dataset.k] = !world.layers[b.dataset.k];
        world.applyLayers();
        b.classList.toggle('on', world.layers[b.dataset.k]);
      };
    }
  }
  return { setPaint };
}
