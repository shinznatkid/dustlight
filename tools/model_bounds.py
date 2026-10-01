"""Print rough bounds / triangle counts of every glTF under public/assets/models."""
import glob
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "models")

for d in sorted(os.listdir(ROOT)):
    f = glob.glob(os.path.join(ROOT, d, "*.gltf"))[0]
    g = json.load(open(f, encoding="utf-8"))
    mn = [1e9] * 3
    mx = [-1e9] * 3
    tris = 0
    rot = False
    for n in g.get("nodes", []):
        if "mesh" not in n:
            continue
        t = n.get("translation", [0, 0, 0])
        s = n.get("scale", [1, 1, 1])
        rot = rot or "rotation" in n
        for p in g["meshes"][n["mesh"]]["primitives"]:
            a = g["accessors"][p["attributes"]["POSITION"]]
            for i in range(3):
                mn[i] = min(mn[i], a["min"][i] * s[i] + t[i])
                mx[i] = max(mx[i], a["max"][i] * s[i] + t[i])
            if "indices" in p:
                tris += g["accessors"][p["indices"]]["count"] // 3
    print(f"{d:28s} size=({mx[0]-mn[0]:.2f},{mx[1]-mn[1]:.2f},{mx[2]-mn[2]:.2f}) "
          f"min=({mn[0]:.2f},{mn[1]:.2f},{mn[2]:.2f}) tris={tris} "
          f"nodes={len(g.get('nodes', []))} mats={len(g.get('materials', []))} rot={'Y' if rot else '-'}")
