import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from './gi.js';
import { ROOM, FIRE_X } from './room.js';
import { loadGLTF, recolor, place } from './rooms/kit.js';

const { X0, Z0 } = ROOM;
const R90 = Math.PI / 2;

// Poly Haven models face +z. `big` pieces take part in GI captures (they shadow
// and colour the bounce light); small props only render in the main view.
// y: height the model's lowest point sits on · yc: height of its centre (wall art)
// recolor: fabric swap per material name (keeps the texture's shading, new colour)
// boards: surfaces small things can be set on, in the piece's own frame (h above
// its base, half sizes hx/hz) — see decorate.js
const MANTEL = 1.18;
const SHELF = [0.392, 0.672, 0.96, 1.277, 1.663, 2.063]; // measured board tops
const SZ = Z0 + 0.3; // bookshelf depth centre
const LAYOUT = [
  { id: 'sofa_03', x: 2.2, z: 0.4, ry: -R90, big: true, recolor: { sofa_03: '#5d7f9e' }, boards: [{ h: 0.46, hx: 1.1, hz: 0.46 }] },
  { id: 'throw_pillows_01', x: 2.38, z: 0.55, ry: -R90, y: 0.46, recolor: { throw_pillows_01: '#e9c46a' } },
  { id: 'coffee_table_round_01', x: 0.45, z: 0.4, big: true, scale: 0.82, boards: [{ h: 0.402, hx: 0.47, hz: 0.47 }] },
  { id: 'tea_set_01', x: 0.3, z: 0.28, ry: 0.35, y: 0.4, scale: 0.8 },
  { id: 'mid_century_lounge_chair', x: -2.15, z: 1.6, ry: R90 - 0.45, big: true },
  { id: 'Ottoman_01', x: -1.05, z: 1.75, ry: R90 - 0.2, big: true, recolor: { Ottoman_01: '#c98a3a' }, boards: [{ h: 0.624, hx: 0.4, hz: 0.28 }] },
  { id: 'ArmChair_01', x: -2.35, z: -1.75, ry: 0.7, big: true, recolor: { Armchair_01: '#8fa37a' } },
  { id: 'side_table_01', x: 2.35, z: -1.45, ry: -R90, big: true, boards: [{ h: 0.551, hx: 0.25, hz: 0.2 }] },
  { id: 'standing_picture_frame_01', x: 2.45, z: -1.3, ry: -R90 - 0.3, y: 0.55 },
  { id: 'wooden_bookshelf_worn', x: 1.4, z: SZ, big: true, boards: SHELF.map((h) => ({ h, hx: 0.62, hz: 0.22 })) },
  { id: 'book_encyclopedia_set_01', x: 0.78, z: SZ, y: SHELF[3] },
  { id: 'book_encyclopedia_set_01', x: 1.45, z: SZ, y: SHELF[1] },
  { id: 'book_encyclopedia_set_01', x: 2.02, z: SZ, y: SHELF[4], ry: Math.PI },
  { id: 'book_encyclopedia_set_01', x: 0.8, z: SZ, y: SHELF[0] },
  { id: 'wicker_basket_01', x: 1.72, z: SZ, y: SHELF[2], ry: 0.1 },
  { id: 'potted_plant_04', x: 0.95, z: SZ, y: SHELF[2] },
  { id: 'ceramic_vase_01', x: 0.92, z: SZ, y: SHELF[4], scale: 0.7 },
  { id: 'boombox', x: 1.75, z: SZ, y: SHELF[3], scale: 0.62, ry: -0.08 },
  { id: 'book_encyclopedia_set_01', x: 0.9, z: SZ, y: SHELF[5], scale: 0.9 },
  { id: 'potted_plant_01', x: 2.75, z: Z0 + 0.45, ry: 0.6, big: true, block: false },
  { id: 'wicker_basket_01', x: 0.42, z: Z0 + 0.4, ry: 0.35 },
  { id: 'hanging_picture_frame_02', x: FIRE_X, z: Z0 + 0.43, yc: 1.85 },
  { id: 'hanging_picture_frame_01', x: X0 + 0.01, z: 0.05, ry: R90, yc: 1.6, art: true },
  { id: 'fancy_picture_frame_01', x: X0 + 0.01, z: -2.2, ry: R90, yc: 1.55 },
  { id: 'mantel_clock_01', x: FIRE_X, z: Z0 + 0.52, y: MANTEL },
  { id: 'ceramic_vase_01', x: FIRE_X + 0.62, z: Z0 + 0.52, y: MANTEL, scale: 0.8 },
  { id: 'potted_plant_04', x: FIRE_X - 0.6, z: Z0 + 0.52, y: MANTEL },
];

// each glTF is fetched and parsed once; repeated layout entries get clones (rooms/kit.js)
const loadModel = (id, file) => loadGLTF(`assets/models/${id}/${file}`);

