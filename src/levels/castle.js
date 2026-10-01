import * as THREE from 'three';
import { createWalls } from '../walls.js';
import { createFloorMask } from '../floormask.js';
import { mulberry } from '../atmos.js';
import { createPuffs } from '../puffs.js';
import { createRoller, mat, toMain } from '../tools/surfaceTools.js';
import { addStrings } from '../i18n.js';
import { createGlazing } from './castle/glazing.js';
import { litter, createBroom, oldRushes } from './castle/tools.js';
import { FIRE } from '../rooms/castle/shell.js';

// Level 5 — the Tower Solar, a castle (room: src/rooms/castle.js). Format: levels/meadow.js.
// The lady's sitting room at the top of the tower, shut up for years: rotten rushes on the
// flagstones, grimy damp walls, soot up the hood, and the stained-glass lancet — the room's
// pride — half its panes broken and stuffed with rags.
// The twist: the stained glass throws the evening sun into the room as coloured light (a real
// light the GI bounces: rooms/castle/glass.js). Every rag pulled and pane set in lights its own
// patch of ruby, sapphire or gold on the floor at once; wiping the grime brightens them all.
// Tasks: litter (old rushes, feathers, candle stubs, leaves) · sweep the flags (besom) · the
// windows · mend the stained glass (glazier) · soot on the hearth · limewash the walls (brush,
// three colours; the grey-green damp stone turns warm and the whole room's bounce with it) ·
// light the fire.

const LIMEWASH = ['#f4e3c3', '#efc36a', '#eeaa98']; // cream (the room's own) · saffron · rose

// the walls before: grey-green damp stone, blotched, streaked, greener near the floor, sooty up high
const OLD_STONE = /* glsl */`
vec3 oldWall(vec2 m) {
  vec3 c = wOld;
  c *= mix(0.76, 1.06, smoothstep(0.25, 0.65, wf(m * 1.4)));
  c *= mix(0.84, 1.0, smoothstep(0.3, 0.6, wf(vec2(m.x * 6.0, m.y * 0.5))));
  c = mix(c, c * vec3(0.72, 0.86, 0.64), smoothstep(1.0, 0.0, m.y) * 0.75);
  c *= mix(1.0, 0.78, smoothstep(2.3, 3.2, m.y));
  return c;
}
`;

