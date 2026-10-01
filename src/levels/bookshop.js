import { createFloorMask } from '../floormask.js';
import { mulberry } from '../atmos.js';
import { addStrings } from '../i18n.js';
import { createDust, createWebs, createGild, floorGloss, createPuffs } from './bookshop/systems.js';
import { createDuster, createSander, createGilder, litter, ICON_DUSTER, ICON_SANDER, ICON_GILDER } from './bookshop/tools.js';

// Level 3 — the Old Bookshop, the shop floor (room: src/rooms/bookshop.js). Format: levels/meadow.js.
// Grandpa's corner bookshop, shut for years; the grandchild opens it again.
// The twist: "the shop's colour is its books". Every spine on the shelves starts grey under
// years of dust; the feather duster brings each book's own colour back, and because the
// probes see the books (one merged mesh on the GI layer), the bounce light of the whole shop
// warms up bay by bay as the dust comes off (systems.js createDust).
// Tasks: litter (torn pages, cartons, newspaper) · the shop window and the door glass (the
// grime keeps the evening sun out, as level 1) · sand the dull floor · repaint the plaster
// · dust the shelves · re-gild the shop sign once its wall is painted.

const APRICOT = '#e0a06a'; // the shop's own plaster (shell.js M.plaster)
const PAINTS = [APRICOT, '#e3b25e', '#ecdcc0']; // apricot · ochre · cream

// the dull floor: grey, scuffed, a worn track from the door to the counter, water marks
// under the shop window, grime along the walls (drawn over floormask.js's film; metres
// from the slab's back-left corner)
function scuffed(g, W, H, px, rand) {
  // the track the feet wore in: paler, the varnish walked off
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [pts, w] of [[[[0.35, 0.95], [1.6, 1.25], [3.2, 1.7], [4.45, 1.95]], 0.55], [[[1.6, 1.25], [2.6, 2.6], [3.1, 3.8]], 0.45]]) {
    g.strokeStyle = 'rgba(176,166,150,0.4)';
    g.lineWidth = w * px;
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(x * px, z * px) : g.moveTo(x * px, z * px)));
    g.stroke();
  }
  // scuffs and heel marks
  for (let k = 0; k < 90; k++) {
    const x = rand() * W;
    const y = rand() * H;
    const a = rand() * Math.PI;
    const l = (0.06 + rand() * 0.22) * px;
    g.strokeStyle = `rgba(${52 + Math.round(rand() * 20)},${44 + Math.round(rand() * 14)},36,${(0.3 + rand() * 0.35).toFixed(2)})`;
    g.lineWidth = (0.006 + rand() * 0.014) * px;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rand() - 0.5) * 6, y + Math.sin(a) * l * 0.5 + (rand() - 0.5) * 6, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // rain came in under the shop window: water rings
  for (let k = 0; k < 10; k++) {
    const x = (0.15 + rand() * 1.2) * px;
    const y = (2.3 + rand() * 2.6) * px;
    const r = (0.05 + rand() * 0.12) * px;
    g.strokeStyle = `rgba(96,78,58,${(0.35 + rand() * 0.25).toFixed(2)})`;
    g.lineWidth = 0.012 * px;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.7 + rand() * 0.3), rand() * 3, 0, Math.PI * 2);
    g.stroke();
  }
  // grime gathered along the two walls
  for (const [x0, y0, x1, y1] of [[0, 0, 0.35, 0], [0, 0, 0, 0.35]]) {
    const grd = g.createLinearGradient(x0 * px, y0 * px, x1 * px, y1 * px);
    grd.addColorStop(0, 'rgba(70,60,50,0.55)');
    grd.addColorStop(1, 'rgba(70,60,50,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, x1 ? 0.35 * px : W, y1 ? 0.35 * px : H);
  }
}

