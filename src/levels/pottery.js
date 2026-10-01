import * as THREE from 'three';
import { createFloorMask } from '../floormask.js';
import { mulberry } from '../atmos.js';
import { surfaceTool, mat, toMain } from '../tools/surfaceTools.js';
import { floorMotion } from '../tools/floorMotion.js';
import { createPuffs } from '../puffs.js';
import { addStrings } from '../i18n.js';
import { createDrying } from './pottery/sun.js';
import { createKiln } from './pottery/kiln.js';
import { WHEEL, KILN } from '../rooms/pottery/layout.js';
import { PAL } from '../rooms/pottery/kit.js';

// Level 4 — the potter's studio (room: src/rooms/pottery.js, "flat low-poly"). Format:
// levels/meadow.js. The twist: the raw pots left on the ware board must dry in the sun
// before the kiln can be fired, and the only sun is the patch that comes through the big
// window — which moves as the day goes on with the work, and which grimy glass keeps out
// (levels/pottery/sun.js). Tasks: broken pots and dried clay into the bin · sponge the
// clay off the floor · the window · dry the pots in the sun · paint the walls · brick up
// the kiln (levels/pottery/kiln.js) · fire the kiln.

const PAINTS = [PAL.wall, '#f4e6cb', '#c3d3a4']; // apricot (the room's own) · cream · pale sage

// ---- litter: broken pots and dried clay -----------------------------------------------------
function litter(rand) {
  const clay = [PAL.terracotta, '#b85a34', '#d27a4a', PAL.bisque].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }));
  const dried = ['#b8a58f', '#a8927a', '#c7b7a2'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
  return {
    // a curved shard of a broken pot, lying on its belly
    shard: () => {
      const g = new THREE.Group();
      const n = 1 + Math.floor(rand() * 2);
      const m = clay[Math.floor(rand() * clay.length)];
      for (let k = 0; k < n; k++) {
        const r = 0.06 + rand() * 0.05;
        const arc = 0.9 + rand() * 0.8;
        const h = 0.05 + rand() * 0.05;
        const geo = new THREE.CylinderGeometry(r, r * (0.85 + rand() * 0.3), h, 4, 1, true, -arc / 2, arc).rotateX(Math.PI / 2);
        geo.translate(0, r, 0);
        const s = new THREE.Mesh(geo, m);
        s.position.set((rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12);
        s.rotation.y = rand() * Math.PI * 2;
        g.add(s);
      }
      return g;
    },
    // a lump of clay gone hard where it fell (a dropped wedge, a heap of trimmings)
    lump: () => {
      const geo = new THREE.IcosahedronGeometry(1, 0);
      const p = geo.attributes.position;
      const sx = 0.035 + rand() * 0.03;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * sx * (0.8 + rand() * 0.4), p.getY(i) * 0.025, p.getZ(i) * sx * (0.7 + rand() * 0.5));
      geo.computeVertexNormals();
      geo.translate(0, 0.018, 0);
      return new THREE.Mesh(geo, dried[Math.floor(rand() * dried.length)]);
    },
  };
}

