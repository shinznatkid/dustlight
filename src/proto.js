import * as THREE from 'three';
import { createWorld, CAMS, DAWN } from './world.js';
import { createDayCycle, phaseAt } from './daycycle.js';

// Room viewer: stands up one room module (src/rooms/<id>.js) with the game's
// renderer, lighting, GI and post, and nothing else — no level, menus or saves.
// For building and judging a room's look before it becomes a level.
//   proto.html?room=cabin [&t=0.62] [&cam=hero] [&nohud] [&still] (+ every world.js flag)
// Screenshots: node tools/shot.mjs <name> --gpu --page=proto.html --q="room=cabin&nohud&still"
const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const id = Q.get('room') ?? 'meadow';
if (Q.has('nohud')) document.body.classList.add('nohud');

// loaded by name at run time (not a static import), so editing one room's file
// never reloads a viewer that shows another
const R = (await import(/* @vite-ignore */ new URL(`./rooms/${id}.js`, import.meta.url).href)).default;
const world = createWorld(Q, R);
$('roomName').textContent = R.id;
document.title = `${R.id} — room viewer`;

// right-click a lamp to switch it (left drag orbits)
const el = world.renderer.domElement;
el.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  world.toggleAt(ndc);
});

const time = $('time');
time.max = 1 + DAWN;
time.value = world.time;
const syncTime = () => { $('timeName').textContent = world.timeKey; };
time.addEventListener('input', () => {
  world.applyTime(+time.value, { fromUser: true });
  if (cycle.on) {
    cycle.stop();
    cycle.start(); // (the loop goes on from the time picked)
  }
  syncTime();
});

// ---- the day going round by itself (daycycle.js — the game runs the same loop once a
// room's repairs are done) ----
//   ?cycle=<seconds> starts it (tools/daycycle.mjs) · experiments: &light= &gi= &sweeps= &budget=
if (Q.has('budget')) world.setGiBudget(+Q.get('budget'));
const cycle = createDayCycle(world, { length: 120, light: +(Q.get('light') ?? 0.1), gi: +(Q.get('gi') ?? 2), sweeps: +(Q.get('sweeps') ?? 1) });
const day = {
  get on() { return cycle.on; },
  get length() { return cycle.length; },
  get phase() { return phaseAt(world.time); },
};
function setDay(on, length = cycle.length) {
  cycle.length = length;
  if (on) cycle.start();
  else cycle.stop();
  $('dayBtn').textContent = on ? '❚❚ pause' : '▶ day';
}
$('dayBtn').onclick = () => setDay(!cycle.on);
$('dayLen').onchange = (e) => { cycle.length = +e.target.value; };
world.onFrame((dt) => {
  if (!cycle.update(dt)) return;
  time.value = world.time;
  syncTime();
});
for (const name of Object.keys(R.cams ?? CAMS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => world.setCam(name);
  $('cams').append(b);
}

world.onFrame(() => { $('badge').textContent = `${world.fps} fps${world.gi.busy ? ' · GI…' : ''}`; });
await world.boot({ progress: (f) => { $('load').textContent = `loading… ${Math.round(f * 100)}%`; } });
world.onReady(() => {
  $('load').hidden = true;
  syncTime();
  if (Q.has('cycle')) {
    $('dayLen').value = Q.get('cycle');
    setDay(true, +Q.get('cycle'));
  }
});

// (world as the prototype, not spread: its getters — fps, time — stay live)
window.__app = Object.assign(Object.create(world), { THREE, world, room: R, day, setDay });
