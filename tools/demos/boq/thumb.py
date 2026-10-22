"""Gallery thumbnail for the BOQ demo (catalog/boq/thumb.svg, 1200x675), built from catalog/boq/data.json.

Left: the power sheet with the counted sockets highlighted. Right: the bill of quantities by chapter,
the sockets line linked to the drawing.

    python -X utf8 tools/demos/boq/thumb.py
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

from shapely.geometry import LineString

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "catalog" / "boq" / "data.json"
OUT = ROOT / "catalog" / "boq" / "thumb.svg"


def parse(d):
    """Subpaths [(points, closed)] of the compact relative path format written by extract.py."""
    toks = re.findall(r"[MmlzZ]|-?\d+", d)
    out, cur, pen, cmd, i = [], None, (0, 0), None, 0
    while i < len(toks):
        t = toks[i]
        if t in "Mmlz":
            cmd = t
            i += 1
            if t == "z" and cur:
                out.append((cur, True))
                pen, cur = cur[0], None
            continue
        a, b = int(toks[i]), int(toks[i + 1])
        i += 2
        if cmd == "M":
            pen = (a, b); cur = [pen]; cmd = "l"
        elif cmd == "m":
            if cur:
                out.append((cur, False))
            pen = (pen[0] + a, pen[1] + b); cur = [pen]; cmd = "l"
        else:
            pen = (pen[0] + a, pen[1] + b); cur.append(pen)
    if cur:
        out.append((cur, False))
    return out


def encode(subpaths, T, tol, min_len=0.0):
    """Absolute path data in whole thumbnail pixels, simplified."""
    parts = []
    for pts, closed in subpaths:
        q = [T(x, y) for x, y in pts]
        if len(q) > 2:
            ring = q + [q[0]] if closed else q
            q = list(LineString(ring).simplify(tol, preserve_topology=False).coords)
            if closed and len(q) > 1 and q[0] == q[-1]:
                q = q[:-1]
        if len(q) < 2:
            continue
        xs, ys = [p[0] for p in q], [p[1] for p in q]
        if max(max(xs) - min(xs), max(ys) - min(ys)) < min_len:
            continue
        r = []
        for x, y in q:
            s = f"{round(x)},{round(y)}"
            if not r or r[-1] != s:
                r.append(s)
        if len(r) < 2:
            continue
        parts.append("M" + "L".join(r) + ("Z" if closed else ""))
    return "".join(parts)


def main():
    D = json.loads(DATA.read_text(encoding="utf-8"))
    sh = D["sheets"]["E"]
    off = sh["off"]
    vx, vy, vw, vh = sh["vb"]
    # drawing box on the left
    bx, by, bw, bh = 36, 70, 720, 560
    s = min(bw / vw, bh / vh)
    ox = bx + (bw - vw * s) / 2 - vx * s
    oy = by + (bh - vh * s) / 2 - vy * s
    T = lambda x, y: (x * s + ox, y * s + oy)
    Tb = lambda x, y: ((x + off[0]) * s + ox, (y + off[1]) * s + oy)

    el = []
    el.append('<rect width="1200" height="675" fill="#111519"/>')
    # faint grid
    for gx in range(0, 1200, 40):
        el.append(f'<line x1="{gx}" y1="0" x2="{gx}" y2="675" stroke="#151a1f"/>')
    for gy in range(0, 675, 40):
        el.append(f'<line x1="0" y1="{gy}" x2="1200" y2="{gy}" stroke="#151a1f"/>')
    base = D["base"]
    el.append(f'<path d="{encode(parse(base["walls"]["b"]), Tb, 0.6, 2.0)}" fill="#323c44"/>')
    el.append(f'<path d="{encode(parse(base["walls"]["s"]), Tb, 0.6, 3.0)}" fill="none" stroke="#9aa6ac" stroke-width=".7"/>')
    el.append(f'<path d="{encode(parse(base["open"]["s"]), Tb, 0.6, 4.0)}" fill="none" stroke="#5f6b72" stroke-width=".6"/>')
    el.append(f'<path d="{encode(parse(base["fix"]["s"]), Tb, 0.6, 4.0)}" fill="none" stroke="#4d5960" stroke-width=".5"/>')
    el.append(f'<path d="{encode(parse(sh["disc"]["s"]), T, 0.6, 3.5)}" fill="none" stroke="#b98a3e" stroke-width=".6" opacity=".75"/>')
    # counted symbols: every instance boxed, the socket line highlighted
    for code, rows in D["inst"]["E"].items():
        for x, y, w, h, _ in rows:
            (x0, y0), (x1, y1) = T(x - 30, y - 30), T(x + w + 30, y + h + 30)
            if code == "L30":
                el.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{x1 - x0:.1f}" height="{y1 - y0:.1f}" rx="2" fill="#ff5b2e" fill-opacity=".45" stroke="#fff" stroke-width="1.3"/>')
            else:
                el.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{x1 - x0:.1f}" height="{y1 - y0:.1f}" rx="2" fill="none" stroke="#8c979c" stroke-width=".8" stroke-opacity=".7"/>')

    # BOQ panel on the right
    px, py, pw = 800, 70, 364
    # quantities computed from the data, as the demo does (wall height 3.25 m, tile waste 10%)
    wl = {(w["k"], w["t"]): w["len"] for w in D["walls"]}
    n = lambda k, c: len(D["inst"][k][c])
    floor = sum(r["a"] for r in D["rooms"]) * 1.1
    q2 = lambda v: f"{math.floor(v * 100 + 0.5) / 100:.2f}"   # half up, like the page
    vals = [("02.002.0009", wl[("conc", 20)] * 3.25 * 0.2), ("02.002.0010", wl[("conc", 25)] * 3.25 * 0.25),
            ("04.001.0010", wl[("block", 10)] * 3.25), ("07.012.0010", n("P", "P00")), ("08.001.0012", n("L", "A43")),
            ("08.002.0010", n("E", "L30")), ("08.002.0040", n("E", "L33")), ("10.003.0010", floor)]
    vmax = {}
    for code, v in vals:
        vmax[code[:2]] = max(vmax.get(code[:2], 0), v)
    rows, last = [], None
    for code, v in vals:
        if code[:2] != last:
            rows.append((code[:2], None, None))
            last = code[:2]
        rows.append((code, str(v) if isinstance(v, int) else q2(v), 0.12 + 0.8 * v / max(vmax[code[:2]], 1) * (0.9 if code.startswith("08.002.0040") else 1)))
    rh = 34
    ph = 56 + len(rows) * rh + 10
    el.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="12" fill="#101318" stroke="#2a3038"/>')
    el.append(f'<rect x="{px}" y="{py}" width="{pw}" height="46" rx="12" fill="#171b21"/>')
    el.append(f'<rect x="{px}" y="{py + 34}" width="{pw}" height="12" fill="#171b21"/>')
    el.append(f'<text x="{px + pw - 18}" y="{py + 29}" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#edeef0" text-anchor="end">כתב כמויות</text>')
    el.append(f'<text x="{px + 18}" y="{py + 29}" font-family="Consolas, Menlo, monospace" font-size="13" fill="#ff5b2e">BOQ-AI</text>')
    y = py + 56
    sel_y = None
    for code, qty, frac in rows:
        if qty is None:
            el.append(f'<rect x="{px + 10}" y="{y + 4}" width="{pw - 20}" height="{rh - 8}" rx="5" fill="#1f1714"/>')
            el.append(f'<text x="{px + pw - 22}" y="{y + 22}" font-family="Consolas, Menlo, monospace" font-size="13" font-weight="700" fill="#ff8a66" text-anchor="end">{code}</text>')
            el.append(f'<rect x="{px + 150}" y="{y + 15}" width="{pw - 210}" height="4" rx="2" fill="#3a2a24"/>')
        else:
            sel = code == "08.002.0010"
            if sel:
                sel_y = y + rh / 2
                el.append(f'<rect x="{px + 6}" y="{y + 2}" width="{pw - 12}" height="{rh - 4}" rx="6" fill="#ff5b2e" fill-opacity=".18" stroke="#ff5b2e"/>')
            el.append(f'<text x="{px + pw - 22}" y="{y + 22}" font-family="Consolas, Menlo, monospace" font-size="13" fill="{"#edeef0" if sel else "#a1a7b0"}" text-anchor="end">{code}</text>')
            el.append(f'<rect x="{px + 96}" y="{y + 14}" width="{(pw - 230) * frac:.0f}" height="6" rx="3" fill="{"#ff5b2e" if sel else "#3a434b"}"/>')
            el.append(f'<text x="{px + 22}" y="{y + 22}" font-family="Consolas, Menlo, monospace" font-size="14" font-weight="{"700" if sel else "400"}" fill="{"#ffffff" if sel else "#c9d1d4"}">{qty}</text>')
        y += rh
    # link from the selected line to the drawing
    if sel_y is not None:
        # to the socket closest to the panel row
        pts = [T(x + w / 2, y + h / 2) for x, y, w, h, _ in D["inst"]["E"]["L30"]]
        tx, ty = min(pts, key=lambda q: (px - q[0]) ** 2 + 0.3 * (sel_y - q[1]) ** 2)
        el.append(f'<path d="M{px},{sel_y:.0f} C{(px + tx) / 2:.0f},{sel_y:.0f} {(px + tx) / 2:.0f},{ty:.0f} {tx + 8:.0f},{ty:.0f}" fill="none" stroke="#ff5b2e" stroke-width="2" stroke-dasharray="6 4"/>')
        el.append(f'<circle cx="{tx + 8:.0f}" cy="{ty:.0f}" r="3.5" fill="#ff5b2e"/>')
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">' + "\n".join(el) + "</svg>\n"
    OUT.write_text(svg, encoding="utf-8")
    print(f"wrote {OUT} ({len(svg.encode('utf-8')) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
