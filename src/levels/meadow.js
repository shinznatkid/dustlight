// Level 1 — Meadow House, living room. What the room starts with and what the
// player must restore. The format every level follows:
//   room: the room module (src/rooms/<room>.js) — where the windows, walls, soot are
//   bin / tray: where the bin and the paint tray stand at the start · paints: roller colours
//   trash: { seed, counts: { kind: n }, kinds?: (rand) => ({ kind: () => mesh }), blownIn? }
//   boxes / lost: the delivery (boxes.js) · tools?: the tool bar's order (default: as used)
//   tasks: [{ id, tool, progress(L), count?(L), threshold?, requires?, finish?(L, ctx) }]
//     progress(L) reads the level's systems · count(L) is the "12/28" in the list ·
//     threshold: done at this share — close enough counts, the rest is tidied up by
//     finish (playtest 2026-09-29: 97% on the windows was a hunt for specks) ·
//     requires: tasks that must be done first (a task `fire` also gates the fireplace)
//   setup?(ctx) → { systems, tools }: the level's own (its twist) — see level.js
//   strings?: { th, en } its own words (task.<level>.<id> overrides task.<id>, tool.<id>, hint.…)
//   demo?: { [task id]: async (api) => bool } — the title timelapse for its own tasks (demo.js)
//   captions? / replay? / replayCost?: its own journal kinds in the timelapse (replay.js)
export default {
  id: 'meadow',
  room: 'meadow',
  bin: { x: 2.6, z: 2.1 },
  tray: { x: -2.45, z: 2.2, ry: 0.35 },
  paints: ['#efe3cf', '#9fae8f', '#c98f6f'], // cream · sage · terracotta
  trash: {
    seed: 11,
    counts: { paper: 9, news: 4, can: 5, bottle: 3, leaves: 5, card: 2 },
  },
  // the delivery once the repairs are done: [x, z, ry] on the open strip at the
  // front, clear of where the furniture usually goes; items come out in this
  // order (the big pieces first)
  boxes: [
    {
      id: 'furniture', big: true, at: [-0.1, 1.5, 0.15],
      items: ['sofa_03', 'coffee_table_round_01', 'wooden_bookshelf_worn', 'ArmChair_01', 'mid_century_lounge_chair', 'Ottoman_01', 'side_table_01'],
    },
    { id: 'lights', at: [0.6, 1.4, -0.25], items: ['lamp:floor', 'lamp:table', 'lamp:candles'] },
    { id: 'books', at: [1.3, 1.45, 0.1], items: ['book_encyclopedia_set_01', 'book_encyclopedia_set_01#2', 'book_encyclopedia_set_01#3', 'book_encyclopedia_set_01#4', 'book_encyclopedia_set_01#5'] },
    {
      id: 'decor', at: [0.0, 2.15, -0.1],
      items: ['throw_pillows_01', 'tea_set_01', 'mantel_clock_01', 'ceramic_vase_01', 'ceramic_vase_01#2', 'boombox', 'wicker_basket_01', 'wicker_basket_01#2', 'standing_picture_frame_01'],
    },
    { id: 'plants', at: [0.65, 2.2, 0.3], items: ['potted_plant_01', 'potted_plant_04', 'potted_plant_04#2'] },
    { id: 'frames', at: [1.3, 2.15, -0.15], items: ['hanging_picture_frame_02', 'hanging_picture_frame_01', 'fancy_picture_frame_01'] },
  ],
  // where the put-aside box may turn up (the first free spot; not the front middle,
  // which sits under the tool bar from the usual camera)
  lost: [[-2.7, 2.2, -0.2], [-1.9, 2.3, 0.15], [0.0, 2.35, 0], [2.65, 2.15, 0.25]],
  tasks: [
    {
      id: 'trash',
      tool: 'hand',
      progress: (L) => L.trash.progress,
      count: (L) => `${L.trash.binned}/${L.trash.total}`,
    },
    {
      // the old boards fly out of the room as they come up (no separate hauling:
      // Hozy's "carry to the bin" step was cut as busywork)
      id: 'pry',
      tool: 'crowbar',
      progress: (L) => L.floor.pryProgress,
      count: (L) => (L.floor.boardsLeft ? `${L.floor.boardsLeft}` : null),
    },
    {
      id: 'lay',
      tool: 'planks',
      requires: ['pry'],
      progress: (L) => L.floor.layProgress,
    },
    {
      // the level's twist: filthy glass keeps the evening sun out
      id: 'windows',
      tool: 'squeegee',
      threshold: 0.85,
      progress: (L) => L.grime.windowProgress,
      finish: (L) => L.grime.finishWindows(),
    },
    {
      id: 'soot',
      tool: 'brush',
      threshold: 0.9,
      progress: (L) => L.grime.sootProgress,
      finish: (L) => L.grime.finishSoot(), // (the fireplace unlocks: the fire task waits on this)
    },
    {
      id: 'paint',
      tool: 'roller',
      threshold: 0.92,
      progress: (L) => L.walls.progress,
      finish: (L, { tools }) => L.walls.fillGaps(tools.roller.color),
    },
    {
      id: 'fire',
      tool: 'hand',
      requires: ['soot'],
      progress: (L) => (L.room.fireOn ? 1 : 0),
    },
  ],
};
