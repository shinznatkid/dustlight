// Plays the whole level against the running dev server (http://127.0.0.1:5190),
// start to reveal, and checks each step: fresh room (the "before" shot) → repairs
// (a crowbar sweep and the fire by mouse, the rest through the systems' own APIs)
// → boxes (two by mouse, the rest to the usual layout) → "All done" → dusk, lamps
// and fire → before / after → the timelapse from there (what the mouse did is in the
// journal; the room comes back exactly as it was) → the places card says finished.
// Screenshots → shots/p6-* (level 1) / shots/pt-<level>-* (the others).
// Usage: node tools/playthrough.mjs [--level=cabin]   (exit code 1 if a check fails)
// What each level does by mouse, and how the rest of its repairs are finished through
// the systems, is in LEVELS below (world coordinates of that level's room).
import './lowprio.mjs'; // below-normal priority for this and the browser it opens
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = `${path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots')}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(fs.existsSync);
if (!exe) throw new Error('No Edge/Chrome found');
const fails = [];
const expect = (ok, what) => { if (!ok) fails.push(what); };
const LEVEL = process.argv.slice(2).find((a) => a.startsWith('--level='))?.slice(8) ?? 'meadow';
const PORT = process.argv.slice(2).find((a) => a.startsWith('--port='))?.slice(7) ?? '5190';
// per level: tool-key strokes by mouse (world points; key = the tool bar's number), the
// repairs left finished through the systems (in the page), the fireplace logs to click
// by hand, the first two things out of the furniture box and where to put them, and the
// journal kinds the mouse work must have left
const LEVELS = {
  meadow: {
    shots: 'p6',
    strokes: [{ key: '2', pts: Array.from({ length: 8 }, (_, k) => [k % 2 ? 1.8 : -1.8, 0, -0.6 + k * 0.25]) }],
    finish: () => {
      const L = window.__app.game.L;
      L.trash.clearAll();
      L.floor.setAll('new');
      for (const w of L.grime.windows) w.mask.fill(null);
      L.grime.soot.mask.fill(null);
      L.walls.fill('#9fae8f');
    },
    fire: [-0.9, 0.12, -2.46],
    place: [[2.2, 0.46, 0.4], [0.45, 0.2, 0.4]],
    kinds: ['pry', 'fire', 'move'],
  },
  cabin: {
    shots: 'pt-cabin',
    strokes: [
      // the mop over a strip of floor, the caulk gun along one gap left of the chimney
      { key: '2', pts: Array.from({ length: 6 }, (_, k) => [k % 2 ? 1.6 : -1.4, 0, -0.4 + k * 0.3]) },
      { key: '4', pts: [[-3.0, 0.91, -2.5], [-2.4, 0.91, -2.5], [-1.95, 0.91, -2.5]] },
    ],
    finish: () => {
      const L = window.__app.game.L;
      L.trash.clearAll();
      L.mud.clean();
      for (const w of L.grime.windows) w.mask.fill(null);
      L.grime.soot.mask.fill(null);
      L.chink.fill('#f7e2bd');
      L.logs.fill('#c98a4b');
    },
    fire: [-0.75, 0.1, -2.3],
    place: [[1.62, 0.3, -1.95], [1.5, 0.2, -0.52]],
    kinds: ['mop', 'chink', 'fire', 'move'],
  },
  bookshop: {
    shots: 'pt-bookshop',
    strokes: [
      // the sander over a strip of floor, the duster along the fronts of two shelf rows
      { key: '3', pts: Array.from({ length: 6 }, (_, k) => [k % 2 ? 1.2 : -1.6, 0, -0.2 + k * 0.3]) },
      { key: '5', pts: [[-3.0, 1.95, -2.26], [-1.0, 1.95, -2.26], [1.1, 1.95, -2.26], [1.1, 1.6, -2.26], [-1.0, 1.6, -2.26], [-3.0, 1.6, -2.26]] },
    ],
    // (the sign waits for the paint: gilded by mouse once the rest is done — `finale`)
    finish: () => {
      const L = window.__app.game.L;
      L.trash.clearAll();
      L.sand.clean();
      for (const w of L.grime.windows) w.mask.fill(null);
      L.walls.fill('#e0a06a');
      L.dust.clean();
    },
    fire: null,
    finale: {
      key: '6',
      pts: [[1.72, 2.52, -2.56], [2.78, 2.52, -2.56], [2.78, 2.42, -2.56], [1.72, 2.42, -2.56], [1.72, 2.32, -2.56], [2.78, 2.32, -2.56]],
      finish: () => window.__app.game.L.gild.clean(),
    },
    place: [[-2.2, 0.3, 1.6], [0.15, 0.3, 0.35]],
    kinds: ['sand', 'dust', 'gild', 'move'],
  },
  pottery: {
    shots: 'pt-pottery',
    strokes: [
      // the sponge over a strip of floor, the trowel across the kiln's third course
      { key: '2', pts: Array.from({ length: 6 }, (_, k) => [k % 2 ? 1.4 : -1.6, 0, -0.9 + k * 0.3]) },
      { key: '5', pts: [[2.26, 0.42, -1.25], [2.64, 0.42, -1.29], [2.87, 0.42, -1.58]] },
    ],
    finish: () => {
      const L = window.__app.game.L;
      L.trash.clearAll();
      L.stains.clean();
      for (const w of L.grime.windows) w.mask.fill(null);
      L.walls.fill('#f4caa1');
      L.drying.complete();
      L.kiln.complete();
    },
    fire: [2.636, 0.29, -1.288], // the kiln's door
    place: [[-1.05, 0.34, 0.0], [-0.95, 0.41, -2.08]],
    kinds: ['sponge', 'brick', 'fire', 'move'],
  },
  castle: {
    shots: 'pt-castle',
    strokes: [
      // the besom over a strip of floor, the glazier down the stained glass (every rag out)
      { key: '2', pts: Array.from({ length: 6 }, (_, k) => [k % 2 ? 1.6 : -1.4, 0, -0.2 + k * 0.3]) },
      { key: '4', pts: [[-3.32, 0.75, -0.9], [-3.32, 0.75, -1.5], [-3.32, 1.0, -1.5], [-3.32, 1.0, -0.9], [-3.32, 1.25, -0.9], [-3.32, 1.25, -1.5], [-3.32, 1.5, -1.5], [-3.32, 1.5, -0.9], [-3.32, 1.8, -0.9], [-3.32, 1.8, -1.5], [-3.32, 2.05, -1.35], [-3.32, 2.05, -1.05], [-3.32, 2.2, -1.2]] },
    ],
    finish: () => {
      const L = window.__app.game.L;
      L.trash.clearAll();
      L.rushes.clean();
      for (const w of L.grime.windows) w.mask.fill(null);
      L.grime.soot.mask.fill(null);
      L.walls.fill('#efc36a');
      L.glazing.complete();
    },
    fire: [0.15, 0.2, -2.56], // a log on the fire-dogs
    place: [[-1.9, 0.35, 0.1], [2.22, 0.3, -2.0]],
    kinds: ['broom', 'glaze', 'fire', 'move'],
  },
  cyber: {
    shots: 'pt-cyber',
    strokes: [
      // the mop over a strip of floor, the neon tube along the noodle sign's bowl
      { key: '2', pts: Array.from({ length: 6 }, (_, k) => [k % 2 ? 1.6 : -1.4, 0, -0.4 + k * 0.3]) },
      { key: '4', pts: [[-1.89, 2.0, -2.436], [-1.83, 1.85, -2.436], [-1.67, 1.74, -2.436], [-1.45, 1.71, -2.436], [-1.23, 1.74, -2.436], [-1.07, 1.85, -2.436], [-1.01, 2.0, -2.436]] },
    ],
    finish: () => {
      const L = window.__app.game.L;
      L.trash.clearAll();
      L.mud.clean();
      for (const w of L.grime.windows) w.mask.fill(null);
      L.grime.soot.mask.fill(null);
      L.walls.fill('#e9b3ab');
      L.neon.finishInner(); // (the three in the flat: the lantern outside is the last job)
      L.neon.tool.setColor('#b45cff'); // (a colour picked: the noodle bowl goes violet — journaled)
    },
    fire: [0.78, 1.06, -2.17], // the noodle pot on the hob
    // the last job, once the stove is lit: the lantern outside, its outline traced through the
    // window (sign root −3.368, 1.4, 0.2 turned to face the room: local x → world −z)
    finale: {
      wait: 500, // (the stove's task is judged first — the lantern is locked until then)
      key: '4',
      pts: [[-3.316, 1.64, 0.1], [-3.316, 1.57, 0.0], [-3.316, 1.4, -0.045], [-3.316, 1.23, 0.0], [-3.316, 1.16, 0.1]],
      finish: () => window.__app.game.L.neon.finishStreet(),
    },
    place: [[-1.5, 0.44, -2.07], [-2.73, 0.43, -0.2]], // (the sofa and the window seat, where they belong)
    kinds: ['mop', 'neon', 'tint', 'fire', 'move'],
    // the signs' colours (the violet bowl) and which are lit come back with the timelapse
    same: () => JSON.stringify({ colors: window.__app.game.L.neon.colors, lit: window.__app.game.L.neon.signs.map((s) => +s.lit.toFixed(2)) }),
  },};
const LV = LEVELS[LEVEL];
const shot = (n) => `${OUT}${LV.shots}-${n}.png`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: !process.argv.includes('--headful'), // real GPU, no window (covers.mjs)
    args: ['--ignore-gpu-blocklist', '--window-size=1600,1020', '--lang=th-TH', '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const out = { steps: [] };
  const errors = [];
  const log = (k, v) => { out.steps.push([k, v]); };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    page.on('pageerror', (e) => errors.push(e.message));
    // (console.warn arrives as type 'warn'; ANGLE's shader-compiler notes are harmless)
    page.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type()) && !/Program Info Log/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${PORT}/?pr=1&play`, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`http://127.0.0.1:${PORT}/?pr=1&play&phase=restore&level=${LEVEL}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 240000 });
    await sleep(1500);
    const scr = (x, y, z) => page.evaluate((x, y, z) => {
      const A = window.__app;
      const v = new A.THREE.Vector3(x, y, z).project(A.camera);
      return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
    }, x, y, z);
    const st = () => page.evaluate(() => {
      const A = window.__app;
      const g = A.game;
      return {
        state: A.state,
        phase: g.phase,
        progress: +g.progress.toFixed(3),
        time: +A.world.time.toFixed(3),
        fire: A.world.room.fireOn,
        lamps: A.world.fixtures.lamps.map((l) => l.target).join(''),
        before: g.meta.before ? g.meta.before.length : 0,
        after: g.meta.after ? g.meta.after.length : 0,
        complete: g.meta.complete,
        tasks: g.taskView().map((t) => `${t.id}:${t.done ? '✓' : Math.round(t.p * 100)}`).join(' '),
      };
    });
    const click = async ([x, y]) => {
      await page.mouse.move(x, y, { steps: 4 });
      await sleep(80);
      await page.mouse.down();
      await page.mouse.up();
    };
    const drag = async (pts, steps = 8) => {
      await page.mouse.move(pts[0][0], pts[0][1]);
      await page.mouse.down();
      for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps });
      await page.mouse.up();
    };

    const s0 = await st();
    log('fresh', s0);
    expect(s0.phase === 'restore' && s0.before > 0, 'fresh room + before shot');
    await page.screenshot({ path: shot('0-fresh') });

    // ---- repairs: a stroke or two by mouse, the rest via the systems
    for (const k of LV.strokes) {
      await page.keyboard.press(k.key);
      const row = [];
      for (const q of k.pts) row.push(await scr(...q));
      await drag(row, 8);
      await sleep(600);
      log(`after stroke (${k.key})`, await st());
    }
    await page.evaluate(LV.finish);
    await sleep(1600);
    log('repairs but fire', await st());
    // light the fire with the hand, by mouse (a room without one: its last job by mouse)
    if (LV.fire) {
      await page.keyboard.press('1');
      await click(await scr(...LV.fire));
    }
    if (LV.finale) {
      if (LV.finale.wait) await sleep(LV.finale.wait);
      await page.keyboard.press(LV.finale.key);
      const row = [];
      for (const q of LV.finale.pts) row.push(await scr(...q));
      await drag(row, 10);
      await sleep(600);
      log('finale by mouse', await st());
      await page.evaluate(LV.finale.finish);
      await page.keyboard.press('1');
    }
    await sleep(1500);
    const s1 = await st();
    log('fire lit → unpack', s1);
    expect(s1.phase === 'unpack' && (!LV.fire || s1.fire) && s1.time > s0.time + 0.03, 'repairs done → unpack, fire lit, time moved on'); // (from the level's own start)
    // the time drifts towards golden hour as the work gets done
    await sleep(4000);
    log('time after drift', await st());
    await page.screenshot({ path: shot('1-unpack') });

    // ---- boxes: two by mouse, then the rest to the usual layout
    const boxAt = (id) => page.evaluate((id) => {
      const b = window.__app.game.L.boxes.list.find((x) => x.id === id);
      const p = b.e.holder.position;
      return [p.x, b.size.h * 0.45, p.z];
    }, id);
    const openBox = async (id) => { const [x, y, z] = await boxAt(id); await click(await scr(x, y, z)); await sleep(250); };
    const place = async (x, y, z) => {
      const p = await scr(x, y, z);
      await page.mouse.move(p[0], p[1], { steps: 10 });
      await sleep(200);
      await page.mouse.down();
      await page.mouse.up();
      await sleep(450);
    };
    for (const q of LV.place) {
      await openBox('furniture');
      await place(...q);
    }
    log('two by mouse', await st());
    await page.evaluate(() => {
      const A = window.__app;
      const B = A.game.L.boxes;
      const snap = A.defaultLayout;
      for (const b of B.list) {
        for (const id of b.items.splice(0)) {
          const e = A.decor.entries.find((x) => x.id === id);
          const s = snap[id];
          A.decor.setStored(e, false);
          e.holder.position.set(s[0], s[1], s[2]);
          e.holder.rotation.set(0, s[3], 0);
        }
        b.anim = { kind: 'fold', t: 0 };
      }
      A.decor.link();
      A.world.lightingChanged();
    });
    // thirty models appearing at once (shaders are compiled at load, but the GI
    // still re-runs): wait for the level to notice, not a clock
    await page.waitForFunction(() => window.__app.game.phase === 'done' && !document.getElementById('finishBtn').hidden, { timeout: 20000 }).catch(() => {});
    await sleep(500);
    log('all unpacked', await st());
    const fb = await page.$eval('#finishBtn', (e) => ({ hidden: e.hidden, text: e.textContent }));
    log('finish button', fb);
    expect(!fb.hidden, 'finish button shows once every box is empty');
    await page.screenshot({ path: shot('2-done') });

    // ---- the reveal
    await page.click('#finishBtn');
    await sleep(500);
    log('revealing', await st());
    await page.waitForFunction(() => document.getElementById('revealWrap').classList.contains('open'), { timeout: 30000 });
    await sleep(3800); // the before → after wipe
    const s2 = await st();
    log('revealed', s2);
    expect(s2.time >= 0.8 && (!LV.fire || s2.fire) && /^1+$/.test(s2.lamps) && s2.after > 0 && s2.complete, 'reveal: dusk, lamps + fire, after shot, complete');
    await page.screenshot({ path: shot('3-reveal') });
    // drag the divider to the left third
    const box = await page.$eval('#cmp', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    await page.mouse.move(box[0] + box[2] * 0.5, box[1] + box[3] * 0.5);
    await page.mouse.down();
    await page.mouse.move(box[0] + box[2] * 0.3, box[1] + box[3] * 0.5, { steps: 8 });
    await page.mouse.up();
    log('divider', await page.$eval('#cmp', (e) => e.style.getPropertyValue('--x')));
    await page.screenshot({ path: shot('4-drag') });

    // ---- the timelapse: what was done by mouse is in the journal; it plays from the
    // before / after and puts the room back exactly as it was
    const j = await page.evaluate(() => {
      const J = window.__app.game.journal;
      const kinds = {};
      for (const e of J.entries) kinds[e[1]] = (kinds[e[1]] ?? 0) + 1;
      return { playable: J.playable, kinds, button: !document.getElementById('rvTimelapse').hidden };
    });
    log('journal', j);
    expect(j.playable && LV.kinds.every((k) => j.kinds[k]) && j.button, `journal: ${LV.kinds.join(', ')} · timelapse button shown`);
    const room0 = await page.evaluate(() => (() => { const A = window.__app; const s = A.game.serialize(); const masks = Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'string' && v.startsWith('data:')).map(([k, v]) => [k, v.length])); return JSON.stringify({ l: A.decor.snapshot(), masks, t: +A.world.time.toFixed(3) }); })());
    const same0 = LV.same ? await page.evaluate(LV.same) : null; // (a level's own state the timelapse must also bring back)
    await page.click('#rvTimelapse');
    await page.waitForFunction(() => window.__app.state === 'replay', { timeout: 5000 });
    await sleep(9000);
    log('timelapse', await st());
    await page.screenshot({ path: shot('4b-timelapse') });
    await page.waitForFunction(() => window.__app.state === 'reveal' && document.getElementById('revealWrap').classList.contains('open'), { timeout: 120000 });
    await sleep(1200);
    const room1 = await page.evaluate(() => (() => { const A = window.__app; const s = A.game.serialize(); const masks = Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'string' && v.startsWith('data:')).map(([k, v]) => [k, v.length])); return JSON.stringify({ l: A.decor.snapshot(), masks, t: +A.world.time.toFixed(3) }); })());
    log('after timelapse', { ...(await st()), stats: await page.evaluate(() => window.__app.replay.stats) });
    expect(room1 === room0, 'after the timelapse the room is exactly as it was (furniture, paint, time)');
    if (LV.same) {
      const same1 = await page.evaluate(LV.same);
      log('level state', { before: same0, after: same1 });
      expect(same1 === same0, 'after the timelapse the level\'s own state is as it was');
    }
    await page.click('#rvStay');
    await sleep(800);
    log('keep decorating', await st());
    await page.screenshot({ path: shot('5-dusk') });

    // ---- menu → places: the card shows it finished
    await page.evaluate(() => window.__app.enterMenu());
    await sleep(2000);
    await page.click('#mPlay');
    await sleep(900);
    // (the places: a route of every place in order + the details of the picked stop,
    // which is this page's place when the screen opens)
    const card = await page.evaluate(() => {
      const d = document.querySelector('#cards .detail');
      const stop = document.querySelector('#cards .stop.here');
      return {
        badge: d.querySelector('.done')?.textContent ?? null,
        bg: (d.querySelector('.ppic').style.backgroundImage || '').slice(0, 40),
        stop: stop?.className ?? null,
        stopBg: (stop?.querySelector('.ppic').style.backgroundImage || '').slice(0, 40),
      };
    });
    log('card', card);
    expect(!!card.badge && card.bg.includes('data:image/jpeg') && /\bst-complete\b.*\bsel\b/.test(card.stop ?? '') && card.stopBg.includes('data:image/jpeg'),
      'places: this place is picked, its stop on the route is finished, the details show the badge + the after shot');
    await page.screenshot({ path: shot('6-places') });
    const saved = await page.evaluate((id) => { const s = JSON.parse(localStorage.getItem('hearthlight.v1')); const m = s?.levels?.[id]?.meta; return m ? { complete: m.complete, before: !!m.before, after: !!m.after } : s && Object.keys(s); }, LEVEL);
    log('saved meta', saved);
  } catch (e) {
    fails.push(`crashed: ${e.message}`);
  } finally {
    expect(!errors.length, 'no page errors / warnings');
    for (const [k, v] of out.steps) console.log(k.padEnd(20), typeof v === 'string' ? v : JSON.stringify(v));
    if (errors.length) console.log('errors', errors);
    console.log(fails.length ? `FAIL: ${fails.join(' · ')}` : 'PASS');
    process.exitCode = fails.length ? 1 : 0;
    await browser.close();
  }
})();