// ---- the level ---------------------------------------------------------------------------------------
function setup({ world, journal, rub, state }) {
  const { room } = world;
  const S = world.sites;
  const M = room.materials;
  const puffs = createPuffs(world);

  // the twist: dust over the books and the shelf wood
  const dust = createDust({ spec: S.dust, planes: S.shelves, books: room.books, mats: [room.books.material, M.wood, M.woodBack] });
  // (and cobwebs in the corners, which go with the dust under them)
  const webs = createWebs(world, dust, puffs, S.webs);
  const dustClean = dust.clean;
  const dustRestore = dust.restore;
  Object.assign(dust, {
    clean() { dustClean(); webs.clean(); },
    restore: (url) => dustRestore(url).then(() => webs.sync()),
  });
  // the floor: a grey, scuffed film that takes the varnish's shine with it
  const floor = createFloorMask({ mat: M.floor, bounds: S.floor, id: 'floor', hidden: room.floorHidden });
  floorGloss(M.floor);
  // the sign's gold leaf (it stays on its wall through the repairs: def.stay)
  const sign = createGild(world, { entryId: 'sign' });

  const own = {
    sander: createSander(world, floor, puffs, { rub, rec: journal.surface('sand', { itemOf: () => 0 }) }),
    duster: createDuster(world, dust, puffs, { rub, rec: journal.surface('dust', { itemOf: (item) => item }) }),
    gilder: createGilder(world, sign, puffs, { rub, rec: journal.surface('gild', { itemOf: () => 0 }), ready: () => state().done('paint') }),
  };
  own.sander.icon = ICON_SANDER;
  own.duster.icon = ICON_DUSTER;
  own.gilder.icon = ICON_GILDER;

  const floorRand = mulberry(33);
  const dustRand = mulberry(41);
  const signRand = mulberry(43);
  const system = (s, { fresh, flush = () => s.flush() }) => Object.assign(s, {
    fresh,
    finished: () => s.clean(),
    complete: () => s.clean(),
    update: (dt) => { flush(dt); return false; },
  });
  return {
    systems: {
      sand: system(floor, { fresh: () => floor.dirty(floorRand, { color: '#8e877c', film: 0.6, alpha: 0.4, blobs: 80, draw: scuffed }) }),
      dust: system(dust, {
        fresh: () => { puffs.clear(); dust.dirty(dustRand); webs.fresh(); },
        flush: (dt) => { dust.flush(); webs.update(dt); },
      }),
      gild: system(sign, { fresh: () => sign.dirty(signRand) }),
    },
    tools: own,
  };
}

// ---- the title timelapse's take on the level's own jobs ---------------------------------------------
const demo = {
  async sand(game, api) {
    const { x0, x1, z0, z1 } = api.world.sites.floor;
    const pts = [];
    for (let z = z0 + 0.2, k = 0; z <= z1 - 0.1; z += 0.32, k++) pts.push(api.P(k % 2 ? x1 - 0.12 : x0 + 0.2, 0, z), api.P(k % 2 ? x0 + 0.2 : x1 - 0.12, 0, z));
    if (!await api.stroke(game.tools.sander, pts, 26)) return false;
    game.tools.sander.release();
    if (game.L.sand.progress < 0.88) game.L.sand.clean();
    return api.glideTime(api.at(0.05), 0.6);
  },
  async paint(game, api) {
    // (the usual paint step, but rows the shelves won't hide: the shop front, then the plaster behind the counter)
    const { X0, Z0, Z1, H } = api.world.bounds;
    const roller = game.tools.roller;
    const faces = api.world.sites.walls.faces;
    const left = faces.find((f) => f.face === 'left');
    const back = faces.find((f) => f.face === 'back');
    for (let y = 0.3, k = 0; y < H - 0.05; y += 0.48, k++) {
      roller.setColor(PAINTS[0]); // a fresh dip each row: it's a timelapse
      const row = [api.P(X0 + 0.01, y, Z1 - 0.2), api.P(X0 + 0.01, y, left.lo + 0.05)];
      if (!await api.stroke(roller, k % 2 ? row.reverse() : row, 30)) return false;
    }
    for (let y = 0.3, k = 0; y < H - 0.05; y += 0.48, k++) {
      roller.setColor(PAINTS[0]);
      const row = [api.P(back.lo + 0.2, y, Z0 + 0.01), api.P(back.hi - 0.2, y, Z0 + 0.01)];
      if (!await api.stroke(roller, k % 2 ? row.reverse() : row, 30)) return false;
    }
    roller.release();
    if (game.L.walls.progress < 0.92) game.L.walls.fillGaps(PAINTS[0]);
    return api.glideTime(api.at(0.1), 0.8);
  },
  async dust(game, api) {
    const duster = game.tools.duster;
    const [main, wall] = api.world.sites.shelves;
    let k = 0;
    for (let y = main.y1 - 0.1; y > main.y0 + 0.05; y -= 0.3) {
      const row = [api.P(main.x0 + 0.05, y, main.at), api.P(main.x1 - 0.05, y, main.at)];
      if (!await api.stroke(duster, k++ % 2 ? row.reverse() : row, 6)) return false;
    }
    for (const y of [wall.y0 + 0.3, wall.y1 - 0.25]) {
      if (!await api.stroke(duster, [api.P(wall.x0 + 0.05, y, wall.at), api.P(wall.x1 - 0.1, y, wall.at)], 4)) return false;
    }
    duster.release();
    if (game.L.dust.progress < 0.9) game.L.dust.clean();
    return api.glideTime(api.at(0.15), 0.8);
  },
  async gild(game, api) {
    // (the sign waits for its wall's paint: the level notices within a moment)
    let t = 0;
    if (!await api.frames((dt) => game.tasks.find((k) => k.id === 'paint').done || (t += dt) > 2)) return false;
    const sign = game.L.gild;
    const [w, h] = sign.size;
    const pts = [];
    for (let v = h / 2 - 0.05, k = 0; v > -h / 2; v -= 0.07, k++) pts.push(sign.point(k % 2 ? w / 2 - 0.05 : -w / 2 + 0.05, v), sign.point(k % 2 ? -w / 2 + 0.05 : w / 2 - 0.05, v));
    if (!await api.stroke(game.tools.gilder, pts, 3)) return false;
    game.tools.gilder.release();
    if (game.L.gild.progress < 0.85) game.L.gild.clean();
    return api.wait(0.6);
  },
};

