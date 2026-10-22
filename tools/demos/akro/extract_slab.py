"""Extract the roof slab used by the /catalog/akro/ demo.

Source (read-only, never copied into the repo): a 1:50 structural roof-slab plan of a private
house (PDF, one sheet). Only filtered vector geometry leaves this script:

  * zones   - the three slab bays the towers stand under (inner faces of the walls), each with the
              slab-top level and thickness read from the plan's own "o.k / d" labels. Each bay is a
              ROOM in the plugin's sense (one zone, one continuous grid); C is the safe room (ממ"ד),
              whose slab the sheet refers to its own drawing.
  * walls   - the concrete walls of the storey below (grey fills on the sheet)
  * windows - openings in those walls (white fills sitting on a wall, up to 4 m wide)
  * hid     - hidden (dashed) beam outlines inside the slab, for drawing only
  * sbeams  - the slab's beams as rectangles with their section and top/bottom levels, traced from
              the dashed outlines and the "b-n  w/h  o.k / u.k" tags on the sheet

Dropped: title block, revision table, notes, every other text string, dimension chains, the steel
pergola areas (no concrete slab there) and the 3D view. Coordinates are converted to centimetres
(1 pt = 50 * 2.54 / 72 cm), origin at the slab's top-left corner, sheet orientation kept.

usage: python tools/demos/akro/extract_slab.py <path-to-source.pdf> [out.json]
"""
import json
import sys
from pathlib import Path

import pymupdf as fitz
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import polygonize, unary_union

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else None
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[3] / "catalog" / "akro" / "data.json"
if not SRC or not SRC.exists():
    sys.exit("pass the source PDF path")

K = 50 * 2.54 / 72          # cm per PDF point at 1:50 (checked against the sheet's dimension chains)
CLIP = (450, 1200, 1900, 2450)  # the plan only: excludes title block, notes and the 3D view

# label anchor points of the three slab bays (PDF coords of their "o.k / d" tags, not exported)
ZONE_TAGS = [
    ("A", (855, 1825), 335, 20),   # slab top +3.35, d=20
    ("B", (1405, 1820), 305, 25),  # slab top +3.05, d=25
    ("C", (1246, 2117), 305, 25),  # safe room (ממ"ד), +3.05, d=25, "see the safe-room drawing"
]

# The slab's beams (output frame, cm): rectangles traced from the dashed outlines and the walls
# under them; section (width/depth) and levels as tagged on the sheet ("b-1 40/80 o.k=+3.60
# u.k=+2.80" ...). Every bottom level equals one of the two slab soffits (+2.80 / +3.15): no
# beam drops below a soffit. b-5 is the step between the two levels.
SLAB_BEAMS = [
    ("b-1", 40, 80, 360, 280, [[1009.2, 376.3, 1049.3, 644.3]]),
    ("b-2", 45, 95, 410, 315, [[199.8, 148.2, 430.1, 193.2], [430.1, 178.2, 599.0, 193.2]]),
    ("b-3", 40, 95, 410, 315, [[199.8, 193.2, 239.7, 638.2]]),
    ("b-4", 40, 95, 410, 315, [[0.0, 598.2, 199.8, 638.2]]),
    ("b-5", 20, 55, 335, 280, [[649.0, 629.5, 669.2, 924.6]]),
]

page = fitz.open(SRC)[0]
X0, Y0, X1, Y1 = CLIP


def in_clip(r):
    return r.x1 >= X0 and r.x0 <= X1 and r.y1 >= Y0 and r.y0 <= Y1


wall_lines, dashes, grey, white = [], [], [], []
for d in page.get_drawings():
    r = d["rect"]
    if not in_clip(r):
        continue
    w = round(d.get("width") or 0, 2)
    if d["type"] == "s":
        for it in d["items"]:
            if it[0] != "l":
                continue
            a, b = it[1], it[2]
            if a.distance_to(b) < 0.01:
                continue
            seg = LineString([(a.x, a.y), (b.x, b.y)])
            if w == 1.2:
                wall_lines.append(seg)
            elif w == 0.48:
                dashes.append(seg)
    elif d["type"] == "f":
        f = tuple(round(c, 2) for c in d["fill"] or ())
        for it in d["items"]:
            if it[0] == "re":
                rr = it[1]
                g = box(rr.x0, rr.y0, rr.x1, rr.y1)
                if f == (0.75, 0.75, 0.75):
                    grey.append(g)
                elif f == (1.0, 1.0, 1.0):
                    white.append(g)

