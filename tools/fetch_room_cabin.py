"""Download the CC0 KayKit models the `cabin` room uses into public/assets/rooms/cabin/.

Source: Kay Lousberg's KayKit packs on GitHub (CC0 1.0 — www.kaylousberg.com).
Each pack is fetched as its GitHub branch archive (.zip) and only the files listed
below are extracted: .gltf + .bin + the pack's shared gradient atlas .png (the
Dungeon pack ships .glb with the atlas embedded). Re-runnable: a pack whose files
are all present is not downloaded again.

    py -3 tools/fetch_room_cabin.py
"""
import io
import os
import urllib.request
import zipfile

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "rooms", "cabin")

# pack dir -> (GitHub repo, path inside the archive, files to keep)
PACKS = {
    "furniture": (
        "KayKit-Furniture-Bits-1.0",
        "addons/kaykit_furniture_bits/Assets/gltf/",
        # the whole pack is living-room furniture and ~1 MB: take all of it
        None,
    ),
    "halloween": (
        "KayKit-Halloween-Bits-1.0",
        "addons/kaykit_halloween_bits/Assets/gltf/",
        [
            "candle", "candle_melted", "candle_thin", "candle_triple",
            "lantern_hanging", "lantern_standing",
            "pumpkin_orange", "pumpkin_orange_small", "pumpkin_yellow", "pumpkin_yellow_small",
            "halloweenbits_texture.png",
        ],
    ),
    "dungeon": (
        "KayKit-Dungeon-Remastered-1.0",
        "addons/kaykit_dungeon_remastered/Assets/gltf/",
        [
            "barrel_small", "bottle_A_green", "bottle_B_brown", "candle_lit", "candle_thin_lit",
            "trunk_medium_A", "trunk_small_A", "stool", "plate", "shelf_small_candles",
        ],
    ),
    "restaurant": (
        "KayKit-Restaurant-Bits-1.0",
        "addons/kaykit_restaurant_bits/Assets/gltf/",
        [
            "jar_A_small", "jar_B_small", "jar_C_medium", "bowl_small", "plate_small",
            "restaurantbits_texture.png",
        ],
    ),
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dustlight-assets/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def wanted(names, base):
    """archive-relative file names (under `base`) to extract for a model list"""
    out = []
    for n in names:
        if n.endswith(".png"):
            out.append(n)
        else:
            out += [f"{n}.gltf", f"{n}.bin", f"{n}.gltf.glb"]
    return out


def fetch_pack(pack, repo, base, names):
    dest = os.path.join(ROOT, pack)
    zroot = f"{repo}-main/{base}"
    if names is not None and all(
        os.path.exists(os.path.join(dest, f"{n}.gltf")) or os.path.exists(os.path.join(dest, f"{n}.gltf.glb"))
        or (n.endswith(".png") and os.path.exists(os.path.join(dest, n)))
        for n in names
    ):
        print(pack, "already here")
        return
    if names is None and os.path.isdir(dest) and len(os.listdir(dest)) > 100:
        print(pack, "already here")
        return
    url = f"https://github.com/KayKit-Game-Assets/{repo}/archive/refs/heads/main.zip"
    print(pack, "<-", url)
    z = zipfile.ZipFile(io.BytesIO(get(url)))
    keep = None if names is None else set(wanted(names, base))
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
    print(pack, "ok,", n, "files")


def main():
    for pack, (repo, base, names) in PACKS.items():
        try:
            fetch_pack(pack, repo, base, names)
        except Exception as e:  # keep going: one pack failing must not stop the rest
            print(pack, "FAILED", e)


if __name__ == "__main__":
    main()
