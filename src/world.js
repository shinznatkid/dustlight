import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ProbeGI, LAYER_CAPTURE, LAYER_MAIN_ONLY } from './gi.js';
import meadow from './rooms/meadow.js';
import { createDust } from './atmos.js';
import { createPost } from './post.js';
import { createDecor } from './decorate.js';

// The 3D world: renderer, room, furniture, sun + time of day, probe GI,
// reflections, post and the frame loop. No DOM beyond the canvas — the game
// shell (main.js) drives it and listens through callbacks.

export const CAMS = {
  hero: { pos: [7.7, 5.6, 8.3], look: [-0.3, 0.75, -0.25], fov: 28 },
  window: { pos: [3.4, 2.4, 4.4], look: [-2.3, 1.1, 0.4], fov: 36 },
  fire: { pos: [2.8, 2.1, 1.6], look: [-0.9, 0.75, -2.2], fov: 38 },
  sofa: { pos: [-1.2, 2.0, 3.8], look: [2.0, 0.6, -0.6], fov: 40 },
  top: { pos: [0.4, 14, 5.5], look: [0, 0, 0], fov: 32 },
};

// `key` names the time of day for the UI (i18n: time.<key>). Exported so a room
// module can start from these and change a field or two (e.g. the backdrop `bg`)
const C = (r, g, b) => new THREE.Color(r, g, b);
export const KEYS = [
  { t: 0.0, key: 'morning', elev: 38, head: -28, sun: C(1.0, 0.93, 0.84), si: 9.0, top: C(0.9, 1.35, 2.3), hor: C(2.5, 2.45, 2.25), glow: C(0.5, 0.45, 0.35), tree: C(0.2, 0.3, 0.14), bg: C(0.2, 0.19, 0.16), amb: 0.02, exp: 1.0, zen: C(0.55, 0.62, 0.78), dhor: C(0.66, 0.63, 0.57), gnd: C(0.16, 0.14, 0.12) },
  { t: 0.35, key: 'afternoon', elev: 31, head: -10, sun: C(1.0, 0.86, 0.68), si: 10.5, top: C(0.85, 1.2, 2.1), hor: C(2.7, 2.35, 1.9), glow: C(1.0, 0.7, 0.35), tree: C(0.18, 0.24, 0.1), bg: C(0.19, 0.16, 0.12), amb: 0.02, exp: 1.0, zen: C(0.55, 0.58, 0.66), dhor: C(0.7, 0.62, 0.52), gnd: C(0.16, 0.13, 0.1) },
  { t: 0.62, key: 'golden', elev: 22, head: 6, sun: C(1.0, 0.6, 0.3), si: 11.5, top: C(0.95, 0.8, 1.1), hor: C(2.9, 1.65, 0.8), glow: C(3.0, 1.4, 0.5), tree: C(0.12, 0.11, 0.07), bg: C(0.16, 0.11, 0.08), amb: 0.02, exp: 1.05, zen: C(0.44, 0.42, 0.5), dhor: C(0.66, 0.5, 0.36), gnd: C(0.14, 0.1, 0.07) },
  { t: 0.8, key: 'dusk', elev: 8, head: 15, sun: C(1.0, 0.38, 0.16), si: 2.5, top: C(0.22, 0.22, 0.45), hor: C(1.1, 0.5, 0.32), glow: C(1.0, 0.35, 0.12), tree: C(0.03, 0.03, 0.04), bg: C(0.06, 0.05, 0.07), amb: 0.015, exp: 1.25, zen: C(0.12, 0.12, 0.21), dhor: C(0.22, 0.15, 0.13), gnd: C(0.04, 0.03, 0.03) },
  { t: 0.88, key: 'evening', elev: 20, head: 10, sun: C(0.55, 0.65, 1.0), si: 0.0, top: C(0.05, 0.06, 0.14), hor: C(0.2, 0.18, 0.3), glow: C(0.1, 0.08, 0.12), tree: C(0.015, 0.015, 0.025), bg: C(0.025, 0.028, 0.045), amb: 0.012, exp: 1.4, zen: C(0.05, 0.06, 0.12), dhor: C(0.07, 0.07, 0.12), gnd: C(0.015, 0.015, 0.02) },
  { t: 1.0, key: 'night', elev: 38, head: -18, sun: C(0.55, 0.68, 1.0), si: 1.1, top: C(0.02, 0.03, 0.08), hor: C(0.07, 0.09, 0.18), glow: C(0.08, 0.1, 0.2), tree: C(0.008, 0.01, 0.018), bg: C(0.02, 0.024, 0.04), amb: 0.012, exp: 1.45, zen: C(0.035, 0.045, 0.1), dhor: C(0.04, 0.05, 0.09), gnd: C(0.01, 0.01, 0.015) },
];
export const LAMP_ON_T = 0.72; // the lamps come on by themselves past here (and go off before it)
const FIRE_ON_T = 0.55;
// a day that loops (proto.html's clock): past the last key (night) the light heads back
// to the first (morning) — dawn, t in (1, 1 + DAWN]; 1 + DAWN looks exactly like 0
export const DAWN = 0.15;

