# คู่มือ dev — Dustlight

> วิธีรัน เครื่องมือตรวจ และโครงโค้ด สำหรับคนที่จะแก้เกม · หน้าแนะนำเกม (ภาษาอังกฤษ) อยู่ที่ [README](../README.md)

เกมซ่อมแต่งห้อง cutaway แนว cozy ได้แรงบันดาลใจจากเกม [Hozy](https://store.steampowered.com/app/3326230/Hozy/)
(Come On Studio / tinyBuild, UE5 + Lumen) — โจทย์หลักคือ **"แสงต้องสวย"** บนเบราว์เซอร์ด้วย three.js ล้วน:
GI แบบ probe ของจริง + โมเดล/เท็กซ์เจอร์ PBR (CC0) · ทุกงานที่ทำเสร็จต้องเห็นผลในแสงของห้อง

## Run

```
npm install
npm run assets     # ครั้งแรกเท่านั้น: โหลด Poly Haven 1k (~64 MB) + เพลง/เสียง (~56 MB) + ห้องของทุกด่าน ลง public/assets/ (ไม่อยู่ใน git; รันซ้ำได้)
npm run dev        # http://127.0.0.1:5190/
npm run check      # ESLint + build ตรวจ (ไม่บีบ asset, ออกที่ .tmp/check-build) — รันก่อนส่งงานทุกครั้ง ไม่กี่วินาที
npm run build      # build ปล่อยจริง → dist/ (~20 วิ) · npx vite preview --port 5198 แล้วใส่ --port=5198 ให้เครื่องมือเพื่อเทส build จริง
```

**build ปล่อยจริง (2026-09-30):** `vite build` + plugin ใน `vite.config.js` ทำต่อเอง: ① `tools/check_chunks.mjs` — build ล้มถ้ามี chunk ไหน
import chunk entry (main.js `await` โมดูลด่าน/ห้องที่ top level → chunk ด่านที่ import entry = หน้าโหลดค้างตลอดไปแบบไม่มี error; เคยเป็นจริง
5 ใน 6 ด่าน) — **ห้ามเพิ่ม top-level await นอก main.js** · ② `tools/optimize_assets.mjs` บีบ asset ที่ copy ไปใน `dist/` เท่านั้น (`public/`
ไม่ถูกแตะ): เอาเฉพาะไฟล์ที่เกมอ้างถึง, glTF = meshopt แบบ lossless (ไม่ quantize — KayKit อ่าน `uv.array` ตรง ๆ, cabin merge geometry) + เท็กซ์เจอร์
ใน glTF เป็น WebP q90 · `RAW_ASSETS=1` = ข้ามข้อ ② · โหลด glTF ผ่าน `src/gltf.js` เท่านั้น (มี meshopt decoder) · chunk: `main` (entry) / `app` /
`vendor` (three ฯลฯ — cache ข้ามรอบปล่อย) · วัดเวลาโหลด: `node tools/loadtime.mjs --dist=dist,<อีก build> --runs=2` (serve build เองพร้อม
จำกัดแบนด์วิดท์ — throttle ของ DevTools เพี้ยน) · ผล: meadow 41→24 MB, bookshop 44→26.5 MB, ที่ 10 Mbps พร้อมเล่น ~38→24 วิ; ด่านอื่น ~1 MB

เปิดมาเจอหน้าโหลด → คลิกเพื่อเริ่ม (คลิกนี้ปลดล็อกเสียงของเบราว์เซอร์ด้วย) → เมนูหลักบนห้องจริง → **สถานที่** → เล่น ·
**ด่าน** (`src/levels.js`): บ้านริมทุ่ง → กระท่อมริมทะเลสาบ → ร้านหนังสือเก่า → สตูดิโอช่างปั้น → ปราสาทบนเนิน → ซอยนีออน — ด่านถัดไปเปิดเมื่อด่านก่อนหน้าเสร็จ,
หน้าละด่าน `?level=<id>` (ไม่ใส่ = ด่านที่เล่นล่าสุด; ปุ่ม "ไปห้องถัดไป" ในหน้าเทียบก่อน/หลัง) · ซ่อมเสร็จแล้วเวลาในวันวนเอง
10 นาที/รอบ (ตั้งค่า → เวลาในวัน: วนเอง / หยุด) ·
`Esc` = พัก (ตั้งค่า / โหมดถ่ายรูป / กลับเมนู) · `P` = โหมดถ่ายรูป (เลื่อนเวลาในวันได้, `Space` = ถ่าย) ·
ภาษา ไทย/English สลับได้ที่เมนูหรือตั้งค่า · เซฟอัตโนมัติลง localStorage (`hearthlight.v1` — ชื่อเกมเดิม คงไว้โดยตั้งใจ: เปลี่ยน key แล้วเซฟของผู้เล่นหาย)

ตอนเล่น: ลากขวาหมุนกล้อง · **WASD / ลูกศร = เลื่อนกล้อง** (โหมดถ่ายรูปด้วย) · สกรอลซูม · ปุ่มซ้าย = เครื่องมือที่ถือ (1–6) · **มือ: คลิกของ = หยิบ, คลิกอีกที = วาง**
(ถืออยู่: ล้อเมาส์ = หมุน 15°, `R` = 90°, `Esc` / คลิกขวา = ยกเลิก) · ของชิ้นเล็กวางบนโต๊ะ/ชั้น/หิ้งได้ กรอบรูปแขวนผนัง ·
ช่วงแกะกล่อง: คลิกกล่อง = ของชิ้นต่อไปเข้ามือ, กดลากกล่อง = ย้าย, ยกของออกนอกห้อง = เข้ากล่องของเก็บ ·
คลิกขวาโคมไฟ / ท่อนไม้ในเตาผิงเพื่อเปิด-ปิด · งานที่เหลือเป็นงานมืออย่างเดียว (จุดไฟ ฯลฯ) → มือกลับมาในมือเอง ·
**หน้าสถานที่:** เส้นทางด่าน 1→N (เส้นทึบ = ผ่านแล้ว, ป้าย "อยู่ที่นี่" = ด่านของหน้านี้) + แผงรายละเอียดของจุดที่เลือก (ค่าเริ่ม = ด่านของหน้านี้)

**Timelapse:** ระหว่างเล่นเกมบันทึกสิ่งที่ทำ (`src/journal.js`) → ปุ่ม "▶ ดู timelapse" ในหน้าเทียบก่อน/หลัง และในการ์ดอัลบั้ม
เล่นย้อนทั้งห้องผ่านเครื่องมือจริงแบบเร่ง พร้อมเวลาเช้า→ค่ำ (`src/replay.js`, Esc = ข้าม)

อัลบั้มห้อง (เมนูหลัก): ห้องที่แต่งเสร็จเก็บให้เอง + ปุ่มเก็บในเมนูพัก · เปิดดูในโหมดถ่ายรูป · เก็บใน IndexedDB ·
**ห้องตัวอย่าง** 6 ห้องที่มากับเกม (`src/samples.json`: ห้อง เวลา สีผนัง กล้อง layout · ปก `public/ui/sample-<id>.jpg`) —
ห้อง meadow เปิดในที่ ห้องอื่นเปิดเป็นหน้าของตัวเอง `?view=<id>` (world สร้างได้ห้องเดียวต่อหน้า) แล้วกลับด้วย `?album`

Debug: ตั้งค่า → "โหมด debug" หรือ `?debug` = id ของที่ถือ / ที่ชี้อยู่ขึ้นมุมซ้ายล่าง (ไว้บอกว่าชิ้นไหนแปลก) · `__app.decor.describe()` · `__app.decor.moveTo(id, x, z, องศา)` · `__app.game.L.boxes` · `__app.album.list()` · `__app.state`

หน้า title: หลังเมนูมี timelapse เล่นทั้งด่านเองวนทุก ~45 วิ (`src/demo.js`, มีคำบรรยายแต่ละขั้นมุมขวาล่าง) — ห้องจริงของผู้เล่น
(เซฟ หรือเริ่มใหม่) โหลดตอนกดเล่น · ระหว่าง timelapse ไม่มีเสียงเอฟเฟกต์และไม่เซฟ

URL flags: `?level=<id>` (ด่านของหน้านี้) · `&go` (เข้าเล่นเลยไม่ผ่านเมนู — ที่ปุ่มห้องถัดไปใช้) · `?play` (ข้ามเมนูเข้าเล่นเลย) · `?dev` (แผงทดลองแสงเดิม + fps) · `?nohud` (ถ่ายภาพ: เข้าเล่นทันที ไม่มี UI ไม่อ่านเซฟ)
· `?nodemo` (หน้า title แบบห้องนิ่ง ไม่มี timelapse)
· `?view=<sample>` (ห้องตัวอย่างในโหมดถ่ายรูปบนหน้าของด่านห้องนั้น; `&t=` ทับเวลาของตัวอย่างได้; `&timelapse` เล่น timelapse ก่อน)
· `?album` (เปิดมาที่อัลบั้มเลย; `&open=<id>` เปิดห้องที่เก็บไว้) · `?daylen=<วินาที>` (รอบวันสั้น ไว้ทดสอบ)
· `?recdemo` (บันทึก journal ตอน timelapse หน้า title เล่น — ใช้ทำ timelapse ของห้องตัวอย่าง)
· `?t=0..1` (เวลา: 0 เช้า · 0.35 บ่าย · 0.62 golden hour · 0.8 พลบค่ำ · 1 กลางคืน)
`&cam=hero|window|fire|sofa|top` · `&paint=0..4` · `&tone=agx|aces|neutral` · `&pr=1.5` (render scale ตรง ๆ; ไม่ใส่ = ตามคุณภาพ:
low 0.8 · medium 1 · high ≥1.5 แม้จอ 1x) · `&nomsaa` (ปิด MSAA ไว้เทียบ)
· ปิดทีละเลเยอร์: `&nogi &noao &noshafts &nodust &nobloom`

โค้ด: `src/world.js` (ฉาก แสง GI loop) · `src/main.js` (boot + ต่อสายหน้าจอ) · `src/ui/*` (หน้าจอทีละส่วน: เมนู/สถานที่ ตั้งค่า ถ่ายรูป เวลาในวัน ก่อน/หลัง อัลบั้ม timelapse — แต่ละไฟล์เป็น `setupX(app)` รับ `app` ตัวเดียว ไม่ import กันเอง, ลำดับ setup มีผล ดูหัว main.js) · `src/input.js` · `src/decorate.js` ·
`src/i18n.js` (ข้อความทุกภาษา) · `src/save.js` · `src/audio.js` · `src/daycycle.js` ·
**ด่าน:** `src/levels.js` (ลำดับ + การ์ด) → `src/levels/<id>.js` (สภาพเริ่ม งาน กล่อง twist — รูปแบบที่หัว `levels/meadow.js`)
→ `src/level.js` (ตัวคุมด่าน) + ระบบ `trash` / `floor` / `walls` / `grime` / `floormask` / `boxes` · **ห้อง:**
`src/rooms/<id>.js` (สัญญาที่หัว `rooms/meadow.js`: เปลือก เฟอร์นิเจอร์ โคม กล้อง สีฟ้า + `sites` ที่ด่านทำงานได้) ·
helper ห้องกลาง `src/rooms/kit.js`

## Screenshot loop (ตรวจภาพและเล่นทดสอบด้วยสคริปต์)

```
node tools/shot.mjs <name> --gpu --q="t=0.62&nohud"      # รอ GI converge แล้วถ่าย → shots/
node tools/shot.mjs x --gpu --noshot --eval="(()=>...)()"   # รัน JS ในหน้า (มี window.__app)
python tools/sheet.py shots/_sheet.jpg a.png b.png ...       # ต่อภาพเทียบ
node tools/diff.mjs shots/a.png shots/b.png shots/_diff.png  # วัดภาพถดถอย: mean |Δ| + % พิกเซลที่เปลี่ยน + heat map
node tools/playthrough.mjs [--level=cabin]                # เล่นทั้งด่านตั้งแต่ห้องรกจน reveal + timelapse + การ์ด (PASS/FAIL, ~1.5 นาที)
node tools/soundcheck.mjs sfx/x.ogg [--lp=2000] / --cue=pry  # เสียงเป็นตัวเลข (ความสว่าง, ย่านความถี่, ยาว, ดัง) — ฟังไม่ได้ก็วัด "แสบหู" ได้
# http://127.0.0.1:5190/sounds.html = หน้าฟังเสียง (sound board): ทุกเสียงในเกม + ตัวเลือก กด ★ เสียงที่ชอบแล้วคัดลอกรายการที่เลือก
#   (ตัวเลือก: python tools/fetch_sound_candidates.py · ตัวเลข: node tools/soundboard_stats.mjs)
node tools/samplejournal.mjs [--level=cabin]              # timelapse ของห้องตัวอย่าง → public/samples/<id>-journal.json
node tools/covers.mjs [--only=cabin] [--cards]           # ปกห้องตัวอย่าง → public/ui/sample-<id>.jpg · --cards = รูปการ์ดสถานที่ level-<id>.jpg
node tools/daycycle.mjs [--rooms=meadow] [--cycle=40]      # รอบวันใน proto.html (▶ day): frame time ทั้งรอบ + shader compile · --shots = ภาพ 8 จังหวะ
node tools/perf.mjs [--level=cabin] [--phase=unpack] [--dwell=45 --q=daylen=40]   # frame time ระหว่างใช้เครื่องมือ/แกะกล่อง/รอบวัน
                                                           # ด้วยเมาส์จริง + สิ่งที่รันในเฟรมที่แย่สุด
                                                           # + "shaders compiled during play" (ต้องเป็น none — ไม่งั้นเกมค้างตอนของโผล่ครั้งแรก)
```

เทียบภาพถดถอยให้ใส่ `&still` เสมอ (หยุดไฟกะพริบ/ฝุ่น/อิฐลอย) → ถ่ายซ้ำโค้ดเดิมได้ diff ≈ 0:
`node tools/shot.mjs x --gpu --q="t=0.62&nohud&still"` แล้ว `diff.mjs` กับ `shots/base-still.png` (baseline ห้องที่เสร็จแล้ว, ถ่ายใหม่หลังเปิด MSAA 2026-09-29;
ไฟล์อยู่ในเครื่อง ไม่ได้ commit — ถ้าไม่มีให้ถ่ายจาก commit ที่รู้ว่าดี) ·
`&phase=restore` = ห้องสภาพเริ่มต้น (รก) · `&phase=unpack` = ซ่อมเสร็จ กล่องเพิ่งมาส่ง · `&phase=done` = ห้องเสร็จ (มีปุ่ม "เสร็จแล้ว" → reveal) ·
ไม่ใส่ `still` จะมี noise ~0.1–0.25% จากไฟกะพริบ · ใส่ `&t=` แล้วเวลาในวันจะไม่เดินตามงาน

**ทดสอบระหว่างที่มีการแก้ไฟล์อยู่** (ตัวเอง / เครื่องมืออื่น): vite ของ :5190 สั่ง reload ทุกหน้าที่เปิดเมื่อไฟล์ใน src เปลี่ยน → playthrough/perf FAIL ปลอม ·
รัน `npx vite --config tools/vite.test.config.js` (:5194 ไม่มี HMR) แล้วใส่ `--port=5194` ให้ทุกเครื่องมือ

`--gpu` = Edge บน GPU จริง (SwiftShader ช้าเกินสำหรับ probe GI) · **ทุกเครื่องมือเปิด Edge แบบ headless (ไม่มีหน้าต่างเด้งมาบัง)** — headless แบบใหม่
ใช้ GPU ตัวเดียวกัน ภาพและ frame time เท่าแบบมีหน้าต่าง (วัด 2026-09-30: RTX 3060 ทั้งคู่, diff 0.07) · อยากดูให้ใส่ `--headful` ·
ทุกเครื่องมือ import `tools/lowprio.mjs` ก่อน → node + Edge ที่เปิดรันที่ priority ต่ำกว่าปกติ ไม่แย่งเครื่องคนที่ใช้อยู่ · **รันทีละตัวทั้งเครื่อง** (หลายตัวพร้อมกันแย่ง GPU/CPU จนเครื่องค้าง และตัวเลข perf เพี้ยน) ·
ทุกเครื่องมือรับ `--port=` (checkout ที่สองรัน dev server
ของตัวเองได้ เช่น `npx vite --port 5191` — อย่าลืมแยก `cacheDir` ถ้าใช้ node_modules ร่วมกัน)

## แสงประกอบด้วยอะไร (เรียงตามผลต่อความสวย)

| ชั้น | ไฟล์ | ทำอะไร |
|---|---|---|
| Probe GI | `src/gi.js` | 288 probe ในห้อง แต่ละตัวถ่าย cube map 32px ของฉากที่จัดแสงแล้ว → ฉายเป็น SH L1 บน GPU → ทุก material บวก irradiance แบบ trilinear. ทุก sweep อ่านผลรอบก่อน = เพิ่ม 1 bounce. เปลี่ยนสีผนัง/เปิดโคมไฟ → คำนวณใหม่ ~2.3 วิ |
| แดดแรงอุ่นผ่านหน้าต่าง | `src/world.js` (KEYS) | directional + PCF shadow 4096 · เพดานล่องหนที่ cast shadow อย่างเดียว กันแดดตกจากด้านบนที่เปิดโล่ง |
| ท้องฟ้า (เฉพาะ GI เห็น) | `src/room.js` (dome) | dome ที่มีแต่ probe มองเห็น = skylight เข้าทางด้านที่ cutaway — ทำให้ห้องสว่างโปร่งแบบ Hozy |
| ลำแสง + ฝุ่น | `src/atmos.js` | raymarch ผ่าน shadow map ของแดดที่ half-res + blur · ฝุ่นเช็ค shadow map ใน vertex shader → วิบวับเฉพาะในลำแดด |
| Post | `src/post.js` | (MSAA 4x) N8AO → shafts + exposure → bloom → AgX → saturation/contrast เบา ๆ → vignette → SMAA |
| ไฟกลางคืน | `src/props.js`, `src/room.js` | เตาผิง (point light + shadow + flicker), โคมตั้งพื้น (shadow), โคมตั้งโต๊ะ, เทียน |

บทเรียนระหว่างทำ (อะไรพังและทำไม): [docs/lighting-notes.md](lighting-notes.md)

## Assets

โมเดล 26 ชิ้น + เท็กซ์เจอร์ 6 ชุดจาก [Poly Haven](https://polyhaven.com) (CC0) — รายการใน
`tools/fetch_assets.py`. ผ้า/สีโซฟา–สตูล–อาร์มแชร์ ถูก recolor ในโค้ด (`recolor` ใน `src/props.js`)
พรมและภาพโปสเตอร์วาดด้วย canvas

## ข้อจำกัดที่รู้อยู่

- สไตล์โมเดลปนกัน (Poly Haven เป็นสแกนสมจริง ไม่ใช่งาน art direction เดียวกันแบบ Hozy) — เกมจริงต้องมี art pipeline ของตัวเอง
- GI เป็น low-frequency (probe ห่าง ~0.7 ม.) ของชิ้นเล็กไม่ส่งผลต่อ bounce · reflection มี cube map เดียวกลางห้อง
- วัด perf แค่ RTX 3060 (110–165 fps ที่ 1600×900) ยังไม่ได้ลองเครื่องสเปกต่ำ/มือถือจริง
- โหลด ~8–10 วิ (รวม GI converge 4 bounce)