// ---- the floor: dried slip splashed round where the wheel stood, boot prints through it,
// a sack dragged across, ash by the kiln's door (over floormask.js's dust)
function clayFloor({ X0, Z0 }) {
  return (g, W, H, px, rand) => {
    const at = (x, z) => [(x - X0) * px, (z - Z0) * px];
    const blot = (x, y, r, col, a) => {
      g.fillStyle = `rgba(${col},${a.toFixed(2)})`;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.55 + rand() * 0.45), rand() * 3, 0, Math.PI * 2);
      g.fill();
    };
    const [wx, wy] = at(WHEEL.x, WHEEL.z);
    for (let k = 0; k < 70; k++) {
      const a = rand() * Math.PI * 2;
      const r = (0.25 + Math.sqrt(rand()) * 1.0) * px;
      blot(wx + Math.cos(a) * r, wy + Math.sin(a) * r, (0.02 + rand() * 0.07) * px, rand() < 0.5 ? '156,118,92' : '176,150,128', 0.55 + rand() * 0.35);
    }
    // boot prints: from the open side to the wheel, and on to the kiln
    const print = (x, y, a, left) => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = 'rgba(140,110,88,0.7)';
      g.beginPath();
      g.ellipse(left ? -0.06 * px : 0.06 * px, 0, 0.045 * px, 0.11 * px, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    for (const [ax, az, bx, bz] of [[1.8, 2.4, WHEEL.x + 0.3, WHEEL.z + 0.2], [WHEEL.x + 0.3, WHEEL.z - 0.2, KILN.x - 0.3, KILN.z + 0.6], [0.6, 2.4, -1.9, -1.8]]) {
      const [x0, y0] = at(ax, az);
      const [x1, y1] = at(bx, bz);
      const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / (0.34 * px));
      const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
      for (let k = 0; k < n; k++) {
        const f = k / n;
        print(x0 + (x1 - x0) * f + (rand() - 0.5) * 4, y0 + (y1 - y0) * f + (rand() - 0.5) * 4, a + (rand() - 0.5) * 0.3, k % 2 === 0);
      }
    }
    // a sack of clay dragged from the corner
    {
      const [x0, y0] = at(-2.5, -2.0);
      const [x1, y1] = at(-1.3, -0.5);
      g.strokeStyle = 'rgba(160,132,108,0.45)';
      g.lineCap = 'round';
      g.lineWidth = 0.28 * px;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 + 0.3 * px, (y0 + y1) / 2, x1, y1);
      g.stroke();
    }
    // ash in front of the kiln's door
    const out = [Math.sin(KILN.ry), Math.cos(KILN.ry)];
    const [ax, ay] = at(KILN.x + out[0] * 0.75, KILN.z + out[1] * 0.75);
    for (let k = 0; k < 26; k++) blot(ax + (rand() - 0.5) * 0.7 * px, ay + (rand() - 0.5) * 0.5 * px, (0.03 + rand() * 0.09) * px, '92,86,80', 0.35 + rand() * 0.3);
  };
}

// ---- the sponge (a big one, for floors) ------------------------------------------------------
// local +z = up, off the floor: a mustard sponge with a green scouring side underneath
function spongeModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.06), mat(PAL.mustard, { roughness: 1 }));
  body.position.z = 0.045;
  const scour = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.016), mat(0x4f8f45, { roughness: 1 }));
  scour.position.z = 0.008;
  g.add(body, scour);
  Object.assign(g.userData, { body, scour });
  return toMain(g);
}
// held down, the sponge scrubs round and round by itself (tools/floorMotion.js); drops of clay
// slip flick off it while the floor is still dirty
function createSponge(world, dirt, puffs, { rub, rec }) {
  const ray = new THREE.Raycaster();
  const model = spongeModel();
  const { body, scour } = model.userData;
  const tool = surfaceTool(world, {
    id: 'sponge',
    rub,
    rec,
    hint: () => 'hint.sponge',
    model,
    offset: 0.002,
    spacing: 4,
    find: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      return dirt.hit(ray.ray);
    },
    target: () => ({ item: 'floor', normal: new THREE.Vector3(0, 1, 0) }),
    work: (h, px, py) => {
      dirt.wipe(px, py, 0.2 * dirt.px, 0.32);
      return true;
    },
  });
  floorMotion(world, tool, {
    model, slide: [body, scour], pattern: 'orbit', reach: 0.07, rate: 1.8,
    dirt, footR: 0.16, strength: 4, rub, rubKind: 'scrub', puffEvery: 0.09,
    puff: (at, way, left) => {
      puffs.emit(at, way, 1 + Math.round(left * 4), { color: '#a8825e', size: 0.018, spread: 0.18, speed: 0.75, life: 1, alpha: 0.85, drop: 3.8 });
      puffs.emit(at, way, 1 + Math.round(left * 2), { color: '#dbe7ea', size: 0.014, spread: 0.18, speed: 0.8, life: 1, alpha: 0.6, drop: 3.5 });
    },
  });
  tool.icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="9" rx="2.5"/><path d="M4 12.5h16"/><circle cx="9" cy="9.8" r="0.6"/><circle cx="14.5" cy="9.6" r="0.6"/><path d="M6 19.5c1.5 0 2-1 3.5-1s2 1 3.5 1 2-1 3.5-1"/></svg>';
  return tool;
}

