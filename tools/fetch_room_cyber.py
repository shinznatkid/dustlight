"""Download the assets of the `cyber` room (src/rooms/cyber.js) into
public/assets/rooms/cyber/.

Kenney Furniture Kit (CC0 1.0, https://kenney.nl/assets/furniture-kit): the zip is
fetched from kenney.nl once and its GLB models are unpacked to
public/assets/rooms/cyber/kenney/<name>.glb (the room uses a handful of them; the
kit's own license file is kept next to them). The same kit as the pottery studio's,
kept in the room's own folder so each room stands on its own. Everything else in
the room (the shell, the neon signs, the kitchenette and its stove, the city behind
the window, the cat) is procedural.

Re-runnable: when every model the room needs is already there, nothing is fetched.
Run: python tools/fetch_room_cyber.py [--force]
"""
import io
import os
import sys
import urllib.request
import zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "assets", "rooms", "cyber")
KENNEY_ZIP = "https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip"
OUT = os.path.join(ROOT, "kenney")

# the models src/rooms/cyber/*.js loads (a missing one is only skipped with a warning
# at run time, but the fetch should bring all of them)
NEEDED = [
    "loungeSofa", "tableCoffeeSquare", "desk", "chairDesk", "computerKeyboard", "bookcaseOpenLow",
    "kitchenFridgeSmall", "kitchenMicrowave", "toaster", "lampRoundFloor", "pottedPlant", "plantSmall1",
    "plantSmall2", "plantSmall3", "radio", "speakerSmall", "books", "pillow",
]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dustlight-assets/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    force = "--force" in sys.argv[1:]
    have = [n for n in NEEDED if os.path.exists(os.path.join(OUT, f"{n}.glb"))]
    if len(have) == len(NEEDED) and not force:
        print(f"kenney furniture kit (cyber): all {len(NEEDED)} models present, nothing to do")
        return
    print("downloading", KENNEY_ZIP)
    data = get(KENNEY_ZIP)
    print(f"  {len(data) / 1e6:.1f} MB")
    os.makedirs(OUT, exist_ok=True)
    n = 0
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            name = info.filename.replace("\\", "/")
            base = os.path.basename(name)
            stem = base[:-4] if base.lower().endswith(".glb") else None
            if stem in NEEDED and "/gltf" in name.lower():
                with open(os.path.join(OUT, base), "wb") as f:
                    f.write(z.read(info))
                n += 1
            elif base.lower() in ("license.txt", "license.md"):
                with open(os.path.join(OUT, "LICENSE-kenney.txt"), "wb") as f:
                    f.write(z.read(info))
    print(f"  unpacked {n} GLB models to {os.path.relpath(OUT)}")
    missing = [m for m in NEEDED if not os.path.exists(os.path.join(OUT, f"{m}.glb"))]
    if missing:
        print("  MISSING:", ", ".join(missing))
        sys.exit(1)
    print("ok")


if __name__ == "__main__":
    main()
