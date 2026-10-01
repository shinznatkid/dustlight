import { store } from '../save.js';

// ---- save --------------------------------------------------------------------------------
// The room in play goes to localStorage (save.js): a moment after each change
// (saveSoon), right away at the moves that leave it (saveNow), and when the tab is hidden.
export function setupAutosave(app) {
  const { world, place, NOHUD } = app;
  let saveT = 0;
  function saveNow() {
    // (not while a save is still being restored, nor while the timelapse or an album
    // room has the world)
    if (!app.game?.live || NOHUD || app.demo?.active || app.replay?.active || app.viewing) return;
    // (progress: for the places card of this room, seen from another room's page)
    store.saveLevel(place.id, { ...app.game.serialize(), time: +world.time.toFixed(3), progress: +app.game.progress.toFixed(3) });
    app.refreshMenu();
  }
  function saveSoon() {
    clearTimeout(saveT);
    saveT = setTimeout(saveNow, 600);
  }
  // a save still queued, dropped (leaving an album room: see album.js)
  const cancelSave = () => clearTimeout(saveT);
  window.addEventListener('visibilitychange', () => { if (document.hidden && (app.state === 'play' || app.state === 'photo')) saveNow(); });
  return { saveNow, saveSoon, cancelSave };
}