// ---- the level's own systems and tools ---------------------------------------------------------
function setup({ world, L, journal, sound, rub, state, note }) {
  const { room } = world;
  const { X0, X1, Z0, Z1 } = world.bounds;
  // dried clay on the floor, out to the planks' open edges (the kiln's plinth covers some: not counted)
  const dirt = createFloorMask({ mat: room.planks, bounds: { x0: X0, x1: X1 + 0.12, z0: Z0, z1: Z1 + 0.12 }, id: 'floor', hidden: [room.kiln.foot] });
  const dirtRand = mulberry(41);
  const stains = Object.assign(dirt, {
    fresh: () => dirt.dirty(dirtRand, { color: '#a08a76', film: 0.32, alpha: 0.4, blobs: 80, draw: clayFloor(world.bounds) }),
    finished: () => dirt.clean(),
    complete: () => dirt.clean(),
    update: () => { dirt.flush(); return false; },
  });
  const drying = createDrying(world, { L, journal, sound, note, state });
  const kiln = createKiln(world, { journal, rub, sound });
  const tools = {
    sponge: createSponge(world, dirt, createPuffs(world), { rub, rec: journal.surface('sponge', { itemOf: () => 0 }) }),
    trowel: kiln.tool,
  };
  return { systems: { stains, drying, kiln }, tools };
}

// ---- the title timelapse's take on the new jobs ---------------------------------------------------
const demo = {
  async sponge(game, api) {
    const { X0, X1, Z0, Z1 } = api.world.bounds;
    const pts = [];
    for (let z = Z0 + 0.15, k = 0; z <= Z1 + 0.1; z += 0.3, k++) pts.push(api.P(k % 2 ? X1 + 0.05 : X0 + 0.15, 0, z), api.P(k % 2 ? X0 + 0.15 : X1 + 0.05, 0, z));
    if (!await api.stroke(game.tools.sponge, pts, 28)) return false;
    game.tools.sponge.release();
    if (game.L.stains.progress < 0.88) game.L.stains.clean();
    return api.glideTime(api.at(0.03), 0.6);
  },
  // the board into the patch of sun, then (quickly) the pots dry where the sun is on them
  async dry(game, api) {
    const { decor } = api.world;
    const home = decor.snapshot().waretable; // (the room is as it starts: its spot under the window)
    if (!await api.wait(0.4)) return false;
    decor.moveTo('waretable', -1.55, -0.25, 90);
    if (!await api.wait(0.9)) return false;
    const d = game.L.drying;
    d.boost = 14;
    let t = 0;
    const ok = await api.frames((dt) => d.progress >= 0.97 || (t += dt) > 4.5);
    d.boost = 1;
    if (!ok) return false;
    d.complete();
    // dry: back under the window, out of the way of the wheel
    if (!await api.wait(0.6)) return false;
    decor.moveTo('waretable', home[0], home[2], THREE.MathUtils.radToDeg(home[3]));
    return api.wait(0.5);
  },
  // a sweep along each course with holes in it, then the trowel put straight on any hole a
  // sweep missed (the ones round the sides, seen edge-on from where the camera happens to be)
  async kiln(game, api) {
    const K = api.world.room.kiln;
    const trowel = game.tools.trowel;
    const on = (phi, y) => K.obj.localToWorld(new THREE.Vector3(Math.sin(phi) * (K.ap + 0.01), y, Math.cos(phi) * (K.ap + 0.01)));
    const rows = [...new Set(game.L.kiln.slots.map((s) => s.k))].sort((a, b) => a - b);
    for (const [n, k] of rows.entries()) {
      const pts = [];
      for (let a = -1.25; a <= 1.25; a += 0.25) pts.push(on(n % 2 ? -a : a, 0.18 + k * 0.12));
      if (!await api.stroke(trowel, pts, 3.2)) return false;
    }
    for (const sl of game.L.kiln.slots) {
      if (sl.filled) continue;
      const point = on(sl.phi, sl.y);
      const normal = point.clone().sub(K.obj.localToWorld(new THREE.Vector3(0, sl.y, 0))).normalize();
      trowel.replay.down({ item: 'kiln', point, normal, px: sl.phi * 100, py: -sl.y * 100 });
      trowel.replay.up();
      if (!await api.wait(0.15)) return false;
    }
    trowel.release();
    if (!await api.wait(0.5)) return false;
    game.L.kiln.complete();
    return api.glideTime(api.at(0.13), 0.8);
  },
};

// the player's timelapse: a pot dried then (journal mark ['dry', i])
const replay = {
  async dry(game, e, speed, { wait }) {
    game.L.drying.setDry(e[2]);
    return wait(0.25 / speed);
  },
};

