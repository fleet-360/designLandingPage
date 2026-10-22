"""Extract the plumbing demo data (catalog/plumbing/data.json) from a real plumbing sheet.

Source (read-only, never copied into the repo): the plumbing plan of a commercial floor under a residential
building, 1:50, pipes hung in the acoustic ceiling. The PDF keeps the CAD layers (OCGs) and colours:

    1-PLUM12   dark red  single line   sewage (ביוב)     labels "Ø110-2%", "Ø160-1.5%"; stacks tagged ק-4"
    1-zmg      blue      double line   rain (מי גשם)     drawn to width (Ø110 = 10 cm, Ø315 = 32 cm)
    1-ZMG-ROOF light blue double line  roof down pipes (צ.מ.ג גג)
    1-nikuz    blue      double line   drainage (ניקוז)  labels Ø90 / Ø75 (the drawn width is not to scale here)
    1-WATER    blue      dash-dot      cold water        inch labels; galvanised steel SCH40 (sheet note 2)
    1-fire     orange    "F" linetype  hydrant / hose-reel network (צנרת ברזי כיבוי)   inch labels
    1-spr      magenta   "S" linetype  sprinkler mains   inch labels

Only processed vector data is written: pipe centre lines (cm), diameters and slopes read from the labels,
symbols (stacks, down pipes, risers, traps, hose reels, valves...) with their type and size as written next to
them, invert levels read from the level tags, a simplified architectural background and generic room names.
Every label below was read off the sheet by hand; the title block, notes and all names are dropped.

Usage:  python -I tools/demos/plumbing/extract.py <sheet.pdf>      (or set PLUMBING_SHEET)
        python -I tools/demos/plumbing/thumb.py
"""
import heapq
import json
import math
import os
import sys
from collections import defaultdict

import pymupdf as fitz

# the source sheet stays where it is; its path is passed in, not kept in this public repo
SRC = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else os.environ.get("PLUMBING_SHEET", "")
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "catalog", "plumbing", "data.json")

# crop window in displayed (rotated) page points; the sheet is 1:50
X0, X1, Y0, Y1 = 4120, 6100, 936, 2106
PAGE_H = 2551  # unrotated page width -> displayed Y = PAGE_H - x
PT_CM = 25.4 / 72 * 50 / 10  # 1 pt on paper at 1:50 = 1.7639 cm

# source layer + colour -> key. Colour is part of the key: one layer can carry two systems.
SOURCES = [
    # key, layer, rgb, kind
    ("SWG", "1-PLUM12", (0.58, 0.0, 0.0), "single"),
    ("ZMG", "1-zmg", (0.0, 0.43, 0.87), "double"),
    ("ROOF", "1-ZMG-ROOF", (0.43, 0.54, 0.87), "double"),
    ("NIK", "1-nikuz", (0.0, 0.43, 0.87), "double"),
    ("WTR", "1-WATER", (0.0, 0.0, 1.0), "single"),
    ("FIRE", "1-fire", (1.0, 0.25, 0.0), "single"),
    ("SPR", "1-spr", (1.0, 0.0, 1.0), "single"),
]
GRAVITY = {"SWG", "ZMG", "ROOF", "NIK"}


def disp(p):
    """unrotated page point -> displayed crop point (pt)"""
    return (p.y - X0, PAGE_H - p.x - Y0)


def near_rgb(c, rgb, tol=0.03):
    return c is not None and all(abs(a - b) <= tol for a, b in zip(c, rgb))


def load():
    if not SRC or not os.path.exists(SRC):
        sys.exit("pass the plumbing sheet PDF: extract.py <sheet.pdf>  (or set PLUMBING_SHEET)")
    doc = fitz.open(SRC)
    page = doc[0]
    out = []
    for p in page.get_drawings():
        r = p["rect"]
        dx0, dx1 = r.y0 - X0, r.y1 - X0
        dy0, dy1 = PAGE_H - r.x1 - Y0, PAGE_H - r.x0 - Y0
        if dx1 < -30 or dx0 > X1 - X0 + 30 or dy1 < -30 or dy0 > Y1 - Y0 + 30:
            continue
        out.append(p)
    return out


# ---------------------------------------------------------------- geometry helpers
def seg_len(s):
    return math.hypot(s[2] - s[0], s[3] - s[1])


def ang(s):
    return math.degrees(math.atan2(s[3] - s[1], s[2] - s[0])) % 180


def pt_seg_dist(px, py, s):
    ax, ay, bx, by = s
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(ax + t * dx - px, ay + t * dy - py), t


def merge_collinear(segs, ang_tol=0.8, off_tol=0.7, gap=32):
    """join collinear pieces (crossing breaks, dash-dot linetypes, linetype letters)"""
    segs = [s for s in segs if seg_len(s) > 0.3]
    used = [False] * len(segs)
    out = []
    order = sorted(range(len(segs)), key=lambda i: -seg_len(segs[i]))
    for i in order:
        if used[i]:
            continue
        used[i] = True
        s = segs[i]
        a = math.radians(ang(s))
        ux, uy = math.cos(a), math.sin(a)
        ox, oy = s[0], s[1]
        iv = [tuple(sorted(((s[0] - ox) * ux + (s[1] - oy) * uy, (s[2] - ox) * ux + (s[3] - oy) * uy)))]
        changed = True
        while changed:
            changed = False
            for j in range(len(segs)):
                if used[j]:
                    continue
                t = segs[j]
                da = abs(ang(t) - ang(s))
                da = min(da, 180 - da)
                if da > ang_tol:
                    continue
                o1 = abs(-(t[0] - ox) * uy + (t[1] - oy) * ux)
                o2 = abs(-(t[2] - ox) * uy + (t[3] - oy) * ux)
                if max(o1, o2) > off_tol:
                    continue
                a1 = (t[0] - ox) * ux + (t[1] - oy) * uy
                a2 = (t[2] - ox) * ux + (t[3] - oy) * uy
                lo, hi = min(a1, a2), max(a1, a2)
                lo0, hi0 = min(v[0] for v in iv), max(v[1] for v in iv)
                if lo > hi0 + gap or hi < lo0 - gap:
                    continue
                if not any(lo <= v[1] + gap and hi >= v[0] - gap for v in iv):
                    continue
                iv.append((lo, hi))
                used[j] = True
                changed = True
        iv.sort()
        merged = [list(iv[0])]
        for lo, hi in iv[1:]:
            if lo <= merged[-1][1] + gap:
                merged[-1][1] = max(merged[-1][1], hi)
            else:
                merged.append([lo, hi])
        for lo, hi in merged:
            out.append((ox + ux * lo, oy + uy * lo, ox + ux * hi, oy + uy * hi))
    return out


