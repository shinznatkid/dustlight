import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { PAL, Bucket, mtx, kenney, placeAt } from './kit.js';
import { makeSign } from './signs.js';
import { ROOM, SIGN_AT } from './layout.js';

// The neon flat's lights (world.js switches lamps on at dusk, off in the morning — but the
// signs, like a city's, stay lit all day once they're on (allDay); the player can right-click
// any of them):
//   ramen · moon · cat — the three neon signs (signs.js): hung on the walls, movable along
//            them like pictures; each throws its colour into the room, as much as its tubes
//            are new (sign.lit) — level 6 has them dead at the start
//   street — the noodle bar's lantern sign, outside on the building, seen through the
//            window (it stays put); its light is a shadowed spot that comes in through the
//            glass — level 6's last job
//   lantern— a battery camping lantern (the one you bring along: it stays in the room from
//            the start, so there's light to work by)
//   floor  — a Kenney floor lamp by the sofa (no cube shadow: among six coloured lights it
//            barely showed, and it made every drop re-render the room six times)
// Every light exists (at intensity 0) from the start: hiding one or adding one later
// changes the light count and recompiles every shader (docs/lighting-notes.md).

const { X0, Z0 } = ROOM;
const loads = [];
// resolves once the lamp models are in (their footprint is measured when adopted)
export const fixturesReady = () => Promise.all(loads);

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

// The lantern outside throws its colour in through the window: a spot light just outside the
// glass with a shadow (one pass, not six), so the wall around the window keeps it out and the
// frame's bars shade it — a light left unshadowed out there would shine through the wall
// onto the floor below the window. The probes see it like the signs' lights.
function streetLight(color) {
  const l = new THREE.SpotLight(color, 0, 9, 1.1, 0.75, 2);
  l.castShadow = true;
  l.shadow.mapSize.set(1024, 1024);
  l.shadow.bias = -0.002;
  l.shadow.normalBias = 0.02;
  l.shadow.camera.near = 0.03;
  l.shadow.camera.far = 9;
  return l;
}
const capMetal = new THREE.MeshStandardMaterial({ color: '#2b2a30', roughness: 0.5, metalness: 0.4 });

// a neon tube stutters as it strikes: on/off beats over ~0.7 s, then steady
const STRIKE = [[0.0, 1], [0.06, 0], [0.13, 1], [0.17, 0.2], [0.28, 1], [0.33, 0], [0.42, 0.7], [0.47, 1]];
const STRIKE_T = 0.7;
const SIGN_DAY = 0.3; // a sign's light by day, of its light at night
function strike(t) {
  let v = 1;
  for (const [at, k] of STRIKE) if (t >= at) v = k;
  return v;
}

// the camping lantern (origin: the middle of its foot): a teal body, warm glass, a handle
function lanternModel() {
  const b = new Bucket();
  b.add(new THREE.CylinderGeometry(0.075, 0.085, 0.05, 10), PAL.teal, { m: mtx([0, 0.025, 0]), mat: 'gloss' });
  b.add(new THREE.CylinderGeometry(0.07, 0.075, 0.03, 10), PAL.tealDark, { m: mtx([0, 0.235, 0]) });
  b.add(new THREE.ConeGeometry(0.078, 0.05, 10), PAL.teal, { m: mtx([0, 0.275, 0]), mat: 'gloss' });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(0.012, 0.18, 0.012), PAL.tealDark, { m: mtx([Math.cos(a) * 0.066, 0.14, Math.sin(a) * 0.066]) });
  }
  b.add(new THREE.TorusGeometry(0.05, 0.007, 4, 10, Math.PI), '#3b3942', { m: mtx([0, 0.3, 0]) });
  const g = b.build({ name: 'lantern' });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#f6e7c8', roughness: 0.4, emissive: new THREE.Color(1.0, 0.72, 0.42), emissiveIntensity: 0 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.17, 10), glassMat);
  glass.position.y = 0.137;
  g.add(glass);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o !== glass; o.receiveShadow = true; } });
  return { obj: g, glassMat };
}

