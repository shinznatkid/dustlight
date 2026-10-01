import * as THREE from 'three';
import { createFloorMask } from '../floormask.js';
import { mulberry } from '../atmos.js';
import { surfaceTool, mat, toMain } from '../tools/surfaceTools.js';
import { floorMotion } from '../tools/floorMotion.js';
import { createPuffs } from '../puffs.js';
import { addStrings, t } from '../i18n.js';
import { createNeon } from './cyber/neon.js';
import { HOB } from '../rooms/cyber/layout.js';

// Level 6 — Neon Alley: the flat over the noodle bar (room: src/rooms/cyber.js, "flat
// low-poly", dusk into night). Format: levels/meadow.js. The old sign-maker who lived here
// is gone and his three neon signs are dead; the twist is relighting them tube by tube
// (levels/cyber/neon.js) — each new stretch of tube glows as you trace it, and the room fills
// with its colour. Tasks: noodle cups and takeout into the bin · mop the rain-muddy floor ·
// the window (the street's neon comes in through it after dark) · the signs · the grease on
// the kitchen tiles · paint · light the stove under the first pot of noodles · and last, once
// the pot's on, the noodle bar's lantern outside the window (the tube through the glass): it
// strikes and its colour pours into the room. The signs can be any of a few colours each
// (neon.js SWATCHES), and stay lit all day like a city's; the flat sounds of rain and the city.

const PAINTS = ['#efe3d6', '#e9b3ab', '#c9b7e1']; // cream (the room's own) · dusty rose · lilac
const HOB_POT = HOB.x - 0.14; // the burner the noodle pot stands on (rooms/cyber/shell.js)

// ---- litter: what a lonely flat collects ---------------------------------------------------------
function litter(rand) {
  const white = new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.7 });
  const bands = ['#e0463a', '#f0a830', '#2f9a8f', '#d94f8a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const foil = new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide });
  const kraft = new THREE.MeshStandardMaterial({ color: '#c9955a', roughness: 0.9 });
  const flyers = ['#ff5fae', '#4fd8f0', '#ffd04f', '#b48cf0'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide }));
  const stick = new THREE.MeshStandardMaterial({ color: '#e2c08a', roughness: 0.8 });
  const cupGeo = new THREE.CylinderGeometry(0.048, 0.034, 0.09, 12, 1, true).translate(0, 0.045, 0);
  const cupBase = new THREE.CircleGeometry(0.034, 12).rotateX(Math.PI / 2).translate(0, 0.002, 0);
  const bandGeo = new THREE.CylinderGeometry(0.0485, 0.043, 0.03, 12, 1, true).translate(0, 0.068, 0);
  return {
    // an empty cup of instant noodles, its foil lid peeled half back (sometimes on its side)
    cup: () => {
      const g = new THREE.Group();
      const body = new THREE.Group();
      body.add(new THREE.Mesh(cupGeo, white), new THREE.Mesh(cupBase, white), new THREE.Mesh(bandGeo, bands[Math.floor(rand() * bands.length)]));
      const lid = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12, 0, Math.PI * 1.3), foil);
      lid.rotation.set(-Math.PI / 2 + 0.9, 0, 0);
      lid.position.set(0, 0.092, -0.02);
      body.add(lid);
      if (rand() < 0.45) {
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.048;
      }
      g.add(body);
      if (rand() < 0.5) {
        for (const dz of [-0.01, 0.01]) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.008, 0.008), stick);
          c.position.set(0.12, 0.004, 0.06 + dz);
          c.rotation.y = 0.3;
          g.add(c);
        }
      }
      return g;
    },
    // a folded takeout box, its flaps up
    takeout: () => {
      const g = new THREE.Group();
      const shape = new THREE.CylinderGeometry(0.07, 0.055, 0.09, 4, 1).rotateY(Math.PI / 4).translate(0, 0.045, 0);
      const box = new THREE.Mesh(shape, rand() < 0.5 ? white : kraft);
      g.add(box);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.063, 0.018, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.06, 0), bands[Math.floor(rand() * 2)]);
      g.add(band);
      for (const s of [-1, 1]) {
        const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), box.material);
        flap.material = box.material.clone();
        flap.material.side = THREE.DoubleSide;
        flap.position.set(0, 0.1, s * 0.045);
        flap.rotation.x = s * 0.5;
        g.add(flap);
      }
      return g;
    },
    // a flyer that blew in (a bright handbill, a little curled)
    flyer: () => {
      const geo = new THREE.PlaneGeometry(0.2, 0.28, 4, 4).rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, 0.003 + Math.abs(p.getX(i)) * 0.08 + rand() * 0.004);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, flyers[Math.floor(rand() * flyers.length)]);
    },
  };
}

