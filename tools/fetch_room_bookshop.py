"""Download the CC0 Poly Haven assets of the `bookshop` room into public/assets/rooms/bookshop/.

Same scheme as tools/fetch_assets.py (1k glTF models + their texture includes, 1k
jpg/png texture maps) and re-runnable the same way: files that already exist are
skipped. Everything the room uses is fetched here, so it does not depend on the
level-1 downloads. License: CC0 (polyhaven.com) - list in CREDITS.md.

    python tools/fetch_room_bookshop.py            # everything + manifest.json
    python tools/fetch_room_bookshop.py jug_01     # just these ids (manifest untouched)
"""
import json
import os
import sys

sys.dont_write_bytecode = True  # no tools/__pycache__ from importing the helpers below
sys.path.insert(0, os.path.dirname(__file__))
from fetch_assets import RES, TEX_MAPS, get, save  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "rooms", "bookshop")

MODELS = [
    "CashRegister_01", "GreenChair_01", "side_table_tall_01", "round_wooden_table_01",
    "potted_plant_02", "potted_plant_04", "concrete_cat_statue", "standing_chalkboard_01",
    "vintage_telephone_wall_clock", "fancy_picture_frame_02", "hanging_picture_frame_03",
    "marble_bust_01", "wooden_stool_02", "jug_01", "tea_set_01", "vintage_oil_lamp",
    "wicker_basket_02", "throw_pillows_01", "round_spectacles", "vintage_wooden_drawer_01",
    "brass_vase_01",
]
TEXTURES = [
    "wood_floor", "dark_wood", "red_plaster_weathered", "wooden_panels", "caban", "velour_velvet",
]


def fetch_model(mid):
    files = json.loads(get(f"https://api.polyhaven.com/files/{mid}"))
    g = files["gltf"][RES]["gltf"]
    base = os.path.join(ROOT, "models", mid)
    save(g["url"], os.path.join(base, os.path.basename(g["url"])))
    for rel, inc in g.get("include", {}).items():
        save(inc["url"], os.path.join(base, rel))
    return os.path.basename(g["url"])


def fetch_texture(tid):
    files = json.loads(get(f"https://api.polyhaven.com/files/{tid}"))
    out = {}
    for key, short in TEX_MAPS.items():
        if key not in files:
            continue
        fmt = files[key][RES]
        ent = fmt.get("jpg") or fmt.get("png")
        ext = "jpg" if "jpg" in fmt else "png"
        save(ent["url"], os.path.join(ROOT, "textures", tid, f"{short}.{ext}"))
        out[short] = f"{short}.{ext}"
    return out


def main():
    only = set(sys.argv[1:])
    manifest = {"models": {}, "textures": {}}
    for mid in MODELS:
        if only and mid not in only:
            continue
        try:
            manifest["models"][mid] = fetch_model(mid)
            print("model", mid, "ok")
        except Exception as e:  # keep going: one missing prop must not stop the rest
            print("model", mid, "FAILED", e)
    for tid in TEXTURES:
        if only and tid not in only:
            continue
        try:
            manifest["textures"][tid] = fetch_texture(tid)
            print("texture", tid, "ok")
        except Exception as e:
            print("texture", tid, "FAILED", e)
    if not only:
        os.makedirs(ROOT, exist_ok=True)
        with open(os.path.join(ROOT, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=1)


if __name__ == "__main__":
    main()