def build_graph(segs, snap=1.6):
    """split at T-junctions, snap endpoints, return nodes and edges"""
    ends = [(s[0], s[1]) for s in segs] + [(s[2], s[3]) for s in segs]
    split = []
    for s in segs:
        ts = [0.0, 1.0]
        L = seg_len(s)
        for (px, py) in ends:
            d, t = pt_seg_dist(px, py, s)
            if d < snap and t * L > snap and (1 - t) * L > snap:
                ts.append(t)
        ts = sorted(set(round(t, 6) for t in ts))
        for a, b in zip(ts, ts[1:]):
            if (b - a) * L < 0.2:
                continue
            split.append((s[0] + (s[2] - s[0]) * a, s[1] + (s[3] - s[1]) * a,
                          s[0] + (s[2] - s[0]) * b, s[1] + (s[3] - s[1]) * b))
    nodes = []

    def nid(x, y):
        for i, (nx, ny) in enumerate(nodes):
            if abs(nx - x) < snap and abs(ny - y) < snap:
                return i
        nodes.append((x, y))
        return len(nodes) - 1

    edges = []
    for s in split:
        a, b = nid(s[0], s[1]), nid(s[2], s[3])
        if a != b:
            edges.append((a, b))
    edges = list({tuple(sorted(e)) for e in edges})
    return nodes, edges


def components(nodes, edges):
    adj = defaultdict(list)
    for i, (a, b) in enumerate(edges):
        adj[a].append(i)
        adj[b].append(i)
    seen, comps = set(), []
    for i in range(len(edges)):
        if i in seen:
            continue
        stack, comp = [i], []
        seen.add(i)
        while stack:
            e = stack.pop()
            comp.append(e)
            for n in edges[e]:
                for f in adj[n]:
                    if f not in seen:
                        seen.add(f)
                        stack.append(f)
        comps.append(comp)
    return comps


def runs_from_graph(nodes, edges):
    """maximal polylines between junctions / ends"""
    adj = defaultdict(list)
    for i, (a, b) in enumerate(edges):
        adj[a].append(i)
        adj[b].append(i)
    used, runs = set(), []

    def walk(start, e):
        path, cur = [start], start
        while True:
            used.add(e)
            a, b = edges[e]
            nxt = b if a == cur else a
            path.append(nxt)
            cur = nxt
            if len(adj[cur]) != 2:
                break
            e2 = [f for f in adj[cur] if f != e][0]
            if e2 in used:
                break
            e = e2
        return path

    for n in range(len(nodes)):
        if len(adj[n]) != 2:
            for e in adj[n]:
                if e not in used:
                    runs.append(walk(n, e))
    for e in range(len(edges)):  # pure cycles
        if e not in used:
            runs.append(walk(edges[e][0], e))
    return runs, adj


# ---------------------------------------------------------------- crop clipping
W_PT, H_PT = X1 - X0, Y1 - Y0


def clip_seg(s):
    """Liang-Barsky clip of a segment to the crop window"""
    x0, y0, x1, y1 = s
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, x0), (dx, W_PT - x0), (-dy, y0), (dy, H_PT - y0)):
        if p == 0:
            if q < 0:
                return None
            continue
        t = q / p
        if p < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
    if t0 > t1:
        return None
    return (x0 + dx * t0, y0 + dy * t0, x0 + dx * t1, y0 + dy * t1)


def clip_poly(pts):
    out, cur = [], []
    for a, b in zip(pts, pts[1:]):
        c = clip_seg((a[0], a[1], b[0], b[1]))
        if c is None:
            if cur:
                out.append(cur)
                cur = []
            continue
        p, q = (c[0], c[1]), (c[2], c[3])
        if cur and math.dist(cur[-1], p) < 0.01:
            cur.append(q)
        else:
            if cur:
                out.append(cur)
            cur = [p, q]
    if cur:
        out.append(cur)
    return [c for c in out if poly_len(c) > 1]


def poly_len(pl):
    return sum(math.dist(a, b) for a, b in zip(pl, pl[1:]))


def simplify(pl, tol=0.4):
    """drop collinear middle vertices"""
    if len(pl) < 3:
        return pl
    out = [pl[0]]
    for i in range(1, len(pl) - 1):
        a, b, c = out[-1], pl[i], pl[i + 1]
        d, _ = pt_seg_dist(b[0], b[1], (a[0], a[1], c[0], c[1]))
        if d > tol:
            out.append(b)
    out.append(pl[-1])
    return out


def on_edge(p, tol=4):
    return min(p[0], p[1], W_PT - p[0], H_PT - p[1]) < tol


# ---------------------------------------------------------------- single-line pipes
def single_runs(draws, layer, rgb, gap):
    segs = []
    for p in draws:
        if p.get("layer") != layer or not near_rgb(p.get("color"), rgb):
            continue
        for it in p["items"]:
            if it[0] == "l":
                a, b = disp(it[1]), disp(it[2])
                segs.append((a[0], a[1], b[0], b[1]))
    # hatched symbols (inlets, hose cabinets): many short strokes packed together
    short = [s for s in segs if seg_len(s) < 12]
    mids = [((s[0] + s[2]) / 2, (s[1] + s[3]) / 2) for s in short]
    dense = {short[i] for i, m in enumerate(mids) if sum(1 for n in mids if math.dist(m, n) < 12) >= 6}
    segs = [s for s in segs if s not in dense]
    m = merge_collinear(segs, gap=gap)
    m = [c for c in (clip_seg(s) for s in m) if c and seg_len(c) > 0.3]
    nodes, edges = build_graph(m)
    keep = set()
    for c in components(nodes, edges):
        xs = [nodes[n][0] for e in c for n in edges[e]]
        ys = [nodes[n][1] for e in c for n in edges[e]]
        L = sum(math.dist(nodes[edges[e][0]], nodes[edges[e][1]]) for e in c)
        bb = max(max(xs) - min(xs), max(ys) - min(ys))
        # linetype letters (F, S) and symbol scraps
        if bb < 25 or L < 25 or (len(c) >= 4 and bb < 45 and L > 1.6 * bb):
            continue
        keep.update(c)
    edges = [edges[i] for i in sorted(keep)]
    runs, _ = runs_from_graph(nodes, edges)
    return [simplify([nodes[i] for i in r]) for r in runs]


# ---------------------------------------------------------------- double-line pipes
def _polyline(p):
    pts = []
    for it in p["items"]:
        if it[0] != "l":
            return None
        a, b = disp(it[1]), disp(it[2])
        if not pts:
            pts = [a, b]
        elif math.dist(pts[-1], a) > 0.5:
            return None
        else:
            pts.append(b)
    return pts


def _segs(pl):
    return [(pl[i][0], pl[i][1], pl[i + 1][0], pl[i + 1][1]) for i in range(len(pl) - 1)]


def _offset(s, t):
    da = abs(ang(s) - ang(t))
    da = min(da, 180 - da)
    if da > 2.5:
        return None
    a = math.radians(ang(s))
    ux, uy = math.cos(a), math.sin(a)
    mx, my = (t[0] + t[2]) / 2, (t[1] + t[3]) / 2
    return abs(-(mx - s[0]) * uy + (my - s[1]) * ux)


