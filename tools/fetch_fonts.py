"""Download the game's two fonts into public/assets/fonts/, so the page serves them itself
(no request to Google from the player's browser, and no render-blocking stylesheet on
another server).

IBM Plex Sans Thai (400/500/600) and Mali (500/600), SIL Open Font License: the
woff2 files of every subset Google Fonts has (the browser fetches only the ones the
text needs, by unicode-range), fonts.css with their @font-face rules, and each
family's OFL.txt next to them. Re-runnable: skipped while fonts.css and every file it
names are there.
"""
import os
import re
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "fonts")
CSS_URL = ("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600"
           "&family=Mali:wght@500;600&display=swap")
LICENSES = {
    "IBMPlexSansThai": "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsansthai/OFL.txt",
    "Mali": "https://raw.githubusercontent.com/google/fonts/main/ofl/mali/OFL.txt",
}
# the CSS API picks the font format by the browser asking: this one gets woff2
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def get(url, ua="dustlight-assets/1.0"):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def done():
    css = os.path.join(ROOT, "fonts.css")
    if not os.path.exists(css):
        return False
    names = re.findall(r"url\(\./([^)]+)\)", open(css, encoding="utf-8").read())
    return bool(names) and all(os.path.exists(os.path.join(ROOT, n)) for n in names)


def main():
    if done():
        print("fonts: already there")
        return
    os.makedirs(ROOT, exist_ok=True)
    css = get(CSS_URL, BROWSER_UA).decode("utf-8")
    out = []
    n = 0
    # each block: /* subset */ @font-face { family, weight, src: url(...) ... }
    for subset, block in re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})", css):
        family = re.search(r"font-family:\s*'([^']+)'", block).group(1)
        weight = re.search(r"font-weight:\s*(\d+)", block).group(1)
        url = re.search(r"url\((https://[^)]+)\)", block).group(1)
        name = f"{family.replace(' ', '')}-{weight}-{subset}.woff2"
        path = os.path.join(ROOT, name)
        if not (os.path.exists(path) and os.path.getsize(path) > 0):
            with open(path, "wb") as f:
                f.write(get(url))
        out.append(f"/* {subset} */\n" + block.replace(url, f"./{name}"))
        n += 1
    if not n:
        raise SystemExit("fonts: no @font-face in the Google Fonts CSS (did its format change?)")
    for fam, url in LICENSES.items():
        with open(os.path.join(ROOT, f"OFL-{fam}.txt"), "wb") as f:
            f.write(get(url))
    with open(os.path.join(ROOT, "fonts.css"), "w", encoding="utf-8", newline="\n") as f:
        f.write("/* IBM Plex Sans Thai + Mali (SIL Open Font License: OFL-*.txt), from Google Fonts\n"
                "   by tools/fetch_fonts.py */\n" + "\n".join(out) + "\n")
    print(f"fonts: {n} files")


if __name__ == "__main__":
    main()
