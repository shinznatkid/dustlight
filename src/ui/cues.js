// ---- audio cues per context ----------------------------------------------------------------
// Every game sound goes through `sound`; the music follows the screen and the time of
// day, the ambience the place, the time and the fire; the buttons click and hover.
export function setupCues(app) {
  const { world, audio, place } = app;

  // every game sound goes through here: upholstered things land with a soft thump
  function sound(id, opts = {}, item = null) {
    if (app.demo?.active || app.replay?.active) return; // the timelapses play silently under the music
    const soft = item && /sofa|pillow|ottoman|armchair|chair/i.test(item.id);
    audio.sfx(id === 'drop' && soft ? 'drop_soft' : id, opts);
    if (id === 'drop' || id === 'cancel') app.saveSoon();
  }

  function musicFor(s) {
    if (s === 'menu' || s === 'levels' || s === 'album') return ['menu'];
    return world.time >= 0.8 ? ['night'] : ['day1', 'day2', 'day3'];
  }
  // a level may sound like its own place (def.ambience: { day, night, fire } → ambience ids or
  // { id, gain, lp } — levels/cyber.js); the countryside's birds / crickets / fireplace otherwise
  function refreshAmbience() {
    if (app.state === 'loading') return;
    const own = place?.ambience ?? {};
    const want = [];
    const night = world.time >= 0.8;
    want.push(own[night ? 'night' : 'day'] ?? (night ? 'night' : 'day'));
    if (world.room.fireOn) want.push(own.fire ?? 'fire');
    audio.ambience(want.flat());
  }
  let ambT = 0;
  world.onFrame((dt) => {
    ambT -= dt;
    if (ambT > 0) return;
    ambT = 1;
    refreshAmbience();
    if (app.state === 'play' || app.state === 'photo') audio.music(musicFor(app.state));
    // the music opens up as the room comes back: muffled at the start, clear when done
    audio.setTone(app.game && (app.state === 'play' || app.state === 'photo') ? 0.3 + 0.7 * app.game.progress : 1);
  });
  audio.preload(['pickup', 'drop', 'drop_soft', 'blocked', 'rotate', 'cancel', 'switch', 'click', 'hover', 'shutter', 'rustle', 'bin', 'task', 'sting', 'pry', 'plank', 'box_open']); // (rubbing sounds are made in audio.js)
  document.addEventListener('click', (e) => { if (e.target.closest('button')) audio.sfx('click'); });
  document.addEventListener('pointerover', (e) => {
    const b = e.target.closest?.('button');
    if (b && !b.disabled && e.relatedTarget?.closest?.('button') !== b) audio.sfx('hover', { gain: 0.5 });
  });

  return { sound, musicFor };
}
