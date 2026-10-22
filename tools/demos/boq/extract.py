"""Extract the data of the BOQ demo (catalog/boq/data.json) from a project processed by BOQ-AI.

The source is one private house (4 sheets of the set: architecture ground floor, power + comms,
lighting, plumbing). The sources are read in place and never modified. Only filtered, simplified
vector data lands in the repo:

- drawing area only: no title block, no frame, no legend table, no texts, no dimensions,
  no site / plot / landscape layers;
- the three interior sheets share one background (the same xref placed at different offsets), so it
  is stored once ("base", in the lighting sheet's coordinates) and each sheet keeps only its own
  discipline layer;
- coordinates in units of 0.1 pt, simplified, encoded as relative SVG path data.

What is measured where (nothing is taken twice):

- architecture sheet A-101: walls by material and thickness (raster method of BOQ-AI, refined), door
  swings (classified: interior / entrance / ממ"ד / to the yard), window and glazing openings (gaps in the
  wall hatch, widths measured), shower trays and the kitchen counter run (sanitary layer);
- rooms: the same partition as the electrical demo (catalog/electrical/data.json, measured on the
  architectural background of the interior sheets, which is the architecture plan rotated by 90°:
  the transform is found here by matching the wall rasters). Every room boundary is split into wall,
  openings (which opening, measured length) and open-plan boundaries without a wall;
- power / lighting sheets: the electrical demo's final reading of the symbols, tags, unknown shapes and
  designer's notes, mapped onto these sheets, so chapter 08 is the electrical demo's bill line by line;
- plumbing sheet: the 29 grey label boxes (text transcribed once, generic technical wording) and the
  sanitary symbols of the background.

    python -X utf8 tools/demos/boq/extract.py [--src <project sheets dir>]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
from collections import Counter, defaultdict
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "catalog" / "boq" / "data.json"
ELEC = ROOT / "catalog" / "electrical" / "data.json"
DEFAULT_SRC = Path(r"C:\Users\noad\Desktop\Projects\boq\data\projects\p_test1\sheets")
U = 10  # output units per PDF point
K = 1.7638889  # cm per pt (1:50)

SID = {"A": "s_973b042290", "E": "s_b9acf71863", "L": "s_791ba69247", "P": "s_01fa67e045"}
# the interior sheets are viewports of one background; offset = sheet coords - lighting coords
OFF = {"E": (82.74, 150.9), "L": (0.0, 0.0), "P": (274.8, 0.0)}
E_ORIGIN = (128.0, 108.0)                 # crop origin of the electrical demo (electrical-sheet points)
BASE_BOX = (185, 80, 1420, 1006)          # the building, in lighting-sheet coords
ARCH_BOX = (870, 735, 1800, 1962)         # the building on the architecture sheet
ARCH_SKIP = [(1765, 700, 1810, 862)]      # a yard element next to the building
NOTE_LAYERS = {"MMD"}                     # mapped to a wall class in the source project, only carries notes

BASE_GROUPS = {
    "walls": ["Project3|A-WALL-PATT-CUT", "Project3|IN-WALL-CUT", "Project3|EX-WALL-CUT", "Project3|A-WALL-CUT",
              "Project3|IN-WALL-PROJ", "Project3|EX-WALL-PROJ"],
    "open": ["Project3|A-DOOR", "Project3|A-DOOR-FRAM", "Project3|A-GLAZ", "Project3|A-GLAZ-CUT", "Project3|A-GLAZ-SILL",
             "Project3|A-GLAZ-HDLN"],
    "fix": ["Project3|sanitery", "Project3|P-SANR-FIXT", "sanitery"],
    "furn": ["Project3|Furn Layout", "Project3|FURN", "ריהוט", "+FURN", "furn", "FURN-layout", "Project3|A-GENM",
             "מיזוג אויר"],
}
ARCH_GROUPS = {
    "hatch": ["beton50", "block50"],
    "walls": ["wall", "wall in", "IN-WALL-CUT", "EX-WALL-CUT", "IN-WALL-PROJ", "EX-WALL-PROJ"],
    "open": ["door", "win"],
    "fix": ["sanit"],
    "furn": ["furn"],
}
DISC_LAYERS = {"E": ["ELEC", "Project3|ELEC"], "L": ["LIGHT", "ELEC"], "P": ["מידה אינסטלציה"]}
# a free-text note in the yard whose wording could read as a name: left out to be safe (sheet coords)
DISC_SKIP = {"L": [(215, 1035, 450, 1125)]}

PX_CM = 1.0
MIN_WALL_M = 1.0
# hatch thickness on the drawing -> wall class (the hatch is the structural layer; plaster and the
# inner insulation line are drawn outside it)
WALL_CLASSES = {
    "conc": [(0, 19.5, 18, "קיר חוץ, בטון"), (19.5, 27.0, 22, "קיר בטון"), (27.0, 60, 30, "קיר ממ״ד, בטון")],
    "block": [(0, 15.5, 10, "מחיצת בלוק 10"), (15.5, 60, 20, "קיר בלוק 20")],
}

# ---------------------------------------------------------------- plumbing labels (P-101)
# The grey label boxes on the plumbing layer, text transcribed once from the sheet (generic wording).
# key -> (text on the sheet, what it means for the BOQ)
PL_TYPES = {
    "basin": ("ברז פרח מים חמים/קרים, הכנה לניקוז", "נקודת כיור: מים חמים וקרים + ניקוז"),
    "kitchen": ("ברז פרח מים חמים/קרים + הכנה לניקוז + הכנה לאוסמוזה", "נקודת כיור מטבח + הכנה לאוסמוזה"),
    "mixer3": ("אינטרפוץ 3 דרך, גובה 100", "נקודת מקלחת: אינטרפוץ"),
    "mixer4": ("אינטרפוץ 4 דרך, גובה 100", "נקודת מקלחת: אינטרפוץ"),
    "head": ("ראש טוש מהקיר, גובה 225", "יציאה לראש טוש (כלולה בנקודת המקלחת)"),
    "bidet": ("נק׳ מים ומאחז, גובה 100", "נקודת מים קרים לברז שטיפה"),
    "wc": ("ניאגרה סמויה, אסלה תלויה", "אסלה תלויה + מיכל הדחה סמוי"),
    "wc_ext": ("ניאגרה סמויה, אסלה תלויה, בתוך קיר חיצוני", "אסלה תלויה + מיכל סמוי בקיר חוץ"),
    "washer": ("ברז ניל גובה 65, מים חמים/קרים + ניקוז למכונת כביסה", "נקודת מכונת כביסה"),
    "fridge": ("ברז ניל מים קרים למקרר, גובה 30", "נקודת מים למקרר"),
    "ac_drain": ("ניקוז למזגן ופתח שירות לפי יועץ מיזוג", "נקודת ניקוז מזגן"),
    "garden": ("ברז גינה, גובה 50", "ברז גינה"),
    "garden_irr": ("ברז גינה + מחשב השקיה, גובה 50", "ברז גינה + הכנה למחשב השקיה"),
    "gas": ("נק׳ גז למייבש כביסה בגז", "נקודת גז למייבש"),
    "channel": ("תעלת ניקוז מרובעת", "תעלת ניקוז למקלחת"),
}
# label box (top-left corner, plumbing-sheet points, rounded) -> type
PL_LABELS = {
    (313, 68): "garden", (1590, 180): "garden", (644, 265): "bidet", (1450, 268): "kitchen",
    (644, 295): "mixer3", (386, 304): "wc_ext", (524, 316): "ac_drain", (1450, 331): "fridge",
    (644, 333): "head", (385, 353): "basin", (1579, 361): "ac_drain", (386, 397): "washer",
    (386, 444): "gas", (994, 489): "basin", (1071, 489): "wc", (317, 582): "basin", (317, 627): "bidet",
    (317, 657): "mixer3", (317, 695): "head", (318, 738): "wc", (628, 770): "bidet", (822, 793): "head",
    (628, 800): "mixer4", (822, 820): "channel", (822, 850): "basin", (823, 891): "wc_ext",
    (1592, 896): "basin", (318, 897): "garden_irr", (1207, 930): "garden_irr",
}

# ---------------------------------------------------------------- openings (A-101)
# sill / head heights by opening type (m above finished floor): assumptions, no sections in the set
OPEN_TYPES = ["door_in", "door_ent", "door_mamad", "door_ext", "win_sh", "slide_sh", "win_wet", "win_mamad", "vitrine"]


# ---------------------------------------------------------------- geometry helpers
def load(src: Path, sid: str, name: str):
    return json.loads((src / sid / f"{name}.json").read_text(encoding="utf-8"))


def pts_of(p):
    return [(p["p"][i], p["p"][i + 1]) for i in range(0, len(p["p"]) - 1, 2)]


def bbox_of(pts):
    xs = [a for a, _ in pts]
    ys = [b for _, b in pts]
    return min(xs), min(ys), max(xs), max(ys)


def inside(pts, bx):
    x0, y0, x1, y1 = bbox_of(pts)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return bx[0] <= cx <= bx[2] and bx[1] <= cy <= bx[3]


def simplify(pts, tol, closed):
    if len(pts) <= 3 or tol <= 0:
        return pts
    ring = pts + [pts[0]] if closed and pts[0] != pts[-1] else pts
    s = list(LineString(ring).simplify(tol, preserve_topology=False).coords)
    if closed and len(s) > 1 and s[0] == s[-1]:
        s = s[:-1]
    return s if len(s) >= 2 else pts


def num_join(nums):
    out = []
    for n in nums:
        s = str(n)
        if out and not s.startswith("-"):
            out.append(" ")
        out.append(s)
    return "".join(out)


class PathBuilder:
    """Compact relative SVG path data from point lists (integer units)."""

    def __init__(self):
        self.parts = []
        self.pen = None
        self.seen = set()

    def add(self, pts, closed=False):
        q = []
        for x, y in pts:
            t = (int(round(x * U)), int(round(y * U)))
            if not q or q[-1] != t:
                q.append(t)
        if closed and len(q) > 2 and q[0] == q[-1]:
            q = q[:-1]
        if len(q) < 2:
            return
        key = (tuple(q), closed)
        rkey = (tuple(reversed(q)), closed)
        if key in self.seen or rkey in self.seen:
            return
        self.seen.add(key)
        x0, y0 = q[0]
        if self.pen is None:
            self.parts.append("M" + num_join([x0, y0]))
        else:
            self.parts.append("m" + num_join([x0 - self.pen[0], y0 - self.pen[1]]))
        d = []
        for (ax, ay), (bx, by) in zip(q, q[1:]):
            d += [bx - ax, by - ay]
        self.parts.append("l" + num_join(d))
        if closed:
            self.parts.append("z")
            self.pen = (x0, y0)
        else:
            self.pen = q[-1]

    def d(self):
        return "".join(self.parts)


def light(c):
    return c is not None and min(c) > 0.75 and max(c) - min(c) < 0.1


def layer_paths(prims, layers, bx, tol, shift=(0.0, 0.0), keep=None):
    """Paths for the prims of `layers` whose centre is inside `bx`:
    s = strokes, f = coloured fills (symbol fills), b = light fills (wall poche, label backgrounds)."""
    sp, fp, bp = PathBuilder(), PathBuilder(), PathBuilder()
    n = 0
    for p in prims:
        if p["l"] not in layers or len(p["p"]) < 4:
            continue
        pts = pts_of(p)
        if not inside(pts, bx) or (keep and not keep(p, pts)):
            continue
        pts = [(x - shift[0], y - shift[1]) for x, y in pts]
        closed = p["t"] == "pg"
        filled = closed and p.get("f") is not None and len(pts) >= 3
        q = simplify(pts, tol, closed)
        if filled:
            (bp if light(p["f"]) else fp).add(q, True)
            if p.get("w", 0) > 0 and p.get("c") is not None and not light(p["c"]):
                sp.add(q, True)       # outlined box: keep its outline
        else:
            sp.add(q, closed)
        n += 1
    return {"s": sp.d(), "f": fp.d(), "b": bp.d()}, n


def poly_d(poly, tol=0.0):
    pb = PathBuilder()
    pb.add(simplify(list(poly), tol, True), True)
    return pb.d()


def preview(prims, layers, bb, pad_k=0.25):
    """A small symbol / label preview: the prims of `layers` around bbox `bb`, in a local frame."""
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    pad = max(w, h) * pad_k + 1
    cb = (bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad)
    s, f, b = PathBuilder(), PathBuilder(), PathBuilder()
    for p in prims:
        if p["l"] not in layers or len(p["p"]) < 4:
            continue
        pts = pts_of(p)
        x0, y0, x1, y1 = bbox_of(pts)
        if x1 < cb[0] or x0 > cb[2] or y1 < cb[1] or y0 > cb[3] or (x1 - x0) > 3 * (cb[2] - cb[0]):
            continue
        q = [(x - cb[0], y - cb[1]) for x, y in pts]
        if p["t"] == "pg" and p.get("f") is not None:
            (b if light(p["f"]) else f).add(q, True)
        else:
            s.add(q, p["t"] == "pg")
    return {"w": int((cb[2] - cb[0]) * U), "h": int((cb[3] - cb[1]) * U), "s": s.d(), "f": f.d(), "b": b.d()}


# ---------------------------------------------------------------- walls (raster method of BOQ-AI spaces.py)
def raster(prims, ox, oy, s, W, H, width=1):
    img = np.zeros((H, W), dtype=np.uint8)
    for pr in prims:
        p = pr["p"]
        pts = np.array([[(p[i] - ox) * s, (p[i + 1] - oy) * s] for i in range(0, len(p) - 1, 2)], dtype=np.int32)
        if len(pts) < 2:
            continue
        if pr["t"] == "pg" and pr.get("f") is not None and len(pts) >= 3:
            cv2.fillPoly(img, [pts], 255)
        cv2.polylines(img, [pts], pr["t"] == "pg", 255, width)
    return img


class Frame:
    """Raster frame over the architecture sheet (PX_CM cm per pixel)."""

    def __init__(self, sheet):
        pb = sheet["plan_bbox"]
        pad = 40
        self.ox, self.oy = pb[0] - pad, pb[1] - pad
        self.s = K / PX_CM
        self.W = int((pb[2] - pb[0] + 2 * pad) * self.s) + 2
        self.H = int((pb[3] - pb[1] + 2 * pad) * self.s) + 2

    def px(self, x, y):
        return (x - self.ox) * self.s, (y - self.oy) * self.s

    def pt(self, px, py):
        return px / self.s + self.ox, py / self.s + self.oy


def wall_buckets(prims, sheet, fr: Frame):
    lm = sheet["layer_map"]
    kc = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    ko = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    rows, masks = [], {}
    for material, classes in (("conc", ("walls_concrete",)), ("block", ("walls_block", "walls_gypsum"))):
        layers = {l for l, c in lm.items() if c in classes}
        mask = raster([p for p in prims if p["l"] in layers], fr.ox, fr.oy, fr.s, fr.W, fr.H)
        mask = cv2.morphologyEx(cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kc), cv2.MORPH_OPEN, ko)
        masks[material] = mask
        dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
        skel = skeletonize(mask > 0)
        thick = dist * 2 * PX_CM
        # one class per wall run (median thickness along the run), not per pixel
        nb = ndimage.convolve(skel.astype(np.uint8), np.ones((3, 3), np.uint8), mode="constant") - 1
        junction = skel & (nb >= 3)
        runs, n_runs = ndimage.label(skel & ~junction, structure=np.ones((3, 3)))
        cls = WALL_CLASSES[material]

        def bucket(t):
            for bi, (lo, hi, _, _) in enumerate(cls):
                if lo <= t < hi:
                    return bi + 1
            return 0
        run_bucket = np.zeros(n_runs + 1, dtype=np.int16)
        run_thick = np.zeros(n_runs + 1)
        for ri, sl in enumerate(ndimage.find_objects(runs), start=1):
            sel = runs[sl] == ri
            run_thick[ri] = float(np.median(thick[sl][sel]))
            run_bucket[ri] = bucket(run_thick[ri])
        sk_bucket = np.where(skel, run_bucket[runs], 0)
        src_px = sk_bucket > 0
        inv = np.where(src_px, 0, 255).astype(np.uint8)
        _, lab = cv2.distanceTransformWithLabels(inv, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        bucket_of = np.concatenate([[0], sk_bucket[src_px]]).astype(np.int16)
        pix_bucket = bucket_of[np.clip(lab, 0, len(bucket_of) - 1)]
        sk_final = np.where(skel, pix_bucket, 0)
        for bi, (lo, hi, label, name) in enumerate(cls):
            sel = sk_final == bi + 1
            n = int(sel.sum())
            length_m = n * PX_CM / 100.0 * 1.05          # diagonal steps of the skeleton
            if length_m < MIN_WALL_M:
                continue
            tmed = float(np.median(thick[sel]))
            bm = ((mask > 0) & (pix_bucket == bi + 1)).astype(np.uint8) * 255
            cnts, _ = cv2.findContours(bm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            pbld = PathBuilder()
            for c in cnts:
                if cv2.contourArea(c) < 4:
                    continue
                a = cv2.approxPolyDP(c, 1.0, True).reshape(-1, 2)
                if len(a) < 3:
                    continue
                pbld.add([fr.pt(x, y) for x, y in a], True)
            rows.append({"k": material, "t": label, "n": name, "len": round(length_m, 1), "tm": round(tmed), "d": pbld.d(),
                         "_mask": bm})
    return rows, masks


def arc_fit(pts):
    if len(pts) < 5:
        return None
    x, y = pts[:, 0], pts[:, 1]
    A = np.column_stack([x, y, np.ones(len(x))])
    b = x ** 2 + y ** 2
    sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    cx, cy = sol[0] / 2, sol[1] / 2
    r2 = sol[2] + cx ** 2 + cy ** 2
    if r2 <= 0.04:
        return None
    r = math.sqrt(r2)
    d = np.hypot(x - cx, y - cy)
    return cx, cy, r, float(np.sqrt(((d - r) ** 2).mean()) / r)


def door_arcs(prims, layers):
    """Door swings: (cx, cy, r, a0, a1) for every arc-shaped prim of `layers`; the arc prims get p["arc"] = True."""
    out = []
    for p in prims:
        if p["l"] not in layers or p["t"] not in ("pl", "pg"):
            continue
        pts = np.array(pts_of(p))
        f = arc_fit(pts)
        if f is None or f[3] > 0.05:
            continue
        cx, cy, r, _ = f
        ang = np.unwrap(np.arctan2(pts[:, 1] - cy, pts[:, 0] - cx))
        span = abs(ang[-1] - ang[0])
        if math.radians(55) <= span <= math.radians(125) and 5 <= r <= 200:
            out.append((cx, cy, r, float(ang[0]), float(ang[-1])))
            p["arc"] = True
    return out


def clusters(prims, layer, bx, pad=1.5):
    """Connected groups of prims of one layer (by padded bounding boxes)."""
    bxs = []
    for p in prims:
        if p["l"] != layer or len(p["p"]) < 4:
            continue
        pts = pts_of(p)
        if not inside(pts, bx):
            continue
        b = bbox_of(pts)
        bxs.append(box(b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad))
    u = unary_union(bxs)
    gs = list(u.geoms) if hasattr(u, "geoms") else [u]
    return [tuple(v + (pad if i < 2 else -pad) for i, v in enumerate(g.bounds)) for g in gs]


def align_arch(gA, gE):
    """Architecture sheet -> electrical sheet: the interior sheets show the architecture plan rotated by
    90° (same scale). Found by matching the wall rasters: E = (-yA + tx, xA + ty)."""
    AL = {"beton50", "block50", "wall", "wall in"}
    EL = {"Project3|A-WALL-PATT-CUT", "Project3|IN-WALL-CUT", "Project3|EX-WALL-CUT", "Project3|A-WALL-CUT"}

    def ras(prims, layers, bx, fn):
        img = np.zeros((int(bx[3] - bx[1]), int(bx[2] - bx[0])), np.uint8)
        for p in prims:
            if p["l"] not in layers:
                continue
            q = np.array([fn(x, y) for x, y in pts_of(p)]) - [bx[0], bx[1]]
            q = q.astype(np.int32)
            if len(q) < 2:
                continue
            if p["t"] == "pg" and p.get("f") is not None and len(q) >= 3:
                cv2.fillPoly(img, [q], 255)
            else:
                cv2.polylines(img, [q], p["t"] == "pg", 255, 2)
        return cv2.GaussianBlur(img, (9, 9), 0).astype(np.float32)
    ra = (-ARCH_BOX[3], ARCH_BOX[0], -ARCH_BOX[1], ARCH_BOX[2])
    imA = ras(gA["prims"], AL, ra, lambda x, y: (-y, x))
    eb = (200, 150, 1600, 1200)
    imE = ras(gE["prims"], EL, eb, lambda x, y: (x, y))
    pad = 400
    big = cv2.copyMakeBorder(imE, pad, pad, pad, pad, cv2.BORDER_CONSTANT, 0)
    r = cv2.matchTemplate(big, imA, cv2.TM_CCORR_NORMED)
    _, mx, _, loc = cv2.minMaxLoc(r)
    tx = loc[0] - pad + eb[0] - ra[0]
    ty = loc[1] - pad + eb[1] - ra[1]
    print(f"architecture -> electrical sheet: E = (-yA + {tx}, xA + {ty}), match {mx:.3f}")
    assert mx > 0.85, "the architecture plan no longer matches the interior background"
    return tx, ty


# ---------------------------------------------------------------- electrical (catalog/electrical/data.json)
SWITCH = {"L23", "L24", "L25", "L26"}
LSW = {"L23", "L24", "L25"}
WPL = {"L17", "L18"}
SOCK = {"L29", "L30", "L31", "L32a", "L32b", "L33"}


def elec_quantities(ED, inst, unk, notes, accept_all=True):
    """Same rules as quantities() in catalog/electrical/demo.js (all review items accepted, every unknown
    shape assigned to its suggestion, every note applied)."""
    LG = {l["c"]: l for l in ED["legend"]}
    lights = {c for c, l in LG.items() if l["k"] == "light"}
    q = Counter()
    pts = [{"c": it["c"], "t": it.get("t"), "m": it.get("m"), "role": it.get("role")} for it in inst]
    for u in unk:
        if u["sug"]:
            pts += [{"c": u["sug"], "t": t.get("t")} for t in u["items"]]
    circ, fix, sw = set(), 0, Counter()
    for n, p in enumerate(pts):
        if p.get("role") == "of":
            continue
        c = p["c"]
        if c in lights:
            fix += 1
            circ.add(p.get("t") or f"#{n}")
            if c in WPL:
                q["light_wp"] += 1
        elif c in LSW:
            if p.get("t"):
                sw[p["t"]] += 1
            if c == "L25":
                q["sw_ind"] += 1
        elif c != "L26":
            q[LG[c]["k"]] += 1
        if c in SOCK and (p.get("m") or 1) > 1:
            q["socket_add"] += p["m"] - 1
    q["light"] += len(circ)
    q["light_add"] += fix - len(circ)
    for n in sw.values():
        if n >= 2:
            q["sw_2way"] += 2
            q["sw_cross"] += n - 2
    boxes = sum(1 for it in inst if it["c"] in SWITCH or it.get("g") in SWITCH)
    for nt in notes:
        if nt["k"]:
            q[nt["k"]] += boxes if nt["q"] == "switches" else nt["q"]
    return {k: v for k, v in q.items() if v}


def electrical(ED):
    """The electrical demo's reading, mapped onto the power (E) and lighting (L) sheets of this demo."""
    def to_sheet(s, x, y):
        xE, yE = x / K + E_ORIGIN[0], y / K + E_ORIGIN[1]
        return (xE, yE) if s == "E" else (xE - OFF["E"][0], yE - OFF["E"][1])

    def rect(s, x, y, r):
        X, Y = to_sheet(s, x, y)
        R = max(r, 6) / K
        return [int((X - R) * U), int((Y - R) * U), int(2 * R * U), int(2 * R * U)]

    inst = []
    for it in ED["inst"]:
        r = 30 if it.get("len") else it["r"]
        inst.append([it["s"], it["c"], *rect(it["s"], it["x"], it["y"], r), it["rv"], it.get("t") or "", it.get("m") or 0,
                     it.get("role") or "", it.get("g") or ""])
    unk = [{"s": u["s"], "sug": u["sug"], "gl": u["glyph"], "items": [[*rect(u["s"], t["x"], t["y"], t["r"]), t.get("t") or ""]
                                                                    for t in u["items"]]} for u in ED["unknown"]]
    notes = []
    for n in ED["notes"]:
        x, y, w, h = n["b"]
        X0, Y0 = to_sheet(n["s"], x, y)
        notes.append({"s": n["s"], "t": n["t"], "k": n["k"], "q": n["q"],
                      "b": [int(X0 * U), int(Y0 * U), int(w / K * U), int(h / K * U)]})
    legend = {l["c"]: [l["he"], l["k"], l["g"], l["gl"]] for l in ED["legend"]}
    q = elec_quantities(ED, ED["inst"], ED["unknown"], ED["notes"])
    want = {l["k"]: l["qty"] for l in ED["summary"]["boq"]}
    assert q == want, f"electrical quantities differ from the electrical demo: {q} vs {want}"
    price = {b[0]: b[4] for b in ED["boq"]}
    net = sum(price[k] * v for k, v in q.items())
    assert net == ED["summary"]["net"], (net, ED["summary"]["net"])
    print(f"electrical chapter: {len(q)} lines, net {net} (= electrical demo summary)")
    return {"boq": ED["boq"], "legend": legend, "groups": ED["groups"], "inst": inst, "unk": unk, "notes": notes,
            "net": ED["summary"]["net"], "lines": len(q)}


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    src = ap.parse_args().src
    ED = json.loads(ELEC.read_text(encoding="utf-8"))

    data = {"u": U, "sheets": {}, "base": {}, "labels": [], "rooms": [], "walls": [], "doors": [], "open": [], "inst": {},
            "sym": {}, "pl": [], "el": {}}

    # ---- shared background of the interior sheets (lighting-sheet coords)
    gL = load(src, SID["L"], "geometry")
    for key, layers in BASE_GROUPS.items():
        tol = 0.12 if key in ("walls", "open") else 0.2
        paths, n = layer_paths(gL["prims"], set(layers), BASE_BOX, tol)
        data["base"][key] = paths
        print(f"base {key}: {n} prims, {sum(map(len, paths.values()))} chars")

    # ---- architecture sheet
    gA = load(src, SID["A"], "geometry")
    sA = load(src, SID["A"], "sheet")
    gE = load(src, SID["E"], "geometry")
    tx, ty = align_arch(gA, gE)
    a_of_e = lambda xE, yE: (yE - ty, tx - xE)        # noqa: E731  electrical sheet -> architecture sheet
    e_of_a = lambda xA, yA: (tx - yA, xA + ty)        # noqa: E731

    def skip(pts):
        x0, y0, x1, y1 = bbox_of(pts)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        return any(b[0] <= cx <= b[2] and b[1] <= cy <= b[3] for b in ARCH_SKIP)

    primsA = [p for p in gA["prims"] if p["l"] not in NOTE_LAYERS and len(p["p"]) >= 4
              and inside(pts_of(p), ARCH_BOX) and not skip(pts_of(p))]
    fr = Frame(sA)
    walls, masks = wall_buckets(primsA, sA, fr)
    wall_any = masks["conc"] | masks["block"]
    outline = raster([p for p in primsA if p["l"] in ("wall", "wall in")], fr.ox, fr.oy, fr.s, fr.W, fr.H, width=2)
    solid = cv2.dilate(wall_any | outline, np.ones((3, 3), np.uint8))
    dist_wall = cv2.distanceTransform(np.where(solid > 0, 0, 255).astype(np.uint8), cv2.DIST_L2, 5) * PX_CM  # cm

    wall_dil = cv2.dilate(wall_any, np.ones((5, 5), np.uint8))

    def on_wall_fast(p, pts):
        x0, y0, x1, y1 = bbox_of(pts)
        px, py = (int(v) for v in fr.px((x0 + x1) / 2, (y0 + y1) / 2))
        return 0 <= py < wall_dil.shape[0] and 0 <= px < wall_dil.shape[1] and wall_dil[py, px] > 0

    arch = {}
    for key, layers in ARCH_GROUPS.items():
        keep = on_wall_fast if key == "hatch" else None
        paths, n = layer_paths(primsA, set(layers), ARCH_BOX, 0.12 if key in ("walls", "open", "hatch") else 0.2, keep=keep)
        arch[key] = paths
        print(f"arch {key}: {n} prims, {sum(map(len, paths.values()))} chars")

    # ---- rooms: the electrical demo's partition, in architecture-sheet coords
    rooms = []
    for r in ED["rooms"]:
        ring = [a_of_e(r["p"][j] / K + E_ORIGIN[0], r["p"][j + 1] / K + E_ORIGIN[1]) for j in range(0, len(r["p"]), 2)]
        poly = Polygon(ring).buffer(0)
        c = a_of_e(r["c"][0] / K + E_ORIGIN[0], r["c"][1] / K + E_ORIGIN[1])
        rooms.append({"n": r["n"], "k": r["k"], "a": r["a"], "poly": poly, "c": c})
    mamad = next(i for i, r in enumerate(rooms) if r["n"].startswith("ממ"))
    print("rooms", len(rooms), "net", round(sum(r["a"] for r in rooms), 1))

    def room_at(x, y, tol=6):
        P0 = Point(x, y)
        best = min(range(len(rooms)), key=lambda i: rooms[i]["poly"].distance(P0))
        return best if rooms[best]["poly"].distance(P0) <= tol else -1

    # ---- doors: swings on the door layer; a 1.5-leaf door is two arcs whose hinges are one leaf apart
    arcs = door_arcs(primsA, {"door"})
    data["doors"] = [[int(cx * U), int(cy * U), int(r * U), round(a0, 3), round(a1, 3)] for cx, cy, r, a0, a1 in arcs]
    def ends(j):
        cx, cy, r, a0, a1 = arcs[j]
        return [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in (a0, a1)]

    def wall_at(p):
        px, py = (int(v) for v in fr.px(*p))
        return dist_wall[min(max(py, 0), dist_wall.shape[0] - 1), min(max(px, 0), dist_wall.shape[1] - 1)] <= 4

    door_prims = [p for p in primsA if p["l"] == "door" and not p.get("arc")]       # leaves and frames
    door_vx = np.array([v for p in door_prims for v in pts_of(p)])

    def closed_end(j):
        """The arc end of the closed leaf. Door blocks draw the leaf in the open position, so the open end of
        the swing touches the leaf; the closed end is the other one (ties: the end with a wall jamb past it)."""
        cx, cy, r, *_ = arcs[j]
        best = None
        for e in ends(j):
            d = np.hypot(door_vx[:, 0] - e[0], door_vx[:, 1] - e[1])
            touch = int(((d < 1.2) & (d > 0.0)).sum())
            ux, uy = (e[0] - cx) / r, (e[1] - cy) / r
            jamb = sum(wall_at((e[0] + ux * k, e[1] + uy * k)) for k in (3, 5, 7))
            sc = -10 * min(touch, 3) + jamb
            if best is None or sc > best[0]:
                best = (sc, e)
        return best[1]

    # a 1.5-leaf door: two swings whose closed leaves meet
    used, doors = set(), []
    for i in range(len(arcs)):
        if i in used:
            continue
        grp = [i]
        for j in range(len(arcs)):
            if j != i and j not in used and math.dist(closed_end(i), closed_end(j)) < 4:
                grp.append(j)
        used.update(grp)
        leaf = sum(arcs[j][2] for j in grp) * K / 100
        doors.append({"arcs": grp, "leaf": round(leaf, 2)})
    for d in doors:
        d["geom"] = unary_union([LineString([arcs[j][:2], closed_end(j)]) for j in d["arcs"]]).buffer(20)

    # ---- windows: clusters on the window layer + glazed sliding doors on the door layer
    win_cl = clusters(primsA, "win", ARCH_BOX)
    door_cl = clusters(primsA, "door", ARCH_BOX)
    hinges = [Point(a[0], a[1]) for a in arcs]
    glaz = [b for b in door_cl if not any(box(*b).buffer(3).contains(h) for h in hinges)]
    # pair the sill line and the frame of one window (parallel, a few points apart)
    merged = unary_union([box(*b).buffer(4.5) for b in win_cl] + [box(*b).buffer(4.5) for b in glaz])
    win_geoms = list(merged.geoms) if hasattr(merged, "geoms") else [merged]

    # ---- room boundaries: wall / opening / open plan
    openings = []        # {t, w, rooms:{i: len}, hl, door}
    for d in doors:
        openings.append({"kind": "door", "geom": d["geom"], "leaf": d["leaf"], "arcs": d["arcs"], "rooms": defaultdict(float)})
    for g in win_geoms:
        is_glaz = any(box(*b).intersects(g) for b in glaz)
        openings.append({"kind": "slide" if is_glaz else "win", "geom": g.buffer(6), "rooms": defaultdict(float)})
    step = 2.0 / K           # sample every 2 cm (in pt)
    dbg = []
    for i, rm in enumerate(rooms):
        ring = list(rm["poly"].exterior.coords)
        wall_l = open_l = 0.0
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            L = math.hypot(x1 - x0, y1 - y0)
            n = max(1, int(L / step))
            for k in range(n):
                t = (k + 0.5) / n
                x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                seg = L / n * K / 100       # m
                px, py = (int(v) for v in fr.px(x, y))
                dw = dist_wall[min(max(py, 0), dist_wall.shape[0] - 1), min(max(px, 0), dist_wall.shape[1] - 1)]
                if dw <= 6:
                    wall_l += seg
                    continue
                P0 = Point(x, y)
                hit = next((o for o in openings if o["geom"].contains(P0)), None)
                if hit is None:
                    open_l += seg
                    dbg.append((x, y, 1))
                else:
                    hit["rooms"][i] += seg
                    dbg.append((x, y, 2))
        rm["wall"], rm["open"] = wall_l, open_l

    # classify the openings
    motors = [it for it in ED["inst"] if it["c"] == "L28"]
    motor_pts = [(it.get("t") or "", Point(*a_of_e(it["x"] / K + E_ORIGIN[0], it["y"] / K + E_ORIGIN[1]))) for it in motors]
    kept = []
    for o in openings:
        rs = {i: v for i, v in o["rooms"].items() if v >= 0.25}
        if not rs:
            continue                      # window-layer parts that are not an opening (ממ"ד door frame, vents)
        o["rooms"] = rs
        w = max(rs.values())
        if o["kind"] == "door":
            names = [rooms[i]["k"] for i in rs]
            if mamad in rs:
                t = "door_mamad"
            elif len(rs) >= 2:
                t = "door_in"
            else:
                t = "door_ext"
            o["w"] = round(o["leaf"] + 0.1, 2)      # rough opening: leaf + frame
        else:
            near = [tag for tag, p in motor_pts if o["geom"].distance(p) < 14]
            o["sh"] = near[0] if near else ""
            if near:
                t = "slide_sh" if o["kind"] == "slide" else "win_sh"
            elif mamad in rs:
                t = "win_mamad"
            elif all(rooms[i]["k"] in ("bath", "wc", "laundry", "store") for i in rs):
                t = "win_wet"
            else:
                t = "vitrine"
            o["w"] = round(w, 2)
        o["t"] = t
        kept.append(o)
    openings = kept
    ext = [o for o in openings if o["t"] == "door_ext"]
    if ext:
        max(ext, key=lambda o: o["leaf"])["t"] = "door_ent"      # the main entrance: the widest door to the outside
    order = {t: i for i, t in enumerate(OPEN_TYPES)}
    openings.sort(key=lambda o: (order[o["t"]], -o["w"]))
    for oi, o in enumerate(openings):
        for i in o["rooms"]:
            g = min(o["rooms"][i], o["w"])
            rooms[i].setdefault("gaps", []).append([oi, round(g, 2)])
            rooms[i]["open"] += o["rooms"][i] - g          # jogs of the boundary inside the reveal: no wall
    shuttered = sum(1 for o in openings if o.get("sh"))
    print("openings", Counter(o["t"] for o in openings), "with shutter motor", shuttered, "of", len(motors))
    for o in openings:
        print(f"  {o['t']:10s} w={o['w']:.2f} rooms={[rooms[i]['n'] for i in o['rooms']]} {o.get('sh', '')}")

    # ---- walls: which doors sit in which wall class (for the wall above the door head)
    for o in openings:
        if not o["t"].startswith("door"):
            continue
        cx, cy, *_ = arcs[o["arcs"][0]]
        px, py = (int(v) for v in fr.px(cx, cy))
        best, bd = None, 1e9
        for wi, w in enumerate(walls):
            m = cv2.dilate(w["_mask"], np.ones((25, 25), np.uint8))
            if m[py, px] > 0:
                d = 0 if w["k"] == "block" else 1
                if d < bd:
                    best, bd = wi, d
        o["wall"] = best
    for wi, w in enumerate(walls):
        w["doors"] = [oi for oi, o in enumerate(openings) if o.get("wall") == wi]

    # ---- showers (wet rooms) and the kitchen counter run, from the sanitary layer
    def near_wall_len(p0, p1, tol=10):
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        n = max(1, int(L / step))
        out = 0.0
        for k in range(n):
            t = (k + 0.5) / n
            px, py = (int(v) for v in fr.px(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t))
            if dist_wall[py, px] <= tol:
                out += L / n * K / 100
        return out

    sanit = [p for p in primsA if p["l"] == "sanit"]
    showers = []
    for i, rm in enumerate(rooms):
        if rm["k"] != "bath":
            continue
        best = None
        for p in sanit:
            if p["t"] != "pg" or len(p["p"]) != 10:
                continue
            x0, y0, x1, y1 = bbox_of(pts_of(p))
            w, h = (x1 - x0) * K / 100, (y1 - y0) * K / 100
            if min(w, h) < 0.75 or max(w, h) > 2.4 or not rm["poly"].buffer(3).contains(box(x0, y0, x1, y1)):
                continue
            if best is None or w * h > best[0]:
                best = (w * h, (x0, y0, x1, y1))
        if best:
            x0, y0, x1, y1 = best[1]
            sides = [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]
            sw = sum(near_wall_len(a, b, tol=14) for a, b in sides)
            rm["shw"] = round(sw, 2)
            showers.append([i, int(x0 * U), int(y0 * U), int((x1 - x0) * U), int((y1 - y0) * U)])
            print(f"shower in {rm['n']}: {(x1 - x0) * K / 100:.2f} x {(y1 - y0) * K / 100:.2f} m, walls {sw:.2f} m")
    data["showers"] = showers

    kitchen = next(i for i, r in enumerate(rooms) if r["k"] == "kitchen")
    kp = rooms[kitchen]["poly"]
    # counter front polylines (deep 55-70 cm from a wall) -> cabinet runs on the walls behind them
    runs = []
    for p in sanit:
        if p["t"] != "pl":
            continue
        pts = pts_of(p)
        if not kp.buffer(2).contains(LineString(pts)):
            continue
        for si, (a, b) in enumerate(zip(pts, pts[1:])):
            L = math.hypot(b[0] - a[0], b[1] - a[1]) * K / 100
            if L < 0.3:
                continue
            turn_a, turn_b = si > 0, si < len(pts) - 2       # the front continues around a corner there
            ring = list(kp.exterior.coords)
            for c, d in zip(ring, ring[1:]):
                horiz = abs(a[1] - b[1]) < 1 and abs(c[1] - d[1]) < 1
                vert = abs(a[0] - b[0]) < 1 and abs(c[0] - d[0]) < 1
                if not (horiz or vert):
                    continue
                off = abs(a[1] - c[1]) if horiz else abs(a[0] - c[0])
                if not 0.5 <= off * K / 100 <= 0.75:
                    continue
                ax = 0 if horiz else 1
                wl = c[1 - ax]                                   # the wall line behind this front segment

                def corner(vi):
                    """The front turns a corner at vertex vi (the next segment moves away from this wall)."""
                    if vi <= 0 or vi >= len(pts) - 1:
                        return False
                    nb = pts[vi - 1] if vi == si + 1 else pts[vi + 1]
                    nb = pts[vi + 1] if vi == si + 1 else pts[vi - 1]
                    return abs(nb[1 - ax] - wl) > abs(pts[vi][1 - ax] - wl) + 1
                (lo, tlo), (hi, thi) = sorted([(a[ax], corner(si)), (b[ax], corner(si + 1))])
                clo, chi = sorted([c[ax], d[ax]])
                if hi <= clo or lo >= chi:
                    continue
                lo = max(clo, lo - off) if tlo else max(clo, lo)
                hi = min(chi, hi + off) if thi else min(chi, hi)
                runs.append((ax, round(wl, 1), lo, hi))
    runs = sorted(set(runs))
    merged_runs = []
    for r in runs:
        if merged_runs and merged_runs[-1][:2] == r[:2] and r[2] <= merged_runs[-1][3] + 1:
            merged_runs[-1] = (*merged_runs[-1][:3], max(merged_runs[-1][3], r[3]))
        else:
            merged_runs.append(r)
    counter = sum((hi - lo) for _, _, lo, hi in merged_runs) * K / 100

    def run_seg(r):
        ax, c, lo, hi = r
        return ((lo, c), (hi, c)) if ax == 0 else ((c, lo), (c, hi))
    # backsplash: the wall part of the counter run (not the window over the sink)
    bs = sum(near_wall_len(*run_seg(r), tol=6) for r in merged_runs)
    # tall units and the fridge against the walls (no skirting behind them either)
    tall_iv = []
    for p in primsA:
        if p["l"] not in ("furn", "sanit") or p["t"] not in ("pl", "pg"):
            continue
        x0, y0, x1, y1 = bbox_of(pts_of(p))
        w, h = (x1 - x0) * K / 100, (y1 - y0) * K / 100
        if not (0.5 <= w <= 1.3 and 0.5 <= h <= 0.8) or not kp.buffer(2).contains(box(x0, y0, x1, y1)):
            continue
        if kp.exterior.distance(LineString([(x0, y0), (x1, y0)])) < 3:
            tall_iv.append((x0, x1))
    tall_iv.sort()
    tall, cur = 0.0, None
    for a, b in tall_iv + [(1e9, 1e9)]:
        if cur and a <= cur[1] + 1:
            cur = (cur[0], max(cur[1], b))
            continue
        if cur:
            tall += (cur[1] - cur[0]) * K / 100
        cur = (a, b)
    rooms[kitchen]["cab"] = round(counter + tall, 2)
    rooms[kitchen]["bs"] = round(bs, 2)
    if os.environ.get("BOQ_DEBUG"):     # visual check of the boundary classification (not part of the output)
        S = 2.0
        img = np.full((int((ARCH_BOX[3] - ARCH_BOX[1]) * S), int((ARCH_BOX[2] - ARCH_BOX[0]) * S), 3), 255, np.uint8)
        T = lambda x, y: (int((x - ARCH_BOX[0]) * S), int((y - ARCH_BOX[1]) * S))  # noqa: E731
        for p in primsA:
            if p["l"] in ("beton50", "block50", "wall", "wall in", "door", "win", "sanit"):
                q = np.array([T(x, y) for x, y in pts_of(p)], np.int32)
                cv2.polylines(img, [q], p["t"] == "pg", (190, 190, 190), 1)
        for rm in rooms:
            cv2.polylines(img, [np.array([T(x, y) for x, y in rm["poly"].exterior.coords], np.int32)], True, (0, 160, 0), 1)
        for x, y, c in dbg:
            cv2.circle(img, T(x, y), 2, (0, 0, 255) if c == 1 else (255, 0, 0), -1)
        for j, a in enumerate(arcs):
            ce = closed_end(j)
            cv2.line(img, T(a[0], a[1]), T(*ce), (0, 140, 255), 2)
            cv2.putText(img, str(j), T(a[0], a[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
        for r in merged_runs:
            a, b = run_seg(r)
            cv2.line(img, T(*a), T(*b), (200, 0, 200), 3)
        cv2.imwrite(str(Path(os.environ["BOQ_DEBUG"]) / "boq_debug.png"), img)
    data["counter"] = [[int(v * U) for v in (*run_seg(r)[0], *run_seg(r)[1])] for r in merged_runs]
    print(f"kitchen: counter run {counter:.2f} m (backsplash {bs:.2f} m), tall units / fridge {tall:.2f} m")

    for i, rm in enumerate(rooms):
        rp = rm["poly"]
        lp = rm["c"] if rp.contains(Point(*rm["c"])) else (rp.representative_point().x, rp.representative_point().y)
        data["rooms"].append({
            "n": rm["n"], "k": rm["k"], "a": rm["a"], "p": round(rp.length * K / 100, 2), "wall": round(rm["wall"], 2),
            "open": round(rm["open"], 2), "gaps": rm.get("gaps", []), "cab": rm.get("cab", 0), "bs": rm.get("bs", 0),
            "shw": rm.get("shw", 0), "c": [int(lp[0] * U), int(lp[1] * U)], "d": poly_d(list(rp.exterior.coords)[:-1], 0.2),
        })
        print(f"  {rm['n']:16s} {rm['k']:8s} a={rm['a']:5.1f} p={rp.length * K / 100:6.2f} wall={rm['wall']:6.2f} "
              f"open={rm['open']:5.2f} gaps={[(openings[j]['t'], l) for j, l in rm.get('gaps', [])]}")
    data["open"] = [{"t": o["t"], "w": o["w"], "rm": sorted(o["rooms"]), "sh": o.get("sh", ""),
                     "arcs": o.get("arcs", []),
                     "b": [int(v * U) for v in (o["geom"].bounds[0], o["geom"].bounds[1], o["geom"].bounds[2] - o["geom"].bounds[0],
                                                 o["geom"].bounds[3] - o["geom"].bounds[1])]} for o in openings]
    data["walls"] = [{k: v for k, v in w.items() if k != "_mask"} for w in walls]
    for w in walls:
        print("wall", w["k"], w["t"], w["n"], w["len"], "m, hatch", w["tm"], "cm, doors", w["doors"])

    # ---- sheets
    meta = {"A": {"code": "A-101"}, "E": {"code": "E-101"}, "L": {"code": "E-102"}, "P": {"code": "P-101"}}
    for key in ("A", "E", "L", "P"):
        sid = SID[key]
        sh = load(src, sid, "sheet")
        entry = {**meta[key], "scale": sh["scale"]["ratio"], "nLayers": len(sh["layers"]), "nPrims": sh["stats"]["n_prims"]}
        if key == "A":
            entry["layers"] = arch
            entry["vb"] = [int(ARCH_BOX[0] * U), int(ARCH_BOX[1] * U), int((ARCH_BOX[2] - ARCH_BOX[0]) * U), int((ARCH_BOX[3] - ARCH_BOX[1]) * U)]
        else:
            g = gL if key == "L" else gE if key == "E" else load(src, sid, "geometry")
            pb = sh["plan_bbox"]
            skips = DISC_SKIP.get(key, [])

            def keep_disc(p, pts, skips=skips):
                x0, y0, x1, y1 = bbox_of(pts)
                return not any(b[0] <= x0 and x1 <= b[2] and b[1] <= y0 and y1 <= b[3] for b in skips)
            paths, n = layer_paths(g["prims"], set(DISC_LAYERS[key]), pb, 0.15, keep=keep_disc)
            print(f"{key} overlay: {n} prims, {sum(map(len, paths.values()))} chars")
            entry["disc"] = paths
            entry["off"] = [int(OFF[key][0] * U), int(OFF[key][1] * U)]
            bx = [BASE_BOX[0] + OFF[key][0], BASE_BOX[1] + OFF[key][1], BASE_BOX[2] + OFF[key][0], BASE_BOX[3] + OFF[key][1]]
            entry["vb"] = [int(bx[0] * U) - 300, int(bx[1] * U) - 300, int((bx[2] - bx[0]) * U) + 600, int((bx[3] - bx[1]) * U) + 600]
            if key == "P":
                inst = load(src, sid, "instances")["instances"]
                # sanitary symbols of the background: A02 = wall-hung bowl, A01 = the concealed cistern frame
                data["inst"]["P"] = {}
                for code in ("A02", "A01"):
                    rows = [i["bbox"] for i in inst if i["legend_code"] == code]
                    data["inst"]["P"][code] = [[int(b[0] * U), int(b[1] * U), int((b[2] - b[0]) * U), int((b[3] - b[1]) * U)] for b in rows]
                    data["sym"][f"P:{code}"] = preview(g["prims"], {"Project3|P-SANR-FIXT", "Project3|sanitery", "sanitery"}, rows[0])
                # the label boxes, typed from the transcription
                labels = [i["bbox"] for i in inst if i["legend_code"] == "P00"]
                assert len(labels) == len(PL_LABELS), len(labels)
                firsts = {}
                for b in labels:
                    t = PL_LABELS[(round(b[0]), round(b[1]))]
                    data["pl"].append([t, int(b[0] * U), int(b[1] * U), int((b[2] - b[0]) * U), int((b[3] - b[1]) * U)])
                    firsts.setdefault(t, b)
                for t, b in firsts.items():
                    data["sym"][f"PL:{t}"] = preview(g["prims"], set(DISC_LAYERS["P"]), b, pad_k=0.06)
                print("plumbing labels", Counter(r[0] for r in data["pl"]))
        data["sheets"][key] = entry

    # room labels on the interior sheets (lighting-sheet coords): the same names as the rooms
    for r in ED["rooms"]:
        xE, yE = r["c"][0] / K + E_ORIGIN[0], r["c"][1] / K + E_ORIGIN[1]
        data["labels"].append([int((xE - OFF["E"][0]) * U), int((yE - OFF["E"][1]) * U), r["n"]])

    # ---- electrical
    data["el"] = electrical(ED)
    data["plTypes"] = {k: list(v) for k, v in PL_TYPES.items()}
    # the area written next to the ממ"ד name on the plumbing sheet (a cross-check of the measured room)
    tP = load(src, SID["P"], "geometry")["texts"]
    names = [t for t in tP if t["s"].startswith("ממ")]
    areas = [t for t in tP if re.fullmatch(r"\d+(\.\d+)? m²", t["s"])]
    lab = min(((math.dist(a["b"][:2], n["b"][:2]), a) for a in areas for n in names), key=lambda x: x[0], default=None)
    data["mamadLabel"] = float(lab[1]["s"].split()[0]) if lab and lab[0] < 40 else None
    print("ממ\"ד area label on the plumbing sheet:", data["mamadLabel"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(txt, encoding="utf-8")
    print(f"wrote {OUT} ({len(txt.encode('utf-8')) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