export function buildFixtures(scene) {
  const group = new THREE.Group();
  group.name = 'fixtures';
  scene.add(group);
  const lamps = [];

  // ---- the three signs, and the noodle bar's lantern outside the window
  for (const [name, at] of Object.entries(SIGN_AT)) {
    const sign = makeSign(name);
    const g = new THREE.Group();
    g.name = `lamp-${name}`;
    g.add(sign.object);
    const street = at.wall === 'street';
    const light = street ? streetLight(sign.spec.color) : lampLight(new THREE.Color(sign.spec.color), 7);
    light.position.set(0, -0.05, street ? 0.1 : 0.5);
    g.add(light);
    if (at.wall === 'back') g.position.set(at.x, at.y, Z0 + 0.012);
    else {
      g.position.set(street ? at.x : X0 + 0.012, at.y, at.z);
      g.rotation.y = Math.PI / 2;
    }
    group.add(g);
    if (street) {
      // it hangs on two rods from a bracket up on the facade (above the window, out of sight)
      for (const s of [-1, 1]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.8, 5), capMetal);
        rod.position.set(s * 0.22, sign.spec.h / 2 + 0.4, 0.01);
        rod.layers.set(LAYER_MAIN_ONLY);
        g.add(rod);
      }
      // the light comes in through the window: aimed into the room, down and across
      light.target.position.set(0.2, 0.1, 0.5);
      group.add(light.target);
    }
    lamps.push({
      name, root: g, light, sign, power: sign.spec.power, buzz: 0, targets: [sign.board, sign.tubes],
      // (a city's signs stay lit all day once they work: world.js only ever switches them on)
      allDay: true,
      street,
      // (the lantern is the building's, not the flat's: not something to pick up and hang elsewhere)
      adopt: street ? false : { wall: true, ry: at.wall === 'back' ? 0 : Math.PI / 2 },
    });
  }

  // ---- the lantern, on the floor where you set it down when you came in
  {
    const g = new THREE.Group();
    const { obj, glassMat } = lanternModel();
    obj.traverse((o) => o.layers.set(LAYER_MAIN_ONLY));
    g.add(obj);
    const light = lampLight(0xffc27a, 5);
    light.position.set(0, 0.2, 0);
    g.add(light);
    g.position.set(0.35, 0, 0.55);
    group.add(g);
    lamps.push({ name: 'lantern', root: g, light, glassMat, power: 0.85, targets: obj.children.filter((o) => o.isMesh), adopt: { small: true } });
  }

  // ---- the floor lamp by the sofa
  {
    const g = new THREE.Group();
    const light = lampLight(0xffc27a, 8); // (no cube shadow: 6 extra scene passes on every drop were the unpacking's 40–50 ms frames)
    light.position.set(-0.12, 1.45, -2.1);
    g.add(light);
    group.add(g);
    const lamp = { name: 'floor', root: g, light, shadeMat: null, power: 1.8, targets: [], adopt: { big: true } };
    loads.push(kenney('lampRoundFloor', { metal: '#3b3942' }).then((obj) => {
      placeAt(obj, { x: -0.12, z: -2.1, s: 2.0 });
      let shade = null;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material.name === 'lamp') {
          shade = o;
          o.castShadow = false;
          o.material.color.set('#f7d9a8');
          o.material.emissive = new THREE.Color(1.0, 0.66, 0.34);
          o.material.emissiveIntensity = 0;
          o.material.side = THREE.DoubleSide;
          lamp.shadeMat = o.material;
        }
        lamp.targets.push(o);
      });
      g.add(obj);
      if (shade) {
        const b = new THREE.Box3().setFromObject(shade);
        const c = b.getCenter(new THREE.Vector3());
        light.position.set(c.x, b.min.y + (b.max.y - b.min.y) * 0.35, c.z);
      }
    }));
    lamps.push(lamp);
  }

  for (const l of lamps) {
    l.on = 0;
    l.target = 0;
  }
  let clock = 0;
  return {
    group,
    lamps,
    signs: lamps.filter((l) => l.sign),
    // a sign strikes up (the stutter of a tube catching), e.g. when its last tube goes in
    strike(l) { l.buzz = STRIKE_T; },
    // snap = jump to the target instead of easing (frozen ?still screenshots) · tod = the
    // time of day (world.js): a sign lit all day still glows by day, but the light it throws
    // is mostly lost in the daylight — a third of it until the evening (and again from dawn)
    update(dt, time, snap = false, tod = 1) {
      clock += dt;
      const night = tod > 1 ? 1 - THREE.MathUtils.smoothstep(tod, 1.0, 1.15) : THREE.MathUtils.smoothstep(tod, 0.6, 0.8);
      const signLight = SIGN_DAY + (1 - SIGN_DAY) * night;
      for (const l of lamps) {
        const lit = l.root.parent?.userData.stored ? 0 : l.target;
        if (l.sign && lit > 0.5 && l.lastTarget === 0 && !snap) l.buzz = STRIKE_T; // switched on: it strikes
        l.lastTarget = lit > 0.5 ? 1 : 0;
        l.on += (lit - l.on) * (snap ? 1 : Math.min(1, dt * (l.sign ? 14 : 4)));
        if (l.sign) {
          let k = 1;
          if (l.buzz > 0 && !snap) {
            k = strike(STRIKE_T - l.buzz);
            l.buzz = Math.max(0, l.buzz - dt);
          }
          // (a faint hum in the glow, never a flicker you'd notice)
          const hum = snap ? 1 : 0.985 + 0.015 * Math.sin(clock * 47 + l.power * 3);
          l.sign.material.userData.neon.uOn.value = l.on * k * hum;
          l.light.intensity = l.power * l.on * k * l.sign.lit * signLight;
        } else {
          l.light.intensity = l.power * l.on;
          if (l.shadeMat) l.shadeMat.emissiveIntensity = 1.1 * l.on;
          if (l.glassMat) l.glassMat.emissiveIntensity = 1.4 * l.on;
        }
      }
    },
  };
}
