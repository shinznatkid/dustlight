import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { flameMaterial } from '../kit.js';
import { kaykit } from './kaykit.js';
import { CASTLE, FIRE } from './shell.js';

// The castle's lights, same contract as props.js buildFixtures: the lights exist from the
// start (a light appearing later would recompile every shader); the models load into their
// groups and `ready` resolves once they're all in.
//   an iron candelabrum by the window seat · a candlestick of three on the side table by the
//   lord's chair · candles on the mantel · two torches in iron brackets, which hang on the walls
//   like the tapestries do (anywhere along any wall: `adopt.wall`)
const { X0, Z0 } = CASTLE;
const MZ = Z0 + (FIRE.hood.d0 + FIRE.md) / 2;

function lampLight(color, distance) {
  return new THREE.PointLight(color, 0, distance, 2);
}

// a candle flame: its own mesh re-centred on its base, so it can grow from nothing
function flameOf(obj) {
  const f = obj.userData.glow;
  if (!f) return null;
  f.geometry.computeBoundingBox();
  const c = f.geometry.boundingBox.getCenter(new THREE.Vector3());
  const base = new THREE.Vector3(c.x, f.geometry.boundingBox.min.y, c.z);
  f.geometry.translate(-base.x, -base.y, -base.z);
  f.position.add(base);
  f.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
  return f;
}
function localBox(m) {
  m.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(m);
}
function meshes(obj) {
  const out = [];
  obj.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}
const iron = new THREE.MeshStandardMaterial({ name: 'iron', color: 0x3a3432, roughness: 0.5, metalness: 0.55 });
const brass = new THREE.MeshStandardMaterial({ name: 'brass', color: 0xd9a441, roughness: 0.35, metalness: 0.7 });
const part = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

