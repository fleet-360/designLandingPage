"""Gallery thumbnail for /catalog/compare/: 1200x675 SVG of the superposition (A-only red, B-only blue, common
light), with a few difference-region frames and markers. Built from catalog/compare/data.{json,bin} (already
anonymized by extract.py), so it carries nothing the demo does not.

    python tools/demos/compare/thumb.py
"""
from __future__ import annotations

import json
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import extract as E  # noqa: E402

OUT = E.OUT
W, H = 1200, 675
VIEW = (1900.0, 560.0, 1650.0)          # x0, y0, width in crop-local pt (height follows 16:9)
SHOW = ["f2", "f6", "f5"]         # findings framed on the thumbnail (the first one highlighted)
COL = {"a": "#ff5a52", "b": "#4c8dff", "c": "#d6dce1"}


def main():
    meta = json.loads((OUT / "data.json").read_text(encoding="utf-8"))
    raw = (OUT / "data.bin").read_bytes()
    q = meta["q"]
    vx, vy, vw = VIEW
    k = W / vw
    vh = H / k

    def P(x, y):
        return (x / q - vx) * k, (y / q - vy) * k

    groups = {"c": [], "a": [], "b": [], "fa": [], "fb": []}
    for bt in meta["batches"]:
        if bt["kind"] == "f" and bt["tone"] != "d":
            continue
        if bt["kind"] == "s" and bt["tone"] != "s":
            continue
        key = ("f" + bt["side"]) if bt["kind"] == "f" else ("c" if bt["cls"] == "c" else bt["side"])
        for pts in E.unpack(raw[bt["off"]: bt["off"] + bt["len"]]):
            xy = [P(x, y) for x, y in pts]
            xs, ys = [p[0] for p in xy], [p[1] for p in xy]
            if max(xs) < -2 or min(xs) > W + 2 or max(ys) < -2 or min(ys) > H + 2:
                continue
            L = sum(math.hypot(xy[i + 1][0] - xy[i][0], xy[i + 1][1] - xy[i][1]) for i in range(len(xy) - 1))
            if bt["kind"] == "s" and L < (7 if bt["cls"] == "c" else 4):
                continue
            d, px, py = [], None, None
            for i, (x, y) in enumerate(xy):
                X, Y = round(x), round(y)
                if i == 0:
                    d.append(f"M{X} {Y}")
                else:
                    d.append(f"l{X - px} {Y - py}")
                px, py = X, Y
            if bt["kind"] == "f":
                d.append("z")
            groups[key].append("".join(d))

    regs = {r["id"]: r for r in meta["regions"]}
    order = {r["id"]: i + 1 for i, r in enumerate(meta["regions"])}
    frames = []
    for rid in SHOW:
        x, y, w, h = regs[rid]["bbox"]
        X, Y, Wd, Ht = (x - vx) * k, (y - vy) * k, w * k, h * k
        sel = rid == SHOW[0]
        frames.append(f'<rect x="{X:.1f}" y="{Y:.1f}" width="{Wd:.1f}" height="{Ht:.1f}" fill="{"rgba(255,152,0,.08)" if sel else "none"}" '
                      f'stroke="#ff9800" stroke-width="{3 if sel else 1.6}"{"" if sel else " stroke-dasharray=\"8 5\""}/>')
        cx, cy = X + Wd - 18, Y + 18
        frames.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="13" fill="#ff9800" stroke="#111519" stroke-width="2"/>'
                      f'<text x="{cx:.1f}" y="{cy + 5:.1f}" font-family="ui-monospace,Consolas,monospace" font-size="14" font-weight="700" '
                      f'text-anchor="middle" fill="#111">{order[rid]}</text>')

    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
           f'<rect width="{W}" height="{H}" fill="#111519"/>',
           '<g fill-opacity=".22">'
           f'<path fill="{COL["c"]}" d="{"".join(groups["fa"])}"/>'
           f'<path fill="{COL["b"]}" d="{"".join(groups["fb"])}"/></g>',
           '<g fill="none" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">',
           f'<path stroke="{COL["a"]}" d="{"".join(groups["a"])}"/>',
           f'<path stroke="{COL["b"]}" d="{"".join(groups["b"])}"/>',
           f'<path stroke="{COL["c"]}" stroke-opacity=".7" d="{"".join(groups["c"])}"/>',
           "</g>", *frames,
           # legend chips: A red, B blue, common (no text)
           '<g transform="translate(1140 30)"><rect x="-6" y="-6" width="42" height="78" rx="6" fill="#0d1013" fill-opacity=".88" stroke="#1d232a"/>'
           f'<rect x="4" y="4" width="22" height="14" rx="3" fill="#d32f2f"/><rect x="4" y="26" width="22" height="14" rx="3" fill="#1e5ce6"/>'
           f'<rect x="4" y="48" width="22" height="14" rx="3" fill="{COL["c"]}"/>'
           '<text x="15" y="15.5" font-family="ui-monospace,Consolas,monospace" font-size="11" font-weight="700" text-anchor="middle" fill="#fff">A</text>'
           '<text x="15" y="37.5" font-family="ui-monospace,Consolas,monospace" font-size="11" font-weight="700" text-anchor="middle" fill="#fff">B</text></g>',
           "</svg>"]
    out = "\n".join(svg)
    (OUT / "thumb.svg").write_text(out, encoding="utf-8")
    print("thumb.svg", len(out.encode()), "bytes; paths", {k2: len(v) for k2, v in groups.items()}, "view h", round(vh))


if __name__ == "__main__":
    main()
