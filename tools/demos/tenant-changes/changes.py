"""The tenant's change request, the sales-spec electrical / plumbing points, the reference layers and the sample
price list.

Everything is in centimetres in the clipped apartment frame of extract.py (origin = clip top-left, y down).
The standard plan (plan A) comes from the real drawing; the tenant plan = plan A + the changes below.

Reference layers ("XREF"): the structural concrete comes from the real drawing (every red fill, the thin interior
ones included, which the sales plan draws as plain partitions); the soil stack is the real Ø110 pipe drawn next to the
bathroom column. The safe-room envelope, the wet-room slab recess, the electrical board schedule and the sales-spec
points are a typical spec generated here (not in the source).

Texts are generic: no project, client, architect or address data.
"""
from __future__ import annotations

import json
import math

CM = 2.54 / 72 * 50  # cm per pt on the 1:50 sheet
H_WALL = 2.60        # net partition height (m), for the m² quantities
RECESS = 15          # wet-room slab recess (cm), from the structural layer
PIPE = 11            # soil pipe Ø110 (outer, cm)
SLOPE = 2            # design slope (%)


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]


def arc(cx, cy, r, a0, a1, n=10):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def circle(cx, cy, r, n=16):
    return arc(cx, cy, r, 0, 360, n)


def ellipse(cx, cy, rx, ry, n=20):
    return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n + 1)]


# ---------------------------------------------------------------- rooms (generic names, polygons in cm)
ROOMS = [
    {"id": "mamad", "name": "ממ״ד", "poly": rect(50, 39, 400, 297)[:-1], "lx": 225, "ly": 228},
    {"id": "bed1", "name": "חדר שינה", "poly": rect(39, 317, 295, 634)[:-1], "lx": 167, "ly": 515},
    {"id": "bed2", "name": "חדר הורים", "poly": rect(439, 39, 814, 387)[:-1], "lx": 610, "ly": 285},
    {"id": "kit", "name": "מטבח", "poly": rect(439, 398, 843, 558)[:-1], "lx": 600, "ly": 520},
    {"id": "bath", "name": "חדר רחצה", "poly": rect(825, 39, 1075, 278)[:-1], "lx": 1012, "ly": 172},
    {"id": "bed3", "name": "חדר שינה", "poly": [(947, 285), (1096, 285), (1096, 202), (1268, 202), (1268, 544), (947, 544)], "lx": 1150, "ly": 440},
    {"id": "liv", "name": "סלון ופינת אוכל", "poly": rect(321, 565, 1075, 946)[:-1], "lx": 560, "ly": 640},
    {"id": "corL", "name": "מעבר", "poly": rect(317, 317, 413, 565)[:-1], "lx": 365, "ly": 430, "small": True},
    {"id": "corR", "name": "מעבר", "poly": rect(850, 287, 940, 565)[:-1], "lx": 895, "ly": 470, "small": True},
    {"id": "balc", "name": "מרפסת שמש", "poly": rect(39, 655, 300, 950)[:-1], "lx": 170, "ly": 735},
]


def area(poly):
    a = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2 / 1e4


for r in ROOMS:
    r["area"] = round(area(r["poly"]), 1)

# ---------------------------------------------------------------- doors the option drawing leaves out (bedroom, safe room)
# drawn into the sales plan so that no room is left without a door; the safe-room door opens outwards, as required
BASE_EDITS = {
    "cut": [(296, 548, 323, 628)],                       # opening in the bedroom's block wall
    "wall": [[(299.6, 548), (319.5, 548)], [(299.6, 628), (319.5, 628)]],
    "fix": [
        [(299.6, 628), (219.6, 628)], [(299.6, 623), (219.6, 623), (219.6, 628)], arc(299.6, 628, 80, -90, -180, 12),
        [(384.8, 316.7), (384.8, 386.7)], [(390.8, 316.7), (390.8, 386.7), (384.8, 386.7)], arc(384.8, 316.7, 70, 180, 90, 12),
    ],
}