def double_runs(draws, layer, rgb):
    """pair the two sides of a pipe drawn to scale; return [(centre line, width pt)]"""
    paths = sorted((p for p in draws if p.get("layer") == layer and near_rgb(p.get("color"), rgb)), key=lambda p: p["seqno"])
    pls = [_polyline(p) for p in paths]
    used, out = set(), []
    for i, pl in enumerate(pls):
        if i in used or pl is None:
            continue
        best = None
        for j in range(max(0, i - 4), min(len(pls), i + 5)):
            q = pls[j]
            if j == i or j in used or q is None or len(q) != len(pl):
                continue
            for cand in (q, q[::-1]):
                offs = [_offset(a, b) for a, b in zip(_segs(pl), _segs(cand))]
                if any(o is None for o in offs):
                    continue
                o = sorted(offs)[len(offs) // 2]
                if not 3 <= o <= 20 or any(abs(x - o) > 2 for x in offs):
                    continue
                d = math.dist(pl[0], cand[0])
                if best is None or d < best[0]:
                    best = (d, j, cand, o)
        if best:
            used.update((i, best[1]))
            cl = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in zip(pl, best[2])]
            for c in clip_poly(cl):
                out.append((c, best[3]))
        # an unpaired stroke on a double-line layer is the reference line inside a pipe: skipped
    return out


# ---------------------------------------------------------------- diameters and slopes
INCH = {"1/2\"": 0.5, "3/4\"": 0.75, "1\"": 1, "1.5\"": 1.5, "2\"": 2, "2.5\"": 2.5, "3\"": 3, "4\"": 4, "6\"": 6}


def width_to_dia(w_pt):
    """double-line width as drawn on the rain layers (centre to centre of the two strokes) -> nominal size.
    The sheet draws Ø110 10 cm wide, Ø160 15, Ø250 25, Ø315 32."""
    cm = w_pt * PT_CM
    for lim, d in ((12.5, "Ø110"), (20, "Ø160"), (28, "Ø250"), (40, "Ø315")):
        if cm <= lim:
            return d
    return "Ø315"


# label anchors read from the sheet: (x pt, y pt, diameter, slope %). An anchor sits on the run its label names.
ANCHORS = {
    "SWG": [(210, 634, "Ø160", 2.0), (460, 634, "Ø160", 2.0),            # west collector "Ø160-2%"
            (600, 634, "Ø160", 1.5), (968, 634, "Ø160", 1.5), (1705, 634, "Ø160", 1.5),   # east "Ø160-1.5%"
            (1413, 480, "Ø160", 1.5)],                                    # from the 6" stack "Ø160-1.5%"
    "NIK": [(200, 98, "Ø90", 2.0), (1124, 99, "Ø90", 2.0),                # "Ø90-2%", "ניקוז 3""
            (671, 600, "Ø75", 2.0), (671, 900, "Ø75", 2.0), (1950, 649, "Ø75", 2.0)],   # "Ø75-2%"
    "WTR": [(749, 350, "1\"", None), (1421, 480, "1\"", None),            # "מ"ק 1"", "מ"ק 1" מחניון"
            (1095, 800, "3/4\"", None), (1250, 651, "3/4\"", None), (1424, 655, "1/2\"", None)],
    "FIRE": [(757, 400, "3\"", None), (830, 245, "3\"", None), (840, 575, "3\"", None),   # stair riser 3"
             (757, 800, "3/4\"", None), (700, 895, "3/4\"", None),        # "3/4"" to the wash tap
             (200, 144, "2\"", None), (1120, 109, "1\"", None), (1950, 451, "2\"", None),
             (478, 1150, "4\"", None),                                    # hydrant 4"x3"x3"
             (486, 1155, "3\"", None), (510, 1137, "3\"", None)],         # fire brigade inlets 3"
    "SPR": [(330, 300, "4\"", None), (600, 579, "4\"", None), (1100, 400, "4\"", None), (1262, 159, "4\"", None),
            (200, 153, "4\"", None), (1134, 153, "4\"", None),             # "4" למע' ספרינקלרים עולה"
            (530, 1142, "3\"", None)],                                    # inlet 3"x2.5"x2.5"
}
# labels on the rain layer: not used to size the pipe (the width does that) but to check the width against them
ZMG_LABELS = [(300, 613, "Ø160"), (622, 613, "Ø315"), (872, 613, "Ø315"), (1123, 613, "Ø315"), (1635, 613, "Ø250"),
              (643, 752, "Ø160"), (123, 857, "Ø110"), (94, 530, "Ø110"), (202, 560, "Ø110"), (243, 1000, "Ø110"),
              (306, 1000, "Ø110"), (433, 960, "Ø110"), (1102, 900, "Ø110"), (1369, 760, "Ø110"), (1517, 760, "Ø110"),
              (1517, 520, "Ø110"), (1428, 480, "Ø160")]
DEFAULT_DIA = {"SWG": "Ø110", "ZMG": "Ø110", "ROOF": "Ø110", "NIK": "Ø75", "WTR": "1\"", "FIRE": "2\"", "SPR": "4\""}


def run_dist(x, y, pts):
    return min(pt_seg_dist(x, y, (a[0], a[1], b[0], b[1]))[0] for a, b in zip(pts, pts[1:]))


def along(x, y, pts):
    """distance along a polyline of the projection of (x, y)"""
    best, acc = None, 0.0
    for a, b in zip(pts, pts[1:]):
        d, t = pt_seg_dist(x, y, (a[0], a[1], b[0], b[1]))
        L = math.dist(a, b)
        if best is None or d < best[0]:
            best = (d, acc + t * L)
        acc += L
    return best[1]


def cut_at(pts, s):
    """split a polyline at distance s along it"""
    acc = 0.0
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        L = math.dist(a, b)
        if acc + L >= s:
            t = (s - acc) / L if L else 0
            p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            return pts[: i + 1] + [p], [p] + pts[i + 1:]
        acc += L
    return pts, None


def split_at_points(runs, cuts):
    """cut runs that pass through a point (a drop where two collectors meet)"""
    out = []
    for r in runs:
        pieces = [r["pts"]]
        for (x, y) in cuts:
            nxt = []
            for p in pieces:
                if run_dist(x, y, p) < 4:
                    s = along(x, y, p)
                    if 3 < s < poly_len(p) - 3:
                        a, b = cut_at(p, s)
                        nxt += [a, b]
                        continue
                nxt.append(p)
            pieces = nxt
        out += [dict(r, pts=p) for p in pieces]
    return out


