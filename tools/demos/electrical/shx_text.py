"""Reader for short SHX vector text in CAD exports (tags such as 4/1, B/8, A/6, x2, h=60).

AutoCAD plots SHX text as polylines: one polyline per character, a single stroke font.  Every
copy of a character is the same polyline up to translation (and a 90 deg rotation for vertical
text), so a character is recognised by comparing its stroke with a few labelled prototype
characters (chamfer distance between points sampled along the strokes).  "x" and "=" are two
short lines each and are paired geometrically; "/" is a single slanted line.  Characters that sit
on one baseline with small gaps form a string.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.spatial import cKDTree

CAP = 5.7          # cap height of the tag font (pt)


def bbox(p: dict) -> list[float]:
    xs, ys = p["p"][0::2], p["p"][1::2]
    return [min(xs), min(ys), max(xs), max(ys)]


def _rot(pts, r: int):
    for _ in range(r):              # 90 deg steps: (x, y) -> (-y, x)
        pts = [(-y, x) for x, y in pts]
    return pts


def _pts(p: dict, r: int = 0):
    return _rot(list(zip(p["p"][0::2], p["p"][1::2])), r)


def _samples(pts, closed: bool, step: float = 0.2) -> np.ndarray:
    x0 = min(x for x, _ in pts)
    y1 = max(y for _, y in pts)
    q = [(x - x0, y - y1) for x, y in pts]
    if closed:
        q.append(q[0])
    out = [q[0]]
    for (ax, ay), (bx, by) in zip(q, q[1:]):
        n = max(1, int(math.hypot(bx - ax, by - ay) / step))
        out += [(ax + (bx - ax) * k / n, ay + (by - ay) * k / n) for k in range(1, n + 1)]
    return np.array(out)


def _chamfer(a: np.ndarray, b: np.ndarray) -> float:
    da, _ = cKDTree(b).query(a)
    db, _ = cKDTree(a).query(b)
    return float(max(da.mean(), db.mean()))


class Reader:
    def __init__(self, protos: list[tuple[str, dict]]):
        """protos: [(char, prim)] labelled prototype characters (upright)."""
        self.protos = [(ch, p["t"] == "pg", _samples(_pts(p), p["t"] == "pg")) for ch, p in protos]

    def _classify(self, p: dict, r: int):
        pts = _pts(p, r)
        xs = [x for x, _ in pts]
        ys = [y for _, y in pts]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        if not (4.8 <= h <= 6.3 and w <= 4.6):
            return None, 9.0
        a = _samples(pts, p["t"] == "pg")
        best, bc = 9.0, None
        for ch, closed, s in self.protos:
            if closed != (p["t"] == "pg"):          # 0 and 8 are closed strokes, 6 / 9 / B open ones
                continue
            v = _chamfer(a, s)
            if v < best:
                best, bc = v, ch
        return bc, best

    def read(self, P: list[dict], idx: list[int], rots=(0, 1, 3)) -> list[dict]:
        """Strings made of the prims `idx`: [{s, b (page bbox), rot, prims}]."""
        out = []
        for r in rots:
            chars = []
            lines = []
            for i in idx:
                p = P[i]
                pts = _pts(p, r)
                xs = [x for x, _ in pts]
                ys = [y for _, y in pts]
                b = [min(xs), min(ys), max(xs), max(ys)]
                w, h = b[2] - b[0], b[3] - b[1]
                if p["t"] == "l":
                    rising = (pts[0][0] - pts[1][0]) * (pts[0][1] - pts[1][1]) < 0
                    if rising and abs(w - 2.9) < 0.35 and abs(h - 8.6) < 0.35:          # "/" of the tall style
                        chars.append(["/", [b[0], b[1] + 1.0, b[2], b[3] - 1.9], [i], 0.0])
                        continue
                    if rising and 1.8 <= w <= 2.5 and 5.3 <= h <= 6.0:                  # "/" at cap height
                        chars.append(["/", b, [i], 0.0])
                        continue
                    lines.append((i, b, pts))
                    continue
                if max(w, h) < 1.3 and p["t"] in ("pl", "pg") and len(p["p"]) >= 8:
                    chars.append([".", b, [i], 0.0])
                    continue
                if p["t"] == "pl" and len(pts) == 3 and 0.9 <= w <= 1.7 and 6.8 <= h <= 8.0:   # Hebrew vav
                    chars.append(["ו", b, [i], 0.0])
                    continue
                c, d = self._classify(p, r)
                if c and d <= 0.35:
                    chars.append([c, b, [i], d])
            # "x": two crossing diagonals with the same box; "=": two short horizontals one above the other
            used = set()
            for a in range(len(lines)):
                ia, ba, pa = lines[a]
                if ia in used:
                    continue
                for c2 in range(a + 1, len(lines)):
                    ib, bb_, pb = lines[c2]
                    if ib in used:
                        continue
                    if all(abs(ba[k] - bb_[k]) < 0.15 for k in range(4)) and 1.4 <= ba[2] - ba[0] <= 2.4 and 3.3 <= ba[3] - ba[1] <= 4.3:
                        chars.append(["x", ba, [ia, ib], 0.0])
                        used |= {ia, ib}
                        break
                    hz, vt = (ba, bb_) if ba[3] - ba[1] < 0.1 else (bb_, ba)
                    if hz[3] - hz[1] < 0.1 and vt[2] - vt[0] < 0.1 and 3.3 <= hz[2] - hz[0] <= 4.5 and 6.8 <= vt[3] - vt[1] <= 8.0 \
                            and abs(vt[1] - hz[1]) < 0.2 and 0.4 <= hz[2] - vt[0] <= 1.3:          # Hebrew dalet
                        chars.append(["ד", [hz[0], hz[1], hz[2], vt[3]], [ia, ib], 0.0])
                        used |= {ia, ib}
                        break
                    if ba[3] - ba[1] < 0.1 and bb_[3] - bb_[1] < 0.1 and abs(ba[0] - bb_[0]) < 0.15 and abs(ba[2] - bb_[2]) < 0.15 \
                            and 2.4 <= ba[2] - ba[0] <= 3.3 and 1.4 <= abs(ba[1] - bb_[1]) <= 2.2:
                        y0, y1 = min(ba[1], bb_[1]), max(ba[1], bb_[1])
                        chars.append(["=", [ba[0], y0, ba[2], y1 + 1.9], [ia, ib], 0.0])   # baseline of "="
                        used |= {ia, ib}
                        break
            order = sorted(range(len(chars)), key=lambda k: chars[k][1][0])
            taken = set()
            for k in order:
                if k in taken or chars[k][0] in ".=":
                    continue
                run = [k]
                taken.add(k)
                while True:
                    last = chars[run[-1]][1]
                    nxt = [j for j in order if j not in taken and abs(chars[j][1][3] - last[3]) < 0.9 and -0.4 <= chars[j][1][0] - last[2] <= 2.3]
                    if not nxt:
                        break
                    j = min(nxt, key=lambda j: chars[j][1][0])
                    run.append(j)
                    taken.add(j)
                s = "".join(chars[j][0] for j in run)
                if any("א" <= ch <= "ת" for ch in s):
                    s = s[::-1]                                  # Hebrew reads right to left
                if len(s) < 2:
                    continue
                x0 = min(chars[j][1][0] for j in run)
                x1 = max(chars[j][1][2] for j in run)
                y0 = min(chars[j][1][1] for j in run)
                y1 = max(chars[j][1][3] for j in run)
                corners = _rot([(x0, y0), (x1, y1)], (4 - r) % 4)
                pb = [min(c[0] for c in corners), min(c[1] for c in corners), max(c[0] for c in corners), max(c[1] for c in corners)]
                out.append({"s": s, "b": pb, "rot": r, "prims": [i for j in run for i in chars[j][2]],
                            "err": max(chars[j][3] for j in run)})
        # one prim, one reading: prefer longer strings, then the better fit
        out.sort(key=lambda t: (-len(t["s"]), t["err"]))
        seen: set[int] = set()
        keep = []
        for t in out:
            if seen & set(t["prims"]):
                continue
            seen |= set(t["prims"])
            keep.append(t)
        return keep