# ---------------------------------------------------------------- sales-spec points (typical spec, not in the source)
# k: s socket, l ceiling light, w switch, t TV / data, p water point, f 3-phase power point, b apartment board
_P = [
    ("mamad", "l", 225, 168), ("mamad", "s", 392, 90), ("mamad", "s", 150, 47), ("mamad", "t", 392, 180), ("mamad", "w", 300, 289),
    ("bed1", "l", 167, 455), ("bed1", "s", 302, 440), ("bed1", "s", 120, 626), ("bed1", "s", 47, 600), ("bed1", "w", 302, 532),
    ("bed2", "l", 610, 210), ("bed2", "s", 447, 150), ("bed2", "s", 447, 300), ("bed2", "s", 680, 380), ("bed2", "t", 806, 300), ("bed2", "w", 833, 296),
    ("kit", "l", 640, 470), ("kit", "s", 480, 405), ("kit", "s", 580, 405), ("kit", "s", 760, 405), ("kit", "p", 667, 405), ("kit", "p", 812, 405),
    ("bath", "l", 960, 205), ("bath", "s", 1066, 250), ("bath", "w", 840, 296), ("bath", "p", 871, 45), ("bath", "p", 1000, 45), ("bath", "p", 962, 271), ("bath", "p", 1040, 271),
    ("bed3", "l", 1150, 380), ("bed3", "s", 1260, 300), ("bed3", "s", 1260, 500), ("bed3", "s", 1100, 537), ("bed3", "w", 953, 386),
    ("liv", "l", 640, 690), ("liv", "l", 995, 690), ("liv", "l", 940, 880), ("liv", "s", 330, 700), ("liv", "s", 330, 880), ("liv", "s", 560, 938),
    ("liv", "t", 460, 938), ("liv", "s", 1066, 880), ("liv", "w", 965, 935), ("liv", "b", 820, 940),
    ("corL", "l", 365, 380), ("corR", "l", 895, 360),
    ("balc", "l", 170, 820), ("balc", "s", 292, 900),
]
POINTS = []
_cnt = {}
for room, k, x, y in _P:
    _cnt[k] = _cnt.get(k, 0) + 1
    POINTS.append({"id": f"{k}{_cnt[k]:02d}", "k": k, "x": x, "y": y, "r": room})


def pid(room, k, x, y):
    for p in POINTS:
        if p["r"] == room and p["k"] == k and p["x"] == x and p["y"] == y:
            return p["id"]
    raise KeyError((room, k, x, y))


# ---------------------------------------------------------------- reference layers (XREF)
STACK = (1069.7, 295.5)          # the Ø110 soil stack next to the bathroom column (real, drawn in the source)
BATH_IN = (824.7, 39.4, 1074.8, 277.7)
XREF = {
    "mamad": [19.4, 19.4, 419.4, 316.7],   # safe-room envelope (outer faces of its concrete)
    "recess": [{"box": list(BATH_IN), "label": f"שקיעה −{RECESS}"}],
    "risers": [{"x": STACK[0], "y": STACK[1], "r": 5.1, "label": "קולטן ביוב Ø110"}],
}
BOARD = {"conn": "3×25A", "slots": 24, "used": 22}   # electrical plan: apartment board schedule (typical)
STAGE = "שלד: קירות ועמודים יצוקים, תקרת הדירה בטפסנות. מחיצות, חשמל ואינסטלציה טרם בוצעו."

# ---------------------------------------------------------------- sample price list (labelled as such in the UI)
# numbering follows the chapters of the general specification (02 concrete, 04 masonry, 06 joinery, 07 plumbing,
# 08 electrical, 22 drywall); 00 = package items. Prices in ₪ before VAT; credit = a negative line.
PRICES = [
    {"code": "00.01.0010", "desc": "דמי טיפול: עדכון תוכניות לביצוע ותיאום יועצים", "unit": "קומפ׳", "up": 1500, "pkg": True},
    {"code": "04.01.0210", "desc": "ביטול מחיצת בלוקים 7 ס״מ שטרם נבנתה", "unit": "מ״ר", "up": 85, "credit": True},
    {"code": "04.01.0110", "desc": "הזזת מחיצת בלוקים 10 ס״מ, כולל טיח דו־צדדי", "unit": "מ״ר", "up": 430},
    {"code": "22.02.0040", "desc": "ביטול סגירה בפינה, כולל השלמת טיח", "unit": "יח׳", "up": 380},
    {"code": "06.01.0040", "desc": "הזזת פתח דלת פנים לפני התקנת משקוף, כולל השלמת מחיצה", "unit": "יח׳", "up": 650},
    {"code": "08.02.0020", "desc": "הזזת מפסק תאורה", "unit": "נק׳", "up": 180},
    {"code": "08.01.0020", "desc": "תוספת נקודת שקע כפול 16A", "unit": "נק׳", "up": 390},
    {"code": "08.05.0030", "desc": "נקודת תקשורת, כולל צנרת וחוט משיכה", "unit": "נק׳", "up": 420},
    {"code": "08.03.0040", "desc": "נקודת כוח תלת־פאזית 3×16A במעגל נפרד", "unit": "נק׳", "up": 1450},
    {"code": "08.06.0010", "desc": "הרחבת לוח החשמל הדירתי: שורה נוספת ושינוי חיווט", "unit": "קומפ׳", "up": 950},
    {"code": "08.02.0010", "desc": "הזזת נקודת מאור בתקרה, לפני יציקה", "unit": "נק׳", "up": 260},
    {"code": "07.04.0120", "desc": "המרת אמבטיה למקלחון: מחסום רצפה, שיפועים ואיטום, בניכוי האמבטיה", "unit": "קומפ׳", "up": 2350},
    {"code": "07.02.0060", "desc": "העתקת אסלה וכיור באותו חדר, כולל ניקוז ומים", "unit": "קומפ׳", "up": 2900},
    {"code": "07.01.0050", "desc": "נקודת מים קרים למקרר, כולל ברז ניל", "unit": "נק׳", "up": 650},
]

