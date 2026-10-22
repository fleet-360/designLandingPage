"""Build catalog/electrical/data.json from the BOQ engine's parsed sheets of a private house.

Reads (read-only):
  boq/data/projects/p_test1/sheets/<sheet>/{geometry,legend,instances,measurements,sheet}.json
  boq/backend/app/detect/symbols_vector.py  (the engine's vector template matcher, imported)

Two sheets of the same floor: electrical (power/comm) and lighting.  The lighting sheet is shifted on
the page, so it is aligned onto the electrical one.  Output (all in plan centimetres, y down):
  base layers (walls, doors, glazing, furniture, sanitary) as SVG path strings,
  per sheet: the symbol-layer annotation and one glyph path per detected symbol,
  the legend (transcribed descriptions, glyphs from the legend sample geometry),
  detected symbols (exact template matches + "review" items found by similarity),
  the text next to each symbol, read from the SHX strokes (shx_text.py):
    lighting sheet: circuit tags "room/point" (4/1 = room 4, point 1; A/n outdoor; B/n shutters) and
    a few labels ("דוד"); electrical sheet: outlets per box ("x2") and mounting heights ("h=60"),
  repeated shapes that are not in the legend, rooms (closed from walls + a few split lines),
  the designer's notes (grey note boxes, text transcribed in NOTES) with their BOQ effect,
  and `summary`: the final quantities per legend row and per BOQ line (all review items accepted,
  all notes applied) - the numbers other demos should align to.

data.json fields per symbol (`inst`): s sheet (E/L), c legend row (final), x/y/r plan cm, rv review
(1 other scale, 2 similar shape), d/f glyph paths, rm room index (-1 outside), t circuit tag,
tr tag as written when it was not standard ("7.2"), g drawn symbol when the tag says otherwise,
role "of" = the switch of another point (heater), m outlets in the box (x2), h mounting height cm,
len linear fixture length cm, em 1 = marked "חירום".

Switches are reconciled with their tags: a switch tagged B/n is the shutter switch of motor B/n
whatever symbol it was drawn with; a switch that carries the tag of a heater is that heater's switch;
a light circuit (tag) switched from two places needs two-way switches.  The drawing's own symbol is
kept as `g` when it disagrees, so the demo can show the finding.

Anonymization: no title block, frame, legend table area or sheet texts are copied; room names are
generic, legend descriptions are generic; the source file names never reach the output.

Usage:  python tools/demos/electrical/extract.py
"""
from __future__ import annotations

import json
import math
import os
import pickle
import re
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "catalog" / "electrical" / "data.json"
SRC = Path(r"C:\Users\noad\Desktop\Projects\boq\data\projects\p_test1\sheets")
BACKEND = Path(r"C:\Users\noad\Desktop\Projects\boq\backend")
SHEET_E, SHEET_L = "s_b9acf71863", "s_791ba69247"

sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.detect import symbols_vector as sv  # noqa: E402
from app.detect.geom import cluster_prims, prim_bbox  # noqa: E402
from shx_text import Reader  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

# ---------------------------------------------------------------------------------------------
# Legend: descriptions transcribed from the electrical sheet's legend table (vector text there).
# key = row code of the electrical sheet; grp = demo group; cat = BOQ line key (below)
# The engine skipped one row (TV conduit, between the ceiling strip and the light switch); it is
# read here from its cell as L43.  The A/C row has two variants (1 / 3 phase): L32a / L32b.
# ---------------------------------------------------------------------------------------------
GROUPS = [
    ("light", "גופי תאורה"),
    ("switch", "מפסקים ותריסים"),
    ("socket", "שקעים וכוח"),
    ("misc", "נקודות ייעודיות ולוח"),
    ("comm", "תקשורת ומתח נמוך"),
    ("alarm", "מערכת אזעקה"),
]
LEGEND = {
    "L15": ("light", "ג״ת קירי", "light"),
    "L16": ("light", "ג״ת תקרתי תלוי", "light"),
    "L17": ("light", "גוף תקרתי מוגן מים", "light"),
    "L18": ("light", "ג״ת קירי מוגן מים", "light"),
    "L19": ("light", "ג״ת תקרתי שקוע בבטון, קופסת ביטון", "light"),
    "L20": ("light", "ג״ת שקוע בתקרת גבס", "light"),
    "L21": ("light", "ג״ת שקוע בקיר גבס", "light"),
    "L22": ("light", "ג״ת צמוד תקרה לפי מידה", "light"),
    "L23": ("switch", "מפסק מאור", "sw"),
    "L24": ("switch", "מפסק מאור מחליף / מצלב", "sw"),
    "L25": ("switch", "מפסק עם נורית ביקורת", "sw"),
    "L26": ("switch", "מפסק תריס חשמלי", "sw_shutter"),
    "L27": ("switch", "כיבוי תאורה וסגירת תריסים כללית", "master"),
    "L28": ("switch", "מנוע לתריס חשמלי", "shutter"),
    "L29": ("socket", "שקע חשמל תלת־פאזי", "socket_3ph"),
    "L30": ("socket", "שקע חשמל", "socket"),
    "L31": ("socket", "שקע כוח, חיבור ישיר עד הלוח", "socket_power"),
    "L32a": ("socket", "פקט למזגן חד־פאזי", "ac_1ph"),
    "L32b": ("socket", "פקט למזגן תלת־פאזי", "ac_3ph"),
    "L33": ("socket", "שקע מוגן מים", "socket_wp"),
    "L10": ("misc", "שעון דוד מים חשמלי עם נורית סימון", "boiler"),
    "L12": ("misc", "הכנה לתנור חימום בגובה 230 ס״מ, כולל מפסק", "heater"),
    "L13": ("misc", "ונטה (מאוורר תקרה)", "fan"),
    "L11": ("misc", "שעון שבת", "shabbat"),
    "L14": ("misc", "לוח חשמל", "panel"),
    "L34": ("misc", "גלאי עשן עצמאי", "smoke"),
    "L01": ("comm", "נקודת מוצא לרמקול (חוט משיכה)", "speaker"),
    "L02": ("comm", "נקודת ריכוז לרמקולים", "speaker_hub"),
    "L03": ("comm", "נקודת מוצא לטלוויזיה בכבלים (חוט משיכה)", "tv"),
    "L43": ("comm", "צינור קוברה 50 מ״מ בין הטלוויזיה לשקעים", "cobra"),
    "L04": ("comm", "ריכוז שקעים, קופסה 8 מקום", "cluster"),
    "L05": ("comm", "נקודת טלפון", "tel"),
    "L06": ("comm", "נקודת רשת מחשבים", "net"),
    "L07": ("comm", "נקודת אינטרקום פנימי", "intercom"),
    "L08": ("comm", "פעמון / זמזם ביתי כולל שנאי", "bell"),
    "L09": ("comm", "פנל אינטרקום חיצוני מוגן מים, מצלמה וקודן", "intercom_panel"),
    "L35": ("alarm", "רכזת אזעקה", "alarm_hub"),
    "L36": ("alarm", "פנל אזעקה (H=140)", "alarm_panel"),
    "L37": ("alarm", "גלאי נפח", "alarm_det"),
    "L38": ("alarm", "גלאי קרן", "alarm_det"),
    "L39": ("alarm", "מגנט לדלת / חלון", "alarm_det"),
    "L40": ("alarm", "צופר אזעקה", "alarm_det"),
    "L41": ("alarm", "גלאי וילון חיצוני", "alarm_det"),
    "L42": ("alarm", "מצלמה", "camera"),
}
LIGHTS = {c for c, v in LEGEND.items() if v[2] == "light"}
LIGHTS_WP = {"L17", "L18"}
SWITCHES = {"L23", "L24", "L25", "L26"}
SOCKETS = {"L29", "L30", "L31", "L32a", "L32b", "L33", "L04"}

