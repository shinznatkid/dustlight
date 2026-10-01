import * as THREE from 'three';
import { createMask, clearOf } from './masks.js';
import { LAYER_MAIN_ONLY } from './gi.js';
import { mulberry } from './atmos.js';

// Things to wipe off: grime on the window panes and soot on the fireplace surround.
// Each is a thin see-through sheet whose canvas alpha is the dirt. The window grime
// also *casts* the sun's shadow through an alpha test, so a filthy window really keeps
// the sunlight (and the light shafts, and the bounce light) out of the room — and
// wiping it lets them in. Where they are is the room's (module `sites.windows` /
// `sites.soot`, e.g. src/room.js SITES): a sheet is { at: centre [x, y, z], ry, w, h },
// facing +z turned by ry; the soot's `hole` ({ w, h }, bottom centre) is the fire opening.

export function smudge(g, w, h, rand, { color, alpha, blobs, streaks = 0, clearStreaks = 0 }) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  g.globalAlpha = alpha;
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < blobs; k++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = (0.06 + rand() * 0.22) * Math.max(w, h);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, color);
    grd.addColorStop(1, clearOf(color));
    g.globalAlpha = 0.25 + rand() * 0.4;
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let k = 0; k < streaks; k++) {
    const x = rand() * w;
    g.globalAlpha = 0.2 + rand() * 0.3;
    g.fillStyle = color;
    g.fillRect(x, rand() * h * 0.4, 2 + rand() * 5, h * (0.3 + rand() * 0.6));
  }
  // a few thinner, cleaner runs where rain washed the glass: the sun leaks through
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < clearStreaks; k++) {
    const x = rand() * w;
    g.globalAlpha = 0.65;
    g.fillRect(x, rand() * h * 0.3, 3 + rand() * 6, h * (0.4 + rand() * 0.6));
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
}

