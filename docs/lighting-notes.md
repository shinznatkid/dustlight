# Lighting notes — สิ่งที่พังระหว่างทำ Dustlight และทำไม

บันทึกจากการจูนจริง (ก.ย. 2026)

## ตัดสินใจเรื่อง "look"

1. **ห้องปิดทึบ = มืดและอึมครึม, ห้องที่มี skylight = Hozy** — รอบแรกให้ probe เห็นเพดาน + ผนังด้านที่
   cutaway (ห้องปิดสนิท) ผลคือห้องมืด หม่น แบบหนังสยองขวัญ. เปลี่ยนเป็น sky dome ที่มีแต่ probe มองเห็น
   (layer 3) → แสงฟ้าเข้าทางด้านเปิด ห้องสว่างโปร่งแบบ Hozy ทันที. ยังเก็บ "เพดานล่องหน" ไว้ cast shadow
   อย่างเดียว เพื่อให้แดดเข้าได้แค่ทางหน้าต่าง
2. **แดดมุมต่ำ = ปื้นแดดบนพื้นจาง** — ที่ elevation 13° แดดตกกระทบพื้นแค่ sin(13°) ≈ 0.22 ของความแรง
   เลยสว่างสู้แสงฟ้าไม่ได้ ปื้นหน้าต่างหายไป. Hozy ใช้ "แดดแรงอุ่น" มุมสูงกว่า → ตั้ง 22–38° + แดดแรง ~9–11
   + dome เบาลง จนปื้นแดดสว่างกว่าพื้นรอบข้าง ~2–3 เท่า (ตัวเลขใน `KEYS` ของ `src/main.js`)
3. **Tone mapping: AgX + saturation/contrast เบา ๆ** — เทียบ AgX / ACES / Neutral ที่ฉากเดียวกัน: ACES ซีด
   ขาวโพลน, Neutral ส้มจัดเกิน, AgX ดิบ ๆ หม่นไป แต่พอเติม sat 0.16 / contrast 0.1 ได้ภาพอุ่นและคมที่สุด
   (สลับดูได้ด้วย `?tone=`)
4. **ลำแสงต้องเบามาก** — volumetric ที่ density สูงกลายเป็นหมอกขาวทั้งห้อง. ใน screenshot ของ Hozy
   แทบไม่เห็นลำแสง เห็นแต่ปื้นแดด + ฝุ่นเม็ดเล็ก. ค่าที่ใช้ `strength 0.007`, HG g = 0.45
   (มากกว่านี้ มุมกล้องที่หันเข้าหาแดดจะขาวขุ่นทับเฟอร์นิเจอร์)
5. **ฝุ่นน้อยกว่าที่คิด** — 2000+ เม็ดสว่างทุกเม็ดดูเหมือนหิมะ. ใช้ twinkle `pow(sin,3)` ให้ส่วนใหญ่มืดอยู่
   + จำกัดขนาด 3.5px + เฟดเม็ดที่อยู่ติดเลนส์

## บั๊กเทคนิค (อาการ → สาเหตุ → แก้)

