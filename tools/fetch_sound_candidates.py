"""Extract alternative sound effects for the sound board (sounds.html) into
public/assets/audio/candidates/ and write candidates.json next to them.

No network: every file comes from a zip that tools/fetch_audio.py already put in
public/assets/audio/_cache/ (run `npm run assets` first). Only CC0 / CC-BY packs are
used; CC-BY ones carry their credit line in candidates.json (the game's Credits
screen would need it if the file is adopted).

candidates.json:
  { "packs": { key: { name, url, license, credit } },
    "candidates": [ { id, files: [...], pack, license, for: [action ids], th, en, layer? } ] }
  `for` = the sound board rows (src/soundboard.js ACTIONS) the candidate is offered on;
  `layer` = only used inside a layered cue on the board, not offered on its own.

Re-runnable: existing files are skipped. Pick a sound on the board, then adopt it by
copying its entry into tools/fetch_audio.py (FILES + INDEX).
"""
import json
import os
import sys
import zipfile

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "audio")
CACHE = os.path.join(ROOT, "_cache")
OUT = os.path.join(ROOT, "candidates")

CC0 = "CC0 1.0"
PACKS = {
    "impact": ("kenney_impact-sounds.zip", "Kenney — Impact Sounds", "https://kenney.nl/assets/impact-sounds", CC0, None),
    "rpg": ("kenney_rpg-audio.zip", "Kenney — RPG Audio", "https://kenney.nl/assets/rpg-audio", CC0, None),
    "interface": ("kenney_interface-sounds.zip", "Kenney — Interface Sounds", "https://kenney.nl/assets/interface-sounds", CC0, None),
    "ui": ("kenney_ui-audio.zip", "Kenney — UI Audio", "https://kenney.nl/assets/ui-audio", CC0, None),
    "jingles": ("kenney_music-jingles.zip", "Kenney — Music Jingles", "https://kenney.nl/assets/music-jingles", CC0, None),
    "owlish": ("MoreSounds.zip", "OwlishMedia — 202 More Sound Effects", "https://opengameart.org/content/202-more-sound-effects", CC0, None),
    "loops": ("sfx_loops.zip", "rubberduck — 30 CC0 SFX Loops", "https://opengameart.org/content/30-cc0-sfx-loops", CC0, None),
    "yucchi": ("yucchi_assorted_sounds_1.zip", "Yucchi — Assorted Sounds 1", "https://opengameart.org/content/yucchis-assorted-sounds-1", "CC-BY 3.0",
               '"{}" — Yucchi, Assorted Sounds 1 (opengameart.org) · CC-BY 3.0 · creativecommons.org/licenses/by/3.0/'),
}
PREFIX = {"impact": "imp", "rpg": "rpg", "interface": "ifc", "ui": "ui", "jingles": "jng", "owlish": "owl", "loops": "loop", "yucchi": "yuc"}

