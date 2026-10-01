import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from './gi.js';
import { mulberry } from './atmos.js';

// Litter on the floor + the gesture that clears it (after Hozy): press on a piece,
// drag over others and they gather into a ball floating under the cursor; let go
// over the bin and they arc into it, anywhere else and they tumble back down.
// Pieces are procedural (paper balls, newspaper, cans, bottles, leaves, card) and
// live on LAYER_MAIN_ONLY — too small to matter to the GI probes.

const G = 9.8;
const REACH = 0.3;     // gather radius around the cursor on the floor, metres
const HOVER_PX = 30;   // how close (screen px) the cursor must be to grab a piece
const BALL_Y = 0.42;   // the gathered ball floats this high over the floor
const BIN_R = 0.19;
const BIN_PX = 70;     // pointing this close to the bin's mouth (or at the bin) snaps the ball over it
const SIZE = 1.35;     // litter is drawn a little larger than life so it reads from the diorama camera

// ---- shared looks ---------------------------------------------------------------------
function newsprint() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 180;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e3d4';
  g.fillRect(0, 0, 256, 180);
  g.fillStyle = '#3b3833';
  g.fillRect(14, 12, 228, 16);
  g.fillStyle = '#8d877b';
  for (let col = 0; col < 3; col++) {
    for (let y = 40; y < 168; y += 7) {
      const w = 64 - ((y * 13 + col * 7) % 17);
      g.fillRect(14 + col * 78, y, w, 3);
    }
  }
  g.fillStyle = '#b9b2a3';
  g.fillRect(92, 44, 70, 46);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function crumple(geo, rand, amt) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + (rand() - 0.5) * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.05);
  s.bezierCurveTo(0.03, -0.03, 0.035, 0.02, 0, 0.06);
  s.bezierCurveTo(-0.035, 0.02, -0.03, -0.03, 0, -0.05);
  return s;
}

function makeKinds() {
  const rand = mulberry(99);
  const paper = [0xefe9dc, 0xe6d9bf, 0xf2eee6].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
  const news = new THREE.MeshStandardMaterial({ map: newsprint(), roughness: 0.9, side: THREE.DoubleSide });
  const cans = [0xb73a2e, 0x2f7f86, 0xd9a634, 0x4f8a3a, 0xc9ccd0].map((c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.65, roughness: 0.35 }));
  const glass = [0x5a3514, 0x2d5a3a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.12, metalness: 0.1 }));
  const leaves = [0xb7652a, 0x9a5a22, 0xc98a3a, 0x7a5a2a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide }));
  const card = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.95 });

  const bottleGeo = (() => {
    const pts = [[0, 0], [0.034, 0], [0.036, 0.004], [0.036, 0.15], [0.03, 0.18], [0.014, 0.2], [0.013, 0.26], [0.016, 0.265], [0, 0.265]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    // lying on its side: axis along x, resting on its belly
    return new THREE.LatheGeometry(pts, 20).rotateZ(-Math.PI / 2).translate(-0.13, 0.036, 0);
  })();
  const canGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.122, 18).rotateZ(Math.PI / 2).translate(0, 0.033, 0);
  const cardGeo = new THREE.BoxGeometry(0.3, 0.012, 0.22).translate(0, 0.006, 0);

  return {
    paper: () => {
      const r = 0.042 + rand() * 0.025;
      const geo = crumple(new THREE.IcosahedronGeometry(r, 1), rand, 0.55).translate(0, r * 0.85, 0);
      return new THREE.Mesh(geo, paper[Math.floor(rand() * paper.length)]);
    },
    news: () => {
      const geo = new THREE.PlaneGeometry(0.34, 0.24, 6, 4).rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, 0.004 + Math.abs(Math.sin(p.getX(i) * 9 + rand())) * 0.018 + rand() * 0.008);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, news);
    },
    can: () => new THREE.Mesh(canGeo, cans[Math.floor(rand() * cans.length)]),
    bottle: () => new THREE.Mesh(bottleGeo, glass[Math.floor(rand() * glass.length)]),
    leaves: () => {
      const grp = new THREE.Group();
      const n = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const geo = new THREE.ShapeGeometry(leafShape(), 6).rotateX(-Math.PI / 2);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setY(i, Math.abs(p.getX(i)) * 0.25 + 0.003);
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, leaves[Math.floor(rand() * leaves.length)]);
        m.position.set((rand() - 0.5) * 0.14, 0.002 * k, (rand() - 0.5) * 0.14);
        m.rotation.y = rand() * Math.PI * 2;
        m.scale.setScalar(0.8 + rand() * 0.5);
        grp.add(m);
      }
      return grp;
    },
    card: () => new THREE.Mesh(cardGeo, card),
  };
}

