import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from './gi.js';

// Moving boxes for the unpacking phase. Each box is a furniture-layer entry (it
// stands on the floor, things bump into it, a drag moves it) holding a queue of
// packed entries; a click takes the next one out, straight into the hand. The
// label says what's inside (a marker drawing, no words) and how many are left.
// An empty box folds away. The put-aside box collects whatever is carried out of
// the room — it shows up when there is something in it, and doesn't have to be
// emptied to finish.

const INK = '#4a3422';

// marker drawings, 120×120, top-left at (0, 0)
const ICONS = {
  furniture(g) {
    g.strokeRect(22, 30, 76, 34); // back
    g.strokeRect(14, 58, 92, 24); // seat
    g.strokeRect(8, 50, 16, 36);
    g.strokeRect(96, 50, 16, 36);
    g.beginPath();
    g.moveTo(20, 86); g.lineTo(20, 98); g.moveTo(100, 86); g.lineTo(100, 98);
    g.stroke();
  },
  lights(g) {
    g.beginPath();
    g.moveTo(38, 16); g.lineTo(82, 16); g.lineTo(96, 52); g.lineTo(24, 52); g.closePath();
    g.moveTo(60, 52); g.lineTo(60, 96);
    g.moveTo(38, 100); g.lineTo(82, 100);
    g.stroke();
    g.beginPath();
    g.arc(60, 60, 6, 0, Math.PI * 2);
    g.stroke();
  },
  books(g) {
    g.strokeRect(14, 26, 20, 76);
    g.strokeRect(38, 18, 22, 84);
    g.strokeRect(64, 30, 18, 72);
    g.save();
    g.translate(92, 102);
    g.rotate(-0.35);
    g.strokeRect(0, -74, 18, 74);
    g.restore();
    g.beginPath();
    g.moveTo(8, 104); g.lineTo(114, 104);
    g.stroke();
  },
  decor(g) {
    g.beginPath();
    g.moveTo(48, 20); g.lineTo(72, 20);
    g.bezierCurveTo(72, 34, 92, 46, 90, 72);
    g.bezierCurveTo(88, 96, 72, 104, 60, 104);
    g.bezierCurveTo(48, 104, 32, 96, 30, 72);
    g.bezierCurveTo(28, 46, 48, 34, 48, 20);
    g.stroke();
    g.beginPath();
    g.moveTo(36, 64); g.bezierCurveTo(50, 58, 70, 70, 84, 64);
    g.stroke();
  },
  plants(g) {
    g.beginPath();
    g.moveTo(34, 70); g.lineTo(86, 70); g.lineTo(78, 106); g.lineTo(42, 106); g.closePath();
    g.stroke();
    const leaf = (x0, y0, x1, y1, bend) => {
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2 - Math.abs(bend), x1, y1);
      g.quadraticCurveTo((x0 + x1) / 2 - bend, (y0 + y1) / 2 + Math.abs(bend) * 0.4, x0, y0);
      g.stroke();
    };
    leaf(60, 70, 60, 14, 16);
    leaf(58, 70, 22, 34, -12);
    leaf(62, 70, 100, 36, 12);
  },
  frames(g) {
    g.strokeRect(16, 18, 88, 84);
    g.strokeRect(28, 30, 64, 60);
    g.beginPath();
    g.moveTo(30, 86); g.lineTo(50, 60); g.lineTo(62, 74); g.lineTo(72, 64); g.lineTo(90, 86);
    g.stroke();
    g.beginPath();
    g.arc(74, 44, 7, 0, Math.PI * 2);
    g.stroke();
  },
  lost(g) {
    // a heart: kept for later
    g.beginPath();
    g.moveTo(60, 100);
    g.bezierCurveTo(10, 66, 16, 22, 44, 24);
    g.bezierCurveTo(54, 24, 60, 34, 60, 40);
    g.bezierCurveTo(60, 34, 66, 24, 76, 24);
    g.bezierCurveTo(104, 22, 110, 66, 60, 100);
    g.stroke();
  },
};

function drawLabel(g, kind, n) {
  const W = 256;
  const H = 160;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#f1e4c6';
  g.beginPath();
  g.roundRect(6, 6, W - 12, H - 12, 14);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.save();
  g.translate(18, 20);
  ICONS[kind]?.(g);
  g.restore();
  g.fillStyle = INK;
  g.font = 'bold 62px "Mali", "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`×${n}`, 196, 84);
}

const SIZES = { big: { w: 0.64, h: 0.46, d: 0.5 }, small: { w: 0.5, h: 0.34, d: 0.4 }, lost: { w: 0.46, h: 0.3, d: 0.38 } };

