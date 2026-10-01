import * as THREE from 'three';
import { LAYER_MAIN_ONLY } from '../../gi.js';
import { surfaceTool, mat, toMain } from '../../tools/surfaceTools.js';
import { t } from '../../i18n.js';

// Level 5's twist: the stained-glass lancet (src/rooms/castle/glass.js). Years ago half its
// panes broke and were stuffed with rags; what glass is left is filthy. The window throws the
// room's evening sun as coloured light — each pane its own patch on the floor (a real light:
// the GI probes bounce it) — so every rag pulled out and every pane set in lights a new patch
// straight away, and the squeegee on the grime brightens them all (the grime mask dims the
// light: glass.setGrime). The glazier's tool is swept over the window: each rag it passes pops
// out and tumbles into the room, and a new piece of glass flashes in.
//
//   createGlazing(world, { L, journal, sound, rub, note }) → a level system (level.js):
//   progress · mended / total · tool · complete() · (fresh / finished / serialize / restore)
// (the bounce light follows by itself: the tool asks for it as it works, like every surface tool)

// the panes stuffed with rags at the start (the rest have their grimy old glass)
const PLUGGED = [0, 2, 4, 5, 6, 8, 10, 11, 12, 14, 16];
const RAG_T = 0.7; // seconds a rag tumbles before it's gone

// the glazier's piece of glass in hand (local +z = away from the window): a lozenge of coloured
// glass in its lead came, held by a little wooden handle
function glassModel() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, 0.09);
  s.lineTo(0.06, 0);
  s.lineTo(0, -0.09);
  s.lineTo(-0.06, 0);
  s.closePath();
  const pane = new THREE.Mesh(new THREE.ShapeGeometry(s), mat(0xf0352c, { roughness: 0.2, emissive: 0xf0352c, emissiveIntensity: 0.6 }));
  pane.position.z = 0.012;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.007, 4, 4), mat(0x3a3632, { metalness: 0.5, roughness: 0.5 }));
  rim.scale.set(0.8, 1.2, 1);
  rim.position.z = 0.012;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.16, 8), mat(0x9a5c34, { roughness: 0.7 }));
  handle.position.set(0, -0.15, 0.05);
  handle.rotation.x = -0.4;
  g.add(pane, rim, handle);
  g.userData.pane = pane.material;
  g.scale.setScalar(1.5); // (big enough to read against the window from the usual camera)
  return toMain(g);
}