addStrings({
  th: {
    'task.pottery.trash': 'เก็บเศษหม้อกับก้อนดินทิ้ง',
    'task.sponge': 'เช็ดคราบดินบนพื้น',
    'task.pottery.windows': 'เช็ดกระจกหน้าต่างบานใหญ่',
    'task.dry': 'ตากหม้อดินดิบในแดดให้แห้ง',
    'task.kiln': 'ก่ออิฐอุดรูเตาเผา',
    'task.pottery.fire': 'จุดเตาเผา',
    'tool.sponge': 'ฟองน้ำขัดพื้น',
    'tool.trowel': 'เกรียงกับอิฐ',
    'hint.sponge': 'กดค้างแล้วถูไปบนพื้น — คราบดินแห้งกับฝุ่นจะหลุดออก พื้นไม้กลับมาเป็นสีน้ำผึ้ง',
    'hint.trowel': 'กดค้างแล้วลากผ่านรูบนเตาเผา — อิฐก้อนใหม่จากกองข้างเตาจะเข้าไปอุดทุกรูที่ลากผ่าน',
    'hint.pottery.fireLocked': 'ยังเผาไม่ได้ — ก่ออิฐอุดรูเตาให้ครบ แล้วตากหม้อดินดิบให้แห้งก่อน',
    'hint.pottery.shade': 'หม้อดินดิบยังอยู่ในร่ม — ยกโต๊ะไปวางในปื้นแดดบนพื้น หม้อถึงจะแห้ง',
    'hint.pottery.grimy': 'กระจกยังสกปรก แดดลอดมาถึงหม้อแค่นิดเดียว — เช็ดกระจกก่อน',
    'hint.pottery.drying': 'โดนแดดแล้ว — หม้อกำลังแห้ง',
    'hint.pottery.partSun': 'แดดโดนหม้อแค่บางใบ — ขยับโต๊ะเข้าไปในปื้นแดดอีกหน่อย',
    'hint.pottery.sunMoved': 'แดดเคลื่อนไปแล้ว หม้อตกอยู่ในร่ม — ย้ายโต๊ะตามแดดไป',
    'demo.pottery.trash': 'เก็บเศษหม้อแตกทิ้ง',
    'demo.sponge': 'เช็ดคราบดินบนพื้น',
    'demo.dry': 'ตากหม้อดินดิบในปื้นแดด',
    'demo.kiln': 'ก่ออิฐเตาเผาที่หลุด',
    'demo.pottery.fire': 'จุดเตาเผา — เตาเรืองแสง',
    'demo.pottery.unpack': 'แกะกล่อง จัดสตูดิโอตามใจ',
    'paint.roller.0': 'แอปริคอต',
    'paint.roller.1': 'ครีม',
    'paint.roller.2': 'เขียวเสจอ่อน',
    'box.pots': 'หม้อเคลือบ',
    'box.greenware': 'หม้อดิบ',
    'box.studio': 'ของบนโต๊ะปั้น',
    'box.wallthings': 'ของแขวนผนัง',
  },
  en: {
    'task.pottery.trash': 'Bin the broken pots and dry clay',
    'task.sponge': 'Sponge the clay off the floor',
    'task.pottery.windows': 'Clean the big window',
    'task.dry': 'Dry the raw pots in the sun',
    'task.kiln': 'Brick up the holes in the kiln',
    'task.pottery.fire': 'Fire up the kiln',
    'tool.sponge': 'Floor sponge',
    'tool.trowel': 'Trowel & bricks',
    'hint.sponge': 'Hold and scrub over the floor — the dried clay and dust come up, and the honey boards come back',
    'hint.trowel': 'Hold and sweep over the holes in the kiln — a new brick off the stack goes into every hole you pass',
    'hint.pottery.fireLocked': 'Not yet — brick up the kiln\'s holes and dry the raw pots first',
    'hint.pottery.shade': 'The raw pots are in the shade — carry their table into the patch of sun on the floor',
    'hint.pottery.grimy': 'The grimy glass keeps most of the sun off the pots — clean the window first',
    'hint.pottery.drying': 'In the sun — the pots are drying',
    'hint.pottery.partSun': 'The sun is only on some of the pots — nudge the table further into the patch',
    'hint.pottery.sunMoved': 'The sun has moved on and the pots are in the shade — move their table after it',
    'demo.pottery.trash': 'clear out the broken pots',
    'demo.sponge': 'sponge up the clay',
    'demo.dry': 'dry the raw pots in the sun',
    'demo.kiln': 'brick up the kiln',
    'demo.pottery.fire': 'fire up the kiln',
    'demo.pottery.unpack': 'unpack and set up the studio',
    'paint.roller.0': 'Apricot',
    'paint.roller.1': 'Cream',
    'paint.roller.2': 'Pale sage',
    'box.pots': 'Glazed pots',
    'box.greenware': 'Greenware',
    'box.studio': 'Studio things',
    'box.wallthings': 'Wall things',
  },
});