def split_at_labels(runs, anchors):
    """a run carrying two labels of different size changes diameter at the vertex between them"""
    out = []
    for r in runs:
        hits = sorted((along(ax, ay, r["pts"]), d) for ax, ay, d, _ in anchors if run_dist(ax, ay, r["pts"]) < 12)
        pieces = [r["pts"]]
        for (s0, d0), (s1, d1) in zip(hits, hits[1:]):
            if d0 == d1:
                continue
            cur = pieces.pop()
            base = poly_len(r["pts"]) - poly_len(cur)
            mid = (s0 + s1) / 2 - base
            acc, k = 0.0, None
            for i in range(1, len(cur) - 1):
                acc += math.dist(cur[i - 1], cur[i])
                if k is None or abs(acc - mid) < abs(k[1] - mid):
                    k = (i, acc)
            if k is None:
                pieces.append(cur)
                continue
            pieces += [cur[: k[0] + 1], cur[k[0]:]]
        out += [dict(r, pts=p) for p in pieces]
    return out


def ends_of(r):
    p = r["pts"]
    return [(p[0], p[1]), (p[-1], p[-2])]


def touching(runs, r):
    """runs sharing an end node with r"""
    out = []
    for (e, _) in ends_of(r):
        for o in runs:
            if o is r:
                continue
            if any(math.dist(e, oe) <= 2 for oe, _ in ends_of(o)):
                out.append(o)
    return out


def assign_diameters(key, runs, points, cuts=()):
    """runs: list of dict(pts, d, src, sl). Label anchors first, then straight continuation, then rules.
    No continuation through a drop (cuts): the two collectors that meet there are sized on their own."""
    for (ax, ay, d, sl) in ANCHORS.get(key, []):
        best = min(runs, key=lambda r: run_dist(ax, ay, r["pts"]), default=None)
        if best and run_dist(ax, ay, best["pts"]) < 12:
            best["d"], best["src"], best["sl"] = d, "label", sl
    if key in ("ZMG", "ROOF"):  # sized by width; slopes as labelled on this layer
        for r in runs:
            r["sl"] = 2.0 if r["d"] == "Ø110" else 1.5

    changed = True
    while changed:  # straight continuation through a node keeps the size
        changed = False
        for r in runs:
            if r["d"] is not None:
                continue
            for (e, nb) in ends_of(r):
                for o in runs:
                    if o is r or o["d"] is None or o["src"] == "default":
                        continue
                    for (oe, onb) in ends_of(o):
                        if math.dist(e, oe) > 2 or any(math.dist(e, c) < 4 for c in cuts):
                            continue
                        a1 = math.atan2(nb[1] - e[1], nb[0] - e[0])
                        a2 = math.atan2(onb[1] - oe[1], onb[0] - oe[0])
                        if abs((math.degrees(a1 - a2) + 180) % 360 - 180) > 150:
                            r["d"], r["src"], r["sl"] = o["d"], "net", o.get("sl")
                            changed = True
                            break
                    if r["d"]:
                        break
                if r["d"]:
                    break

    def at_point(r, kinds):
        return any(math.dist(e, (q["x"], q["y"])) < 9 for e, _ in ends_of(r) for q in points if q["k"] in kinds)

    if key == "SWG":
        # a branch that collects only 4" stacks (ק-4" · Ø110 on every tag) is Ø110, sloped 2% as labelled
        seed = [r for r in runs if r["d"] is None and at_point(r, {"st4"})]
        for r in seed:
            r["d"], r["src"], r["sl"] = "Ø110", "tag", 2.0
        while seed:
            nxt = []
            for r in seed:
                for o in touching(runs, r):
                    if o["d"] is None:
                        o["d"], o["src"], o["sl"] = "Ø110", "tag", 2.0
                        nxt.append(o)
            seed = nxt
        # links from a refuse-room trap (8"x4") and from a WC to their drop are the 4" outlet: Ø110
        for r in runs:
            if r["d"] is None and at_point(r, {"trap8", "wc", "wcd"}):
                r["d"], r["src"], r["sl"] = "Ø110", "fix", None
    if key == "NIK":
        # the short link from a 4"x2" floor trap to the down pipe is the trap's 2" outlet
        for r in runs:
            short = poly_len(r["pts"]) * PT_CM / 100 < 0.5
            if r["d"] is None and (at_point(r, {"trap2"}) or (short and at_point(r, {"ndrop4"}))):
                r["d"], r["src"], r["sl"] = "Ø50", "trap", None
    for r in runs:
        if r["d"] is None:
            r["d"], r["src"] = DEFAULT_DIA[key], "default"
        r.setdefault("sl", None)


def dia_key(d):
    if d.startswith("Ø"):
        return int(d[1:])
    return INCH.get(d, 0) * 25.4


