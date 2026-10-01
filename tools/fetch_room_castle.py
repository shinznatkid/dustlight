"""Download the CC0 KayKit models the `castle` room uses into public/assets/rooms/castle/.

Source: Kay Lousberg's KayKit packs on GitHub (CC0 1.0 - www.kaylousberg.com).
Each pack is fetched as its GitHub branch archive (.zip) and only the files listed
below are extracted: .gltf + .bin + the pack's shared gradient atlas .png (the
Dungeon pack ships .glb files with the atlas embedded). Re-runnable: a pack whose
files are all present is not downloaded again. Everything else in the room (the
stone shell, the hearth, the stained glass, tapestries, the rug, the hound ...) is
built in code (src/rooms/castle/).

    python tools/fetch_room_castle.py
"""
import io
import os
import urllib.request
import zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "assets", "rooms", "castle")

# pack dir -> (GitHub repo, path inside the archive, files to keep; None = the whole pack)
PACKS = {
    "furniture": (
        "KayKit-Furniture-Bits-1.0",
        "addons/kaykit_furniture_bits/Assets/gltf/",
        [
            "armchair_pillows", "couch_pillows", "pillow_A", "pillow_B", "book_set", "book_single",
            "furniturebits_texture.png",
        ],
    ),
    "dungeon": (
        "KayKit-Dungeon-Remastered-1.0",
        "addons/kaykit_dungeon_remastered/Assets/gltf/",
        [
            "banner_red", "banner_blue", "sword_shield_gold",
            "bottle_A_green", "bottle_A_brown", "bottle_B_brown", "bottle_C_green",
            "candle_lit", "candle_thin_lit", "candle_melted",
            "chair", "chest", "stool", "table_medium_tablecloth", "table_small",
            "coin_stack_small", "coin_stack_medium", "plate_food_A", "plate_food_B",
            "torch_mounted",
        ],
    ),
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dustlight-assets/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def candidates(n):
    """the file names one model may come as (glTF + bin, a glb with the atlas inside, a plain glb)"""
    if n.endswith(".png"):
        return [n]
    return [f"{n}.gltf", f"{n}.bin", f"{n}.gltf.glb", f"{n}.glb"]


def present(dest, n):
    if n.endswith(".png"):
        return os.path.exists(os.path.join(dest, n))
    return any(os.path.exists(os.path.join(dest, f)) for f in (f"{n}.gltf", f"{n}.gltf.glb", f"{n}.glb"))


def fetch_pack(pack, repo, base, names):
    dest = os.path.join(ROOT, pack)
    zroot = f"{repo}-main/{base}"
    if names is not None and all(present(dest, n) for n in names):
        print(pack, "already here")
        return
    url = f"https://github.com/KayKit-Game-Assets/{repo}/archive/refs/heads/main.zip"
    print(pack, "<-", url)
    z = zipfile.ZipFile(io.BytesIO(get(url)))
    keep = None if names is None else {f for n in names for f in candidates(n)}
    os.makedirs(dest, exist_ok=True)
    n = 0
    for info in z.infolist():
        if not info.filename.startswith(zroot) or info.is_dir():
            continue
        rel = info.filename[len(zroot):]
        if "/" in rel or (keep is not None and rel not in keep):
            continue
        path = os.path.join(dest, rel)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            continue
        with open(path, "wb") as f:
            f.write(z.read(info))
        n += 1
    lic = f"{repo}-main/{base.rsplit('/gltf/', 1)[0]}/LICENSE.txt"
    if lic in z.namelist():
        with open(os.path.join(dest, "LICENSE.txt"), "wb") as f:
            f.write(z.read(lic))
    missing = [m for m in (names or []) if not present(dest, m)]
    print(pack, "ok,", n, "files", f"(missing: {missing})" if missing else "")


def main():
    for pack, (repo, base, names) in PACKS.items():
        try:
            fetch_pack(pack, repo, base, names)
        except Exception as e:  # keep going: one pack failing must not stop the rest
            print(pack, "FAILED", e)


if __name__ == "__main__":
    main()
