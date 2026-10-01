// Sound board (sounds.html → http://127.0.0.1:5190/sounds.html): every game sound next to
// a few alternatives, so the sounds can be compared by ear and picked. Not part of the game:
// nothing in src/ imports this, and adopting a pick means editing tools/fetch_audio.py /
// src/audio.js by hand.
//
//   rows (ROWS) = one game action each: what plays now + alternatives, ★ = the pick
//   options:  { sfx: id }        the game's own sound (assets/audio/index.json, its variants)
//             { cand: id }       a file from assets/audio/candidates/ (candidates.json, written
//                                by tools/fetch_sound_candidates.py — CC0 / CC-BY packs only)
//             { cue: {layers} }  a layered cue like audio.js CUES (layer.src = 'sfx:id' | 'cand:id')
//             { synth: name }    a one-shot made here (SYNTH) · ambience: { amb }, { loops }, { none }
//             + rate / gain / lp on the option (the game's call site, or the candidate's own)
//   rub rows = the RUB noise synth of audio.js (copied, plus `am` / `file`) under a pad you rub
// Numbers next to each option: tools/soundcheck.mjs, collected by tools/soundboard_stats.mjs
// into candidates/soundcheck.json (files as they are; cues/synths/rubs rendered offline first).

// this page reloads itself when this file changes — without an HMR boundary vite would
// full-reload every open page of the dev server, the game someone is playing included
if (import.meta.hot) import.meta.hot.accept(() => location.reload());

// (read only: "current" plays the game's own cues — plank, bin, box_open, shutter, pry — as
// audio.js has them now; audio.js imports nothing)
import { CUES as GAME_CUES } from './audio.js';

let BASE = 'assets/audio/';
let rand = Math.random;
const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const within = (r, d = 1) => (Array.isArray(r) ? r[0] + rand() * (r[1] - r[0]) : r ?? d);
const pickOne = (a) => a[Math.floor(rand() * a.length)];
const BUS = { sfx: 0.8, ambience: 0.6, music: 0.7 }; // the game's default bus levels (audio.js vol)

// ---- the rubbing synth: audio.js RUB as it is today (copied — it lives inside createAudio();
// keep in step by hand · synced 2026-09-30 after the picks: glass = damp cloth, feather softer)
const RUB_NOW = {
  glass: { type: 'bandpass', f: 700, q: 0.6, lfo: [1.2, 120], top: 1800, gain: 0.36, body: { f: 300, q: 0.7, gain: 0.5 } },
  scrub: { type: 'bandpass', f: 1100, q: 0.7, lfo: [6, 260], top: 2300, gain: 0.34 },
  roll: { type: 'bandpass', f: 650, q: 0.9, lfo: [2.4, 200], top: 1800, gain: 0.3 },
  feather: { type: 'bandpass', f: 2200, q: 0.5, lfo: [6, 700], top: 5000, gain: 0.27, body: { f: 400, q: 0.7, gain: 0.6 } },
  sweep: { type: 'bandpass', f: 2300, q: 0.6, lfo: [13, 650], top: 6200, gain: 0.3, body: { f: 750, q: 0.8, gain: 0.4 } },
};
// the crowbar's cue: audio.js CUES.pry as it is today
const PRY_NOW = {
  gap: 0.07,
  layers: [
    { src: 'sfx:pry_knock', gain: 0.9, rate: [0.85, 1.0], lp: 2600 },
    { src: 'sfx:pry_crackle', gain: 0.32, rate: [0.75, 0.9], lp: 1800, at: [0.01, 0.04] },
  ],
};

// ---- rows ------------------------------------------------------------------------------------
const cur = (src, more = {}) => ({ id: 'current', current: true, src, ...more });
const cand = (id, more = {}) => ({ id, src: { cand: id }, ...more });
const cue = (id, th, en, layers, more = {}) => ({ id, th, en, src: { cue: { layers } }, ...more });
const synth = (id, th, en, name, more = {}) => ({ id, th, en, src: { synth: name }, ...more });
const rubv = (id, th, en, spec) => ({ id, th, en, src: { rub: spec } });

export const GROUPS = [
  { id: 'ui', th: 'ปุ่มและเมนู', en: 'UI' },
  { id: 'hand', th: 'หยิบ / วางของ', en: 'pick up · put down' },
  { id: 'floor', th: 'พื้น: งัด / ปูไม้', en: 'floor: pry · lay planks' },
  { id: 'trash', th: 'เก็บขยะลงถัง', en: 'litter into the bin' },
  { id: 'boxes', th: 'กล่อง', en: 'boxes' },
  { id: 'tasks', th: 'งานเสร็จ', en: 'task done' },
  { id: 'rub', th: 'เสียงถูของเครื่องมือ', en: 'surface tools: rubbing' },
  { id: 'levels', th: 'เสียงเฉพาะด่าน', en: 'level sounds' },
  { id: 'amb', th: 'บรรยากาศ', en: 'ambience' },
  { id: 'music', th: 'เพลง', en: 'music' },
];