| อาการ | สาเหตุ | แก้ |
|---|---|---|
| ผนังดำทั้งแผง ทั้งที่ GI ค่าปกติ | `CanvasTexture` ถูกอัปโหลดตอน canvas ยังเป็น 300×150 ว่าง ๆ; WebGL2 texture storage เป็น immutable → ขยายทีหลังไม่ได้ ดำถาวร | สร้าง `new Texture()` เปล่า แล้วใส่ `image = canvas` หลังวาดเสร็จ (`detailMap` ใน `room.js`). หาเจอด้วยการถอด map ทีละตัว (`--eval` ตั้ง `m.map = null`) |
| ปื้นดำบนหัวปล่องไฟ / ปลายผนังข้างต้นไม้ | probe ที่จมใน bounding box ถูก mark invalid → จุดที่เพื่อนบ้านทั้ง 8 ตัวจมหมด ได้ weight 0 → ดำ | ไม่ mark invalid แต่ **ย้ายจุดถ่ายของ probe ออกนอกกล่อง** ทางหน้าที่ใกล้สุด (DDGI probe relocation) · ต้นไม้ไม่นับเป็น blocker (ใบโปร่ง) |
| `Mismatch between texture format and sampler type (shadow)` รัว ๆ ตอนเริ่ม | เฟรมแรก ๆ render ก่อนมี shadow map → sampler2DShadow ผูกกับ texture ธรรมดา | ตั้ง `shadowMap.needsUpdate = true` ตั้งแต่ต้น + ใช้ `DepthTexture(1,1)` ที่มี `compareFunction` เป็นค่า default |
| shader compile error X4532 บน Windows | `textureLod()` กับ `sampler2DShadow` ใน **vertex** shader ANGLE→D3D11 แปลไม่ได้ | ใน vertex shader ใช้ `texture()` (lod 0 อยู่แล้ว); ใน fragment ใช้ `textureLod` ได้ (กัน warning gradient-in-loop) |
| ลำแสงเป็นเม็ด ๆ (screen-door) | raymarch แบบ jitter ต่อพิกเซลให้ noise คงที่ | render ที่ half-res แล้ว gaussian blur 2 รอบ (`ShaftsPass`) — เร็วขึ้นด้วย |
| กรอบรูปเป็นสี่เหลี่ยมดำ | material `*_glass` ของ Poly Haven สะท้อน env มืดทับภาพ | ซ่อน mesh glass ของกรอบรูป |
| ถือเฟอร์นิเจอร์แล้ว fps ตก ~25% (M1.2) | re-render shadow ทุกเฟรมระหว่างถือ: เงาแดด 4096 = 1 pass (แทบฟรี) แต่ cube shadow ของเตาผิง + โคมตั้งพื้น = 6 pass ต่อดวง และ three.js render ให้แม้ไฟดับ | cube shadow ตั้ง `shadow.autoUpdate = false` · ระหว่างของขยับ: แดดทุกเฟรม, cube เฉพาะดวงที่ติดอยู่ ~7 ครั้ง/วิ, ครบทุกดวงตอนวางลง · **ระวัง:** loop เริ่ม render ก่อนเฟอร์นิเจอร์โหลดเสร็จ → ต้องสั่ง cube update อีกรอบตอน boot จบ ไม่งั้นเงาไฟเตาผิงไม่มีเฟอร์นิเจอร์ |
| คราบกระจกบังแดดเต็มบาน แม้เช็ดใสแล้ว (P4) | `customDepthMaterial` ตั้ง `alphaTest: 0.5` ไว้ แต่ `WebGLShadowMap.getDepthMaterial` ก๊อป `side`/`map`/`alphaMap`/**`alphaTest`** จาก material ของ mesh มาทับทุกครั้ง (three 0.186) → alphaTest กลายเป็น 0 | ตั้ง `alphaTest` บน **material หลัก** แทน แล้วลบ `#include <alphatest_fragment>` ใน `onBeforeCompile` ของ material หลัก (ให้ภาพคราบจางนุ่ม ไม่ตัดขอบ) — depth pass ใช้ shader ของตัวเองจึงยัง discard ตาม alpha (`grime.js`) · แก้ mask กระจกแล้วต้อง `shadowsDirty()` (level.update ทำให้) |
| รอยลูกกลิ้ง/คราบมีเส้นมืดตามขอบ ดูเป็นท่อ ๆ | gradient ของ canvas 2D ไล่สีแบบ unpremultiplied → จุดหยุด `rgba(0,0,0,0)` ทำให้ขอบไล่ไปทางดำก่อนจะใส | จุดหยุดโปร่งใสใช้สีเดียวกันที่ alpha 0 (`clearOf()` ใน `masks.js`) |
| ขอบทุกเส้นเป็นขั้นบันได (playtest 2026-09-29: "ภาพมีรอยหยัก") | มีแต่ SMAA ท้าย chain (MSAA ปิด) + "high" ตั้ง pixel ratio 1.5 แต่ถูก `min(devicePixelRatio, …)` ตัดเหลือ 1 บนจอ 1x → ไม่เคย supersample จริง | EffectComposer `multisampling: 4` (N8AO ใช้ได้ปกติ — diff ต่างเฉพาะขอบ) + "high" = render ≥1.5x แม้จอ 1x (supersampling แก้ลายถี่ในเท็กซ์เจอร์ด้วย) · SMAA ยังอยู่ · `?nomsaa` ปิดไว้เทียบ · `?pr` = ค่าตรง ๆ แล้ว |
| console เตือน "Texture marked for update but no image data found" ตอนโหลด | `clone()` เท็กซ์เจอร์ที่ยังโหลดไม่เสร็จ (normal map ของพรม) → ตัว clone ถูก mark update ทั้งที่ยังไม่มีภาพ | clone หลัง `roomTexturesReady()` |
| `Material.clone()` แล้ววัสดุใหม่ไม่ได้ GI | `copy()` ก๊อป `userData.giPatched` แต่ไม่ก๊อป `onBeforeCompile` → `gi.patch()` ข้ามเงียบ ๆ (three 0.186) | clone แล้วต้องลบธงก่อน patch (ยังไม่ได้ใช้ — จดไว้สำหรับ ghost material ใน M1.3) |
| เกมค้างครู่หนึ่งตอนหยิบเครื่องมือ/งัดไม้ครั้งแรก (~0.1 วิ) และตอนแกะของจากกล่อง (โซฟา 0.43 วิ, **โคมไฟ 1.7–2 วิ**) (playtest รอบ 2) | three compile shader ตอน draw ครั้งแรก — บน ANGLE/D3D11 โปรแกรมละ ~20–130 ms บน main thread. ของที่ซ่อนอยู่ตอนโหลด (เครื่องมือ, เฟอร์นิเจอร์ที่แพ็กในกล่อง) ไม่เคยถูก compile และ env map มาทีหลังทำให้ key เปลี่ยนอีก · โคม: `setHeldLayers` ย้าย **PointLight** ของโคมไป layer 2 ด้วย → probe เห็นไฟน้อยลง 1 ดวง = light count ใหม่ → ทุก material ที่ probe วาด compile ใหม่ทั้งห้อง | `precompile()` ใน `world.js`: หลัง env map แรก `renderer.compileAsync` (เดิน mesh ที่ซ่อนด้วย) **ต้อง bind render target ก่อน** (scene วาดลง linear target เสมอ — colorspace เป็นส่วนของ key) และทำ **2 กล้อง**: กล้องหลัก + กล้อง probe (เทียนอยู่ layer 2 → probe เห็นไฟ 3 ดวง กล้องหลัก 4) + `initTexture` ทุกเท็กซ์เจอร์ · held ไม่ย้าย light · ของที่สร้างตอนเล่น (ไม้ปลิว/แผ่นพื้นใหม่) มี stand-in ซ่อนไว้ใน `floor.js` · **กฎ:** ห้าม toggle `light.visible` / `castShadow` หรือย้าย light ข้าม layer ระหว่างเล่น (แดดตอนค่ำจึงเหลือ intensity 0 แทนการซ่อน) · ตรวจด้วย `node tools/perf.mjs` → "shaders compiled during play: none" |

## ตัวเลขอ้างอิง (RTX 3060, 1600×900, pr=1)

- 110–165 fps ขณะนิ่ง · GI converge ตอนโหลด 4 sweep ≈ 3–4 วิ (24 probe/เฟรม)
- anti-aliasing (2026-09-29, vsync ปิด): ไม่มี MSAA ~224 fps → MSAA 4x ~183 fps → MSAA 4x + render 1.5x (2400×1350) ~180 fps
  (ความละเอียดไม่ใช่คอขวดบน 3060 ที่หน้าต่าง 1600×900 — GI/post ต่อเฟรมคือต้นทุนหลัก)
- **แต่**ตอนเล่นจริง (หน้าต่างใหญ่กว่า): "สูง" 50+ fps, "กลาง" 90+ fps → supersampling ขยายตามขนาดหน้าต่าง ×2.25 ·
  แก้: ค่าเริ่มต้น "กลาง" (1x + MSAA) · "สูง" ≤1.5x ภายในงบ ~3.5 ล้านพิกเซล (1440p เต็มจอ = 1x) · วัด perf ที่ขนาดหน้าต่างจริงเสมอ
- เปลี่ยนสีผนัง/เปิดไฟ → 3 sweep ที่ 5 probe/เฟรม ≈ 2.3 วิ (blend 0.55 ให้เปลี่ยนนุ่ม ๆ)
- ของเล็ก (หนังสือ แจกัน ต้นไม้ ฝุ่น เปลวไฟ) อยู่ layer 2 = ไม่ถูก probe ถ่าย → ประหยัด draw call ตอน capture
- ย้ายเฟอร์นิเจอร์ (M1.2): ถือของ 82 fps (นิ่ง 108–113) · วางแล้วแสง bounce ตามทันเท่ากับเปลี่ยนสีผนังพอดี
  (GI เริ่มตอนปล่อยมือ ไม่รอ animation ตก) · GI นับเป็นเฟรม (5 probe/เฟรม) → เวลาจริงแปรตาม fps:
  GPU ว่าง ~2.1 วิ, ถ้ามีแท็บอื่นแย่ง GPU (เช่นเปิดหน้าเดียวกันค้างใน Chrome) ยืดเป็น 3–3.7 วิ — วัด perf ให้ปิดแท็บอื่นก่อน
- เล่นจริงด้วยเครื่องมือ (`tools/perf.mjs`, 2026-09-29, "กลาง", จอ 164 Hz): 1600×900 นิ่ง 165 fps ตลอดทุกเครื่องมือ
  เฟรมแย่สุด ≤ 12 ms · 2560×1300 นิ่ง 97 fps → ระหว่างเช็ด/ขัด/ทา 87–91 fps เฟรมแย่สุด 18–24 ms ·
  ต้นทุนที่เหลือระหว่างทำงานคือ GI capture ~5 ms JS/เฟรม (5 probe × 6 หน้า = 30 scene render) ซ้อนกับ GPU ได้ ·
  เซฟอัตโนมัติ (PNG ของ mask) ~5 ms · cube shadow ~1 ms · precompile ตอนโหลด: 32 โปรแกรมที่เคย compile กลางเกม
  (บังคับ compile ให้จบทีละตัว ~0.6 วิ) — แบบ parallel หน้าโหลดรอเพิ่มแค่ 2–6 ms (cache shader ของ ANGLE/ไดรเวอร์อุ่นอยู่)