# BOQ lines: a private-house electrical BOQ, one chapter (08) with sub-chapters, Israeli terms and
# units.  Prices: indicative contractor rates 2026, ILS before VAT, editable in the demo.
# How each quantity is computed is in boq_quantities() (and the same rules in demo.js).
BOQ = [
    ("light", "08.01.010", "נקודת מאור כולל מפסק יחיד (מעגל הדלקה)", "נק'", 260),
    ("light_add", "08.01.020", "נקודת מאור נוספת על אותו מפסק", "נק'", 150),
    ("light_wp", "08.01.030", "תוספת לנקודת מאור מוגנת מים IP65", "נק'", 60),
    ("sw_2way", "08.01.040", "תוספת למפסק מחליף", "יח'", 95),
    ("sw_cross", "08.01.050", "תוספת למפסק צלב", "יח'", 170),
    ("sw_ind", "08.01.060", "תוספת למפסק עם נורית ביקורת", "יח'", 45),
    ("fan", "08.01.070", "נקודת מאוורר תקרה (ונטה) כולל קופסת תלייה ומפסק", "נק'", 340),
    ("master", "08.01.080", "לחצן כיבוי תאורה וסגירת תריסים כללית", "יח'", 450),
    ("socket", "08.02.010", "נקודת בית תקע 16A", "נק'", 240),
    ("socket_add", "08.02.020", "תוספת לבית תקע נוסף באותה קופסה", "יח'", 70),
    ("socket_wp", "08.02.030", "נקודת בית תקע מוגן מים IP44", "נק'", 290),
    ("socket_power", "08.02.040", "נקודת כוח 16A במעגל נפרד מהלוח", "נק'", 420),
    ("socket_3ph", "08.02.050", "נקודת בית תקע תלת־פאזי 5×16A", "נק'", 780),
    ("cluster", "08.02.060", "ריכוז שקעים בקופסה 8 מקום (חשמל ותקשורת)", "יח'", 1150),
    ("ac_1ph", "08.03.010", "נקודת מזגן חד־פאזית כולל מפסק פקט", "נק'", 540),
    ("ac_3ph", "08.03.020", "נקודת מזגן תלת־פאזית כולל מפסק פקט", "נק'", 980),
    ("shutter", "08.03.030", "נקודת תריס חשמלי כולל מפסק תריס", "נק'", 380),
    ("heater", "08.03.040", "נקודת תנור חימום לחדר רחצה כולל מפסק דו־קוטבי עם נורית", "נק'", 440),
    ("boiler", "08.03.050", "נקודת דוד חשמלי כולל שעון דוד ומפסק עם נורית", "נק'", 680),
    ("shabbat", "08.03.060", "שעון שבת", "יח'", 290),
    ("bell", "08.03.070", "נקודת פעמון כולל לחצן ושנאי", "נק'", 280),
    ("panel", "08.04.010", "לוח חשמל ראשי תלת־פאזי לבית פרטי, כולל ציוד מיתוג והגנה", "קומפ'", 12500),
    ("net", "08.05.010", "נקודת רשת מחשבים CAT6 כולל שקע RJ45", "נק'", 290),
    ("tv", "08.05.020", "נקודת טלוויזיה (צנרת וחוט משיכה)", "נק'", 180),
    ("cobra", "08.05.030", "צינור קוברה 50 מ״מ בין נקודת הטלוויזיה לשקעים", "יח'", 220),
    ("tel", "08.05.040", "נקודת טלפון", "נק'", 180),
    ("speaker", "08.05.050", "נקודת רמקול (צנרת וחוט משיכה)", "נק'", 160),
    ("speaker_hub", "08.05.060", "נקודת ריכוז רמקולים", "נק'", 240),
    ("intercom", "08.05.070", "נקודת אינטרקום פנימי", "נק'", 260),
    ("intercom_panel", "08.05.080", "הכנה לפנל אינטרקום חיצוני", "נק'", 380),
    ("alarm_hub", "08.05.090", "הכנה לרכזת אזעקה", "נק'", 260),
    ("alarm_panel", "08.05.100", "הכנה לפנל אזעקה", "נק'", 180),
    ("alarm_det", "08.05.110", "הכנה לגלאי / מגנט / צופר אזעקה", "נק'", 160),
    ("camera", "08.05.120", "הכנה למצלמת אבטחה", "נק'", 220),
    ("smoke", "08.06.010", "גלאי עשן עצמאי", "יח'", 220),
    # lines that come from the designer's notes on the sheets (added in the demo's QA step)
    ("em_kit", "08.01.090", "תוספת ערכת חירום לגוף תאורה (3 שעות)", "יח'", 290),
    ("neutral", "08.01.100", "תוספת מוליך אפס בקופסת המפסק (הכנה לבית חכם)", "יח'", 30),
    ("garden", "08.02.070", "הכנה לתאורת גינה: קו הזנה מהלוח לנקודת חיבור מוגנת מים", "נק'", 480),
    ("path", "08.02.080", "הכנה לתאורת שביל: צנרת וקו הזנה מהלוח", "קומפ'", 950),
    ("filter", "08.03.080", "נקודת כוח למסנן אב״כ בממ״ד", "נק'", 450),
    ("pv", "08.04.020", "הכנה למערכת סולארית (PV): צנרת מהגג ללוח ומקום למונה", "קומפ'", 1800),
    ("smart", "08.04.030", "הכנה ללוח שליטה לבית חכם: ארון וצנרת", "קומפ'", 1400),
    ("ev", "08.04.040", "הכנה לעמדת טעינה לרכב חשמלי: קו הזנה תלת־פאזי מהלוח", "קומפ'", 3200),
    ("shed", "08.04.050", "קו הזנה למחסן בקצה המגרש (אורך לפי מדידה)", "קומפ'", 1600),
]
# The designer's notes: grey note boxes on the symbol layers, transcribed once (generic technical
# text, no names).  (sheet, centre of the box in that sheet's points, text, BOQ key, quantity rule)
# rule: a number, or "switches" (one per switch box).  None = information only.
NOTES = [
    ("E", (759, 300), "חשמל למסנן ממ״ד לפי דרישות פיקוד העורף", "filter", 1),
    ("E", (1287, 452), "הכנה לאוסמוזה לפי דרישות היצרן", None, 0),
    ("E", (926, 646), "הכנה למערכת PV", "pv", 1),
    ("E", (926, 700), "הכנה ללוח שליטה לבית חכם. כל הכנות החשמל והתאורה עם קו 0 וכל הנדרש לבית חכם", "smart", 1),
    ("E", (926, 700), "קו 0 בכל קופסת מפסק (לפי ההערה לבית חכם)", "neutral", "switches"),
    ("E", (343, 402), "שעון שבת למזגן בסמוך למפסקים ובאותו גובה", "shabbat", 1),
    ("E", (860, 497), "שעון שבת למזגן בסמוך למפסקים ובאותו גובה", "shabbat", 1),
    ("E", (631, 760), "שעון שבת למזגן בסמוך למפסקים ובאותו גובה", "shabbat", 1),
    ("E", (482, 920), "שעון שבת למזגן בסמוך למפסקים ובאותו גובה", "shabbat", 1),
    ("E", (1202, 612), "שעון שבת למזגן בסמוך למפסקים ובאותו גובה", "shabbat", 1),
    ("E", (843, 765), "שעון שבת למזגן בסמוך למפסקים ובאותו גובה", "shabbat", 1),
    ("E", (1183, 576), "שואב / שוטף (רובוט ניקוי)", None, 0),
    ("E", (163, 1272), "הכנה לטעינת רכב חשמלי", "ev", 1),
    ("L", (674, 54), "הכנה לתאורת גינה, חיבור ללוח", "garden", 1),
    ("L", (1242, 1148), "הכנה לתאורת גינה, חיבור ללוח", "garden", 1),
    ("L", (1682, 453), "הכנה לתאורת גינה, חיבור ללוח", "garden", 1),
    ("L", (107, 590), "הכנה לתאורת גינה, חיבור ללוח", "garden", 1),
    ("L", (107, 81), "הכנה לחשמל במחסן וחיבור ישיר ללוח בקצה המגרש", "shed", 1),
    ("L", (332, 1081), "הכנה לתאורת שביל", "path", 1),
    ("L", (1312, 1217), "הכנות למערכת אזעקה ומצלמות לפי דרישת היועצים", None, 0),
]
EMERGENCY = (28.2, 13.8)        # the small grey label boxes on the lighting sheet read "חירום"

# matcher scales per sheet: the lighting sheet draws its symbols at ~0.71 of the legend samples
SCALES = {SHEET_E: [1.0, 1.22], SHEET_L: [1.0, 0.71]}
SCALE_ONLY = {SHEET_L: {"L01": [1.0]}, SHEET_E: {"L30": [1.0, 1.22, 0.7]}}
SYMBOL_LAYERS = {SHEET_E: {"ELEC"}, SHEET_L: {"ELEC", "LIGHT"}}
EXACT_ONLY = {"L14"}                 # too few features for the matcher: rigid copies of the sample only
# SHX character prototypes (prim index on the lighting sheet; "h" on the electrical sheet),
# labelled by hand once.  Every other character is recognised by comparison with these.
GLYPHS_L = [("1", 43297), ("2", 43525), ("3", 47289), ("4", 43951), ("5", 46080), ("6", 43017), ("7", 44734), ("8", 47977),
            ("9", 46426), ("0", 46690), ("A", 43014), ("B", 47975),
            ("6", 48538), ("3", 48540), ("4", 48124), ("7", 48126)]          # the second, wider text style
GLYPHS_E = [("h", 35296)]
TAG = re.compile(r"^(\d{1,2}|A|B)/\d{1,2}(\.\d)?$")
TAG_TYPO = re.compile(r"^\d\.\d{1,2}$")          # "7.2" written for "7/2": read, normalised and reported


def tag_of(s: str) -> str | None:
    if TAG.match(s):
        return s
    if TAG_TYPO.match(s):
        return s.replace(".", "/", 1)
    return None