addStrings({
  th: {
    'task.bookshop.trash': 'เก็บเศษกระดาษกับลังพังทิ้งถัง',
    'task.bookshop.windows': 'เช็ดกระจกหน้าร้านกับประตู',
    'task.sand': 'ขัดพื้นไม้ให้กลับมาเงา',
    'task.bookshop.paint': 'ทาสีผนังปูนใหม่',
    'task.dust': 'ปัดฝุ่นชั้นหนังสือ',
    'task.gild': 'ปิดทองป้ายร้านใหม่',
    'tool.sander': 'เครื่องขัดพื้น',
    'tool.duster': 'ไม้ขนไก่',
    'tool.gilder': 'พู่กันปิดทอง',
    'hint.sander': 'กดค้างแล้วเดินเครื่องขัดไปบนพื้น — คราบหมองกับรอยถลอกหลุดออก เนื้อไม้สีน้ำผึ้งกับเงาวาร์นิชกลับมา',
    'hint.duster': 'กดค้างแล้วปัดไปตามสันหนังสือ — ฝุ่นฟุ้งออกแล้วสีของหนังสือก็กลับมา แสงสะท้อนในร้านอุ่นขึ้นทีละช่อง',
    'hint.gilder': 'กดค้างแล้วลากพู่กันไปตามตัวอักษรกับเส้นขอบบนป้าย — ทองคำเปลวติดกลับไปใหม่',
    'hint.gilderLocked': 'ทาสีผนังปูนให้เสร็จก่อน แล้วค่อยปิดทองป้ายที่แขวนอยู่บนผนังนั้น',
    'paint.roller.0': 'แอปริคอต',
    'paint.roller.1': 'เหลืองออกเคอร์',
    'paint.roller.2': 'ครีม',
    'demo.bookshop.trash': 'เก็บเศษกระดาษกับลังพังทิ้ง',
    'demo.bookshop.windows': 'เช็ดกระจกหน้าร้าน — แดดเย็นส่องเข้ามา',
    'demo.sand': 'ขัดพื้นไม้ — สีน้ำผึ้งกลับมา',
    'demo.bookshop.paint': 'ทาสีผนังปูน',
    'demo.dust': 'ปัดฝุ่นหนังสือ — ร้านได้สีของมันคืนทีละช่อง',
    'demo.gild': 'ปิดทองป้ายร้าน',
    'demo.bookshop.unpack': 'แกะกล่อง จัดร้านตามใจ',
    'demo.bookshop.done': 'ร้านหนังสือของคุณตาพร้อมเปิดอีกครั้ง',
    'box.shop': 'ของประดับร้าน',
    // (a shop, not a home: the shared words for the end of the level)
    'phase.unpack': 'ร้านสะอาดแล้ว — ของมาส่งแล้ว!',
    'finish.go': 'เสร็จแล้ว — ดูร้าน',
    'finish.again': 'ดูร้านอีกครั้ง',
    'reveal.title': 'ร้านพร้อมเปิดแล้ว',
  },
  en: {
    'task.bookshop.trash': 'Clear out the torn pages and old boxes',
    'task.bookshop.windows': 'Clean the shop window and the door',
    'task.sand': 'Sand the floor back to a shine',
    'task.bookshop.paint': 'Repaint the plaster',
    'task.dust': 'Dust the bookshelves',
    'task.gild': 'Re-gild the shop sign',
    'tool.sander': 'Floor sander',
    'tool.duster': 'Feather duster',
    'tool.gilder': 'Gilding brush',
    'hint.sander': 'Hold and run the sander over the floor — the grey film and the scuffs come off, the honey wood and its varnish shine come back',
    'hint.duster': 'Hold and sweep along the spines — the dust puffs off and each book gets its colour back; the shop\'s light warms up bay by bay',
    'hint.gilder': 'Hold and brush along the letters and the rules on the sign — the gold leaf goes back on',
    'hint.gilderLocked': 'Finish painting the plaster first, then gild the sign that hangs on it',
    'paint.roller.0': 'Apricot',
    'paint.roller.1': 'Ochre',
    'paint.roller.2': 'Cream',
    'demo.bookshop.trash': 'clear out the torn pages',
    'demo.bookshop.windows': 'wipe the shop window — let the evening sun in',
    'demo.sand': 'sand the floor back to honey',
    'demo.bookshop.paint': 'paint the plaster',
    'demo.dust': 'dust the books — the shop gets its colours back',
    'demo.gild': 're-gild the sign',
    'demo.bookshop.unpack': 'unpack and set up shop',
    'demo.bookshop.done': 'and grandpa\'s bookshop is ready to open again',
    'box.shop': 'Shop things',
    'phase.unpack': 'The shop is clean — the deliveries are here!',
    'finish.go': 'All done — see the shop',
    'finish.again': 'See the shop again',
    'reveal.title': 'Open for business again',
  },
});