// ---- the floor: rain and grime tramped in — boot prints from the open side to the kitchen
// and the desk, a wet patch under the window where the rain got in, a film over it all
function rainyFloor({ X0, Z0 }) {
  return (g, W, H, px, rand) => {
    const at = (x, z) => [(x - X0) * px, (z - Z0) * px];
    const blot = (x, y, r, col, a) => {
      g.fillStyle = `rgba(${col},${a.toFixed(2)})`;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.55 + rand() * 0.45), rand() * 3, 0, Math.PI * 2);
      g.fill();
    };
    // the wet patch under the window: dark water stains and grit
    const [wx, wy] = at(X0 + 0.4, -0.2);
    for (let k = 0; k < 60; k++) {
      blot(wx + (rand() - 0.2) * 1.3 * px, wy + (rand() - 0.5) * 2.0 * px, (0.03 + rand() * 0.12) * px, rand() < 0.5 ? '70,62,74' : '96,84,86', 0.4 + rand() * 0.35);
    }
    const print = (x, y, a, left) => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = 'rgba(66,54,58,0.72)';
      g.beginPath();
      g.ellipse(left ? -0.06 * px : 0.06 * px, 0, 0.045 * px, 0.11 * px, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    for (const [ax, az, bx, bz] of [[2.6, 2.4, 1.0, -1.6], [1.0, -1.6, -1.9, 1.3], [-1.9, 1.3, 2.2, 2.4], [0.4, 2.4, -2.2, -0.6]]) {
      const [x0, y0] = at(ax, az);
      const [x1, y1] = at(bx, bz);
      const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / (0.34 * px));
      const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
      for (let k = 0; k < n; k++) {
        const f = k / n;
        print(x0 + (x1 - x0) * f + (rand() - 0.5) * 4, y0 + (y1 - y0) * f + (rand() - 0.5) * 4, a + (rand() - 0.5) * 0.3, k % 2 === 0);
      }
    }
    // a spilled drink by the sofa
    const [sx, sy] = at(-0.4, -1.3);
    for (let k = 0; k < 10; k++) blot(sx + (rand() - 0.5) * 0.4 * px, sy + (rand() - 0.5) * 0.3 * px, (0.05 + rand() * 0.08) * px, '104,70,60', 0.5);
  };
}