# ---------------------------------------------------------------- geometry facts used by the checks
_c_fridge = (445, 500)
_toilet_a = (962, 250)          # toilet outlet in the sales plan
_toilet_b = (871, 76)           # toilet outlet in the tenant plan
_shower = (924.5, 39.4, 1074.4, 109.7)
_shower_drain = (999.5, 74.5)
_bed3_door_jamb = 440           # handle-side jamb of the moved bedroom door (y)
_bed3_switch = (953, 386)


def _need(L_m):
    """cm under the floor for a Ø110 line of L metres at the design slope (+2 cm bedding)."""
    return PIPE + SLOPE * L_m + 2


# ---------------------------------------------------------------- the tenant's change request
# cat: wall | door | elec | plumb
# check.res: ok (passes) | add (passes with an extra line the tenant's plan left out) | fail (cannot be approved) |
#            eng (needs a consultant before a decision)
# lines: price lines; auto = added by the check, not in the tenant's plan
# sug: points the check adds (drawn dashed on the plan)
CHANGES = [
    {
        "id": "01", "cat": "wall", "layer": "A-WALL", "kind": "removed", "room": "מטבח / מעבר",
        "title": "ביטול המחיצה בין המטבח למעבר",
        "ai": "בתוכנית הדייר המחיצה בין המטבח למעבר בוטלה, והמטבח נפתח למעבר ולחדרי השינה.",
        "at": [880, 478], "zoom": [700, 330, 380, 300],
        "rm": [(840, 399.5, 853, 557)],
        "add": {"wall": [[(842.8, 399.5), (849.5, 399.5)], [(842.8, 557), (849.5, 557)]]},
        "check": {"res": "ok", "tag": "תקין", "src": "קונסטרוקציה, חשמל ואינסטלציה",
                  "detail": "מחיצת בלוקים 7 ס״מ. בתוכנית הקונסטרוקציה אין בקו הזה בטון. אין בקיר נקודות חשמל או מים, וחיבורי המדיח בקיר הצפוני לא נפגעים."},
        "lines": [{"code": "04.01.0210", "len": (557 - 399.5) / 100}],
    },
    {
        "id": "02", "cat": "wall", "layer": "A-WALL", "kind": "moved", "room": "חדר רחצה / חדר הורים",
        "title": "הגדלת חדר הרחצה: הזזת הקיר לחדר ההורים ב־70 ס״מ",
        "ai": "הקיר בין חדר הרחצה לחדר ההורים זז 70 ס״מ מערבה. ארון הקיר בוטל, וחדר הרחצה גדל ב־1.7 מ״ר.",
        "at": [780, 200], "zoom": [640, 0, 440, 330],
        "rm": [(752, 40.5, 828, 286.5)],
        "add": {"wall": [[(744, 39.4), (744, 287.4)], [(755, 39.4), (755, 277.7), (828, 277.7)]]},
        "check": {"res": "fail", "tag": "קיר בטון נושא", "log": "בתוכנית המכר מחיצה, בתוכנית הקונסטרוקציה קיר בטון. נחסם.", "src": "תוכנית קונסטרוקציה · S-CONC", "str": True,
                  "detail": "בתוכנית המכר הקיר מצויר כמו כל מחיצה, בעובי {t} ס״מ. בתוכנית הקונסטרוקציה הוא קיר בטון מזוין שנושא את התקרה, ממשיך את קו העמודים, וכבר יצוק. אי אפשר להזיז אותו.",
                  "suggest": "להשאיר את הקיר במקומו. את שטח ארון הקיר אפשר לנצל כנישה בחדר ההורים."},
        "lines": [{"code": "04.01.0110", "len": 2.39}],
    },
    {
        "id": "03", "cat": "wall", "layer": "A-WALL", "kind": "removed", "room": "חדר שינה",
        "title": "ארון קיר בחדר השינה: ביטול הבליטה ליד העמוד",
        "ai": "בתוכנית הדייר נוסף ארון קיר לאורך הקיר הצפוני, והבליטה הקטנה בפינה, ליד העמוד, נמחקה כדי ליישר את הקיר.",
        "at": [1012, 330], "zoom": [930, 230, 240, 190], "pill": "below",
        "rm": [{"b": (1062, 286, 1074.6, 311), "lay": ("wall",)}],
        "add": {"furn": [rect(947.5, 285.5, 1074, 345), [(947.5, 285.5), (1074, 345)], [(1074, 285.5), (947.5, 345)]]},
        "check": {"res": "fail", "tag": "קולטן ביוב", "log": "הבליטה שנמחקה היא סגירת קולטן ביוב Ø110. נחסם.", "src": "אינסטלציה · חדירה בתקרה בתוכנית הקונסטרוקציה", "str": True,
                  "detail": "הבליטה היא סגירה של קולטן ביוב Ø110 שעובר בכל הקומות ומנקז את חדרי הרחצה שמעל. בתוכנית המכר רואים רק עיגול קטן ליד העמוד. את הקולטן אי אפשר להזיז או לבטל.",
                  "suggest": "לתכנן את הארון עד הבליטה, קצר ב־10 ס״מ. הארון עצמו הוא נגרות של הדייר ולא נכנס לתמחור."},
        "lines": [{"code": "22.02.0040", "qty": 1}],
    },
    {
        "id": "04", "cat": "door", "layer": "A-DOOR", "kind": "moved", "room": "חדר שינה",
        "title": "הזזת דלת חדר השינה 45 ס״מ דרומה",
        "ai": "פתח הדלת בקיר המעבר זז 45 ס״מ דרומה, כדי לפנות את הפינה לארון החדש.",
        "at": [985, 480], "zoom": [840, 320, 340, 260],
        "rm": [(936, 393, 1014, 477), (936, 438, 951, 520)],
        "add": {
            "wall": [[(939.8, 394.5), (939.8, 440), (946.5, 440), (946.5, 394.5)], [(939.8, 520), (946.5, 520)]],
            "fix": [[(946.5, 514), (1011.5, 514)], [(941.9, 509), (1011.5, 509), (1011.5, 514)], arc(946.5, 514, 65, -90, 0, 9)],
        },
        "sug": [{"k": "w", "x": 953, "y": 432}],
        "check": {"res": "add", "tag": "חסר: הזזת מפסק", "log": "הדלת זזה והמפסק נשאר. נוסף סעיף נלווה.", "src": "חשמל · E-LITE",
                  "detail": "מחיצת בלוקים 7 ס״מ, ופתח הדלת לא משתנה (80 ס״מ). אבל מפסק התאורה של החדר נשאר במקומו: {d} ס״מ מהמשקוף החדש, במקום {d0} ס״מ היום. בתוכנית הדייר הוא לא זז.",
                  "add": "הזזת מפסק התאורה ליד הדלת החדשה"},
        "lines": [{"code": "06.01.0040", "qty": 1}, {"code": "08.02.0020", "qty": 1, "auto": True}],
    },
    {
        "id": "05", "cat": "elec", "layer": "E-POWR", "kind": "added", "room": "חדר שינה",
        "title": "שקע כפול ונקודת תקשורת לשולחן עבודה",
        "ai": "על הקיר הצפוני של החדר נוספו שקע כפול ונקודת תקשורת, לשולחן עבודה.",
        "at": [190, 370], "zoom": [0, 240, 420, 290], "pill": "below",
        "pb": [{"id": "s90", "k": "s", "x": 215, "y": 325, "r": "bed1"}, {"id": "t90", "k": "t", "x": 165, "y": 325, "r": "bed1"}],
        "check": {"res": "fail", "tag": "קיר ממ״ד", "log": "הנקודות על קיר הממ״ד, מצד החדר. נחסם.", "src": "מעטפת ממ״ד · תוכנית קונסטרוקציה", "str": True,
                  "detail": "הקיר הצפוני של החדר הוא קיר הממ״ד, בטון מזוין {t} ס״מ. מתוך החדר הוא נראה כמו קיר רגיל. לפי הנחיות פיקוד העורף אסור לחצוב בקירות הממ״ד או להעביר בהם צנרת חדשה, גם מהצד של החדר.",
                  "suggest": "להעביר את הנקודות לקיר המזרחי, ליד השקע הקיים. גם הוא בטון, אבל לא ממ״ד: חריץ לצנרת מותר באישור הקונסטרוקטור."},
        "lines": [{"code": "08.01.0020", "qty": 1}, {"code": "08.05.0030", "qty": 1}],
    },
    {
        "id": "06", "cat": "elec", "layer": "E-POWR", "kind": "added", "room": "חדר הורים",
        "title": "שקע כפול בחדר ההורים",
        "ai": "נוסף שקע כפול על הקיר הצפוני של חדר ההורים, לשידת איפור.",
        "at": [560, 95], "zoom": [420, 0, 340, 260],
        "pb": [{"id": "s91", "k": "s", "x": 560, "y": 47, "r": "bed2"}],
        "check": {"res": "ok", "tag": "תקין", "src": "קונסטרוקציה, חשמל",
                  "detail": "קיר חוץ מבלוקים, לא בטון לפי תוכנית הקונסטרוקציה. מתחבר למעגל השקעים של החדר."},
        "lines": [{"code": "08.01.0020", "qty": 1}],
    },
    {
        "id": "07", "cat": "elec", "layer": "E-POWR", "kind": "added", "room": "מטבח",
        "title": "נקודת כוח תלת־פאזית לכיריים אינדוקציה",
        "ai": "מתחת למשטח, במקום הכיריים, נוספה נקודת כוח תלת־פאזית לכיריים אינדוקציה.",
        "at": [515, 445], "zoom": [400, 360, 500, 610],
        "pb": [{"id": "f90", "k": "f", "x": 517, "y": 406, "r": "kit"}],
        "sug": [{"k": "b", "x": 820, "y": 940}],
        "check": {"res": "add", "tag": "חסר: הרחבת לוח", "log": "אין מקום בלוח למפסק תלת־פאזי. נוסף סעיף נלווה.", "src": "תוכנית חשמל · טבלת לוח הדירה",
                  "detail": "חיבור הדירה {conn}, מספיק לכיריים. אבל בלוח הדירה נשארו {free} מקומות פנויים, והמפסק התלת־פאזי צריך 3. הקיר מאחורי הכיריים הוא בטון, ולכן ההזנה עוברת במילוי הרצפה ועולה בתוך ארון המטבח, בלי חציבה.",
                  "add": "הרחבת לוח החשמל הדירתי"},
        "lines": [{"code": "08.03.0040", "qty": 1}, {"code": "08.06.0010", "qty": 1, "auto": True}],
    },
    {
        "id": "08", "cat": "elec", "layer": "E-LITE", "kind": "moved", "room": "סלון",
        "title": "הזזת נקודת מאור בסלון ב־1.2 מ׳",
        "ai": "נקודת התקרה של הסלון זזה 1.2 מ׳ דרומה, אל מעל פינת הישיבה.",
        "at": [640, 750], "zoom": [460, 600, 380, 300],
        "pa": ["l07"], "pb": [{"id": "l90", "k": "l", "x": 640, "y": 810, "r": "liv"}],
        "check": {"res": "ok", "tag": "תקין", "src": "לוח זמנים: יציקת תקרה",
                  "detail": "תקרת הדירה עדיין בטפסנות, כך שהצנרת בתקרה עוד ניתנת לשינוי. אותו מעגל תאורה. את השינוי חייבים להעביר לאתר לפני יציקת התקרה."},
        "lines": [{"code": "08.02.0010", "qty": 1}],
    },
    {
        "id": "09", "cat": "elec", "layer": "E-POWR", "kind": "added", "room": "פינת אוכל",
        "title": "שקע כפול בפינת האוכל",
        "ai": "נוסף שקע כפול על הקיר המזרחי, ליד פינת האוכל.",
        "at": [1022, 600], "zoom": [900, 500, 260, 200],
        "pb": [{"id": "s92", "k": "s", "x": 1067, "y": 585, "r": "liv"}],
        "check": {"res": "ok", "tag": "תקין", "src": "קונסטרוקציה, חשמל",
                  "detail": "קיר בלוקים ליד החלון, לא בטון. מתחבר למעגל השקעים של הסלון."},
        "lines": [{"code": "08.01.0020", "qty": 1}],
    },
    {
        "id": "10", "cat": "plumb", "layer": "P-FIXT", "kind": "changed", "room": "חדר רחצה",
        "title": "המרת האמבטיה למקלחון",
        "ai": "האמבטיה בוטלה, ובמקומה מקלחון פתוח עם ניקוז רצפתי.",
        "at": [1000, 140], "zoom": [830, 0, 290, 240],
        "rm": [{"b": (923.5, 41, 1073, 111), "lay": ("fix", "furn")}],
        "add": {"fix": [rect(*_shower), [(_shower[0], _shower[1]), (_shower[2], _shower[3])], [(_shower[2], _shower[1]), (_shower[0], _shower[3])],
                        circle(*_shower_drain, 5, 12)]},
        "check": {"res": "ok", "tag": "תקין", "src": "אינסטלציה · שקיעה בתוכנית הקונסטרוקציה",
                  "detail": "המקלחון נשאר בתוך השקיעה של חדר הרחצה, מעל חדר רחצה בקומה שמתחת. מחסום הרצפה במקום ניקוז האמבטיה, {dr} מ׳ מהקולטן. שיפועים ואיטום כרגיל."},
        "lines": [{"code": "07.04.0120", "qty": 1}],
    },
    {
        "id": "11", "cat": "plumb", "layer": "P-FIXT", "kind": "moved", "room": "חדר רחצה",
        "title": "החלפת מקום האסלה והכיור",
        "ai": "האסלה עברה לפינה הצפונית־מערבית של חדר הרחצה, והכיור עבר למקום האסלה.",
        "at": [878, 150], "zoom": [800, 0, 300, 300],
        "rm": [{"b": (823, 41, 926, 92), "lay": ("fix", "furn")}, {"b": (938, 210, 988, 277.5), "lay": ("fix",)}],
        "add": {"fix": [rect(849, 41, 893, 58), ellipse(871, 82, 17, 24), ellipse(871, 84, 11, 16, 16),
                        rect(936, 230, 990, 277.7), ellipse(963, 252, 19, 14, 18)]},
        "check": {"res": "eng", "tag": "נדרש יועץ אינסטלציה", "log": "קו Ø110 לא נכנס בשקיעה. לבדיקת יועץ האינסטלציה.", "src": "אינסטלציה · שקיעה בתוכנית הקונסטרוקציה", "str": True,
                  "detail": "המרחק מהאסלה לקולטן הביוב גדל מ־{d0} מ׳ ל־{d1} מ׳. קו Ø110 בשיפוע {slope}% צריך עכשיו כ־{n1} ס״מ מתחת לריצוף, והשקיעה ברצפת חדר הרחצה היא {rec} ס״מ בלבד.",
                  "suggest": "להעביר ליועץ האינסטלציה לבדיקת תוואי והגבהה מקומית. בלי אישורו, האסלה נשארת במקומה."},
        "lines": [{"code": "07.02.0060", "qty": 1}],
    },
    {
        "id": "12", "cat": "plumb", "layer": "P-WATR", "kind": "added", "room": "מטבח",
        "title": "נקודת מים למקרר",
        "ai": "המקרר עבר לפינה המערבית של המטבח, ונוספה נקודת מים קרים למתקן המים שלו.",
        "at": [530, 505], "zoom": [400, 380, 300, 220],
        "add": {"furn": [rect(441, 468, 501, 530), [(441, 520), (501, 520)]]},
        "pb": [{"id": "p90", "k": "p", "x": _c_fridge[0], "y": _c_fridge[1], "r": "kit"}],
        "check": {"res": "ok", "tag": "תקין", "src": "אינסטלציה",
                  "detail": "קו מים {w} מ׳ מהכיור, במילוי הרצפה. היציאה בקיר בלוקים מאחורי המקרר, עם ברז ניל."},
        "lines": [{"code": "07.01.0050", "qty": 1}],
    },
    # ---- differences the QA agent filters out (not construction changes)
    {
        "id": "N1", "noise": True, "cat": "furn", "layer": "A-FURN", "kind": "moved", "room": "סלון",
        "title": "מיקום הספה בסלון",
        "ai": "הספה הגדולה מוקמה 40 ס״מ מערבה.",
        "qa": "ריהוט בלבד. אינו שינוי בנייה, הוצא מהרשימה.",
        "at": [570, 728], "zoom": [430, 640, 300, 200],
        "rm": [(460, 688, 680, 768)],
        "add": {"furn": [rect(425, 693, 635, 764), rect(441, 708, 620, 764), [(500, 708), (500, 764)], [(560, 708), (560, 764)]]},
    },
    {
        "id": "N2", "noise": True, "cat": "text", "layer": "A-ANNO", "kind": "changed", "room": "חדר שינה",
        "title": "שם החדר: ״חדר עבודה״",
        "ai": "בתוכנית הדייר החדר המערבי נקרא ״חדר עבודה״.",
        "qa": "שינוי כיתוב בלבד. הוצא מהרשימה.",
        "at": [167, 515], "zoom": [40, 400, 260, 220],
        "rename": {"bed1": "חדר עבודה"},
    },
]