// an open carton with drooping flaps and a label on the front; the flaps are
// kept apart (`lids`) so they can join after the footprint is measured — they
// hang out past the carton and would make every box a lot harder to get round
function makeBox(kind, size, shade, gi) {
  const { w, h, d } = size;
  const g = new THREE.Group();
  g.name = `box-${kind}`;
  const card = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xb68a58).multiplyScalar(shade), roughness: 0.92 });
  // the inside reads as a shadowed hole whatever the light (unlit)
  const inner = new THREE.MeshBasicMaterial({ color: 0x2e2015 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), card);
  body.position.y = h / 2;
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.97, d * 0.97).rotateX(-Math.PI / 2), inner);
  mouth.position.y = h + 0.002;
  g.add(body, mouth);

  // the label: one canvas, shown on the front and the right-hand flap (the sides
  // the usual camera sees)
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const cg = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const labelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });

  // flaps hang open down the sides; each is hinged at the rim and extends along
  // (ox, oz) before it drops. A label sits on the outer face, top towards the hinge.
  const lids = new THREE.Group();
  const flap = (len, width, ox, oz, drop, label) => {
    const pivot = new THREE.Group();
    pivot.position.set(ox * w / 2, h, oz * d / 2);
    pivot.rotation.set(oz * drop, 0, -ox * drop);
    const m = new THREE.Mesh(new THREE.BoxGeometry(ox ? len : width, 0.006, oz ? len : width), card);
    m.position.set(ox * len / 2, 0, oz * len / 2);
    pivot.add(m);
    if (label) {
      const lw = Math.min(width * 0.62, len * 0.92 / 0.625);
      const geo = new THREE.PlaneGeometry(lw, lw * 0.625);
      // plane axes → right, up (= back towards the hinge), normal (= the flap's outside)
      const up = new THREE.Vector3(-ox, 0, -oz);
      const normal = new THREE.Vector3(0, 1, 0);
      geo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, normal), up, normal));
      const lm = new THREE.Mesh(geo, labelMat);
      lm.position.set(ox * len / 2, 0.0045, oz * len / 2);
      pivot.add(lm);
    }
    lids.add(pivot);
  };
  flap(d * 0.48, w, 0, 1, 1.32, true);
  flap(d * 0.48, w, 0, -1, 1.28, false);
  flap(w * 0.34, d * 0.96, 1, 0, 1.3, true);
  flap(w * 0.34, d * 0.96, -1, 0, 1.25, false);

  for (const part of [g, lids]) {
    part.traverse((o) => {
      o.layers.set(LAYER_MAIN_ONLY);
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        gi.patch(o.material);
      }
    });
  }
  return {
    g,
    lids,
    setCount(n) {
      drawLabel(cg, kind, n);
      tex.needsUpdate = true;
    },
  };
}