// a warm mid-century poster (sun over hills) for the frame between the windows;
// the stock artwork is a pale photo that read as an empty frame
function paintingTexture() {
  const W = 512;
  const H = 720;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#efd9b4';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#d9643a';
  g.beginPath();
  g.arc(W * 0.62, H * 0.36, 120, 0, Math.PI * 2);
  g.fill();
  const hill = (y0, amp, col, ph) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 + Math.sin(x / W * Math.PI * 1.4 + ph) * amp);
    g.lineTo(W, H);
    g.fill();
  };
  hill(H * 0.55, 40, '#8aa37b', 0.4);
  hill(H * 0.66, 50, '#3f6f6a', 2.2);
  hill(H * 0.8, 36, '#e2a03f', 4.0);
  g.fillStyle = '#2f3b4f';
  g.fillRect(0, H * 0.92, W, H * 0.08);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  return t;
}

function setLayer(obj, layer) {
  obj.traverse((o) => o.layers.set(layer));
}

// Loads and places every LAYOUT model in world space (not yet in the scene).
// Returns [{ e, obj }] in LAYOUT order; the furniture layer adopts them.
export async function loadProps(onProgress) {
  const manifest = await (await fetch('assets/manifest.json')).json();
  let done = 0;
  const items = await Promise.all(LAYOUT.map(async (e) => {
    const file = manifest.models[e.id];
    if (!file) return null;
    try {
      const obj = await loadModel(e.id, file);
      obj.name = e.id;
      if (e.recolor) recolor(obj, e.recolor);
      if (e.art) {
        const art = paintingTexture();
        obj.traverse((o) => {
          if (o.isMesh && /_artwork$/.test(o.material.name)) {
            o.material = o.material.clone();
            o.material.map = art;
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
      onProgress?.(++done / LAYOUT.length);
    }
  }));
  return items.filter(Boolean);
}

// ---- procedural light fixtures ------------------------------------------------

const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4e, metalness: 0.55, roughness: 0.35 });

function shadeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xf1e3c8,
    roughness: 1,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(1.0, 0.62, 0.3),
    emissiveIntensity: 0,
  });
}

function lampLight(color, distance, shadow) {
  const l = new THREE.PointLight(color, 0, distance, 2);
  if (shadow) {
    l.castShadow = true;
    l.shadow.mapSize.set(512, 512);
    l.shadow.bias = -0.003;
    l.shadow.radius = 4;
    l.shadow.camera.near = 0.05;
  }
  return l;
}

// a pillar candle that has burned a while: rounded rim a little uneven (phase ph
// varies it per candle) around a shallow pool `dip` deep. Base at y = 0.
function candleGeometry(R, h, dip, ph) {
  const b = 0.005;
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R, h - b)];
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * R90;
    pts.push(new THREE.Vector2(R - b + b * Math.cos(a), h - b + b * Math.sin(a)));
  }
  pts.push(new THREE.Vector2(R - b - 0.004, h - dip * 0.6), new THREE.Vector2(R * 0.45, h - dip), new THREE.Vector2(0, h - dip));
  const geo = new THREE.LatheGeometry(pts, 28);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < h - b - 1e-4) continue;
    const x = p.getX(i);
    const z = p.getZ(i);
    const th = Math.atan2(x, z);
    const r = Math.hypot(x, z) / R;
    p.setY(i, y + r * 0.0022 * (0.6 * Math.sin(3 * th + ph) + 0.4 * Math.sin(5 * th + 2 * ph)));
  }
  return geo;
}

// a run of wax down a candle's side: thin where it spills over the rim (y = 0), a bead at the end
const dripGeometry = new THREE.LatheGeometry([
  [0, -0.026], [0.0026, -0.0245], [0.0036, -0.021], [0.0032, -0.016], [0.0024, -0.009], [0.0021, 0], [0, 0.0012],
].map(([r, y]) => new THREE.Vector2(r, y)), 10);