export function buildCastleFixtures(scene) {
  const group = new THREE.Group();
  group.name = 'castle-lamps';
  scene.add(group);
  const lamps = [];
  const loads = [];
  const lamp = (name, pos, ry, light, power, adopt, load) => {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = ry;
    g.add(light);
    group.add(g);
    const l = { name, root: g, light, power, adopt, targets: [], flames: [], cards: [], embers: [] };
    lamps.push(l);
    loads.push(load(g, l));
    return l;
  };
  const candles = async (g, l, spec) => {
    let top = 0;
    for (const [name, x, y, z, s] of spec) {
      const m = await kaykit('dungeon', name, { glow: 'flame' });
      m.scale.setScalar(s);
      m.position.set(x, y, z);
      top = Math.max(top, localBox(m).max.y);
      g.add(m);
      const f = flameOf(m);
      if (f) l.flames.push(f);
      l.targets.push(...meshes(m));
    }
    return top;
  };

  // an iron candelabrum: three feet, a twisted shaft, a drip pan, three candles
  lamp('floor', new THREE.Vector3(-2.7, 0, 0.66), 0, lampLight(0xffb060, 8), 3.4, { big: true, small: false }, async (g, l) => {
    const stand = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = part(new THREE.CylinderGeometry(0.014, 0.018, 0.26, 6), iron, Math.sin(a) * 0.1, 0.1, Math.cos(a) * 0.1);
      // (top in to the shaft, foot out on its ball: the signs were the other way round and the
      // tripod stood on its head — playtest 2026-09-30)
      leg.rotation.set(-Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
      stand.add(leg);
      stand.add(part(new THREE.SphereGeometry(0.025, 8, 6), iron, Math.sin(a) * 0.19, 0.02, Math.cos(a) * 0.19));
    }
    stand.add(part(new THREE.CylinderGeometry(0.018, 0.024, 1.22, 8), iron, 0, 0.8, 0));
    for (const y of [0.45, 0.8, 1.15]) stand.add(part(new THREE.SphereGeometry(0.032, 10, 8), iron, 0, y, 0));
    stand.add(part(new THREE.CylinderGeometry(0.16, 0.12, 0.03, 16), iron, 0, 1.42, 0));
    for (const x of [-0.11, 0.11]) stand.add(part(new THREE.CylinderGeometry(0.035, 0.03, 0.03, 10), brass, x, 1.45, 0));
    stand.add(part(new THREE.CylinderGeometry(0.035, 0.03, 0.05, 10), brass, 0, 1.46, 0));
    g.add(stand);
    l.targets.push(...meshes(stand));
    const top = await candles(g, l, [['candle_lit', -0.11, 1.46, 0, 0.2], ['candle_lit', 0, 1.48, 0, 0.24], ['candle_lit', 0.11, 1.46, 0, 0.2]]);
    l.light.position.set(0, top + 0.02, 0);
  });

  // a brass candlestick of three on the side table
  lamp('table', new THREE.Vector3(-2.7, 0.5, -0.74), 0.4, lampLight(0xffa850, 5.5), 1.7, { big: true, small: true }, async (g, l) => {
    const stick = new THREE.Group();
    stick.add(part(new THREE.CylinderGeometry(0.06, 0.08, 0.025, 16), brass, 0, 0.012, 0));
    stick.add(part(new THREE.CylinderGeometry(0.012, 0.018, 0.2, 10), brass, 0, 0.12, 0));
    const arm = part(new THREE.TorusGeometry(0.08, 0.009, 6, 16, Math.PI), brass, 0, 0.2, 0);
    arm.rotation.z = Math.PI;
    stick.add(arm);
    for (const x of [-0.08, 0, 0.08]) stick.add(part(new THREE.CylinderGeometry(0.022, 0.018, 0.025, 10), brass, x, x ? 0.2 : 0.23, 0));
    g.add(stick);
    l.targets.push(...meshes(stick));
    const top = await candles(g, l, [['candle_thin_lit', -0.08, 0.21, 0, 0.18], ['candle_thin_lit', 0, 0.24, 0, 0.2], ['candle_thin_lit', 0.08, 0.21, 0, 0.18]]);
    l.light.position.set(0, top + 0.02, 0);
    g.traverse((o) => { if (o !== l.light) o.layers.set(LAYER_MAIN_ONLY); });
  });

  // three candles on the left end of the mantel
  lamp('candles', new THREE.Vector3(FIRE.x - 0.7, FIRE.mantel, MZ), 0, lampLight(0xff9a4a, 3.4), 0.8, { big: false, small: true }, async (g, l) => {
    const top = await candles(g, l, [['candle_lit', -0.07, 0, 0.0, 0.26], ['candle_thin_lit', 0.06, 0, -0.03, 0.3], ['candle_lit', 0.05, 0, 0.05, 0.19]]);
    l.light.position.set(0, top + 0.03, 0.03);
    g.traverse((o) => { if (o !== l.light) o.layers.set(LAYER_MAIN_ONLY); });
  });

  // torches in iron brackets: a live flame (two crossed flame cards) and a glowing ember
  const torch = (name, pos, ry) => lamp(name, pos, ry, lampLight(0xff9040, 7), 2.6, { wall: true, big: false, small: false, ry }, async (g, l) => {
    const m = await kaykit('dungeon', 'torch_mounted');
    m.scale.setScalar(0.44);
    // the bracket's plate is on the model's −z side: against the wall (measured before it
    // joins the lamp's group, i.e. in the group's own frame)
    const b = localBox(m);
    m.position.z -= b.min.z;
    const top = b.max.y;
    const cz = (b.max.z - b.min.z) / 2 + 0.03;
    g.add(m);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff6a1a, emissiveIntensity: 0, roughness: 0.9 }));
    ember.position.set(0, top - 0.04, cz);
    ember.scale.y = 0.6;
    g.add(ember);
    l.embers.push(ember.material);
    for (let k = 0; k < 2; k++) {
      const mat = flameMaterial(k * 2.1 + (name === 'torch' ? 0 : 5));
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), mat);
      card.position.set(0, top + 0.1, cz);
      card.rotation.y = k * (Math.PI / 2) + Math.PI / 4;
      card.layers.set(LAYER_MAIN_ONLY);
      g.add(card);
      l.cards.push(mat);
    }
    l.light.position.set(0, top + 0.12, cz + 0.05);
    l.targets.push(...meshes(m), ember);
    g.traverse((o) => { if (o !== l.light && !o.isLight) o.layers.set(LAYER_MAIN_ONLY); });
  });
  torch('torch', new THREE.Vector3(X0, 1.62, -0.24), Math.PI / 2);
  torch('torch2', new THREE.Vector3(1.52, 1.62, Z0), 0);

  for (const l of lamps) {
    l.on = 0;
    l.target = 0;
  }
  const flameColor = new THREE.Color(1.0, 0.62, 0.25);
  const ready = Promise.all(loads);
  return {
    group,
    lamps,
    ready,
    update(dt, time, snap = false) {
      for (const l of lamps) {
        const lit = l.root.parent?.userData.stored ? 0 : l.target;
        l.on += (lit - l.on) * (snap ? 1 : Math.min(1, dt * 4));
        const flick = 0.86 + 0.08 * Math.sin(time * 17.0 + l.power) + 0.05 * Math.sin(time * 31.0) + (l.cards.length ? 0.06 * Math.sin(time * 9.3) : 0);
        l.light.intensity = l.power * l.on * flick;
        const k = Math.max(0.001, Math.min(1, l.on * 1.5)); // (never exactly 0: a singular matrix)
        l.flames.forEach((f, i) => {
          f.material.color.copy(flameColor).multiplyScalar(8 * l.on);
          f.scale.set(k, k * (0.92 + 0.1 * Math.sin(time * 19 + i * 2)), k);
        });
        for (const c of l.cards) {
          c.uniforms.uTime.value = time;
          c.uniforms.uOn.value = l.on;
        }
        for (const e of l.embers) e.emissiveIntensity = 2.2 * l.on * flick;
      }
    },
  };
}
