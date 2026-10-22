"""Build catalog/tenant-changes/data.json from the real standard plan (plan A) of a typical residential floor.

Source (read-only): SuperPosition's copy of the architect's "option A" floor plan, and the SuperPosition
comparison of that plan with another option (only its registration numbers are used).

What lands in the repo is only filtered, simplified vectors of ONE apartment, in centimetres:
  * the sheet frame, the title block, the plan title, every SHX text stroke, the dimension chains and the axis
    lines are dropped (see geom.classify); the clip keeps one apartment and a sliver of the core;
  * room names are re-typed generically ("חדר שינה", "מטבח"...), no project / client / architect data;
  * electrical and plumbing points are not in the source drawing: a typical sales-spec set is generated here;
  * two doors the option drawing leaves out (a bedroom, the safe room) are drawn in (changes.BASE_EDITS);
  * the structural reference ("xref") keeps every concrete fill of the drawing, including the thin interior walls
    that the sales plan draws as plain partitions, plus the real Ø110 stack and a generated spec (changes.XREF);
  * the tenant plan is the standard plan plus the tenant's requested changes, defined in changes.py.

    python tools/demos/tenant-changes/extract.py [--preview out.png]
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys

from shapely.geometry import LineString, MultiLineString, Polygon, box
from shapely.ops import unary_union

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from geom import CM_PER_PT, classify, load_paths  # noqa: E402
import changes as CH  # noqa: E402

SRC = pathlib.Path(r"C:\Users\noad\Desktop\Projects\superposition\data")
A_PDF = SRC / "inbox" / "u2dadf6ccdc" / "אופציה א.pdf"          # plan A, 1:50, vector only (no text objects)
CMP_JSON = SRC / "compare" / "c30082f0afe" / "compare.json"       # registration of the other option onto A
OUT = pathlib.Path(__file__).resolve().parents[3] / "catalog" / "tenant-changes" / "data.json"

CLIP = (745.0, 485.0, 1475.0, 1040.0)      # pt: one apartment (north-west) + a sliver of the core
MAMAD_PT = (754.0, 494.0, 984.0, 666.0)     # pt: the safe room envelope (all its concrete is structural)
BALCONY_PT = (757.0, 856.0, 914.0, 1021.0)  # pt: balcony floor tiles


def cm(p):
    return ((p[0] - CLIP[0]) * CM_PER_PT, (p[1] - CLIP[1]) * CM_PER_PT)


def bez(p0, p1, p2, p3, n=8):
    out = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        d = t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def lines_of(paths):
    """Paths (list of pieces) -> list of polylines in cm."""
    out = []
    for pcs in paths:
        for kind, pts in pcs:
            if kind == "L":
                out.append([cm(pts[0]), cm(pts[1])])
            elif kind == "C":
                out.append([cm(p) for p in bez(*pts)])
            elif kind == "Q":
                q = [cm(p) for p in pts]
                out.append(q + [q[0]])
    return out


def polys_of(paths):
    out = []
    for pcs in paths:
        pts = []
        for kind, ps in pcs:
            pts += ps
        if len(pts) >= 3:
            poly = Polygon([cm(p) for p in pts]).buffer(0)
            if poly.area > 0.5:
                out.append(poly)
    return out


def merge_axis_segments(polys, tol=0.6):
    """Merge collinear overlapping axis-aligned 2-point segments; keep the rest."""
    hs, vs, rest = {}, {}, []
    for pl in polys:
        if len(pl) == 2:
            (x1, y1), (x2, y2) = pl
            if abs(y1 - y2) < 0.3:
                hs.setdefault(round((y1 + y2) / 2 / tol), []).append([min(x1, x2), max(x1, x2), (y1 + y2) / 2])
                continue
            if abs(x1 - x2) < 0.3:
                vs.setdefault(round((x1 + x2) / 2 / tol), []).append([min(y1, y2), max(y1, y2), (x1 + x2) / 2])
                continue
        rest.append(pl)
    res = []
    for groups, horiz in ((hs, True), (vs, False)):
        for segs in groups.values():
            segs.sort()
            cur = None
            merged = []
            for a, b, c in segs:
                if cur and a <= cur[1] + 0.3:
                    cur[1] = max(cur[1], b)
                else:
                    if cur:
                        merged.append(cur)
                    cur = [a, b, c]
            if cur:
                merged.append(cur)
            for a, b, c in merged:
                if b - a < 0.4:
                    continue
                res.append([(a, c), (b, c)] if horiz else [(c, a), (c, b)])
    # dedupe the rest
    seen = set()
    for pl in rest:
        key = tuple((round(x), round(y)) for x, y in pl)
        if key in seen or tuple(reversed(key)) in seen:
            continue
        seen.add(key)
        res.append(pl)
    return res


def drop_isolated(polys, max_len=36.0, tol=1.0):
    """Drop short free-standing strokes: dimension ticks and leader stubs left over after the text filter."""
    verts = {}
    for i, pl in enumerate(polys):
        for x, y in pl:
            verts.setdefault((round(x / tol), round(y / tol)), set()).add(i)

    def shared(i, p):
        kx, ky = round(p[0] / tol), round(p[1] / tol)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if verts.get((kx + dx, ky + dy), set()) - {i}:
                    return True
        return False

    out = []
    for i, pl in enumerate(polys):
        if len(pl) == 2 and math.dist(pl[0], pl[1]) < max_len and not shared(i, pl[0]) and not shared(i, pl[1]):
            continue
        out.append(pl)
    return out


def chain(polys, tol=0.6):
    """Join polylines that share end points (arcs come as many 2-point strokes)."""
    polys = [list(p) for p in polys if len(p) >= 2]
    key = lambda p: (round(p[0] / tol), round(p[1] / tol))
    ends = {}
    for i, pl in enumerate(polys):
        ends.setdefault(key(pl[0]), []).append(i)
        ends.setdefault(key(pl[-1]), []).append(i)
    used = [False] * len(polys)
    out = []

    def take(k, exclude):
        for j in ends.get(k, []):
            if not used[j] and j != exclude:
                return j
        return None

    for i in range(len(polys)):
        if used[i]:
            continue
        used[i] = True
        cur = polys[i][:]
        for _ in range(2):
            while True:
                j = take(key(cur[-1]), i)
                if j is None:
                    break
                used[j] = True
                nxt = polys[j]
                if key(nxt[0]) == key(cur[-1]):
                    cur += nxt[1:]
                else:
                    cur += list(reversed(nxt))[1:]
            cur.reverse()
        out.append(cur)
    return out


def d_lines(polys):
    """Polylines -> compact SVG path data (integers, H/V shortcuts)."""
    parts = []
    for pl in chain(polys):
        pts = [(round(x), round(y)) for x, y in pl]
        clean = [pts[0]]
        for p in pts[1:]:
            if p != clean[-1]:
                clean.append(p)
        if len(clean) < 2:
            continue
        s = f"M{clean[0][0]} {clean[0][1]}"
        px, py = clean[0]
        for x, y in clean[1:]:
            if y == py:
                s += f"H{x}"
            elif x == px:
                s += f"V{y}"
            else:
                s += f"L{x} {y}"
            px, py = x, y
        parts.append(s)
    return "".join(parts)


def d_polys(geom):
    parts = []
    gs = getattr(geom, "geoms", [geom])
    for g in gs:
        if g.is_empty or g.area < 1:
            continue
        g = g.simplify(0.4)
        for ring in [g.exterior, *g.interiors]:
            pts = [(round(x), round(y)) for x, y in ring.coords[:-1]]
            if len(pts) < 3:
                continue
            parts.append("M" + "L".join(f"{x} {y}" for x, y in pts) + "Z")
    return "".join(parts)


def clip_lines(polys, region, inside):
    """Return the parts of polylines inside (or outside) a shapely region."""
    out = []
    for pl in polys:
        ls = LineString(pl)
        g = ls.intersection(region) if inside else ls.difference(region)
        if g.is_empty:
            continue
        for part in getattr(g, "geoms", [g]):
            if part.geom_type == "LineString" and part.length > 0.4:
                out.append(list(part.coords))
    return out


def build(preview=None):
    L = classify(load_paths(A_PDF), CLIP)

    walls = merge_axis_segments(lines_of(L["wall"]) + lines_of(L["thick"]))
    # the sales plan hatches only the thick concrete (envelope, core) and the safe room; the thin red strips of the
    # drawing are drawn there as plain partitions. The structural xref keeps every concrete fill.
    conc, mam = [], box(*cm(MAMAD_PT[:2]), *cm(MAMAD_PT[2:]))
    all_conc = polys_of(L["conc"])
    for p in all_conc:
        x0, y0, x1, y1 = p.bounds
        if min(x1 - x0, y1 - y0) >= 8.0 * CM_PER_PT or mam.contains(p):
            conc.append(p)
    merge = lambda ps: unary_union([p.buffer(0.35, join_style=2) for p in ps]).buffer(-0.35, join_style=2)
    conc, conc_all = merge(conc), merge(all_conc)
    thin = conc_all.difference(conc.buffer(0.6, join_style=2))
    thin_parts = [g for g in getattr(thin, "geoms", [thin]) if g.area > 40]
    thin_len = sum(max(g.bounds[2] - g.bounds[0], g.bounds[3] - g.bounds[1]) for g in thin_parts) / 100
    cols = unary_union([p.buffer(0.2, join_style=2) for p in polys_of(L["col"])])
    fix_all = lines_of(L["fix"])
    bal = box(*cm(BALCONY_PT[:2]), *cm(BALCONY_PT[2:]))
    tiles = [pl for pl in fix_all if bal.contains(LineString(pl))]
    fix = [pl for pl in fix_all if not bal.contains(LineString(pl))]
    furn = lines_of(L["furn"])

    W = round((CLIP[2] - CLIP[0]) * CM_PER_PT)
    H = round((CLIP[3] - CLIP[1]) * CM_PER_PT)

    base = {"wall": walls, "fix": drop_isolated(merge_axis_segments(fix)), "furn": drop_isolated(merge_axis_segments(furn)), "tile": tiles}
    # doors the option drawing leaves out (see changes.BASE_EDITS)
    cut = unary_union([box(*b) for b in CH.BASE_EDITS["cut"]])
    base["wall"] = clip_lines(base["wall"], cut, False) + CH.BASE_EDITS["wall"]
    base["fix"] = base["fix"] + CH.BASE_EDITS["fix"]

    out_changes = []
    removed_pts = {}
    by_id = {p["id"]: p for p in CH.POINTS}
    for ch in CH.CHANGES:
        a_only = {}
        for item in ch.get("rm", []):
            b, lays = (item["b"], item["lay"]) if isinstance(item, dict) else (item, ("wall", "fix", "furn"))
            rm = box(*b)
            for lay in lays:
                inside = clip_lines(base[lay], rm, True)
                if inside:
                    a_only.setdefault(lay, []).extend(inside)
                    base[lay] = clip_lines(base[lay], rm, False)
            ci = conc.intersection(rm)
            if not isinstance(item, dict) and not ci.is_empty and ci.area > 1:
                a_only["conc"] = d_polys(ci)
                conc = conc.difference(rm)
        a_only = {k: (v if k == "conc" else d_lines(v)) for k, v in a_only.items()}
        for pid in ch.get("pa", []):
            removed_pts[pid] = ch["id"]
        rec = {k: v for k, v in ch.items() if k not in ("rm", "add", "pa")}
        rec["a"] = a_only
        rec["b"] = {k: d_lines(v) for k, v in ch.get("add", {}).items() if v}
        rec["pa"] = [by_id[i] for i in ch.get("pa", [])]
        rec["pb"] = ch.get("pb", [])
        out_changes.append(rec)
    CH.finalize(out_changes, conc_all, CH.PRICES)

    pts = [p for p in CH.POINTS if p["id"] not in removed_pts]
    data = {
        "meta": {
            "units": "cm",
            "w": W,
            "h": H,
            "scale": "1:50",
            "align": CH.align_info(CMP_JSON),
            "stage": CH.STAGE,
            "board": CH.BOARD,
            "h_wall": CH.H_WALL,
            "recess": CH.RECESS,
            "thin": {"n": len(thin_parts), "m": round(thin_len, 1)},
        },
        "layers": {
            "wall": d_lines(base["wall"]),
            "conc": d_polys(conc),
            "col": d_polys(cols),
            "fix": d_lines(base["fix"]),
            "furn": d_lines(base["furn"]),
            "tile": d_lines(base["tile"]),
        },
        # structural / MEP reference (xref): every concrete fill, the thin ones highlighted, + the generated spec
        "xref": {
            "conc": d_polys(conc_all),
            "thin": d_polys(unary_union(thin_parts)),
            **CH.XREF,
        },
        "rooms": CH.ROOMS,
        "points": pts,
        "changes": out_changes,
        "prices": CH.PRICES,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("wrote", OUT, OUT.stat().st_size, "bytes")
    if preview:
        render_preview(data, preview)
    return data


def render_preview(data, path, z=1.2):
    """Raster check of the cm data with a 50 cm grid (for authoring changes.py)."""
    import re
    from PIL import Image, ImageDraw

    W, H = data["meta"]["w"], data["meta"]["h"]
    im = Image.new("RGB", (int(W * z) + 40, int(H * z) + 40), "white")
    g = ImageDraw.Draw(im)
    T = lambda x, y: (20 + x * z, 20 + y * z)
    for gx in range(0, W + 1, 50):
        g.line([T(gx, 0), T(gx, H)], fill=(235, 240, 250) if gx % 100 else (200, 215, 240))
        if gx % 100 == 0:
            g.text(T(gx + 2, -14), str(gx), fill=(80, 110, 200))
    for gy in range(0, H + 1, 50):
        g.line([T(0, gy), T(W, gy)], fill=(235, 240, 250) if gy % 100 else (200, 215, 240))
        if gy % 100 == 0:
            g.text(T(-18, gy + 2), str(gy), fill=(80, 110, 200))

    def draw_d(d, col, fill=None):
        for sub in re.findall(r"M[^M]+", d):
            toks = re.findall(r"[MLHVZ]|-?\d+(?:\.\d+)?", sub)
            pts, cx, cy, i = [], 0, 0, 0
            while i < len(toks):
                t = toks[i]
                if t in "ML":
                    cx, cy = float(toks[i + 1]), float(toks[i + 2]); i += 3
                elif t == "H":
                    cx = float(toks[i + 1]); i += 2
                elif t == "V":
                    cy = float(toks[i + 1]); i += 2
                elif t == "Z":
                    pts.append(pts[0]); i += 1; continue
                else:
                    cx, cy = float(t), float(toks[i + 1]); i += 2
                pts.append(T(cx, cy))
            if fill and len(pts) > 2:
                g.polygon(pts, fill=fill)
            elif len(pts) > 1:
                g.line(pts, fill=col, width=1)

    Ls = data["layers"]
    draw_d(data["xref"]["thin"], None, (255, 200, 90))
    draw_d(Ls["conc"], None, (255, 170, 180))
    draw_d(Ls["col"], None, (150, 150, 150))
    draw_d(Ls["tile"], (210, 220, 230))
    draw_d(Ls["furn"], (120, 170, 120))
    draw_d(Ls["fix"], (60, 120, 220))
    draw_d(Ls["wall"], (0, 0, 0))
    for ch in data["changes"]:
        for k, d in ch["a"].items():
            draw_d(d, (230, 0, 0), (255, 120, 120) if k == "conc" else None)
        for k, d in ch["b"].items():
            draw_d(d, (0, 170, 0))
        for p in ch["pa"]:
            g.rectangle([T(p["x"] - 5, p["y"] - 5), T(p["x"] + 5, p["y"] + 5)], outline=(230, 0, 0))
        for p in ch["pb"]:
            g.rectangle([T(p["x"] - 5, p["y"] - 5), T(p["x"] + 5, p["y"] + 5)], fill=(0, 170, 0))
        for p in ch.get("sug", []):
            g.ellipse([T(p["x"] - 7, p["y"] - 7), T(p["x"] + 7, p["y"] + 7)], outline=(240, 160, 0), width=2)
        x, y = ch["at"]
        g.ellipse([T(x - 9, y - 9), T(x + 9, y + 9)], outline=(255, 120, 0), width=2)
        g.text(T(x + 11, y - 6), ch["id"], fill=(255, 100, 0))
    for p in data["points"]:
        x, y = p["x"], p["y"]
        c = (150, 60, 220) if p["k"] in ("s", "l", "w", "t") else (40, 120, 255)
        g.rectangle([T(x - 4, y - 4), T(x + 4, y + 4)], outline=c)
    for r in data["rooms"]:
        g.text(T(r["lx"] - 20, r["ly"]), r["id"], fill=(0, 0, 0))
    im.save(path)
    print("preview", path, im.size)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview")
    a = ap.parse_args()
    build(a.preview)