// ---- the limewash brush and its bucket -----------------------------------------------------------------
// a wide flat brush (local +z = away from the wall); its bristles show the colour and the load
function limeBrushModel() {
  const g = new THREE.Group();
  const bristles = mat(LIMEWASH[0], { roughness: 0.95 });
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.06), mat(0x9a5c34, { roughness: 0.7 }));
  block.position.z = 0.085;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.065, 0.06), bristles);
  hair.position.z = 0.03;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.3, 10), mat(0x7a4a2a, { roughness: 0.6 }));
  handle.position.set(0, -0.17, 0.15);
  handle.rotation.x = -0.5;
  g.add(block, hair, handle);
  g.userData.paint = bristles;
  return toMain(g);
}
// a wooden bucket of limewash on the floor (click it to load the brush)
function bucket() {
  const g = new THREE.Group();
  g.name = 'limewash-bucket';
  const wood = new THREE.MeshStandardMaterial({ color: 0xa0643a, roughness: 0.8 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3432, roughness: 0.5, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 16, 1, true).translate(0, 0.15, 0), wood);
  body.material.side = THREE.DoubleSide;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16).translate(0, 0.01, 0), wood);
  const lime = new THREE.MeshStandardMaterial({ color: LIMEWASH[0], roughness: 0.4 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20).rotateX(-Math.PI / 2).translate(0, 0.25, 0), lime);
  const bands = [0.06, 0.24].map((y) => new THREE.Mesh(new THREE.TorusGeometry(0.16 - y * 0.08, 0.008, 6, 24).rotateX(Math.PI / 2).translate(0, y, 0), iron));
  g.add(body, base, top, ...bands);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.paint = lime;
  return g;
}
// smoke stains up the stone hood over the hearth: a see-through decal on its sloping front and
// the chimney breast above, fading as the soot comes off the jambs (the brush's own task)
function hoodSoot({ Z0, H }) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  const rnd = mulberry(61);
  for (let k = 0; k < 60; k++) {
    // thick at the bottom middle (over the fire), thinning out as it climbs
    const y = 512 - Math.pow(rnd(), 1.6) * 470;
    const spread = 40 + (512 - y) * 0.18;
    const x = 128 + (rnd() - 0.5) * spread * 2;
    const r = 18 + rnd() * 34;
    const a = 0.5 * Math.min(1, (y - 40) / 300);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(34,26,20,${a.toFixed(2)})`);
    grd.addColorStop(1, 'rgba(34,26,20,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const { x: fx, mantel: y0, hood } = FIRE;
  const e = 0.008; // off the stone
  const zs0 = Z0 + hood.d0 + e;
  const zs1 = Z0 + hood.d1 + e;
  const v = (y) => (y - y0) / (H - y0);
  // the slope (a trapezoid) then the breast straight up; u across each row's own width
  const P = [
    [fx - hood.hw0, y0 + 0.005, zs0, 0, v(y0)], [fx + hood.hw0, y0 + 0.005, zs0, 1, v(y0)],
    [fx + hood.hw1, hood.y1, zs1, 1, v(hood.y1)], [fx - hood.hw1, hood.y1, zs1, 0, v(hood.y1)],
    [fx + hood.hw1, H, zs1, 1, 1], [fx - hood.hw1, H, zs1, 0, 1],
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap((p) => p.slice(0, 3)), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap((p) => p.slice(3)), 2));
  geo.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4, 3, 4, 5]);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.renderOrder = 3;
  m.name = 'hood-soot';
  toMain(m);
  m.castShadow = false;
  return m;
}

const ICON_LIME ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="6" rx="1.5"/><path d="M6 9v5M9.5 9v6M13 9v5M16.5 9v6"/><path d="M12 15v6"/></svg>';

// ---- the level's own systems and tools -------------------------------------------------------------------------
function setup({ world, L, journal, sound, rub, onToolChange, tools, state, note }) {
  const { room } = world;
  const S = world.sites;
  const { X0, Z0 } = world.bounds;

  // (dust and chaff off the broom)
  const puffs = createPuffs(world);
  // the old rushes on the flags (the hearthstone is stone: not counted)
  const dirt =createFloorMask({ mat: room.flags, bounds: S.floor, id: 'floor', hidden: room.fireplace });
  const dirtRand = mulberry(51);
  const rushes = Object.assign(dirt, {
    fresh: () => dirt.dirty(dirtRand, { color: '#6e6250', film: 0.42, alpha: 0.42, blobs: 70, draw: oldRushes({ X0, Z0 }, FIRE) }),
    finished: () => dirt.clean(),
    complete: () => dirt.clean(),
    update: () => { dirt.flush(); return false; },
  });

  // the limewash over the damp stone (the room's `paint` material, its own look before)
  const walls = createWalls(room, S.walls, { mat: room.paint, id: 'limewash', oldGLSL: OLD_STONE, old: S.walls.old });
  const pail = bucket();
  pail.position.set(-2.35, 0, 2.05);
  pail.rotation.y = 0.3;
  world.scene.add(pail);
  world.gi.patchScene(pail);
  const lime = Object.assign(walls, {
    fresh: () => walls.clear(),
    finished: () => walls.fill(LIMEWASH[0]),
    complete: () => walls.fillGaps(tools.limewash?.color ?? LIMEWASH[0]),
    update: () => {
      walls.flush();
      const st = state();
      pail.visible = st.phase === 'restore' || st.toolId === 'limewash';
      return false;
    },
  });

  // the smoke up the hood goes as the soot comes off the jambs (from where it stood at the start)
  const smoke = hoodSoot(world.bounds);
  world.scene.add(smoke);
  world.gi.patchScene(smoke);
  let smoke0 = 0.4;
  // (what shows eases after the soot: the job done at 90% counts as all clean at once, and the
  // smoke went in a frame while the jambs' last soot faded — playtest 2026-09-30: everything fades)
  let shown = null;
  const soot = () => L.grime?.sootProgress ?? 1;
  const hood = {
    fresh() {
      smoke0 = Math.min(0.8, soot());
      shown = null;
    },
    finished() { shown = null; },
    complete() {},
    serialize: () => null,
    restore() { shown = null; },
    update(dt) {
      const k = THREE.MathUtils.clamp((soot() - smoke0) / Math.max(0.05, 0.9 - smoke0), 0, 1);
      shown = shown === null ? 1 - k : shown + (1 - k - shown) * Math.min(1, dt * 2.5);
      smoke.material.opacity = shown;
      smoke.visible = shown > 0.004;
      return false;
    },
  };

  const glazing = createGlazing(world, { L, journal, sound, rub, note });
  const own = {
    broom: createBroom(world, dirt, puffs, { rub, rec: journal.surface('broom', { itemOf: () => 0 }) }),
    glazier: glazing.tool,
    limewash: createRoller(world, walls, {
      id: 'limewash', sound, rub, colors: LIMEWASH, tray: pail, onChange: onToolChange,
      model: limeBrushModel(), hints: { use: 'hint.limewash', dry: 'hint.limewashDry' }, rubKind: 'scrub', cap: 40, width: 0.46,
      rec: journal.surface('limewash', { itemOf: (face) => face, colorOf: () => tools.limewash.color }),
    }),
  };
  own.limewash.icon = ICON_LIME;
  return { systems: { rushes, walls: lime, glazing, hood }, tools: own };
}

// ---- the title timelapse's take on the level's own jobs --------------------------------------------------------
const demo = {
  async broom(game, api) {
    const { x0, x1, z0, z1 } = api.world.sites.floor;
    const pts = [];
    for (let z = z0 + 0.25, k = 0; z <= z1 - 0.1; z += 0.34, k++) pts.push(api.P(k % 2 ? x1 - 0.15 : x0 + 0.2, 0, z), api.P(k % 2 ? x0 + 0.2 : x1 - 0.15, 0, z));
    if (!await api.stroke(game.tools.broom, pts, 26)) return false;
    game.tools.broom.release();
    if (game.L.rushes.progress < 0.88) game.L.rushes.clean();
    return api.glideTime(api.at(0.03), 0.6);
  },
  // down the window pane by pane: every rag out, a new piece of glass in
  async glaze(game, api) {
    const G = api.world.room.glass;
    const tool = game.tools.glazier;
    const pts = [...game.L.glazing.plugged]
      .map((p) => G.centreOf(p))
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([s, t]) => G.toWorld(s, t));
    if (pts.length && !await api.stroke(tool, pts.length > 1 ? pts : [pts[0], pts[0]], 1.6)) return false;
    tool.release();
    if (game.L.glazing.progress < 1) game.L.glazing.complete();
    return api.wait(0.8);
  },
  async limewash(game, api) {
    const { X0, X1, Z0, Z1, H } = api.world.bounds;
    const brush = game.tools.limewash;
    for (let y = 0.3, k = 0; y < H - 0.05; y += 0.44, k++) {
      const row = [api.P(X0 + 0.01, y, Z1 - 0.2), api.P(X0 + 0.01, y, Z0 + 0.02), api.P(X0 + 0.02, y, Z0 + 0.01), api.P(X1 - 0.2, y, Z0 + 0.01)];
      brush.setColor(LIMEWASH[0]); // a fresh dip each row: it's a timelapse
      if (!await api.stroke(brush, k % 2 ? row.reverse() : row, 30)) return false;
    }
    brush.release();
    if (game.L.walls.progress < 0.92) game.L.walls.fillGaps(LIMEWASH[0]);
    return api.glideTime(api.at(0.13), 0.8);
  },
};

addStrings({
  th: {
    'task.castle.trash': 'เก็บฟางเก่า ขนนก ตอเทียนทิ้ง',
    'task.broom': 'กวาดพื้นหิน',
    'task.castle.windows': 'เช็ดกระจกหน้าต่างทั้งสองบาน',
    'task.glaze': 'ซ่อมหน้าต่างกระจกสี',
    'task.castle.soot': 'ขัดเขม่าบนเตาผิง',
    'task.limewash': 'ทาปูนขาวผนังใหม่',
    'task.castle.fire': 'จุดไฟในเตาผิง',
    'tool.broom': 'ไม้กวาดทางมะพร้าว',
    'tool.glazier': 'กระจกสีกับตะกั่ว',
    'tool.limewash': 'แปรงทาปูนขาว',
    'hint.broom': 'กดค้างแล้วกวาดไปบนพื้น — ฟางเก่ากับฝุ่นหลุดออก พื้นหินสีน้ำผึ้งกลับมา',
    'hint.glazier': 'กดค้างแล้วลากผ่านช่องที่อุดผ้าขี้ริ้วไว้ — ผ้าหลุดออก กระจกสีชิ้นใหม่เข้าไปแทน แสงสีตกลงพื้นทันที',
    'hint.limewash': 'กดค้างแล้วลากบนผนังเพื่อทาปูนขาว · เลือกสีด้านล่าง · ปูนหมดให้คลิกถังไม้บนพื้น',
    'hint.limewashDry': 'ปูนในแปรงหมดแล้ว — คลิกถังไม้บนพื้น หรือเลือกสีด้านล่าง',
    'hint.castle.fireLocked': 'ปล่องยังอุดตันด้วยเขม่า — ขัดเขม่าเตาผิงก่อนแล้วค่อยจุดไฟ',
    'hint.castle.glassDirty': 'หน้าต่างกระจกสีครบแล้ว — เช็ดคราบออก สีจะสดขึ้นทั้งพื้น',
    'hint.castle.glassDone': 'หน้าต่างกระจกสีครบแล้ว — แดดเย็นระบายสีลงพื้นอีกครั้ง',
    'paint.limewash.0': 'ครีม',
    'paint.limewash.1': 'เหลืองหญ้าฝรั่น',
    'paint.limewash.2': 'ชมพูกุหลาบ',
    'paint.load.limewash': 'ปูนในแปรง',
    'demo.castle.trash': 'เก็บฟางเก่ากับขนนกทิ้ง',
    'demo.broom': 'กวาดพื้นหิน',
    'demo.castle.windows': 'เช็ดกระจก — แดดส่องเข้ามา',
    'demo.glaze': 'ซ่อมกระจกสี — แสงสีตกลงพื้น',
    'demo.castle.soot': 'ขัดเขม่าเตาผิง',
    'demo.limewash': 'ทาปูนขาว — ห้องหินสว่างอุ่นขึ้น',
    'demo.castle.fire': 'จุดไฟในเตาผิง',
    'demo.castle.unpack': 'แกะกล่อง จัดห้องบนหอคอย',
    'demo.castle.done': 'ห้องบนหอคอยกลับมาอบอุ่นอีกครั้ง',
    'box.hangings': 'ผ้าแขวนผนัง',
    'box.feast': 'ของบนโต๊ะ',
    'box.treasure': 'ของมีค่า',
  },
  en: {
    'task.castle.trash': 'Clear out the old rushes, feathers and candle stubs',
    'task.broom': 'Sweep the flagstones',
    'task.castle.windows': 'Clean both windows',
    'task.glaze': 'Mend the stained glass',
    'task.castle.soot': 'Scrub the soot off the hearth',
    'task.limewash': 'Limewash the walls',
    'task.castle.fire': 'Light the fire',
    'tool.broom': 'Besom broom',
    'tool.glazier': 'Glass & lead',
    'tool.limewash': 'Limewash brush',
    'hint.broom': 'Hold and sweep over the floor — the old rushes and dust come up, and the honey flagstones come back',
    'hint.glazier': 'Hold and sweep over the panes stuffed with rags — each rag pops out, a new piece of glass goes in, and its colour lands on the floor',
    'hint.limewash': 'Hold and brush over the walls to limewash them · pick a colour below · out of lime? click the bucket on the floor',
    'hint.limewashDry': 'The brush is dry — click the bucket on the floor, or pick a colour below',
    'hint.castle.fireLocked': 'The chimney is choked with soot — scrub the hearth first, then light the fire',
    'hint.castle.glassDirty': 'The stained glass is whole again — wipe the grime off and the colours on the floor will glow',
    'hint.castle.glassDone': 'The stained glass is whole again — the evening sun paints the floor once more',
    'paint.limewash.0': 'Cream',
    'paint.limewash.1': 'Saffron',
    'paint.limewash.2': 'Rose',
    'paint.load.limewash': 'Lime on the brush',
    'demo.castle.trash': 'clear out the old rushes',
    'demo.broom': 'sweep the flagstones',
    'demo.castle.windows': 'wipe the windows — let the sun in',
    'demo.glaze': 'mend the stained glass — colour on the floor',
    'demo.castle.soot': 'scrub the hearth',
    'demo.limewash': 'limewash the walls — the stone warms up',
    'demo.castle.fire': 'light the fire',
    'demo.castle.unpack': 'unpack and set up the tower room',
    'demo.castle.done': 'and the tower room is warm again',
    'box.hangings': 'Wall hangings',
    'box.feast': 'Table things',
    'box.treasure': 'Treasures',
  },
});

export default {
  id: 'castle',
  room: 'castle',
  bin: { x: 2.6, z: 0.6 },
  trash: {
    seed: 51,
    counts: { straw: 11, feather: 6, stub: 4, leaves: 5 },
    kinds: litter,
    blownIn: ['leaves', 'feather'],
  },
  // the old torches were never taken down from their brackets
  stay: ['lamp:torch', 'lamp:torch2'],
  demoPaint: LIMEWASH[0],
  boxes: [
    { id: 'furniture', big: true, at: [-0.35, -0.7, 0.15], items: ['throne', 'settle', 'table', 'chair', 'chair#2', 'bookcase', 'chest', 'lectern', 'sidetable', 'footstool'] },
    { id: 'lights', at: [0.6, -0.5, -0.2], items: ['lamp:floor', 'lamp:table', 'lamp:candles'] },
    { id: 'hangings', icon: 'frames', at: [-0.6, 0.85, 0.1], items: ['tapestry', 'tapestry#2', 'banner', 'banner#2', 'shield'] },
    { id: 'books', at: [0.05, 1.65, -0.15], items: ['books', 'books#2', 'books#3', 'book', 'book#2', 'potion', 'potion#2', 'potion#3'] },
    { id: 'feast', icon: 'decor', at: [-0.8, 2.15, 0.2], items: ['roast', 'plate', 'goblet', 'goblet#2', 'apples', 'candle', 'potion#4', 'goblet#3'] },
    // (the hound comes out last: it settles in front of the fire)
    { id: 'treasure', icon: 'decor', at: [2.72, 0.05, 0.1], items: ['crown', 'coins', 'coins#2', 'cushion', 'cushion#2', 'firewood', 'hound'] },
  ],
  lost: [[0.3, 2.25, -0.2], [-1.2, -0.25, 0.15], [2.7, 1.35, 0], [0.95, -0.25, 0.2]],
  tools: ['hand', 'broom', 'squeegee', 'glazier', 'brush', 'limewash'],
  tasks: [
    {
      id: 'trash',
      tool: 'hand',
      progress: (L) => L.trash.progress,
      count: (L) => `${L.trash.binned}/${L.trash.total}`,
    },
    {
      id: 'broom',
      tool: 'broom',
      threshold: 0.88,
      progress: (L) => L.rushes.progress,
      finish: (L) => L.rushes.finish(),
    },
    {
      id: 'windows',
      tool: 'squeegee',
      threshold: 0.85,
      progress: (L) => L.grime.windowProgress,
      finish: (L) => L.grime.finishWindows(),
    },
    {
      // the twist: every pane set in throws its colour on the floor
      id: 'glaze',
      tool: 'glazier',
      progress: (L) => L.glazing.progress,
      count: (L) => `${L.glazing.mended}/${L.glazing.total}`,
    },
    {
      id: 'soot',
      tool: 'brush',
      threshold: 0.9,
      progress: (L) => L.grime.sootProgress,
      finish: (L) => L.grime.finishSoot(),
    },
    {
      id: 'limewash',
      tool: 'limewash',
      threshold: 0.92,
      progress: (L) => L.walls.progress,
      finish: (L, { tools }) => L.walls.fillGaps(tools.limewash.color),
    },
    {
      id: 'fire',
      tool: 'hand',
      requires: ['soot'],
      progress: (L) => (L.room.fireOn ? 1 : 0),
    },
  ],
  setup,
  demo,
  captions: { broom: 'broom', glaze: 'glaze', limewash: 'limewash' },
};