export default {
  id: 'bookshop',
  room: 'bookshop',
  bin: { x: 2.3, z: 0.75 },
  tray: { x: -2.45, z: 2.2, ry: 0.35 },
  paints: PAINTS,
  demoPaint: APRICOT,
  trash: {
    seed: 31,
    counts: { page: 10, news: 4, paper: 6, carton: 3, card: 2, can: 2, leaves: 4 },
    kinds: litter,
    blownIn: ['leaves'],
  },
  // the sign stays on its wall (it's re-gilded in place), and grandpa's fairy lights are
  // still strung along the top of the shelves
  stay: ['sign', 'lamp:fairy'],
  boxes: [
    { id: 'furniture', big: true, at: [-1.35, -0.95, 0.12], items: ['GreenChair_01', 'round_wooden_table_01', 'vintage_wooden_drawer_01', 'side_table_tall_01', 'standing_chalkboard_01', 'wooden_stool_02'] },
    { id: 'lights', at: [-0.45, -1.05, -0.2], items: ['lamp:floor', 'lamp:oil', 'lamp:banker', 'lamp:display'] },
    { id: 'books', at: [0.4, -1.2, 0.15], items: ['books:table', 'books:drawer', 'books:counter', 'books:seat', 'books:stool', 'books:floor', 'books:shelftop'] },
    { id: 'plants', at: [1.75, 0.15, 0.25], items: ['potted_plant_02', 'potted_plant_04', 'potted_plant_04#2', 'potted_plant_04#3', 'potted_plant_04#4', 'potted_plant_04#5', 'potted_plant_04#6'] },
    { id: 'frames', at: [-0.8, 1.05, -0.2], items: ['fancy_picture_frame_02', 'vintage_telephone_wall_clock'] },
    // (the cat comes out last: it settles on the window seat, in the sun)
    { id: 'shop', icon: 'decor', at: [1.8, 0.95, 0.1], items: ['CashRegister_01', 'jug_01', 'jug_01#2', 'wicker_basket_02', 'brass_vase_01', 'brass_vase_01#2', 'marble_bust_01', 'hanging_picture_frame_03', 'throw_pillows_01', 'concrete_cat_statue'] },
  ],
  lost: [[-0.2, 1.75, 0.2], [-0.9, -1.2, 0], [2.0, 0.5, -0.2], [-0.25, -0.45, 0.1]],
  tools: ['hand', 'squeegee', 'sander', 'roller', 'duster', 'gilder'],
  tasks: [
    {
      id: 'trash',
      tool: 'hand',
      progress: (L) => L.trash.progress,
      count: (L) => `${L.trash.binned}/${L.trash.total}`,
    },
    {
      // grime on the glass keeps the evening sun out (level 1's twist, the shop's own glazing)
      id: 'windows',
      tool: 'squeegee',
      threshold: 0.85,
      progress: (L) => L.grime.windowProgress,
      finish: (L) => L.grime.finishWindows(),
    },
    {
      id: 'sand',
      tool: 'sander',
      threshold: 0.88,
      progress: (L) => L.sand.progress,
      finish: (L) => L.sand.finish(),
    },
    {
      id: 'paint',
      tool: 'roller',
      threshold: 0.92,
      progress: (L) => L.walls.progress,
      finish: (L, { tools }) => L.walls.fillGaps(tools.roller.color),
    },
    {
      // the twist: the spines' colours come back, and with them the shop's bounce light
      id: 'dust',
      tool: 'duster',
      threshold: 0.9,
      progress: (L) => L.dust.progress,
      finish: (L) => L.dust.clean(),
    },
    {
      id: 'gild',
      tool: 'gilder',
      requires: ['paint'],
      threshold: 0.85,
      progress: (L) => L.gild.progress,
      finish: (L) => L.gild.clean(),
    },
  ],
  setup,
  demo,
  captions: { sand: 'sand', dust: 'dust', gild: 'gild' },
};