// row: id · group · th/en · when (Thai: when it plays) · code (where) · gain (the game's gain
// at the call) · kind sfx|rub|amb|music · uses: other call sites of the same sound ·
// burst: [n, seconds apart] (heard in a run) · pattern: [[at, +rate], …] (one play = a sequence)
export const ROWS = [
  // ---- UI
  { id: 'click', group: 'ui', th: 'กดปุ่ม', en: 'button click', when: 'ทุกปุ่มในเมนู / HUD', code: "ui/cues.js · audio.sfx('click')",
    opts: [cur({ sfx: 'click' }), cand('ui_click2'), cand('ifc_click_002'), cand('ifc_select_006')] },
  { id: 'hover', group: 'ui', th: 'เอาเมาส์ชี้ปุ่ม', en: 'button hover', gain: 0.5, when: 'ชี้ปุ่มไหนก็ดัง — ได้ยินบ่อยที่สุดในเมนู', code: "ui/cues.js · sfx('hover', { gain: 0.5 })",
    opts: [cur({ sfx: 'hover' }), cand('ui_rollover5'), cand('ui_rollover4'), cand('ui_rollover2')] },
  { id: 'rotate', group: 'ui', th: 'หมุนของที่ถือ / เลือกเครื่องมือ', en: 'rotate held item · pick a tool', when: 'ล้อเมาส์ทีละ 15°, R = 90° · กดเลข 1–6 เลือกเครื่องมือ (เบาลง 0.6)', code: "hand.js · sound('rotate') · main.js selectTool",
    uses: [{ th: 'หมุนของ', en: 'rotate', gain: 1 }, { th: 'เลือกเครื่องมือ', en: 'tool', gain: 0.6 }], burst: [4, 0.11],
    opts: [cur({ sfx: 'rotate' }), cand('ifc_switch_002'), cand('ifc_switch_007'), cand('ui_switch11')] },
  { id: 'blocked', group: 'ui', th: 'ทำไม่ได้ / วางไม่ลง', en: 'blocked', when: 'วางของทับของอื่น · ปูไม้ทับพื้นเก่า (0.4) · ลูกกลิ้งสีหมด (0.35)', code: "hand.js · floorTools.js · surfaceTools.js · sound('blocked')",
    opts: [cur({ sfx: 'blocked' }), cand('ifc_error_008'), cand('ifc_error_004'), cand('ifc_back_002')] },
  { id: 'switch', group: 'ui', th: 'เปิด-ปิดโคมไฟ / จุดไฟเตา', en: 'lamp · fire switch', when: 'คลิกขวาโคม / คลิกท่อนไม้ในเตา', code: "hand.js · input.js · sound('switch')",
    opts: [cur({ sfx: 'switch' }), cand('ifc_switch_004'), cand('ifc_switch_006'), cand('ui_switch10')] },
  { id: 'shutter', group: 'ui', th: 'ถ่ายรูป', en: 'photo shutter', when: 'โหมดถ่ายรูป กด Space', code: "ui/photo.js · audio.sfx('shutter')",
    opts: [cur({ sfx: 'shutter' }), cand('owl_camera_01'), cand('owl_camera_03'), { id: 'shutter_lp', th: 'อันเดิม ตัดแหลมเหนือ 3.5 kHz', en: 'current, low-passed', src: { sfx: 'shutter' }, lp: 3500 }] },

  // ---- hand
  { id: 'pickup', group: 'hand', th: 'หยิบของ', en: 'pick up', when: 'คลิกของ = หยิบ · กดลากของ (เบาลง 0.6)', code: "hand.js · sound('pickup')",
    uses: [{ th: 'คลิกหยิบ', en: 'click', gain: 1 }, { th: 'ลากหยิบ', en: 'drag', gain: 0.6 }],
    opts: [cur({ sfx: 'pickup' }), cand('rpg_cloth34'), cand('rpg_bookopen'),
      cue('pickup_lift', 'ผ้า + ติ๊กตอนจับ', 'cloth + a tiny grab tick', [
        { src: 'cand:rpg_cloth34', gain: 1, rate: [1.05, 1.2], lp: 2600 },
        { src: 'cand:ifc_click_002', gain: 0.25, lp: 3500, at: [0.02, 0.04] },
      ])] },
  { id: 'drop', group: 'hand', th: 'วางของ (ของแข็ง / ไม้)', en: 'put down (hard)', when: 'คลิกวาง (1.0) · ลากแล้วปล่อย (0.7) — ของที่ไม่ใช่โซฟา/หมอน/เก้าอี้', code: "hand.js · sound('drop')",
    uses: [{ th: 'คลิกวาง', en: 'click', gain: 1 }, { th: 'ลากวาง', en: 'drag', gain: 0.7 }],
    opts: [cur({ sfx: 'drop' }), cand('rpg_bookplace'), cand('imp_wood_medium'),
      cue('drop_body', 'ต็อกหนังสือ + ไม้ทุ้ม', 'book tok + deeper wood', [
        { src: 'cand:rpg_bookplace', gain: 0.8, rate: [0.95, 1.05], lp: 3200 },
        { src: 'cand:imp_wood_medium', gain: 0.7, rate: [0.95, 1.05] },
      ])] },
  { id: 'drop_soft', group: 'hand', th: 'วางของนุ่ม (โซฟา หมอน เก้าอี้)', en: 'put down (soft)', when: 'วางเฟอร์นิเจอร์บุนวม · ปล่อยกองขยะไม่ลงถัง (0.6)', code: "ui/cues.js sound(): drop → drop_soft",
    opts: [cur({ sfx: 'drop_soft' }), cand('imp_carpet'), cand('imp_soft_heavy'), cand('rpg_dropleather')] },
  { id: 'cancel', group: 'hand', th: 'วางคืนที่เดิม', en: 'put back · cancel', when: 'ถือของอยู่แล้วคลิกขวา / Esc', code: "hand.js · sound('cancel')",
    opts: [cur({ sfx: 'cancel' }), cand('rpg_cloth34'), cand('owl_cloth'),
      { id: 'cancel_lp', th: 'อันเดิม ทุ้มลง ตัดแหลม', en: 'current, slower + low-passed', src: { sfx: 'cancel' }, rate: 0.9, lp: 1800 }] },

  // ---- floor
  { id: 'pry', group: 'floor', th: 'งัดพื้นเก่า (ชะแลง)', en: 'pry old boards (crowbar)', gain: 0.55, when: 'ถูชะแลงไปบนพื้นเก่า — งัดเป็นชุด เว้น ≥ 70 ms', code: "floorTools.js · sound('pry', { gain: 0.55 }) · audio.js CUES.pry",
    burst: [5, 0.09],
    opts: [cur({ cue: PRY_NOW }),
      { id: 'creak', th: 'เอี๊ยดอ๊าด (แบบเก่าก่อนแก้ รอบ 2)', en: 'old door creak (before playtest 2)', src: { sfx: 'creak' } },
      cue('pry_deep', 'เคาะไม้หนา + กรอบกระดาษแข็ง', 'deeper knock + cardboard crackle', [
        { src: 'cand:imp_wood_medium', gain: 1, rate: [0.9, 1.05], lp: 2200 },
        { src: 'cand:yuc_crackle4', gain: 0.3, rate: [0.7, 0.85], lp: 1600, at: [0.01, 0.04] },
      ]),
      cue('pry_pop', 'ไม้หลุดดังป๊อก (ปึก + กรอบ + ทุ้ม)', 'board pops loose', [
        { src: 'cand:rpg_bookclose', gain: 0.8, rate: [0.9, 1.0], lp: 2400 },
        { src: 'sfx:pry_crackle', gain: 0.3, rate: [0.65, 0.8], lp: 1400, at: [0.02, 0.05] },
        { src: 'cand:imp_footstep_wood', gain: 0.5, rate: [0.95, 1.05], lp: 900 },
      ])] },
  { id: 'plank', group: 'floor', th: 'วางไม้ปูพื้นแต่ละแผ่น', en: 'lay each floor plank', gain: 0.5, when: 'ลากแผ่นไม้ไปบนพื้นที่งัดแล้ว ดังทุกแผ่นที่ลงที่ · เพลย์เทสต์: "เบาไม่ฟิน" (ไฟล์เดิมมีแต่ย่านต่ำ < 500 Hz)', code: "level.js · sound('plank', { gain: 0.5 })",
    burst: [6, 0.13],
    opts: [cur({ sfx: 'plank' }),
      { id: 'plank_loud', th: 'อันเดิม ดังขึ้น 2 เท่า', en: 'current ×2 (is it just too quiet?)', src: { sfx: 'plank' }, gain: 2 },
      cand('rpg_bookplace'),
      cue('plank_lock', 'ตึ้บ + ต็อก + กริ๊กลงล็อก', 'thump + tok + click into place', [
        { src: 'sfx:plank', gain: 0.8, rate: [0.95, 1.05] },
        { src: 'cand:rpg_bookplace', gain: 0.9, rate: [0.95, 1.1], lp: 3000 },
        { src: 'cand:ifc_click_002', gain: 0.35, rate: [0.9, 1.1], lp: 4000, at: [0.05, 0.07] },
      ]),
      cue('plank_tok', 'ปึกทึบ + เสี้ยนไม้เบา ๆ', 'solid tok + faint fibre crackle', [
        { src: 'cand:rpg_bookclose', gain: 0.9, rate: [0.9, 1.05] },
        { src: 'cand:imp_footstep_wood', gain: 0.6, rate: [0.95, 1.05], lp: 900 },
        { src: 'sfx:pry_crackle', gain: 0.12, rate: [1.1, 1.3], lp: 2400, at: [0.02, 0.05] },
      ])] },

  // ---- trash
  { id: 'rustle', group: 'trash', th: 'กวาดขยะรวมกอง', en: 'gather litter', gain: 0.5, when: 'กดบนขยะ (0.5) แล้วลาก — ดังซ้ำทุกครั้งที่ขยะขยับ (0.35, เร็วขึ้น 1.2×)', code: "hand.js · sound('rustle')",
    uses: [{ th: 'กดเริ่ม', en: 'press', gain: 1 }, { th: 'ลากต่อ', en: 'drag', gain: 0.7, rate: 1.2 }], burst: [4, 0.16], burstUse: 1,
    opts: [cur({ sfx: 'rustle' }), cand('owl_plastic_08'), cand('owl_plastic_06'), cand('rpg_cloth34'),
      { id: 'rustle_lp', th: 'อันเดิม ตัดแหลมเหนือ 2.4 kHz', en: 'current, low-passed', src: { sfx: 'rustle' }, lp: 2400, gain: 1.4 }] },
  { id: 'bin', group: 'trash', th: 'ขยะลงถัง', en: 'litter into the bin', gain: 0.7, when: 'กองขยะที่ลากไปถึงถัง — ทีละชิ้น', code: "level.js · sound('bin', { gain: 0.7 })",
    burst: [3, 0.14],
    opts: [cur({ sfx: 'bin' }), cand('yuc_thud'), cand('rpg_dropleather'), cand('ifc_drop'),
      cue('bin_crumple', 'ยับกรอบแกรบ + ตุ้บ', 'crinkle + thump', [
        { src: 'cand:owl_plastic_08', gain: 1, lp: 3500 },
        { src: { files: ['sfx/drop_soft_1.ogg', 'sfx/drop_soft_2.ogg'] }, gain: 0.45, at: [0.03, 0.05] },
      ])] },

  // ---- boxes
  { id: 'box_open', group: 'boxes', th: 'คลิกกล่อง ของชิ้นต่อไปออกมา', en: 'open a box · next item out', when: 'คลิกกล่อง (1.0) · พับกล่องเปล่า (0.35, 1.4×) · ยกของออกนอกห้องเข้ากล่องเก็บ (0.5, 1.2×)', code: "hand.js · boxes.js · sound('box_open')",
    uses: [{ th: 'คลิกกล่อง', en: 'open', gain: 1 }, { th: 'พับกล่อง', en: 'fold', gain: 0.35, rate: 1.4 }, { th: 'เข้ากล่องเก็บ', en: 'store', gain: 0.5, rate: 1.2 }],
    opts: [cur({ sfx: 'box_open' }), cand('yuc_crackle4'), cand('yuc_movearound1'),
      cue('box_flap', 'ฝากล่องพับ + ตุ้บเบา + ผ้า', 'flap + soft thump + cloth', [
        { src: 'cand:yuc_crackle1', gain: 0.7, rate: [0.8, 0.9], lp: 2400 },
        { src: { files: ['sfx/drop_soft_1.ogg', 'sfx/drop_soft_2.ogg'] }, gain: 0.45, at: [0.03, 0.05] },
        { src: 'cand:rpg_cloth34', gain: 0.5 },
      ])] },

  // ---- tasks
  { id: 'task', group: 'tasks', th: 'งานในรายการเสร็จ (✓)', en: 'task done', when: 'ขึ้นแบนเนอร์ ✓ ทุกงาน', code: "main.js onTask · sound('task')",
    opts: [cur({ sfx: 'task' }), cand('ifc_confirm_004'), cand('jng_steel09'), cand('jng_pizzi00')] },
  { id: 'sting', group: 'tasks', th: 'ซ่อมเสร็จ กล่องมาส่ง', en: 'repairs done · boxes arrive', when: 'เข้าช่วงแกะกล่อง', code: "main.js onPhase('unpack') · sound('sting')",
    opts: [cur({ sfx: 'sting' }), cand('jng_pizzi11'), cand('jng_steel04'), cand('jng_sax01')] },
  { id: 'fanfare', group: 'tasks', th: 'ห้องเสร็จ', en: 'room finished', when: 'ทุกอย่างครบ (หลังกล่องสุดท้าย ก่อนเทียบก่อน/หลัง) → ปุ่ม "เสร็จแล้ว" · รอบ 2: ยังไม่ชอบ 4 อันแรก — อันที่มีป้าย "ใหม่" คือชุดใหม่', code: "main.js onPhase('done') · sound('fanfare')",
    renderSecs: 4,
    opts: [cur({ synth: 'glow' }, { th: 'ตอนนี้: คอร์ดอุ่น ๆ + ประกายวิบวับ (synth)', en: 'now: warm chord swell + sparkles' }), cand('jng_pizzi12'), cand('jng_steel01'), cand('jng_steel12'),
      // round 2 (2026-09-30): warm, cozy, a little magical, 1–4 s — not a brassy "level complete"
      cand('jng_sax07', { isNew: true }),
      { id: 'fan_steel_soft', isNew: true, th: 'กลองกระทะ 7 ช้าลง ตัดแหลม (เหมือนมาริมบา)', en: 'steel drum 7, slowed 0.8× + low-passed — marimba-ish', src: { cand: 'jng_steel07' }, rate: 0.8, lp: 2200, gain: 1.2 },
      cue('fan_chimes', 'ฟู่ลมเบา ๆ + กริ๊งแก้วไล่โน้ต 4 ตัว + ระฆังเล็ก', 'soft whoosh + 4-note glass chime arpeggio + small bell', [
        { src: 'cand:rpg_cloth34', gain: 0.45, rate: 0.7, lp: 1600 },
        { src: 'cand:imp_bell_1', gain: 0.4, rate: 1.5, lp: 2500, at: 0.14 },
        { src: 'cand:imp_glass_chime', gain: 0.45, rate: 1, at: 0.15 },
        { src: 'cand:imp_glass_chime', gain: 0.45, rate: 1.26, at: 0.27 },
        { src: 'cand:imp_glass_chime', gain: 0.5, rate: 1.5, at: 0.39 },
        { src: 'cand:imp_glass_chime', gain: 0.55, rate: 2, lp: 5000, at: 0.56 },
      ], { isNew: true }),
      cue('fan_bell_glow', 'ระฆังอุ่น ๆ "ดิ๊ง" + ประกายแก้ว', 'warm bell "ding" + glassy shimmer', [
        { src: 'cand:imp_bell_0', gain: 0.75, rate: 1.33, lp: 3000 },
        { src: 'cand:imp_glass_chime', gain: 0.3, rate: 1.5, at: 0.08 },
        { src: 'cand:imp_glass_chime', gain: 0.28, rate: 2, lp: 5000, at: 0.22 },
        { src: 'cand:imp_bell_0', gain: 0.25, rate: 2, lp: 4000, at: 0.36 },
      ], { isNew: true }),
      synth('syn_musicbox', 'กล่องดนตรีไล่โน้ตขึ้น (synth)', 'music-box arpeggio (synth)', 'musicbox', { isNew: true }),
      synth('syn_glow', 'คอร์ดอุ่น ๆ ค่อย ๆ ขึ้น + ประกายวิบวับ (synth)', 'warm chord swell + sparkles (synth)', 'glow', { isNew: true })] },

  // ---- rubbing (kind rub: a pad; the level comes from how fast you rub, like surfaceTools.js)
  { id: 'rub_glass', group: 'rub', kind: 'rub', th: 'ปาดกระจก · ปิดทอง · ต่อหลอดนีออน · ใส่กระจกสี', en: "squeegee · gilder · neon tube · glazier (rub 'glass')", code: "surfaceTools.js · bookshop · castle/glazing · cyber/neon",
    opts: [cur({ rub: RUB_NOW.glass }),
      rubv('glass_wet', 'ผ้าชื้น ทุ้มนุ่ม', 'damp cloth, softer', { type: 'bandpass', f: 700, q: 0.6, lfo: [1.2, 120], top: 1800, gain: 0.36, body: { f: 300, q: 0.7, gain: 0.5 } }),
      rubv('glass_squeak', 'ยางปาด มีหวีดนิด ๆ', 'rubber blade, a little squeak', { type: 'bandpass', f: 1400, q: 2.2, lfo: [3, 300], top: 3200, gain: 0.3 }),
      rubv('glass_airy', 'ใส ฟิ้ว', 'airy, cleaner', { type: 'bandpass', f: 1800, q: 0.5, lfo: [0.5, 400], top: 4500, gain: 0.24 })] },
  { id: 'rub_scrub', group: 'rub', kind: 'rub', th: 'แปรงขัด · ถูพื้น · ฟองน้ำ · กระดาษทราย · ทาปูน · ทาน้ำมัน', en: "brush · mop · sponge · sander · limewash · oil (rub 'scrub')", code: "surfaceTools.js · cabin · bookshop · castle · cyber · pottery",
    opts: [cur({ rub: RUB_NOW.scrub }),
      rubv('scrub_bristle', 'ขนแปรงกรอบขึ้น', 'crisper bristles', { type: 'bandpass', f: 1700, q: 0.6, lfo: [11, 500], top: 4200, gain: 0.28, body: { f: 500, q: 0.8, gain: 0.4 } }),
      rubv('scrub_soft', 'ขัดทุ้ม นุ่ม', 'duller, softer', { type: 'bandpass', f: 800, q: 0.9, lfo: [4, 200], top: 1800, gain: 0.38 }),
      rubv('scrub_stroke', 'อันเดิม + จังหวะถูไปมา', 'current + back-and-forth pulse', { ...RUB_NOW.scrub, am: [4.5, 0.45] })] },
  { id: 'rub_roll', group: 'rub', kind: 'rub', th: 'ลูกกลิ้งทาสี · ยาแนว', en: "paint roller · caulk (rub 'roll')", code: "surfaceTools.js roller · cabin caulk",
    opts: [cur({ rub: RUB_NOW.roll }),
      rubv('roll_sticky', 'หนึบ ๆ แฉะ ๆ', 'sticky, tacky', { type: 'bandpass', f: 450, q: 1.6, lfo: [5, 180], top: 1400, gain: 0.34, am: [9, 0.35] }),
      rubv('roll_deep', 'ทุ้มลึก', 'deeper', { type: 'bandpass', f: 380, q: 0.8, lfo: [1.5, 120], top: 1200, gain: 0.4 }),
      rubv('roll_file', 'ไฟล์ loop เดิม (rolling — มีในเกมแต่ไม่ได้ใช้)', 'the unused rolling loop file', { file: 'sfx/roll_loop.ogg', type: 'lowpass', f: 1800, q: 0.5, lfo: [0.5, 0], top: 1800, gain: 0.6 })] },
  { id: 'rub_feather', group: 'rub', kind: 'rub', th: 'ไม้ขนไก่ปัดฝุ่น (ร้านหนังสือ)', en: "feather duster (rub 'feather')", code: 'bookshop/tools.js duster',
    opts: [cur({ rub: RUB_NOW.feather }),
      rubv('feather_soft', 'นุ่มลง ไม่ซ่า', 'softer, less hiss', { type: 'bandpass', f: 2200, q: 0.5, lfo: [6, 700], top: 5000, gain: 0.27, body: { f: 400, q: 0.7, gain: 0.6 } }),
      rubv('feather_flutter', 'ระริกเร็วขึ้น', 'faster flutter', { type: 'bandpass', f: 2600, q: 0.8, lfo: [16, 1100], top: 6000, gain: 0.22, body: { f: 600, q: 0.6, gain: 0.45 }, am: [14, 0.4] }),
      rubv('feather_breath', 'เหมือนลมหายใจ', 'breathy', { type: 'bandpass', f: 1600, q: 0.4, lfo: [3, 500], top: 4000, gain: 0.3, body: { f: 350, q: 0.6, gain: 0.8 } })] },
  { id: 'rub_sweep', group: 'rub', kind: 'rub', rhythm: true, th: 'ไม้กวาดกิ่งไม้กวาดพื้นหิน (ปราสาท)', en: "twig broom on stone (rub 'sweep')", code: 'castle/tools.js broom',
    opts: [cur({ rub: RUB_NOW.sweep }),
      rubv('sweep_dry', 'กิ่งแห้งครูดหิน', 'dry twigs scratching stone', { type: 'bandpass', f: 2400, q: 0.9, lfo: [20, 700], top: 5500, gain: 0.24, body: { f: 900, q: 0.9, gain: 0.35 }, am: [18, 0.5] }),
      rubv('sweep_soft', 'ไม้กวาดนุ่ม', 'soft broom', { type: 'bandpass', f: 1600, q: 0.5, lfo: [8, 400], top: 4200, gain: 0.32, body: { f: 500, q: 0.7, gain: 0.5 } }),
      rubv('sweep_straw', 'ฟางซ่า ๆ', 'straw hush', { type: 'bandpass', f: 2600, q: 0.45, lfo: [5, 800], top: 5500, gain: 0.28, body: { f: 700, q: 0.7, gain: 0.35 } })] },

  // ---- level sounds
  { id: 'cabin_draft', group: 'levels', th: 'ลมโกรกดับเทียน (กระท่อม)', en: 'a draft blows a candle out (cabin)', gain: 0.45, when: 'เทียนตั้งใกล้ช่องลมเกิน 1.4 วิ', code: "levels/cabin.js · sound('cancel', { gain: 0.45, rate: 0.7 })",
    opts: [cur({ sfx: 'cancel' }, { rate: 0.7 }), cand('rpg_cloth34', { rate: 0.7 }), synth('syn_puff', 'ลมพัดฟู่ (synth)', 'a puff of air (synth)', 'puff')] },
  { id: 'castle_glass', group: 'levels', th: 'ใส่กระจกสีกลับเข้าช่อง (ปราสาท)', en: 'mend a stained-glass pane (castle)', gain: 0.55, when: 'ทุกช่องที่ซ่อม', code: "castle/glazing.js · sound('click', { gain: 0.55, rate: 1.7–2.0 })",
    opts: [cur({ sfx: 'click' }, { rate: [1.7, 2.0] }), cand('imp_glass_light'), cand('ifc_glass'),
      cue('glass_seat', 'กริ๊งแก้ว + ต็อกลงร่อง', 'glass tap + seated tok', [
        { src: 'cand:imp_glass_light', gain: 0.7, rate: [0.95, 1.1], lp: 3500 },
        { src: 'cand:rpg_bookplace', gain: 0.35, rate: [1.15, 1.3] },
      ])] },
  { id: 'neon_strike', group: 'levels', th: 'หลอดนีออนติด (ซอยนีออน)', en: 'a neon tube strikes (neon alley)', gain: 0.45, when: 'ต่อหลอดเสร็จหนึ่งเส้น: ติ๊ก 4 ครั้งใน 0.42 วิ เสียงสูงขึ้นทีละนิด', code: "cyber/neon.js · sound('switch', { gain: 0.45, rate: 1.25 + 0.12k })",
    pattern: [[0, 0], [0.13, 0.12], [0.28, 0.24], [0.42, 0.36]],
    opts: [cur({ sfx: 'switch' }, { rate: 1.25 }), cand('ui_switch10', { rate: 1.1 }), cand('ifc_glitch'), synth('syn_neon', 'ติ๊ก + หึ่งไฟฟ้า (synth)', 'tick + mains buzz (synth)', 'neon')] },
  { id: 'kiln_brick', group: 'levels', th: 'ก้อนอิฐเตาเผาลงที่ (สตูดิโอปั้น)', en: 'a kiln brick lands (pottery)', gain: 0.45, when: 'อิฐแต่ละก้อนบินลงช่อง', code: "pottery/kiln.js · sound('plank', { gain: 0.45, rate: 1.35 })",
    burst: [3, 0.2],
    opts: [cur({ sfx: 'plank' }, { rate: 1.35 }), cand('imp_concrete'), cand('imp_mining'), cand('imp_plate')] },
  { id: 'pot_dry', group: 'levels', th: 'กระถางตากแดดแห้ง (สตูดิโอปั้น)', en: 'a pot dries in the sun (pottery)', gain: 0.35, when: 'กระถางแต่ละใบแห้งครบ', code: "pottery/sun.js · sound('click', { gain: 0.35, rate: 1.5 })",
    opts: [cur({ sfx: 'click' }, { rate: 1.5 }), cand('ifc_pluck'), cand('imp_plate', { rate: 1.3 }), cand('ifc_select_006')] },
  { id: 'paint_reload', group: 'levels', th: 'จุ่มลูกกลิ้งในถาดสี', en: 'reload the roller in the tray', gain: 0.7, when: 'คลิกถาดสีตอนถือลูกกลิ้ง', code: "surfaceTools.js · sound('drop_soft', { gain: 0.7, rate: 0.8 })",
    opts: [cur({ sfx: 'drop_soft' }, { rate: 0.8 }), cand('owl_drink'), cand('imp_carpet', { rate: 0.8 }), synth('syn_squelch', 'แปะ แฉะ ๆ (synth)', 'wet squelch (synth)', 'squelch')] },

  // ---- ambience (kind amb: loops, ▶ = on/off)
  { id: 'amb_day', group: 'amb', kind: 'amb', th: 'กลางวัน: นก', en: 'day: birds', when: 'ทุกด่านก่อน 0.8 (พลบค่ำ)', code: "ui/cues.js refreshAmbience · 'day'", opts: [cur({ amb: 'day' })] },
  { id: 'amb_night', group: 'amb', kind: 'amb', th: 'กลางคืน: จิ้งหรีด', en: 'night: crickets', when: 'ทุกด่านหลัง 0.8 — รวมซอยนีออนที่เริ่มพลบค่ำ', code: "ui/cues.js refreshAmbience · 'night'", opts: [cur({ amb: 'night' })] },
  { id: 'amb_fire', group: 'amb', kind: 'amb', th: 'เตาผิงติด', en: 'fireplace lit', when: 'เมื่อไฟในเตาติด — ซอยนีออนใช้เป็นเสียงเตาแก๊สด้วย', code: "ui/cues.js refreshAmbience · 'fire'", opts: [cur({ amb: 'fire' })] },
  { id: 'cyber_rain', group: 'amb', kind: 'amb', neon: true, th: 'ซอยนีออน: ฝนกระทบหน้าต่าง', en: 'neon alley: rain on the window (instead of crickets)', when: 'ห้องเช่าเหนือร้านบะหมี่ เมืองฝนพรำ — ทั้งวัน (กลางวันเบาลง ×3.5)', code: "levels/cyber.js def.ambience · 'rain' (gain 6, lp 3000)",
    opts: [cur({ amb: 'rain' }, { gain: 6, lp: 3000, th: 'ตอนนี้: ฝนผ่านกระจก (ตัดแหลม 3 kHz)', en: 'now: rain through the glass' }), { id: 'crickets', th: 'เดิม: จิ้งหรีดบ้านทุ่ง', en: 'before: countryside crickets', src: { amb: 'night' } }, cand('loop_rain', { gain: 5 }),
      synth('syn_rain', 'ฝนพรำบนกระจก (synth)', 'drizzle on the pane (synth)', 'rain'),
      synth('syn_rain_heavy', 'ฝนหนักขึ้น (synth)', 'heavier rain (synth)', 'rainHeavy')] },
  { id: 'cyber_city', group: 'amb', kind: 'amb', neon: true, th: 'ซอยนีออน: เมืองไกล ๆ', en: 'neon alley: distant city hum', when: 'ชั้นใหม่ ทั้งวัน — ฮัมต่ำ ๆ ของเมือง', code: "levels/cyber.js def.ambience · 'city' (gain 0.9)",
    opts: [cur({ amb: 'city' }, { gain: 0.9, th: 'ตอนนี้: ฮัมเมือง (loop_ambient_01)', en: 'now: city hum' }), { id: 'none', th: 'ไม่มี', en: 'nothing', src: { none: true } }, cand('loop_ambient_01', { gain: 1.2 }), cand('loop_ambient_03'), cand('loop_machine_11'),
      synth('syn_city', 'ฮัม + รถผ่านถนนเปียก (synth)', 'hum + cars on a wet road (synth)', 'city')] },
  { id: 'cyber_stove', group: 'amb', kind: 'amb', neon: true, th: 'ซอยนีออน: เตาแก๊ส (ฉากจบ ต้มบะหมี่)', en: 'neon alley: gas stove (instead of the fireplace)', when: 'จุดเตาต้มบะหมี่', code: "levels/cyber.js def.ambience · 'boil' (gain 1.8)",
    opts: [cur({ amb: 'boil' }, { gain: 1.8, th: 'ตอนนี้: หม้อเดือด (loop_boiling)', en: 'now: the pot boiling' }), { id: 'fireplace', th: 'เดิม: ไฟเตาผิง', en: 'before: fireplace crackle', src: { amb: 'fire' } }, cand('loop_boiling', { gain: 1.6 }), cand('loop_noise_02', { gain: 0.5 }),
      synth('syn_gas', 'แก๊สฟู่ + เปลวไฟ (synth)', 'gas hiss + flame roar (synth)', 'gas'),
      { id: 'syn_gas_boil', th: 'แก๊สฟู่ + น้ำเดือดในหม้อ', en: 'gas (synth) + pot boiling (loop)', src: { loops: [{ synth: 'gas', gain: 0.8 }, { cand: 'loop_boiling', gain: 1.3 }] } }] },

  // ---- music (listen only)
  { id: 'music_menu', group: 'music', kind: 'music', th: 'เมนู', en: 'menu', when: 'เมนู / สถานที่ / อัลบั้ม', code: "audio.music('menu')", opts: [cur({ music: 'menu' })] },
  { id: 'music_day1', group: 'music', kind: 'music', th: 'เล่น: กลางวัน 1', en: 'play: day 1', when: 'สุ่มวน day1–3 ก่อน 0.8', code: "musicFor('play')", opts: [cur({ music: 'day1' })] },
  { id: 'music_day2', group: 'music', kind: 'music', th: 'เล่น: กลางวัน 2', en: 'play: day 2', when: 'สุ่มวน day1–3', code: "musicFor('play')", opts: [cur({ music: 'day2' })] },
  { id: 'music_day3', group: 'music', kind: 'music', th: 'เล่น: กลางวัน 3', en: 'play: day 3', when: 'สุ่มวน day1–3', code: "musicFor('play')", opts: [cur({ music: 'day3' })] },
  { id: 'music_night', group: 'music', kind: 'music', th: 'เล่น: กลางคืน', en: 'play: night', when: 'หลัง 0.8', code: "musicFor('play')", opts: [cur({ music: 'night' })] },
];
for (const r of ROWS) r.kind ??= 'sfx';