# ---------------------------------------------------------------- points (symbols, read off the sheet)
# (source key, kind, x, y, size). Kinds are explained in the demo (PK). Positions snap to the symbol circle.
POINTS = [
    # sewage: 4" stacks from the flats (hexagon tag "ק-4"" / Ø110) and from the toilets of the floor above
    *[("SWG", "st4", x, y, "4\"") for x, y in [
        (256, 481), (291, 571), (316, 571), (187, 656), (318, 683), (320, 718), (197, 770), (31, 1093), (35, 357),
        (722, 689), (742, 689), (715, 794), (749, 795), (1117, 571), (1172, 571), (1208, 481), (1144, 683),
        (1144, 718), (1136, 357), (1276, 657), (1266, 770), (1432, 1094)]],
    ("SWG", "st6", 1413, 357, "6\""), ("SWG", "st6", 1910, 634, "6\""),
    ("SWG", "spass", 517, 122, "6\""),                                     # 6" stack passing through, no branch here
    ("SWG", "sdrop", 542, 634, "6\""),                                     # "צ.ביוב 6" יורד": both collectors drop
    *[("SWG", "wcd", x, y, "4\"") for x, y in [(79, 1094), (1455, 432), (1972, 548)]],  # WCs of this floor, "יורד 4""
    *[("SWG", "wc", x, y, "4\"") for x, y in [(60, 1094), (108, 1094), (1488, 431), (1950, 531)]],  # the WCs
    *[("SWG", "trap8", x, y, "8\"x4\"") for x, y in [(1410, 678), (1084, 746), (468, 985)]],  # refuse rooms
    *[("SWG", "sdown4", x, y, "4\"") for x, y in [(1410, 711), (1065, 746), (468, 952)]],     # their 4" drop
    # rain
    *[("ZMG", "rd", x, y, "4\"") for x, y in [
        (95, 495), (94, 857), (243, 1054), (306, 1100), (433, 1049), (1088, 1102), (1369, 495), (1369, 857),
        (1516, 463), (1516, 896)]],
    *[("ROOF", "rd", x, y, "4\"") for x, y in [(184, 520), (1279, 518), (1083, 1049), (1260, 1049)]],
    ("ZMG", "rd", 643, 1103, "5\""), ("ZMG", "rd", 1428, 357, "6\""), ("ZMG", "rd", 1910, 613, "10\""),
    ("ZMG", "rpass", 517, 103, "8\""),
    ("ZMG", "rdrop", 543, 613, "12\""),                                    # "צ.מ.ג 12" יורד"
    # drainage
    *[("NIK", "ndrop", x, y, "3\"") for x, y in [(401, 88), (1110, 99), (1431, 98), (1452, 98)]],
    *[("NIK", "nin", x, y, "3\"") for x, y in [(30, 108), (1127, 99)]],  # "ניקוז 3" ממסחר בקומת כניסה"
    *[("ZMG", "nin75", x, y, "Ø75") for x, y in [(185, 511), (1279, 527)]],  # Ø75 drains joining the rain lines
    *[("NIK", "gas", x, y, "Ø75") for x, y in [(638, 204), (1910, 656)]],  # "צנור ניקוז Ø75 ממוני גז"
    *[("NIK", "trap2", x, y, "4\"x2\"") for x, y in [(396, 112), (1109, 124), (1429, 122), (1454, 122), (781, 558)]],
    ("NIK", "ndrop4", 773, 543, "4\""),
    ("NIK", "out", 641, 1094, "Ø75"),                                       # "נשפך חופשי מעל קרקע"
    # cold water
    ("WTR", "wr", 791, 543, "2\""), ("WTR", "wr", 820, 162, "1\""), ("WTR", "wr", 1358, 307, "1\""),
    ("WTR", "wr", 924, 543, "3\""),
    ("WTR", "meter", 807, 543, ""), ("WTR", "bfp", 1405, 310, "1\""), ("WTR", "prv", 517, 1085, "3/4\""),
    *[("WTR", "tap", x, y, "1/2\"") for x, y in [(1424, 658), (1031, 951), (478, 1090)]],
    *[("WTR", "boiler", x, y, "30 ל׳") for x, y in [(1550, 385), (1968, 400), (60, 990)]],
    # hydrants and hose reels
    ("FIRE", "hyd2", 918, 256, "2\""),
    *[("FIRE", "cab", x, y, "") for x, y in [(820, 552), (1912, 425), (1790, 1080), (6, 1080)]],
    *[("FIRE", "reel", x, y, "1\"") for x, y in [(409, 125), (1112, 138), (1427, 138), (1453, 138)]],
    ("FIRE", "fr", 913, 245, "3\""), ("FIRE", "fr", 922, 245, "2\""), ("FIRE", "fr", 408, 89, "2\""),
    ("FIRE", "fr", 1104, 99, "2\""), ("FIRE", "fr", 1425, 98, "1\""), ("FIRE", "fr", 1460, 98, "1\""),
    ("FIRE", "fr", 31, 152, "1\""), ("FIRE", "fr", 1141, 100, "1\""), ("FIRE", "fr", 1793, 1050, "2\""),
    ("FIRE", "fr", 1912, 451, "2\""), ("FIRE", "fr", 782, 543, "2\""), ("FIRE", "fr", 913, 544, "3\""),
    ("FIRE", "bfp3", 885, 544, "3\""),
    ("FIRE", "hydx", 477, 1114, "4\"x3\"x3\""),
    ("FIRE", "fdc", 504, 1115, "3\""), ("FIRE", "fdc", 528, 1115, "3\""),
    # sprinklers
    ("SPR", "sfeed", 924, 556, "4\""),
    *[("SPR", "zone", x, y, "") for x, y in [(905, 556), (392, 163), (1101, 140), (1423, 140), (1465, 140)]],
    ("SPR", "sup", 37, 153, "4\""), ("SPR", "sup", 1134, 146, "4\""),
    ("SPR", "sfdc", 566, 1115, "3\"x2.5\"x2.5\""),
]
# a pipe end on one of these symbols turns vertical there (stack foot, drop, riser): one bend / elbow
VERTICAL = {"st4", "st6", "sdrop", "wcd", "sdown4", "rd", "rdrop", "ndrop", "nin", "nin75", "gas", "ndrop4", "wr",
            "fr", "sfeed", "sup"}


def circles(draws):
    """centres of the small circles drawn on the pipe and symbol layers"""
    out = []
    for p in draws:
        its = p["items"]
        if len(its) != 4 or any(i[0] != "c" for i in its):
            continue
        pts = [disp(i[1]) for i in its]
        xs, ys = [a for a, b in pts], [b for a, b in pts]
        r = (max(xs) - min(xs)) / 2
        if 1.8 <= r <= 5.5:
            out.append(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2))
    return out


def points(draws):
    circ = circles(draws)
    out = []
    for key, kind, x, y, d in POINTS:
        c = min(circ, key=lambda c: math.dist(c, (x, y)))
        if math.dist(c, (x, y)) < 5:
            x, y = c
        out.append({"s": key, "k": kind, "x": x, "y": y, "d": d})
    return out


# ---------------------------------------------------------------- fittings
def turn(a, b, c):
    """direction change at b in degrees (0 = straight)"""
    a1 = math.atan2(b[1] - a[1], b[0] - a[0])
    a2 = math.atan2(c[1] - b[1], c[0] - b[0])
    return abs((math.degrees(a2 - a1) + 180) % 360 - 180)


EQUIP_R = 22  # pt (39 cm): a pipe end this close to a drawn valve, trap, tap or cabinet connects to it


