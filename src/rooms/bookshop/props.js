import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { loadGLTF, recolor, place } from '../kit.js';
import { BASE, canvasTexture, mulberry } from './common.js';
import { Shelf } from './books.js';
import { ROOM, COUNTER, SEAT, SHELF, DOOR, WIN, NOOK, WALL_SHELVES, DISPLAY, onDisplay } from './plan.js';
import { SHELF_GAPS, gapSpot } from './shell.js';

// Furniture and ornaments of the bookshop: Poly Haven models (CC0, fetched by
// tools/fetch_room_bookshop.py) recoloured into the warm palette, plus a few
// procedural pieces (book stacks, the shop sign). Same entry format as props.js
// LAYOUT: big = seen by GI probes · y = height it stands on · yc = centre height
// (wall things) · recolor = fabric swap per material name · boards = surfaces on it.
const { X0, Z0 } = ROOM;
const R90 = Math.PI / 2;
const gap = (i) => gapSpot(SHELF_GAPS[i]);
const CUSHION = SEAT.h + 0.1;

const TABLE = { x: 0.15, z: 0.35, s: 0.72 };

export const LAYOUT = [
  // reading corner
  { id: 'GreenChair_01', x: NOOK.chair.x, z: NOOK.chair.z, ry: NOOK.chair.ry, big: true, recolor: { GreenChair_01: '#a8322a' } },
  { id: 'side_table_tall_01', x: NOOK.side.x, z: NOOK.side.z, big: true, boards: [{ h: NOOK.side.top, hx: 0.16, hz: 0.16 }] },
  { id: 'wooden_stool_02', x: NOOK.stool.x, z: NOOK.stool.z, ry: 0.95, scale: 1.3 },
  // display table in the middle, in the sun
  { id: 'round_wooden_table_01', x: TABLE.x, z: TABLE.z, scale: TABLE.s, big: true, boards: [{ h: 1.01 * TABLE.s - 0.004, hx: 0.42, hz: 0.42 }] },
  // counter
  { id: 'CashRegister_01', x: 2.45, z: -1.22, y: COUNTER.h, ry: Math.PI * 0.8, scale: 0.85 },
  { id: 'jug_01', x: 2.88, z: -1.02, y: COUNTER.h, ry: -0.6 },
  // window seat
  { id: 'concrete_cat_statue', x: X0 + 0.27, z: 0.52, y: CUSHION, ry: R90 + 0.4, scale: 1.25, recolor: { concrete_cat_statue: '#d9803a' } },
  { id: 'throw_pillows_01', x: X0 + 0.2, z: 1.3, y: CUSHION, ry: R90, scale: 0.62, recolor: { throw_pillows_01: '#d9a23a' } },
  { id: 'potted_plant_04', x: X0 + 0.28, z: SEAT.z0 + 0.14, y: SEAT.h },
  // floor
  { id: 'potted_plant_02', x: 2.82, z: 0.2, ry: 0.4, big: true, block: false },
  { id: 'standing_chalkboard_01', x: 2.78, z: 1.72, ry: 0.85, big: true, chalk: true },
  { id: 'vintage_wooden_drawer_01', x: DISPLAY.x, z: DISPLAY.z, ry: DISPLAY.ry, big: true, boards: [{ h: 0.55, hx: 0.42, hz: 0.21 }] },
  // walls
  { id: 'vintage_telephone_wall_clock', x: X0 + 0.01, z: (DOOR.z1 + WIN.z0) / 2, ry: R90, yc: 1.85 },
  { id: 'fancy_picture_frame_02', x: X0 + 0.01, z: 2.15, ry: R90, yc: 1.72 },
  // shelves: ornaments in the gaps left for them
  { id: 'potted_plant_04', x: gap(0).x, z: gap(0).z, y: gap(0).y, scale: 1.1 },
  { id: 'wicker_basket_02', x: gap(1).x, z: gap(1).z, y: gap(1).y, ry: 0.3 },
  { id: 'brass_vase_01', x: gap(2).x, z: gap(2).z, y: gap(2).y, scale: 0.42 },
  { id: 'hanging_picture_frame_03', x: gap(5).x, z: SHELF.back + 0.1, y: gap(5).y, scale: 0.62, lean: 0.12 },
  { id: 'potted_plant_04', x: gap(4).x, z: gap(4).z, y: gap(4).y, ry: 1.2 },
  { id: 'marble_bust_01', x: gap(6).x, z: gap(6).z, y: gap(6).y, scale: 0.62, ry: 0.35 },
  { id: 'potted_plant_04', x: gap(7).x, z: gap(7).z, y: gap(7).y, ry: 2.2, scale: 0.9 },
  { id: 'potted_plant_04', x: -2.55, z: SHELF.back + 0.2, y: SHELF.cornice, scale: 1.35, ry: 1.0 },
  { id: 'brass_vase_01', x: 0.55, z: SHELF.back + 0.18, y: SHELF.cornice, scale: 0.4 },
  // floating shelves behind the counter: a jug, a plant (the tea set that stood here —
  // four tiny cups in a row, carried as one — read as something broken: playtest 2026-09-30)
  { id: 'jug_01', x: 2.5, z: Z0 + 0.12, y: WALL_SHELVES[0].y, ry: 2.4, scale: 0.85 },
  { id: 'potted_plant_04', x: 2.55, z: Z0 + 0.12, y: WALL_SHELVES[1].y, ry: 0.6 },
];