// ---- the mop (a string mop with a teal handle; local +z = up, off the floor) --------------------------
function mopModel() {
  const g = new THREE.Group();
  const strands = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.05, 16).rotateX(Math.PI / 2), mat(0xeee6d4, { roughness: 1 }));
  strands.position.z = 0.025;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12).rotateX(Math.PI / 2), mat(0xef7a63, { roughness: 0.5 }));
  cap.position.z = 0.07;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.9, 8), mat(0x3a8a8f, { roughness: 0.5 }));
  handle.rotation.x = Math.PI / 2 + 0.45; // (its foot in the cap — tilted the other way it stood on the floor beside the mop)
  handle.position.set(0, -0.19, 0.48);
  g.add(strands, cap, handle);
  Object.assign(g.userData, { strands, cap, handle });
  return toMain(g);
}
const MOP_HAND = new THREE.Vector3(0, -0.19 - 0.45 * Math.sin(0.45), 0.48 + 0.45 * Math.cos(0.45)); // the handle's top
const ICON_MOP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3l-4.5 10"/><path d="M8 13h7l2 3H6z"/><path d="M7 16l-1.5 4M10 16l-.5 4.5M13 16l.5 4.5M16 16l1.5 4"/></svg>';
// held down, the mop wipes back and forth by itself (tools/floorMotion.js) and water flicks off it
function createMop(world, dirt, puffs, { rub, rec }) {
  const ray = new THREE.Raycaster();
  const model = mopModel();
  const { strands, cap, handle } = model.userData;
  const tool = surfaceTool(world, {
    id: 'mop',
    rub,
    rec,
    hint: () => 'hint.mop',
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
  // (droplets are unlit: dimmer than the cabin's, in a room lit by neon at night)
  floorMotion(world, tool, {
    model, hand: MOP_HAND, swing: [handle], slide: [strands, cap], pattern: 'wipe', reach: 0.13, rate: 1.2,
    dirt, footR: 0.17, strength: 4, rub, rubKind: 'scrub', puffEvery: 0.08,
    puff: (at, way, left) => {
      puffs.emit(at, way, 2 + Math.round(left * 4), { color: '#9fb4c4', size: 0.016, spread: 0.2, speed: 0.9, life: 1, alpha: 0.55, drop: 3.5 });
      if (left > 0.15) puffs.emit(at, way, 1 + Math.round(left * 3), { color: '#4a3c36', size: 0.02, spread: 0.16, speed: 0.7, life: 1, alpha: 0.8, drop: 4 });
    },
  });
  tool.icon = ICON_MOP;
  return tool;
}

// ---- the level's own systems and tools -----------------------------------------------------------------
function setup({ world, L, journal, sound, rub, note, state }) {
  const { room } = world;
  const { X0, X1, Z0, Z1 } = world.bounds;
  // the mud on the floor, out to the planks' open edges (under the kitchen counter it's never seen)
  const mud = createFloorMask({ mat: room.planks, bounds: { x0: X0, x1: X1 + 0.12, z0: Z0, z1: Z1 + 0.12 }, id: 'floor', hidden: [room.obstacles[0]] });
  const mudRand = mulberry(61);
  const mudSys = Object.assign(mud, {
    fresh: () => mud.dirty(mudRand, { color: '#5e5560', film: 0.34, alpha: 0.42, blobs: 80, draw: rainyFloor(world.bounds) }),
    finished: () => mud.clean(),
    complete: () => mud.clean(),
    update: () => { mud.flush(); return false; },
  });
  // (the lantern outside waits for what the street task requires: the clean window, the stove lit)
  const streetNeeds = TASKS.find((k) => k.id === 'street').requires;
  const neon = createNeon(world, { journal, rub, sound, note, t, locked: () => !streetNeeds.every((id) => state().done(id)) });
  // grease: the shared soot pattern is a fireplace's (smoke from an opening at the bottom);
  // the kitchen tiles get years of cooking on top of it — a plume of smoke and steam up from
  // where the pot stands, spatters round both burners. Drawn on the same mask (grime.js keeps
  // and saves it), right after the room is made fresh.
  const greaseRand = mulberry(77);
  const grease = {
    fresh() {
      const S = L.grime?.soot;
      if (!S) return;
      const { g, w: W, h: H } = S.mask;
      const site = S.site;
      const u = (x) => ((x - (site.at[0] - site.w / 2)) / site.w) * W; // world x → canvas x
      const blob = (x, y, r, a) => {
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgba(46,34,24,${a})`);
        grd.addColorStop(1, 'rgba(46,34,24,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      };
      const pot = u(HOB_POT);
      for (let k = 0; k < 34; k++) {
        const f = greaseRand(); // up the plume: it widens and thins as it rises
        blob(pot + (greaseRand() - 0.5) * W * (0.12 + f * 0.4), H * (1 - f * 0.95), H * (0.1 + f * 0.16), 0.55 + 0.35 * (1 - f));
      }
      for (let k = 0; k < 70; k++) {
        const x = greaseRand() < 0.6 ? pot + (greaseRand() - 0.5) * W * 0.5 : greaseRand() * W;
        const y = H * (0.45 + greaseRand() * 0.55);
        g.fillStyle = `rgba(${90 + Math.floor(greaseRand() * 40)},${66 + Math.floor(greaseRand() * 20)},30,${(0.5 + greaseRand() * 0.4).toFixed(2)})`;
        g.beginPath();
        g.arc(x, y, 1.5 + greaseRand() * 4.5, 0, Math.PI * 2);
        g.fill();
      }
      S.mask.touch();
      S.mask.flush();
      S.mesh.visible = true;
    },
    finished() {},
    complete() {},
    serialize: () => 0,
    restore() {},
    update: () => false,
  };
  return {
    systems: { mud: mudSys, neon, grease },
    tools: {
      mop: createMop(world, mud, createPuffs(world), { rub, rec: journal.surface('mop', { itemOf: () => 0 }) }),
      tube: neon.tool,
    },
  };
}

// ---- the title timelapse's take on the new jobs ----------------------------------------------------------
const demo = {
  async mop(game, api) {
    const { X0, X1, Z0, Z1 } = api.world.bounds;
    const pts = [];
    for (let z = Z0 + 0.3, k = 0; z <= Z1 - 0.1; z += 0.34, k++) pts.push(api.P(k % 2 ? X1 - 0.1 : X0 + 0.25, 0, z), api.P(k % 2 ? X0 + 0.25 : X1 - 0.1, 0, z));
    if (!await api.stroke(game.tools.mop, pts, 28)) return false;
    game.tools.mop.release();
    if (game.L.mud.progress < 0.88) game.L.mud.clean();
    return api.glideTime(api.at(0.015), 0.5);
  },
  // every tube of every sign in the flat traced once, quickly; each sign strikes as it fills
  async neon(game, api) {
    const N = game.L.neon;
    const tube = game.tools.tube;
    for (const i of N.inner) {
      for (let si = 0; si < N.signs[i].strokes.length; si++) {
        if (N.signs[i].done) break;
        if (!await api.stroke(tube, N.strokeWorld(i, si), 2.6)) return false;
      }
      N.strikeSign(i);
      if (!await api.wait(0.5)) return false;
    }
    tube.release();
    return api.glideTime(api.at(0.1), 0.6); // (between the window's +0.08 and the paint's +0.13: demo.js)
  },
  // the lantern outside, through the window (a beat first: the stove's task is judged, and the
  // lantern waits on it)
  async street(game, api) {
    const N = game.L.neon;
    const tube = game.tools.tube;
    const i = N.street;
    if (i < 0) return true;
    if (!await api.wait(0.6)) return false;
    for (let si = 0; si < N.signs[i].strokes.length; si++) {
      if (N.signs[i].done) break;
      if (!await api.stroke(tube, N.strokeWorld(i, si), 2.2)) return false;
    }
    N.strikeSign(i);
    tube.release();
    return api.wait(0.9);
  },
};

// the player's timelapse: a sign struck up then (journal mark ['sign', i]) · a colour picked
// for a sign (['tint', name, colour])
const replay = {
  async sign(game, e, speed, { wait }) {
    game.L.neon.strikeSign(e[2], true);
    return wait(0.3 / speed);
  },
  async tint(game, e, speed, { wait }) {
    game.L.neon.recolor(e[2], e[3]);
    return wait(0.25 / speed);
  },
};

addStrings({
  th: {
    'task.cyber.trash': 'เก็บถ้วยบะหมี่กับกล่องข้าวทิ้ง',
    'task.cyber.mop': 'ถูพื้นที่เปื้อนรอยโคลนฝน',
    'task.cyber.windows': 'เช็ดกระจกหน้าต่างบานใหญ่',
    'task.neon': 'ต่อหลอดนีออนให้ป้ายติดทั้ง 3 ป้าย',
    'task.cyber.soot': 'ขัดคราบมันบนกระเบื้องหลังเตา',
    'task.cyber.fire': 'จุดเตา ต้มบะหมี่หม้อแรก',
    'tool.mop': 'ไม้ถูพื้น',
    'tool.tube': 'หลอดนีออน',
    'hint.mop': 'กดค้างแล้วถูไปบนพื้น — รอยโคลนกับคราบน้ำฝนจะหลุดออก พื้นไม้กลับมาเงาสะท้อนไฟ',
    'task.cyber.street': 'ต่อหลอดโคมร้านบะหมี่นอกหน้าต่าง',
    'hint.tube': 'กดค้างที่หลอดสีเทาบนป้ายแล้วลากไปตามเส้น — หลอดใหม่ติดสว่างตามที่ลาก ทีละเส้น (ลากเร็ว ๆ ได้) · ป้ายติดเกือบครบจะสว่างขึ้นเองทั้งป้าย · เลือกสีหลอดของป้ายที่ชี้อยู่ได้ที่จานสีด้านล่าง',
    'hint.brush': 'กดค้างแล้วขัดคราบมันกับควันบนกระเบื้องหลังเตา',
    'hint.cyber.fireLocked': 'ยังตั้งหม้อไม่ได้ — ขัดคราบมันหลังเตาให้สะอาด แล้วต่อหลอดให้ป้ายนีออนติดครบก่อน',
    'hint.cyber.sign.ramen': 'ป้ายชามบะหมี่ติดแล้ว — ห้องเป็นสี{col}ทั้งห้อง',
    'hint.cyber.sign.moon': 'ป้ายพระจันทร์ง่วงนอนติดแล้ว — แสงสี{col}นวล ๆ ที่มุมห้อง',
    'hint.cyber.sign.cat': 'ป้ายแมวติดแล้ว — แสงสี{col}ข้างหน้าต่าง',
    'hint.cyber.sign.street': 'โคมร้านบะหมี่ติดแล้ว — แสงสี{col}ส่องเข้ามาทางหน้าต่าง ร้านข้างล่างเปิดอีกครั้ง',
    'hint.cyber.streetOpen': 'หม้อแรกเดือดแล้ว กลิ่นลอยลงไปถึงร้านข้างล่าง — แต่โคมป้ายร้านนอกหน้าต่างยังดับอยู่ หยิบหลอดนีออนแล้วต่อผ่านกระจกได้เลย',
    'hint.cyber.streetLocked': 'โคมของร้านข้างล่าง — ร้านยังไม่เปิด จุดเตาต้มบะหมี่หม้อแรกก่อน (และเช็ดกระจกให้ใส)',
    'neon.palette': 'สีหลอด · {sign}',
    'neon.sign.ramen': 'ป้ายชามบะหมี่',
    'neon.sign.moon': 'ป้ายพระจันทร์',
    'neon.sign.cat': 'ป้ายแมว',
    'neon.sign.street': 'โคมร้านบะหมี่',
    'neon.col.ff2f9a': 'ชมพูบานเย็น',
    'neon.col.ff5a4f': 'แดงปะการัง',
    'neon.col.b45cff': 'ม่วง',
    'neon.col.2fe4ff': 'ฟ้าน้ำทะเล',
    'neon.col.ffa733': 'ส้มอำพัน',
    'neon.col.ffcf4a': 'เหลืองทอง',
    'neon.col.6dffb3': 'เขียวมิ้นท์',
    'neon.col.ff8f3a': 'ส้ม',
    'neon.col.4f8cff': 'น้ำเงิน',
    'neon.col.b6ff3a': 'เขียวมะนาว',
    'demo.cyber.trash': 'เก็บถ้วยบะหมี่กับกล่องข้าวทิ้ง',
    'demo.cyber.mop': 'ถูพื้น — รอยโคลนฝนหายไป',
    'demo.cyber.windows': 'เช็ดกระจก — ไฟนีออนของเมืองส่องเข้ามา',
    'demo.neon': 'ต่อหลอดนีออน — ป้ายติดทีละป้าย สีเต็มห้อง',
    'demo.cyber.soot': 'ขัดคราบมันหลังเตา',
    'demo.cyber.paint': 'ทาสีผนังใหม่',
    'demo.cyber.fire': 'จุดเตา — ต้มบะหมี่หม้อแรก',
    'demo.cyber.street': 'ต่อโคมร้านบะหมี่นอกหน้าต่าง — แสงสีส่องเข้ามา',
    'demo.cyber.unpack': 'แกะกล่อง จัดห้องตามใจ',
    'demo.cyber.done': 'ห้องเหนือร้านบะหมี่กลับมาสว่างไสวอีกครั้ง',
    'paint.roller.0': 'ครีม',
    'paint.roller.1': 'ชมพูกุหลาบ',
    'paint.roller.2': 'ม่วงไลแลค',
    'box.kitchen': 'ของในครัว',
    'box.tech': 'ของเล่นกับหนังสือ',
    'box.wall': 'ของแขวนผนัง',
  },
  en: {
    'task.cyber.trash': 'Bin the noodle cups and takeout boxes',
    'task.cyber.mop': 'Mop the rain-muddied floor',
    'task.cyber.windows': 'Clean the big window',
    'task.neon': 'Relight all three neon signs',
    'task.cyber.soot': 'Scrub the grease off the kitchen tiles',
    'task.cyber.fire': 'Light the stove for the first pot of noodles',
    'tool.mop': 'Mop',
    'tool.tube': 'Neon tube',
    'hint.mop': 'Hold and mop over the floor — the muddy prints and rain stains come up, and the boards shine with the lights again',
    'task.cyber.street': 'Relight the noodle bar\'s lantern outside',
    'hint.tube': 'Press on a grey tube on a sign and trace along it — a new tube lights up as you go, one line at a time (trace as fast as you like) · a nearly-done sign lights the rest itself · pick the tube colour of the sign you\'re at from the swatches below',
    'hint.brush': 'Hold and scrub the grease and smoke off the tiles behind the stove',
    'hint.cyber.fireLocked': 'Not yet — scrub the tiles behind the stove, and get all the neon signs lit first',
    'hint.cyber.sign.ramen': 'The noodle bowl is lit — the whole room goes {col}',
    'hint.cyber.sign.moon': 'The sleepy moon is lit — a soft {col} glow in the corner',
    'hint.cyber.sign.cat': 'The cat is lit — a {col} glow by the window',
    'hint.cyber.sign.street': 'The noodle bar\'s lantern is lit — {col} light pours in through the window, and the shop downstairs is open again',
    'hint.cyber.streetOpen': 'The first pot is boiling and the smell drifts down to the shop — but its lantern outside the window is still dark: take the neon tube and fix it through the glass',
    'hint.cyber.streetLocked': 'The noodle bar\'s lantern — the shop isn\'t open yet: boil the first pot of noodles up here first (and get the glass clean)',
    'neon.palette': 'Tube colour · {sign}',
    'neon.sign.ramen': 'noodle bowl',
    'neon.sign.moon': 'moon',
    'neon.sign.cat': 'cat',
    'neon.sign.street': 'noodle bar lantern',
    'neon.col.ff2f9a': 'magenta',
    'neon.col.ff5a4f': 'coral red',
    'neon.col.b45cff': 'violet',
    'neon.col.2fe4ff': 'cyan',
    'neon.col.ffa733': 'amber',
    'neon.col.ffcf4a': 'gold',
    'neon.col.6dffb3': 'mint',
    'neon.col.ff8f3a': 'orange',
    'neon.col.4f8cff': 'blue',
    'neon.col.b6ff3a': 'lime',
    'demo.cyber.trash': 'bin the noodle cups and takeout',
    'demo.cyber.mop': 'mop up the rainy prints',
    'demo.cyber.windows': 'clean the glass — the city\'s neon comes in',
    'demo.neon': 'relight the neon, sign by sign',
    'demo.cyber.soot': 'scrub the grease off the tiles',
    'demo.cyber.paint': 'paint the walls',
    'demo.cyber.fire': 'light the stove — the first pot of noodles',
    'demo.cyber.street': 'relight the noodle bar\'s lantern — its colour pours in',
    'demo.cyber.unpack': 'unpack and make it home',
    'demo.cyber.done': 'the flat over the noodle bar glows again',
    'paint.roller.0': 'Cream',
    'paint.roller.1': 'Dusty rose',
    'paint.roller.2': 'Lilac',
    'box.kitchen': 'Kitchen things',
    'box.tech': 'Gadgets & books',
    'box.wall': 'Wall things',
  },
});

const TASKS = [
  {
    id: 'trash',
    tool: 'hand',
    progress: (L) => L.trash.progress,
    count: (L) => `${L.trash.binned}/${L.trash.total}`,
  },
  {
    id: 'mop',
    tool: 'mop',
    threshold: 0.88,
    progress: (L) => L.mud.progress,
    finish: (L) => L.mud.finish(),
  },
  {
    // grimy glass keeps the street's neon out (it's the "sun" after dark)
    id: 'windows',
    tool: 'squeegee',
    threshold: 0.85,
    progress: (L) => L.grime.windowProgress,
    finish: (L) => L.grime.finishWindows(),
  },
  {
    // the twist: trace the dead tubes, the signs light up one by one
    id: 'neon',
    tool: 'tube',
    progress: (L) => L.neon.progress,
    count: (L) => `${L.neon.done}/${L.neon.total}`,
    finish: (L) => L.neon.finishInner(),
  },
  {
    id: 'soot',
    tool: 'brush',
    threshold: 0.9,
    progress: (L) => L.grime.sootProgress,
    finish: (L) => L.grime.finishSoot(),
  },
  {
    id: 'paint',
    tool: 'roller',
    threshold: 0.92,
    progress: (L) => L.walls.progress,
    finish: (L, { tools }) => L.walls.fillGaps(tools.roller.color),
  },
  {
    // the stove (the room's fire) once the tiles are clean and the signs are lit: the first
    // pot of noodles
    id: 'fire',
    tool: 'hand',
    requires: ['soot', 'neon'],
    progress: (L) => (L.room.fireOn ? 1 : 0),
  },
  {
    // the last job: the noodle bar's lantern outside the window, through the (clean) glass —
    // once the first pot is on, the shop downstairs opens too; it strikes and its colour pours
    // in through the window (playtest 2026-09-30: the 4th sign as the last task)
    id: 'street',
    tool: 'tube',
    requires: ['windows', 'fire'],
    progress: (L) => L.neon.streetProgress,
    finish: (L) => L.neon.finishStreet(),
  },
];

export default {
  id: 'cyber',
  room: 'cyber',
  bin: { x: 2.45, z: 0.55 },
  tray: { x: -0.45, z: 1.95, ry: 0.35 },
  paints: PAINTS,
  demoPaint: PAINTS[1], // (dusty rose: the change reads from across the room)
  trash: {
    seed: 23,
    counts: { cup: 8, takeout: 4, can: 5, paper: 4, bottle: 2, flyer: 4 },
    kinds: litter,
    blownIn: ['flyer'],
  },
  // the signs are on the walls, dead, from the start — and the lantern you brought with you
  stay: ['lamp:ramen', 'lamp:moon', 'lamp:cat', 'lamp:lantern'],
  boxes: [
    { id: 'furniture', big: true, at: [0.85, 0.45, 0.15], items: ['sofa', 'seat', 'table', 'desk', 'chair', 'shelf', 'fridge', 'cushion', 'cushion#2'] },
    { id: 'lights', at: [1.75, -0.35, -0.2], items: ['lamp:floor', 'lavalamp'] },
    { id: 'kitchen', icon: 'decor', at: [1.95, 0.85, 0.1], items: ['ricecooker', 'microwave', 'toaster', 'bowls', 'jars', 'luckycat'] },
    { id: 'tech', icon: 'books', at: [0.2, 1.45, -0.15], items: ['crt', 'keyboard', 'speaker', 'radio', 'cassettes', 'books', 'books#2', 'books#3'] },
    { id: 'plants', at: [1.15, 1.6, 0.25], items: ['plant:big', 'plant:sill', 'plant:desk', 'plant:shelf', 'plant:fridge'] },
    { id: 'wall', icon: 'frames', at: [0.05, 0.25, 0.2], items: ['poster:noodles', 'poster:city', 'clock'] },
    // (the cat comes out last: it curls up on the window seat)
    { id: 'decor', at: [1.95, 1.9, -0.1], items: ['pillow', 'pillow#2', 'blanket', 'cat'] },
  ],
  lost: [[1.2, 2.2, -0.2], [-0.4, 2.25, 0.15], [2.3, 1.45, 0], [0.45, -1.55, 0.2]],
  tools: ['hand', 'mop', 'squeegee', 'tube', 'brush', 'roller'],
  tasks: TASKS,
  // what the flat sounds like (ui/cues.js refreshAmbience; audio.js ambience entries): rain on the
  // window and the city's low hum, day and night (it rains here all the time — softer by day),
  // and for its "fire" the pot boiling on the gas instead of a crackling hearth. The rain file is
  // quiet and bright: brought up and low-passed, as heard through the glass (tools/soundcheck.mjs)
  ambience: {
    day: [{ id: 'city', gain: 0.9 }, { id: 'rain', gain: 3.5, lp: 3000 }],
    night: [{ id: 'city', gain: 0.9 }, { id: 'rain', gain: 6, lp: 3000 }],
    fire: [{ id: 'boil', gain: 1.8 }],
  },
  setup,
  demo,
  replay,
  replayCost: { sign: () => 0.3, tint: () => 0.25 },
  // (a colour picked without a stroke plays in with whatever work it came between)
  captions: { mop: 'mop', neon: 'neon', sign: 'neon', tint: null },
};
