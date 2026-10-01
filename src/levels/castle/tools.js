import * as THREE from 'three';
import { surfaceTool, mat, toMain } from '../../tools/surfaceTools.js';
import { floorMotion } from '../../tools/floorMotion.js';

// Level 5's own litter and its floor tool: the old rushes on the flagstones.

// ---- litter: what lies about in a solar shut up for years ------------------------------------------
export function litter(rand) {
  const straw = [0xd9b25a, 0xc79a45, 0xe6c877].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const quill = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.8, side: THREE.DoubleSide });
  const grey = new THREE.MeshStandardMaterial({ color: 0xb8b2a8, roughness: 0.85, side: THREE.DoubleSide });
  const wax = new THREE.MeshStandardMaterial({ color: 0xf1e6cc, roughness: 0.6 });
  const wick = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.8 });
  const featherShape = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.07);
    s.quadraticCurveTo(0.028, -0.02, 0.012, 0.07);
    s.quadraticCurveTo(0, 0.08, -0.012, 0.07);
    s.quadraticCurveTo(-0.022, 0.0, 0, -0.07);
    return s;
  })();
  return {
    // a tuft of old rushes: a few stalks lying crossed
    straw: () => {
      const g = new THREE.Group();
      const n = 4 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const len = 0.14 + rand() * 0.12;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, len, 5).rotateZ(Math.PI / 2), straw[Math.floor(rand() * straw.length)]);
        m.position.set((rand() - 0.5) * 0.05, 0.005 + k * 0.003, (rand() - 0.5) * 0.05);
        m.rotation.y = rand() * Math.PI;
        g.add(m);
      }
      return g;
    },
    // a feather (a pigeon came in through the broken panes)
    feather: () => {
      const geo = new THREE.ShapeGeometry(featherShape, 6).rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, 0.004 + Math.abs(p.getX(i)) * 0.3 + (p.getZ(i) + 0.07) * 0.08);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, rand() < 0.5 ? quill : grey);
    },
    // a burnt-down candle stub in its puddle of wax
    stub: () => {
      const g = new THREE.Group();
      const h = 0.025 + rand() * 0.03;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, h, 10), wax);
      c.position.y = h / 2;
      const puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.045 + rand() * 0.02, 0.05, 0.005, 12), wax);
      puddle.position.y = 0.0025;
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.012, 4), wick);
      w.position.y = h + 0.005;
      g.add(c, puddle, w);
      return g;
    },
  };
}

// ---- the besom: a bundle of birch twigs bound to a pole (local +z = up, off the floor) --------------
// the pole leans back from the twigs; its top (HAND) is where the hand holds it: the whole besom
// swings from there (tools/floorMotion.js) · twigs: bend about the band, trailing the stroke
const HAND = new THREE.Vector3(0, 0.48, 1.18);
function besomModel() {
  const g = new THREE.Group();
  const twig = mat(0xb07a45, { roughness: 0.9 });
  // the twigs: a flattened cone standing on the floor, narrow end up
  const twigs = new THREE.Group();
  twigs.position.z = 0.3;
  const bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.13, 0.3, 12).rotateX(Math.PI / 2), twig);
  bundle.scale.set(1, 0.5, 1);
  bundle.position.set(0, 0, -0.15);
  twigs.add(bundle);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.011, 6, 14), mat(0xc0392b, { roughness: 0.6 }));
  band.position.set(0, 0, 0.27);
  band.scale.set(1, 0.6, 1);
  // the pole out of the top, leaning back
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 1.0, 8), mat(0x8a5a36, { roughness: 0.7 }));
  pole.rotation.x = Math.PI / 2 - 0.5;
  pole.position.set(0, 0.24, 0.74);
  g.add(twigs, band, pole);
  Object.assign(g.userData, { twigs, bundle, band, pole });
  return toMain(g);
}