BASE_LAYERS = {
    "wallfill": ["Project3|A-WALL-PATT-CUT"],
    "walls": ["Project3|IN-WALL-CUT", "Project3|EX-WALL-CUT", "Project3|A-WALL-CUT", "Project3|EX-WALL-PROJ", "Project3|IN-WALL-PROJ"],
    "doors": ["Project3|A-DOOR", "Project3|A-DOOR-FRAM"],
    "glaz": ["Project3|A-GLAZ", "Project3|A-GLAZ-CUT", "Project3|A-GLAZ-SILL", "Project3|A-GLAZ-HDLN"],
    "furn": ["Project3|Furn Layout", "Project3|FURN", "furn", "ריהוט", "+FURN", "FURN-layout", "מיזוג אויר", "Project3|A-GENM"],
    "sani": ["Project3|sanitery", "Project3|P-SANR-FIXT", "sanitery"],
    "misc": ["Project3|A-FLOR-PROJ", "Project3|A-DETL"],
}

# building footprint (outer wall faces, electrical-sheet points) and split lines for the open plan
FOOTPRINT = [(285, 243), (553, 243), (553, 391), (721, 391), (721, 321), (931, 321), (931, 626), (1103, 626),
             (1103, 366), (1392, 366), (1392, 457), (1485, 457), (1485, 809), (1367, 809), (1367, 1063),
             (1114, 1063), (1114, 786), (906, 786), (906, 934), (617, 934), (617, 1073), (285, 1073)]
SPLITS = [
    [(1114, 626), (1114, 786)],      # hall | living area
    [(1103, 630), (1485, 630)],      # kitchen | dining + living
    [(1331, 630), (1331, 809)],      # dining | living
    [(746, 729), (906, 729)],        # hall | family room
    [(906, 723), (1114, 723)],       # hall | entrance
]
ROOM_SEEDS = [  # (name, point in electrical-sheet points) - generic room names
    ("ח. שינה הורים", (399, 348)), ("ח. שינה 1", (648, 486)), ("ח. שינה 2", (632, 855)),
    ("ח. שינה אורחים", (416, 969)), ("ממ״ד", (831, 429)), ("ח. רחצה הורים", (356, 483)),
    ("ח. רחצה", (356, 818)), ("ח. רחצה אורחים", (561, 997)), ("כביסה", (340, 590)),
    ("מרפסת שירות", (360, 700)), ("שירותי אורחים", (860, 600)), ("מטבח", (1239, 486)),
    ("מזווה", (1426, 525)), ("פינת אוכל", (1398, 695)), ("חדר מגורים", (1239, 903)),
    ("ח. משפחה", (803, 828)), ("מבואת כניסה", (970, 760)), ("מסדרון", (470, 690)),
]
ROOM_KIND = {  # for the room checks in the demo
    "ח. שינה הורים": "bed", "ח. שינה 1": "bed", "ח. שינה 2": "bed", "ח. שינה אורחים": "bed", "ממ״ד": "bed",
    "ח. רחצה הורים": "bath", "ח. רחצה": "bath", "ח. רחצה אורחים": "bath", "שירותי אורחים": "wc",
    "מטבח": "kitchen", "חדר מגורים": "living", "ח. משפחה": "living", "פינת אוכל": "dining",
    "כביסה": "laundry", "מרפסת שירות": "service", "מזווה": "store", "מבואת כניסה": "hall", "מסדרון": "hall",
}

K = 1.7638889  # cm per pt (1:50, from the door arcs)


# ---------------------------------------------------------------------------------------------
def load(sid: str) -> dict:
    d = SRC / sid
    return {k: json.loads((d / f"{k}.json").read_text(encoding="utf-8")) for k in ("geometry", "legend", "instances", "measurements", "sheet")}


def is_grey(c) -> bool:
    return bool(c) and max(c) - min(c) < 0.05 and min(c) > 0.5


def bb_of(p: dict) -> list[float]:
    xs, ys = p["p"][0::2], p["p"][1::2]
    return [min(xs), min(ys), max(xs), max(ys)]


def inside(b, box_, pad=0.0) -> bool:
    return b[0] >= box_[0] - pad and b[2] <= box_[2] + pad and b[1] >= box_[1] - pad and b[3] <= box_[3] + pad


def gap(a, b) -> float:
    """Distance between two boxes (0 when they touch or overlap)."""
    dx = max(a[0] - b[2], b[0] - a[2], 0.0)
    dy = max(a[1] - b[3], b[1] - a[3], 0.0)
    return math.hypot(dx, dy)


def sheet_offset(E: dict, L: dict) -> tuple[float, float]:
    """Lighting -> electrical page offset from the room labels both sheets share."""
    te = defaultdict(list)
    for t in E["geometry"]["texts"]:
        if t["font"] == "SegoeUI-Light":
            te[t["s"]].append(t["b"])
    dx, dy = [], []
    for t in L["geometry"]["texts"]:
        for b in te.get(t["s"], []) if t["font"] == "SegoeUI-Light" else []:
            ddx, ddy = b[0] - t["b"][0], b[1] - t["b"][1]
            if abs(ddx - 82.7) < 10 and abs(ddy - 151) < 10:
                dx.append(ddx)
                dy.append(ddy)
    return statistics.median(dx), statistics.median(dy)


# ---------------------------------------------------------------------------------------------
def read_text(S: dict, sid: str, reader: Reader) -> list[dict]:
    """SHX strings on the symbol layers (outside the legend table)."""
    P, lb = S["geometry"]["prims"], S["legend"]["bbox"]
    idx = []
    for i, p in enumerate(P):
        if p["l"] not in SYMBOL_LAYERS[sid]:
            continue
        b = bb_of(p)
        if inside(b, lb, 2) or max(b[2] - b[0], b[3] - b[1]) >= 9.5:
            continue
        idx.append(i)
    out = reader.read(P, idx)
    print(sid, "strings:", len(out), Counter(t["s"] for t in out).most_common(12))
    return out


def note_boxes(S: dict, sid: str) -> list[list[float]]:
    """Grey filled note boxes on the symbol layers (each is drawn twice; deduplicated)."""
    out = []
    for p in S["geometry"]["prims"]:
        if p["l"] not in SYMBOL_LAYERS[sid] or p["t"] != "pg" or not is_grey(p.get("f")):
            continue
        b = bb_of(p)
        if inside(b, S["legend"]["bbox"], 2) or any(all(abs(b[k] - o[k]) < 0.3 for k in range(4)) for o in out):
            continue
        out.append(b)
    return out


def legend_samples(E: dict) -> dict[str, tuple[list[dict], list[float], list]]:
    """code -> (prims, bbox, inner texts) of the legend sample; splits the A/C row into its two glyphs
    and reads the TV-conduit row the engine skipped."""
    P = E["geometry"]["prims"]
    out = {}
    for e in E["legend"]["entries"]:
        if e.get("discovered"):
            continue
        out[e["code"]] = ([P[i] for i in e["prim_idx"]], e["bbox"], e.get("inner_texts") or [])
    ps, b, _ = out.pop("L32")
    mid = (b[0] + b[2]) / 2
    for code, side in (("L32b", lambda q: q < mid), ("L32a", lambda q: q >= mid)):   # left glyph "3", right "1"
        sel = [p for p in ps if side((bb_of(p)[0] + bb_of(p)[2]) / 2)]
        out[code] = (sel, [min(bb_of(p)[0] for p in sel), min(bb_of(p)[1] for p in sel), max(bb_of(p)[2] for p in sel), max(bb_of(p)[3] for p in sel)], [])
    # TV conduit row (between L22 and L23 in the right-hand table): symbol cell = right 40 pt
    r22 = next(e for e in E["legend"]["entries"] if e["code"] == "L22")
    r23 = next(e for e in E["legend"]["entries"] if e["code"] == "L23")
    cell = [r22["row_bbox"][2] - 40, r22["row_bbox"][3] + 1, r22["row_bbox"][2], r23["row_bbox"][1] - 1]
    sel = [p for p in P if p["l"] in SYMBOL_LAYERS[SHEET_E] and inside(bb_of(p), cell)]
    if sel:
        out["L43"] = (sel, [min(bb_of(p)[0] for p in sel), min(bb_of(p)[1] for p in sel), max(bb_of(p)[2] for p in sel), max(bb_of(p)[3] for p in sel)], [])
    return out


def exact_copies(sample: list[dict], prims: list[dict], idx: list[int], tol: float = 0.3) -> list[list[float]]:
    """Translated copies of the sample prims (same type, same points relative to the bbox, within tol)."""
    def rel(p):
        b = bb_of(p)
        return p["t"], np.array([v - (b[0] if k % 2 == 0 else b[1]) for k, v in enumerate(p["p"])])

    def same(a, b):
        return a[0] == b[0] and len(a[1]) == len(b[1]) and float(np.abs(a[1] - b[1]).max()) <= tol
    sr = [rel(p) for p in sample]
    sb = [bb_of(p) for p in sample]
    out = []
    for i in idx:
        if not same(rel(prims[i]), sr[0]):
            continue
        b0 = bb_of(prims[i])
        dx, dy = b0[0] - sb[0][0], b0[1] - sb[0][1]
        ok = all(any(same(rel(prims[j]), r) and abs(bb_of(prims[j])[0] - q[0] - dx) < 0.5 and abs(bb_of(prims[j])[1] - q[1] - dy) < 0.5
                     for j in idx) for r, q in zip(sr[1:], sb[1:]))
        if ok:
            x0, y0 = min(q[0] for q in sb) + dx, min(q[1] for q in sb) + dy
            x1, y1 = max(q[2] for q in sb) + dx, max(q[3] for q in sb) + dy
            out.append([x0, y0, x1, y1])
    return out


