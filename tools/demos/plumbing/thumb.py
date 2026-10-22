"""Gallery thumbnail for the plumbing demo: catalog/plumbing/thumb.svg (1200x675), drawn from data.json.

Usage:  python -I tools/demos/plumbing/thumb.py   (after extract.py)
"""
import json
import os
import re

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "..", "..", "catalog", "plumbing", "data.json")
OUT = os.path.join(HERE, "..", "..", "..", "catalog", "plumbing", "thumb.svg")

# same palette as the demo (step "lengths by diameter")
COLOR = {"SWG": "#e3a13b", "ZMG": "#7591ff", "ROOF": "#7591ff", "NIK": "#31c9b0", "WTR": "#3fb8f5", "FIRE": "#ff5d5d", "SPR": "#d66bf0"}


def width(d):
    k = int(d[1:]) if d.startswith("Ø") else {"1/2\"": .5, "3/4\"": .75, "1\"": 1, "2\"": 2, "3\"": 3, "4\"": 4}.get(d, 1) * 25.4
    return 4.6 if k >= 250 else 3.6 if k >= 150 else 2.8 if k >= 100 else 2.3 if k >= 70 else 2 if k >= 40 else 1.6


def main():
    d = json.load(open(DATA, encoding="utf-8"))
    W, H = d["w"], d["h"]
    # crop to the 16:9 band around the middle of the floor
    vw = W * 0.86
    vh = vw * 675 / 1200
    vx, vy = W * 0.07, (H - vh) / 2 - 40
    s = 1200 / vw

    def tr(path):
        def f(m):
            x, y = float(m.group(1)), float(m.group(2))
            return f"{(x - vx) * s:.1f} {(y - vy) * s:.1f}"
        return re.sub(r"(-?\d+) (-?\d+)", f, path)

    out = ['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">',
           '<rect width="1200" height="675" fill="#111519"/>']
    bg = d["bg"]
    out.append(f'<path d="{tr(bg.get("axis", ""))}" fill="none" stroke="#232a31" stroke-dasharray="14 4 2 4"/>')
    out.append(f'<path d="{tr(bg["wallfill"])}" fill="#262d34"/>')
    out.append(f'<path d="{tr(bg["arch"])}" fill="none" stroke="#39434b" stroke-width=".8"/>')
    out.append(f'<path d="{tr(bg["wall"])}" fill="none" stroke="#59646b"/>')
    by = {}
    for r in d["runs"]:
        p = r["p"]
        pts = " ".join(f"{(p[k] - vx) * s:.1f} {(p[k + 1] - vy) * s:.1f}" for k in range(0, len(p), 2))
        by.setdefault((r["s"], width(r["d"])), []).append("M" + pts)
    for (src, w), ds in sorted(by.items(), key=lambda kv: kv[0][1]):
        d_attr = "".join(_poly(x) for x in ds)
        out.append(f'<path d="{d_attr}" fill="none" stroke="{COLOR[src]}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')
    for q in d["pts"]:
        x, y = (q["x"] - vx) * s, (q["y"] - vy) * s
        if 0 <= x <= 1200 and 0 <= y <= 675:
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.2" fill="#111519" stroke="{COLOR[q["s"]]}" stroke-width="2"/>')
    out.append("</svg>")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("thumb", os.path.getsize(OUT))


def _poly(m):
    nums = m[1:].split()
    pairs = [f"{nums[i]} {nums[i + 1]}" for i in range(0, len(nums), 2)]
    return "M" + "L".join(pairs)


if __name__ == "__main__":
    main()