// procedural stacks of books (merged per stack) — { id, x, z, y, stacks: [[dx, dz, ry, n]] }
const STACKS = [
  { id: 'books:table', x: TABLE.x, z: TABLE.z, y: 1.01 * TABLE.s, big: true, stacks: [[-0.2, -0.12, 0.3, 5], [0.16, -0.18, -0.4, 3], [0.2, 0.16, 1.2, 4], [-0.14, 0.22, 2.1, 2], [0.0, 0.0, 0.8, 6]] },
  { id: 'books:counter', x: 1.98, z: -1.1, y: COUNTER.h, stacks: [[0, 0, 0.2, 4]] },
  { id: 'books:seat', x: X0 + 0.28, z: SEAT.z0 + 0.5, y: SEAT.h, stacks: [[0, 0, 1.4, 5]] },
  { id: 'books:stool', x: NOOK.stool.x, z: NOOK.stool.z, y: 0.18 * 1.3, stacks: [[0.0, 0.0, 0.95, 3]], spectacles: true },
  { id: 'books:floor', x: -0.05, z: -1.95, y: 0, stacks: [[0, 0, 0.3, 7], [0.3, 0.05, -0.2, 4]] },
  { id: 'books:shelftop', x: -1.2, z: SHELF.back + 0.17, y: SHELF.cornice, stacks: [[0, 0, 0.05, 3], [0.55, 0, -0.05, 2]] },
  { id: 'books:drawer', x: onDisplay(-0.13).x, z: onDisplay(-0.13).z, y: DISPLAY.top, stacks: [[onDisplay(-0.24).x - onDisplay(-0.13).x, onDisplay(-0.24).z - onDisplay(-0.13).z, DISPLAY.ry + 0.1, 4], [onDisplay(0.0).x - onDisplay(-0.13).x, onDisplay(0.0).z - onDisplay(-0.13).z, DISPLAY.ry - 0.25, 2]] },
];

// ---- model loading (../kit.js: one parse per model, clones for repeats; the
// transmission glasses become plain glass)
let manifest = null;
export function loadModel(id) {
  return loadGLTF(`${BASE}models/${id}/${manifest.models[id]}`, { fixTransmission: true });
}
export async function loadManifest() {
  manifest ??= await (await fetch(`${BASE}manifest.json`)).json();
  return manifest;
}