def detect(S: dict, sid: str, samples: dict, codemap: dict | None, skip: set[int]) -> list[dict]:
    """Run the engine's vector matcher (legend sample -> every rigid copy) at the sheet's scales.
    Text strokes (tags, heights) are removed first so a "/" next to a switch is not read as an arrow tick.
    `samples` are the electrical sheet's legend samples (codes of that sheet); `codemap` maps the
    sheet's own legend codes to them (lighting sheet), the matching uses the sheet's own samples."""
    G, Lg = S["geometry"], S["legend"]
    P = G["prims"]
    lb = Lg["bbox"]
    lay = SYMBOL_LAYERS[sid]
    sel = [i for i, p in enumerate(P) if p["l"] in lay and i not in skip and not inside(prim_bbox(p), lb, 2)]
    layer_prims = [P[i] for i in sel]
    texts = [t for t in G["texts"] if not inside(t["b"], lb, 2)]
    fs = sv.prims_to_features(layer_prims, texts=texts)
    fs.build_index()
    own = {}
    if codemap is None:
        own = samples
    else:
        for e in Lg["entries"]:
            if e.get("discovered") or e["code"] not in codemap:
                continue
            c = codemap[e["code"]]
            if c == "L32":
                continue                        # the A/C row is matched on the electrical sheet only
            own[c] = ([P[i] for i in e["prim_idx"]], e["bbox"], e.get("inner_texts") or [])
    templates, matches = {}, {}
    out = []
    for code, (tprims, tb, ttexts) in own.items():
        if code in EXACT_ONLY:
            for b in exact_copies(tprims, P, sel):
                out.append({"code": code, "bbox": b, "pt": [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], "score": 1.0, "scale": 1.0})
            continue
        ms = []
        for s in SCALE_ONLY.get(sid, {}).get(code, SCALES[sid]):
            t = sv.make_template(code, tprims, tb, scale=s, texts=ttexts or None)
            if t is None:
                continue
            templates.setdefault(code, t)
            for m in sv.find_matches(t, fs, exclude_bbox=lb):
                m.scale = s
                ms.append(m)
        if code in templates:
            matches[code] = sv.nms(ms, templates[code].size * 0.45)
    res = sv.resolve_overlaps(matches, templates)
    for code, ms in res.items():
        for m in ms:
            out.append({"code": code, "bbox": list(m.bbox), "pt": [m.cx, m.cy], "score": m.score, "scale": m.scale})
    print(sid, "matcher:", sorted(Counter((o["code"], o["scale"]) for o in out).items()))
    return out


def switches(S: dict, sid: str, skip: set[int]) -> list[dict]:
    """Switch symbols on the lighting sheet, read directly from their parts.  Switches are drawn in
    stacks that share edges, which the template matcher handles poorly.  Every switch is a square
    with a small circle: circle in a corner = single-pole family, in the middle = two-way.  In the
    corner family the arrow at the opposite corner tells the type: plain arrow = מפסק מאור, one extra
    tick = עם נורית, two ticks and a filled circle = מפסק תריס."""
    P, lb = S["geometry"]["prims"], S["legend"]["bbox"]
    idx = [i for i, p in enumerate(P) if p["l"] == "LIGHT" and i not in skip and not inside(bb_of(p), lb, 2)]
    B = {i: bb_of(P[i]) for i in idx}
    from scipy.spatial import cKDTree
    ctr = np.array([[(B[i][0] + B[i][2]) / 2, (B[i][1] + B[i][3]) / 2] for i in idx])
    tree = cKDTree(ctr)
    out = []
    for i in idx:
        p, b = P[i], B[i]
        w, h = b[2] - b[0], b[3] - b[1]
        if p["t"] != "pg" or len(p["p"]) != 10 or abs(w - h) > 0.25 or not (8.2 <= w <= 8.8 or 11.7 <= w <= 12.3):
            continue
        k = w / 12.0
        near = [idx[j] for j in tree.query_ball_point([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], w * 1.0)]
        circ = [j for j in near if P[j]["t"] in ("pg", "pl") and len(P[j]["p"]) >= 32 and abs((B[j][2] - B[j][0]) - 4.2 * k) < 0.8 * k
                and abs((B[j][2] - B[j][0]) - (B[j][3] - B[j][1])) < 0.3 and inside(B[j], b, 0.4)]
        if not circ:
            continue
        c = circ[0]
        cx, cy = (B[c][0] + B[c][2]) / 2, (B[c][1] + B[c][3]) / 2
        corners = [(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])]
        mx, my = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        mid = math.hypot(cx - mx, cy - my) < 1.4 * k
        kc = min(range(4), key=lambda q: math.hypot(cx - corners[q][0], cy - corners[q][1]))
        if not mid and math.hypot(cx - corners[kc][0], cy - corners[kc][1]) > 3.6 * k:
            continue
        opp = corners[(kc + 2) % 4]
        # the diagonal must exist: a stroke from the circle (or a corner) through the opposite corner
        diag = [j for j in near if P[j]["t"] in ("pl", "l") and j != c and any(
            math.hypot(P[j]["p"][q] - opp[0], P[j]["p"][q + 1] - opp[1]) < 0.5 for q in range(0, len(P[j]["p"]), 2))]
        if not diag and not mid:
            continue
        hatch = [j for j in near if P[j]["t"] == "pg" and len(P[j]["p"]) <= 8 and B[j][3] - B[j][1] <= 0.3 and inside(B[j], B[c], 0.2)]
        ticks = [j for j in near if P[j]["t"] == "l" and j not in diag
                 and 3.2 * k <= math.hypot(B[j][2] - B[j][0], B[j][3] - B[j][1]) <= 4.8 * k
                 and math.hypot((B[j][0] + B[j][2]) / 2 - opp[0], (B[j][1] + B[j][3]) / 2 - opp[1]) < 4.2 * k]
        if mid:
            code = "L24"
        elif len(hatch) >= 4 and len(ticks) >= 2:
            code = "L26"
        elif ticks:
            code = "L25"
        else:
            code = "L23"
        parts = {i, c} | set(hatch) | set(ticks) | set(diag)
        if mid:   # both halves of the diagonal and the arrow ticks at the two far corners
            parts |= {j for j in near if P[j]["t"] in ("l", "pl") and any(
                math.hypot(P[j]["p"][q] - x, P[j]["p"][q + 1] - y) < 0.5 for q in range(0, len(P[j]["p"]), 2) for x, y in corners)
                and inside(B[j], b, 2.6 * k)}
        bx = [min(B[j][0] for j in parts), min(B[j][1] for j in parts), max(B[j][2] for j in parts), max(B[j][3] for j in parts)]
        out.append({"code": code, "bbox": bx, "pt": [mx, my], "score": 1.0, "scale": 1.0 if k > 0.9 else 0.71,
                    "own": sorted(parts), "square": b})
    print(sid, "switches by parts:", Counter(o["code"] for o in out))
    return out


def ceiling_lights(S: dict, sid: str, taken: list[tuple[float, float]], skip: set[int]) -> list[dict]:
    """Ceiling points drawn as a circle with a short cross (not an exact copy of the legend sample:
    the cross is shorter) -> similarity matches for review."""
    P, lb = S["geometry"]["prims"], S["legend"]["bbox"]
    lp = [p for i, p in enumerate(P) if p["l"] == "LIGHT" and i not in skip and not inside(prim_bbox(p), lb, 2)]
    fs = sv.prims_to_features(lp)
    segs = fs.segs
    out = []
    for cx, cy, r, filled in fs.circles:
        if filled or not (5.2 <= r <= 6.1):
            continue
        if any(math.hypot(cx - x, cy - y) < 6 for x, y in taken):
            continue
        hv = [False, False]
        for x0, y0, x1, y1 in segs:
            L = math.hypot(x1 - x0, y1 - y0)
            if L < 1.6 * r:
                continue
            t = ((cx - x0) * (x1 - x0) + (cy - y0) * (y1 - y0)) / (L * L)
            if not 0.2 < t < 0.8:
                continue
            px, py = x0 + t * (x1 - x0), y0 + t * (y1 - y0)
            if math.hypot(px - cx, py - cy) > 0.6:
                continue
            if abs(y1 - y0) < 0.15 * L:
                hv[0] = True
            elif abs(x1 - x0) < 0.15 * L:
                hv[1] = True
        if all(hv):
            out.append({"code": "L16", "bbox": [cx - r - 1.5, cy - r - 1.5, cx + r + 1.5, cy + r + 1.5], "pt": [cx, cy], "score": 0.8, "scale": 0, "review": True, "shape": True})
            taken.append((cx, cy))
    print(sid, "ceiling points by similarity:", len(out))
    return out