def thickness(geom, box):
    """Thickness (cm, rounded to 5) of the concrete inside box, from its smaller bound."""
    from shapely.geometry import box as sbox
    g = geom.intersection(sbox(*box))
    if g.is_empty:
        return None
    x0, y0, x1, y1 = g.bounds
    return max(5, round(min(x1 - x0, y1 - y0) / 5) * 5)


def finalize(changes, conc_all, prices):
    """Fill the numbers in the check texts and the quantities (from the geometry)."""
    pr = {p["code"]: p for p in prices}
    for ch in changes:
        c = ch.get("check")
        for ln in ch.get("lines", []):
            if "len" in ln:  # wall length (m) -> area (m²) at the net partition height
                L = ln.pop("len")
                ln["qty"] = round(L * H_WALL, 1)
                ln["note"] = f"{L:.2f} מ׳ × גובה {H_WALL:.2f} מ׳"
            assert ln["code"] in pr, ln["code"]
        if not c:
            continue
        f = {}
        if ch["id"] == "02":
            f["t"] = thickness(conc_all, (812, 60, 828, 260))
        if ch["id"] == "05":
            f["t"] = thickness(conc_all, (60, 290, 280, 320))
        if ch["id"] == "04":
            f["d"] = round(_bed3_door_jamb - _bed3_switch[1])
            f["d0"] = round(394.5 - _bed3_switch[1])
        if ch["id"] == "07":
            f["conn"] = BOARD["conn"]
            f["free"] = BOARD["slots"] - BOARD["used"]
        if ch["id"] == "10":
            f["dr"] = f"{math.dist(_shower_drain, STACK) / 100:.1f}"
        if ch["id"] == "11":
            d0, d1 = math.dist(_toilet_a, STACK) / 100, math.dist(_toilet_b, STACK) / 100
            f.update(d0=f"{d0:.1f}", d1=f"{d1:.1f}", n1=round(_need(d1)), rec=RECESS, slope=SLOPE)
            c["need0"], c["need1"] = round(_need(d0)), round(_need(d1))
        if ch["id"] == "12":
            kp = [p for p in POINTS if p["r"] == "kit" and p["k"] == "p"]
            f["w"] = f"{min(math.dist(_c_fridge, (p['x'], p['y'])) for p in kp) / 100:.1f}"
        c["detail"] = c["detail"].format(**f)
    return changes


def align_info(path):
    """Registration numbers of the real comparison (how far the received tenant plan was off)."""
    d = json.loads(open(path, encoding="utf-8").read())
    t = d["transform"]
    return {
        "inliers": int(t["inliers"]),
        "residual_px": round(float(t["residual_px"]), 1),
        "dx": round(float(t["tx"]) * CM),
        "dy": round(float(t["ty"]) * CM),
        "rot": round(float(t.get("theta_deg", 0)), 4),
        "scale": round(float(t["s"]), 5),
    }