export default {
  id: 'pottery',
  room: 'pottery',
  bin: { x: 2.55, z: 0.55 }, // (by the right-hand edge: the front corner sits under the tool bar)
  tray: { x: -2.25, z: 2.0, ry: 0.35 },
  paints: PAINTS,
  demoPaint: PAINTS[0],
  trash: {
    seed: 17,
    counts: { shard: 10, lump: 8, paper: 4, card: 1 },
    kinds: litter,
    blownIn: [],
  },
  // the raw pots on their board and the low table under the window were left behind
  stay: ['waretable', 'wareboard'],
  boxes: [
    { id: 'furniture', big: true, at: [-0.2, 1.1, 0.1], items: ['wheel', 'worktable', 'shelfunit', 'rack', 'chair', 'lowtable', 'stool', 'sacks', 'crate'] },
    { id: 'lights', at: [-0.25, -1.15, 0.1], items: ['lamp:floor', 'lamp:table', 'lamp:garland'] },
    { id: 'pots', icon: 'decor', at: [0.55, -0.55, -0.2], items: ['pots:shelf0a', 'pots:shelf0b', 'pots:shelf1a', 'pots:shelf1b', 'pots:shelf2a', 'pots:shelf2b', 'pots:shelf3a', 'pots:shelf3b', 'pots:shelf4a', 'pots:shelf4b', 'pots:shelftop'] },
    { id: 'greenware', icon: 'decor', at: [0.35, 0.35, 0.25], items: ['greenware:0a', 'greenware:0b', 'greenware:1a', 'greenware:1b', 'greenware:2a', 'greenware:2b', 'sill:bottle', 'sill:vase', 'sill:jar'] },
    { id: 'plants', at: [-0.9, 2.05, 0.2], items: ['plant:big', 'plant:table', 'plant:shelftop', 'plant:sill', 'sill:succulent'] },
    { id: 'studio', icon: 'books', at: [-1.4, 1.35, -0.15], items: ['tableclutter', 'buckets', 'jars', 'radio', 'books', 'teaset', 'waterbucket'] },
    { id: 'wallthings', icon: 'frames', at: [1.3, -1.2, -0.1], items: ['print', 'apron'] },
  ],
  lost: [[0.9, 2.2, -0.2], [-1.9, 2.3, 0.15], [1.6, -0.6, 0], [0.0, -1.3, 0.2]],
  tools: ['hand', 'sponge', 'squeegee', 'roller', 'trowel'],
  tasks: [
    {
      id: 'trash',
      tool: 'hand',
      progress: (L) => L.trash.progress,
      count: (L) => `${L.trash.binned}/${L.trash.total}`,
    },
    {
      id: 'sponge',
      tool: 'sponge',
      threshold: 0.88,
      progress: (L) => L.stains.progress,
      finish: (L) => L.stains.finish(),
    },
    {
      // (clean glass lets the sun in: the pots can't dry behind the grime)
      id: 'windows',
      tool: 'squeegee',
      threshold: 0.85,
      progress: (L) => L.grime.windowProgress,
      finish: (L) => L.grime.finishWindows(),
    },
    {
      // the twist: the raw pots dry only where the sun reaches them
      id: 'dry',
      tool: 'hand',
      threshold: 0.97,
      progress: (L) => L.drying.progress,
      count: (L) => `${L.drying.dried}/${L.drying.total}`,
      finish: (L) => L.drying.complete(),
    },
    {
      id: 'paint',
      tool: 'roller',
      threshold: 0.92,
      progress: (L) => L.walls.progress,
      finish: (L, { tools }) => L.walls.fillGaps(tools.roller.color),
    },
    {
      id: 'kiln',
      tool: 'trowel',
      progress: (L) => L.kiln.progress,
      count: (L) => `${L.kiln.filled}/${L.kiln.total}`,
    },
    {
      id: 'fire',
      tool: 'hand',
      requires: ['kiln', 'dry'],
      progress: (L) => (L.room.fireOn ? 1 : 0),
    },
  ],
  setup,
  demo,
  replay,
  replayCost: { dry: () => 0.25 },
  // the timelapse's captions for its own kinds (stay: the board carried into the sun)
  captions: { sponge: 'sponge', brick: 'kiln', dry: 'dry', stay: 'dry' },
};