def text_boxes(S: dict, sid: str, code: str, sample: tuple, taken: list[list[float]]) -> list[dict]:
    """Framed-label symbols ("ריכוז" in a box) drawn with another text size than the legend sample:
    a frame of the sample's size (+-12%) with about as many letter strokes inside -> review item."""
    P, lb = S["geometry"]["prims"], S["legend"]["bbox"]
    sp, sb, _ = sample
    sw, sh = sb[2] - sb[0], sb[3] - sb[1]
    n0 = len(sp) - 1
    B = [bb_of(p) for p in P]
    out = []
    for i, p in enumerate(P):
        if p["l"] not in SYMBOL_LAYERS[sid] or p["t"] != "pg" or len(p["p"]) != 10 or p.get("f"):
            continue
        b = B[i]
        if inside(b, lb, 2) or not (abs((b[2] - b[0]) / sw - 1) < 0.12 and abs((b[3] - b[1]) / sh - 1) < 0.12):
            continue
        if any(gap(b, t) == 0 for t in taken):
            continue
        n = sum(1 for j, q in enumerate(B) if j != i and P[j]["l"] in SYMBOL_LAYERS[sid] and inside(q, b, 0.2))
        if abs(n - n0) <= max(3, 0.4 * n0):
            out.append({"code": code, "bbox": b, "pt": [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], "score": 0.8, "scale": 0, "review": True, "shape": True})
    print(sid, code, "framed labels by similarity:", len(out))
    return out


def strips(S: dict, sid: str, skip: set[int]) -> list[dict]:
    """Linear fixtures ("ג״ת צמוד תקרה לפי מידה"): thin filled bars on the lighting layer, drawn to
    length (the legend sample is a short bar, so the matcher cannot find them)."""
    P, lb = S["geometry"]["prims"], S["legend"]["bbox"]
    out = []
    for i, p in enumerate(P):
        if p["l"] != "LIGHT" or i in skip or p["t"] != "pg" or not p.get("f"):
            continue
        b = bb_of(p)
        if inside(b, lb, 2):
            continue
        a, t = max(b[2] - b[0], b[3] - b[1]), min(b[2] - b[0], b[3] - b[1])
        if a < 30 or not (0.6 <= t <= 1.8):
            continue
        if any(inside(b, o["bbox"], 0.3) for o in out):      # drawn twice
            continue
        out.append({"code": "L22", "bbox": b, "pt": [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], "score": 1.0, "scale": 1.0, "len": round(a * K / 10) * 10})
    print(sid, "linear fixtures:", [o["len"] for o in out])
    return out


def fans(S: dict, sid: str, claimed: set[int]) -> list[dict]:
    """Ceiling fans: a hub (two concentric circles) with three blades.  The legend has no such
    sample (its "ונטה" row is a four-blade cross), so they surface as a repeated unknown shape."""
    P, lb = S["geometry"]["prims"], S["legend"]["bbox"]
    idx = [i for i, p in enumerate(P) if p["l"] == "LIGHT" and i not in claimed and not inside(prim_bbox(p), lb, 2)]
    fs = sv.prims_to_features([P[i] for i in idx])
    C = fs.circles
    outer = [c for c in C if 4.1 <= c[2] <= 5.0 and not c[3]]
    inner = [c for c in C if 1.0 <= c[2] <= 1.9 and not c[3]]
    out = []
    for cx, cy, r, _ in outer:
        if not any(math.hypot(cx - x, cy - y) < 0.6 for x, y, _, _ in inner):
            continue
        if any(math.hypot(cx - (m["bbox"][0] + m["bbox"][2]) / 2, cy - (m["bbox"][1] + m["bbox"][3]) / 2) < 8 for m in out):
            continue
        R = 26
        cl = [P[i] for i in idx if inside(bb_of(P[i]), [cx - R, cy - R, cx + R, cy + R]) and
              math.hypot((bb_of(P[i])[0] + bb_of(P[i])[2]) / 2 - cx, (bb_of(P[i])[1] + bb_of(P[i])[3]) / 2 - cy) < 22]
        if len(cl) < 10:
            continue
        b = [min(bb_of(p)[0] for p in cl), min(bb_of(p)[1] for p in cl), max(bb_of(p)[2] for p in cl), max(bb_of(p)[3] for p in cl)]
        out.append({"bbox": b, "prims": cl, "c": (cx, cy)})
    print(sid, "fans:", len(out))
    return out


