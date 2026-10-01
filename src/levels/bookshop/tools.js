import * as THREE from 'three';
import { surfaceTool, mat, toMain } from '../../tools/surfaceTools.js';
import { floorMotion } from '../../tools/floorMotion.js';

// The bookshop level's own tools and litter (src/levels/bookshop.js):
//   duster — a feather duster: a soft, wide stroke over the shelf fronts, dust puffing off
//   sander — an orbital floor sander over the dull floor (floormask.js), sawdust behind it
//   gilder — a gilder's mop: gold leaf back onto the shop sign's letters (after the paint)
// litter: torn-out pages, crushed cartons (plus the shared newspaper, paper balls, card)

// ---- models (local +z = away from the surface, as surfaceTools.js) ---------------------------------
function dusterModel() {
  const g = new THREE.Group();
  const head = new THREE.Group();
  g.add(head);
  // a fluffy ball of feathers round the end of the handle, soft side to the shelf
  const cols = [0x8a6a4a, 0x6e5238, 0xb89468, 0x9c7a52, 0x4a3628, 0xc8a878, 0x2e2622];
  const mats = cols.map((c) => mat(c, { roughness: 1 }));
  const feather = new THREE.IcosahedronGeometry(1, 1).translate(0, 1, 0); // grows along +y from its base
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const Y = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3();
  for (let k = 0; k < 30; k++) {
    // directions spread over a sphere (golden spiral), jittered
    const y = 1 - (k + 0.5) / 15;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = k * 2.39996 + rnd() * 0.3;
    d.set(Math.cos(a) * r, Math.sin(a) * r, y).normalize();
    const m = new THREE.Mesh(feather, mats[k % mats.length]);
    const len = 0.05 + rnd() * 0.03;
    m.scale.set(0.024 + rnd() * 0.01, len, 0.012);
    m.quaternion.setFromUnitVectors(Y, d);
    m.position.set(0, 0, 0.1).addScaledVector(d, 0.025);
    head.add(m);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), mats[0]);
  core.position.z = 0.1;
  head.add(core);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.42, 10), mat(0x8a3a24, { roughness: 0.5 }));
  handle.rotation.x = Math.PI / 2 + 0.55; // (its foot in the feathers)
  handle.position.set(0, -0.12, 0.28);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.05, 10), mat(0xc89a52, { metalness: 0.8, roughness: 0.3 }));
  cap.rotation.x = Math.PI / 2 + 0.55;
  cap.position.set(0, -0.012, 0.13);
  g.add(handle, cap);
  g.userData.head = head;
  return toMain(g);
}

// an orbital floor sander (local +z = up, off the floor); the handle leans back
function sanderModel() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.035, 28).rotateX(Math.PI / 2), mat(0x3a3530, { roughness: 0.9 }));
  pad.position.z = 0.018;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 28).rotateX(Math.PI / 2), mat(0xc2502e, { roughness: 0.45 }));
  skirt.position.z = 0.06;
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 20).rotateX(Math.PI / 2), mat(0xd9a23a, { roughness: 0.4 }));
  motor.position.z = 0.16;
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), mat(0xe9dcc0, { roughness: 1 }));
  bag.scale.set(1, 0.7, 1.2);
  bag.position.set(0.16, -0.14, 0.22);
  body.add(pad, skirt, motor, bag);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.95, 8), mat(0x6b6660, { metalness: 0.6, roughness: 0.35 }));
  handle.rotation.x = Math.PI / 2 + 0.5; // (its foot on the motor, the grip at its top)
  handle.position.set(0, -0.22, 0.6);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 8), mat(0x2b2b2b, { roughness: 0.8 }));
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, -0.44, 1.02);
  g.add(handle, grip);
  Object.assign(g.userData, { body, handle, grip });
  return toMain(g);
}
const SANDER_HAND = new THREE.Vector3(0, -0.22 - 0.475 * Math.sin(0.5), 0.6 + 0.475 * Math.cos(0.5)); // the grip

// a gilder's mop: soft round squirrel hair, a brass ferrule, a slim handle
function gilderModel() {
  const g = new THREE.Group();
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), mat(0xd9b25a, { roughness: 0.6, metalness: 0.4 }));
  tip.scale.set(1, 1, 1.4);
  tip.position.z = 0.035;
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.05, 10).rotateX(Math.PI / 2), mat(0xc89a52, { metalness: 0.85, roughness: 0.3 }));
  ferrule.position.z = 0.085;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.22, 8).rotateX(Math.PI / 2), mat(0x2f5a3e, { roughness: 0.4 }));
  handle.position.set(0, -0.03, 0.2);
  handle.rotation.x = 0.25;
  g.add(tip, ferrule, handle);
  return toMain(g);
}