export function buildFixtures(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const lamps = [];

  // floor reading lamp by the lounge chair
  {
    const g = new THREE.Group();
    g.position.set(-2.75, 0, 2.25);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.03, 32), brass);
    base.position.y = 0.015;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1.42, 12), brass);
    pole.position.y = 0.72;
    const shadeMat = shadeMaterial();
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 40, 1, true), shadeMat);
    shade.position.y = 1.52;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    bulb.position.y = 1.47;
    const light = lampLight(0xffc27a, 10, true);
    light.position.y = 1.46;
    for (const m of [base, pole]) { m.castShadow = true; m.receiveShadow = true; }
    shade.receiveShadow = true;
    g.add(base, pole, shade, bulb, light);
    group.add(g);
    lamps.push({ name: 'floor', root: g, light, shadeMat, bulb, power: 5, targets: [shade, pole, base] });
  }

  // table lamp on the side table
  {
    const g = new THREE.Group();
    g.position.set(2.3, 0.55, -1.55);
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector2(0.03 + Math.sin(t * Math.PI) * 0.085 + (1 - t) * 0.02, t * 0.26));
    }
    const baseMat = new THREE.MeshPhysicalMaterial({ color: 0x5f8c7a, roughness: 0.25, clearcoat: 0.6 });
    const base = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), baseMat);
    base.castShadow = true;
    const shadeMat = shadeMaterial();
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.2, 40, 1, true), shadeMat);
    shade.position.y = 0.36;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    bulb.position.y = 0.31;
    const light = lampLight(0xffc27a, 7, false);
    light.position.y = 0.32;
    g.add(base, shade, bulb, light);
    group.add(g);
    lamps.push({ name: 'table', root: g, light, shadeMat, bulb, power: 3.2, targets: [shade, base] });
  }

  // candles on the coffee table
  const flames = [];
  {
    const g = new THREE.Group();
    g.position.set(0.72, 0.402, 0.62);
    const wax = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.6 });
    // unlit (basic): a charred wick stays dark right under its own flame
    const wickMat = new THREE.MeshBasicMaterial({ color: 0x1d1815 });
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 32), brass);
    tray.position.y = 0.006;
    g.add(tray);
    // [x, z, height, rim phase, drip angle (null = none)] — the shorter ones burned longer
    const spec = [[-0.06, 0.02, 0.15, 0.4, 2.2], [0.05, -0.04, 0.1, 2.1, null], [0.04, 0.07, 0.07, 4.0, 0.9]];
    for (const [x, z, h, ph, drip] of spec) {
      const dip = 0.004 + (0.15 - h) * 0.05;
      const c = new THREE.Mesh(candleGeometry(0.03, h, dip, ph), wax);
      c.position.set(x, 0.012, z);
      c.castShadow = true;
      // the wick is always there (unlit it was a plain white cylinder); lit, the flame hides its tip
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0022, 0.016, 6), wickMat);
      w.position.set(x + 0.001, 0.012 + h - dip + 0.007, z);
      w.rotation.set(0.12, 0, -0.2);
      g.add(c, w);
      if (drip !== null) {
        const d = new THREE.Mesh(dripGeometry, wax);
        d.position.set(x + Math.cos(drip) * 0.029, 0.012 + h - 0.001, z + Math.sin(drip) * 0.029);
        d.scale.set(0.55, 1, 1); // flat against the side (local x = outward once turned)
        d.rotation.y = -drip;
        g.add(d);
      }
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      f.scale.set(1, 2.2, 1);
      f.position.set(x, 0.012 + h - dip + 0.03, z); // sits down in the well of a burned-down one
      g.add(f);
      flames.push(f);
    }
    g.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
    const light = lampLight(0xff9a4a, 3, false);
    light.position.set(0, 0.2, 0);
    g.add(light);
    group.add(g);
    lamps.push({ name: 'candles', root: g, light, shadeMat: null, bulb: null, flames, power: 0.55, targets: [tray] });
  }

  for (const l of lamps) {
    l.on = 0;
    l.target = 0;
  }
  const flameColor = new THREE.Color(1.0, 0.55, 0.2);
  return {
    group,
    lamps,
    // snap = jump to the target instead of easing (frozen ?still screenshots)
    update(dt, time, snap = false) {
      for (const l of lamps) {
        // packed in a box (decorate.js "stored"): dark, whatever the switch says
        const lit = l.root.parent?.userData.stored ? 0 : l.target;
        l.on += (lit - l.on) * (snap ? 1 : Math.min(1, dt * 4));
        let flick = 1;
        if (l.name === 'candles') flick = 0.85 + 0.1 * Math.sin(time * 17.0) + 0.05 * Math.sin(time * 31.0);
        l.light.intensity = l.power * l.on * flick;
        if (l.shadeMat) l.shadeMat.emissiveIntensity = 0.2 * l.on;
        if (l.bulb) l.bulb.material.color.setRGB(1, 0.8, 0.55).multiplyScalar(3 * l.on);
        if (l.flames) {
          // an unlit candle has no flame (it was a black blob — playtest round 2);
          // lighting one grows it, putting it out shrinks it away
          const k = Math.max(0.001, Math.min(1, l.on * 1.5)); // (never exactly 0: a singular matrix)
          l.flames.forEach((f, i) => {
            f.material.color.copy(flameColor).multiplyScalar(9 * l.on);
            f.scale.set(k, 2.2 * k * (0.9 + 0.12 * Math.sin(time * 19 + i * 2)), k);
          });
        }
      }
    },
  };
}