// The besom over the flagstones. Held down, it sweeps by itself — a stroke of the twigs along the
// floor, lifted back for the next, about two a second — whether the pointer moves or not (playtest
// 2026-09-30: holding it still, it just hovered there): tools/floorMotion.js · what comes up off
// the flags puffs out the way the stroke went: a soft cloud, and fine chaff that hangs in the light
// and drifts down after it. Its swish (audio.js RUB sweep) rises and falls with each stroke.
const REACH = 0.22; // the head goes this far each side of the pointer, metres
export function createBroom(world, dirt, puffs, { rub, rec }) {
  const ray = new THREE.Raycaster();
  const model = besomModel();
  const { twigs, bundle, band, pole } = model.userData;
  const tool = surfaceTool(world, {
    id: 'broom',
    rub,
    rec,
    hint: () => 'hint.broom',
    model,
    offset: 0.002,
    spacing: 4,
    find: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      return dirt.hit(ray.ray);
    },
    target: () => ({ item: 'floor', normal: new THREE.Vector3(0, 1, 0) }),
    work: (h, px, py) => {
      dirt.wipe(px, py, REACH * dirt.px, 0.34);
      return true;
    },
  });
  // (its pole leans away from the camera; the mops' and the sander's handles come towards it)
  let bend = 0;
  floorMotion(world, tool, {
    model,
    hand: HAND,
    swing: [twigs, band, pole],
    pattern: 'sweep',
    reach: REACH,
    rate: 1.8,
    dirt,
    footR: 0.12,
    strength: 5,
    rub,
    rubKind: 'sweep',
    puff: (at, way, left) => {
      puffs.emit(at, way, 1 + Math.round(left * 2), { color: '#d8c49c', size: 0.28, spread: 0.12, speed: 0.55, life: 2.2, alpha: 0.12 + 0.3 * left });
      puffs.emit(at, way, 2 + Math.round(left * 6), { color: '#f2dcae', size: 0.02, spread: 0.14, speed: 0.8, life: 3.2, alpha: 0.6, mote: true });
    },
    // the twigs trail behind, pressed flatter while they sweep
    pose: ({ vx, lift, dt }) => {
      bend += (THREE.MathUtils.clamp(vx * 0.14, -0.4, 0.4) - bend) * Math.min(1, dt * 14);
      twigs.rotation.y = bend;
      bundle.scale.z = 1 - (lift > 0.01 ? 0 : Math.min(0.12, Math.abs(bend) * 0.3));
    },
  });
  tool.icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 3L11 12"/><path d="M11 12l-5.5 3.5L3 21l5.5-2.5L12 13z"/><path d="M5 17l2 2M7 15.5l2 2"/></svg>';
  return tool;
}

// the old rushes trodden into the flags (drawn over floormask.js's film): a litter of broken
// stalks everywhere, dark trodden paths from the open side to the hearth, ash spilt in front of
// it, wax drips where candles stood (metres from the floor's back-left corner)
export function oldRushes({ X0, Z0 }, fire) {
  return (g, W, H, px, rand) => {
    const at = (x, z) => [(x - X0) * px, (z - Z0) * px];
    // trodden paths
    g.lineCap = 'round';
    for (const pts of [[[2.8, 2.5], [1.2, 0.2], [0.2, -1.4]], [[0.5, 2.5], [-1.2, 0.8], [-2.4, -1.0]]]) {
      g.strokeStyle = 'rgba(70, 55, 40, 0.35)';
      g.lineWidth = 0.7 * px;
      g.beginPath();
      pts.forEach(([x, z], i) => { const [a, b] = at(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
      g.stroke();
    }
    // broken stalks of the old rushes
    for (let k = 0; k < 900; k++) {
      const x = rand() * W;
      const y = rand() * H;
      const a = rand() * Math.PI;
      const l = (0.05 + rand() * 0.12) * px;
      const c = rand() < 0.5 ? '176,140,70' : rand() < 0.5 ? '130,100,55' : '90,70,45';
      g.strokeStyle = `rgba(${c},${(0.45 + rand() * 0.4).toFixed(2)})`;
      g.lineWidth = (0.006 + rand() * 0.008) * px;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    // ash spilt out of the hearth
    const [ax, ay] = at(fire.x, Z0 + fire.hearth.d + 0.25);
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(80,76,72,${(0.3 + rand() * 0.3).toFixed(2)})`;
      g.beginPath();
      g.ellipse(ax + (rand() - 0.5) * 2.0 * px, ay + (rand() - 0.3) * 0.6 * px, (0.04 + rand() * 0.1) * px, (0.03 + rand() * 0.06) * px, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // wax drips
    for (let k = 0; k < 24; k++) {
      g.fillStyle = `rgba(236,226,200,${(0.5 + rand() * 0.3).toFixed(2)})`;
      g.beginPath();
      g.arc(rand() * W, rand() * H, (0.012 + rand() * 0.02) * px, 0, Math.PI * 2);
      g.fill();
    }
  };
}