def unknown_groups(S: dict, sid: str, claimed: set[int], min_n: int = 3) -> list[list[dict]]:
    """Repeated symbol-sized shapes on the symbol layers that no legend row explains."""
    P, lb = S["geometry"]["prims"], S["legend"]["bbox"]
    lp = [p for i, p in enumerate(P) if p["l"] in SYMBOL_LAYERS[sid] and i not in claimed and not inside(prim_bbox(p), lb, 2)]
    groups = defaultdict(list)
    for cl in cluster_prims(lp, gap=0.6):
        if len(cl) < 4 or len(cl) > 80:
            continue
        b = [min(bb_of(p)[0] for p in cl), min(bb_of(p)[1] for p in cl), max(bb_of(p)[2] for p in cl), max(bb_of(p)[3] for p in cl)]
        w, h = b[2] - b[0], b[3] - b[1]
        if not (18 <= max(w, h) <= 45 and min(w, h) >= 12):
            continue
        if sum(1 for p in cl if p.get("f")) > len(cl) * 0.5:      # vector text
            continue
        sig = sv.shape_signature(cl)
        key = (sig[0][0], sig[0][2] // 3, sig[0][3]) if sig else ("n", len(cl) // 4)
        groups[key].append({"bbox": b, "prims": cl})
    return [g for g in groups.values() if len(g) >= min_n]


def _raster(geom, shape, x0, y0, res, value, img=None):
    from PIL import Image, ImageDraw
    if img is None:
        img = Image.new("I", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(img)
    T = lambda cs: [((x - x0) / res, (y - y0) / res) for x, y in cs]  # noqa: E731
    polys = sorted(getattr(geom, "geoms", [geom]), key=lambda g: -g.area)
    for g in polys:
        if g.geom_type != "Polygon" or g.is_empty:
            continue
        d.polygon(T(g.exterior.coords), fill=value)
        for h in g.interiors:
            d.polygon(T(h.coords), fill=0 if value else 1)
    return img


def partition_rooms(fp: Polygon, walls, r: float = 24, res: float = 0.5) -> list[Polygon]:
    """Rooms = the free space inside the footprint split between the "cores" left after closing the
    door openings (free space eroded by r).  Every free pixel goes to its nearest core, so doorways
    are split down the middle and room corners stay square."""
    from scipy import ndimage
    x0, y0, x1, y1 = fp.bounds
    shape = (int((y1 - y0) / res) + 2, int((x1 - x0) / res) + 2)
    free = np.array(_raster(fp.difference(walls), shape, x0, y0, res, 1), dtype=np.int32) > 0
    cores_geom = fp.difference(walls.buffer(r))
    cores = [g for g in getattr(cores_geom, "geoms", [cores_geom]) if g.area > 120]
    lab = np.zeros(shape, dtype=np.int32)
    for k, g in enumerate(cores, start=1):
        lab = np.maximum(lab, np.array(_raster(g, shape, x0, y0, res, k), dtype=np.int32))
    _, (iy, ix) = ndimage.distance_transform_edt(lab == 0, return_indices=True)
    near = lab[iy, ix]
    near[~free] = 0
    out = []
    for k in range(1, len(cores) + 1):
        m = near == k
        boxes = []
        for row in np.where(m.any(axis=1))[0]:
            cols = np.where(m[row])[0]
            splits = np.where(np.diff(cols) > 1)[0]
            starts = np.r_[cols[0], cols[splits + 1]]
            ends = np.r_[cols[splits], cols[-1]]
            for a, b in zip(starts, ends):
                boxes.append(box(x0 + a * res, y0 + row * res, x0 + (b + 1) * res, y0 + (row + 1) * res))
        g = unary_union(boxes)
        if g.geom_type != "Polygon":
            g = max(g.geoms, key=lambda q: q.area)
        g = Polygon(g.exterior).simplify(0.6)
        out.append(g)
    return out


def suggest(prims: list[dict], legend_glyphs: dict[str, list[dict]]) -> str | None:
    """Closest legend sample by raster overlap over the 8 right-angle orientations."""
    from PIL import Image, ImageDraw

    def ras(ps):
        b = [min(bb_of(p)[0] for p in ps), min(bb_of(p)[1] for p in ps), max(bb_of(p)[2] for p in ps), max(bb_of(p)[3] for p in ps)]
        s = 30 / max(b[2] - b[0], b[3] - b[1], 1e-6)
        im = Image.new("L", (32, 32), 0)
        d = ImageDraw.Draw(im)
        for p in ps:
            pts = [((p["p"][i] - b[0]) * s + 1, (p["p"][i + 1] - b[1]) * s + 1) for i in range(0, len(p["p"]), 2)]
            if p.get("f") and len(pts) >= 3:
                d.polygon(pts, fill=255)
            elif len(pts) >= 2:
                d.line(pts, fill=255, width=2)
        return np.array(im) > 0
    a = ras(prims)
    best, bc = 0.0, None
    for code, ps in legend_glyphs.items():
        g = ras(ps)
        for k in range(4):
            for m in (g, g[:, ::-1]):
                q = np.rot90(m, k)
                iou = (a & q).sum() / max((a | q).sum(), 1)
                if iou > best:
                    best, bc = iou, code
    print("  suggestion iou", round(best, 2), bc)
    return bc if best > 0.2 else None


# ---------------------------------------------------------------------------------------------
class Enc:
    """Prims -> compact SVG path strings in plan cm (relative commands)."""

    def __init__(self, ox: float, oy: float, dx: float = 0.0, dy: float = 0.0, dec: int = 0):
        self.ox, self.oy, self.dx, self.dy, self.dec = ox, oy, dx, dy, dec

    def xy(self, x: float, y: float) -> tuple[float, float]:
        q = 10 ** self.dec
        return round((x + self.dx - self.ox) * K * q) / q, round((y + self.dy - self.oy) * K * q) / q

    def num(self, v: float) -> str:
        s = f"{v:.{self.dec}f}" if self.dec else str(int(v))
        if self.dec:
            s = s.rstrip("0").rstrip(".")
            if s.startswith("0."):
                s = s[1:]
            elif s.startswith("-0."):
                s = "-" + s[2:]
        return "0" if s in ("", "-0", "-") else s

    def path(self, prims: list[dict]) -> str:
        out = []
        for p in prims:
            pts = [self.xy(p["p"][i], p["p"][i + 1]) for i in range(0, len(p["p"]), 2)]
            dedup = [pts[0]]
            for q in pts[1:]:
                if q != dedup[-1]:
                    dedup.append(q)
            if len(dedup) < 2:
                continue
            s = f"M{self.num(dedup[0][0])} {self.num(dedup[0][1])}"
            px, py = dedup[0]
            rel = []
            for x, y in dedup[1:]:
                rel.append(f"{self.num(x - px)} {self.num(y - py)}")
                px, py = x, y
            s += "l" + " ".join(rel)
            if p["t"] == "pg":
                s += "z"
            out.append(s)
        return "".join(out).replace(" -", "-")


def glyph(prims: list[dict], bbox: list[float], texts: list[dict] | None = None) -> dict:
    """Legend / symbol glyph in a 0..100 box (aspect kept, centred).  `texts`: real text spans
    inside the sample (e.g. "INT"), kept as a short label."""
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    s = 84 / max(w, h, 1e-6)
    ox, oy = bbox[0] - (100 / s - w) / 2, bbox[1] - (100 / s - h) / 2
    lines, fills = [], []
    for p in prims:
        pts = [((p["p"][i] - ox) * s, (p["p"][i + 1] - oy) * s) for i in range(0, len(p["p"]), 2)]
        d = "M" + " ".join(f"{x:.0f} {y:.0f}" for x, y in pts) + ("z" if p["t"] == "pg" else "")
        (fills if p.get("f") else lines).append(d)
    g = {"l": "".join(lines), "f": "".join(fills)}
    for t in texts or []:
        b = t["b"]
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        if bbox[0] <= cx <= bbox[2] and bbox[1] <= cy <= bbox[3] and len(t["s"]) <= 4:
            g["t"] = [t["s"], round((cx - ox) * s), round((cy - oy) * s), round(min(b[2] - b[0], b[3] - b[1]) * s)]
    return g


# ---------------------------------------------------------------------------------------------
def attach_text(found: list[dict], strings: list[dict], want, max_gap: float, ext: list[dict] | None = None) -> dict[int, dict]:
    """Strings -> the symbols they describe, as one optimal assignment (a long tag that touches the
    neighbouring switch of a stack must not take that switch from its own tag).  `ext`: strings
    that extend a tag for the distance test ("A/6" + "h=240" written as one note)."""
    from scipy.optimize import linear_sum_assignment
    ks = [k for k, t in enumerate(strings) if want(t["s"])]
    if not ks or not found:
        return {}
    big = 1e6
    C = np.full((len(ks), len(found)), big)
    for a, k in enumerate(ks):
        t = strings[k]
        boxes = [t["b"]] + [e["b"] for e in (ext or []) if e is not t and gap(e["b"], t["b"]) <= 3.0]
        tb = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]
        for j, f in enumerate(found):
            g = gap(tb, f["bbox"])
            if g <= max_gap:
                cy_t, cy_f = (t["b"][1] + t["b"][3]) / 2, (f["bbox"][1] + f["bbox"][3]) / 2
                C[a, j] = g + 0.15 * abs(cy_t - cy_f)
    rows, cols = linear_sum_assignment(C)
    return {int(j): strings[ks[a]] for a, j in zip(rows, cols) if C[a, j] < big}


def reconcile(found: list[dict]) -> None:
    """Lighting sheet: decide what every switch operates from its tag.  Sets f["code"] (final row),
    f["g"] (drawn symbol, when it differs) and f["role"] ("of" = part of another point)."""
    heater_tags = {f["tag"] for f in found if f["code"] == "L12" and f.get("tag")}
    by_tag = defaultdict(list)
    for f in found:
        if f["code"] in SWITCHES and f.get("tag") and not f["tag"].startswith("B/") and f["tag"] not in heater_tags:
            by_tag[f["tag"]].append(f)
    for f in found:
        c0 = f["code"]
        if c0 not in SWITCHES:
            continue
        t = f.get("tag") or ""
        if t.startswith("B/"):
            f["code"] = "L26"
        elif t in heater_tags:
            f["code"], f["role"] = "L12", "of"                 # the heater point includes its switch
        elif t == "דוד":
            f["code"] = "L10"                                  # boiler switch: the boiler point
        elif t:
            f["code"] = "L24" if len(by_tag[t]) >= 2 else ("L25" if c0 == "L25" else "L23")
        elif c0 == "L26":
            f["code"] = "L23"
        if f["code"] != c0:
            f["g"] = c0


def boq_quantities(points: list[dict]) -> dict[str, int]:
    """points: counted symbols {c, t, m, role}.  Same rules as boqLines() in demo.js."""
    q = Counter()
    circuits, fixtures = set(), 0
    sw_by_tag = Counter()
    for p in points:
        c = p["c"]
        if p.get("role") == "of":
            continue
        k = LEGEND[c][2]
        if c in LIGHTS:
            fixtures += 1
            circuits.add(p.get("t") or f"#{id(p)}")
            if c in LIGHTS_WP:
                q["light_wp"] += 1
        elif c in ("L23", "L24", "L25"):
            if p.get("t"):
                sw_by_tag[p["t"]] += 1
            if c == "L25":
                q["sw_ind"] += 1
        elif k in ("sw_shutter",):
            pass                                                # included in the shutter point
        else:
            q[k] += 1
        if c in SOCKETS and c != "L04":
            q["socket_add"] += max(0, (p.get("m") or 1) - 1)
    q["light"] = len(circuits)
    q["light_add"] = fixtures - len(circuits)
    for n in sw_by_tag.values():
        if n >= 2:
            q["sw_2way"] += 2
            q["sw_cross"] += n - 2
    return {k: v for k, v in q.items() if v}


# ---------------------------------------------------------------------------------------------
def main() -> None:
    E, L = load(SHEET_E), load(SHEET_L)
    dxL, dyL = sheet_offset(E, L)
    print("lighting -> electrical offset", dxL, dyL)
    fp = Polygon(FOOTPRINT)
    # the house, the garden strip around it (garden lights) and the parking (EV charger note)
    crop = list(fp.buffer(135).bounds)
    crop = [min(crop[0], 128), crop[1], max(crop[2], 1780), max(crop[3], 1300)]
    ox, oy = crop[0], crop[1]
    Wcm, Hcm = round((crop[2] - crop[0]) * K), round((crop[3] - crop[1]) * K)
    in_crop = lambda b: inside(b, crop)  # noqa: E731
    enc0 = Enc(ox, oy)

    # ---------------- base drawing (electrical sheet) ----------------
    PE = E["geometry"]["prims"]
    base = {}
    for name, layers in BASE_LAYERS.items():
        ls = set(layers)
        sel = [p for p in PE if p["l"] in ls and in_crop(bb_of(p))]
        if name == "wallfill":
            sel = [p for p in sel if p["t"] == "pg" and p.get("f")]
        if name == "walls":
            base["wallsH"] = enc0.path([p for p in sel if p["w"] >= 1.0])
            sel = [p for p in sel if p["w"] < 1.0]
        base[name] = enc0.path(sel)
    layer_counts = {}
    for name, layers in BASE_LAYERS.items():
        for l in layers:
            n = sum(1 for p in PE if p["l"] == l and in_crop(bb_of(p)))
            if n:
                layer_counts[l.split("|")[-1]] = layer_counts.get(l.split("|")[-1], 0) + n

    # ---------------- legend ----------------
    samples = legend_samples(E)
    rows_e = {e["code"]: e for e in E["legend"]["entries"]}
    lb_e, lb_l = E["legend"]["bbox"], L["legend"]["bbox"]
    ddx, ddy = lb_e[0] - lb_l[0], lb_e[1] - lb_l[1]
    map_l = {}
    for e in L["legend"]["entries"]:
        if e.get("discovered"):
            continue
        cx, cy = (e["bbox"][0] + e["bbox"][2]) / 2 + ddx, (e["bbox"][1] + e["bbox"][3]) / 2 + ddy
        best = min(rows_e.values(), key=lambda r: math.hypot((r["bbox"][0] + r["bbox"][2]) / 2 - cx, (r["bbox"][1] + r["bbox"][3]) / 2 - cy))
        map_l[e["code"]] = best["code"]
    print("lighting legend map", map_l)

    # ---------------- text strokes ----------------
    reader = Reader([(c, L["geometry"]["prims"][i]) for c, i in GLYPHS_L] + [(c, PE[i]) for c, i in GLYPHS_E])

    sheets_out = {}
    insts = []
    unknown_out = []
    notes_out = []
    orphans = {}
    for sid, S, key, (sdx, sdy) in ((SHEET_E, E, "E", (0, 0)), (SHEET_L, L, "L", (dxL, dyL))):
        P = S["geometry"]["prims"]
        strings = read_text(S, sid, reader)
        text_prims = {i for t in strings for i in t["prims"]}
        found = detect(S, sid, samples, None if sid == SHEET_E else map_l, text_prims)
        if sid == SHEET_L:      # switches: read from their parts, not by the matcher (stacks share edges)
            found = [f for f in found if f["code"] not in SWITCHES] + switches(S, sid, text_prims)
        for f in found:
            f["review"] = f["scale"] not in (1.0, 0.71)
        if sid == SHEET_L:
            found += ceiling_lights(S, sid, [tuple(f["pt"]) for f in found if f["code"] not in SWITCHES], text_prims)
            found += strips(S, sid, text_prims)
            found += text_boxes(S, sid, "L02", samples["L02"], [f["bbox"] for f in found])
        out_of_crop = [(f["code"], round(f["pt"][0]), round(f["pt"][1])) for f in found if not in_crop([f["bbox"][0] + sdx, f["bbox"][1] + sdy, f["bbox"][2] + sdx, f["bbox"][3] + sdy])]
        print(sid, "outside the drawing area:", Counter(out_of_crop))
        # in the drawing area only
        found = [f for f in found if in_crop([f["bbox"][0] + sdx, f["bbox"][1] + sdy, f["bbox"][2] + sdx, f["bbox"][3] + sdy])]
        # symbols drawn inside a note box illustrate the note (the note itself is read below)
        boxes = note_boxes(S, sid)
        em_boxes = [b for b in boxes if abs(b[2] - b[0] - EMERGENCY[0]) < 0.6 and abs(b[3] - b[1] - EMERGENCY[1]) < 0.6] if sid == SHEET_L else []
        big = [b for b in boxes if b not in em_boxes]
        drop = [f for f in found if any(inside([f["pt"][0], f["pt"][1], f["pt"][0], f["pt"][1]], b) for b in big)]
        if drop:
            print(sid, "symbols inside note boxes (not counted):", Counter(f["code"] for f in drop))
        found = [f for f in found if f not in drop]
        note_prims = {i for i, p in enumerate(P) if p["l"] in SYMBOL_LAYERS[sid] and any(inside(bb_of(p), b, 0.5) for b in boxes)}
        for b in em_boxes:          # "חירום": the ceiling point next to the label
            cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            lights = [f for f in found if f["code"] in LIGHTS and not f.get("em")]
            f = min(lights, key=lambda f: math.hypot(f["pt"][0] - cx, f["pt"][1] - cy))
            f["em"] = 1
        for key_, (nx, ny), text, k, q in NOTES:
            if key_ != key:
                continue
            b = next((b for b in big if abs((b[0] + b[2]) / 2 - nx) < 8 and abs((b[1] + b[3]) / 2 - ny) < 8), None)
            if b is None:
                print("  note box not found", key_, nx, ny, text)
                continue
            x0, y0 = Enc(ox, oy, sdx, sdy).xy(b[0], b[1])
            x1, y1 = Enc(ox, oy, sdx, sdy).xy(b[2], b[3])
            notes_out.append({"s": key, "t": text, "k": k, "q": q, "b": [x0, y0, x1 - x0, y1 - y0],
                              "_pt": ((b[0] + b[2]) / 2 + sdx, (b[1] + b[3]) / 2 + sdy)})
        for b in em_boxes:
            x0, y0 = Enc(ox, oy, sdx, sdy).xy(b[0], b[1])
            x1, y1 = Enc(ox, oy, sdx, sdy).xy(b[2], b[3])
            notes_out.append({"s": key, "t": "חירום", "k": "em_kit", "q": 1, "b": [x0, y0, x1 - x0, y1 - y0],
                              "_pt": ((b[0] + b[2]) / 2 + sdx, (b[1] + b[3]) / 2 + sdy)})
        # texts next to the symbols
        if sid == SHEET_L:
            hts = [t for t in strings if re.fullmatch(r"(h=)?\d{2,3}", t["s"])]
            for j, t in attach_text(found, strings, lambda s: bool(tag_of(s)) or s == "דוד", 7.0, hts).items():
                found[j]["tag"] = tag_of(t["s"]) or t["s"]
                if found[j]["tag"] != t["s"]:
                    found[j]["tag_raw"] = t["s"]
                t["used"] = True
            reconcile(found)
        else:
            cand = [f for f in found if f["code"] in SOCKETS or f["code"] in ("L06", "L05", "L03")]
            for f, t in ((cand[j], t) for j, t in attach_text(cand, strings, lambda s: bool(re.fullmatch(r"x\d", s)), 7.0).items()):
                if f["code"] in SOCKETS:
                    f["mult"] = int(t["s"][1:])
        for j, t in attach_text(found, strings, lambda s: bool(re.fullmatch(r"h=\d{2,3}", s)), 7.0).items():
            found[j]["hgt"] = int(t["s"][2:])
        # assign glyph prims
        lay = SYMBOL_LAYERS[sid]
        sym_idx = [i for i, p in enumerate(P) if p["l"] in lay and i not in text_prims and in_crop([v + (sdx if k % 2 == 0 else sdy) for k, v in enumerate(bb_of(p))])]
        bbs = {i: bb_of(P[i]) for i in sym_idx}
        claimed: set[int] = set()
        for f in found:
            if "own" in f:
                f["prims"] = [i for i in f["own"] if i not in claimed]
                claimed.update(f["prims"])
        for f in found:
            if "own" not in f:
                b = f["bbox"]
                f["prims"] = [i for i in sym_idx if i not in claimed and inside(bbs[i], b, 0.8)]
                claimed.update(f["prims"])
        enc = Enc(ox, oy, sdx, sdy, dec=1)
        for f in found:
            x0, y0 = enc.xy(f["bbox"][0], f["bbox"][1])
            x1, y1 = enc.xy(f["bbox"][2], f["bbox"][3])
            gl = [P[i] for i in f["prims"]]
            it = {
                "s": key, "c": f["code"], "x": round((x0 + x1) / 2, 1), "y": round((y0 + y1) / 2, 1),
                "r": round(max(x1 - x0, y1 - y0) / 2, 1), "rv": 2 if f.get("shape") else (1 if f.get("review") else 0),
                "d": enc.path([p for p in gl if not p.get("f")]), "f": enc.path([p for p in gl if p.get("f")]),
                "_pt": (f["pt"][0] + sdx, f["pt"][1] + sdy),
            }
            for a, b in (("tag", "t"), ("mult", "m"), ("hgt", "h"), ("g", "g"), ("role", "role"), ("len", "len"), ("em", "em"), ("tag_raw", "tr")):
                if f.get(a) is not None:
                    it[b] = f[a]
            insts.append(it)
        # repeated shapes that are not in the legend
        index_of = {id(p): i for i, p in enumerate(P)}
        groups = [(g, None) for g in unknown_groups(S, sid, claimed | text_prims | note_prims)]
        if sid == SHEET_L:
            groups.insert(0, (fans(S, sid, claimed | text_prims | note_prims), "L13"))
        for g, sug in groups:
            items = []
            for m in g:
                bx = m["bbox"]
                if not in_crop([bx[0] + sdx, bx[1] + sdy, bx[2] + sdx, bx[3] + sdy]):
                    continue
                ids = [index_of[id(p)] for p in m["prims"] if index_of[id(p)] not in claimed]
                claimed.update(ids)
                gp = [P[i] for i in ids]
                x0, y0 = enc.xy(bx[0], bx[1])
                x1, y1 = enc.xy(bx[2], bx[3])
                item = {"x": round((x0 + x1) / 2, 1), "y": round((y0 + y1) / 2, 1), "r": round(max(x1 - x0, y1 - y0) / 2, 1),
                        "d": enc.path([q for q in gp if not q.get("f")]), "f": enc.path([q for q in gp if q.get("f")]),
                        "_pt": ((bx[0] + bx[2]) / 2 + sdx, (bx[1] + bx[3]) / 2 + sdy)}
                # the fan's own tag (hub label)
                if sid == SHEET_L:
                    near = [t for t in strings if tag_of(t["s"]) and not t.get("used") and gap(t["b"], bx) < 2.0]
                    if near:
                        tt = min(near, key=lambda t: math.hypot((t["b"][0] + t["b"][2]) / 2 - (bx[0] + bx[2]) / 2, (t["b"][1] + t["b"][3]) / 2 - (bx[1] + bx[3]) / 2))
                        item["t"] = tag_of(tt["s"])
                        if item["t"] != tt["s"]:
                            item["tr"] = tt["s"]
                        tt["used"] = True
                items.append(item)
            if len(items) >= 3:
                g0 = min(g, key=lambda m: len(m["prims"]))
                if sug is None:
                    pool = {}
                    for f in found:
                        if f["prims"] and len(f["prims"]) > len(pool.get(f["code"], [])):
                            pool[f["code"]] = [P[i] for i in f["prims"]]
                    sug = suggest(g0["prims"], pool)
                    print("unknown group suggestion", sug)
                unknown_out.append({"s": key, "sug": sug, "glyph": glyph(g0["prims"], g0["bbox"]), "items": items})
        if sid == SHEET_L:
            orphans[key] = sorted(t["s"] for t in strings if TAG.match(t["s"]) and not t.get("used")
                                  and in_crop([t["b"][0] + sdx, t["b"][1] + sdy, t["b"][2] + sdx, t["b"][3] + sdy]))
        if os.environ.get("ELEC_DEBUG"):           # page-coordinate dump for visual checks
            pickle.dump((found, strings), open(Path(os.environ["ELEC_DEBUG"]) / f"fs_{sid}.pkl", "wb"))
        rest = [P[i] for i in sym_idx if i not in claimed]
        sheets_out[key] = {
            "layers": dict(Counter(P[i]["l"] for i in sym_idx)),
            "anno": enc.path([p for p in rest if not p.get("f")]),
            "annoF": enc.path([p for p in rest if p.get("f") and not is_grey(p["f"])]),
            "annoN": enc.path([p for p in rest if p.get("f") and is_grey(p["f"])]),   # note-box backgrounds
            "text": len(strings),
        }
    print("instances", sorted(Counter((i["s"], i["c"], i["rv"]) for i in insts).items()))
    print("unknown groups", [(u["s"], u["sug"], len(u["items"])) for u in unknown_out])
    print("tags without a symbol", orphans)

    # ---------------- legend out ----------------
    legend_out = []
    for code, (grp, he, cat) in LEGEND.items():
        tprims, tb, _ = samples[code]
        texts = E["geometry"]["texts"] if code in rows_e else None
        legend_out.append({"c": code, "g": grp, "he": he, "k": cat, "gl": glyph(tprims, tb, texts)})

    # ---------------- rooms ----------------
    WL = set(BASE_LAYERS["walls"]) | {"Project3|A-WALL-PATT-CUT", "Project3|A-GLAZ", "Project3|A-GLAZ-CUT", "Project3|A-DOOR-FRAM"}
    geoms = []
    for p in PE:
        if p["l"] not in WL:
            continue
        pts = list(zip(p["p"][0::2], p["p"][1::2]))
        if p["t"] == "pg" and len(pts) >= 3 and p.get("f"):
            g = Polygon(pts)
            geoms.append(g if g.is_valid else g.buffer(0))
        elif len(pts) >= 2:
            geoms.append(LineString(pts).buffer(0.9))
    for c in SPLITS:
        geoms.append(LineString(c).buffer(0.6))
    walls = unary_union(geoms)
    room_polys = partition_rooms(fp, walls, r=24)
    rooms_out = []
    used = set()
    for name, (sx, sy) in ROOM_SEEDS:
        pt = Point(sx, sy)
        cand = [i for i, q in enumerate(room_polys) if q.contains(pt)]
        if not cand:
            cand = [min(range(len(room_polys)), key=lambda i: room_polys[i].distance(pt))]
        i = cand[0]
        if i in used:
            print("room seed reused", name)
            continue
        used.add(i)
        q = room_polys[i].simplify(0.8)
        rooms_out.append({"n": name, "poly": q, "area": round(q.area * (K / 100) ** 2, 1)})
    for i, q in enumerate(room_polys):
        if i not in used and q.area * (K / 100) ** 2 > 1.0:
            print("unnamed room", round(q.area * (K / 100) ** 2, 1), q.representative_point())

    def room_of(pt):
        P0 = Point(pt)
        for k2, rm in enumerate(rooms_out):
            if rm["poly"].contains(P0):
                return k2
        best = min(range(len(rooms_out)), key=lambda k2: rooms_out[k2]["poly"].distance(P0))
        return best if rooms_out[best]["poly"].distance(P0) < 22 else -1
    for i in insts:
        i["rm"] = room_of(i.pop("_pt"))
    for u in unknown_out:
        for it in u["items"]:
            it["rm"] = room_of(it.pop("_pt"))
    for n in notes_out:
        n["rm"] = room_of(n.pop("_pt"))
    rooms_json = []
    for rm in rooms_out:
        q = rm["poly"]
        ring = [enc0.xy(x, y) for x, y in list(q.exterior.coords)[:-1]]
        c = q.representative_point()
        rooms_json.append({"n": rm["n"], "k": ROOM_KIND[rm["n"]], "a": rm["area"], "p": [v for xy in ring for v in xy], "c": list(enc0.xy(c.x, c.y))})
    print("rooms", [(r_["n"], r_["a"]) for r_ in rooms_json], "total", round(sum(r_["a"] for r_ in rooms_json), 1))
    print("outside rooms", Counter((i["s"], i["c"]) for i in insts if i["rm"] < 0))

    # ---------------- duplicates between the sheets ----------------
    dup = 0
    for a in insts:
        if a["s"] != "L":
            continue
        for b in insts:
            if b["s"] == "E" and b["c"] == a["c"] and math.hypot(a["x"] - b["x"], a["y"] - b["y"]) < 6:
                dup += 1
    print("cross-sheet duplicates", dup)

    # ---------------- summary: final quantities (every review item accepted, every unknown group
    # assigned to its suggestion).  The demo computes the same numbers live. ----------------
    pts = [{"c": i["c"], "t": i.get("t"), "m": i.get("m"), "role": i.get("role")} for i in insts]
    for u in unknown_out:
        if u["sug"]:
            pts += [{"c": u["sug"], "t": it.get("t")} for it in u["items"]]
    counts = Counter(p["c"] for p in pts if p.get("role") != "of")
    qty = Counter(boq_quantities(pts))
    n_switch_boxes = sum(1 for i in insts if i["c"] in SWITCHES or i.get("g") in SWITCHES)
    for n in notes_out:                       # every note applied
        if n["k"]:
            qty[n["k"]] += n_switch_boxes if n["q"] == "switches" else n["q"]
    lines = []
    for k, code, desc, unit, price in BOQ:
        if qty.get(k):
            lines.append({"k": k, "code": code, "desc": desc, "unit": unit, "qty": qty[k], "price": price, "total": qty[k] * price})
    lines.sort(key=lambda l_: l_["code"])
    net = sum(l_["total"] for l_ in lines)
    summary = {
        "note": "Final state: every review item accepted, every repeated unknown shape assigned to its suggested row, "
                "every designer's note applied. counts = symbols per legend row (switches that belong to a heater are "
                "inside L12); boq = lines with qty > 0, ILS before VAT.",
        "switch_boxes": n_switch_boxes,
        "counts": dict(sorted(counts.items(), key=lambda kv: list(LEGEND).index(kv[0]))),
        "outlets": sum((p.get("m") or 1) for p in pts if p["c"] in SOCKETS and p["c"] != "L04"),
        "boq": lines, "net": net, "vat": round(net * 0.18), "gross": round(net * 1.18),
    }
    print("summary counts", summary["counts"])
    for l_ in lines:
        print(f"  {l_['code']} {l_['desc'][:40]:40s} {l_['qty']:4d} {l_['unit']:6s} {l_['price']:6d} {l_['total']:8d}")
    print("net", net, "gross", summary["gross"])

    data = {
        "w": Wcm, "h": Hcm,
        "groups": GROUPS,
        "base": base,
        "layers": layer_counts,
        "align": [round(dxL * K), round(dyL * K)],
        "sheets": sheets_out,
        "legend": legend_out,
        "boq": [list(b) for b in BOQ],
        "inst": insts,
        "unknown": unknown_out,
        "rooms": rooms_json,
        "orphans": orphans,
        "notes": notes_out,
        "summary": summary,
        "vat": 18,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("wrote", OUT, OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
