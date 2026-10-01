"""Download the game's music / ambience / sound effects into public/assets/audio/
and write public/assets/audio/index.json (sound id -> file(s), plus credit lines).

Every source is CC0 or CC-BY (credited in the game's Credits screen). Zip packs are
downloaded once into public/assets/audio/_cache/ and only the files we use are
extracted. Re-runnable: existing files are skipped.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
import zipfile

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "audio")
CACHE = os.path.join(ROOT, "_cache")

CC0 = "CC0 1.0"
KEN = "https://kenney.nl/media/pages/assets/"
PACKS = {
    "ui": (KEN + "ui-audio/490d233f68-1677590494/kenney_ui-audio.zip", "Kenney — UI Audio", "https://kenney.nl/assets/ui-audio", CC0),
    "interface": (KEN + "interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip", "Kenney — Interface Sounds", "https://kenney.nl/assets/interface-sounds", CC0),
    "impact": (KEN + "impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip", "Kenney — Impact Sounds", "https://kenney.nl/assets/impact-sounds", CC0),
    "rpg": (KEN + "rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip", "Kenney — RPG Audio", "https://kenney.nl/assets/rpg-audio", CC0),
    "jingles": (KEN + "music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip", "Kenney — Music Jingles", "https://kenney.nl/assets/music-jingles", CC0),
    "yucchi": ("https://opengameart.org/sites/default/files/yucchi_assorted_sounds_1.zip", "Yucchi — Assorted Sounds 1 (CC-BY 3.0)", "https://opengameart.org/content/yucchis-assorted-sounds-1", "CC-BY 3.0"),
    "owlish": ("https://opengameart.org/sites/default/files/MoreSounds.zip", "OwlishMedia — 202 More Sound Effects", "https://opengameart.org/content/202-more-sound-effects", CC0),
    "loops": ("https://opengameart.org/sites/default/files/sfx_loops.zip", "rubberduck — 30 CC0 SFX Loops", "https://opengameart.org/content/30-cc0-sfx-loops", CC0),
}

# out file -> (pack key, member basename)  or  (direct URL, None)
MCL = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/"
FILES = {
    "music/autumn_day.mp3": (MCL + "Autumn%20Day.mp3", None),
    "music/wallpaper.mp3": (MCL + "Wallpaper.mp3", None),
    "music/bittersweet.mp3": (MCL + "Bittersweet.mp3", None),
    "music/cheery_monday.mp3": (MCL + "Cheery%20Monday.mp3", None),
    "music/gymnopedie_1.mp3": (MCL + "Gymnopedie%20No%201.mp3", None),
    "ambience/birds_day.ogg": ("https://opengameart.org/sites/default/files/birds-isaiah658_0.ogg", None),
    "ambience/crickets_night.mp3": ("https://opengameart.org/sites/default/files/crickets_1.mp3", None),
    "ambience/fireplace.ogg": ("https://opengameart.org/sites/default/files/fire-1_0.ogg", None),
    # the neon alley (level 6, levels/cyber.js def.ambience): rain on the window, the city's
    # low hum, the pot boiling on the gas — rubberduck's CC0 loops
    "ambience/rain.ogg": ("loops", "rain"),
    "ambience/city_hum.ogg": ("loops", "ambient_01"),
    "ambience/pot_boiling.ogg": ("loops", "water_boiling"),
    "sfx/shutter.ogg": ("https://opengameart.org/sites/default/files/photo.ogg", None),
    "sfx/click.ogg": ("ui", "click1.ogg"),
    "sfx/hover.ogg": ("ui", "rollover1.ogg"),
    # picked on the sound board (sounds.html, 2026-09-30): softer switches, a back-pop
    # for "can't", a leather bag for soft things; the plank / bin / box cues' layers (audio.js CUES)
    "sfx/rotate_soft.ogg": ("ui", "switch11.ogg"),
    "sfx/blocked_pop.ogg": ("interface", "back_002.ogg"),
    "sfx/switch_light.ogg": ("ui", "switch10.ogg"),
    "sfx/drop_leather.ogg": ("rpg", "dropLeather.ogg"),
    "sfx/book_place_1.ogg": ("rpg", "bookPlace1.ogg"),
    "sfx/book_place_2.ogg": ("rpg", "bookPlace2.ogg"),
    "sfx/book_place_3.ogg": ("rpg", "bookPlace3.ogg"),
    "sfx/tick.ogg": ("interface", "click_002.ogg"),
    "sfx/crinkle.wav": ("owlish", "Plastic_08"),
    "sfx/cloth_3.ogg": ("rpg", "cloth3.ogg"),
    "sfx/cloth_4.ogg": ("rpg", "cloth4.ogg"),
    "sfx/task.ogg": ("interface", "confirmation_001.ogg"),
    "sfx/scratch_1.ogg": ("interface", "scratch_001.ogg"),
    "sfx/scratch_2.ogg": ("interface", "scratch_002.ogg"),
    "sfx/scratch_3.ogg": ("interface", "scratch_003.ogg"),
    "sfx/pickup_1.ogg": ("rpg", "handleSmallLeather.ogg"),
    "sfx/pickup_2.ogg": ("rpg", "handleSmallLeather2.ogg"),
    "sfx/cloth_1.ogg": ("rpg", "cloth1.ogg"),
    "sfx/cloth_2.ogg": ("rpg", "cloth2.ogg"),
    "sfx/creak_1.ogg": ("rpg", "creak1.ogg"),
    "sfx/creak_2.ogg": ("rpg", "creak2.ogg"),
    "sfx/creak_3.ogg": ("rpg", "creak3.ogg"),
    "sfx/drop_wood_1.ogg": ("impact", "impactWood_light_000.ogg"),
    "sfx/drop_wood_2.ogg": ("impact", "impactWood_light_001.ogg"),
    "sfx/drop_wood_3.ogg": ("impact", "impactWood_light_002.ogg"),
    "sfx/drop_soft_1.ogg": ("impact", "impactSoft_medium_000.ogg"),
    "sfx/drop_soft_2.ogg": ("impact", "impactSoft_medium_001.ogg"),
    "sfx/plank_1.ogg": ("impact", "impactPlank_medium_000.ogg"),
    "sfx/plank_2.ogg": ("impact", "impactPlank_medium_001.ogg"),
    "sfx/plank_3.ogg": ("impact", "impactPlank_medium_002.ogg"),
    "sfx/plank_4.ogg": ("impact", "impactPlank_medium_003.ogg"),
    "sfx/sting.ogg": ("jingles", "jingles_PIZZI10.ogg"),
    "sfx/spray.ogg": ("yucchi", "Spray"),
    "sfx/rustle.wav": ("owlish", "Plastic_05"),
    "sfx/roll_loop.ogg": ("loops", "rolling"),
    # the crowbar's pry (audio.js CUES.pry): a soft wooden knock + a muffled crackle
    "sfx/pry_knock_1.ogg": ("impact", "impactWood_light_003.ogg"),
    "sfx/pry_knock_2.ogg": ("impact", "impactWood_light_004.ogg"),
    "sfx/pry_crackle_1.ogg": ("yucchi", "CardboardCrackle1"),
    "sfx/pry_crackle_2.ogg": ("yucchi", "CardboardCrackle3"),
}

# what the game asks for (audio.js ids) -> file or list of variants
INDEX = {
    "music": {
        "menu": "music/autumn_day.mp3",
        "day1": "music/wallpaper.mp3",
        "day2": "music/bittersweet.mp3",
        "day3": "music/cheery_monday.mp3",
        "night": "music/gymnopedie_1.mp3",
    },
    "ambience": {
        "day": "ambience/birds_day.ogg",
        "night": "ambience/crickets_night.mp3",
        "fire": "ambience/fireplace.ogg",
        "rain": "ambience/rain.ogg",
        "city": "ambience/city_hum.ogg",
        "boil": "ambience/pot_boiling.ogg",
    },
    "sfx": {
        "click": "sfx/click.ogg",
        "hover": "sfx/hover.ogg",
        "rotate": "sfx/rotate_soft.ogg",
        "blocked": "sfx/blocked_pop.ogg",
        "task": "sfx/task.ogg",
        "pickup": ["sfx/pickup_1.ogg", "sfx/pickup_2.ogg"],
        "cancel": ["sfx/cloth_1.ogg", "sfx/cloth_2.ogg"],
        "drop": ["sfx/drop_wood_1.ogg", "sfx/drop_wood_2.ogg", "sfx/drop_wood_3.ogg"],
        "drop_soft": "sfx/drop_leather.ogg",
        "switch": "sfx/switch_light.ogg",
        "shutter": "sfx/shutter.ogg",
        "plank": ["sfx/plank_1.ogg", "sfx/plank_2.ogg", "sfx/plank_3.ogg", "sfx/plank_4.ogg"],
        # "pry" is a layered cue in audio.js (CUES) made of these; the creaks it replaced
        # stay to compare against: __app.audio.sfx('creak') / sfx('pry')
        "pry_knock": ["sfx/pry_knock_1.ogg", "sfx/pry_knock_2.ogg"],
        "pry_crackle": ["sfx/pry_crackle_1.ogg", "sfx/pry_crackle_2.ogg"],
        "creak": ["sfx/creak_1.ogg", "sfx/creak_2.ogg", "sfx/creak_3.ogg"],
        "rustle": "sfx/rustle.wav",
        "scrub": ["sfx/scratch_1.ogg", "sfx/scratch_2.ogg", "sfx/scratch_3.ogg"],
        "spray": "sfx/spray.ogg",
        "roll": "sfx/roll_loop.ogg",
        # layers of the plank / bin / box_open cues (audio.js CUES): those ids play as cues
        "thump_soft": ["sfx/drop_soft_1.ogg", "sfx/drop_soft_2.ogg"],
        "book_place": ["sfx/book_place_1.ogg", "sfx/book_place_2.ogg", "sfx/book_place_3.ogg"],
        "tick": "sfx/tick.ogg",
        "crinkle": "sfx/crinkle.wav",
        "box_crackle": "sfx/pry_crackle_1.ogg",
        "cloth_soft": ["sfx/cloth_3.ogg", "sfx/cloth_4.ogg"],
        "sting": "sfx/sting.ogg",
        # ("fanfare", the room finished, is a synth in audio.js SYNTHS)
    },
}

MCL_CREDIT = '"{}" Kevin MacLeod (incompetech.com) · Licensed under Creative Commons: By Attribution 4.0 · creativecommons.org/licenses/by/4.0/'
CREDITS = [
    MCL_CREDIT.format("Autumn Day"),
    MCL_CREDIT.format("Wallpaper"),
    MCL_CREDIT.format("Bittersweet"),
    MCL_CREDIT.format("Cheery Monday"),
    MCL_CREDIT.format("Gymnopedie No. 1"),
    '"CardboardCrackle1", "CardboardCrackle3", "Spray" — Yucchi, Assorted Sounds 1 (opengameart.org) · CC-BY 3.0 · creativecommons.org/licenses/by/3.0/',
    "Kenney (kenney.nl) — UI Audio, Interface Sounds, Impact Sounds, RPG Audio, Music Jingles · CC0",
    "OwlishMedia, rubberduck, isaiah658, Wolfgang_, AntumDeluge, themightyglider (opengameart.org) · CC0",
]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dustlight-assets/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def pack_zip(key):
    url = PACKS[key][0]
    path = os.path.join(CACHE, os.path.basename(urllib.parse.urlparse(url).path))
    if not (os.path.exists(path) and os.path.getsize(path) > 0):
        os.makedirs(CACHE, exist_ok=True)
        print("  pack", key)
        data = get(url)
        with open(path, "wb") as f:
            f.write(data)
    return zipfile.ZipFile(path)


def member(zf, base):
    """First member whose file name starts with `base` (extension optional)."""
    for n in zf.namelist():
        name = n.rsplit("/", 1)[-1]
        if name == base or name.rsplit(".", 1)[0] == base:
            return n
    raise KeyError(base)


def main():
    missing = []
    for out, (src, base) in FILES.items():
        path = os.path.join(ROOT, out)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            if base is None:
                print("  get", out)
                data = get(src)
            else:
                zf = pack_zip(src)
                data = zf.read(member(zf, base))
            with open(path, "wb") as f:
                f.write(data)
        except Exception as e:  # keep going: a missing sound just plays as silence
            print("  FAILED", out, e, file=sys.stderr)
            missing.append(out)
    index = dict(INDEX)
    index["credits"] = CREDITS
    with open(os.path.join(ROOT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1, ensure_ascii=False)
    print("audio:", len(FILES) - len(missing), "/", len(FILES), "files ·", "index.json written")
    if missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
