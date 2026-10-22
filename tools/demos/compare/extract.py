"""Extract the data for the /catalog/compare/ demo (SuperPosition) from a real comparison.

Reads (read-only) one SuperPosition comparison: architecture plan A and the HVAC plan B already aligned onto A,
the comparison's per-pixel class masks, the annotation mask and the AI answers. Writes, into catalog/compare/:

  data.bin   polylines as zigzag varints, in 1/Q pt, relative to the crop origin (see `pack` / `unpack`)
  data.json  batches (offsets into data.bin), crop, registration, line stats, B's reading, the coordination log

Every stroke is split by the comparison's classes, exactly like the product's viewer does on the GPU: common (the
other drawing has ink within the tolerance) or only-in-this-drawing. Batches: side a|b, kind s(troke)|f(ill),
cls c|o, tone (strong / light ink, dark / light fill), grp own|bg (B: the office's HVAC layers vs the
architectural background it carries, by the layer list the product's AI reported).

Anonymization: the crop drops the title block, the sheet frame and the stamp; every stroke that the comparison
marks as annotation (texts, SHX text drawn as line work, dimensions, leaders) is dropped from both drawings, the
B layers that hold text / dimensions / hatches are dropped by name, and light hatch lines inside large area fills
are dropped. Only filtered, simplified vectors land in the repo.

The region list is the reviewed coordination log in findings.py (each entry names the product's source region),
with its line statistics recomputed here from the classified strokes inside the entry's box.

    python tools/demos/compare/extract.py [--preview out.png]     # then: python tools/demos/compare/thumb.py
    python tools/demos/compare/extract.py --regions-only          # only rebuild the regions from findings.py
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import math
import pathlib
import re
import sys

import numpy as np
import pymupdf
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

SRC = pathlib.Path(r"C:\Users\noad\Desktop\Projects\superposition\data")
A_PDF = SRC / r"docs\d85293cff42\sheets\p1\page.pdf"                  # architecture, basement commercial floor
B_SRC = SRC / r"docs\d96db2ae983\sheets\p1\page.pdf"                  # HVAC, same floor (as received)
CMP_DIR = SRC / r"compare\cd46d3535f2"
B_PDF = CMP_DIR / "b_aligned_1789468536285.pdf"                       # B after registration, in A's frame
MASKS = CMP_DIR / "masks_1789468550934.png"                           # bits: 1 near A, 2 near B, 4/8 fill, 16/32 only zone
ANNO = SRC / r"compare\c3adb33feb2\anno_1789455640313.png"            # same pair and frame; holds A's SHX texts too

OUT = pathlib.Path(__file__).resolve().parents[3] / "catalog" / "compare"

CROP = (1120.0, 640.0, 6980.0, 2560.0)   # x0, y0, x1, y1 in A points (y down): the plan area with all 15 regions
Q = 2                                     # coordinates stored in 1/2 pt
SAMPLE = 0.8                              # classification step along a stroke, pt
# A's column grid: x of the axis bubbles 1..16 along the bottom of the plan (crop-local pt, read from A's texts)
AXES = [106, 434, 1006, 1188, 1518, 1982, 2310, 2884, 3065, 3394, 3858, 4188, 4772, 4941, 5270, 5636]

# B layers that are text / dimensions / title block (the comparison hides the same ones with the text slider)
B_DROP = re.compile(r"(text|txt|dim|koteret|kotret|gova|flechas|symb-arrow|symb-simunim|shipua nr|nik-park-t|"
                    r"maim-txt|a-text|av-text|textcot|t200|elev|hatch)", re.I)


def lum_sat(c):
    if not c:
        return 1.0, 0.0
    r, g, b = c[:3]
    return 0.299 * r + 0.587 * g + 0.114 * b, max(r, g, b) - min(r, g, b)


def bez(p0, p1, p2, p3):
    L = abs(p1 - p0) + abs(p2 - p1) + abs(p3 - p2)
    n = max(2, min(16, int(math.ceil(L / 3.0))))
    out = []
    for i in range(1, n + 1):
        t = i / n
        mt = 1 - t
        out.append(p0 * mt ** 3 + 3 * p1 * mt * mt * t + 3 * p2 * mt * t * t + p3 * t ** 3)
    return out


def polylines(path):
    """Path items -> list of point lists (complex numbers), closed sub-paths repeat the first point."""
    lines, cur = [], None

    def start(p):
        nonlocal cur
        if cur is None or abs(cur[-1] - p) > 1e-3:
            if cur and len(cur) > 1:
                lines.append(cur)
            cur = [p]

    for it in path["items"]:
        op = it[0]
        if op == "l":
            a, b = complex(it[1].x, it[1].y), complex(it[2].x, it[2].y)
            start(a)
            cur.append(b)
        elif op == "c":
            p = [complex(q.x, q.y) for q in it[1:5]]
            start(p[0])
            cur.extend(bez(*p))
        elif op == "qu":
            q = it[1]
            pts = [complex(q.ul.x, q.ul.y), complex(q.ur.x, q.ur.y), complex(q.lr.x, q.lr.y), complex(q.ll.x, q.ll.y)]
            if cur and len(cur) > 1:
                lines.append(cur)
            lines.append(pts + [pts[0]])
            cur = None
        elif op == "re":
            r = it[1]
            pts = [complex(r.x0, r.y0), complex(r.x1, r.y0), complex(r.x1, r.y1), complex(r.x0, r.y1)]
            if cur and len(cur) > 1:
                lines.append(cur)
            lines.append(pts + [pts[0]])
            cur = None
    if cur and len(cur) > 1:
        lines.append(cur)
    if path.get("closePath") and lines and abs(lines[-1][0] - lines[-1][-1]) > 1e-3:
        lines[-1].append(lines[-1][0])
    return lines


def clip_seg(a, b, box):
    """Liang-Barsky. Returns (a', b') inside box or None."""
    x0, y0, x1, y1 = box
    dx, dy = b.real - a.real, b.imag - a.imag
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, a.real - x0), (dx, x1 - a.real), (-dy, a.imag - y0), (dy, y1 - a.imag)):
        if p == 0:
            if q < 0:
                return None
        else:
            t = q / p
            if p < 0:
                if t > t1:
                    return None
                t0 = max(t0, t)
            else:
                if t < t0:
                    return None
                t1 = min(t1, t)
    return a + (b - a) * t0, a + (b - a) * t1


class Masks:
    def __init__(self, ppt):
        self.m = np.array(Image.open(MASKS))
        self.a = np.array(Image.open(ANNO))
        self.ppt = ppt
        self.h, self.w = self.m.shape

    def at(self, p):
        x = min(self.w - 1, max(0, int(p.real * self.ppt)))
        y = min(self.h - 1, max(0, int(p.imag * self.ppt)))
        return int(self.m[y, x]), int(self.a[y, x])


def classify_stroke(pl, side, M, tone="s"):
    """Split one polyline into pieces of one class: 'c' common, 'o' only in this drawing, None = dropped
    (annotation, or a light hatch line inside a large area fill: paving / asphalt patterns)."""
    near_o = 2 if side == "a" else 1
    anno_s = 1 if side == "a" else 2
    anno_o = 2 if side == "a" else 1
    big_s = 64 if side == "a" else 128

    fill_s = 4 if side == "a" else 8
    fill_o = 8 if side == "a" else 4

    def cls(p):
        # the product's rule (frontend/viewer.js): a line inside its own drawing's fill (poche, hatched wall) is
        # common where the other drawing has a fill there too or ink close by; any other line where the other
        # drawing has ink within the tolerance. Closeness to the other drawing's texts does not count.
        f, an = M.at(p)
        if an & anno_s:
            return None
        if tone == "l" and f & big_s:
            return None
        near = bool(f & near_o) and not (an & anno_o)
        if f & fill_s:
            return "c" if (f & fill_o) or near else "o"
        return "c" if near else "o"

    pieces, cur, cur_c, cur_seg = [], None, "?", None
    for i in range(len(pl) - 1):
        a, b = pl[i], pl[i + 1]
        n = max(1, int(abs(b - a) / SAMPLE))
        for k in range(n):
            p0, p1 = a + (b - a) * (k / n), a + (b - a) * ((k + 1) / n)
            c = cls((p0 + p1) / 2)
            if c != cur_c:   # class changes: close the piece, start a new one at this sample
                if cur is not None and cur_c is not None and len(cur) > 1:
                    pieces.append((cur_c, cur))
                cur, cur_c, cur_seg = [p0], c, None
            if cur_seg == i and len(cur) > 1:
                cur[-1] = p1     # still on the same straight segment: move its end
            else:
                cur.append(p1)
            cur_seg = i
    if cur is not None and cur_c is not None and len(cur) > 1:
        pieces.append((cur_c, cur))
    return pieces


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    L = abs(ab)
    dmax, idx = -1.0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs(p - a) if L < 1e-9 else abs(((p - a) * ab.conjugate()).imag) / L
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[: idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [a, b]


def quant(pts):
    x0, y0 = CROP[0], CROP[1]
    out = []
    for p in pts:
        q = (int(round((p.real - x0) * Q)), int(round((p.imag - y0) * Q)))
        if not out or q != out[-1]:
            out.append(q)
    return out


def own_layer(name, own_patterns):
    """B's own (HVAC) line work vs the architectural background it carries. The patterns are the ones the
    product's AI reported for this drawing, plus the office's piping layer."""
    return any(fnmatch.fnmatchcase(name, p) for p in own_patterns) or name.upper().startswith("MIZ") or name == "ZANERET"


def extract(pdf, side, M, b_layers=False, own_patterns=()):
    page = pymupdf.open(str(pdf))[0]
    batches = {}   # key -> list of int point lists
    stats = {"paths": 0, "dropped_layer": 0, "dropped_anno": 0}
    for path in page.get_drawings():
        stats["paths"] += 1
        if b_layers and B_DROP.search(path.get("layer") or ""):
            stats["dropped_layer"] += 1
            continue
        grp = "own" if not b_layers or own_layer(path.get("layer") or "", own_patterns) else "bg"
        r = path["rect"]
        if r.x1 < CROP[0] or r.x0 > CROP[2] or r.y1 < CROP[1] or r.y0 > CROP[3]:
            continue
        lines = polylines(path)
        typ = path["type"]
        # fills: polygons fully inside the crop, classified by a few interior-ish samples
        if "f" in typ and path.get("fill"):
            lum, sat = lum_sat(path["fill"])
            area = r.width * r.height
            if area >= 6 and r.x0 >= CROP[0] and r.x1 <= CROP[2] and r.y0 >= CROP[1] and r.y1 <= CROP[3]:
                samples = [complex((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)] + [p for l in lines for p in l[:: max(1, len(l) // 4)]]
                fo = 8 if side == "a" else 4
                no = 2 if side == "a" else 1
                ans = 1 if side == "a" else 2
                big = 64 if side == "a" else 128
                votes = {"c": 0, "o": 0, None: 0}
                for p in samples:
                    f, an = M.at(p)
                    # a large area fill (paving, asphalt) is common only where the other drawing has a fill too
                    votes[None if an & ans else ("c" if (f & fo) or ((f & no) and not (f & big)) else "o")] += 1
                c = max(votes, key=votes.get)
                if c is not None:
                    tone = "d" if lum < 0.35 else "l"
                    for l in lines:
                        q = quant(rdp(l, 0.25))
                        if len(q) >= 3:
                            batches.setdefault(("f", c, tone, grp), []).append(q)
            if typ == "f":
                continue
        lum, sat = lum_sat(path.get("color"))
        tone = "s" if (lum < 0.42 or sat > 0.25) else "l"
        for l in lines:
            # clip every segment to the crop, keep runs that stay inside
            run = []
            for i in range(len(l) - 1):
                c = clip_seg(l[i], l[i + 1], CROP)
                if c is None:
                    if len(run) > 1:
                        for cc, piece in classify_stroke(run, side, M, tone):
                            q = quant(rdp(piece, 0.25))
                            if len(q) > 1:
                                batches.setdefault(("s", cc, tone, grp), []).append(q)
                    run = []
                    continue
                a, b = c
                if run and abs(run[-1] - a) < 1e-6:
                    run.append(b)
                else:
                    if len(run) > 1:
                        for cc, piece in classify_stroke(run, side, M, tone):
                            q = quant(rdp(piece, 0.25))
                            if len(q) > 1:
                                batches.setdefault(("s", cc, tone, grp), []).append(q)
                    run = [a, b]
            if len(run) > 1:
                pcs = classify_stroke(run, side, M, tone)
                if not pcs:
                    stats["dropped_anno"] += 1
                for cc, piece in pcs:
                    q = quant(rdp(piece, 0.25))
                    if len(q) > 1:
                        batches.setdefault(("s", cc, tone, grp), []).append(q)
    return batches, stats


def drop_tiny(lines, min_len):
    out = []
    for q in lines:
        L = sum(math.hypot(q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1]) for i in range(len(q) - 1))
        if L >= min_len:
            out.append(q)
    return out


def varint(out, v):
    v = (v << 1) ^ (v >> 31)          # zigzag
    while v >= 0x80:
        out.append((v & 0x7F) | 0x80)
        v >>= 7
    out.append(v)


def pack(lines):
    """Per polyline: n, start (relative to the previous polyline's end), then n-1 (dx, dy); every number a zigzag
    varint (1-3 bytes). Polylines are ordered along serpentine rows of 64 pt so the start deltas stay small."""
    cell = 64 * Q

    def key(q):
        r = q[0][1] // cell
        c = q[0][0] // cell
        return (r, c if r % 2 == 0 else -c)

    out = bytearray()
    px = py = 0
    for q in sorted(lines, key=key):
        varint(out, len(q))
        for x, y in q:
            varint(out, x - px)
            varint(out, y - py)
            px, py = x, y
    return np.frombuffer(bytes(out), dtype=np.uint8)


def unpack(buf):
    """Inverse of `pack`: yields point lists (ints, 1/Q pt)."""
    i, n = 0, len(buf)

    def rd():
        nonlocal i
        v = sh = 0
        while True:
            b = buf[i]; i += 1
            v |= (b & 0x7F) << sh
            sh += 7
            if b < 0x80:
                return (v >> 1) ^ -(v & 1)

    x = y = 0
    while i < n:
        k = rd(); x += rd(); y += rd(); pts = [(x, y)]
        for _ in range(k - 1):
            x += rd(); y += rd(); pts.append((x, y))
        yield pts


def box_lengths(out, raw, box):
    """Length (pt) of A-only, B-only and common line work inside box = (x0, y0, x1, y1), crop-local pt: the same
    classified strokes the demo paints, so the region's percentages match what the visitor sees."""
    x0, y0, x1, y1 = box
    acc = {"a_only": 0.0, "b_only": 0.0, "common": 0.0}
    for bt in out["batches"]:
        if bt["kind"] != "s":
            continue
        key = "common" if bt["cls"] == "c" else ("a_only" if bt["side"] == "a" else "b_only")
        w = 0.5 if bt["cls"] == "c" else 1.0     # common ink is drawn in both: count it once (half from each side)
        for pts in unpack(raw[bt["off"]: bt["off"] + bt["len"]]):
            for i in range(len(pts) - 1):
                a = complex(pts[i][0] / Q, pts[i][1] / Q)
                b = complex(pts[i + 1][0] / Q, pts[i + 1][1] / Q)
                if max(a.real, b.real) < x0 or min(a.real, b.real) > x1 or max(a.imag, b.imag) < y0 or min(a.imag, b.imag) > y1:
                    continue
                c = clip_seg(a, b, box)
                if c:
                    acc[key] += abs(c[1] - c[0]) * w
    return {k: int(round(v)) for k, v in acc.items()}


def axes_of(x0, x1, tol=12):
    """Where a box sits on A's column grid, the way a coordination log writes it: "ציר 7" (the box straddles
    one axis), "צירים 6–7" (several), "בין צירים 2–3" (between two)."""
    inside = [i + 1 for i, a in enumerate(AXES) if x0 + tol < a < x1 - tol]
    if len(inside) == 1:
        return f"ציר {inside[0]}"
    if inside:
        return f"צירים {inside[0]}–{inside[-1]}"
    left = max([i + 1 for i, a in enumerate(AXES) if a <= x0 + tol] or [1])
    return f"בין צירים {left}–{min(left + 1, len(AXES))}"


def build_regions(out, raw):
    """The reviewed coordination log (findings.py) as the demo's region list."""
    sys.path.insert(0, str(pathlib.Path(__file__).parent))
    from findings import FINDINGS
    regs = []
    for i, f in enumerate(FINDINGS):
        x0, y0, x1, y1 = f["box"]
        L = box_lengths(out, raw, f["box"])
        na, nb = L["a_only"], L["b_only"]
        kind = "only_a" if nb < 0.15 * na else ("only_b" if na < 0.15 * nb else "changed")
        regs.append({
            "id": f"f{i + 1}", "src": f["src"], "kind": kind,
            "bbox": [float(x0), float(y0), float(x1 - x0), float(y1 - y0)], **L, "ax": axes_of(x0, x1),
            "sev": f["sev"], "type": f["type"], "disc": f["disc"], "cause": f.get("cause", ""), "loc": f["loc"],
            "title": f["title"], "summary": f["summary"], "action": f["action"],
        })
    return regs


def render(out, data, path, sc=0.6, view=None, filt=None):
    """Preview PNG: A-only red, B-only blue, common grey, region frames orange. view = (x0, y0, x1, y1) crop-local pt."""
    vx0, vy0, vx1, vy1 = view or (0, 0, CROP[2] - CROP[0], CROP[3] - CROP[1])
    W, H = int((vx1 - vx0) * sc), int((vy1 - vy0) * sc)
    im = Image.new("RGB", (W, H), (17, 21, 25))
    dw = ImageDraw.Draw(im, "RGBA")
    col = {("a", "o"): (255, 80, 80), ("b", "o"): (80, 140, 255), ("a", "c"): (200, 205, 210), ("b", "c"): (200, 205, 210)}
    raw = data.tobytes()
    for bt in out["batches"]:
        if filt and not filt(bt):
            continue
        c = col[(bt["side"], bt["cls"])]
        alpha = 255 if bt["tone"] in ("s", "d") else 120
        if bt["kind"] == "f":
            alpha = 70 if bt["tone"] == "d" else 25
        for pts in unpack(raw[bt["off"]: bt["off"] + bt["len"]]):
            p = [((px / Q - vx0) * sc, (py / Q - vy0) * sc) for px, py in pts]
            if bt["kind"] == "f":
                dw.polygon(p, fill=c + (alpha,))
            else:
                dw.line(p, fill=c + (alpha,), width=1)
    for r in out["regions"]:
        x, y, w, h = r["bbox"]
        dw.rectangle([(x - vx0) * sc, (y - vy0) * sc, (x + w - vx0) * sc, (y + h - vy0) * sc], outline=(255, 152, 0, 255), width=2)
    im.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview")
    ap.add_argument("--regions-only", action="store_true", help="keep data.bin and the batches, rebuild the region list")
    args = ap.parse_args()

    if args.regions_only:
        out = json.loads((OUT / "data.json").read_text(encoding="utf-8"))
        raw = (OUT / "data.bin").read_bytes()
        out["regions"] = build_regions(out, raw)
        (OUT / "data.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("data.json", (OUT / "data.json").stat().st_size, "regions", len(out["regions"]), file=sys.stderr)
        if args.preview:
            render(out, np.frombuffer(raw, dtype=np.uint8), args.preview)
        return

    cmp = json.loads((CMP_DIR / "compare.json").read_text(encoding="utf-8"))
    M = Masks(cmp["diff"]["ppt"])
    ai_b = json.loads((SRC / r"compare\c3adb33feb2\compare.json").read_text(encoding="utf-8"))["ai"]["drawings"]["data"]["b"]
    own_patterns = ai_b["own_layers"]
    out = {"crop": CROP, "q": Q, "batches": []}
    chunks, off = [], 0
    totals = {}
    for side, pdf in (("a", A_PDF), ("b", B_PDF)):
        batches, st = extract(pdf, side, M, b_layers=(side == "b"), own_patterns=own_patterns)
        print(side, st, file=sys.stderr)
        for (kind, c, tone, grp), lines in sorted(batches.items()):
            if kind == "s":
                lines = drop_tiny(lines, 1.5 * Q)
            arr = pack(lines)
            pts = sum(len(q) for q in lines)
            out["batches"].append({"side": side, "kind": kind, "cls": c, "tone": tone, "grp": grp, "off": off, "len": int(arr.size), "lines": len(lines), "pts": pts})
            chunks.append(arr)
            off += arr.size
            totals[(side, kind, c, tone, grp)] = (len(lines), pts)
    for k, v in totals.items():
        print(k, v, file=sys.stderr)
    data = np.concatenate(chunks)

    # registration (B as received -> A), the numbers the product reports
    t = cmp["transform"]
    la = cmp["diff"]["local_align"]
    src_w, src_h = pymupdf.open(str(B_SRC))[0].rect.width, pymupdf.open(str(B_SRC))[0].rect.height
    out["reg"] = {
        "s": round(t["s"], 6), "theta": round(t["theta"], 8), "theta_deg": round(t["theta_deg"], 4),
        "tx": round(t["tx"], 2), "ty": round(t["ty"], 2), "inliers": t["inliers"],
        "matches": int(re.search(r"(\d+)\s*התאמות", t["note"]).group(1)) if re.search(r"(\d+)\s*התאמות", t["note"]) else None,
        "residual_px": round(t["residual_px"], 2), "blocks": la["blocks"], "median_shift_px": la["median_shift_px"],
        "max_shift_px": la["max_shift_px"], "tol_px": cmp["diff"]["tolerance_px"], "ppt": round(cmp["diff"]["ppt"], 4),
        "b_page": [src_w, src_h], "a_page": [cmp["derived"]["b"]["width_pt"], cmp["derived"]["b"]["height_pt"]],
    }
    st = cmp["diff"]["stats"]
    out["stats"] = {"ink_a": st["ink_a"], "ink_b": st["ink_b"], "only_a": st["only_a"], "only_b": st["only_b"], "common": st["common"],
                    "matched_a": cmp["diff"]["matched_a"], "matched_b": cmp["diff"]["matched_b"]}

    # regions: the reviewed coordination log (findings.py; every entry names its source region in cmp["diff"]),
    # line statistics recomputed per box from the strokes above
    src_ids = {r["id"] for r in cmp["diff"]["regions"]}
    out["regions"] = build_regions(out, data.tobytes())
    missing = [r["src"] for r in out["regions"] if r["src"] not in src_ids]
    if missing:
        raise SystemExit(f"findings.py names regions the comparison does not have: {missing}")
    dr = (cmp["ai"].get("drawings") or {}).get("data") or {}
    # A is the architectural sheet; only B's reading is shown (A's discipline guess in this run was wrong)
    b = dr.get("b") or {}
    out["reading_b"] = {"has_background": b.get("has_background"), "how_to_read": b.get("how_to_read")}

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "data.bin").write_bytes(data.tobytes())
    (OUT / "data.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("data.bin", data.nbytes, "data.json", (OUT / "data.json").stat().st_size, file=sys.stderr)

    if args.preview:
        render(out, data, args.preview)


if __name__ == "__main__":
    main()