// a see-through sheet showing a mask (grime, soot, dust …) — a level's twist can make its own
export function sheet(mask, { castShadow, layer }) {
  const mat = new THREE.MeshStandardMaterial({
    map: mask.tex, transparent: true, depthWrite: false, roughness: 0.95, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.renderOrder = 3;
  if (castShadow) {
    // Shadows can't be half transparent: dirt above 50% blocks the sun, cleaner
    // glass lets it through. three copies the *material's* alphaTest onto the shadow
    // depth material (a customDepthMaterial's own alphaTest is overwritten), so the
    // test lives on the material — and its discard is patched out of the visible
    // shader, where the grime should fade smoothly rather than cut off.
    m.castShadow = true;
    mat.alphaTest = 0.5;
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', '');
    };
    mat.customProgramCacheKey = () => 'grime-no-discard';
  }
  if (layer !== undefined) m.layers.set(layer);
  return m;
}

// a sheet where the site says: the unit plane scaled to w × h, turned by ry
function put(m, site) {
  m.scale.set(site.w, site.h, 1);
  m.rotation.y = site.ry ?? 0;
  m.position.fromArray(site.at);
}
// a point on a site, (u, v) metres from its centre along its width / height
export function sitePoint(site, u, v) {
  const ry = site.ry ?? 0;
  return new THREE.Vector3(site.at[0] + Math.cos(ry) * u, site.at[1] + v, site.at[2] - Math.sin(ry) * u);
}
const siteNormal = (site) => new THREE.Vector3(Math.sin(site.ry ?? 0), 0, Math.cos(site.ry ?? 0));

export function createGrime(scene, { gi, sites = {}, seed = 3 }) {
  const group = new THREE.Group();
  group.name = 'grime';
  scene.add(group);
  const rand = mulberry(seed);

  // ---- windows ------------------------------------------------------------------
  const windows = (sites.windows ?? []).map((w, i) => {
    const mask = createMask(256, 384);
    const m = sheet(mask, { castShadow: true });
    put(m, w);
    m.name = `window-grime-${i}`;
    group.add(m);
    gi.patch(m.material);
    return { mask, mesh: m, w, normal: siteNormal(w) };
  });
  const dirtyWindows = () => {
    for (const win of windows) {
      smudge(win.mask.g, 256, 384, rand, { color: '#6d6352', alpha: 0.82, blobs: 26, streaks: 14, clearStreaks: 5 });
      win.mask.touch();
      win.mask.flush();
      win.mesh.visible = true;
    }
  };

  // ---- soot on the fireplace surround ---------------------------------------------
  // (pixel sizes as level 1's 1.48 × 1.13 m surround: 256 wide, the height to match)
  let soot = null;
  let dirtySoot = () => {};
  if (sites.soot) {
    const S = sites.soot;
    const SW = S.w;
    const SH = S.h;
    const hole = S.hole ?? { w: 0, h: 0 };
    const pw = 256;
    const ph = Math.ceil((pw * SH) / SW);
    const k = pw / 256;
    const opening = (px, py) => {
      // the fire opening is a hole in the surround: nothing to clean there
      const x = (px + 0.5) / pw * SW - SW / 2;
      const y = SH - (py + 0.5) / ph * SH;
      return Math.abs(x) < hole.w / 2 && y < hole.h;
    };
    const sootValid = new Uint8Array(pw * ph);
    for (let py = 0; py < ph; py++) for (let px = 0; px < pw; px++) sootValid[py * pw + px] = opening(px, py) ? 0 : 1;
    soot = { mask: createMask(pw, ph, { valid: sootValid }), site: S, normal: siteNormal(S) };
    soot.mesh = sheet(soot.mask, { castShadow: false, layer: LAYER_MAIN_ONLY });
    put(soot.mesh, S);
    soot.mesh.name = 'soot';
    group.add(soot.mesh);
    gi.patch(soot.mesh.material);
    const holeTop = ph * (1 - hole.h / SH);
    dirtySoot = () => {
      const g = soot.mask.g;
      g.clearRect(0, 0, pw, ph);
      // smoke rises from the top of the opening and licks up the lintel and legs
      for (let n = 0; n < 40; n++) {
        const side = rand() < 0.5 ? -1 : 1;
        const x = pw / 2 + side * (40 + rand() * 60) * k * (rand() < 0.6 ? 1 : 0.2);
        const y = holeTop - rand() * 60 * k + 20 * k;
        const r = (14 + rand() * 34) * k;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(24,18,14,0.85)');
        grd.addColorStop(1, 'rgba(24,18,14,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      for (let n = 0; n < 14; n++) {
        const grd = g.createLinearGradient(0, ph, 0, 60 * k);
        grd.addColorStop(0, 'rgba(30,24,18,0.5)');
        grd.addColorStop(1, 'rgba(30,24,18,0)');
        g.fillStyle = grd;
        const x = (rand() < 0.5 ? 12 + rand() * 50 : 194 + rand() * 50) * k;
        g.fillRect(x, 60 * k, (8 + rand() * 18) * k, ph - 60 * k);
      }
      // that's level 1's surround: a site of another shape (taller, or a hob's back with no
      // opening at all) came out a third to three quarters clean before anyone touched it — so
      // more smoke goes up from where the fire is (the opening's top, else the bottom middle),
      // widening as it rises, until it's as sooty as level 1's (which is left exactly as it was)
      // (by an opening, half of it licks up the jambs, thickest at the top)
      const fy = hole.h > 0 ? holeTop : ph;
      const hw = (hole.w / 2 / SW) * pw;
      for (let n = 0; n < 60; n++) {
        soot.mask.touch();
        if (soot.mask.coverage(70) >= 0.745) break;
        for (let b = 0; b < 6; b++) {
          let x;
          let y;
          let f;
          let r;
          let tall; // smudged upwards: smoke licks, it doesn't spot
          if (hole.h > 0 && rand() < 0.5) {
            f = 0.3;
            x = pw / 2 + (rand() < 0.5 ? -1 : 1) * (hw + rand() * (pw / 2 - hw));
            y = holeTop + rand() ** 1.6 * (ph - holeTop);
            r = (0.03 + rand() * 0.04) * pw;
            tall = 2.6 + rand() * 1.4;
          } else {
            f = rand();
            x = pw / 2 + (rand() - 0.5) * pw * (0.35 + 0.65 * f);
            y = fy * (1 - f) + (rand() - 0.5) * 12 * k;
            r = (0.05 + rand() * 0.09) * pw;
            tall = 1.5;
          }
          g.save();
          g.translate(x, y);
          g.scale(1, tall);
          const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
          grd.addColorStop(0, `rgba(24,18,14,${(0.55 + 0.3 * (1 - f)).toFixed(2)})`);
          grd.addColorStop(1, 'rgba(24,18,14,0)');
          g.fillStyle = grd;
          g.beginPath();
          g.arc(0, 0, r, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
        g.clearRect(pw / 2 - (hole.w / 2 / SW) * pw, holeTop, (hole.w / SW) * pw, ph);
      }
      // keep the opening itself clear
      g.clearRect(pw / 2 - (hole.w / 2 / SW) * pw, holeTop, (hole.w / SW) * pw, ph);
      soot.mask.touch();
      soot.mask.flush();
      soot.mesh.visible = true;
    };
  }

  // a faint haze left behind doesn't count as dirt
  const clean = (mask) => 1 - mask.coverage(70);
  // the sheet goes once its fade has played out (after this call returns, so a fade the
  // level starts next is waited for) — unless it got dirty again meanwhile (a restart)
  const hideWhenClear = (it) => Promise.resolve()
    .then(() => it.mask.settled())
    .then(() => { if (it.mask.coverage(4) === 0) it.mesh.visible = false; });
  const targets = [...windows.map((w) => w.mesh), ...(soot ? [soot.mesh] : [])];
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();

  return {
    group,
    windows,
    soot,
    // what the pointer is over: { kind: 'window'|'soot', item, px, py, point, normal }
    hit(ndc, camera, kind) {
      ray.setFromCamera(ndc, camera);
      const list = kind === 'window' ? windows.map((w) => w.mesh) : kind === 'soot' ? (soot ? [soot.mesh] : []) : targets;
      const h = ray.intersectObjects(list.filter((m) => m.visible), false)[0];
      if (!h) return null;
      const win = windows.find((w) => w.mesh === h.object);
      const item = win ?? soot;
      return { kind: win ? 'window' : 'soot', item, point: h.point, normal: item.normal.clone(), px: h.uv.x * item.mask.w, py: (1 - h.uv.y) * item.mask.h };
    },
    // all panes together, by area: with the dirtier pane alone, a whole window wiped
    // spotless moved the bar not at all — it felt like 100% was needed (playtest round 2)
    get windowProgress() {
      const area = windows.reduce((a, w) => a + w.w.w * w.w.h, 0);
      return windows.length ? windows.reduce((a, w) => a + clean(w.mask) * w.w.w * w.w.h, 0) / area : 1;
    },
    get sootProgress() { return soot ? clean(soot.mask) : 1; },
    // a finished job: wipe the rest and take the sheet away (once a fade of what was left
    // has played: level.js starts it right after this returns)
    finishWindows() {
      for (const w of windows) {
        w.mask.fill(null);
        w.mask.flush();
        hideWhenClear(w);
      }
    },
    finishSoot() {
      if (!soot) return;
      soot.mask.fill(null);
      soot.mask.flush();
      hideWhenClear(soot);
    },
    dirty() {
      dirtyWindows();
      dirtySoot();
    },
    // true when a window changed: the sun's shadow map has to be redrawn
    flush() {
      let win = false;
      for (const w of windows) win = w.mask.flush() || win;
      soot?.mask.flush();
      return win;
    },
    serialize() {
      return {
        windows: windows.map((w) => (w.mesh.visible ? w.mask.toDataURL() : null)),
        soot: soot?.mesh.visible ? soot.mask.toDataURL() : null,
      };
    },
    async restore(s) {
      await Promise.all(windows.map(async (w, i) => {
        const url = s?.windows?.[i];
        w.mesh.visible = !!url && (await w.mask.load(url));
        w.mask.flush();
      }));
      if (!soot) return;
      soot.mesh.visible = !!s?.soot && (await soot.mask.load(s.soot));
      soot.mask.flush();
    },
  };
}
