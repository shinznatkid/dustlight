import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { track } from './common.js';
import { loadManifest, loadModel } from './props.js';
import { COUNTER, SHELF, NOOK, DISPLAY, onDisplay } from './plan.js';

// Lamps of the bookshop (world.js switches them on at dusk; right-click toggles):
// a green-glass banker's lamp on the counter, a floor lamp over the reading chair,
// the floral oil lamp on the side table, and a string of fairy lights along the
// top of the bookshelves. Built like props.js buildFixtures: a light that never
// leaves the scene (intensity 0 when off — hiding it would recompile every shader).

const brass = new THREE.MeshStandardMaterial({ name: 'lampBrass', color: 0xc89a52, metalness: 0.8, roughness: 0.3 });

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

const bulbMat = () => new THREE.MeshBasicMaterial({ color: 0x000000 });

export function buildFixtures(scene) {
  const group = new THREE.Group();
  group.name = 'lamps';
  scene.add(group);
  const lamps = [];

  // ---- banker's lamp on the counter
  {
    const g = new THREE.Group();
    g.position.set(1.66, COUNTER.h, -1.3);
    g.rotation.y = 0.35;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.03, 32), brass);
    base.position.y = 0.015;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.3, 12), brass);
    stem.position.y = 0.17;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 10), brass);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, 0.32, 0.05);
    // green cased-glass shade: half a cylinder lying along x, open side down
    const shadeMat = new THREE.MeshPhysicalMaterial({
      name: 'bankerGlass',
      color: 0x1d6a3c,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0.25, 0.9, 0.4),
      emissiveIntensity: 0,
    });
    const shadeGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.3, 32, 1, true, -Math.PI / 2, Math.PI);
    shadeGeo.rotateZ(Math.PI / 2);
    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.set(0, 0.35, 0.1);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24, 0, Math.PI), shadeMat);
      cap.rotation.set(0, (s * Math.PI) / 2, 0);
      cap.position.set(s * 0.15, 0.35, 0.1);
      g.add(cap);
    }
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 10), bulbMat());
    bulb.rotation.z = Math.PI / 2;
    bulb.position.set(0, 0.33, 0.1);
    const light = lampLight(0xffc27a, 6, false);
    light.position.set(0, 0.3, 0.12);
    for (const m of [base, stem, arm, shade]) { m.castShadow = true; m.receiveShadow = true; }
    g.add(base, stem, arm, shade, bulb, light);
    group.add(g);
    lamps.push({ name: 'banker', root: g, light, shadeMat, glow: 0.35, bulb, power: 2.2, targets: [shade, base, stem], adopt: { big: false, small: true } });
  }

  // ---- little glazed lamp on the display chest by the way in (lights the front at night)
  {
    const g = new THREE.Group();
    const p = onDisplay(0.25);
    g.position.set(p.x, DISPLAY.top, p.z);
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      pts.push(new THREE.Vector2(0.035 + Math.sin(t * Math.PI) * 0.07 + (t < 0.08 ? 0.02 : 0) + (1 - t) * 0.012, t * 0.24));
    }
    const baseMat = new THREE.MeshPhysicalMaterial({ name: 'glaze', color: 0xc0592f, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const base = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), baseMat);
    base.castShadow = true;
    const shadeMat = new THREE.MeshStandardMaterial({
      name: 'displayShade',
      color: 0xf0e0c0,
      roughness: 1,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(1.0, 0.62, 0.3),
      emissiveIntensity: 0,
    });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.17, 40, 1, true), shadeMat);
    shade.position.y = 0.33;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 14, 10), bulbMat());
    bulb.position.y = 0.3;
    const light = lampLight(0xffc27a, 6, false);
    light.position.y = 0.3;
    g.add(base, shade, bulb, light);
    group.add(g);
    lamps.push({ name: 'display', root: g, light, shadeMat, glow: 0.22, bulb, power: 2.4, targets: [shade, base], adopt: { big: false, small: true } });
  }

  // ---- floor lamp over the reading chair (casts the room's lamp shadow)
  {
    const g = new THREE.Group();
    g.position.set(-2.92, 0, 2.38);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.03, 32), brass);
    base.position.y = 0.015;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1.42, 12), brass);
    pole.position.y = 0.72;
    const shadeMat = new THREE.MeshStandardMaterial({
      name: 'floorShade',
      color: 0xe0a64a,
      roughness: 1,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(1.0, 0.6, 0.25),
      emissiveIntensity: 0,
    });
    // pleated drum shade
    const sg = new THREE.CylinderGeometry(0.17, 0.25, 0.32, 72, 1, true);
    const p = sg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + 0.035 * Math.cos(a * 36);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    sg.computeVertexNormals();
    const shade = new THREE.Mesh(sg, shadeMat);
    shade.position.y = 1.52;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), bulbMat());
    bulb.position.y = 1.47;
    const light = lampLight(0xffb86a, 10, true);
    light.position.y = 1.46;
    for (const m of [base, pole]) { m.castShadow = true; m.receiveShadow = true; }
    shade.receiveShadow = true;
    g.add(base, pole, shade, bulb, light);
    group.add(g);
    lamps.push({ name: 'floor', root: g, light, shadeMat, glow: 0.22, bulb, power: 5, targets: [shade, pole, base], adopt: { big: true, small: false } });
  }

  // ---- the floral oil lamp on the side table (a Poly Haven model, loaded async;
  // ready() waits for it, so it is in place before decorate.js adopts it)
  {
    const g = new THREE.Group();
    g.position.set(NOOK.side.x, NOOK.side.top, NOOK.side.z);
    const light = lampLight(0xffa654, 5, false);
    light.position.y = 0.46;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), bulbMat());
    flame.scale.set(1, 2.4, 1);
    flame.position.y = 0.44;
    flame.layers.set(LAYER_MAIN_ONLY);
    g.add(light, flame);
    group.add(g);
    const lamp = { name: 'oil', root: g, light, shadeMat: null, bulb: null, flame, power: 1.6, targets: [], adopt: { big: false, small: true } };
    lamps.push(lamp);
    track(loadManifest().then((mf) => (mf.models.vintage_oil_lamp ? loadModel('vintage_oil_lamp') : null)).then((obj) => {
      if (!obj) return;
      obj.scale.setScalar(0.72);
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      obj.position.y = -b.min.y;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.layers.set(LAYER_MAIN_ONLY);
        lamp.targets.push(o);
        // the model's own flame card: glow with the lamp
        if (/_flame$/.test(o.material.name)) {
          o.material = o.material.clone();
          lamp.flameMat = o.material;
          o.castShadow = false;
        }
        if (/_glass$/.test(o.material.name)) o.castShadow = false;
      });
      const h = (b.max.y - b.min.y);
      light.position.y = h * 0.62;
      flame.position.y = h * 0.6;
      g.add(obj);
    }).catch((err) => console.warn('oil lamp failed', err)));
  }

  // ---- fairy lights swagged along the top of the bookshelves
  {
    const g = new THREE.Group();
    const y0 = SHELF.cornice - 0.07;
    const z = SHELF.front + 0.075;
    const hooks = [];
    const bw = (SHELF.x1 - SHELF.x0) / SHELF.bays;
    for (let i = 0; i <= SHELF.bays; i++) hooks.push(SHELF.x0 + 0.05 + i * (bw - 0.1 / SHELF.bays));
    const pts = [];
    for (let i = 0; i < hooks.length - 1; i++) {
      const a = hooks[i];
      const b = hooks[i + 1];
      for (let k = 0; k < 12; k++) {
        const t = k / 12;
        pts.push(new THREE.Vector3(a + (b - a) * t, y0 - Math.sin(t * Math.PI) * 0.13, z + Math.sin(t * Math.PI) * 0.02));
      }
    }
    pts.push(new THREE.Vector3(hooks[hooks.length - 1], y0, z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.0025, 5), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6 }));
    const n = 44;
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const p = curve.getPointAt((i + 0.5) / n);
      m.makeTranslation(p.x, p.y - 0.012, p.z);
      bulbs.setMatrixAt(i, m);
    }
    g.add(wire, bulbs);
    g.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
    const light = lampLight(0xffb060, 5.5, false);
    light.position.set((SHELF.x0 + SHELF.x1) / 2, y0 - 0.25, z + 0.45);
    g.add(light);
    group.add(g);
    lamps.push({ name: 'fairy', root: g, light, shadeMat: null, bulb: null, bulbs, power: 1.6, targets: [bulbs, wire], adopt: { wall: true } });
  }

  for (const l of lamps) {
    l.on = 0;
    l.target = 0;
  }
  const flameColor = new THREE.Color(1.0, 0.55, 0.2);
  const fairyColor = new THREE.Color(1.0, 0.62, 0.28);
  return {
    group,
    lamps,
    update(dt, time, snap = false) {
      for (const l of lamps) {
        const lit = l.root.parent?.userData.stored ? 0 : l.target;
        l.on += (lit - l.on) * (snap ? 1 : Math.min(1, dt * 4));
        let flick = 1;
        if (l.name === 'oil') flick = 0.9 + 0.06 * Math.sin(time * 13.0) + 0.04 * Math.sin(time * 29.0);
        l.light.intensity = l.power * l.on * flick;
        if (l.shadeMat) l.shadeMat.emissiveIntensity = l.glow * l.on;
        if (l.bulb) l.bulb.material.color.setRGB(1, 0.8, 0.55).multiplyScalar(3 * l.on);
        if (l.flame) {
          l.flame.material.color.copy(flameColor).multiplyScalar(8 * l.on * flick);
          const k = Math.max(0.001, Math.min(1, l.on * 1.5));
          l.flame.scale.set(k, 2.4 * k, k);
        }
        if (l.flameMat?.emissive) {
          l.flameMat.emissive.copy(flameColor);
          l.flameMat.emissiveIntensity = 4 * l.on * flick;
        }
        if (l.bulbs) l.bulbs.material.color.copy(fairyColor).multiplyScalar(6 * l.on);
      }
    },
  };
}
