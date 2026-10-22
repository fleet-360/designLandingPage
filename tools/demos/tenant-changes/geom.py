"""Vector extraction helpers for the tenant-changes demo.

Reads plan A (the standard sales plan) from its original location (read-only), clips it to one apartment,
classifies the PDF paths into CAD-like layers and drops everything that is text (SHX glyph strokes),
dimensions, axis lines, the sheet frame and the title block.
"""
from __future__ import annotations

import math
from collections import defaultdict

import pymupdf as fitz

# 1:50 sheet -> 1 pt = 0.3528 mm * 50 = 1.764 cm
CM_PER_PT = 2.54 / 72 * 50


def load_paths(pdf_path):
    pg = fitz.open(pdf_path)[0]
    return pg.get_drawings()


def items_to_polys(x):
    """Return a list of primitive pieces: ('L', [(x,y),(x,y)]) or ('C', [p0,p1,p2,p3]) or ('Q', [4 pts])."""
    out = []
    for it in x["items"]:
        k = it[0]
        if k == "l":
            out.append(("L", [(it[1].x, it[1].y), (it[2].x, it[2].y)]))
        elif k == "c":
            out.append(("C", [(p.x, p.y) for p in it[1:5]]))
        elif k == "qu":
            q = it[1]
            out.append(("Q", [(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)]))
        elif k == "re":
            r = it[1]
            out.append(("Q", [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]))
    return out


def seg_len(p, q):
    return math.hypot(q[0] - p[0], q[1] - p[1])


def classify(drawings, clip):
    """Split the drawing into layers. Returns dict layer -> list of (kind, pts, meta)."""
    X0, Y0, X1, Y1 = clip
    layers = defaultdict(list)

    def inside(r, pad=0.5):
        return r.x0 >= X0 - pad and r.x1 <= X1 + pad and r.y0 >= Y0 - pad and r.y1 <= Y1 + pad

    # dimension rows: thin single straight lines that line up on the same row/column
    rows = defaultdict(list)
    for i, x in enumerate(drawings):
        if x["type"] != "s" or round(x["width"], 2) != 0.43 or len(x["items"]) != 1 or x["items"][0][0] != "l":
            continue
        (a, b) = items_to_polys(x)[0][1]
        L = seg_len(a, b)
        if L < 18:
            continue
        if abs(a[1] - b[1]) < 0.05:
            rows[("h", round(a[1], 1))].append((i, min(a[0], b[0]), max(a[0], b[0])))
        elif abs(a[0] - b[0]) < 0.05:
            rows[("v", round(a[0], 1))].append((i, min(a[1], b[1]), max(a[1], b[1])))
    dim_ids = set()
    for key, segs in rows.items():
        span = max(s[2] for s in segs) - min(s[1] for s in segs)
        if len(segs) >= 3 and span > 250:
            dim_ids.update(s[0] for s in segs)
        elif any(s[2] - s[1] > 150 for s in segs):
            dim_ids.update(s[0] for s in segs if s[2] - s[1] > 150)

    for i, x in enumerate(drawings):
        r = x["rect"]
        if not inside(r):
            continue
        pieces = items_to_polys(x)
        if x["type"] == "f":
            f = x["fill"]
            if f[0] > 0.9 and f[1] < 0.2:
                layers["conc"].append(pieces)
            elif abs(f[0] - 0.6) < 0.05:
                layers["col"].append(pieces)
            continue
        w = round(x["width"], 2)
        m = max(r.width, r.height)
        if i in dim_ids:
            layers["_dim"].append(pieces)
            continue
        if w == 1.13:
            layers["wall"].append(pieces)
            continue
        # text: only straight strokes, every stroke short, glyph-height box
        straight = all(p[0] == "L" for p in pieces)
        hmax, smax = (10.2, 10.5) if w == 0.21 else (7.2, 7.5)
        if straight and r.height <= hmax and all(seg_len(*p[1]) <= smax for p in pieces) and r.width <= 70:
            layers["_text"].append(pieces)
            continue
        if m < 2.5:
            layers["_tiny"].append(pieces)
            continue
        if straight and m > 300:
            layers["_axis"].append(pieces)
            continue
        if w == 0.92:
            layers["thick"].append(pieces)
        elif w == 0.43:
            layers["fix"].append(pieces)
        else:
            layers["furn"].append(pieces)
    return layers
