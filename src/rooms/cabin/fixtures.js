import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { kaykit } from './kaykit.js';
import { CABIN, FIRE } from './shell.js';

// The cabin's lamps, same contract as props.js buildFixtures: the lights exist from
// the start (a light appearing later would recompile every shader); the KayKit
// models load into their groups and `ready` resolves once they're all in.
//   floor lamp by the armchair · table lamp on the side table · candles on the
//   mantel · a lantern on the coffee table
const { Z0 } = CABIN;
const fz = Z0 + FIRE.d;

function lampLight(color, distance, shadow = false) {
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

// the glowing part of a model gets an emissive copy of the atlas material
function glowMaterial(mesh, color) {
  const m = mesh.material.clone();
  m.emissive = new THREE.Color(color);
  m.emissiveMap = m.map;
  m.emissiveIntensity = 0;
  mesh.material = m;
  return m;
}

// a candle flame: its own mesh re-centred on itself so it can grow from nothing
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

export function buildCabinFixtures(scene) {
  const group = new THREE.Group();
  group.name = 'cabin-lamps';
  scene.add(group);
  const lamps = [];
  const loads = [];
  const lamp = (name, pos, light, power, adopt, load) => {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(light);
    group.add(g);
    const l = { name, root: g, light, power, adopt, targets: [], shadeMat: null, flames: [] };
    lamps.push(l);
    loads.push(load(g, l));
    return l;
  };

  // floor lamp next to the armchair
  lamp('floor', new THREE.Vector3(-2.78, 0, 2.12), lampLight(0xffc27a, 9), 4.2, { big: true, small: false }, async (g, l) => {
    const m = await kaykit('furniture', 'lamp_standing', { glow: 'beige', swap: { tan: 'honey' } });
    m.scale.setScalar(0.64);
    const h = localBox(m).max.y;
    g.add(m);
    l.light.position.set(0, h - 0.26, 0);
    l.shadeMat = glowMaterial(m.userData.glow, 0xffb366);
    l.targets.push(...meshes(m));
  });

  // table lamp on the side table right of the couch
  lamp('table', new THREE.Vector3(2.78, 0.5, Z0 + 0.28), lampLight(0xffc27a, 7), 2.6, { big: true, small: true }, async (g, l) => {
    const m = await kaykit('furniture', 'lamp_table', { glow: 'beige', swap: { blue: 'teal' } });
    m.scale.setScalar(0.42);
    const h = localBox(m).max.y;
    g.add(m);
    l.light.position.set(0, h - 0.12, 0);
    l.shadeMat = glowMaterial(m.userData.glow, 0xffb366);
    l.targets.push(...meshes(m));
  });

  // three candles on the left end of the mantel
  lamp('candles', new THREE.Vector3(FIRE.x - 0.92, FIRE.mantel, fz + 0.12), lampLight(0xff9a4a, 3.2), 0.7, { big: false, small: true }, async (g, l) => {
    const spec = [['candle_lit', -0.08, 0.0, 0.27], ['candle_thin_lit', 0.07, -0.05, 0.3], ['candle_lit', 0.06, 0.08, 0.2]];
    let top = 0;
    for (const [name, x, z, s] of spec) {
      const m = await kaykit('dungeon', name, { glow: 'flame' });
      m.scale.setScalar(s);
      m.position.set(x, 0, z);
      top = Math.max(top, localBox(m).max.y);
      g.add(m);
      const f = flameOf(m);
      if (f) l.flames.push(f);
      l.targets.push(...meshes(m));
    }
    l.light.position.set(0, top + 0.03, 0.02);
    g.traverse((o) => { if (o !== l.light) o.layers.set(LAYER_MAIN_ONLY); });
  });

  // lantern on the coffee table
  lamp('lantern', new THREE.Vector3(1.56, 0.275, -0.6), lampLight(0xffa152, 4), 1.1, { big: false, small: true }, async (g, l) => {
    const m = await kaykit('halloween', 'lantern_standing', { glow: 'glow' });
    m.scale.setScalar(0.34);
    const h = localBox(m).max.y;
    g.add(m);
    l.light.position.set(0, h * 0.45, 0);
    l.shadeMat = glowMaterial(m.userData.glow, 0xffa04a);
    l.targets.push(...meshes(m));
    g.traverse((o) => { if (o !== l.light) o.layers.set(LAYER_MAIN_ONLY); });
  });

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
        let flick = 1;
        if (l.name === 'candles' || l.name === 'lantern') flick = 0.88 + 0.08 * Math.sin(time * 17.0) + 0.04 * Math.sin(time * 31.0);
        l.light.intensity = l.power * l.on * flick;
        if (l.shadeMat) l.shadeMat.emissiveIntensity = (l.name === 'lantern' ? 2.2 : 0.9) * l.on * flick;
        const k = Math.max(0.001, Math.min(1, l.on * 1.5)); // (never exactly 0: a singular matrix)
        l.flames.forEach((f, i) => {
          f.material.color.copy(flameColor).multiplyScalar(8 * l.on);
          f.scale.set(k, k * (0.92 + 0.1 * Math.sin(time * 19 + i * 2)), k);
        });
      }
    },
  };
}

// bounds of a model in its lamp group's frame (measured before it's added)
function localBox(m) {
  m.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(m);
}

function meshes(obj) {
  const out = [];
  obj.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}