// where the game's current sounds came from (tools/fetch_audio.py)
const NOW_SRC = {
  click: 'Kenney UI Audio · click1 · CC0', hover: 'Kenney UI Audio · rollover1 · CC0', rotate: 'Kenney UI Audio · switch5 · CC0',
  blocked: 'Kenney Interface · error_002 · CC0', task: 'Kenney Interface · confirmation_001 · CC0', switch: 'Kenney RPG · metalClick · CC0',
  shutter: 'OpenGameArt photo.ogg · CC0', pickup: 'Kenney RPG · handleSmallLeather ×2 · CC0', cancel: 'Kenney RPG · cloth1–2 · CC0',
  drop: 'Kenney Impact · impactWood_light_000–002 · CC0', drop_soft: 'Kenney Impact · impactSoft_medium_000–001 · CC0',
  plank: 'Kenney Impact · impactPlank_medium_000–003 · CC0', creak: 'Kenney RPG · creak1–3 · CC0',
  bin: 'Kenney Impact · impactGeneric_light_000–002 · CC0', rustle: 'OwlishMedia · Plastic_05 · CC0',
  box_open: 'Yucchi · CardboardCrackle2 · CC-BY 3.0', sting: 'Kenney Jingles · PIZZI10 · CC0', fanfare: 'Kenney Jingles · PIZZI14 · CC0',
  pry: 'Kenney Impact wood_light_003/004 + Yucchi CardboardCrackle1/3 (CC-BY 3.0)',
  day: 'isaiah658 birds (OpenGameArt) · CC0', night: 'crickets_1 (OpenGameArt) · CC0', fire: 'fire-1 (OpenGameArt) · CC0',
  music: 'Kevin MacLeod (incompetech.com) · CC-BY 4.0',
  rub: 'audio.js RUB · สร้างในเบราว์เซอร์ · synth',
};