export function createGlazing(world, { L, journal, sound = () => {}, rub, note = () => {} }) {
  const { room, scene } = world;
  const glass = room.glass;
  const { panes } = glass;
  // the grime on this window (grime.js: the first window site) dims the light it throws
  const win = L.grime?.windows?.[0];
  if (win) glass.setGrime({ mask: win.mask, visible: () => win.mesh.visible });

  // ---- rags tumbling out into the room ------------------------------------------------------------
  const ragMat = new THREE.MeshStandardMaterial({ color: 0x7d6a55, roughness: 1, transparent: true });
  const ragGeo = (() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + Math.sin(i * 12.9898) * 0.25;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  })();
  const pool = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(ragGeo, ragMat.clone());
    m.visible = false;
    m.castShadow = true;
    m.layers.set(LAYER_MAIN_ONLY);
    scene.add(m);
    return { m, t: 1, v: new THREE.Vector3(), spin: new THREE.Vector3() };
  });
  let next = 0;
  const normal = new THREE.Vector3(1, 0, 0); // the window faces into the room (+x)
  function tumble(p) {
    const r = pool[next++ % pool.length];
    const [s, tt] = glass.centreOf(p);
    glass.toWorld(s, tt, r.m.position).addScaledVector(normal, 0.05);
    r.m.scale.setScalar(0.06);
    r.m.visible = true;
    r.m.material.opacity = 1;
    r.t = 0;
    r.v.set(0.9 + Math.random() * 0.4, 0.8, (Math.random() - 0.5) * 0.6);
    r.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
  }

  // ---- mending ------------------------------------------------------------------------------------------
  // (counted over the panes that were stuffed with rags: the task is those, the rest was only dirty)
  const mended = () => PLUGGED.filter((i) => panes[i].on).length;
  function nextColour() {
    const p = panes.find((q) => !q.on);
    if (!p) return;
    model.userData.pane.color.set(p.color);
    model.userData.pane.emissive.set(p.color);
  }
  function mend(p, { quiet = false } = {}) {
    if (p.on) return false;
    glass.set(p.i, true);
    if (quiet) return true;
    glass.flash(p.i);
    tumble(p);
    sound('click', { gain: 0.55, rate: 1.7 + Math.random() * 0.3 });
    nextColour();
    if (panes.every((q) => q.on)) {
      // whole again: say what's still keeping the colours dim, if anything
      const dirty = win && win.mesh.visible;
      setTimeout(() => note(t(dirty ? 'hint.castle.glassDirty' : 'hint.castle.glassDone')), 900);
    }
    return true;
  }

  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  const model = glassModel();
  const tool = surfaceTool(world, {
    id: 'glazier',
    rub,
    rec: journal.surface('glaze', { itemOf: () => 0 }),
    rubKind: 'glass',
    hint: () => 'hint.glazier',
    model,
    offset: 0.03,
    spacing: 2,
    // the window's glass only (whatever stone is in front of it from this angle)
    find: (ndc) => {
      ray.setFromCamera(ndc, world.camera);
      const h = ray.intersectObject(glass.mesh, false)[0];
      if (!h) return null;
      const [s, tt] = glass.toWindow(h.point);
      return { item: 'glass', point: h.point.clone(), normal: normal.clone(), px: s * 100, py: tt * 100 };
    },
    target: () => ({ item: 'glass', normal: normal.clone() }),
    work: (h, px, py) => {
      const p = glass.paneAt(px / 100, py / 100);
      return !!p && mend(p);
    },
  });
  tool.icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V10a6 6 0 0 1 12 0v11z"/><path d="M6 15h12M12 4v17M6 10.5h12"/></svg>';

  const sys = {
    tool,
    panes,
    get total() { return PLUGGED.length; },
    get mended() { return mended(); },
    get progress() { return mended() / PLUGGED.length; },
    // the window as a list of rags left (the title timelapse sweeps over these)
    get plugged() { return panes.filter((p) => !p.on); },
    fresh() {
      glass.setAll((p) => !PLUGGED.includes(p.i));
      for (const r of pool) {
        r.m.visible = false;
        r.t = 1;
      }
      nextColour();
    },
    finished() { glass.setAll(true); },
    complete() { for (const p of panes) mend(p, { quiet: true }); },
    serialize: () => panes.map((p) => (p.on ? 1 : 0)),
    restore(s) {
      glass.setAll((p) => (Array.isArray(s) ? !!s[p.i] : true));
      nextColour();
    },
    // true while a rag is in the air (its shadow moves)
    update(dt) {
      let moving = false;
      for (const r of pool) {
        if (r.t >= 1) continue;
        r.t = Math.min(1, r.t + dt / RAG_T);
        r.v.y -= 4.5 * dt;
        r.m.position.addScaledVector(r.v, dt);
        if (r.m.position.y < 0.05) {
          r.m.position.y = 0.05;
          r.v.multiplyScalar(0.4);
        }
        r.m.rotation.x += r.spin.x * dt;
        r.m.rotation.y += r.spin.y * dt;
        r.m.scale.setScalar(0.06 * (1 - r.t * r.t * 0.8));
        r.m.material.opacity = 1 - Math.max(0, (r.t - 0.6) / 0.4);
        if (r.t >= 1) r.m.visible = false;
        moving = true;
      }
      return moving;
    },
  };
  return sys;
}
