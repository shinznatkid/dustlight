// The places, in the order they open up: each one's level module is src/levels/<id>.js
// (what the room starts with and what to do) and its room src/rooms/<room>.js (the
// shell, furniture and lighting). A place opens once the one before it is finished.
// Here is only what the menu needs without loading a level (names in i18n:
// level.<id>.name / .room / .blurb):
//   img: the card picture until the player has finished the room (then: their "after")
//   start → time: the time of day drifts from `start` (the run-down room) to `time`
//   (the finished look) as the repairs get done; after that the day goes round
//   soon: not playable yet (a "coming soon" card)
//   cardTime: the time of day its card picture is shot at (tools/covers.mjs --cards; else 0.62)
export const LEVELS = [
  { id: 'meadow', room: 'meadow', img: 'ui/level-meadow.jpg', start: 0.45, time: 0.62 },
  { id: 'cabin', room: 'cabin', img: 'ui/level-cabin.jpg', start: 0.45, time: 0.62 },
  { id: 'bookshop', room: 'bookshop', img: 'ui/level-bookshop.jpg', start: 0.45, time: 0.62 },
  // (earlier: the sun patch travels further while the pots dry — playtest 2026-09-30)
  { id: 'pottery', room: 'pottery', img: 'ui/level-pottery.jpg', start: 0.35, time: 0.62 },
  { id: 'castle', room: 'castle', img: 'ui/level-castle.jpg', start: 0.45, time: 0.62 },
  // (dusk into night: the room is about its neon — the day goes round from there once it's repaired)
  { id: 'cyber', room: 'cyber', img: 'ui/level-cyber.jpg', start: 0.8, time: 0.9, cardTime: 0.9 },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id);
export const levelOfRoom = (room) => LEVELS.find((l) => l.room === room && !l.soon) ?? null;
export const nextLevel = (id) => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] ?? null : null;
};

// the level module itself (its code and words load with the page that plays it)
const MODULES = import.meta.glob('./levels/*.js');
export async function loadLevel(id) {
  const meta = levelById(id);
  const def = (await MODULES[`./levels/${id}.js`]()).default;
  return { ...meta, ...def };
}

// open: the first place, and any whose previous place was finished at least once
// (`complete(id)` reads the saves)
export function isOpen(id, complete) {
  const i = LEVELS.findIndex((l) => l.id === id);
  if (i < 0 || LEVELS[i].soon) return false;
  return i === 0 || complete(LEVELS[i - 1].id);
}