# id, pack, members (variants, played at random like index.json lists), rows it's for,
# Thai / English label, and whether it's only a layer inside a cue on the board
C = [
    # ---- UI
    ("ui_click2", "ui", ["click2"], ["click"], "คลิกทุ้ม", "soft low click"),
    ("ifc_click_002", "interface", ["click_002"], ["click"], "ติ๊กสั้นมาก", "tiny tick"),
    ("ifc_select_006", "interface", ["select_006"], ["click", "pot_dry"], "บลิปเบา ๆ", "soft blip"),
    ("ui_rollover5", "ui", ["rollover5"], ["hover"], "ทุ้มกว่า", "rounder"),
    ("ui_rollover4", "ui", ["rollover4"], ["hover"], "กลาง ๆ", "mid"),
    ("ui_rollover2", "ui", ["rollover2"], ["hover"], "สั้นกว่า", "shorter"),
    ("ifc_switch_002", "interface", ["switch_002"], ["rotate"], "ติ๊กไม้", "woody tick"),
    ("ifc_switch_007", "interface", ["switch_007"], ["rotate"], "ต็อกเล็ก", "small tock"),
    ("ui_switch11", "ui", ["switch11"], ["rotate"], "สวิตช์นุ่ม", "soft switch"),
    ("ifc_error_008", "interface", ["error_008"], ["blocked"], "ตึ้บทุ้ม", "low bump"),
    ("ifc_error_004", "interface", ["error_004"], ["blocked"], "บึ๋ยสั้น", "short buzz"),
    ("ifc_back_002", "interface", ["back_002"], ["blocked"], "ป๊อกถอย", "back pop"),
    ("ifc_switch_004", "interface", ["switch_004"], ["switch"], "สวิตช์ทุ้ม", "low switch"),
    ("ifc_switch_006", "interface", ["switch_006"], ["switch"], "ก๊อกเบา", "soft clack"),
    ("ui_switch10", "ui", ["switch10"], ["switch", "neon_strike"], "สวิตช์ไฟ", "light switch"),
    ("owl_camera_01", "owlish", ["Camera_01"], ["shutter"], "ชัตเตอร์ 1", "shutter 1"),
    ("owl_camera_03", "owlish", ["Camera_03"], ["shutter"], "ชัตเตอร์ + ม้วนฟิล์ม", "shutter + wind"),
    # ---- hand: pick up / put down
    ("rpg_cloth34", "rpg", ["cloth3", "cloth4"], ["pickup", "cancel", "rustle", "cabin_draft"], "ผ้าสะบัดเบา", "soft cloth"),
    ("rpg_bookopen", "rpg", ["bookOpen"], ["pickup"], "เปิดปกหนังสือ", "book lid"),
    ("rpg_bookplace", "rpg", ["bookPlace1", "bookPlace2", "bookPlace3"], ["drop", "plank"], "วางหนังสือบนไม้ (ต็อก)", "book set on wood"),
    ("imp_wood_medium", "impact", ["impactWood_medium_000", "impactWood_medium_001", "impactWood_medium_003"], ["drop"], "ไม้ทุ้มหนา", "deeper wood knock"),
    ("imp_carpet", "impact", ["footstep_carpet_000", "footstep_carpet_001", "footstep_carpet_003"], ["drop_soft", "paint_reload"], "ตุ้บบนพรม", "thump on carpet"),
    ("imp_soft_heavy", "impact", ["impactSoft_heavy_000", "impactSoft_heavy_001", "impactSoft_heavy_002"], ["drop_soft"], "ตุ้บหนัก", "heavier thump"),
    ("rpg_dropleather", "rpg", ["dropLeather"], ["drop_soft", "bin"], "ถุงหนังตก", "leather bag drop"),
    ("owl_cloth", "owlish", ["Cloth_05", "Cloth_07"], ["cancel"], "ผ้า (ทุ้มมาก)", "cloth (very low)"),
    # ---- floor
    ("rpg_bookclose", "rpg", ["bookClose"], ["plank", "pry"], "ปิดหนังสือ (ปึก)", "book shut", True),
    ("imp_footstep_wood", "impact", ["footstep_wood_000", "footstep_wood_002"], ["plank", "pry"], "ก้าวบนไม้", "step on wood", True),
    ("yuc_crackle4", "yucchi", ["CardboardCrackle4"], ["pry", "box_open"], "กระดาษแข็งกรอบ", "cardboard crackle"),
    # ---- litter / bin
    ("owl_plastic_08", "owlish", ["Plastic_08"], ["rustle", "bin"], "พลาสติกยับ", "plastic crinkle"),
    ("owl_plastic_06", "owlish", ["Plastic_06"], ["rustle"], "ถุงพลาสติกยาว", "long plastic rustle"),
    ("yuc_thud", "yucchi", ["Thud"], ["bin"], "ตุ้บ", "thud"),
    ("ifc_drop", "interface", ["drop_002", "drop_003"], ["bin"], "บลุบ (เกม ๆ)", "game-y bloop"),
    # ---- boxes
    ("yuc_movearound1", "yucchi", ["MoveAround1"], ["box_open"], "ขยับกล่อง", "box shuffled"),
    ("yuc_crackle1", "yucchi", ["CardboardCrackle1"], ["box_open"], "กระดาษแข็ง 1", "cardboard 1", True),
    # ---- task done / phases
    ("ifc_confirm_004", "interface", ["confirmation_004"], ["task"], "ติ๊งยืนยัน", "confirm chime"),
    ("jng_steel09", "jingles", ["jingles_STEEL09"], ["task"], "กลองกระทะสั้น", "short steel drum"),
    ("jng_pizzi00", "jingles", ["jingles_PIZZI00"], ["task"], "ดีดสายสั้น", "short pizzicato"),
    ("jng_pizzi11", "jingles", ["jingles_PIZZI11"], ["sting"], "ดีดสาย 11", "pizzicato 11"),
    ("jng_steel04", "jingles", ["jingles_STEEL04"], ["sting"], "กลองกระทะ 4", "steel drum 4"),
    ("jng_sax01", "jingles", ["jingles_SAX01"], ["sting"], "แซกโซโฟน", "saxophone"),
    ("jng_pizzi12", "jingles", ["jingles_PIZZI12"], ["fanfare"], "ดีดสาย 12", "pizzicato 12"),
    ("jng_steel01", "jingles", ["jingles_STEEL01"], ["fanfare"], "กลองกระทะ 1", "steel drum 1"),
    ("jng_steel12", "jingles", ["jingles_STEEL12"], ["fanfare"], "กลองกระทะ 12", "steel drum 12"),
    # room finished, round 2 (playtest 2026-09-30: none of the first four; warm, cozy, a little magical)
    ("jng_sax07", "jingles", ["jingles_SAX07"], ["fanfare"], "แซกโซโฟนวลียาว นุ่ม ๆ", "longer, soft sax phrase"),
    ("jng_steel07", "jingles", ["jingles_STEEL07"], ["fanfare"], "กลองกระทะ 7", "steel drum 7"),
    ("imp_glass_chime", "impact", ["impactGlass_medium_001"], ["fanfare"], "แก้วกริ๊งมีโน้ต", "tuned glass tink", True),
    ("imp_bell_0", "impact", ["impactBell_heavy_000"], ["fanfare"], "ระฆัง 0", "bell 0", True),
    ("imp_bell_1", "impact", ["impactBell_heavy_001"], ["fanfare"], "ระฆัง 1", "bell 1", True),
    # ---- level sounds
    ("imp_glass_light", "impact", ["impactGlass_light_000", "impactGlass_light_003", "impactGlass_light_004"], ["castle_glass"], "กระจกกระทบเบา", "light glass tap"),
    ("ifc_glass", "interface", ["glass_001", "glass_003", "glass_006"], ["castle_glass"], "กริ๊งแก้ว", "glass chime"),
    ("ifc_glitch", "interface", ["glitch_001", "glitch_002"], ["neon_strike"], "ไฟช็อตเบา", "electric tick"),
    ("imp_concrete", "impact", ["footstep_concrete_001", "footstep_concrete_002"], ["kiln_brick"], "อิฐบนปูน", "brick on concrete"),
    ("imp_mining", "impact", ["impactMining_000", "impactMining_002"], ["kiln_brick"], "หินหนัก", "heavy stone"),
    ("imp_plate", "impact", ["impactPlate_light_000", "impactPlate_light_003"], ["kiln_brick", "pot_dry"], "เซรามิก", "ceramic"),
    ("ifc_pluck", "interface", ["pluck_001", "pluck_002"], ["pot_dry"], "ดีดเบา ๆ", "soft pluck"),
    ("owl_drink", "owlish", ["Drink_02", "Drink_03"], ["paint_reload"], "ของเหลว (ไฟล์ชื่อ Drink)", "liquid ('Drink')"),
    # ---- ambience for the neon alley (loops: made to loop)
    ("loop_rain", "loops", ["rain"], ["cyber_rain"], "ฝน (ไฟล์)", "rain loop"),
    ("loop_ambient_01", "loops", ["ambient_01"], ["cyber_city"], "ฮัมต่ำ 1", "low hum 1"),
    ("loop_ambient_03", "loops", ["ambient_03"], ["cyber_city"], "ฮัมต่ำ 3", "low hum 3"),
    ("loop_machine_11", "loops", ["machine_11"], ["cyber_city"], "เครื่องจักรไกล ๆ", "distant machine"),
    ("loop_boiling", "loops", ["water_boiling"], ["cyber_stove"], "น้ำเดือดในหม้อ", "pot boiling"),
    ("loop_noise_02", "loops", ["noise_02"], ["cyber_stove"], "ฟู่ (ไฟล์)", "hiss loop"),
]


