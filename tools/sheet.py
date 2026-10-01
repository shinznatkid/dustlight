"""Tile screenshots into one image: python tools/sheet.py out.jpg a.png b.png ... [--cols=2] [--w=900]"""
import sys

from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith("--")]
opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--"))
out, files = args[0], args[1:]
cols = int(opts.get("cols", 2))
tw = int(opts.get("w", 900))
ims = [Image.open(f).convert("RGB") for f in files]
th = round(ims[0].height * tw / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (tw * cols, th * rows), (20, 20, 20))
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th), Image.LANCZOS), ((i % cols) * tw, (i // cols) * th))
sheet.save(out, quality=88)
print("saved", out, sheet.size)