// ---- icons (24×24 strokes, like hud.js) ----------------------------------------------------------
export const ICON_DUSTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21l6.5-6.5"/><path d="M10.5 14.5c-2.5-1.5-3-5-1-7.5 1.5 1 2.5 2.3 3 4"/><path d="M10.5 14.5c1.5 2.5 5 3 7.5 1-1-1.5-2.3-2.5-4-3"/><path d="M12.5 11c.5-3.5 3-6.5 7-7-.5 4-3.5 6.5-7 7z"/></svg>';
export const ICON_SANDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h5"/><path d="M16.5 3l-3.5 9"/><ellipse cx="10" cy="17.5" rx="7" ry="2.8"/><path d="M5.5 16v-1.5a4.5 3 0 0 1 9 0V16"/><path d="M3 21.5h2M8 22h1.5M13 22h2"/></svg>';
export const ICON_GILDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4l-7.5 7.5"/><path d="M12.5 11.5l-1.5-1.5-2 2 1.5 1.5z"/><path d="M9 12c-3 0-5 2-5 5.5 0 .8.2 1.5.5 2 .5.3 1.2.5 2 .5C10 20 12 18 12 15"/><path d="M17 15.5v3M15.5 17h3M19.5 10v2M18.5 11h2"/></svg>';

// ---- the tools ---------------------------------------------------------------------------------------
// the duster: a soft wide stroke; each dab takes some of what's under it, and what comes off
// puffs out into the air (the rarer the dust, the fewer the puffs)
export function createDuster(world, dust, puffs, { rub, rec }) {
  const ray = new THREE.Raycaster();
  const model = dusterModel();
  const R = 0.17; // brush radius, metres
  let sway = 0;
  let puffT = 0;
  world.onFrame((dt, time) => {
    sway = Math.max(0, sway - dt * 3);
    model.userData.head.rotation.z = Math.sin(time * 18) * 0.25 * sway;
    puffT -= dt;
  });
  const tool = surfaceTool(world, {
    id: 'duster',
    rub,
    rec,
    rubKind: 'feather',
    hint: () => 'hint.duster',
    model,
    offset: 0.012,
    spacing: 3,
    giEvery: 1.2,
    find: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      return dust.hit(ray.ray);
    },
    target: (item) => (dust.plane(item) ? { item, normal: new THREE.Vector3(0, 0, 1) } : null),
    work: (h, px, py) => {
      const left = puffT <= 0 ? dust.alpha(px, py) : 0;
      dust.wipe(px, py, R * dust.px, 0.24);
      sway = 1;
      // what comes off billows out as a soft cloud, and fine motes hang in the air and
      // drift down after it (playtest 2026-09-30: more dust in the air — it was a few faint puffs)
      if (left > 0.06) {
        puffT = 0.06;
        puffs.emit(h.point, h.normal, 1 + Math.round(left * 3), { color: '#e8dcc6', size: 0.34, spread: 0.3, speed: 0.3, life: 2.8, alpha: 0.22 + 0.32 * left });
        puffs.emit(h.point, h.normal, 2 + Math.round(left * 7), { color: '#fff3d8', size: 0.03, spread: 0.36, speed: 0.5, life: 3.6, alpha: 0.85, mote: true });
      }
      return true;
    },
  });
  return tool;
}

// the sander: the pad takes the grey, scuffed film off in one pass (a little less at its rim) · held
// down, it runs in small quick circles by itself, buzzing, and sawdust puffs off where the floor
// is still dull (tools/floorMotion.js)
export function createSander(world, floor, puffs, { rub, rec }) {
  const ray = new THREE.Raycaster();
  const model = sanderModel();
  const { body, handle, grip } = model.userData;
  let clock = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const tool = surfaceTool(world, {
    id: 'sander',
    rub,
    rec,
    hint: () => 'hint.sander',
    model,
    offset: 0.002,
    spacing: 4,
    find: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      return floor.hit(ray.ray);
    },
    target: () => ({ item: 'floor', normal: up.clone() }),
    work: (h, px, py) => {
      floor.wipe(px, py, 0.21 * floor.px, 0.45);
      return true;
    },
  });
  floorMotion(world, tool, {
    model, hand: SANDER_HAND, swing: [handle, grip], slide: [body], pattern: 'orbit', reach: 0.035, rate: 3.5,
    dirt: floor, footR: 0.2, strength: 4.5, rub, rubKind: 'scrub', puffEvery: 0.08,
    puff: (at, way, left) => {
      puffs.emit(at, up, 1 + Math.round(left * 2), { color: '#e6cf9f', size: 0.14, spread: 0.36, speed: 0.25, life: 1.6, alpha: 0.14 + 0.2 * left });
      puffs.emit(at, way, 1 + Math.round(left * 4), { color: '#f3e2bd', size: 0.018, spread: 0.3, speed: 0.6, life: 2.6, alpha: 0.6, mote: true });
    },
    // the motor's buzz
    pose: ({ amp, dt }) => {
      clock += dt;
      body.position.x = Math.sin(clock * 55) * 0.004 * amp;
      body.position.y = Math.cos(clock * 47) * 0.004 * amp;
    },
  });
  return tool;
}