def fittings(runs, idx, grav, pts):
    """one network (the sources of one system). Bends inside runs; at nodes: wye / tee, reducer, bend;
    a pipe end on a stack, down pipe or riser turns vertical there (one bend, plus the branch when two pipes meet
    at it); open ends: cleanout plug on gravity lines, cap on pressure lines."""
    keys = {r["s"] for r in runs}
    out = []
    for i, r in enumerate(runs):
        p = r["pts"]
        for k in range(1, len(p) - 1):
            t = turn(p[k - 1], p[k], p[k + 1])
            if t >= 20:
                out.append({"t": "b45" if t < 60 else "b90", "x": p[k][0], "y": p[k][1], "r": idx[i]})
    ends = []
    for i, r in enumerate(runs):
        p = r["pts"]
        ends.append((i, 0, p[0], p[1]))
        ends.append((i, 1, p[-1], p[-2]))
    tol_of = lambda i: runs[i].get("w", 0) / 2 + 2.5
    groups, seen = [], set()
    for a in range(len(ends)):
        if a in seen:
            continue
        g = [a]
        seen.add(a)
        for b in range(a + 1, len(ends)):
            if b not in seen and math.dist(ends[a][2], ends[b][2]) <= max(tol_of(ends[a][0]), tol_of(ends[b][0]), 2):
                g.append(b)
                seen.add(b)
        groups.append(g)
    for g in groups:
        i0, _, pt, nb = ends[g[0]]
        host = None
        for j, r in enumerate(runs):
            if any(ends[k][0] == j for k in g):
                continue
            d = run_dist(pt[0], pt[1], r["pts"])
            if d <= r.get("w", 0) / 2 + 2.5 and min(math.dist(pt, r["pts"][0]), math.dist(pt, r["pts"][-1])) > 3:
                host = j
                break
        deg = len(g) + (2 if host is not None else 0)
        members = [ends[k][0] for k in g] + ([host] if host is not None else [])
        main = max(members, key=lambda m: (dia_key(runs[m]["d"]), poly_len(runs[m]["pts"])))
        small = min(members, key=lambda m: (dia_key(runs[m]["d"]), poly_len(runs[m]["pts"])))
        vert = any(q["s"] in keys and q["k"] in VERTICAL and math.dist(pt, (q["x"], q["y"])) < 9 for q in pts)

        def f(t, r, b=None):
            item = {"t": t, "x": pt[0], "y": pt[1], "r": idx[r]}
            if b is not None:
                item["b"] = idx[b]
            out.append(item)

        if deg == 1:
            if vert:
                f("base", i0)
            elif any(q["k"] not in VERTICAL and math.dist(pt, (q["x"], q["y"])) < EQUIP_R for q in pts) or on_edge(pt):
                pass  # connects to a valve, trap, tap or cabinet, or runs on beyond the sheet
            else:
                f("end", i0)
        elif deg == 2 and vert:
            f("base", main)
            f("y" if grav else "tee", main, small)
        elif deg == 2:
            t = turn(nb, pt, ends[g[1]][3]) if len(g) == 2 else 0
            if t >= 20:
                f("b45" if t < 60 else "b90", main)
            if dia_key(runs[small]["d"]) < dia_key(runs[main]["d"]):
                f("red", main, small)
        else:
            mp = runs[main]["pts"]
            seg = min(zip(mp, mp[1:]), key=lambda s: pt_seg_dist(pt[0], pt[1], (s[0][0], s[0][1], s[1][0], s[1][1]))[0])
            am = math.degrees(math.atan2(seg[1][1] - seg[0][1], seg[1][0] - seg[0][0])) % 180
            da = 0
            for k in g:
                e = ends[k]
                if e[0] == main:
                    continue
                ab = math.degrees(math.atan2(e[3][1] - e[2][1], e[3][0] - e[2][0])) % 180
                d = abs(am - ab)
                da = max(da, min(d, 180 - d))
            # gravity lines branch with 45 degree wyes; pressure lines (steel) with tees only
            f("y" if grav and da < 65 else "tee", main, small)
            if vert:  # a riser feeding the tee
                f("base", main)
    return out


# ---------------------------------------------------------------- invert levels and slope checks
# level tags (מ' below the floor above) read off the sheet, placed on the pipe they point to
SLOPE_CHECKS = [
    # source, upstream (x, y, level), downstream (x, y, level), what
    ("SWG", (85, 634, -1.35), (186, 634, -1.38), "קו ביוב ראשי, מערב"),
    ("SWG", (186, 634, -1.38), (530, 634, -1.47), "קו ביוב ראשי, מערב"),
    ("SWG", (1927, 634, -1.10), (1414, 634, -1.24), "קו ביוב ראשי, מזרח"),
    ("SWG", (1414, 634, -1.24), (680, 634, -1.44), "קו ביוב ראשי, מזרח"),
    ("SWG", (680, 634, -1.44), (556, 634, -1.47), "קו ביוב ראשי, מזרח"),
    ("SWG", (1432, 1094, -1.00), (1280, 634, -1.18), "הסתעפות מקולטן ק-4\""),
    ("SWG", (1413, 366, -1.05), (1401, 634, -1.12), "קו מקולטן 6\""),
    ("ZMG", (1895, 613, -1.00), (1465, 613, -1.14), "קו מי גשם ראשי, מזרח"),
    ("ZMG", (681, 613, -1.61), (556, 613, -1.65), "קו מי גשם ראשי, לפני הירידה"),
]


def net_path(rs, a, b):
    """shortest path along the runs between two points: (length pt, run indexes)"""
    nodes = []

    def node(p):
        for i, q in enumerate(nodes):
            if math.dist(p, q) < 2.5:
                return i
        nodes.append(p)
        return len(nodes) - 1

    adj = defaultdict(list)
    for i, r in enumerate(rs):
        p = r["pts"]
        u, v, L = node(p[0]), node(p[-1]), poly_len(p)
        adj[u].append((v, L, i))
        adj[v].append((u, L, i))

    def attach(q):
        i = min(range(len(rs)), key=lambda i: run_dist(q[0], q[1], rs[i]["pts"]))
        p = rs[i]["pts"]
        s, L = along(q[0], q[1], p), poly_len(p)
        n = len(nodes)
        nodes.append(q)
        u, v = node(p[0]), node(p[-1])
        for m, w in ((u, s), (v, L - s)):
            adj[n].append((m, w, i))
            adj[m].append((n, w, i))
        return n, i, s

    na, ia, sa = attach(a)
    nb, ib, sb = attach(b)
    if ia == ib:
        return abs(sa - sb), [ia]
    dist, prev = {na: 0}, {}
    heap = [(0, na)]
    while heap:
        d, n = heapq.heappop(heap)
        if n == nb:
            break
        if d > dist.get(n, 1e18):
            continue
        for m, w, i in adj[n]:
            if d + w < dist.get(m, 1e18):
                dist[m], prev[m] = d + w, (n, i)
                heapq.heappush(heap, (d + w, m))
    path, n = [], nb
    while n != na:
        n, i = prev[n]
        path.append(i)
    return dist[nb], sorted(set(path))


# ---------------------------------------------------------------- architectural background
# architectural xref layers, matched by the part after "xref|" (the xref name is a project file name)
BG = {
    "wallfill": ["K-MILUIBETON zomeach"],
    "wall": ["KIROT"],
    "arch": ["PETACH", "A_Door_p", "YS_Doors&Cabin", "STAIR", "k-stairs", "MAAKE", "aluminium", "SANIT", "SAN1",
             "wall-in", "masgrut-1", "1022-GAL-BASE$0$petach", "MABAT"],
    "axis": ["ZIR"],
}


def cm(v):
    return int(round(v * PT_CM))