// "BOOKS & tea" chalked on the A-board. The model maps its two boards onto the left
// and right halves of the texture's top 3/4 (glTF v runs down the image), the
// front one turned 180° and the back one upside down — so the art is drawn twice.
function chalkArt(g, W, H, rnd) {
  g.fillStyle = '#26332c';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(230,225,210,${rnd() * 0.05})`;
    g.beginPath();
    g.ellipse(rnd() * W, rnd() * H, 30 + rnd() * 80, 10 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.textAlign = 'center';
  g.fillStyle = '#f1ead6';
  g.font = 'italic bold 92px Georgia, serif';
  g.fillText('Come in!', W / 2, 140);
  g.fillStyle = '#eab85a';
  g.font = '58px Georgia, serif';
  g.fillText('tea · cake · poems', W / 2, 235);
  g.lineWidth = 6;
  g.strokeStyle = '#f1ead6';
  // a steaming cup
  const cx = W / 2;
  g.beginPath();
  g.moveTo(cx - 70, 380);
  g.lineTo(cx - 55, 490);
  g.lineTo(cx + 55, 490);
  g.lineTo(cx + 70, 380);
  g.closePath();
  g.stroke();
  g.beginPath();
  g.arc(cx + 78, 425, 28, -1.2, 1.3);
  g.stroke();
  g.strokeStyle = '#eab85a';
  for (const x of [cx - 30, cx, cx + 30]) {
    g.beginPath();
    g.moveTo(x, 360);
    g.bezierCurveTo(x - 16, 335, x + 16, 318, x, 290);
    g.stroke();
  }
  g.fillStyle = '#f1ead6';
  g.font = 'italic 50px Georgia, serif';
  g.fillText('the kettle’s on', W / 2, 610);
  g.fillStyle = '#e07a3c';
  g.font = '60px Georgia, serif';
  g.fillText('♥', W / 2, 700);
}
function chalkTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#26332c';
  g.fillRect(0, 0, S, S);
  const art = document.createElement('canvas');
  art.width = 512;
  art.height = 768;
  chalkArt(art.getContext('2d'), 512, 768, mulberry(9));
  g.save(); // front board: u 0..0.5, turned 180°
  g.translate(512, 768);
  g.rotate(Math.PI);
  g.drawImage(art, 0, 0);
  g.restore();
  g.save(); // back board: u 0.5..1, upside down
  g.translate(512, 768);
  g.scale(1, -1);
  g.drawImage(art, 0, 0);
  g.restore();
  // chalk grain
  const rnd = mulberry(10);
  const d = g.getImageData(0, 0, S, S);
  for (let i = 0; i < d.data.length; i += 4) {
    if (rnd() < 0.2) {
      d.data[i] *= 0.72;
      d.data[i + 1] *= 0.72;
      d.data[i + 2] *= 0.72;
    }
  }
  g.putImageData(d, 0, 0);
  return canvasTexture(c, { flipY: false });
}

// the shop's sign: gold leaf on a forest-green board, hung on the plastered wall
function signMesh() {
  const W = 1024;
  const H = 288;
  const col = document.createElement('canvas');
  col.width = W;
  col.height = H;
  const pr = document.createElement('canvas');
  pr.width = W;
  pr.height = H;
  const g = col.getContext('2d');
  const p = pr.getContext('2d');
  g.fillStyle = '#244a36';
  g.fillRect(0, 0, W, H);
  p.fillStyle = 'rgb(0,120,0)'; // roughness G, metalness B
  p.fillRect(0, 0, W, H);
  const gold = (fn) => {
    g.fillStyle = g.strokeStyle = '#e2b55c';
    p.fillStyle = p.strokeStyle = 'rgb(0,70,255)';
    fn(g);
    fn(p);
  };
  gold((c) => {
    c.lineWidth = 8;
    c.strokeRect(22, 22, W - 44, H - 44);
    c.lineWidth = 3;
    c.strokeRect(40, 40, W - 80, H - 80);
    c.textAlign = 'center';
    c.font = 'bold 150px Georgia, serif';
    c.fillText('BOOKS', W / 2, 185);
    c.font = 'italic 38px Georgia, serif';
    c.fillText('~  new  ·  old  ·  rare  ~', W / 2, 238);
    for (const x of [110, W - 110]) {
      c.beginPath();
      c.arc(x, H / 2, 22, 0, Math.PI * 2);
      c.fill();
    }
  });
  const map = canvasTexture(col);
  const props = canvasTexture(pr, { srgb: false });
  const face = new THREE.MeshStandardMaterial({ map, roughnessMap: props, metalnessMap: props, roughness: 1, metalness: 1 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x1d3a2b, roughness: 0.5 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.34, 0.035), [edge, edge, edge, edge, face, edge]);
  m.castShadow = true;
  m.receiveShadow = true;
  // (the level's gilding works on the painted face: its canvas + where the gold leaf is)
  m.name = 'sign';
  m.userData.face = face;
  m.userData.size = [1.2, 0.34];
  return m;
}

function setLayer(obj, layer) {
  obj.traverse((o) => o.layers.set(layer));
}

function stackMesh(s) {
  const shelf = new Shelf();
  const rnd = mulberry(s.id.length * 97 + Math.round(s.x * 100));
  for (const [dx, dz, ry, n] of s.stacks) shelf.stack(s.x + dx, s.y, s.z + dz, ry, n, rnd, { big: s.id === 'books:table' });
  const m = shelf.mesh();
  m.name = s.id;
  return m;
}

// Loads and places everything (not yet in the scene); [{ e, obj }] for decorate.js
export async function loadProps(onProgress) {
  await loadManifest();
  const total = LAYOUT.length + STACKS.length;
  let done = 0;
  const tick = () => onProgress?.(++done / total);
  const items = await Promise.all(LAYOUT.map(async (e) => {
    if (!manifest.models[e.id]) {
      tick();
      return null;
    }
    try {
      const obj = await loadModel(e.id);
      obj.name = e.id;
      if (e.recolor) recolor(obj, e.recolor, { roughness: null }); // keeps each model's own roughness
      if (e.chalk) {
        const chalk = chalkTexture();
        obj.traverse((o) => {
          if (o.isMesh && /_board$/.test(o.material.name)) {
            o.material = o.material.clone();
            o.material.map = chalk;
            o.material.color.set(0xffffff);
          }
        });
      }
      place(obj, e);
      if (!e.big) setLayer(obj, LAYER_MAIN_ONLY);
      return { e, obj };
    } catch (err) {
      console.warn('prop failed', e.id, err);
      return null;
    } finally {
      tick();
    }
  }));
  // the shop sign on the plastered wall
  {
    const m = signMesh();
    m.position.set(2.25, 2.42, Z0 + 0.0175);
    m.updateMatrixWorld(true);
    items.push({ e: { id: 'sign', x: 2.25, z: Z0 + 0.0175, yc: 2.42, ry: 0 }, obj: m });
  }
  // stacks of books (+ the reading glasses on the footstool pile)
  for (const s of STACKS) {
    const g = new THREE.Group();
    const m = stackMesh(s);
    g.add(m);
    if (s.spectacles && manifest.models.round_spectacles) {
      const sp = await loadModel('round_spectacles');
      const box = new THREE.Box3().setFromObject(m);
      sp.scale.setScalar(0.9);
      sp.rotation.y = -0.5;
      sp.position.set(s.x + 0.02, 0, s.z + 0.05);
      sp.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(sp);
      sp.position.y += box.max.y - b.min.y;
      g.add(sp);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    if (!s.big) setLayer(g, LAYER_MAIN_ONLY);
    g.updateMatrixWorld(true);
    items.push({ e: { id: s.id, x: s.x, z: s.z, y: s.y, big: false }, obj: g });
    tick();
  }
  return items.filter(Boolean);
}