// the gilding brush: small and soft; the leaf goes on where it passes (only once the wall
// behind the sign is painted: `ready()`)
export function createGilder(world, sign, puffs, { rub, rec, ready }) {
  const model = gilderModel();
  let puffT = 0;
  world.onFrame((dt) => { puffT -= dt; });
  return surfaceTool(world, {
    id: 'gilder',
    rub,
    rec,
    rubKind: 'glass',
    hint: () => (ready() ? 'hint.gilder' : 'hint.gilderLocked'),
    model,
    offset: 0.004,
    spacing: 2,
    find: (ndc) => (ready() ? sign.hit(ndc, world.camera) : null),
    target: () => ({ item: sign, normal: sign.normal() }),
    work: (h, px, py) => {
      sign.brush(px, py, 0.055 * sign.ppm, 0.5);
      if (puffT <= 0) {
        puffT = 0.12;
        puffs.emit(h.point, h.normal, 1, { color: '#ffd98a', size: 0.035, spread: 0.06, speed: 0.12, life: 0.8, alpha: 0.5 });
      }
      return true;
    },
  });
}

// ---- litter: what a shop shut for years collects -----------------------------------------------------
function pageTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 180;
  const g = c.getContext('2d');
  g.fillStyle = '#eee2c4';
  g.fillRect(0, 0, 128, 180);
  // foxing and a coffee ring
  g.fillStyle = 'rgba(150,110,60,0.18)';
  for (let k = 0; k < 9; k++) {
    g.beginPath();
    g.arc((k * 37) % 128, (k * 71) % 180, 3 + (k % 4) * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#5a4a3a';
  for (let y = 22; y < 166; y += 7) {
    const w = 96 - ((y * 17) % 23);
    g.fillRect(14, y, w, 2.4);
  }
  g.fillRect(40, 10, 48, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function litter(rand) {
  const pageMat = new THREE.MeshStandardMaterial({ map: pageTexture(), roughness: 0.92, side: THREE.DoubleSide });
  const cardMats = [0xb48a58, 0xa47a4a, 0xc29a66].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
  const tape = new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 0.4 });
  return {
    // a page torn out of a book: a curl along its length, a ragged torn edge
    page: () => {
      const geo = new THREE.PlaneGeometry(0.13, 0.19, 5, 6).rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      const curl = 0.02 + rand() * 0.03;
      const tear = rand() * 3;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        p.setY(i, 0.003 + (x / 0.065) ** 2 * curl * 0.5 + rand() * 0.002);
        // the torn side (x < 0) is ragged
        if (x < -0.06) p.setX(i, x + Math.abs(Math.sin(z * 60 + tear)) * 0.014);
      }
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, pageMat);
    },
    // a squashed little carton, tape still on it
    carton: () => {
      const grp = new THREE.Group();
      const w = 0.22 + rand() * 0.1;
      const d = 0.16 + rand() * 0.08;
      const geo = new THREE.BoxGeometry(w, 0.07, d, 3, 1, 3);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setY(i, (y > 0 ? 0.035 - rand() * 0.035 : -0.035) + 0.035);
        p.setX(i, p.getX(i) * (1 + (rand() - 0.5) * 0.12));
        p.setZ(i, p.getZ(i) * (1 + (rand() - 0.5) * 0.12));
      }
      geo.computeVertexNormals();
      const box = new THREE.Mesh(geo, cardMats[Math.floor(rand() * cardMats.length)]);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.004, 0.04), tape);
      strip.position.y = 0.062;
      strip.rotation.y = (rand() - 0.5) * 0.3;
      grp.add(box, strip);
      grp.rotation.z = (rand() - 0.5) * 0.15;
      return grp;
    },
  };
}