def member(zf, base):
    """First member whose file name (extension optional) is `base`."""
    for n in zf.namelist():
        name = n.rsplit("/", 1)[-1]
        if name == base or name.rsplit(".", 1)[0] == base:
            return n
    raise KeyError(base)


def main():
    os.makedirs(OUT, exist_ok=True)
    zips = {}
    out, failed = [], []
    for row in C:
        cid, pack, members, rows, th, en = row[:6]
        layer = len(row) > 6 and row[6]
        zname, name, url, lic, credit = PACKS[pack]
        files = []
        for m in members:
            try:
                if pack not in zips:
                    zips[pack] = zipfile.ZipFile(os.path.join(CACHE, zname))
                zf = zips[pack]
                src = member(zf, m)
                ext = src.rsplit(".", 1)[-1].lower()
                rel = f"candidates/{PREFIX[pack]}-{m.replace(' ', '_')}.{ext}"
                path = os.path.join(ROOT, rel)
                if not (os.path.exists(path) and os.path.getsize(path) > 0):
                    with open(path, "wb") as f:
                        f.write(zf.read(src))
                files.append(rel)
            except Exception as e:  # keep going: the board shows what's missing
                print("  FAILED", cid, m, e, file=sys.stderr)
                failed.append(f"{cid}:{m}")
        entry = {"id": cid, "files": files, "pack": name, "license": lic, "for": rows, "th": th, "en": en}
        if credit:
            entry["credit"] = credit.format('", "'.join(members))
        if layer:
            entry["layer"] = True
        out.append(entry)
    packs = {k: {"name": v[1], "url": v[2], "license": v[3]} for k, v in PACKS.items()}
    with open(os.path.join(OUT, "candidates.json"), "w", encoding="utf-8") as f:
        json.dump({"packs": packs, "candidates": out}, f, indent=1, ensure_ascii=False)
    n = sum(len(c["files"]) for c in out)
    print("candidates:", len(out), "·", n, "files · candidates.json written")
    if failed:
        print("missing (run `npm run assets` for the zips):", ", ".join(failed), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
