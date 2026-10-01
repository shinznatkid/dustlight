"""Download the CC0 Poly Haven assets this prototype uses into public/assets/.

Models come as 1k glTF (+ their texture includes), textures as 1k jpg/png maps.
Re-runnable: files that already exist are skipped. License: CC0 (polyhaven.com).
"""
import json
import os
import sys
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets")
RES = "1k"

MODELS = [
    "sofa_03", "mid_century_lounge_chair", "Ottoman_01", "coffee_table_round_01",
    "side_table_01", "potted_plant_01", "potted_plant_04", "calathea_orbifolia_01",
    "wooden_bookshelf_worn", "book_encyclopedia_set_01", "throw_pillows_01",
    "hanging_picture_frame_01", "hanging_picture_frame_02", "fancy_picture_frame_01",
    "mantel_clock_01", "brass_candleholders", "tea_set_01", "ceramic_vase_01",
    "wicker_basket_01", "planter_pot_clay", "desk_lamp_arm_01", "boombox",
    "standing_picture_frame_01", "vintage_cabinet_01", "ArmChair_01", "drawer_cabinet",
]
TEXTURES = [
    "herringbone_parquet", "plastered_wall_04", "brown_brick_02", "wood_floor_worn",
    "caban", "fabric_pattern_07",
]
TEX_MAPS = {"Diffuse": "diff", "nor_gl": "nor", "Rough": "rough", "AO": "ao"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dustlight-assets/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def save(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get(url)
    with open(path, "wb") as f:
        f.write(data)
    return True


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
        path = os.path.join(ROOT, "textures", tid, f"{short}.{ext}")
        save(ent["url"], path)
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
        with open(os.path.join(ROOT, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=1)


if __name__ == "__main__":
    main()