function sampleKeys(t, K = KEYS) {
  const last = K[K.length - 1];
  let a;
  let b;
  if (t > last.t) {
    a = last;
    b = { ...K[0], t: last.t + DAWN };
  } else {
    let i = 0;
    while (i < K.length - 2 && t > K[i + 1].t) i++;
    a = K[i];
    b = K[i + 1];
  }
  const k = THREE.MathUtils.smoothstep(t, a.t, b.t);
  const lerp = (x, y) => x + (y - x) * k;
  const lc = (x, y) => x.clone().lerp(y, k);
  return {
    key: k < 0.5 ? a.key : b.key,
    elev: lerp(a.elev, b.elev), head: lerp(a.head, b.head), sun: lc(a.sun, b.sun), si: lerp(a.si, b.si),
    top: lc(a.top, b.top), hor: lc(a.hor, b.hor), glow: lc(a.glow, b.glow), tree: lc(a.tree, b.tree),
    bg: lc(a.bg, b.bg), amb: lerp(a.amb, b.amb), exp: lerp(a.exp, b.exp),
    zen: lc(a.zen, b.zen), dhor: lc(a.dhor, b.dhor), gnd: lc(a.gnd, b.gnd),
  };
}

// Q: URL params (pr, cam, pos, look, tone, nogi/noao/noshafts/nodust/nobloom) ·
// R: the room module to stand up (src/rooms/*.js; level 1's living room by default)
export function createWorld(Q, R = meadow) {
  const ROOM = R.bounds;
  const cams = R.cams ?? CAMS;
  const keys = R.keys ?? KEYS;
  // ---- renderer / scene / camera ------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  // ?pr = exact render scale (screenshots / tests); otherwise the quality setting decides
  renderer.setPixelRatio(Q.has('pr') ? +Q.get('pr') : Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.NoToneMapping;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color();

  const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.3, 80);
  camera.layers.enable(LAYER_MAIN_ONLY);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 20;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minAzimuthAngle = -0.25;
  controls.maxAzimuthAngle = Math.PI * 0.5 + 0.35;
  controls.target.set(0, 0.8, 0);
  // presets are framed for 16:9; on narrow (portrait) screens keep the horizontal
  // field of view instead, so the whole diorama still fits
  let baseFov = 28;
  function fitFov(fov = baseFov) {
    const a = camera.aspect;
    if (a >= 1.5) return fov;
    const h = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * 1.5;
    return THREE.MathUtils.radToDeg(2 * Math.atan(h / a));
  }
  function setCam(name) {
    const c = cams[name] ?? cams.hero;
    baseFov = c.fov;
    camera.fov = fitFov();
    camera.updateProjectionMatrix();
    camera.position.set(...c.pos);
    controls.target.set(...c.look);
    controls.update();
  }
  setCam(Q.get('cam') ?? 'hero');
  if (Q.has('pos')) camera.position.fromArray(Q.get('pos').split(',').map(Number));
  if (Q.has('look')) controls.target.fromArray(Q.get('look').split(',').map(Number));
  controls.update();

  // ---- lights -------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffffff, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 2.5;
  const sc = sun.shadow.camera;
  sc.left = -6.5; sc.right = 6.5; sc.top = 6.5; sc.bottom = -6.5; sc.near = 0.5; sc.far = 40;
  sun.target.position.set(0, 1, 0);
  scene.add(sun, sun.target);
  const ambient = new THREE.AmbientLight(0xfff4e6, 0.02);
  scene.add(ambient);

  // ---- content ------------------------------------------------------------------
  const room = R.build(scene);
  const fixtures = R.buildFixtures(scene);
  const decor = createDecor(scene, {
    camera,
    bounds: { x0: ROOM.X0, x1: ROOM.X1, z0: ROOM.Z0, z1: ROOM.Z1 },
    obstacles: room.obstacles,
    walls: room.hang,
    onLight: lightingChanged,
  });
  // the fire's and the floor lamp's cube shadows are 6 scene passes each (the sun's is 1):
  // only the sun re-renders every frame while something moves — see frame()
  const cubeShadows = [room.fireLight, ...fixtures.lamps.filter((l) => l.light.castShadow).map((l) => l.light)].filter(Boolean);
  for (const l of cubeShadows) {
    l.shadow.autoUpdate = false;
    l.shadow.needsUpdate = true;
  }
  let cubeClock = 0;
  const roomBox = new THREE.Box3(new THREE.Vector3(ROOM.X0, 0, ROOM.Z0), new THREE.Vector3(ROOM.X1, ROOM.H, ROOM.Z1));
  const dust = createDust(roomBox, sun, undefined, { spot: room.shaftSpot ?? null });
  scene.add(dust);

  const post = createPost(renderer, scene, camera, sun, roomBox, { tone: Q.get('tone') ?? 'agx', spot: room.shaftSpot ?? null });
  const { composer } = post;

  const gi = new ProbeGI(renderer, scene, {
    min: new THREE.Vector3(ROOM.X0 + 0.22, 0.28, ROOM.Z0 + 0.22),
    max: new THREE.Vector3(ROOM.X1 - 0.22, ROOM.H - 0.25, ROOM.Z1 - 0.22),
    counts: new THREE.Vector3(9, 4, 8),
  });

  // reflections: one cube capture of the lit room, prefiltered for glossy surfaces
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const envCam = new THREE.CubeCamera(0.05, 40, envRT);
  for (const c of envCam.children) c.layers.enable(LAYER_CAPTURE);
  envCam.position.set(0, 1.3, 0.3);
  let envTex = null;
  let envDirty = true;
  // reflections are captured once the bounce light settles; a clock that keeps moving
  // keeps the GI busy for good, so it can ask for a capture every envEvery seconds anyway
  let envEvery = 0;
  let envAge = 0;
  let giBudget = 5; // probe captures per frame once converged
  function captureEnv() {
    const bg = scene.background;
    scene.background = gi.captureBackground;
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    const needs = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    envCam.update(renderer, scene);
    renderer.shadowMap.needsUpdate = needs;
    renderer.shadowMap.autoUpdate = auto;
    scene.background = bg;
    const next = pmrem.fromCubemap(envRT.texture);
    scene.environment = next.texture;
    envTex?.dispose();
    envTex = next;
  }

  // Every shader the game can need, compiled while the loading screen is still up.
  // three compiles lazily on first draw, and on ANGLE/D3D11 one program is ~20–130 ms
  // on the main thread: the first stroke of a tool, the first board pried up, each
  // thing unpacked from a box froze the game for a moment (playtest round 2).
  // compile() walks hidden meshes too (packed furniture, tool models); it must run
  // with the final lights and environment, and with a render target bound — the
  // scene is always drawn into linear targets (post, probes), which is part of a
  // program's key. Twice: the probes don't see the candles' light (LAYER_MAIN_ONLY),
  // so they draw with their own light count. KHR_parallel_shader_compile keeps it
  // off the main thread. The textures of hidden things go up to the GPU here too
  // (a packed clock's maps were a 40 ms hitch the first time it came out of its box).
  function precompile() {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(envRT);
    const done = Promise.all([camera, gi.cubeCam.children[0]].map((c) => renderer.compileAsync(scene, c)));
    renderer.setRenderTarget(prev);
    const seen = new Set();
    scene.traverse((o) => {
      for (const m of [o.material].flat()) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        for (const v of Object.values(m)) if (v?.isTexture && !v.isRenderTargetTexture) renderer.initTexture(v);
      }
    });
    return done;
  }

  // ---- layer toggles (for A/B comparison) -------------------------------------------
  const layers = { gi: !Q.has('nogi'), ao: !Q.has('noao'), shafts: !Q.has('noshafts'), dust: !Q.has('nodust'), bloom: !Q.has('nobloom') };
  function applyLayers() {
    gi.uniforms.giEnabled.value = layers.gi ? 1 : 0;
    ambient.intensity = sampleKeys(timeT, keys).amb + (layers.gi ? 0 : 0.35);
    post.ao.enabled = layers.ao;
    post.shafts.on = layers.shafts;
    dust.material.uniforms.amount.value = layers.dust ? 1 : 0;
    post.bloom.intensity = layers.bloom ? 0.55 : 0;
  }

  // ---- time of day ----------------------------------------------------------------
  let fireAllowed = true; // a level can keep the fireplace dead until it's cleaned
  let timeT = +(Q.get('t') ?? 0.62);
  let timeKey = sampleKeys(timeT, keys).key;
  let lastLampSide = null;
  let lastFireSide = null;
  // keepSwitches: the lamps and the fire stay as they are (the time drifting with
  // a level's progress must not light the fire the player is meant to light) ·
  // sweeps: GI bounces to redo (0 = direct light only: a clock moving in tiny steps
  // refreshes the bounce light on its own schedule; a lamp or the fire switching still redoes it)
  function applyTime(t, { fromUser = false, keepSwitches = false, sweeps = 3 } = {}) {
    timeT = t;
    const s = sampleKeys(t, keys);
    timeKey = s.key;
    const e = THREE.MathUtils.degToRad(s.elev);
    const h = THREE.MathUtils.degToRad(s.head);
    const dir = new THREE.Vector3(Math.cos(e) * Math.cos(h), -Math.sin(e), Math.cos(e) * Math.sin(h));
    sun.position.copy(sun.target.position).addScaledVector(dir, -18);
    sun.color.copy(s.sun);
    // (the sun stays in the scene at zero: hiding a light changes every shader's
    // light count, and the whole room recompiles — a freeze sliding through evening)
    sun.intensity = s.si;
    const u = room.sky?.uniforms;
    if (u) {
      u.top.value.copy(s.top);
      u.horizon.value.copy(s.hor);
      u.glow.value.copy(s.glow);
      u.treeCol.value.copy(s.tree);
      u.glowZ.value = -0.4 + h * 2.5;
      u.glowY.value = 0.6 + e * 2.2;
    }
    scene.background.copy(s.bg);
    gi.captureBackground.copy(s.dhor);
    const d = room.dome?.uniforms;
    if (d) {
      d.zenith.value.copy(s.zen);
      d.horizonC.value.copy(s.dhor);
      d.ground.value.copy(s.gnd);
    }
    ambient.intensity = s.amb + (layers.gi ? 0 : 0.35);
    post.exposure.value = s.exp;

    let switched = false;
    const lampSide = t >= LAMP_ON_T;
    if (lampSide !== lastLampSide) {
      // (a lamp that's lit all day — the neon alley's signs — is only ever switched on: at dusk,
      // or when the room first comes up; the morning leaves it as it is)
      if (!keepSwitches) for (const l of fixtures.lamps) if (!l.allDay || lampSide || lastLampSide === null) l.target = lampSide || l.allDay ? 1 : 0;
      switched = !keepSwitches && lastLampSide !== null;
      lastLampSide = lampSide;
    }
    const fireSide = t >= FIRE_ON_T;
    if (fireSide !== lastFireSide) {
      if (!keepSwitches) room.setFire?.(fireSide && fireAllowed);
      switched ||= !keepSwitches && lastFireSide !== null;
      lastFireSide = fireSide;
    }
    renderer.shadowMap.needsUpdate = true;
    const n = switched ? Math.max(3, sweeps) : sweeps;
    if (n > 0) {
      gi.invalidate(n, fromUser ? 0.55 : 1);
      envDirty = true; // (direct-light-only steps leave the reflections for the next GI step)
    }
  }

  // something the probes can see changed colour or brightness (paint, a lamp);
  // soft = blend into the old lighting, false = jump (scene setup behind a fade)
  function bounceChanged(soft = true) {
    gi.invalidate(3, soft ? 0.55 : 1);
    envDirty = true;
  }

  // furniture moved: shadows always; bounce light + reflections when the probes can see it
  function lightingChanged({ gi: bounce = true, soft = true } = {}) {
    renderer.shadowMap.needsUpdate = true;
    for (const l of cubeShadows) l.shadow.needsUpdate = true;
    if (!bounce) return;
    gi.setBlockers([...decor.blockers(), ...(room.blockers ?? [])]);
    bounceChanged(soft);
  }

  // lamp / fire under the pointer: switch it. true = switched · 'locked' = the
  // fire may not be lit yet · false = nothing there
  const ray = new THREE.Raycaster();
  ray.layers.enableAll(); // the candles live on LAYER_MAIN_ONLY
  const lockedFns = []; // told when someone tries the fire while it may not be lit (why: the level says)
  function toggleAt(ndc) {
    ray.setFromCamera(ndc, camera);
    const fire = room.clickTargets?.fire ?? [];
    const targets = [...fire, ...fixtures.lamps.flatMap((l) => l.targets)];
    const hit = ray.intersectObjects(targets, false).find((h) => h.object.visible && !h.object.parent?.parent?.userData?.stored);
    if (!hit) return false;
    if (fire.includes(hit.object)) {
      if (!fireAllowed) {
        for (const fn of lockedFns) fn();
        return 'locked';
      }
      room.setFire(!room.fireOn);
    } else {
      const lamp = fixtures.lamps.find((l) => l.targets.includes(hit.object));
      lamp.target = lamp.target > 0.5 ? 0 : 1;
    }
    bounceChanged();
    return true;
  }

  // ---- boot ---------------------------------------------------------------------------
  let ready = false;
  let converged = false;
  let warming = false; // shaders compiling after the first converged lighting
  let onProgress = () => {};
  const readyFns = [];
  // layout / time / wallColor: a saved room, applied before the first GI pass
  async function boot({ wallColor, progress, layout, time: t0 } = {}) {
    if (progress) onProgress = progress;
    if (t0 !== undefined && !Q.has('t')) timeT = t0;
    const props = await R.loadProps((f) => onProgress(f * 0.6, 'models'));
    await R.ready?.();
    const seen = new Map();
    for (const { e, obj } of props) {
      const n = seen.get(e.id) ?? 0;
      seen.set(e.id, n + 1);
      decor.adopt(obj, {
        id: n ? `${e.id}#${n + 1}` : e.id,
        ry: e.ry ?? 0,
        big: !!e.big,
        block: !!e.big && e.block !== false,
        wall: e.yc !== undefined,
        small: !e.big,
        boards: e.boards,
      });
    }
    // the floor lamp stands on the floor; the table lamp and the candles go on things
    // (a lamp may say how it's handled: adopt = decorate.js options; the default is level 1's lamps)
    // (adopt: false = part of the building, not something to move: the neon alley's lantern outside)
    for (const l of fixtures.lamps) if (l.adopt !== false) decor.adopt(l.root, { id: `lamp:${l.name}`, ...(l.adopt ?? { big: l.name !== 'candles', small: l.name !== 'floor' }) });
    decor.link(room.surfaces ?? []);
    const defaultLayout = decor.snapshot();
    if (layout) decor.restore(layout);
    gi.setBlockers([...decor.blockers(), ...(room.blockers ?? [])]);
    for (const l of cubeShadows) l.shadow.needsUpdate = true; // the first frames rendered them without furniture
    gi.patchScene(scene);
    if (wallColor) room.paint?.color.set(wallColor);

    applyLayers();
    applyTime(timeT);
    for (const l of fixtures.lamps) l.on = l.target;
    room.update?.(0, 0);

    // initial convergence: 4 bounces, full weight, spread over frames
    gi.invalidate(4, 1);
    onProgress(0.6, 'gi');
    ready = true;
    return { defaultLayout };
  }

  // ---- loop -----------------------------------------------------------------------------
  const frameFns = [];
  const afterRender = [];
  const timer = new THREE.Timer();
  let time = 0;
  let frames = 0;
  let fpsT = 0;
  let fps = 0;
  let wasBusy = false;
  // ?still freezes everything that flickers or drifts (fire, candles, floating
  // bricks, dust) so two screenshots of the same scene diff to ~zero
  const STILL = Q.has('still');
  function frame(ts) {
    timer.update(ts);
    const dt = Math.min(timer.getDelta(), 0.05);
    time += dt;
    for (const fn of frameFns) fn(dt, time);
    controls.update();
    const fxDt = STILL ? 0 : dt;
    const fxT = STILL ? 1 : time;
    room.update?.(fxDt, fxT, STILL);
    fixtures.update(fxDt, fxT, STILL, timeT); // (+ the time of day: the neon alley's signs are dimmer by day)
    dust.userData.update(fxDt, renderer.domElement.height);
    if (decor.update(dt)) {
      // held/landing things cast moving shadows: the sun's every frame, lit cube
      // shadows ~7×/s (unlit ones catch up when the thing lands)
      renderer.shadowMap.needsUpdate = true;
      cubeClock -= dt;
      if (cubeClock <= 0) {
        cubeClock = 0.15;
        for (const l of cubeShadows) if (l.intensity > 0.01) l.shadow.needsUpdate = true;
      }
    }

    if (ready) {
      // bake-time fire: average brightness, not the flicker
      const fl = room.fireLight;
      const fireNow = fl?.intensity;
      if (fl) fl.intensity = room.fireGI();
      gi.update(converged ? giBudget : 24);
      if (fl) fl.intensity = fireNow;
      if (!converged) {
        const total = gi.count * 4;
        const doneN = gi.sweepsDone * gi.count + gi.cursor;
        onProgress(0.6 + (doneN / total) * 0.4, 'gi');
      }
      if (wasBusy && !gi.busy) envDirty = true;
      wasBusy = gi.busy;
      envAge += dt;
      if (envDirty && (!gi.busy || (converged && envEvery > 0 && envAge >= envEvery))) {
        captureEnv();
        envDirty = false;
        envAge = 0;
        if (!converged && !warming) {
          warming = true;
          precompile().then(() => {
            converged = true;
            window.__ready = true;
            for (const fn of readyFns) fn();
          });
        }
      }
    }

    composer.render(dt);
    // read the canvas in the same task it was drawn (no preserveDrawingBuffer needed)
    for (const fn of afterRender.splice(0)) fn();

    frames++;
    fpsT += dt;
    if (fpsT > 0.5) {
      fps = Math.round(frames / fpsT);
      frames = 0;
      fpsT = 0;
    }
    requestAnimationFrame(frame);
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = fitFov();
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  frame();

  return {
    THREE, renderer, scene, camera, controls, sun, room, fixtures, decor, gi, post, dust, layers,
    // the room module and what a level can work on in it (src/rooms/meadow.js)
    module: R,
    bounds: ROOM,
    sites: R.sites ?? {},
    cams,
    boot,
    applyTime,
    applyLayers,
    setCam,
    fitFov,
    lightingChanged,
    bounceChanged,
    toggleAt,
    setWallColor(hex) {
      room.paint?.color.set(hex);
      bounceChanged();
    },
    // is a fireplace log under the pointer?
    fireAt(ndc) {
      ray.setFromCamera(ndc, camera);
      return ray.intersectObjects(room.clickTargets?.fire ?? [], false).length > 0;
    },
    setFireAllowed(v, { lit = null } = {}) {
      fireAllowed = v;
      if (!room.setFire) return;
      const on = v && (lit ?? room.fireOn);
      if (on !== room.fireOn) {
        room.setFire(on);
        bounceChanged();
      }
    },
    // render scale (quality setting): above the screen's own = supersampling
    setPixelRatio(pr) {
      renderer.setPixelRatio(pr);
      resize();
    },
    // MSAA on the scene render (0 = off); SMAA runs at the end either way
    setMultisampling(n) { post.composer.multisampling = n; },
    // seconds between reflection captures while the bounce light never settles (0 = only once it does)
    setEnvRefresh(s) { envEvery = s; },
    // GI probe captures per frame after the first convergence (5: a change lands in ~2–3 s)
    setGiBudget(n) { giBudget = n; },
    onFrame(fn) { frameFns.push(fn); },
    onFireLocked(fn) { lockedFns.push(fn); },
    // small things moved this frame (litter, tools): re-render the sun's shadow map
    shadowsDirty() { renderer.shadowMap.needsUpdate = true; },
    // PNG of the next rendered frame (3D only — the DOM UI is not in the canvas)
    capture() {
      return new Promise((res) => afterRender.push(() => renderer.domElement.toBlob(res, 'image/png')));
    },
    // slide the rendered image sideways (fraction of the width), e.g. to make room for the menu
    setViewShift(f) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (Math.abs(f) < 1e-4) camera.clearViewOffset();
      else camera.setViewOffset(w, h, -f * w, 0, w, h);
    },
    onReady(fn) { if (converged) fn(); else readyFns.push(fn); },
    get ready() { return ready; },
    get converged() { return converged; },
    get time() { return timeT; },
    get timeKey() { return timeKey; },
    get fps() { return fps; },
  };
}