// ---- data ------------------------------------------------------------------------------------
let INDEX = { music: {}, ambience: {}, sfx: {} };
let CANDS = new Map();
let CAND_JSON = null;
let STATS = null;
const getJSON = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
export async function loadData(base = BASE) {
  BASE = base;
  const [index, cands, stats] = await Promise.all([
    getJSON(`${BASE}index.json`), getJSON(`${BASE}candidates/candidates.json`), getJSON(`${BASE}candidates/soundcheck.json`),
  ]);
  if (index) INDEX = { music: {}, ambience: {}, sfx: {}, ...index };
  CAND_JSON = cands;
  CANDS = new Map((cands?.candidates ?? []).map((c) => [c.id, c]));
  // "current" = what the game plays now: an sfx id that audio.js has made a cue plays that cue
  for (const row of ROWS) {
    for (const opt of row.opts) {
      const id = opt.current && (opt.src.game ?? opt.src.sfx ?? (opt.src.cue === PRY_NOW ? 'pry' : null));
      const gc = id && GAME_CUES[id];
      if (gc) opt.src = { game: id, cue: { ...gc, layers: gc.layers.map((L) => ({ ...L, src: `sfx:${L.id}` })) } };
    }
  }
  STATS = stats?.files ?? null;
  return { index: !!index, cands: !!cands, stats: !!stats };
}
const variantsOf = (v) => (v == null ? [] : [v].flat());
// the files a source can play (variants)
function filesOf(src) {
  if (!src) return [];
  if (typeof src === 'string') {
    const [k, id] = src.split(':');
    return filesOf({ [k]: id });
  }
  if (src.sfx) return variantsOf(INDEX.sfx[src.sfx]);
  if (src.files) return src.files;
  if (src.cand) return CANDS.get(src.cand)?.files ?? [];
  if (src.amb) return variantsOf(INDEX.ambience[src.amb]);
  if (src.cue) return src.cue.layers.flatMap((L) => filesOf(L.src));
  if (src.loops) return src.loops.flatMap((L) => filesOf(L));
  if (src.rub?.file) return [src.rub.file];
  return [];
}