def background(draws):
    lay2cls = {l: c for c, ls in BG.items() for l in ls}
    polys, lines = defaultdict(list), defaultdict(list)
    for p in draws:
        layer = p.get("layer") or ""
        name = layer.split("|", 1)[1] if "|" in layer else (layer if layer == "k-stairs" else None)
        cls = lay2cls.get(name)
        if not cls:
            continue
        if cls == "wallfill":
            if p.get("fill") is None:
                continue
            ring = []
            for it in p["items"]:
                if it[0] == "l":
                    ring += [disp(it[1]), disp(it[2])]
                elif it[0] == "re":
                    r = it[1]
                    ring += [disp(r.tl), disp(r.tr), disp(r.br), disp(r.bl)]
                elif it[0] == "qu":
                    q = it[1]
                    ring += [disp(q.ul), disp(q.ur), disp(q.lr), disp(q.ll)]
            if len(ring) >= 3:
                polys[cls].append(ring)
            continue
        for it in p["items"]:
            if it[0] == "l":
                seg = (*disp(it[1]), *disp(it[2]))
            elif it[0] == "c":
                seg = (*disp(it[1]), *disp(it[4]))
            else:
                continue
            if cls == "axis":
                lines[cls].append(seg)
                continue
            c = clip_seg(seg)
            if c and seg_len(c) > 0.5:
                lines[cls].append(c)
    out = {}
    d = []
    for ring in polys["wallfill"]:
        xs, ys = [a for a, b in ring], [b for a, b in ring]
        if max(xs) < 0 or min(xs) > W_PT or max(ys) < 0 or min(ys) > H_PT:
            continue
        pts = []
        for x, y in ring:
            q = (cm(min(max(x, 0), W_PT)), cm(min(max(y, 0), H_PT)))
            if not pts or q != pts[-1]:
                pts.append(q)
        if len(pts) >= 3:
            d.append("M" + " ".join(f"{x} {y}" for x, y in pts) + "Z")
    out["wallfill"] = "".join(d)
    lines["axis"] = [c for c in (clip_seg(a) for a in merge_collinear(lines["axis"], gap=40)) if c and seg_len(c) > 300]
    for cls, segs in lines.items():
        parts, cur = [], []
        for s in segs:
            a, b = (cm(s[0]), cm(s[1])), (cm(s[2]), cm(s[3]))
            if a == b:
                continue
            if cur and cur[-1] == a:
                cur.append(b)
            else:
                if cur:
                    parts.append(cur)
                cur = [a, b]
        if cur:
            parts.append(cur)
        out[cls] = "".join("M" + " ".join(f"{x} {y}" for x, y in p) for p in parts)
    return out


def door_dimension(draws):
    """a written dimension used to confirm the scale: the 255 cm double door on the north facade"""
    xs = []
    for p in draws:
        if not (p.get("layer") or "").endswith("|50dim"):
            continue
        for it in p["items"]:
            if it[0] == "l":
                a, b = disp(it[1]), disp(it[2])
                if abs(a[0] - b[0]) < 0.2 and 25 < abs(a[1] - b[1]) < 30 and 930 < a[0] < 1110 and 30 < min(a[1], b[1]) < 50:
                    xs.append(a[0])
    xs = sorted(set(round(x, 1) for x in xs))
    return {"txt": 255, "cm": round((xs[-1] - xs[0]) * PT_CM, 1)} if len(xs) >= 2 else None


# ---------------------------------------------------------------- rooms (generic names, written by hand)
ROOMS = [
    # name, area as written (m²) or None, rectangles (x, y, w, h) in crop pt, label position
    ("מסחר 15", 119.8, [(20, 100, 320, 710), (340, 100, 195, 75), (340, 580, 195, 230)], (180, 660)),
    ("ממ\"ד", 10.7, [(345, 180, 185, 395)], (440, 470)),
    ("מבואה קומתית", None, [(540, 95, 235, 445), (540, 540, 395, 50)], (660, 300)),
    ("חדר מדרגות", None, [(775, 240, 160, 300)], (855, 360)),
    ("מחסנים", 66.78, [(665, 590, 270, 510), (540, 590, 125, 222)], (760, 760)),
    ("חדר אשפה דיירים", 33.7, [(225, 812, 440, 288)], (440, 900)),
    ("מסחר 14", 28.8, [(945, 95, 175, 475)], (1032, 330)),
    ("מסחר 13", 22.12, [(1140, 95, 310, 205)], (1295, 215)),
    ("מסחר 12", 40.16, [(1450, 95, 355, 350)], (1640, 260)),
    ("חדר דחסנית", None, [(1140, 305, 310, 415)], (1300, 470)),  # its "14" is the compactor volume (מ"ק), not an area
    ("חדר אשפה מסחר", 25.5, [(945, 580, 175, 400)], (1032, 860)),
    ("אזור פינוי אשפה", 180.2, [(1120, 720, 340, 380)], (1290, 900)),
    ("חניית משאית", None, [(1460, 450, 350, 650)], (1640, 1000)),
]


# ---------------------------------------------------------------- layer inventory (what PLUMBINVENTORY lists)
EXTRA_LAYERS = [
    ("KULTAN", "1-KULTAN", (0.0, 0.0, 0.0), "symbols"),  # stack tags and their leaders
    ("SPFL", "1-SP-Floor", (1.0, 0.0, 1.0), "symbols"),  # sprinkler riser symbols
]


def inventory(draws, layer):
    """entities on the layer inside the window and the raw length of every curve on it (text strokes included)"""
    n, raw = 0, 0.0
    for p in draws:
        if p.get("layer") != layer:
            continue
        r = p["rect"]
        cx, cy = (r.y0 + r.y1) / 2 - X0, PAGE_H - (r.x0 + r.x1) / 2 - Y0
        if not (0 <= cx <= W_PT and 0 <= cy <= H_PT):
            continue
        n += 1
        for i in p["items"]:
            if i[0] == "l":
                raw += seg_len((*disp(i[1]), *disp(i[2])))
            elif i[0] == "c":
                raw += math.dist(disp(i[1]), disp(i[4]))
    return n, round(raw * PT_CM / 100, 1)


def drop_scraps(rs, key):
    """pieces that belong to a symbol, not to the pipe: valve bodies on the sprinkler layer, crop-edge stubs"""
    out = []
    for r in rs:
        L = poly_len(r["pts"]) * PT_CM / 100
        if L < 0.3 and (on_edge(r["pts"][0]) or on_edge(r["pts"][-1])):
            continue
        if key in ("SPR", "FIRE", "WTR") and L < 0.15:
            continue
        out.append(r)
    if key == "SPR":
        # isolated groups shorter than 1.2 m are the drawn valve stations (valve + tamper + test valve)
        groups = []
        for r in out:
            hit = [x for x in groups if any(math.dist(e, oe) <= 2 for e, _ in ends_of(r) for o in x for oe, _ in ends_of(o))]
            merged = [r] + [o for x in hit for o in x]
            groups = [x for x in groups if x not in hit] + [merged]
        keep = set()
        for g in groups:
            if sum(poly_len(o["pts"]) for o in g) * PT_CM / 100 >= 1.2:
                keep.update(id(o) for o in g)
        out = [r for r in out if id(r) in keep]
    return out


# ---------------------------------------------------------------- main
NETWORK = {"SWG": "SWG", "ZMG": "RAIN", "ROOF": "RAIN", "NIK": "NIK", "WTR": "WTR", "FIRE": "FIRE", "SPR": "SPR"}