// a galvanised bin, origin at the centre of its base
export function makeBin() {
  const g = new THREE.Group();
  g.name = 'bin';
  const metal = new THREE.MeshStandardMaterial({ color: 0x939c9f, metalness: 0.55, roughness: 0.4 });
  const inside = new THREE.MeshStandardMaterial({ color: 0x2c3032, roughness: 0.8, side: THREE.BackSide });
  const H = 0.52;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(BIN_R, BIN_R * 0.86, H, 32, 1, true).translate(0, H / 2, 0), metal);
  const liner = new THREE.Mesh(new THREE.CylinderGeometry(BIN_R * 0.98, BIN_R * 0.84, H, 32, 1, true).translate(0, H / 2, 0), inside);
  const base = new THREE.Mesh(new THREE.CircleGeometry(BIN_R * 0.86, 32).rotateX(-Math.PI / 2).translate(0, 0.01, 0), inside);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(BIN_R, 0.009, 8, 40).rotateX(Math.PI / 2).translate(0, H, 0), metal);
  const band = new THREE.Mesh(new THREE.TorusGeometry(BIN_R * 0.93, 0.006, 6, 40).rotateX(Math.PI / 2).translate(0, H * 0.35, 0), metal);
  for (const m of [body, liner, base, rim, band]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.userData.top = H;
  return g;
}