// ---- audio: context + buses ------------------------------------------------------------------
let ctx = null;
let master = null;
const buses = {};
const T = { started: 0, errors: [] }; // test hooks (tools + .tmp checks read window.__board)
function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = vol();
    master.connect(ctx.destination);
    for (const [b, v] of Object.entries(BUS)) {
      buses[b] = ctx.createGain();
      buses[b].gain.value = v;
      buses[b].connect(master);
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const vol = () => +(document.getElementById('vol')?.value ?? 0.8);

// decoded buffers, shared by the live and offline contexts (an AudioBuffer isn't tied to one)
const bufs = new Map();
function loadBuf(c, file) {
  if (!bufs.has(file)) {
    bufs.set(file, fetch(BASE + file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${file}`))))
      .then((b) => c.decodeAudioData(b))
      .catch((e) => { T.errors.push(String(e)); return null; }));
  }
  return bufs.get(file);
}
const ready = new Map(); // file → AudioBuffer once loaded
async function prepare(c, src) {
  await Promise.all(filesOf(src).map(async (f) => { const b = await loadBuf(c, f); if (b) ready.set(f, b); }));
}
function startSrc(node, t, offset = 0) {
  node.start(t, offset);
  T.started++;
}

// white noise, a second of it per context (the one-shot synths)
const whites = new WeakMap();
function white(c) {
  if (!whites.has(c)) {
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    const r = mulberry(99);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    whites.set(c, b);
  }
  return whites.get(c);
}
function filt(c, type, f, q = 0.7) {
  const n = c.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}

// ---- one-shots -------------------------------------------------------------------------------
// one play of a file source (random variant, like audio.js sfx(): ±5% rate)
function playFile(c, dest, files, t, { gain = 1, rate = 1, lp = 0, vary = 0.05 }) {
  const f = pickOne(files);
  const buf = ready.get(f);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate * (1 + (rand() * 2 - 1) * vary);
  let node = src;
  if (lp) node = node.connect(filt(c, 'lowpass', lp, 0.5));
  const g = c.createGain();
  g.gain.value = gain;
  node.connect(g).connect(dest);
  startSrc(src, t);
}
// a layered cue (audio.js scheduleCue, with layer.src naming the files)
function playCue(c, dest, spec, t, gain = 1, rate = 1) {
  for (const L of spec.layers) {
    const files = filesOf(L.src);
    if (!files.length) continue;
    playFile(c, dest, files, t + within(L.at, 0) / rate, { gain: (L.gain ?? 1) * gain, rate: within(L.rate, 1) * rate, lp: L.lp, vary: 0 });
  }
}
// a struck, bell-like note: a few sine partials, each dying away at its own pace
function tine(c, dest, t, f, g, { decay = 0.7, partials = [[1, 1, 1], [2, 0.22, 0.45], [3, 0.07, 0.25], [5.4, 0.035, 0.08]] } = {}) {
  for (const [mul, amp, dk] of partials) {
    const o = c.createOscillator();
    o.frequency.value = f * mul;
    const e = c.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g * amp, t + 0.004);
    e.gain.setTargetAtTime(0, t + 0.004, decay * dk);
    o.connect(e).connect(dest);
    startSrc(o, t);
    o.stop(t + 0.1 + decay * dk * 7);
  }
}
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI note → Hz
// little synths for sounds no file here has
const SYNTH = {
  // room finished: a music box running up a warm major arpeggio and settling on a soft chord
  musicbox(c, dest, t, g) {
    const out = c.createGain();
    out.gain.value = g;
    out.connect(filt(c, 'lowpass', 4200, 0.5)).connect(dest);
    [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [83, 0.52], [79, 0.64]].forEach(([n, at]) => tine(c, out, t + at, NOTE(n), 0.22, { decay: 0.55 }));
    for (const n of [72, 76, 84]) tine(c, out, t + 0.86, NOTE(n), 0.14, { decay: 1.1 }); // the last chord rings on
  },
  // room finished: a warm chord swelling in under a few high sparkles, then fading — a glow
  glow(c, dest, t, g) {
    const pad = c.createGain();
    pad.gain.setValueAtTime(0, t);
    pad.gain.linearRampToValueAtTime(0.055 * g, t + 0.45);
    pad.gain.setTargetAtTime(0, t + 1.1, 0.6);
    const lp = filt(c, 'lowpass', 700, 0.6);
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1800, t + 0.6);
    pad.connect(lp).connect(dest);
    for (const n of [60, 64, 67, 71, 74]) { // Cmaj9, each note two slightly detuned triangles
      for (const det of [-5, 5]) {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = NOTE(n);
        o.detune.value = det;
        o.connect(pad);
        startSrc(o, t);
        o.stop(t + 4.5);
      }
    }
    // a soft breath of air rising under it
    const src = c.createBufferSource();
    src.buffer = white(c);
    src.loop = true;
    const bp = filt(c, 'bandpass', 500, 0.9);
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.9);
    const ag = c.createGain();
    ag.gain.setValueAtTime(0, t);
    ag.gain.linearRampToValueAtTime(0.05 * g, t + 0.35);
    ag.gain.setTargetAtTime(0, t + 0.6, 0.25);
    src.connect(bp).connect(ag).connect(dest);
    startSrc(src, t);
    src.stop(t + 2.5);
    // sparkles: high pentatonic pings scattered over the swell
    [[84, 0.3], [88, 0.46], [91, 0.6], [86, 0.78], [93, 0.95], [96, 1.15]].forEach(([n, at]) => tine(c, dest, t + at, NOTE(n), 0.07 * g, { decay: 0.35, partials: [[1, 1, 1], [2.76, 0.12, 0.3]] }));
  },
  // a breath of air: noise swept down through a band
  puff(c, dest, t, g, r) {
    const src = c.createBufferSource();
    src.buffer = white(c);
    const bp = filt(c, 'bandpass', 900 * r, 0.8);
    bp.frequency.setValueAtTime(900 * r, t);
    bp.frequency.exponentialRampToValueAtTime(260 * r, t + 0.4);
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1.6 * g, t + 0.04);
    env.gain.setTargetAtTime(0, t + 0.06, 0.12);
    src.connect(bp).connect(filt(c, 'lowpass', 2000)).connect(env).connect(dest);
    startSrc(src, t, rand() * 0.3);
    src.stop(t + 0.9);
  },
  // wet paint: a resonant low-pass snapping shut + a small low blop
  squelch(c, dest, t, g, r) {
    const src = c.createBufferSource();
    src.buffer = white(c);
    const lp = filt(c, 'lowpass', 1400 * r, 4);
    lp.frequency.setValueAtTime(1400 * r, t);
    lp.frequency.exponentialRampToValueAtTime(240 * r, t + 0.12);
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5 * g, t + 0.006);
    env.gain.setTargetAtTime(0, t + 0.02, 0.05);
    src.connect(lp).connect(env).connect(dest);
    startSrc(src, t, rand() * 0.5);
    src.stop(t + 0.4);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(220 * r, t);
    o.frequency.exponentialRampToValueAtTime(90 * r, t + 0.08);
    const og = c.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.35 * g, t + 0.005);
    og.gain.setTargetAtTime(0, t + 0.01, 0.03);
    o.connect(og).connect(dest);
    startSrc(o, t);
    o.stop(t + 0.3);
  },
  // a neon tube catching: a dry tick and a burst of 100 Hz mains buzz; the last one hums on
  neon(c, dest, t, g, r, k = 0, n = 1) {
    const last = k === n - 1;
    const src = c.createBufferSource();
    src.buffer = white(c);
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.9 * g, t + 0.001);
    env.gain.setTargetAtTime(0, t + 0.002, 0.004);
    src.connect(filt(c, 'highpass', 1000)).connect(filt(c, 'lowpass', 3000)).connect(env).connect(dest);
    startSrc(src, t, rand() * 0.5);
    src.stop(t + 0.1);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 100;
    const bg = c.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.35 * g, t + 0.005);
    bg.gain.setTargetAtTime(last ? 0.08 * g : 0, t + 0.03, last ? 0.08 : 0.03);
    if (last) bg.gain.setTargetAtTime(0, t + 0.5, 0.25);
    o.connect(filt(c, 'bandpass', 500 * r, 1.4)).connect(bg).connect(dest);
    startSrc(o, t);
    o.stop(t + (last ? 1.8 : 0.3));
  },
};

function optRate(opt, use, k, row) {
  const add = row.pattern ? row.pattern[k][1] : 0;
  return (within(opt.rate, 1) + add) * (use?.rate ?? 1);
}
function optGain(row, opt, use) {
  return (row.gain ?? 1) * (use?.gain ?? 1) * (opt.gain ?? 1);
}
// schedule one play of an option at time t (its files must be prepared)
function playOpt(c, dest, row, opt, t, use = null, k = 0) {
  const gain = optGain(row, opt, use);
  const rate = optRate(opt, use, k, row);
  const s = opt.src;
  if (s.cue) playCue(c, dest, s.cue, t, gain, rate);
  else if (s.synth) SYNTH[s.synth](c, dest, t, gain, rate, k, row.pattern?.length ?? 1);
  else playFile(c, dest, filesOf(s), t, { gain, rate, lp: opt.lp, vary: 0.05 });
}
// the whole thing a row plays for one press: a pattern (neon), or one hit
function playPress(c, dest, row, opt, t0, use) {
  if (row.pattern) row.pattern.forEach(([at], k) => playOpt(c, dest, row, opt, t0 + at, use, k));
  else playOpt(c, dest, row, opt, t0, use);
}

// ---- rubbing: audio.js rub() (copied) + am (a pulse in the level) + file (a loop, not noise) ---
const pinks = new WeakMap();
function pinkNoise(c) {
  if (pinks.has(c)) return pinks.get(c);
  const n = c.sampleRate * 3;
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  const fade = Math.floor(c.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) d[n - fade + i] = d[n - fade + i] * (1 - i / fade) + d[i] * (i / fade);
  pinks.set(c, buf);
  return buf;
}
function makeRub(c, dest, spec) {
  const src = c.createBufferSource();
  src.buffer = spec.file ? ready.get(spec.file) : pinkNoise(c);
  src.loop = true;
  const f = filt(c, spec.type, spec.f, spec.q);
  const top = filt(c, 'lowpass', spec.top, 0.707);
  const g = c.createGain();
  g.gain.value = 0;
  let out = g;
  const nodes = [src];
  if (spec.am) {
    // the level pulsing with each stroke / twig: 1 - depth .. 1
    const amp = c.createGain();
    amp.gain.value = 1 - spec.am[1] / 2;
    const o = c.createOscillator();
    o.frequency.value = spec.am[0];
    const d = c.createGain();
    d.gain.value = spec.am[1] / 2;
    o.connect(d).connect(amp.gain);
    o.start();
    nodes.push(o);
    g.connect(amp);
    out = amp;
  }
  src.connect(f).connect(top).connect(g);
  out.connect(dest);
  if (spec.body) {
    const b = filt(c, 'bandpass', spec.body.f, spec.body.q);
    const bg = c.createGain();
    bg.gain.value = spec.body.gain;
    src.connect(b).connect(bg).connect(g);
  }
  const lfo = c.createOscillator();
  lfo.frequency.value = spec.lfo[0];
  const depth = c.createGain();
  depth.gain.value = spec.lfo[1];
  lfo.connect(depth).connect(f.frequency);
  lfo.start();
  nodes.push(lfo);
  startSrc(src, 0, rand() * (src.buffer ? src.buffer.duration : 1));
  let level = 0;
  return {
    set(v) {
      v = Math.max(0, Math.min(1, v));
      if (v === level) return;
      level = v;
      g.gain.setTargetAtTime(v * spec.gain, c.currentTime, v > 0 ? 0.05 : 0.14);
    },
    stop() {
      g.gain.setTargetAtTime(0, c.currentTime, 0.05);
      const at = c.currentTime + 0.4;
      for (const n of nodes) try { n.stop(at); } catch { /* already stopped */ }
    },
  };
}
// the tools' level: loud as the pointer is fast (surfaceTools.js: 900 px/s = full)
function rubFollower() {
  let loud = 0;
  return (want, dt) => {
    loud += (want - loud) * Math.min(1, dt * 10);
    return loud > 0.03 ? 0.3 + 0.7 * loud : 0;
  };
}
// the castle broom (castle/tools.js): each stroke sweeps along the floor (loud with the foot's
// speed) and lifts back (hushed) — ~2 strokes a second
function broomFollower(speed = 2) {
  const REACH = 0.22;
  const STROKE = 0.42;
  const ease = (s) => s * s * (3 - 2 * s);
  let u = 0;
  let footX = 0;
  let amp = 0;
  let loud = 0;
  return (down, dt) => {
    amp += ((down ? 1 : 0) - amp) * Math.min(1, dt * (down ? 9 : 6));
    const prevX = footX;
    if (down) u = (u + dt * speed) % 1;
    let lift = 0;
    if (u < STROKE) footX = REACH * (2 * ease(u / STROKE) - 1);
    else {
      const s = ease((u - STROKE) / (1 - STROKE));
      footX = REACH * (1 - 2 * s);
      lift = 0.045 * Math.sin(Math.PI * s);
    }
    footX *= amp;
    const vx = (footX - prevX) / Math.max(dt, 1e-3);
    let lv = 0;
    if (down && amp > 0.3) lv = lift < 0.012 ? 0.2 + 0.8 * Math.min(1, Math.abs(vx) / 2.2) : 0.12;
    loud += (lv - loud) * Math.min(1, dt * 18);
    return loud > 0.03 ? loud : 0;
  };
}

// ---- ambience: files, and loops made here (seeded, so every render is the same) --------------
function biquad(type, f, q, sr) {
  const w = (2 * Math.PI * f) / sr;
  const cs = Math.cos(w);
  const a = Math.sin(w) / (2 * q);
  let b0;
  let b1;
  let b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = a; b1 = 0; b2 = -a; }
  const a0 = 1 + a;
  const a1 = (-2 * cs) / a0;
  const a2 = (1 - a) / a0;
  b0 /= a0; b1 /= a0; b2 /= a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
function pinkGen(r) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  return () => {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    return (b0 + b1 + b2 + w * 0.1848) * 0.2;
  };
}
// a steady stream sample-by-sample into n samples that loop without a seam (the run past
// the end is blended, equal-power, into the start)
function looped(n, fade, fn) {
  const tmp = new Float32Array(n + fade);
  for (let i = 0; i < n + fade; i++) tmp[i] = fn(i);
  const out = tmp.subarray(0, n).slice();
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    out[i] = tmp[i] * Math.sqrt(w) + tmp[n + i] * Math.sqrt(1 - w);
  }
  return out;
}
// short decaying pings (rain drops), wrapped round the loop
function drops(L, R, sr, r, count, [f0, f1], [t0, t1], [a0, a1]) {
  const n = L.length;
  for (let d = 0; d < count; d++) {
    const at = Math.floor(r() * n);
    const w = (2 * Math.PI * (f0 + r() * (f1 - f0))) / sr;
    const tau = (t0 + r() * (t1 - t0)) * sr;
    const amp = a0 + r() ** 3 * (a1 - a0);
    const pan = r();
    const ph = r() * 6.283;
    const len = Math.floor(tau * 5);
    const gl = Math.sqrt(1 - pan);
    const gr = Math.sqrt(pan);
    for (let i = 0; i < len; i++) {
      const v = amp * Math.exp(-i / tau) * Math.min(1, i / 30) * (0.65 * Math.sin(w * i + ph) + 0.35 * (r() * 2 - 1));
      const j = (at + i) % n;
      L[j] += v * gl;
      R[j] += v * gr;
    }
  }
}
const AMB_SYNTH = {
  // drizzle on the window: a soft hiss of rain outside, fine drops ticking on the pane and
  // now and then a fat one; the rain swells a little twice a loop
  rain: (sr, heavy = false) => {
    const secs = 12;
    const n = secs * sr;
    const r = mulberry(heavy ? 21 : 7);
    const ch = [0, 1].map((k) => {
      const p = pinkGen(r);
      const hp = biquad('hp', 450, 0.7, sr);
      const lp = biquad('lp', heavy ? 4200 : 5500, 0.7, sr);
      const bed = heavy ? 0.4 : 0.22;
      return looped(n, sr / 2, (i) => lp(hp(p())) * bed * (0.85 + 0.15 * Math.sin((2 * Math.PI * 2 * i) / n + k)));
    });
    drops(ch[0], ch[1], sr, r, (heavy ? 60 : 24) * secs, [1400, 3600], [0.003, 0.009], [0.004, 0.05]);
    drops(ch[0], ch[1], sr, r, (heavy ? 7 : 3) * secs, [550, 1200], [0.012, 0.028], [0.01, 0.05]);
    return ch;
  },
  rainHeavy: (sr) => AMB_SYNTH.rain(sr, true),
  // the city far off: a low rumble, a faint 100 Hz hum (neon ballasts), and now and then a car
  // going by on the wet road — a swell of tyre noise panned across
  city: (sr) => {
    const secs = 16;
    const n = secs * sr;
    const r = mulberry(11);
    const cars = [[0.22, 1], [0.66, -1]].map(([c, dir]) => ({ c: c * n, dir, w: 1.5 * sr }));
    const env = (i, car) => {
      let e = 0;
      for (const o of [-n, 0, n]) e += Math.exp(-(((i - car.c - o) / car.w) ** 2));
      return e;
    };
    const pan = (i, car) => {
      let d = i - car.c;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      return 0.5 + 0.42 * Math.tanh(d / car.w) * car.dir;
    };
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (let k = 0; k < 2; k++) {
      const p = pinkGen(r);
      const lp1 = biquad('lp', 380, 0.7, sr);
      const lp2 = biquad('lp', 380, 0.7, sr);
      const rum = looped(n, sr / 2, () => lp2(lp1(p())) * 0.17);
      const out = k ? R : L;
      for (let i = 0; i < n; i++) out[i] = rum[i] + 0.003 * Math.sin((2 * Math.PI * 100 * i) / sr);
    }
    const bp = biquad('bp', 520, 0.55, sr);
    const hp = biquad('hp', 1800, 0.7, sr);
    const tyre = looped(n, sr / 2, () => { const w = r() * 2 - 1; return bp(w) * 0.5 + hp(w) * 0.08; });
    for (const car of cars) {
      for (let i = 0; i < n; i++) {
        const v = tyre[i] * env(i, car) * 0.45;
        const p = pan(i, car);
        L[i] += v * Math.sqrt(1 - p);
        R[i] += v * Math.sqrt(p);
      }
    }
    return [L, R];
  },
  // a gas ring: the soft "fff" of the jet over the low, fluttering roar of the flame
  gas: (sr) => {
    const secs = 8;
    const n = secs * sr;
    const r = mulberry(5);
    const K = secs * 9; // flicker points (9 a second), wrapped
    const pts = Array.from({ length: K }, () => r());
    const flick = (i) => {
      const x = (i / n) * K;
      const a = Math.floor(x) % K;
      const t = x - Math.floor(x);
      const s = (1 - Math.cos(Math.PI * t)) / 2;
      return pts[a] * (1 - s) + pts[(a + 1) % K] * s;
    };
    const l1 = biquad('lp', 320, 0.7, sr);
    const l2 = biquad('lp', 320, 0.7, sr);
    const roar = looped(n, sr / 2, (i) => l2(l1(r() * 2 - 1)) * 0.5 * (0.7 + 0.3 * flick(i)));
    return [0, 1].map(() => {
      const bp = biquad('bp', 2200, 0.5, sr);
      const hiss = looped(n, sr / 2, () => bp(r() * 2 - 1) * 0.12);
      for (let i = 0; i < n; i++) hiss[i] += roar[i];
      return hiss;
    });
  },
};
const ambBufs = new Map();
function ambBuffer(c, name) {
  const key = `${name}@${c.sampleRate}`;
  if (!ambBufs.has(key)) {
    const chans = AMB_SYNTH[name](c.sampleRate);
    const b = c.createBuffer(chans.length, chans[0].length, c.sampleRate);
    chans.forEach((d, i) => b.getChannelData(i).set(d));
    ambBufs.set(key, b);
  }
  return ambBufs.get(key);
}
// start an ambience option looping; returns stop()
function startLoop(c, dest, opt, { fade = 0.8 } = {}) {
  const s = opt.src;
  const parts = s.loops ?? (s.none ? [] : [{ ...s, gain: 1 }]);
  const out = c.createGain();
  out.gain.setValueAtTime(0, c.currentTime);
  out.gain.linearRampToValueAtTime(opt.gain ?? 1, c.currentTime + fade);
  out.connect(dest);
  const srcs = [];
  for (const p of parts) {
    const buf = p.synth ? ambBuffer(c, p.synth) : ready.get(filesOf(p)[0]);
    if (!buf) continue;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = c.createGain();
    g.gain.value = p.gain ?? 1;
    src.connect(g).connect(out);
    startSrc(src, c.currentTime, rand() * buf.duration);
    srcs.push(src);
  }
  return () => {
    out.gain.cancelScheduledValues(c.currentTime);
    out.gain.setTargetAtTime(0, c.currentTime, 0.2);
    for (const s2 of srcs) s2.stop(c.currentTime + 1);
  };
}

// ---- measuring (tools/soundboard_stats.mjs) ---------------------------------------------------
const optKey = (row, opt) => `${row.id}~${opt.id}`;
const renderPath = (row, opt) => `candidates/_render/${optKey(row, opt)}.wav`;
// plain files at their own pitch are measured as they are; everything else is rendered first
function needsRender(row, opt) {
  if (row.kind === 'music' || opt.src.none) return false;
  if (row.kind === 'rub') return true;
  const s = opt.src;
  return !!(s.cue || s.synth || s.loops || opt.lp || row.pattern || (opt.rate && opt.rate !== 1));
}
export async function measureList(base = '/assets/audio/') {
  await loadData(base);
  const files = new Set();
  const renders = [];
  for (const row of ROWS) {
    for (const opt of row.opts) {
      if (needsRender(row, opt)) renders.push({ row: row.id, opt: opt.id, out: renderPath(row, opt) });
      else if (row.kind !== 'music') filesOf(opt.src).forEach((f) => files.add(f));
    }
  }
  // every current + candidate file, also the ones heard only inside cues
  for (const v of Object.values(INDEX.sfx)) variantsOf(v).forEach((f) => files.add(f));
  for (const v of Object.values(INDEX.ambience)) variantsOf(v).forEach((f) => files.add(f));
  for (const c of CANDS.values()) c.files.forEach((f) => files.add(f));
  return { files: [...files], renders };
}
// one option rendered offline (mono, seeded): 16-bit PCM as base64, for a WAV
export async function renderOption(rowId, optId, sr = 48000) {
  const row = ROWS.find((r) => r.id === rowId);
  const opt = row.opts.find((o) => o.id === optId);
  const secs = row.renderSecs ?? (row.kind === 'amb' ? 8 : row.kind === 'rub' ? 2 : row.pattern ? 2.2 : 1.6);
  const c = new OfflineAudioContext(1, Math.round(secs * sr), sr);
  await prepare(c, opt.src);
  const keep = rand;
  rand = mulberry(1234);
  try {
    if (row.kind === 'rub') makeRub(c, c.destination, opt.src.rub).set(0.85);
    else if (row.kind === 'amb') startLoop(c, c.destination, opt, { fade: 0.01 });
    else playPress(c, c.destination, { ...row, gain: 1 }, opt, 0.01, null); // (the option alone, like the files)
  } finally {
    rand = keep;
  }
  const d = (await c.startRendering()).getChannelData(0);
  const pcm = new Int16Array(d.length);
  for (let i = 0; i < d.length; i++) pcm[i] = Math.max(-1, Math.min(1, d[i])) * 32767;
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { sr, b64: btoa(bin) };
}

// ---- numbers next to each option --------------------------------------------------------------
function statsOf(row, opt) {
  if (!STATS) return null;
  if (needsRender(row, opt)) return STATS[renderPath(row, opt)] ?? null;
  const ss = filesOf(opt.src).map((f) => STATS[f]).filter((s) => s && !s.error);
  if (!ss.length) return null;
  const avg = (k) => ss.reduce((a, s) => a + s[k], 0) / ss.length;
  return {
    ms: Math.round(avg('ms')), peak: Math.max(...ss.map((s) => s.peak)), rms: +avg('rms').toFixed(1), centroid: Math.round(avg('centroid')),
    bands: [0, 1, 2, 3].map((i) => Math.round(ss.reduce((a, s) => a + s.bands[i], 0) / ss.length)), flat: +avg('flat').toFixed(3), n: ss.length,
  };
}
// one word: soundcheck.mjs's reading — centroid > ~2.5 kHz with > ~35% in 2–5 kHz is where
// playtesters said "แสบหู"; all of it under 500 Hz is a thump laptop speakers barely play
function verdict(s) {
  const [b0, , b2, b3] = s.bands;
  if (s.centroid > 2500 && b2 >= 35) return ['harsh', 'แสบ', 'harsh: centroid > 2.5 kHz and ≥ 35% in 2–5 kHz'];
  if (s.centroid > 2500 || b3 >= 30) return ['bright', 'สว่าง', 'bright: centroid > 2.5 kHz or ≥ 30% above 5 kHz'];
  if (s.centroid < 250 && b0 >= 95) return ['dull', 'ทึบ', 'low only: ≥ 95% under 500 Hz — laptop speakers barely play it'];
  return ['soft', 'นุ่ม', 'soft / balanced'];
}

// ---- page -------------------------------------------------------------------------------------
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}
const PICKS_KEY = 'dustlight.soundboard.picks.v1';
// rows whose options were redone: a pick saved before starts over at 'current' (bump to reset again)
const PICK_RESET = { fanfare: 2 };
function loadPicks() {
  let p;
  try { p = JSON.parse(localStorage.getItem(PICKS_KEY)) ?? {}; } catch { p = {}; }
  const seen = p._reset ?? {};
  let changed = false;
  for (const [row, v] of Object.entries(PICK_RESET)) {
    if (seen[row] === v) continue;
    delete p[row];
    seen[row] = v;
    changed = true;
  }
  p._reset = seen;
  if (changed) savePicks(p);
  return p;
}
function savePicks(p) {
  try { localStorage.setItem(PICKS_KEY, JSON.stringify(p)); } catch { /* private window: picks live until reload */ }
}
let picks = {};
const pickOf = (row) => picks[row.id] ?? 'current';

function label(row, opt) {
  const c = opt.src.cand ? CANDS.get(opt.src.cand) : null;
  if (opt.current) {
    const k = opt.src.sfx ?? opt.src.amb ?? (opt.src.cue ? 'pry' : opt.src.music ? 'music' : opt.src.rub ? 'rub' : null);
    const base = (f) => f.split('/').pop();
    const src = opt.src.none ? '—'
      : opt.src.game ? `ในเกมตอนนี้ · cue '${opt.src.game}' ใน audio.js: ${opt.src.cue.layers.map((L) => L.id).join(' + ')}`
        : opt.src.sfx ? `ในเกมตอนนี้ · ${filesOf(opt.src).map(base).join(', ') || '⚠ ไม่มีใน index.json'}`
          : NOW_SRC[k] ?? '';
    return { th: opt.th ?? 'เสียงตอนนี้', en: opt.en ?? 'current', src };
  }
  if (c) return { th: opt.th ?? c.th, en: opt.en ?? c.en, src: `${c.pack.replace('Kenney — ', 'Kenney ')} · ${c.license}${opt.lp ? ' · ปรับ · processed' : ''}` };
  if (opt.src.sfx) return { th: opt.th, en: opt.en, src: `${NOW_SRC[opt.src.sfx] ?? opt.src.sfx}${opt.lp || opt.rate || opt.gain ? ' · ปรับ · processed' : ''}` };
  const kind = opt.src.cue ? 'ซ้อนหลายชั้น · layered' : opt.src.synth || opt.src.rub ? 'สร้างในเบราว์เซอร์ · synth' : opt.src.loops ? 'synth + loop (CC0)' : 'ปรับจากอันเดิม · processed';
  return { th: opt.th, en: opt.en, src: kind };
}
function extra(row, opt) {
  const bits = [];
  const n = filesOf(opt.src).length;
  if (!opt.src.cue && !opt.src.loops && n > 1) bits.push(`${n} แบบสุ่ม`);
  if (opt.rate && !opt.current) bits.push(`${opt.rate}×`);
  if (opt.current && opt.rate) bits.push(`${Array.isArray(opt.rate) ? opt.rate.join('–') : opt.rate}× ในเกม`);
  if (opt.gain && opt.gain !== 1) bits.push(`เสียง ×${opt.gain}`);
  const missing = filesOf(opt.src).filter((f) => STATS && !STATS[f] && !needsRender(row, opt));
  return bits.join(' · ') + (missing.length ? ' · ⚠ ยังไม่มีตัวเลข' : '');
}
function statsEl(row, opt) {
  const s = statsOf(row, opt);
  if (!s) return h('div', { class: 'stats none' }, STATS ? '—' : 'ยังไม่วัด');
  const [cls, word, why] = verdict(s);
  const tip = `${why}\npeak ${s.peak} dB · rms ${s.rms} dB · centroid ${s.centroid} Hz\n<500 ${s.bands[0]}% · 500–2k ${s.bands[1]}% · 2–5k ${s.bands[2]}% · >5k ${s.bands[3]}% · flat ${s.flat}`;
  const looped = row.kind === 'rub' || row.kind === 'amb';
  return h('div', { class: 'stats', title: tip },
    h('span', { class: 'num' }, looped ? 'loop' : `${s.ms} ms`),
    h('span', { class: 'num' }, `${(s.centroid / 1000).toFixed(1)} kHz`),
    h('span', { class: 'bands', 'aria-label': `bands ${s.bands.join('/')}` }, s.bands.map((b, i) => h('i', { class: `b${i}`, style: `width:${b}%` }))),
    h('span', { class: `tag ${cls}` }, word));
}

const loopsOn = new Map(); // row id → { opt, stop }
function stopRowLoop(row) {
  const cur0 = loopsOn.get(row.id);
  if (!cur0) return;
  cur0.stop();
  loopsOn.delete(row.id);
  document.querySelectorAll(`[data-row="${row.id}"] .play.on`).forEach((b) => b.classList.remove('on'));
}
async function toggleLoop(row, opt, btn) {
  const c = ensureCtx();
  const was = loopsOn.get(row.id);
  stopRowLoop(row);
  if (was?.opt === opt) return;
  if (row.kind === 'music') {
    const el = new Audio(BASE + INDEX.music[opt.src.music]);
    el.crossOrigin = 'anonymous';
    const g = c.createGain();
    c.createMediaElementSource(el).connect(g).connect(buses.music);
    el.play().then(() => T.started++).catch((e) => T.errors.push(String(e)));
    loopsOn.set(row.id, { opt, stop: () => { g.gain.setTargetAtTime(0, c.currentTime, 0.2); setTimeout(() => { el.pause(); el.src = ''; }, 800); } });
  } else {
    await prepare(c, opt.src);
    loopsOn.set(row.id, { opt, stop: startLoop(c, buses.ambience, opt) });
  }
  btn.classList.add('on');
}
async function playOnce(row, opt, btn, use, burst = false) {
  const c = ensureCtx();
  await prepare(c, opt.src);
  const t0 = c.currentTime + 0.02;
  const [n, dt] = burst ? row.burst : [1, 0];
  for (let i = 0; i < n; i++) playPress(c, buses.sfx, row, opt, t0 + i * dt, use);
  btn.classList.add('on');
  setTimeout(() => btn.classList.remove('on'), 250 + n * dt * 1000);
}

// a rub row: which variant the pad plays, the pad, and auto / rhythm
function rubRow(row, card) {
  const st = { sel: row.opts[0], rub: null, down: false, travel: 0, auto: 0, last: 0, raf: 0 };
  let follow = rubFollower();
  let broom = broomFollower();
  const meter = h('i');
  const rhythm = h('input', { type: 'checkbox', checked: row.rhythm ? true : null });
  const pad = h('div', { class: 'pad', tabindex: 0 },
    h('span', {}, 'กดค้างแล้วถูไปมาบนนี้', h('small', {}, 'press and rub — louder the faster you move')),
    h('b', { class: 'meter' }, meter));
  const ensureRub = () => {
    const c = ensureCtx();
    if (!st.rub) st.rub = makeRub(c, buses.sfx, st.sel.src.rub);
    return st.rub;
  };
  const tick = (now) => {
    const dt = Math.min(0.05, (now - st.last) / 1000 || 0.016);
    st.last = now;
    let lv;
    if (row.rhythm && rhythm.checked) lv = broom(st.down || st.auto > 0, dt);
    else {
      let want = st.down ? Math.min(1, st.travel / dt / 900) : 0;
      if (st.auto > 0) want = 0.35 + 0.55 * Math.abs(Math.sin(st.auto * Math.PI * 2.2)); // a hand rubbing back and forth
      lv = follow(want, dt);
    }
    st.travel = 0;
    if (st.auto > 0) st.auto = Math.max(0, st.auto - dt);
    st.rub?.set(lv);
    meter.style.width = `${Math.round(lv * 100)}%`;
    if (st.down || st.auto > 0 || lv > 0) st.raf = requestAnimationFrame(tick);
    else st.raf = 0;
  };
  const run = () => { if (!st.raf) { st.last = performance.now(); st.raf = requestAnimationFrame(tick); } };
  const select = async (opt) => {
    if (st.sel === opt && st.rub) return;
    st.rub?.stop();
    st.rub = null;
    st.sel = opt;
    follow = rubFollower();
    broom = broomFollower();
    card.querySelectorAll('.opt').forEach((li) => li.classList.toggle('sel', li.dataset.opt === opt.id));
    if (opt.src.rub.file) await prepare(ensureCtx(), { rub: opt.src.rub });
  };
  pad.addEventListener('pointerdown', async (e) => {
    pad.setPointerCapture(e.pointerId);
    st.down = true;
    st.px = e.clientX;
    st.py = e.clientY;
    if (st.sel.src.rub.file) await prepare(ensureCtx(), { rub: st.sel.src.rub });
    ensureRub();
    run();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!st.down) return;
    st.travel += Math.hypot(e.clientX - st.px, e.clientY - st.py);
    st.px = e.clientX;
    st.py = e.clientY;
  });
  const up = () => { st.down = false; };
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  const auto = async (secs = 3) => {
    if (st.sel.src.rub.file) await prepare(ensureCtx(), { rub: st.sel.src.rub });
    ensureRub();
    st.auto = secs;
    run();
  };
  const tools = h('div', { class: 'rubtools' },
    h('button', { class: 'btn small', onclick: () => auto(3) }, '▶ ถูอัตโนมัติ 3 วิ', h('small', {}, 'auto')),
    row.rhythm ? h('label', { class: 'chk' }, rhythm, ' จังหวะไม้กวาด ~2 ครั้ง/วิ', h('small', {}, 'broom rhythm')) : null);
  return { pad, tools, select, preview: async (opt) => { await select(opt); auto(2.2); } };
}

function optionEl(row, opt, card, rub) {
  const lab = label(row, opt);
  const star = h('button', { class: 'star', title: 'เลือกอันนี้ · pick', 'aria-label': 'pick' });
  const li = h('li', { class: `opt${opt.current ? ' current' : ''}${rub && opt === row.opts[0] ? ' sel' : ''}`, 'data-opt': opt.id });
  const play = h('button', { class: 'play', title: row.kind === 'amb' || row.kind === 'music' ? 'เล่น / หยุด' : 'เล่น', 'aria-label': 'play' });
  play.addEventListener('click', () => {
    if (rub) rub.preview(opt);
    else if (row.kind === 'amb' || row.kind === 'music') toggleLoop(row, opt, play);
    else playOnce(row, opt, play, row.uses?.[0]);
  });
  const uses = row.kind === 'sfx' ? [
    ...(row.uses ?? []).slice(1).map((u) => h('button', { class: 'chip', title: `ตอน${u.th}`, onclick: (e) => playOnce(row, opt, e.currentTarget, u) }, `▸ ${u.th}`)),
    row.burst ? h('button', { class: 'chip', title: `${row.burst[0]} ครั้งติดกัน`, onclick: (e) => playOnce(row, opt, e.currentTarget, row.uses?.[row.burstUse ?? 0] ?? null, true) }, `▸ รัว ×${row.burst[0]}`) : null,
  ] : [];
  li.append(
    play,
    h('div', { class: 'name' },
      h('div', {}, opt.isNew ? h('span', { class: 'new' }, 'ใหม่') : null, h('b', {}, lab.th), ' ', h('span', { class: 'en' }, lab.en)),
      h('div', { class: 'src' }, lab.src, extra(row, opt) ? ` · ${extra(row, opt)}` : ''),
      uses.length ? h('div', { class: 'uses' }, uses) : null),
    row.kind === 'music' ? h('div', { class: 'stats none' }, '') : statsEl(row, opt),
    row.kind === 'music' ? h('span', { class: 'star ghost' }) : star);
  star.addEventListener('click', () => {
    if (opt.current) delete picks[row.id];
    else picks[row.id] = opt.id;
    savePicks(picks);
    refreshPicks(card, row);
  });
  return li;
}
function refreshPicks(card, row) {
  const p = pickOf(row);
  card.querySelectorAll('.opt').forEach((li) => {
    const on = li.dataset.opt === p;
    li.classList.toggle('picked', on);
    const s = li.querySelector('.star');
    if (s && !s.classList.contains('ghost')) s.textContent = on ? '★' : '☆';
  });
  card.classList.toggle('changed', p !== 'current');
  updateCount();
}
function rowEl(row) {
  const card = h('article', { class: `row glass kind-${row.kind}`, id: `row-${row.id}`, 'data-row': row.id });
  const rub = row.kind === 'rub' ? rubRow(row, card) : null;
  card.append(h('header', {},
    h('h3', {}, row.th, ' ', h('span', { class: 'en' }, row.en)),
    row.when ? h('p', { class: 'when' }, row.when) : null,
    h('code', { class: 'where' }, row.id, ' · ', row.code)));
  if (rub) card.append(h('div', { class: 'rubwrap' }, rub.pad, rub.tools));
  card.append(h('ol', { class: 'opts' }, row.opts.map((o) => optionEl(row, o, card, rub))));
  refreshPicks(card, row);
  return card;
}

function updateCount() {
  const n = ROWS.filter((r) => r.kind !== 'music' && pickOf(r) !== 'current').length;
  const el = document.getElementById('npicks');
  if (el) el.textContent = n ? `เปลี่ยน ${n} อย่าง` : 'ยังเป็นเสียงเดิมทั้งหมด';
}
function picksJSON() {
  const out = {};
  for (const r of ROWS) if (r.kind !== 'music') out[r.id] = pickOf(r);
  return JSON.stringify(out, null, 1);
}
async function copyPicks() {
  const text = picksJSON();
  const box = document.getElementById('picksOut');
  box.hidden = false;
  box.querySelector('pre').textContent = text;
  let ok;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = h('textarea', {}, text);
    document.body.append(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  box.querySelector('.msg').textContent = ok ? 'คัดลอกแล้ว — นำไปวางได้เลย' : 'คัดลอกเองจากกล่องนี้';
}
function stopAll() {
  for (const r of ROWS) stopRowLoop(r);
  if (ctx) {
    // hush everything on the buses for a moment (one-shots end by themselves)
    for (const b of Object.values(buses)) {
      b.gain.cancelScheduledValues(ctx.currentTime);
      b.gain.setValueAtTime(0, ctx.currentTime);
    }
    setTimeout(() => { for (const [k, b] of Object.entries(buses)) b.gain.setTargetAtTime(BUS[k], ctx.currentTime, 0.05); }, 300);
  }
}
// hear the three picked neon-alley layers together
let mixOn = false;
async function toggleMix(btn) {
  const rows = ROWS.filter((r) => r.neon);
  for (const r of rows) stopRowLoop(r);
  mixOn = !mixOn;
  btn.classList.toggle('on', mixOn);
  if (!mixOn) return;
  for (const r of rows) {
    const opt = r.opts.find((o) => o.id === pickOf(r)) ?? r.opts[0];
    const b = document.querySelector(`[data-row="${r.id}"] [data-opt="${opt.id}"] .play`);
    await toggleLoop(r, opt, b);
  }
}

async function mount(root) {
  window.__board = T;
  picks = loadPicks();
  const got = await loadData();
  T.ctx = () => ctx?.state ?? 'none';
  const unlock = () => {
    ensureCtx();
    const pill = document.getElementById('lock');
    const upd = () => {
      pill.textContent = ctx.state === 'running' ? 'เสียงพร้อม' : 'คลิกเพื่อเปิดเสียง';
      pill.classList.toggle('ok', ctx.state === 'running');
    };
    ctx.onstatechange = upd;
    upd();
  };
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });

  const warn = [];
  if (!got.cands) warn.push('ยังไม่มีไฟล์ตัวเลือก — รัน python tools/fetch_sound_candidates.py');
  if (!got.stats) warn.push('ยังไม่มีตัวเลขเสียง — รัน node tools/soundboard_stats.mjs (ตอน dev server เปิด)');
  if (!got.index) warn.push('ไม่พบ assets/audio/index.json — รัน npm run assets');

  const top = h('div', { class: 'top glass' },
    h('div', { class: 'brand' }, h('span', { class: 'logo' }, 'Dustlight'), h('span', {}, 'ห้องฟังเสียง', h('small', {}, 'sound board'))),
    h('div', { class: 'ctl' },
      h('span', { id: 'lock', class: 'pill' }, 'คลิกเพื่อเปิดเสียง'),
      h('label', { class: 'vol' }, h('span', {}, 'เสียงรวม'), h('input', { id: 'vol', type: 'range', min: 0, max: 1.5, step: 0.01, value: 0.8, oninput: (e) => master?.gain.setTargetAtTime(+e.target.value, ctx.currentTime, 0.03) })),
      h('button', { class: 'btn', onclick: stopAll }, '■ หยุด'),
      h('button', { class: 'btn primary', onclick: copyPicks }, 'คัดลอกที่เลือก')));
  const intro = h('section', { class: 'intro' },
    h('h1', {}, 'ฟังแล้วเลือกเสียงที่ฟินที่สุด'),
    h('p', {}, 'แต่ละแถวคือจังหวะหนึ่งในเกม: ▶ ฟัง · ☆ เลือก (แถวละอัน ค่าเริ่ม = เสียงตอนนี้) · เลือกครบแล้วกด ',
      h('b', {}, 'คัดลอกที่เลือก'), ' แล้วนำไปวาง. เบราว์เซอร์ล็อกเสียงไว้จนกว่าจะคลิกหนึ่งครั้ง — คลิกที่ไหนก็ได้ก่อน.'),
    h('p', { class: 'legend' }, 'ตัวเลขจาก tools/soundcheck.mjs: ยาว · ความสว่าง (centroid) · สัดส่วนย่าน ',
      h('span', { class: 'bands demo' }, h('i', { class: 'b0', style: 'width:25%' }), h('i', { class: 'b1', style: 'width:25%' }), h('i', { class: 'b2', style: 'width:25%' }), h('i', { class: 'b3', style: 'width:25%' })),
      ' <500 · 500–2k · 2–5k · >5k Hz · คำเดียว: ', h('span', { class: 'tag soft' }, 'นุ่ม'), ' ', h('span', { class: 'tag dull' }, 'ทึบ'), ' (ต่ำล้วน ลำโพงโน้ตบุ๊กแทบไม่ออก) ',
      h('span', { class: 'tag bright' }, 'สว่าง'), ' ', h('span', { class: 'tag harsh' }, 'แสบ'), ' (ย่านที่เพลย์เทสบอกว่าแสบหู) · ชี้ค้างที่ตัวเลขเพื่อดูละเอียด'),
    h('p', { id: 'npicks', class: 'count' }),
    warn.length ? h('p', { class: 'warn' }, warn.join(' · ')) : null,
    h('div', { id: 'picksOut', class: 'picks glass', hidden: true }, h('div', { class: 'msg' }), h('pre', {})));
  const nav = h('nav', { class: 'groups' }, GROUPS.map((g) => h('a', { href: `#g-${g.id}` }, g.th)));
  const sections = GROUPS.map((g) => {
    const rows = ROWS.filter((r) => r.group === g.id);
    const head = h('div', { class: 'ghead' }, h('h2', {}, g.th, ' ', h('span', { class: 'en' }, g.en)));
    if (g.id === 'amb') head.append(h('button', { class: 'btn small', onclick: (e) => toggleMix(e.currentTarget) }, '▶ ฟังรวม: ซอยนีออน 3 ชั้นที่เลือก', h('small', {}, 'rain + city + stove together')));
    if (g.id === 'rub') head.append(h('p', { class: 'note' }, 'ในเกมเสียงถูไม่ใช่ไฟล์ — สร้างจาก noise ตามความเร็วเมาส์ (audio.js RUB). ▶ ของแต่ละแบบ = เลือกให้แผ่นถูเล่นแบบนั้น + ถูอัตโนมัติ 2 วิ'));
    if (g.id === 'music') head.append(h('p', { class: 'note' }, 'ฟังอย่างเดียว — ยังไม่มีตัวเลือกเพลงอื่นในเครื่อง'));
    return h('section', { class: 'group', id: `g-${g.id}` }, head, rows.map(rowEl));
  });
  const credits = h('section', { class: 'credits glass' }, h('h2', {}, 'ที่มาของเสียง ', h('span', { class: 'en' }, 'sources & licenses')),
    h('ul', {}, Object.values(CAND_JSON?.packs ?? {}).map((p) => h('li', {}, `${p.name} · ${p.license} · `, h('a', { href: p.url, target: '_blank', rel: 'noopener' }, p.url)))),
    h('p', {}, 'CC-BY (ต้องใส่เครดิตในหน้า Credits ถ้าเลือกใช้):'),
    h('ul', {}, [...new Set([...CANDS.values()].map((c) => c.credit).filter(Boolean))].map((c) => h('li', {}, c))),
    h('p', {}, 'เพลง: Kevin MacLeod (incompetech.com) · CC-BY 4.0 · synth = สร้างในเบราว์เซอร์ ไม่มีไฟล์ ไม่มีลิขสิทธิ์ใคร'));
  root.append(top, h('main', { class: 'wrap' }, intro, nav, sections, credits));
  updateCount();
}

if (typeof document !== 'undefined' && document.getElementById('board') && !window.__boardMounted) {
  window.__boardMounted = true;
  mount(document.getElementById('board'));
}