// def.boxes: [{ id, big?, icon?, at: [x, z, ry], items: [entry ids] }] · def.lost: [[x, z, ry], ...]
// spots to try · icon: which label drawing (ICONS; default: the id) · def.stay: entries that
// are in the room from the start (never packed — level.js)
export function createBoxes(world, def, { sound = () => {} } = {}) {
  const { decor } = world;
  const mk = (id, size, at, shade, icon = id) => {
    const m = makeBox(icon, size, shade, world.gi);
    m.g.position.set(at[0], 0, at[1]);
    m.g.rotation.y = at[2] ?? 0;
    const e = decor.adopt(m.g, { id: `box:${id}`, ry: at[2] ?? 0 });
    m.g.add(m.lids); // after the footprint was taken from the carton alone
    e.crate = id;
    decor.setStored(e, true);
    return { id, e, m, items: [], total: 0, size, home: at, anim: null };
  };
  const list = def.boxes.map((b, i) => Object.assign(mk(b.id, b.big ? SIZES.big : SIZES.small, b.at, 0.92 + (i % 3) * 0.06, b.icon), { def: b }));
  const lost = mk('lost', SIZES.lost, def.lost[0], 1.05);
  const all = [...list, lost];
  const byId = (id) => decor.entries.find((e) => e.id === id);
  let holding = null; // { e, box }: out of a box, in the hand, not yet put down

  const inBox = (b) => b.items.length + (holding?.box === b ? 1 : 0);
  function show(b, on) {
    b.m.setCount(b.items.length);
    decor.setStored(b.e, !on);
  }
  function fold(b) {
    b.anim = { kind: 'fold', t: 0 };
    sound('box_open', { gain: 0.35, rate: 1.4 });
  }
  function hop(b) { b.anim = { kind: 'hop', t: 0 }; }
  // the put-aside box turns up on the first free spot
  function bringLost() {
    if (!lost.e.stored) return;
    const spots = def.lost;
    const at = spots.find(([x, z, ry]) => decor.fitsFloor(lost.e, x, z, ry ?? 0)) ?? spots[0];
    lost.e.holder.position.set(at[0], 0, at[1]);
    lost.e.holder.rotation.set(0, at[2] ?? 0, 0);
    show(lost, true);
    hop(lost);
  }

  return {
    list,
    lost,
    boxOf: (e) => all.find((b) => b.e === e) ?? null,
    contains: (id) => all.some((b) => b.items.includes(id)) || holding?.e.id === id,
    get holding() { return holding; },
    // things still to unpack (the put-aside box doesn't count)
    get left() { return list.reduce((n, b) => n + inBox(b), 0); },
    get total() { return list.reduce((n, b) => n + b.total, 0); },
    get active() { return all.some((b) => !b.e.stored); },

    // a delivery: every box full, back on its spot
    fill() {
      holding = null;
      for (const b of list) {
        b.items = b.def.items.filter((id) => byId(id));
        b.total = b.items.length;
        b.e.holder.position.set(b.home[0], 0, b.home[1]);
        b.e.holder.rotation.set(0, b.home[2] ?? 0, 0);
        b.e.holder.scale.set(1, 1, 1);
        b.anim = null;
        show(b, b.items.length > 0);
      }
      lost.items = [];
      show(lost, false);
    },
    // no boxes at all (the repairs, or the finished room)
    clear() {
      holding = null;
      for (const b of all) {
        b.items = [];
        b.anim = null;
        b.e.holder.scale.set(1, 1, 1);
        show(b, false);
      }
      for (const b of list) b.total = b.def.items.length;
    },

    // the next thing out of box b, straight into the hand (null: it's empty)
    open(b, ndc) {
      const id = b.items.shift();
      const e = id && byId(id);
      if (!e) return null;
      const at = b.e.holder.position.clone();
      at.y = b.size.h * 0.6;
      decor.grab(e, at, ndc);
      holding = { e, box: b };
      b.m.setCount(b.items.length);
      hop(b);
      return e;
    },
    // the title timelapse's way out of a box (no hand involved): the next id, or null
    take(b) {
      const id = b.items.shift() ?? null;
      b.m.setCount(b.items.length);
      if (id) hop(b);
      return id;
    },
    // the player's timelapse: that very thing out of whichever box has it → the box, or null
    takeOut(id) {
      const b = all.find((x) => x.items.includes(id));
      if (!b) return null;
      b.items.splice(b.items.indexOf(id), 1);
      b.m.setCount(b.items.length);
      hop(b);
      return b;
    },
    foldIfEmpty(b) {
      if (!b.items.length && !b.e.stored && b.anim?.kind !== 'fold') fold(b);
    },
    // let go of it without putting it down: back in its box
    putBack(e) {
      if (holding?.e !== e) return;
      const b = holding.box;
      holding = null;
      b.items.unshift(e.id);
      b.m.setCount(b.items.length);
      if (b.e.stored) show(b, true);
      hop(b);
    },
    // it found a place: an emptied box folds away
    placed(e) {
      if (holding?.e !== e) return;
      const b = holding.box;
      holding = null;
      if (!b.items.length) fold(b);
    },
    // carried out of the room: into the put-aside box
    lose(entries, { quiet = false } = {}) {
      for (const k of entries) if (!lost.items.includes(k.id)) lost.items.push(k.id);
      if (holding && entries.includes(holding.e)) {
        const b = holding.box;
        holding = null;
        if (!b.items.length && b !== lost) fold(b);
      }
      if (lost.e.stored) bringLost();
      else if (!quiet) hop(lost);
      lost.m.setCount(lost.items.length);
    },

    view(t) {
      return list.map((b) => {
        const n = inBox(b);
        return {
          id: `box.${b.id}`,
          label: t('task.box', { name: t(`box.${b.id}`) }),
          p: b.total ? 1 - n / b.total : 1,
          done: n === 0,
          locked: false,
          count: n ? `${b.total - n}/${b.total}` : null,
        };
      });
    },

    // true while a box moves (shadows)
    update(dt) {
      let moving = false;
      for (const b of all) {
        const a = b.anim;
        if (!a) continue;
        moving = true;
        const s = b.e.holder.scale;
        if (a.kind === 'hop') {
          a.t = Math.min(1, a.t + dt / 0.28);
          const k = Math.sin(a.t * Math.PI) * (1 - a.t);
          s.set(1 + k * 0.1, 1 - k * 0.16, 1 + k * 0.1);
        } else {
          a.t = Math.min(1, a.t + dt / 0.38);
          const k = a.t * a.t * (3 - 2 * a.t);
          s.set(1 + k * 0.15, Math.max(0.001, 1 - k), 1 + k * 0.15);
          if (a.t >= 1) {
            show(b, false);
            world.lightingChanged({ gi: false });
          }
        }
        if (a.t >= 1) {
          s.set(1, 1, 1);
          b.anim = null;
        }
      }
      return moving;
    },

    // what's in which box; a thing out of its box but still in the hand counts as in it
    serialize() {
      const items = {};
      for (const b of all) items[b.id] = holding?.box === b ? [holding.e.id, ...b.items] : [...b.items];
      return { items };
    },
    restore(s) {
      holding = null;
      for (const b of all) {
        b.items = (s?.items?.[b.id] ?? []).filter((id) => byId(id));
        b.anim = null;
        b.e.holder.scale.set(1, 1, 1);
        if (b !== lost) b.total = b.def.items.filter((id) => byId(id)).length;
        show(b, b.items.length > 0);
      }
    },
  };
}