// pieces: seeded scatter over the floor · bin: the bin's holder (moves with decor)
// onBinned(ids): a ball went into the bin (the level's journal) · pick / carry / toBin:
// the timelapse gathering recorded pieces without a pointer · kinds: a level's own litter,
// (rand) => ({ name: () => mesh }) — a mesh standing on y = 0 · blownIn: kinds that lie
// near the windows (the left wall)
export function createTrash(scene, { camera, bounds, avoid = [], counts, seed = 7, getBin, onBinned = () => {}, kinds: extra = null, blownIn = ['leaves'] }) {
  const group = new THREE.Group();
  group.name = 'trash';
  scene.add(group);
  const kinds = { ...makeKinds(), ...(extra?.(mulberry(seed + 50)) ?? {}) };
  const rand = mulberry(seed);
  const pieces = [];
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const v = new THREE.Vector3();

  const blocked = (x, z, pad) => avoid.some((b) => x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad);
  function spot(kind) {
    for (let k = 0; k < 40; k++) {
      // leaves blow in through the windows on the left wall
      const x = blownIn.includes(kind)
        ? bounds.x0 + 0.25 + rand() * 1.6
        : THREE.MathUtils.lerp(bounds.x0 + 0.3, bounds.x1 - 0.3, rand());
      const z = THREE.MathUtils.lerp(bounds.z0 + 0.3, bounds.z1 - 0.3, rand());
      if (!blocked(x, z, 0.12)) return [x, z];
    }
    return [0, 0];
  }

  for (const [kind, n] of Object.entries(counts)) {
    for (let k = 0; k < n; k++) {
      const mesh = kinds[kind]();
      const [x, z] = spot(kind);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = rand() * Math.PI * 2;
      mesh.scale.setScalar(SIZE);
      mesh.traverse((o) => {
        o.layers.set(LAYER_MAIN_ONLY);
        if (o.isMesh) o.castShadow = o.receiveShadow = true;
      });
      group.add(mesh);
      pieces.push({ i: pieces.length, kind, mesh, state: 'floor', vy: 0, spin: new THREE.Vector3(), off: new THREE.Vector3(), t: 0 });
    }
  }

  let ball = null; // { anchor: Vector3, members: [] }
  let moving = 0;
  let binnedNow = 0; // pieces that entered the bin since the last read (for sounds)

  function floorAt(ndc) {
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, v) ? v.clone() : null;
  }

  // nearest loose piece to the cursor on screen, if within HOVER_PX
  function hit(ndc) {
    let best = null;
    let bd = HOVER_PX;
    const w = window.innerWidth / 2;
    const h = window.innerHeight / 2;
    for (const p of pieces) {
      if (p.state !== 'floor') continue;
      v.copy(p.mesh.position).setY(0.03).project(camera);
      const d = Math.hypot((v.x - ndc.x) * w, (v.y - ndc.y) * h);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  function join(p) {
    p.state = 'held';
    ball.members.push(p);
    // spread members over a shell that grows with the ball
    const n = ball.members.length;
    const r = 0.05 + 0.04 * Math.cbrt(n);
    p.off.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(r * (0.5 + rand() * 0.5));
    p.spin.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(6);
  }

  function binTarget() {
    const b = getBin?.();
    if (!b) return null;
    const p = b.getWorldPosition(new THREE.Vector3());
    return { x: p.x, z: p.z, top: b.children[0]?.userData.top ?? 0.52 };
  }

  function overBin() {
    const b = binTarget();
    if (!b || !ball) return null;
    return ball.snap || Math.hypot(ball.anchor.x - b.x, ball.anchor.z - b.z) < BIN_R + 0.2 ? b : null;
  }

  // players point *at* the bin, whose body hides the floor behind it: a ray hit on
  // the bin, or a cursor near its mouth on screen, counts as "over the bin"
  function aimsAtBin(ndc) {
    const holder = getBin?.();
    const b = binTarget();
    if (!holder || !b) return false;
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(holder, true).length) return true;
    v.set(b.x, b.top, b.z).project(camera);
    return Math.hypot((v.x - ndc.x) * window.innerWidth / 2, (v.y - ndc.y) * window.innerHeight / 2) < BIN_PX;
  }

  return {
    group,
    pieces,
    get total() { return pieces.length; },
    get binned() { return pieces.filter((p) => p.state === 'binned').length; },
    get progress() { return pieces.length ? this.binned / pieces.length : 1; },
    get holding() { return !!ball; },
    get overBin() { return !!overBin(); },
    get count() { return ball?.members.length ?? 0; },
    takeBinned() { const n = binnedNow; binnedNow = 0; return n; },
    hit,

    begin(ndc) {
      const first = hit(ndc);
      const at = floorAt(ndc);
      if (!first || !at) return false;
      ball = { anchor: at.setY(BALL_Y), members: [] };
      join(first);
      return true;
    },
    move(ndc) {
      if (!ball) return 0;
      ball.snap = aimsAtBin(ndc);
      if (ball.snap) {
        const b = binTarget();
        ball.anchor.set(b.x, b.top + 0.22, b.z);
        return 0;
      }
      const at = floorAt(ndc);
      if (!at) return 0;
      ball.anchor.set(at.x, BALL_Y, at.z);
      let added = 0;
      for (const p of pieces) {
        if (p.state !== 'floor') continue;
        if (Math.hypot(p.mesh.position.x - at.x, p.mesh.position.z - at.z) < REACH) {
          join(p);
          added++;
        }
      }
      return added;
    },
    // let go: into the bin if over it, otherwise back onto the floor
    end() {
      if (!ball) return { binned: false, n: 0 };
      const b = overBin();
      const n = ball.members.length;
      ball.members.forEach((p, k) => {
        if (b) {
          p.state = 'flying';
          p.t = -k * 0.035; // a short trickle rather than one lump
          p.from = p.mesh.position.clone();
          p.to = new THREE.Vector3(b.x + (rand() - 0.5) * 0.08, b.top - 0.05, b.z + (rand() - 0.5) * 0.08);
        } else {
          p.state = 'falling';
          p.vy = 0;
          p.mesh.position.x += (rand() - 0.5) * 0.1;
          p.mesh.position.z += (rand() - 0.5) * 0.1;
        }
      });
      if (b) onBinned(ball.members.map((p) => p.i));
      ball = null;
      return { binned: !!b, n };
    },
    // piece i into the ball (a new ball if there's none), the ball where it lay
    pick(i, at) {
      const p = pieces[i];
      if (!p || p.state !== 'floor') return false;
      if (!ball) ball = { anchor: new THREE.Vector3(), members: [] };
      ball.anchor.set(at.x, BALL_Y, at.z);
      join(p);
      return true;
    },
    carry(at) { ball?.anchor.set(at.x, BALL_Y, at.z); },
    // over the bin: end() then drops it in
    toBin() {
      const b = binTarget();
      if (!ball || !b) return;
      ball.snap = true;
      ball.anchor.set(b.x, b.top + 0.22, b.z);
    },
    get bin() { return binTarget(); },

    update(dt) {
      moving = 0;
      for (const p of pieces) {
        const m = p.mesh;
        if (p.state === 'held') {
          moving++;
          const target = v.copy(ball.anchor).add(p.off);
          m.position.lerp(target, 1 - Math.exp(-dt * 14));
          m.rotation.x += p.spin.x * dt;
          m.rotation.y += p.spin.y * dt;
          m.rotation.z += p.spin.z * dt;
        } else if (p.state === 'falling') {
          moving++;
          p.vy -= G * dt;
          m.position.y += p.vy * dt;
          m.rotation.x *= 1 - Math.min(1, dt * 6);
          m.rotation.z *= 1 - Math.min(1, dt * 6);
          if (m.position.y <= 0) {
            m.position.y = 0;
            if (p.vy < -1) p.vy *= -0.25;
            else {
              p.state = 'floor';
              m.rotation.x = m.rotation.z = 0;
            }
          }
        } else if (p.state === 'flying') {
          moving++;
          p.t += dt / 0.42;
          if (p.t < 0) continue;
          const k = Math.min(1, p.t);
          m.position.lerpVectors(p.from, p.to, k);
          m.position.y += Math.sin(k * Math.PI) * 0.35;
          m.scale.setScalar(SIZE * (1 - k * 0.3));
          if (k >= 1) {
            p.state = 'binned';
            m.visible = false;
            binnedNow++;
          }
        }
      }
      return moving > 0;
    },

    // { i: [x, z, ry] } for pieces still in the room; binned ones are left out
    serialize() {
      const out = {};
      for (const p of pieces) {
        if (p.state === 'binned') continue;
        const r = (x) => Math.round(x * 1000) / 1000;
        out[p.i] = [r(p.mesh.position.x), r(p.mesh.position.z), r(p.mesh.rotation.y)];
      }
      return out;
    },
    restore(state) {
      ball = null;
      for (const p of pieces) {
        const s = state?.[p.i];
        p.mesh.scale.setScalar(SIZE);
        p.mesh.rotation.set(0, s ? s[2] : p.mesh.rotation.y, 0);
        if (!s) {
          p.state = 'binned';
          p.mesh.visible = false;
          continue;
        }
        p.state = 'floor';
        p.mesh.visible = true;
        p.mesh.position.set(s[0], 0, s[1]);
      }
    },
    // everything gone (finished room / screenshots)
    clearAll() { this.restore({}); },
  };
}