def main():
    draws = load()
    pts = points(draws)
    cuts = [(q["x"], q["y"]) for q in pts if q["k"] in ("sdrop", "rdrop")]
    # a stack, drop or riser lying on a pipe (not at its end) is a node: cut the pipe there
    vcuts = {k: [(q["x"], q["y"]) for q in pts if q["s"] == k and q["k"] in VERTICAL] for k, *_ in SOURCES}
    runs, src_info, widths = [], [], defaultdict(list)
    for key, layer, rgb, kind in SOURCES:
        n, raw = inventory(draws, layer)
        if kind == "double":
            rs = [{"pts": simplify(c), "w": w, "d": width_to_dia(w) if key in ("ZMG", "ROOF") else None,
                   "src": "width" if key in ("ZMG", "ROOF") else None} for c, w in double_runs(draws, layer, rgb)]
        else:
            rs = [{"pts": pl, "d": None, "src": None} for pl in single_runs(draws, layer, rgb, 60 if key == "SPR" else 32)]
        rs = [r for r in rs if poly_len(r["pts"]) > 2]
        rs = drop_scraps(rs, key)
        rs = split_at_points(rs, vcuts[key])
        rs = split_at_labels(rs, ANCHORS.get(key, []))
        assign_diameters(key, rs, pts, cuts)
        for r in rs:
            r["s"] = key
        if key in ("ZMG", "ROOF"):  # labelled rain pipes: drawn width vs label
            for x, y, d in ZMG_LABELS:
                best = min(rs, key=lambda r: run_dist(x, y, r["pts"]))
                if run_dist(x, y, best["pts"]) < 12:
                    widths[d].append((best["w"] * PT_CM, best["d"]))
        runs += rs
        src_info.append({"k": key, "layer": layer, "rgb": rgb, "kind": kind, "n": n, "raw": raw})
    for key, layer, rgb, kind in EXTRA_LAYERS:
        n, raw = inventory(draws, layer)
        src_info.append({"k": key, "layer": layer, "rgb": rgb, "kind": kind, "n": n, "raw": raw})
    fits = []
    for net in dict.fromkeys(NETWORK.values()):
        idx = [i for i, r in enumerate(runs) if NETWORK[r["s"]] == net]
        fits += fittings([runs[i] for i in idx], idx, net in ("SWG", "RAIN", "NIK"), pts)
    # slope checks along the network
    checks = []
    for key, a, b, what in SLOPE_CHECKS:
        idx = [i for i, r in enumerate(runs) if r["s"] == key]
        rs = [runs[i] for i in idx]
        L, path = net_path(rs, a[:2], b[:2])
        sl = rs[min(path, key=lambda i: run_dist(a[0], a[1], rs[i]["pts"]))]["sl"]
        checks.append({"s": key, "what": what, "a": [cm(a[0]), cm(a[1]), a[2]], "b": [cm(b[0]), cm(b[1]), b[2]],
                       "L": round(L * PT_CM / 100, 2), "sl": sl, "r": [idx[i] for i in path]})
    # other findings the plugin reports
    qa = []
    tap = next(q for q in pts if q["k"] == "tap" and q["x"] < 600)
    for i, r in enumerate(runs):
        if r["s"] == "FIRE" and r["d"] == "3/4\"":
            qa.append({"k": "layer", "r": [i], "x": cm(tap["x"]), "y": cm(tap["y"]), "to": "WTR"})
    for f in fits:
        r = runs[f["r"]]
        if f["t"] != "end" or r["s"] in GRAVITY:
            continue
        cand = [q for q in pts if q["s"] == r["s"] and math.dist((f["x"], f["y"]), (q["x"], q["y"])) < 40]
        if not cand:
            continue
        # the symbol the pipe was meant for: same size if there is one, else the nearest
        near = min(cand, key=lambda q: (q["d"] != r["d"], math.dist((f["x"], f["y"]), (q["x"], q["y"]))))
        dist = math.dist((f["x"], f["y"]), (near["x"], near["y"]))
        qa.append({"k": "gap", "r": [f["r"]], "x": cm(f["x"]), "y": cm(f["y"]), "px": cm(near["x"]), "py": cm(near["y"]),
                   "pk": near["k"], "pd": near["d"], "cm": round(dist * PT_CM)})
    # an open end that stops short of its symbol is a drawing gap, not a cap
    gaps = {(q["x"], q["y"]) for q in qa if q["k"] == "gap"}
    fits = [f for f in fits if not (f["t"] == "end" and (cm(f["x"]), cm(f["y"])) in gaps)]
    calib = {"dim": door_dimension(draws),
             "pipes": [{"d": d, "n": len(v), "cm": round(sorted(w for w, _ in v)[len(v) // 2], 1),
                        "ok": all(dd == d for _, dd in v)} for d, v in sorted(widths.items(), key=lambda kv: dia_key(kv[0]))]}
    return draws, runs, fits, pts, src_info, checks, qa, calib


def export(draws, runs, fits, pts, src_info, checks, qa, calib):
    hexc = lambda rgb: "#%02x%02x%02x" % tuple(int(round(v * 255)) for v in rgb)
    data = {
        "scale": "1:50",
        "w": cm(W_PT), "h": cm(H_PT),
        "calib": calib,
        "sources": [{"k": s["k"], "layer": s["layer"], "color": hexc(s["rgb"]), "kind": s["kind"], "n": s["n"],
                     "raw": s["raw"], "def": DEFAULT_DIA.get(s["k"])} for s in src_info],
        "runs": [{"s": r["s"], "d": r["d"], "ds": r["src"], "sl": r["sl"],
                  **({"w": round(r["w"] * PT_CM, 1)} if "w" in r else {}),
                  "p": [v for x, y in r["pts"] for v in (cm(x), cm(y))]} for r in runs],
        "fit": [{k: v for k, v in {"t": f["t"], "x": cm(f["x"]), "y": cm(f["y"]), "r": f["r"], "b": f.get("b")}.items()
                 if v is not None} for f in fits],
        "pts": [{"s": p["s"], "k": p["k"], "x": cm(p["x"]), "y": cm(p["y"]), "d": p["d"]} for p in pts],
        "checks": checks,
        "qa": qa,
        "bg": background(draws),
        "rooms": [{"n": n, "a": a, "r": [[cm(x), cm(y), cm(w), cm(h)] for x, y, w, h in rects], "lx": cm(lx), "ly": cm(ly)}
                  for n, a, rects, (lx, ly) in ROOMS],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return data


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    res = main()
    data = export(*res)
    d, r, f, p = res[:4]
    tot = defaultdict(float)
    for run in r:
        tot[(run["s"], run["d"], run["src"], run["sl"])] += poly_len(run["pts"]) * PT_CM / 100
    for k in sorted(tot, key=str):
        print(k, round(tot[k], 1))
    cnt = defaultdict(int)
    for x in f:
        cnt[(r[x["r"]]["s"], x["t"])] += 1
    print(dict(sorted(cnt.items())))
    print("runs", len(r), "fittings", len(f), "points", len(p))
    for c in data["checks"]:
        print("check", c["what"], c["L"], c["sl"], round((c["a"][2] - c["b"][2]) / c["L"] * 100, 2))
    print("qa", data["qa"])
    print("calib", data["calib"])
    print("size", os.path.getsize(OUT))
