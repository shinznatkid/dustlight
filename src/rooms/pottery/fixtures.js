import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { Bucket, mtx } from './kit.js';
import { kenney, placeAt } from './props.js';
import { ROOM } from './layout.js';

// The pottery studio's lights for the evening (world.js switches them on at t >= 0.72):
//   floor  — Kenney floor lamp by the visitors' chair (the one with a cube shadow)
//   table  — Kenney table lamp at the end of the work table
//   (the brick kiln is the room's fire now: shell.js)
//   garland— a string of bulbs along the back wall
// Every light exists (at intensity 0) from the start: hiding one or adding one later
// changes the light count and recompiles every shader (docs/lighting-notes.md).

const { X0, X1, Z0 } = ROOM;
const loads = [];
// resolves once the lamp models are in (their footprint is measured when adopted)
export const fixturesReady = () => Promise.all(loads);

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

// a Kenney lamp at (x, y, z): the 'lamp' material is its shade (made emissive, no
// shadow of its own so the light inside gets out); the light sits in the shade
function kenneyLamp(group, name, where, light, lamp) {
  loads.push(kenney(name).then((obj) => {
    placeAt(obj, where);
    let shade = null;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.name === 'lamp') {
        shade = o;
        o.castShadow = false;
        o.material.emissive = new THREE.Color(1.0, 0.66, 0.34);
        o.material.emissiveIntensity = 0;
        o.material.side = THREE.DoubleSide;
        lamp.shadeMat = o.material;
      }
      lamp.targets.push(o);
    });
    group.add(obj);
    if (shade) {
      const b = new THREE.Box3().setFromObject(shade);
      const c = b.getCenter(new THREE.Vector3());
      light.position.set(c.x, b.min.y + (b.max.y - b.min.y) * 0.35, c.z);
    }
  }));
}

export function buildFixtures(scene) {
  const group = new THREE.Group();
  group.name = 'fixtures';
  scene.add(group);
  const lamps = [];

  // floor lamp between the visitors' chair and the kiln
  {
    const g = new THREE.Group();
    const light = lampLight(0xffc27a, 9, true);
    light.position.set(2.62, 1.4, -0.42);
    g.add(light);
    group.add(g);
    const lamp = { name: 'floor', root: g, light, shadeMat: null, power: 4.5, targets: [], adopt: { big: true } };
    kenneyLamp(g, 'lampRoundFloor', { x: 2.62, z: -0.42, s: 1.9 }, light, lamp);
    lamps.push(lamp);
  }

  // table lamp at the right end of the work table
  {
    const g = new THREE.Group();
    const light = lampLight(0xffc27a, 6, false);
    light.position.set(-0.12, 1.1, Z0 + 0.22);
    g.add(light);
    group.add(g);
    const lamp = { name: 'table', root: g, light, shadeMat: null, power: 2.4, targets: [], adopt: { big: true, small: true } };
    kenneyLamp(g, 'lampSquareTable', { x: -0.12, z: Z0 + 0.22, y: 0.826, s: 1.7 }, light, lamp);
    lamps.push(lamp);
  }

  // garland of bulbs along the back wall (a sagging wire, bulbs every ~28 cm)
  {
    const g = new THREE.Group();
    const wire = new Bucket();
    const xa = X0 + 0.12;
    const xb = X1 - 0.35;
    const y0 = 2.78;
    const sag = 0.22;
    const zc = Z0 + 0.04;
    const yAt = (u) => y0 - sag * 4 * u * (1 - u) - 0.06 * Math.sin(u * Math.PI * 3) ** 2;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const u0 = i / N;
      const u1 = (i + 1) / N;
      const p0 = new THREE.Vector3(xa + (xb - xa) * u0, yAt(u0), zc);
      const p1 = new THREE.Vector3(xa + (xb - xa) * u1, yAt(u1), zc);
      const d = p1.clone().sub(p0);
      const len = d.length();
      wire.add(new THREE.BoxGeometry(len, 0.008, 0.008), '#3d3531', { m: mtx([(p0.x + p1.x) / 2, (p0.y + p1.y) / 2, zc], [0, 0, Math.atan2(d.y, d.x)]) });
    }
    const bulbs = [];
    const n = 20;
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const x = xa + (xb - xa) * u;
      const y = yAt(u) - 0.045;
      wire.add(new THREE.CylinderGeometry(0.01, 0.01, 0.03, 5), '#3d3531', { m: mtx([x, y + 0.03, zc]) });
      const bg = new THREE.IcosahedronGeometry(0.024, 0);
      bg.scale(1, 1.3, 1);
      bg.translate(x, y, zc + 0.01);
      bulbs.push(bg);
    }
    const wireMesh = wire.build({ name: 'garland' });
    // bulbs: one unlit mesh, pale glass when off, warm when on (colour set in update)
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const bulbMesh = new THREE.Mesh(mergeGeometries(bulbs, false), bulbMat);
    g.add(wireMesh, bulbMesh);
    g.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
    const light = lampLight(0xffb866, 7, false);
    light.position.set((xa + xb) / 2, 2.35, Z0 + 0.45);
    g.add(light);
    group.add(g);
    lamps.push({ name: 'garland', root: g, light, bulbMat, power: 1.6, targets: [bulbMesh, ...wireMesh.children], adopt: { wall: true } });
  }

  for (const l of lamps) {
    l.on = 0;
    l.target = 0;
  }
  const warm = new THREE.Color(1, 0.72, 0.4).multiplyScalar(4);
  const glass = new THREE.Color(0.42, 0.38, 0.32); // an unlit bulb by day: pale glass, not a black dot
  return {
    group,
    lamps,
    // snap = jump to the target instead of easing (frozen ?still screenshots)
    update(dt, time, snap = false) {
      for (const l of lamps) {
        const lit = l.root.parent?.userData.stored ? 0 : l.target;
        l.on += (lit - l.on) * (snap ? 1 : Math.min(1, dt * 4));
        l.light.intensity = l.power * l.on;
        if (l.shadeMat) l.shadeMat.emissiveIntensity = 0.55 * l.on;
        if (l.bulbMat) l.bulbMat.color.copy(glass).lerp(warm, l.on);
      }
    },
  };
}