# zones = faces of the wall outlines that carry a slab tag
faces = list(polygonize(unary_union(wall_lines)))
zones = []
for zid, (tx, ty), top, d in ZONE_TAGS:
    f = next(f for f in faces if f.contains(Point(tx, ty)))
    zones.append((zid, f.simplify(0.4), top, d))

walls = unary_union(grey)
slab = unary_union([z[1] for z in zones] + [walls]).buffer(0.3, join_style="mitre").buffer(-0.3, join_style="mitre").simplify(0.3)
slab_outer = Polygon(slab.exterior if slab.geom_type == "Polygon" else max(slab.geoms, key=lambda g: g.area).exterior)

# windows: white fills lying on a wall (up to 4 m: the 3.2 m opening under b-3 counts too)
windows = []
for g in white:
    minx, miny, maxx, maxy = g.bounds
    if max(maxx - minx, maxy - miny) > 400 / K or min(maxx - minx, maxy - miny) < 4:
        continue
    if g.intersection(walls).area > 0.6 * g.area and min(maxx - minx, maxy - miny) * K >= 12:
        windows.append(g)   # thinner than any wall = a recess (the safe-room shutter pocket), not an opening
# a frame drawn inside its opening (the safe-room door leaf) is the same opening
windows = [g for g in windows if not any(o is not g and o.buffer(0.01).contains(g) for o in windows)]

# hidden downstand beams: dashed segments inside the slab, merged per line
inner = slab_outer.buffer(1.0)
dash_in = [s for s in dashes if inner.contains(s) and s.length < 12]
groups = {}
for s in dash_in:
    (ax, ay), (bx, by) = s.coords
    if abs(ax - bx) < 0.3:
        key = ("v", round((ax + bx) / 2 * 2) / 2)
        groups.setdefault(key, []).append((min(ay, by), max(ay, by)))
    elif abs(ay - by) < 0.3:
        key = ("h", round((ay + by) / 2 * 2) / 2)
        groups.setdefault(key, []).append((min(ax, bx), max(ax, bx)))
beam_lines = []
for (o, c), iv in groups.items():
    iv.sort()
    runs = [[*iv[0]]]
    for a, b in iv[1:]:
        if a - runs[-1][1] < 9:
            runs[-1][1] = max(runs[-1][1], b)
        else:
            runs.append([a, b])
    for a, b in runs:
        if b - a < 25:
            continue
        beam_lines.append(((c, a), (c, b)) if o == "v" else ((a, c), (b, c)))

ox, oy = slab_outer.bounds[0], slab_outer.bounds[1]


def P(x, y):
    return [round((x - ox) * K, 1), round((y - oy) * K, 1)]


def ring(coords):
    pts = [P(x, y) for x, y in list(coords)[:-1]]
    return pts


def poly_rings(g):
    gs = [g] if g.geom_type == "Polygon" else list(g.geoms)
    out = []
    for p in gs:
        out.append([ring(p.exterior.coords)] + [ring(i.coords) for i in p.interiors])
    return out


data = {
    "about": "Roof slab of a private house, 1:50. Filtered vector geometry only; units cm, y down.",
    "size": [round((slab_outer.bounds[2] - ox) * K, 1), round((slab_outer.bounds[3] - oy) * K, 1)],
    "slab": ring(slab_outer.exterior.coords),
    "walls": poly_rings(walls.simplify(0.2)),
    "windows": [[*P(g.bounds[0], g.bounds[1]), round((g.bounds[2] - g.bounds[0]) * K, 1), round((g.bounds[3] - g.bounds[1]) * K, 1)] for g in windows],
    "hid": [[P(*a), P(*b)] for a, b in beam_lines],
    "sbeams": [{"id": bid, "w": w, "h": h, "top": top, "bot": bot, "r": rs} for bid, w, h, top, bot, rs in SLAB_BEAMS],
    "zones": [{"id": zid, "top": top, "d": d, "poly": ring(f.exterior.coords), **({"mamad": True} if zid == "C" else {})}
              for zid, f, top, d in zones],
}
# every traced beam lies on the slab, and its bottom sits on one of the bay soffits
slab_poly = Polygon(data["slab"]).buffer(0.5)
soffits = {z["top"] - z["d"] for z in data["zones"]}
for b in data["sbeams"]:
    for r in b["r"]:
        assert slab_poly.contains(box(*r)), b["id"]
    assert b["bot"] in soffits, b["id"]
OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
print(f"wrote {OUT}  ({OUT.stat().st_size} bytes)  zones={[(z['id'], len(z['poly'])) for z in data['zones']]}"
      f" walls={len(data['walls'])} windows={len(windows)} hidden={len(beam_lines)} beams={len(SLAB_BEAMS)} size={data['size']}")
