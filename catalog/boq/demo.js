/* BOQ-AI demo: from a set of drawing sheets of a private house to a bill of quantities by the chapters
   of the Israeli general specification. Data (catalog/boq/data.json) is extracted by tools/demos/boq/extract.py
   from a real, anonymized project: vector geometry of 4 sheets, rooms with their boundaries split into wall /
   openings / open plan, walls by class, doors and windows, plumbing labels, and the electrical demo's reading
   of the power and lighting sheets (chapter 08 here is that bill, line by line). Every quantity is computed
   here, live, from that data and the assumptions the visitor can edit. */
(() => {
  "use strict";

  /* ---------------- product content ---------------- */
  const SHEETS = {
    A: { code: "A-101", t: "תוכנית קומת קרקע", disc: "אדריכלות", color: "#8fb8e8" },
    E: { code: "E-101", t: "חשמל ותקשורת", disc: "חשמל", color: "#e8a84c" },
    L: { code: "E-102", t: "תוכנית תאורה", disc: "תאורה", color: "#dcc85e" },
    P: { code: "P-101", t: "תוכנית אינסטלציה", disc: "אינסטלציה", color: "#5fb0f2" },
  };
  const ORDER = ["A", "E", "L", "P"];
  // chapters of the general specification (המפרט הכללי) used by this set
  const CH = {
    "04": "עבודות בנייה", "05": "עבודות איטום", "06": "נגרות אומן ומסגרות פלדה", "07": "מתקני תברואה",
    "08": "מתקני חשמל", "09": "עבודות טיח", "10": "עבודות ריצוף וחיפוי", "11": "עבודות צביעה", "12": "עבודות אלומיניום",
  };
  // opening types on the architecture sheet; sill / head above finished floor (m) are assumptions: no sections in the set
  const OT = {
    door_in: { n: "דלת פנים", sill: 0, head: 2.15 },
    door_ent: { n: "דלת כניסה (כנף וחצי)", sill: 0, head: 2.2 },
    door_mamad: { n: "דלת ממ״ד", sill: 0, head: 2.05 },
    door_ext: { n: "דלת ליציאה לחצר", sill: 0, head: 2.15 },
    win_sh: { n: "חלון עם תריס חשמלי", sill: 0.9, head: 2.15 },
    slide_sh: { n: "דלת הזזה לגינה עם תריס חשמלי", sill: 0, head: 2.2 },
    win_wet: { n: "חלון לחדר רטוב / מזווה", sill: 1.45, head: 2.05 },
    win_mamad: { n: "חלון ממ״ד (הדף)", sill: 1.05, head: 2.05 },
    vitrine: { n: "ויטרינה קבועה", sill: 0.4, head: 2.2 },
  };
  const DRY = new Set(["bed", "kitchen", "living", "dining", "store", "hall"]);
  const WET = new Set(["bath", "wc", "laundry"]);         // "service" = מרפסת שירות: outside, floor and waterproofing only
  // sample price list (contractor prices 2026, ILS before VAT, overhead and profit included). Chapter 08 comes from the electrical bill.
  const L_DEF = {
    "b:10": ["04", "04.01.010", "מחיצות בלוקי בטון חלולים בעובי 10 ס״מ", "מ\"ר", 175],
    "b:20": ["04", "04.01.020", "קירות בלוקי בטון בעובי 20 ס״מ", "מ\"ר", 235],
    "wp:floor": ["05", "05.01.010", "איטום רצפות בחדרים רטובים ובמרפסת השירות: מריחה צמנטית דו־רכיבית בשתי שכבות, כולל רולקות והגבהה 20 ס״מ על הקירות", "מ\"ר", 140],
    "wp:shower": ["05", "05.01.020", "איטום קירות בתאי המקלחת עד גובה 2.00 מ׳: מריחה צמנטית גמישה, כולל רשת בפינות", "מ\"ר", 95],
    "d:70": ["06", "06.01.010", "דלת פנים 70/210: כנף לבודה, משקוף פח, ידית ומנעול תפוס־פנוי", "יח'", 1950],
    "d:80": ["06", "06.01.020", "דלת פנים 80/210: כנף לבודה, משקוף פח, ידית ומנעול", "יח'", 2050],
    "d:ent": ["06", "06.02.010", "דלת כניסה מפלדה, כנף וחצי (כ־130/220), כולל משקוף, מנעול רב־בריח ועינית", "יח'", 10500],
    "d:mamad": ["06", "06.03.010", "דלת הדף לממ״ד 80/200 כולל משקוף, מאושרת פיקוד העורף", "יח'", 5200],
    "w:blast": ["06", "06.03.020", "חלון הדף מפלדה לממ״ד 100/100 כולל משקוף, מאושר פיקוד העורף", "יח'", 3300],
    "pt:walls": ["09", "09.01.010", "טיח פנים בשתי שכבות (מיישרת וגמר) על קירות, כולל רשת בחיבורי בטון–בלוק ופינות מגן", "מ\"ר", 72],
    "pt:cement": ["09", "09.01.020", "טיח צמנטי מיישר על קירות מתחת לחיפוי", "מ\"ר", 60],
    "pt:ceil": ["09", "09.01.030", "טיח פנים בתקרות בטון", "מ\"ר", 88],
    "fl:dry": ["10", "10.01.010", "ריצוף גרניט פורצלן 80/80 בחדרים יבשים, מחיר יסוד 90 ₪/מ״ר, כולל רובה", "מ\"ר", 265],
    "fl:wet": ["10", "10.01.020", "ריצוף גרניט פורצלן 60/60 נגד החלקה (R11) בחדרים רטובים ובמרפסת השירות, מחיר יסוד 80 ₪/מ״ר", "מ\"ר", 245],
    "fl:skirt": ["10", "10.02.010", "שיפולים מגרניט פורצלן בגובה 7 ס״מ", "מ\"א", 58],
    "fl:clad": ["10", "10.03.010", "חיפוי קירות בחדרים רטובים באריחי פורצלן, מחיר יסוד 80 ₪/מ״ר, כולל פינות אלומיניום", "מ\"ר", 275],
    "fl:bs": ["10", "10.03.020", "חיפוי קיר במטבח בין ארונות, גובה 60 ס״מ", "מ\"ר", 310],
    "pa:walls": ["11", "11.01.010", "צבע אקרילי (סופרקריל) לקירות פנים: שכבת יסוד ושתי שכבות", "מ\"ר", 32],
    "pa:ceil": ["11", "11.01.020", "צבע אקרילי לתקרות; בחדרים רטובים צבע עמיד לעובש", "מ\"ר", 34],
    "al:wide": ["12", "12.01.010", "חלון אלומיניום הזזה כנף על כנף, רוחב 1.0–2.0 מ׳, זיגוג בידודי, כולל ארגז ותריס גלילה חשמלי", "יח'", 5600],
    "al:narrow": ["12", "12.01.020", "חלון אלומיניום הזזה עד רוחב 1.0 מ׳, זיגוג בידודי, כולל ארגז ותריס גלילה חשמלי", "יח'", 3900],
    "al:slide": ["12", "12.01.030", "דלת הזזה לגינה, רוחב כ־3.0 מ׳, זיגוג בידודי, כולל ארגז ותריס גלילה חשמלי", "יח'", 16500],
    "al:wet": ["12", "12.01.040", "חלון אלומיניום קיפ / ציר לחדר רטוב ולמזווה, עד רוחב 1.0 מ׳, זכוכית חלבית", "יח'", 1750],
    "al:vitrine": ["12", "12.01.050", "ויטרינה קבועה, רוחב כ־2.4 מ׳, זיגוג בידודי", "יח'", null],
    "al:ext": ["12", "12.01.060", "דלת ציר מאלומיניום ליציאה לחצר, זיגוג בטיחותי", "יח'", 4800],
    "al:mamad": ["12", "12.01.070", "חלון אלומיניום נגרר לכיס לממ״ד, מול חלון ההדף", "יח'", 2400],
  };
  // chapter 07 from the plumbing labels
  const PL_BOQ = [
    ["basin_pt", "07.01.010", "נקודת כיור: מים חמים וקרים + ניקוז, ברז פרח, כולל צנרת עד המחלק", "נק'", 780],
    ["shower_pt", "07.01.020", "נקודת מקלחת: מים חמים וקרים לסוללה סמויה (אינטרפוץ), כולל יציאה לראש טוש מהקיר", "נק'", 880],
    ["bidet", "07.01.030", "נקודת מים קרים לברז שטיפה ליד האסלה, כולל מאחז", "נק'", 390],
    ["washer", "07.01.040", "נקודת מכונת כביסה: ברזי ניל חמים וקרים + ניקוז עם סיפון", "נק'", 720],
    ["fridge", "07.01.050", "נקודת מים קרים למקרר, כולל ברז ניל", "נק'", 340],
    ["osmosis", "07.01.060", "הכנה למתקן אוסמוזה: מים קרים + ניקוז בארון הכיור", "נק'", 420],
    ["ac_drain", "07.01.070", "נקודת ניקוז מי עיבוי למזגן, כולל פתח שירות", "נק'", 420],
    ["garden_tap", "07.01.080", "ברז גינה ¾״ כולל נקודת מים", "נק'", 480],
    ["irrigation", "07.01.090", "הכנה למחשב השקיה ליד ברז הגינה", "יח'", 320],
    ["wc", "07.02.010", "נקודת אסלה תלויה: מיכל הדחה סמוי עם מסגרת ולחצן, כולל חיבור לשופכין 110", "יח'", 1850],
    ["channel", "07.02.020", "תעלת ניקוז ליניארית מנירוסטה למקלחת, כולל מחסום", "יח'", 950],
    ["floor_drain", "07.02.030", "מחסום רצפה 4״ למקלחת (השלמה: לא מסומן בגיליון)", "יח'", 380],
    ["wc_inst", "07.03.010", "התקנת אסלה תלויה ומושב בהספקת המזמין", "יח'", 280],
    ["basin_inst", "07.03.020", "התקנת כיור רחצה וברז פרח בהספקת המזמין", "יח'", 320],
    ["shower_inst", "07.03.030", "התקנת סוללה סמויה, ראש טוש ומזלף בהספקת המזמין", "יח'", 450],
    ["gas", "07.04.010", "נקודת גז למייבש כביסה, כולל צנרת מקיר החוץ", "נק'", null],
  ];
  const PL_EFF = {
    basin: { basin_pt: 1, basin_inst: 1 }, kitchen: { basin_pt: 1, osmosis: 1 }, mixer3: { shower_pt: 1, shower_inst: 1 },
    mixer4: { shower_pt: 1, shower_inst: 1 }, head: {}, bidet: { bidet: 1 }, wc: { wc: 1, wc_inst: 1 }, wc_ext: { wc: 1, wc_inst: 1 },
    washer: { washer: 1 }, fridge: { fridge: 1 }, ac_drain: { ac_drain: 1 }, garden: { garden_tap: 1 },
    garden_irr: { garden_tap: 1, irrigation: 1 }, gas: { gas: 1 }, channel: { channel: 1 },
  };
  const WALL_COL = { conc18: "#82aaff", conc22: "#5fd3b5", conc30: "#c792ea", block10: "#ffcb6b", block20: "#f7a35c" };
  const CM_PER_PT = 1.7639; // 1:50, derived by the product from the door swings
  const CONF = { high: ["ok", "ביטחון גבוה"], medium: ["info", "ביטחון בינוני"], low: ["warn", "לבדיקה"] };
  const METHOD = { count: "ספירה", area: "שטח", length: "אורך" };
  const SWITCH = new Set(["L23", "L24", "L25", "L26"]), LSW = new Set(["L23", "L24", "L25"]);
  const WPL = new Set(["L17", "L18"]), SOCK = new Set(["L29", "L30", "L31", "L32a", "L32b", "L33"]);

  /* ---------------- load ---------------- */
  fetch("/catalog/boq/data.json")
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(init)
    .catch(() => {
      document.body.insertAdjacentHTML("afterbegin", '<p class="d-boot">הדמו לא נטען. נסו לרענן את העמוד.</p>');
    });

  function init(DATA) {
    const U = DATA.u;
    const AR = matchMedia("(max-width: 640px)").matches ? 1.2 : 1.5;
    const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
    const R = DATA.rooms, O = DATA.open, EL = DATA.el;
    const LG = EL.legend;                       // code -> [description, BOQ key, group, glyph]
    const EB = Object.fromEntries(EL.boq.map(([k, code, d, u, p]) => [k, { k, code, d, u, p }]));
    const PB = Object.fromEntries(PL_BOQ.map(([k, code, d, u, p]) => [k, { k, code, d, u, p }]));
    const LIGHTS = new Set(Object.keys(LG).filter((c) => LG[c][1] === "light"));

    const homeVB = (k) => {
      let [x, y, w, h] = DATA.sheets[k].vb;
      if (k === "A") [x, y, w, h] = [-(y + h), x, h, w]; // shown rotated, like the other sheets
      const p = 0.03 * Math.max(w, h);
      x -= p; y -= p; w += 2 * p; h += 2 * p;
      if (w / h > AR) { const H = w / AR; y -= (H - h) / 2; h = H; } else { const W = h * AR; x -= (W - w) / 2; w = W; }
      return [x, y, w, h];
    };
    const toView = (k, x, y) => (k === "A" ? [-y, x] : [x, y]);

    /* ---------------- groups to classify (step 3) ---------------- */
    const groups = [];
    const instGroup = {}, unkGroup = {}, noteGroup = {}, labelGroup = {};
    {
      const byCode = {};
      EL.inst.forEach((it, i) => {
        if (!it[6]) return;
        const key = it[0] + ":" + it[1];
        (byCode[key] = byCode[key] || { kind: "el", s: it[0], c: it[1], rv: it[6], items: [] }).items.push(i);
      });
      Object.values(byCode).sort((a, b) => b.items.length - a.items.length).forEach((g) => {
        g.sug = g.c; g.leg = LG[g.c][0];
        g.why = g.rv === 2 ? "צורה דומה לסמל במקרא, לא העתק מדויק שלו" : "הסמל מהמקרא, בקנה מידה אחר";
        g.items.forEach((i) => (instGroup[i] = g));
        groups.push(g);
      });
      EL.unk.forEach((u, ui) => {
        const g = { kind: "unk", s: u.s, u: ui, items: u.items.map((_, j) => j), sug: u.sug, leg: null, why: "צורה שחוזרת " + u.items.length + " פעמים ואינה במקרא; ההצעה לפי דמיון לסמלים שזוהו" };
        unkGroup[ui] = g;
        groups.push(g);
      });
      const byNote = {};
      EL.notes.forEach((n, i) => {
        if (!n.k) return;
        const key = n.s + ":" + n.k;
        (byNote[key] = byNote[key] || { kind: "note", s: n.s, k: n.k, items: [], sug: "add", leg: n.t, why: "הערת מתכנן על שכבת הסמלים, עם השלכה על הכמויות" }).items.push(i);
      });
      Object.values(byNote).forEach((g) => { g.items.forEach((i) => (noteGroup[i] = g)); groups.push(g); });
      const byType = {};
      DATA.pl.forEach((l, i) => {
        (byType[l[0]] = byType[l[0]] || { kind: "pl", s: "P", t: l[0], items: [], sug: l[0], leg: DATA.plTypes[l[0]][0], why: "תווית טקסט בשכבת האינסטלציה; הטקסט נקרא מהגיליון" }).items.push(i);
      });
      Object.values(byType).sort((a, b) => b.items.length - a.items.length).forEach((g) => { g.items.forEach((i) => (labelGroup[i] = g)); groups.push(g); });
      groups.forEach((g) => { g.n = g.items.length; g.cat = null; g.choice = g.sug; });
      // group order: by sheet
      groups.sort((a, b) => ORDER.indexOf(a.s) - ORDER.indexOf(b.s));
    }
    const optsOf = (g) => {
      if (g.kind === "note") return [["add", "להוסיף לכתב: " + (EB[g.k] ? EB[g.k].d : g.k)], ["x", "מידע בלבד, בלי כמות"]];
      if (g.kind === "pl") return [...Object.keys(DATA.plTypes).map((t) => [t, DATA.plTypes[t][1]]), ["x", "לא לספור"]];
      const rows = Object.keys(LG).filter((c) => EB[LG[c][1]] || LG[c][1] === "sw" || LG[c][1] === "sw_shutter");
      return [...rows.map((c) => [c, `${c} · ${LG[c][0]}`]), ["x", "לא לספור"]];
    };
    const optLabel = (g, v) => (optsOf(g).find((o) => o[0] === v) || ["", v])[1];

    /* ---------------- state ---------------- */
    const st = {
      sheet: "A",
      hidden: { A: new Set(), E: new Set(), L: new Set(), P: new Set() },
      analyzed: false, running: false, run: null,
      show: { sym: true, rooms: true, walls: true, open: true },
      insp: null, selGroup: 0,
      lines: [], selLine: "fl:dry", selCheck: null,
      set: { hb: 3.0, hn: 2.85, hbath: 2.4, hwc: 1.5 },
      priced: false, price: {}, qty: {},
      cont: 5, vat: 18,
    };
    const nSymbols = EL.inst.length + sum(EL.unk, (u) => u.items.length) + DATA.pl.length + DATA.inst.P.A02.length;
    const wallLen = sum(DATA.walls, (w) => w.len);
    const area = sum(R, (r) => r.a);

    /* ---------------- shell ---------------- */
    const D = Demo({
      slug: "boq",
      plugin: "BOQ-AI",
      tag: "BOQ-AI · כתב כמויות משרטוטים",
      title: "כתב כמויות אוטומטי מסט שרטוטים",
      sub: "סט שרטוטים של בית פרטי: אדריכלות, חשמל, תאורה ואינסטלציה. המערכת מודדת חדרים, קירות ופתחים, קוראת סמלים ותוויות, מצליבה בין הגיליונות ובונה כתב כמויות לפי פרקי המפרט הכללי. כל סעיף מקושר למקור שלו בשרטוט.",
      file: "A-101.pdf",
      viewBox: homeVB("A"),
      kpis: [{ id: "sheets", label: "גיליונות" }, { id: "sym", label: "סמלים ותוויות" }, { id: "lines", label: "סעיפים" }, { id: "total", label: "סה\"כ כולל מע\"מ" }],
      steps: [
        { t: "סט השרטוטים", d: "4 גיליונות, 3 תחומים", cmd: "BOQ OPEN HOUSE_SET  (4 PDF)" },
        { t: "ניתוח", d: "חדרים, פתחים, סמלים", cmd: "BOQ ANALYZE --all" },
        { t: "סיווג ובדיקה", d: "מה שהמערכת לא סגרה לבד", cmd: "BOQ REVIEW --suggest" },
        { t: "כתב כמויות", d: "לפי פרקים, עם מקור", cmd: "BOQ BUILD" },
        { t: "תמחור ועריכה", d: "מחירון לדוגמה", cmd: "BOQ PRICE" },
        { t: "ייצוא", d: "סיכום ואקסל", cmd: "BOQ EXPORT --xlsx" },
      ],
      onStep,
    });
    const el = D.el, fmt = D.fmt, esc = D.esc;
    const svg = D.svg;
    D.kpi("sheets", 4);

    D.canvas.insertAdjacentHTML("beforeend", `<div class="stabs" role="tablist" aria-label="גיליונות">${ORDER.map((k) => `<button type="button" data-sheet="${k}"><i style="background:${SHEETS[k].color}"></i>${SHEETS[k].code}</button>`).join("")}</div>`);
    D.canvas.querySelectorAll("[data-sheet]").forEach((b) => (b.onclick = () => { openSheet(b.dataset.sheet); D.track("demo_action", { action: "sheet_tab" }); }));

    /* ---------------- drawing ---------------- */
    const STY = {
      A: { furn: { s: "#46515a", w: 0.6 }, fix: { s: "#6d7b85", b: "#151b20", w: 0.7 }, hatch: { s: "#4d5862", w: 0.5 }, walls: { s: "#c9d1d4", w: 1.1 }, open: { s: "#8c979c", w: 0.7 } },
      base: { furn: { s: "#434e57", b: "#141a1f", w: 0.6 }, fix: { s: "#6d7b85", b: "#151b20", w: 0.7 }, walls: { s: "#aab4ba", b: "#3a444c", f: "#3a444c", w: 0.9 }, open: { s: "#7d898f", w: 0.7 } },
    };
    const LAYER_NAMES = {
      A: [["walls", "קירות ומילוי", "A-WALL / BETON / BLOCK", ["walls", "hatch", "poche"]], ["open", "דלתות וחלונות", "DOOR / WIN", ["open"]], ["fix", "כלים סניטריים", "SANIT", ["fix"]], ["furn", "ריהוט", "FURN", ["furn"]]],
      X: [["walls", "רקע אדריכלי: קירות ופתחים", "xref · A-WALL / A-DOOR", ["walls", "open"]], ["fix", "כלים סניטריים", "xref · SANR-FIXT", ["fix"]], ["furn", "ריהוט", "xref · FURN", ["furn"]], ["disc", "שכבת התחום", "", ["disc"]]],
    };
    const DISC_LAYER = { E: "ELEC", L: "LIGHT / ELEC", P: "PLUMB-LABEL" };

    function drawPaths(parent, P, sty, key) {
      const g = el("g", { "data-layer": key }, parent);
      if (P.b) el("path", { d: P.b, fill: sty.b || "#161c21" }, g);
      if (P.f) el("path", { d: P.f, fill: sty.f || sty.s }, g);
      if (P.s) el("path", { d: P.s, fill: "none", stroke: sty.s, "stroke-width": sty.w, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, g);
      return g;
    }
    const discSty = (k) => { const c = SHEETS[k].color; return { s: c, f: c, b: "#1a2127", w: 0.8 }; };

    el("rect", { x: -1e6, y: -1e6, width: 2e6, height: 2e6, fill: "#111519" });
    const root = el("g", {});
    const labG = el("g", {});
    const cache = {};
    function buildSheet(k) {
      const g = document.createElementNS(D.NS, "g");
      const fr = el("g", { transform: k === "A" ? "rotate(90)" : null }, g);
      const layers = {};
      if (k === "A") {
        const poche = el("g", { "data-layer": "walls" }, fr);
        DATA.walls.forEach((w) => el("path", { d: w.d, fill: "#2c353c" }, poche));
        for (const key of ["furn", "fix", "hatch", "walls", "open"]) layers[key] = drawPaths(fr, DATA.sheets.A.layers[key], STY.A[key], key);
        layers.poche = poche;
      } else {
        const sh = DATA.sheets[k];
        const b = el("g", { transform: `translate(${sh.off[0]} ${sh.off[1]})` }, fr);
        for (const key of ["furn", "fix", "walls", "open"]) layers[key] = drawPaths(b, DATA.base[key], STY.base[key], key);
        layers.disc = drawPaths(fr, sh.disc, discSty(k), "disc");
      }
      const det = el("g", {}, fr);
      const hl = el("g", {}, fr);
      return (cache[k] = { g, fr, layers, det, hl });
    }
    let cur = null;
    function openSheet(k, { keepView = false } = {}) {
      if (st.sheet === k && cur) return;
      st.sheet = k;
      if (cur) cur.g.remove();
      cur = cache[k] || buildSheet(k);
      root.appendChild(cur.g);
      applyLayers();
      if (!keepView) D.setView(homeVB(k), true);
      D.file(`${SHEETS[k].code}.pdf`);
      D.barMid(`${esc(SHEETS[k].disc)} · <b>1:50</b>`);
      D.canvas.querySelectorAll("[data-sheet]").forEach((b) => { b.classList.toggle("on", b.dataset.sheet === k); b.setAttribute("aria-selected", b.dataset.sheet === k); });
      paint();
      if (D.step === 1) renderSide();
    }
    function applyLayers() {
      const hid = st.hidden[st.sheet];
      for (const key in cur.layers) cur.layers[key].style.display = hid.has(key) ? "none" : "";
      if (cur.layers.disc) cur.layers.disc.style.opacity = D.step >= 3 ? 0.5 : 1;
    }

    /* ---------------- items on the sheets ---------------- */
    const pad = 2 * U;
    // a reference to one counted item -> [sheet, x, y, w, h]
    function refBox(ref) {
      const [t, a, b] = ref.split(":");
      if (t === "e") { const it = EL.inst[+a]; return [it[0], it[2], it[3], it[4], it[5]]; }
      if (t === "u") { const u = EL.unk[+a], q = u.items[+b]; return [u.s, q[0], q[1], q[2], q[3]]; }
      if (t === "n") { const n = EL.notes[+a]; return [n.s, ...n.b]; }
      if (t === "l") { const l = DATA.pl[+a]; return ["P", l[1], l[2], l[3], l[4]]; }
      if (t === "t") { const q = DATA.inst.P[a][+b]; return ["P", ...q]; }
      return null;
    }
    const refsOf = (g) => g.items.map((i) => (g.kind === "el" ? "e:" + i : g.kind === "unk" ? `u:${g.u}:${i}` : g.kind === "note" ? "n:" + i : "l:" + i));
    function refRect(parent, ref, cls, attrs) {
      const b = refBox(ref);
      if (!b || b[0] !== st.sheet) return;
      el("rect", { x: b[1] - pad, y: b[2] - pad, width: b[3] + 2 * pad, height: b[4] + 2 * pad, rx: 2 * U, class: cls, "data-k": "r:" + ref, "vector-effect": "non-scaling-stroke", ...attrs }, parent);
    }
    // every item drawn on the E / L / P sheets, with its status
    function sheetRefs(k) {
      const out = [];
      if (k === "E" || k === "L") {
        EL.inst.forEach((it, i) => { if (it[0] === k) out.push(["e:" + i, it[6] ? "rv" : "ok", instGroup[i]]); });
        EL.unk.forEach((u, ui) => { if (u.s === k) u.items.forEach((_, j) => out.push([`u:${ui}:${j}`, "unk", unkGroup[ui]])); });
        EL.notes.forEach((n, i) => { if (n.s === k) out.push(["n:" + i, n.k ? "note" : "info", noteGroup[i]]); });
      }
      if (k === "P") {
        DATA.pl.forEach((_, i) => out.push(["l:" + i, "pl", labelGroup[i]]));
        DATA.inst.P.A02.forEach((_, i) => out.push(["t:A02:" + i, "ok", null]));
        DATA.inst.P.A01.forEach((_, i) => out.push(["t:A01:" + i, "ok", null]));
      }
      return out;
    }
    const COL = { ok: "#3ecf8e", rv: "#ffb547", unk: "#c39bff", note: "#c39bff", info: "#6f7a82", pl: "#5fb0f2", pend: "#ff5d6c" };
    function statusCol(kind, g) {
      if (kind === "ok") return COL.ok;
      if (kind === "info") return COL.info;
      if (!g) return COL.ok;
      if (!g.cat) return COL.pend;
      return g.cat === "x" ? COL.info : COL.ok;
    }

    function doorPath([cx, cy, r, a0, a1]) {
      const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
      const sweep = a1 > a0 ? 1 : 0;
      return `M${cx} ${cy}L${p0[0].toFixed(0)} ${p0[1].toFixed(0)}A${r} ${r} 0 0 ${sweep} ${p1[0].toFixed(0)} ${p1[1].toFixed(0)}Z`;
    }
    function roomLabel(i, strong) {
      const r = R[i];
      const [x, y] = toView("A", r.c[0], r.c[1]);
      const t = el("text", { x, y, "text-anchor": "middle", "font-size": 15 * U, fill: strong ? "#fff" : "#c9d1d4", "font-weight": 600, "paint-order": "stroke", stroke: "#111519", "stroke-width": 3 * U }, labG);
      t.textContent = r.n;
      const t2 = el("text", { x, y: y + 17 * U, "text-anchor": "middle", "font-size": 13 * U, fill: strong ? "#ffd2c4" : "#9aa5aa", "font-family": "IBM Plex Mono, monospace", "paint-order": "stroke", stroke: "#111519", "stroke-width": 3 * U }, labG);
      t2.textContent = `${fmt(r.a, 1)} מ"ר`;
    }
    function baseLabels(k) {
      const off = DATA.sheets[k].off;
      DATA.labels.forEach(([x, y, t]) => {
        const e = el("text", { x: x + off[0], y: y + off[1], "text-anchor": "middle", "font-size": 13 * U, fill: "#6f7b83", "paint-order": "stroke", stroke: "#111519", "stroke-width": 3 * U }, labG);
        e.textContent = t;
      });
    }
    const openRect = (parent, j, attrs) => { const b = O[j].b; return el("rect", { x: b[0], y: b[1], width: b[2], height: b[3], rx: 1.5 * U, "vector-effect": "non-scaling-stroke", "data-k": "o:" + j, ...attrs }, parent); };

    function paint() {
      if (!cur) return;
      applyLayers();
      const k = st.sheet, step = D.step;
      cur.det.textContent = ""; cur.hl.textContent = ""; labG.textContent = "";
      if (k !== "A") baseLabels(k);
      const lvl = st.running && st.run ? (st.run.k === k ? st.run.lvl : ORDER.indexOf(k) < ORDER.indexOf(st.run.k) ? 2 : 0) : st.analyzed ? 2 : 0;
      const rv = st.running ? "hit reveal" : "hit";
      if (step === 2) {
        D.legend(k === "A" ? [{ color: "#5b9dff", label: "חדר" }, { color: "#4fc3f7", label: "חדר רטוב" }, { color: "#ffb547", label: "דלת" }, { color: "#5fd3ff", label: "חלון" }, ...DATA.walls.map((w) => ({ color: WALL_COL[w.k + w.t], label: w.n }))]
          : k === "P" ? [{ color: COL.pl, label: "תווית אינסטלציה" }, { color: COL.ok, label: "סמל אסלה ברקע" }]
            : [{ color: COL.ok, label: "סמל לפי המקרא" }, { color: COL.rv, label: "לבדיקה" }, { color: COL.unk, label: "לא במקרא / הערת מתכנן" }]);
        if (k === "A" && lvl >= 2) {
          if (st.show.rooms) R.forEach((r, i) => {
            const wet = WET.has(r.k) || r.k === "service";
            el("path", { d: r.d, fill: wet ? "rgba(79,195,247,.18)" : "rgba(91,157,255,.08)", stroke: wet ? "#4fc3f7" : "#5b9dff", "stroke-width": 1, "stroke-dasharray": "4 3", "vector-effect": "non-scaling-stroke", class: rv, "data-k": `m:${i}` }, cur.det);
            roomLabel(i, st.insp === `m:${i}`);
          });
          if (st.show.walls) DATA.walls.forEach((w, i) => el("path", { d: w.d, fill: WALL_COL[w.k + w.t], "fill-opacity": 0.9, class: rv, "data-k": `w:${i}` }, cur.det));
          if (st.show.open) {
            O.forEach((o, j) => {
              const door = o.t.startsWith("door");
              if (door) o.arcs.forEach((a) => el("path", { d: doorPath(DATA.doors[a]), fill: "rgba(255,181,71,.22)", stroke: "#ffb547", "stroke-width": 1.1, "vector-effect": "non-scaling-stroke", class: rv, "data-k": "o:" + j }, cur.det));
              else openRect(cur.det, j, { fill: "rgba(95,211,255,.25)", stroke: "#5fd3ff", "stroke-width": 1.2, class: rv });
            });
          }
        }
        if (k !== "A" && lvl >= 1 && st.show.sym) {
          sheetRefs(k).forEach(([ref, kind, g]) => {
            const c = kind === "ok" ? COL.ok : COL[kind];
            refRect(cur.det, ref, rv, { fill: "rgba(0,0,0,0.001)", stroke: c, "stroke-width": 1.3, "stroke-dasharray": kind === "ok" ? null : "3 2" });
          });
        }
        if (st.insp) drawInspect();
      } else if (step === 3) {
        if (k !== "A") sheetRefs(k).forEach(([ref, kind, g]) => {
          if (!g && kind !== "ok") return;
          refRect(cur.det, ref, "hit", { fill: "rgba(0,0,0,0.001)", stroke: statusCol(g ? "g" : kind, g), "stroke-width": 1, "stroke-dasharray": g && !g.cat ? "3 2" : null, "stroke-opacity": 0.55 });
        });
        const g = groups[st.selGroup];
        if (g && g.s === k) refsOf(g).forEach((ref) => refRect(cur.hl, ref, "hit pulse", { fill: "rgba(255,91,46,.28)", stroke: "#fff", "stroke-width": 1.6 }));
      } else if (step === 4) {
        // every counted element is clickable: the drawing leads back to its line
        if (k !== "A") sheetRefs(k).forEach(([ref]) => refRect(cur.det, ref, "hit", { fill: "rgba(0,0,0,0.001)", stroke: "#8c979c", "stroke-width": 0.8, "stroke-opacity": 0.45 }));
        else {
          R.forEach((r, i) => el("path", { d: r.d, fill: "rgba(0,0,0,0.001)", class: "hit", "data-k": `m:${i}` }, cur.det));
          O.forEach((o, j) => openRect(cur.det, j, { fill: "rgba(0,0,0,0.001)", stroke: "#8c979c", "stroke-width": 0.6, "stroke-opacity": 0.4, class: "hit" }));
        }
        const src = st.selCheck ? (checks().find((c) => c.id === st.selCheck) || {}).src : (st.lines.find((l) => l.id === st.selLine) || {}).src;
        if (src) drawSource(src);
      }
    }

    function drawSource(src) {
      const k = st.sheet;
      (src.refs || []).forEach((ref) => refRect(cur.hl, ref, "hit pulse", { fill: "rgba(255,91,46,.30)", stroke: "#fff", "stroke-width": 1.6 }));
      if (k !== "A") return;
      (src.walls || []).forEach((i) => el("path", { d: DATA.walls[i].d, fill: "#ff5b2e", "fill-opacity": 0.9, class: "reveal", "pointer-events": "none" }, cur.hl));
      (src.rooms || []).forEach((i) => {
        el("path", { d: R[i].d, fill: src.edge ? "rgba(255,91,46,.06)" : "rgba(255,91,46,.24)", stroke: "#ff5b2e", "stroke-width": src.edge ? 3 : 1.2, "vector-effect": "non-scaling-stroke", class: "reveal", "pointer-events": "none" }, cur.hl);
        roomLabel(i, true);
      });
      (src.open || []).forEach((j) => {
        const o = O[j];
        if (o.t.startsWith("door")) o.arcs.forEach((a) => el("path", { d: doorPath(DATA.doors[a]), fill: "rgba(255,91,46,.35)", stroke: "#fff", "stroke-width": 1.5, "vector-effect": "non-scaling-stroke", class: "pulse", "pointer-events": "none" }, cur.hl));
        openRect(cur.hl, j, { fill: "rgba(255,91,46,.35)", stroke: "#fff", "stroke-width": 1.5, class: "pulse", "pointer-events": "none" });
      });
      if (src.showers) DATA.showers.forEach(([, x, y, w, h]) => el("rect", { x, y, width: w, height: h, fill: "rgba(255,91,46,.30)", stroke: "#fff", "stroke-width": 1.5, "vector-effect": "non-scaling-stroke", class: "pulse", "pointer-events": "none" }, cur.hl));
      if (src.counter) DATA.counter.forEach(([x0, y0, x1, y1]) => el("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: "#ff5b2e", "stroke-width": 5, "vector-effect": "non-scaling-stroke", class: "pulse", "pointer-events": "none" }, cur.hl));
    }
    const sheetsOfSrc = (src) => {
      const s = new Set();
      if ((src.rooms && src.rooms.length) || (src.walls && src.walls.length) || (src.open && src.open.length) || src.showers || src.counter) s.add("A");
      (src.refs || []).forEach((r) => { const b = refBox(r); if (b) s.add(b[0]); });
      return ORDER.filter((k) => s.has(k));
    };

    function drawInspect() {
      const [kind, a, b, c] = st.insp.split(":");
      if (kind === "m" && st.sheet === "A") el("path", { d: R[+a].d, fill: "rgba(255,91,46,.25)", stroke: "#fff", "stroke-width": 1.6, "vector-effect": "non-scaling-stroke" }, cur.hl);
      if (kind === "w" && st.sheet === "A") el("path", { d: DATA.walls[+a].d, fill: "#ff5b2e", stroke: "#fff", "stroke-width": 0.8, "vector-effect": "non-scaling-stroke" }, cur.hl);
      if (kind === "o" && st.sheet === "A") {
        const o = O[+a];
        o.arcs.forEach((i) => el("path", { d: doorPath(DATA.doors[i]), fill: "rgba(255,91,46,.45)", stroke: "#fff", "stroke-width": 1.6, "vector-effect": "non-scaling-stroke" }, cur.hl));
        openRect(cur.hl, +a, { fill: "rgba(255,91,46,.4)", stroke: "#fff", "stroke-width": 1.6, class: "pulse" });
      }
      if (kind === "r") refRect(cur.hl, [a, b, c].filter((x) => x != null).join(":"), "pulse", { fill: "rgba(255,91,46,.3)", stroke: "#fff", "stroke-width": 1.8 });
    }

    // zoom so the highlighted elements fill the view, but never closer than a third of the sheet
    function zoomToHl() {
      if (!cur || !cur.hl.childNodes.length) { D.fit(); return; }
      let b;
      try { b = cur.hl.getBBox(); } catch { D.fit(); return; }
      if (!b.width && !b.height) { D.fit(); return; }
      const p1 = toView(st.sheet, b.x, b.y), p2 = toView(st.sheet, b.x + b.width, b.y + b.height);
      let x = Math.min(p1[0], p2[0]), y = Math.min(p1[1], p2[1]), w = Math.abs(p2[0] - p1[0]), h = Math.abs(p2[1] - p1[1]);
      const H = homeVB(st.sheet), minW = H[2] / 3;
      if (w < minW) { x -= (minW - w) / 2; w = minW; }
      if (w > H[2] * 0.8 || h > H[3] * 0.8) { D.fit(); return; }
      D.zoomTo(x, y, w, h, 0.18);
    }

    /* ---------------- electrical: same rules as the electrical demo (quantities() in catalog/electrical/demo.js) ---------------- */
    const counted = (g) => g && g.cat && g.cat !== "x";
    function elSymbols() {
      const out = [];
      EL.inst.forEach((it, i) => {
        let c = it[1];
        if (it[6]) { const g = instGroup[i]; if (!counted(g)) return; c = g.cat; }
        out.push({ c, t: it[7], m: it[8], role: it[9], ref: "e:" + i });
      });
      EL.unk.forEach((u, ui) => { const g = unkGroup[ui]; if (counted(g)) u.items.forEach((q, j) => out.push({ c: g.cat, t: q[4], ref: `u:${ui}:${j}` })); });
      return out;
    }
    const switchBoxes = () => EL.inst.filter((it, i) => (!it[6] || counted(instGroup[i])) && (SWITCH.has(it[1]) || SWITCH.has(it[10])));
    function elQuantities() {
      const q = {}, src = {};
      const add = (k, n, refs) => { if (!n) return; q[k] = (q[k] || 0) + n; (src[k] = src[k] || []).push(...refs); };
      const circ = new Set(), lights = [], swBy = {};
      let boxes2 = 0;
      elSymbols().forEach((p, n) => {
        if (p.role === "of") return;
        const c = p.c, k = LG[c][1];
        if (LIGHTS.has(c)) {
          lights.push(p.ref);
          circ.add(p.t || "#" + n);
          if (WPL.has(c)) add("light_wp", 1, [p.ref]);
        } else if (LSW.has(c)) {
          if (p.t) (swBy[p.t] = swBy[p.t] || []).push(p.ref);
          if (c === "L25") add("sw_ind", 1, [p.ref]);
        } else if (c !== "L26") add(k, 1, [p.ref]);
        if (SOCK.has(c) && (p.m || 1) > 1) { add("socket_add", p.m - 1, [p.ref]); boxes2++; }
      });
      add("light", circ.size, lights);
      add("light_add", lights.length - circ.size, lights);
      let n2 = 0, n3 = 0;
      Object.values(swBy).forEach((refs) => { if (refs.length >= 2) { add("sw_2way", 2, refs); add("sw_cross", refs.length - 2, refs); refs.length >= 3 ? n3++ : n2++; } });
      const boxes = switchBoxes();
      EL.notes.forEach((nt, i) => {
        if (!nt.k || !counted(noteGroup[i])) return;
        add(nt.k, nt.q === "switches" ? boxes.length : nt.q, ["n:" + i, ...(nt.q === "switches" ? boxes.map((it) => "e:" + EL.inst.indexOf(it)) : [])]);
      });
      return { q, src, info: { circ: circ.size, fix: lights.length, n2, n3, boxes2, boxes: boxes.length } };
    }

    /* ---------------- quantities ---------------- */
    const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    // wall face of room r between heights z0..z1 (m²), net of its openings (sill / head per opening type)
    function face(r, z0, z1) {
      let a = r.wall * Math.max(0, z1 - z0);
      for (const [j, len] of r.gaps) { const t = OT[O[j].t]; a += len * (ov(z0, z1, 0, t.sill) + ov(z0, z1, t.head, 99)); }
      return a;
    }
    const roomIdx = (f) => R.map((r, i) => i).filter((i) => f(R[i]));
    const names = (ix) => ix.map((i) => R[i].n).join(", ");
    const nOpen = (ix, f) => new Set(ix.flatMap((i) => R[i].gaps.filter(([j]) => f(O[j])).map(([j]) => j))).size;

    function buildLines() {
      const S = st.set, L = [];
      const hc = (r) => Math.min(r.k === "bath" ? S.hbath : S.hwc, S.hn);
      const dry = roomIdx((r) => DRY.has(r.k)), wet = roomIdx((r) => WET.has(r.k)), srv = roomIdx((r) => r.k === "service");
      const inner = [...dry, ...wet], wetAll = [...wet, ...srv];
      const add = (id, qty, m, conf, src, as, extra = {}) => {
        const [ch, code, d, u, p] = L_DEF[id];
        if (qty > 0.004) L.push({ id, ch, code, d, u, p, qty, m, conf, src, as, ...extra });
      };
      const f2 = (v) => fmt(v, 2);
      // 04 · block walls: axis length x build height, plus the wall above the doors in them (the opening is not in the measured length)
      DATA.walls.forEach((w, i) => {
        if (w.k !== "block") return;
        const above = sum(w.doors, (j) => O[j].w * Math.max(0, S.hb - OT[O[j].t].head));
        add("b:" + w.t, w.len * S.hb + above, "area", "medium", { walls: [i], open: w.doors },
          [`אורך צירי ${fmt(w.len, 1)} מ"א (שלד הקיר בשכבת הבלוק) × גובה בנייה ${f2(S.hb)} מ׳`, w.doors.length ? `ועוד הקיר מעל ${w.doors.length} דלתות: ${f2(above)} מ"ר` : "אין דלתות בקירות האלה", "האורך נמדד על גוף הקיר, כך שהפתחים כבר מנוכים", `עובי בשרטוט ${w.tm} ס"מ`]);
      });
      // 05 · waterproofing
      const wetA = sum(wetAll, (i) => R[i].a);
      add("wp:floor", wetA, "area", "medium", { rooms: wetAll }, [`${wetAll.length} חללים: ${names(wetAll)}`, "ההגבהה על הקירות והרולקות כלולות במחיר"]);
      const shw = sum(R, (r) => r.shw);
      add("wp:shower", shw * 2.0, "area", "medium", { showers: true }, [`${DATA.showers.length} תאי מקלחת מגיליון האדריכלות`, `קירות צמודים לתאים: ${f2(shw)} מ"א × 2.00 מ׳`]);
      // 06 · doors (by the swing arcs), ממ"ד door and blast window
      const ofT = (t, f = () => true) => O.map((o, j) => j).filter((j) => O[j].t === t && f(O[j]));
      const d70 = ofT("door_in", (o) => o.w < 0.85), d80 = ofT("door_in", (o) => o.w >= 0.85);
      const doorAs = (ix, leaf) => [`${ix.length} פתחים בגיליון A-101, לפי קשתות הפתיחה`, `רוחב כנף ${leaf} ס"מ (קשת הפתיחה)`, [...new Set(ix.flatMap((j) => O[j].rm))].map((i) => R[i].n).join(", ")];
      add("d:70", d70.length, "count", "high", { open: d70 }, doorAs(d70, 70));
      add("d:80", d80.length, "count", "high", { open: d80 }, doorAs(d80, 80));
      const ent = ofT("door_ent"), mam = ofT("door_mamad"), blast = ofT("win_mamad");
      add("d:ent", ent.length, "count", "high", { open: ent }, ["פתח בקיר החוץ למבואה, שתי קשתות פתיחה: כנף 92 + כנף 40 ס״מ", "שתי הקשתות הן דלת אחת"]);
      add("d:mamad", mam.length, "count", "high", { open: mam }, ["הדלת בקיר הממ״ד, נפתחת החוצה", "בהספקת ספק מאושר פיקוד העורף"]);
      add("w:blast", blast.length, "count", "high", { open: blast }, [`פתח בקיר החוץ של הממ״ד: ${blast.map((j) => f2(O[j].w)).join(", ")} מ׳ כולל המשקוף`, "החלון האלומיניום שמולו: 12.01.070"]);
      // 07 · plumbing: from the labels; the 4 toilet symbols of the background are the same toilets as the 4 cistern labels
      const pq = {}, psrc = {};
      DATA.pl.forEach((l, i) => {
        const g = labelGroup[i];
        if (!counted(g)) return;
        for (const [k, n] of Object.entries(PL_EFF[g.cat])) { pq[k] = (pq[k] || 0) + n; (psrc[k] = psrc[k] || []).push("l:" + i); }
      });
      const showersN = pq.shower_pt || 0, channels = pq.channel || 0;
      if (showersN > channels) { pq.floor_drain = showersN - channels; psrc.floor_drain = psrc.shower_pt.filter((r) => ["mixer3", "mixer4"].includes(DATA.pl[+r.split(":")[1]][0])); }
      if (pq.wc) psrc.wc = [...psrc.wc, ...DATA.inst.P.A02.map((_, i) => "t:A02:" + i)];
      const PL_AS = {
        basin_pt: "כולל צנרת עד המחלק והכנה לניקוז", shower_pt: "יציאת ראש הטוש מהקיר כלולה (התווית שלה לא נספרת שוב)",
        wc: `נספר לפי תוויות "ניאגרה סמויה"; ${DATA.inst.P.A02.length} סמלי האסלה ברקע הם אותן אסלות`, floor_drain: `${showersN} מקלחות, רק ${channels} תעלת ניקוז מסומנת: השלמה לאישור המתכנן`,
        wc_inst: "הכלי בהספקת המזמין", basin_inst: "כיור המטבח בהספקת ספק המטבח, לא כאן", shower_inst: "הכלים בהספקת המזמין", gas: "צנרת הגז מחוץ לבית ומתקן הגז: קבלן גז, לא בסט",
      };
      PL_BOQ.forEach(([k, code, d, u, p]) => {
        if (!pq[k]) return;
        L.push({ id: "pl:" + k, ch: "07", code, d, u, p, qty: pq[k], m: "count", conf: k === "floor_drain" ? "low" : "high", src: { refs: psrc[k] },
          as: [k === "floor_drain" ? `${showersN} נקודות מקלחת פחות ${channels} תעלת ניקוז` : `${pq[k]} לפי תוויות בגיליון P-101`, PL_AS[k] || "הטקסט בתווית נקרא מהגיליון"] });
      });
      // 08 · electrical, exactly the electrical bill
      const { q: eq, src: esrc, info } = elQuantities();
      const EH = {
        light: `${info.circ} מעגלי הדלקה לפי התגיות ליד הגופים (חדר/נקודה); המפסק כלול בנקודה`, light_add: `${info.fix} גופים ב־${info.circ} מעגלים`,
        light_wp: "גופים מוגני מים במקלחות ובחוץ", sw_2way: `${info.n2 + info.n3} מעגלים שמודלקים משני מקומות ויותר: 2 מחליפים לכל מעגל`,
        sw_cross: `${info.n3} מעגלים משלושה מקומות ויותר`, socket: "שקע בודד; קופסה כפולה (x2) מוסיפה תוספת בסעיף 08.02.020",
        socket_add: `${info.boxes2} קופסאות שמסומנות x2 בגיליון`, shutter: "כולל מפסק התריס: 12 מפסקי תריס בתאורה, תגיות B/1–B/13",
        heater: "כולל המפסק הדו־קוטבי (נספר עם התנור, לא כמפסק מאור)", boiler: "כולל שעון הדוד", neutral: `${info.boxes} קופסאות מפסק, לפי הערת הבית החכם`,
        panel: "לוח ראשי תלת־פאזי (שקע תלת־פאזי, מזגן תלת־פאזי והכנה לרכב חשמלי)",
      };
      Object.keys(eq).forEach((k) => {
        const b = EB[k];
        const fromNote = esrc[k].some((r) => r.startsWith("n:"));
        const nt = fromNote ? EL.notes[+esrc[k].find((r) => r.startsWith("n:")).split(":")[1]].t : null;
        const anyRv = esrc[k].some((r) => r.startsWith("e:") && EL.inst[+r.split(":")[1]][6]) || esrc[k].some((r) => r.startsWith("u:"));
        const sh = new Set(esrc[k].map((r) => refBox(r)[0]));
        L.push({ id: "el:" + k, ch: "08", code: b.code, d: b.d, u: b.u, p: b.p, qty: eq[k], m: "count", conf: anyRv ? "medium" : "high", src: { refs: esrc[k] }, el: true,
          as: [EH[k] || (fromNote ? "מתוך הערת המתכנן: " + nt : `ספירה בגיליון ${[...sh].map((s) => SHEETS[s].code).join(" + ")}`), fromNote && EH[k] ? "מתוך הערת המתכנן: " + nt : null].filter(Boolean) });
      });
      // 09 / 10 / 11 · from the rooms
      const sumF = (ix, z0, z1) => sum(ix, (i) => face(R[i], z0(R[i]), z1(R[i])));
      const clad = sumF(wet, () => 0, hc);
      const walls09 = sumF(dry, () => 0, () => S.hn) + sumF(wet, hc, () => S.hn);
      const nD = nOpen(inner, (o) => o.t.startsWith("door")), nW = nOpen(inner, (o) => !o.t.startsWith("door"));
      const openLen = sum(inner, (i) => R[i].open), wallSum = sum(inner, (i) => R[i].wall);
      const kit = R.find((r) => r.k === "kitchen"), bsA = kit.bs * 0.6;
      add("pt:walls", walls09, "area", "medium", { rooms: inner, edge: true },
        [`${inner.length} חדרים: קירות ${fmt(wallSum, 1)} מ"א × גובה נטו ${f2(S.hn)} מ׳, שני צדי כל מחיצה`, `בניכוי ${nD} דלתות ו־${nW} חלונות (גובה הפתחים לפי הנחה, אין חתכים בסט)`, `בחדרים רטובים רק מעל החיפוי`, `גבולות פתוחים בין חללים (${fmt(openLen, 1)} מ"א) אינם קיר ולא נמדדים`]);
      add("pt:cement", clad, "area", "medium", { rooms: wet, edge: true }, ["כמו שטח החיפוי בחדרים הרטובים", "האריחים מודבקים על טיח מיישר, לא על טיח גמר"]);
      const ceil = sum(inner, (i) => R[i].a);
      add("pt:ceil", ceil, "area", "medium", { rooms: inner }, [`${inner.length} חדרים, ${fmt(ceil, 1)} מ"ר: שטח התקרה כשטח הרצפה`, "בהנחה של תקרת בטון בכל הבית; אין תקרות גבס מסומנות", "בלי מרפסת השירות (חוץ)"]);
      const dryA = sum(dry, (i) => R[i].a);
      add("fl:dry", dryA, "area", "high", { rooms: dry }, [`${dry.length} חדרים יבשים, ${fmt(dryA, 1)} מ"ר נטו בין פני הקירות`, "כמות נטו: הפחת כלול במחיר היחידה"]);
      add("fl:wet", wetA, "area", "high", { rooms: wetAll }, [`${wetAll.length} חללים: ${names(wetAll)}`, "כמות נטו: הפחת כלול במחיר היחידה"]);
      const underSill = sum(dry, (i) => sum(R[i].gaps.filter(([j]) => OT[O[j].t].sill > 0), ([, l]) => l));
      const skirt = sum(dry, (i) => R[i].wall) + underSill - kit.cab;
      add("fl:skirt", skirt, "length", "medium", { rooms: dry, edge: true },
        [`קירות בחדרים יבשים ${fmt(sum(dry, (i) => R[i].wall), 1)} מ"א, ועוד ${f2(underSill)} מ"א מתחת לחלונות`, "בלי פתחי דלת, ויטרינות וגבולות פתוחים", `בניכוי ${f2(kit.cab)} מ"א מאחורי ארונות המטבח, הארונות הגבוהים והמקרר`]);
      add("fl:clad", clad, "area", "medium", { rooms: wet, edge: true },
        [`חדרי רחצה עד ${f2(Math.min(S.hbath, S.hn))} מ׳, שירותים וכביסה עד ${f2(Math.min(S.hwc, S.hn))} מ׳`, "בניכוי דלתות וחלונות", "כמות נטו: הפחת כלול במחיר היחידה"]);
      add("fl:bs", bsA, "area", "medium", { counter: true }, [`ריצת המשטח לאורך הקירות ${f2(kit.bs)} מ"א × 0.60 מ׳, בלי החלון שמעל הכיור`, "לפי קו המשטח בשכבת הכלים הסניטריים"]);
      add("pa:walls", walls09 - bsA, "area", "medium", { rooms: inner, edge: true }, ["כמו טיח הקירות", `בניכוי חיפוי המטבח (${f2(bsA)} מ"ר)`]);
      add("pa:ceil", ceil, "area", "medium", { rooms: inner }, ["כמו טיח התקרות"]);
      // 12 · aluminium (the openings with a shutter motor on the lighting sheet carry an electric shutter)
      const wsh = ofT("win_sh");
      const wide = wsh.filter((j) => O[j].w >= 1.0), narrow = wsh.filter((j) => O[j].w < 1.0);
      const wl = (ix) => "רוחב בתוכנית: " + ix.map((j) => f2(O[j].w)).join(", ") + " מ׳";
      const shTags = (ix) => "מנועי תריס בגיליון התאורה: " + ix.map((j) => O[j].sh).join(", ");
      add("al:wide", wide.length, "count", "high", { open: wide }, [wl(wide), shTags(wide), "גובה וסדרה לפי רשימת אלומיניום (לא בסט)"]);
      add("al:narrow", narrow.length, "count", "high", { open: narrow }, [wl(narrow), shTags(narrow)]);
      const sl = ofT("slide_sh"), wwet = ofT("win_wet"), vit = ofT("vitrine"), ext = ofT("door_ext");
      add("al:slide", sl.length, "count", "high", { open: sl }, [wl(sl), shTags(sl)]);
      add("al:wet", wwet.length, "count", "high", { open: wwet }, [wl(wwet), [...new Set(wwet.flatMap((j) => O[j].rm))].map((i) => R[i].n).join(", "), "בלי תריס: אין להם מנוע בגיליון התאורה"]);
      add("al:vitrine", vit.length, "count", "medium", { open: vit }, [wl(vit), "במסדרון, בלי תריס ובלי פרט: לפי הצעת ספק"]);
      add("al:ext", ext.length, "count", "high", { open: ext }, [`${ext.length} פתחי דלת בקיר החוץ, לפי קשתות הפתיחה`, ext.map((j) => R[O[j].rm[0]].n).join(", ")]);
      add("al:mamad", blast.length, "count", "high", { open: blast }, ["מול חלון ההדף בממ״ד"]);
      // still to classify: listed, not in the bill
      groups.forEach((g, gi) => {
        if (g.cat) return;
        L.push({ id: "q:" + gi, ch: "—", code: "—", d: `${g.leg || "צורה שאינה במקרא"} · ${SHEETS[g.s].code}`, u: "יח'", p: null, qty: g.n, m: "count", conf: "low", src: { refs: refsOf(g) }, u99: true,
          as: [`${g.n} פריטים ב־${SHEETS[g.s].code} ממתינים לסיווג`, "לא נכללים בכתב הכמויות עד שישויכו (שלב 3)"] });
      });
      L.sort((a, b) => (!!a.u99 - !!b.u99) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
      st.lines = L;
      D.kpi("lines", L.filter((l) => !l.u99).length);
    }
    const qtyOf = (l) => (st.qty[l.id] != null ? st.qty[l.id] : l.qty);
    // chapter 08 is priced from the electrical bill; the rest from the sample list once loaded
    const priceOf = (l) => (l.id in st.price ? st.price[l.id] : l.u99 ? null : (l.el || st.priced) ? l.p : null);
    function totals() {
      let sub = 0, priced = 0, missing = 0, n = 0;
      const byCh = {};
      for (const l of st.lines) {
        if (l.u99) continue;
        n++;
        const p = priceOf(l);
        if (p == null) { missing++; continue; }
        const t = p * qtyOf(l);
        sub += t; priced++;
        byCh[l.ch] = (byCh[l.ch] || 0) + t;
      }
      const cont = (sub * st.cont) / 100, vat = ((sub + cont) * st.vat) / 100;
      return { sub, cont, vat, total: sub + cont + vat, priced, missing, n, byCh, pend: st.lines.filter((l) => l.u99).length };
    }
    const intUnit = (u) => u === "נק'" || u === "יח'" || u === "קומפ'";
    const qfmt = (l, q = qtyOf(l)) => fmt(q, intUnit(l.u) ? 0 : 2);
    function updTotalKpi() {
      const T = totals();
      D.kpi("total", st.priced && T.priced ? D.money(T.total) : "—");
    }

    /* ---------------- cross-sheet checks ---------------- */
    function checks() {
      const out = [];
      const shWin = O.map((o, j) => j).filter((j) => O[j].sh);
      const motors = EL.inst.map((it, i) => i).filter((i) => EL.inst[i][1] === "L28");
      const shSw = EL.inst.map((it, i) => i).filter((i) => EL.inst[i][1] === "L26");
      const okSh = shWin.length === motors.length && motors.length === shSw.length;
      out.push({ id: "sh", ok: okSh ? "ok" : "warn", t: "תריסים חשמליים", d: `${shWin.length} פתחים עם תריס (A-101) · ${motors.length} מנועים · ${shSw.length} מפסקי תריס (E-102)`, src: { open: shWin, refs: [...motors, ...shSw].map((i) => "e:" + i) } });
      const lbl = (t) => DATA.pl.map((l, i) => i).filter((i) => t.includes(DATA.pl[i][0]));
      const mix = lbl(["mixer3", "mixer4"]), heat = EL.inst.map((it, i) => i).filter((i) => EL.inst[i][1] === "L12" && EL.inst[i][9] !== "of");
      out.push({ id: "shw", ok: mix.length === DATA.showers.length && heat.length === DATA.showers.length ? "ok" : "warn", t: "מקלחות", d: `${DATA.showers.length} תאי מקלחת (A-101) · ${mix.length} אינטרפוץ (P-101) · ${heat.length} נק׳ תנור חימום (E-102)`, src: { showers: true, refs: [...mix.map((i) => "l:" + i), ...heat.map((i) => "e:" + i)] } });
      const ch = lbl(["channel"]);
      if (mix.length > ch.length) out.push({ id: "drain", ok: "warn", t: "ניקוז רצפה במקלחות", d: `${mix.length} מקלחות ורק ${ch.length} תעלת ניקוז מסומנת. נוספו ${mix.length - ch.length} מחסומי רצפה כהשלמה (07.02.030), לאישור המתכנן`, src: { refs: [...mix, ...ch].map((i) => "l:" + i) } });
      const wcs = lbl(["wc", "wc_ext"]);
      out.push({ id: "wc", ok: wcs.length === DATA.inst.P.A02.length ? "ok" : "warn", t: "אסלות: בלי ספירה כפולה", d: `${DATA.inst.P.A02.length} סמלי אסלה ברקע ו־${wcs.length} תוויות "ניאגרה סמויה" הן אותן ${wcs.length} אסלות: נספרו פעם אחת`, src: { refs: [...wcs.map((i) => "l:" + i), ...DATA.inst.P.A02.map((_, i) => "t:A02:" + i)] } });
      const ext = lbl(["wc_ext"]);
      if (ext.length) out.push({ id: "wcx", ok: "warn", t: "מיכל הדחה סמוי בקיר חוץ", d: `${ext.length} תוויות "בתוך קיר חיצוני". קיר החוץ מבטון בעובי ${DATA.walls.find((w) => w.k === "conc").tm} ס"מ בשרטוט: מיכל סמוי לא נכנס בו בלי שקע ביציקה או קיר הלבשה. לתאם עם הקונסטרוקטור; לא נכלל בכמויות`, src: { refs: ext.map((i) => "l:" + i) } });
      const acD = lbl(["ac_drain"]), acP = EL.inst.map((it, i) => i).filter((i) => ["L32a", "L32b"].includes(EL.inst[i][1]));
      out.push({ id: "ac", ok: acD.length === acP.length ? "ok" : "warn", t: "מזגנים", d: `${acP.length} נקודות חשמל למזגן (E-101) · ${acD.length} ניקוזי מזגן (P-101)`, src: { refs: [...acD.map((i) => "l:" + i), ...acP.map((i) => "e:" + i)] } });
      const mm = R.findIndex((r) => r.n.startsWith("ממ"));
      if (DATA.mamadLabel) out.push({ id: "mamad", ok: Math.abs(R[mm].a - DATA.mamadLabel) <= 0.5 ? "ok" : "warn", t: "שטח הממ״ד", d: `נמדד ${fmt(R[mm].a, 1)} מ"ר נטו · בתווית בגיליון האינסטלציה ${fmt(DATA.mamadLabel, 0)} מ"ר`, src: { rooms: [mm] } });
      const vit = O.map((o, j) => j).filter((j) => O[j].t === "vitrine");
      if (vit.length) out.push({ id: "vit", ok: "info", t: "ויטרינה בלי תריס ובלי פרט", d: `ויטרינה ${fmt(O[vit[0]].w, 2)} מ׳ במסדרון: אין לה מנוע תריס ואין פרט. סעיף 12.01.050 בלי מחיר עד הצעת ספק`, src: { open: vit } });
      const pend = groups.filter((g) => !g.cat);
      out.push({ id: "pend", ok: pend.length ? "warn" : "ok", t: "פריטים שלא סווגו", d: pend.length ? `${pend.length} קבוצות (${sum(pend, (g) => g.n)} פריטים) מחוץ לכתב הכמויות עד שישויכו` : "כל הסמלים, התוויות וההערות שויכו", src: { refs: pend.flatMap(refsOf) } });
      return out;
    }

    /* ---------------- step 2: the analysis run ---------------- */
    const RUN_STAGES = ["סיווג גיליון", "קנה מידה", "מקרא, סמלים ותוויות", "חדרים ופתחים"];
    const symCount = (k) => (k === "A" ? 0 : sheetRefs(k).filter(([ref, kind]) => kind !== "info" && !ref.startsWith("n:") && !ref.startsWith("t:A01")).length);
    const nDoors = O.filter((o) => o.t.startsWith("door")).length, nWins = O.length - nDoors;
    function stageText(k, s) {
      const n = symCount(k);
      if (s === 0) return `תחום: ${SHEETS[k].disc} (לפי שכבות ושם הגיליון)`;
      if (s === 1) return "קנה מידה 1:50, נגזר מ־14 קשתות דלת";
      if (k === "A") return s === 2 ? "אין מקרא; דלתות לפי קשתות פתיחה, חלונות לפי פתחים בקיר" : `${R.length} חדרים · ${fmt(area, 1)} מ"ר נטו · ${nDoors} דלתות · ${nWins} חלונות וויטרינות`;
      if (k === "P") return `${DATA.pl.length} תוויות טקסט נקראו · ${DATA.inst.P.A02.length} סמלי אסלה ברקע`;
      const rvN = EL.inst.filter((it) => it[0] === k && it[6]).length, uN = sum(EL.unk.filter((u) => u.s === k), (u) => u.items.length), nN = EL.notes.filter((x) => x.s === k).length;
      return s === 2 ? `${n} סמלים · ${rvN} לבדיקה · ${uN} לא במקרא` : `${n} סמלים · ${nN} הערות מתכנן · רקע אדריכלי משותף, לא נמדד שוב`;
    }
    function startRun() {
      clearTimeout(st.runT);
      st.running = true; st.analyzed = false; st.insp = null;
      st.run = { k: "A", i: 0, s: -1, lvl: 0 };
      D.cmd("BOQ ANALYZE --all");
      tick();
    }
    function tick() {
      const r = st.run;
      r.s++;
      if (r.s > 3) {
        r.i++;
        if (r.i >= ORDER.length) return finishRun();
        r.k = ORDER[r.i]; r.s = 0;
      }
      r.lvl = r.s >= 3 ? 2 : r.s >= 2 ? 1 : 0;
      if (st.sheet !== r.k) openSheet(r.k);
      else paint();
      D.cmd(`BOQ ANALYZE ${SHEETS[r.k].code}  ${["CLASSIFY", "SCALE", "LEGEND+SYMBOLS", "SPACES+OPENINGS"][r.s]}`);
      updProc();
      st.runT = setTimeout(tick, r.s === 3 ? 420 : 300);
    }
    function finishRun() {
      st.running = false; st.analyzed = true; st.run = null;
      D.kpi("sym", nSymbols);
      D.cmd(`BOQ ANALYZE done: ${nSymbols} symbols+labels, ${R.length} rooms, ${O.length} openings`);
      D.toast(`הניתוח הסתיים: ${R.length} חדרים, ${O.length} פתחים, ${nSymbols} סמלים ותוויות`);
      D.track("demo_action", { action: "analyze" });
      openSheet("A");
      paint();
      renderSide();
      D.hint("לחצו על חדר, קיר, דלת, חלון או סמל כדי לראות מה זוהה");
    }
    function skipRun() {
      clearTimeout(st.runT);
      st.running = false;
      finishRun();
    }
    function procState(k) {
      if (st.analyzed) return 4;
      if (!st.running || !st.run) return 0;
      const i = ORDER.indexOf(k);
      return i < st.run.i ? 4 : i === st.run.i ? st.run.s + 1 : 0;
    }
    function procRow(k) {
      const p = procState(k);
      const text = p === 0 ? "ממתין" : p >= 4 ? stageText(k, 3) : `${RUN_STAGES[p - 1]}… ${stageText(k, p - 1)}`;
      return `<button class="pr ${p >= 4 ? "done" : ""} ${st.sheet === k ? "on" : ""}" type="button" data-open="${k}">
        <span class="code">${SHEETS[k].code}</span><span>${esc(SHEETS[k].t)}</span><span class="dtag" style="color:${SHEETS[k].color};background:${SHEETS[k].color}22">${esc(SHEETS[k].disc)}</span>
        <span class="bar"><i style="width:${(p / 4) * 100}%"></i></span><span class="st">${esc(text)}</span></button>`;
    }
    function updProc() {
      const box = document.getElementById("proc");
      if (box) box.innerHTML = ORDER.map(procRow).join("");
      bindOpen(box);
    }
    function bindOpen(scope) {
      scope?.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => { if (!st.running) { openSheet(b.dataset.open); paint(); renderSide(); } }));
    }

    const kv = (rows) => `<div class="kv2">${rows.map(([a, b]) => `<span>${esc(a)}</span><span>${b}</span>`).join("")}</div>`;
    const mono = (s) => `<span class="mono">${s}</span>`;
    function inspectHtml() {
      if (!st.insp) return `<div class="insp">לחצו על חדר, קיר, דלת, חלון או סמל בשרטוט כדי לראות מה המערכת זיהתה ואיך הוא נמדד.</div>`;
      const [kind, a, b, c] = st.insp.split(":");
      if (kind === "m") {
        const r = R[+a];
        const type = WET.has(r.k) ? "רטוב (כלים סניטריים בחדר)" : r.k === "service" ? "מרפסת שירות (חוץ)" : "יבש";
        const gaps = r.gaps.map(([j, l]) => `${OT[O[j].t].n} ${fmt(l, 2)}`).join(" · ") || "—";
        return `<div class="insp"><b>${esc(r.n)}</b>${kv([["שטח נטו", mono(fmt(r.a, 1) + ' מ"ר')], ["היקף", mono(fmt(r.p, 2) + ' מ"א')], ["מתוכו קיר", mono(fmt(r.wall, 2) + ' מ"א')], ["פתחים", esc(gaps)], ["גבול פתוח", mono(fmt(r.open, 2) + ' מ"א') + (r.open > 0.5 ? " (בלי קיר)" : "")], ["סוג", esc(type)]])}</div>`;
      }
      if (kind === "w") {
        const w = DATA.walls[+a];
        const inBoq = w.k === "block" ? `בכתב: ${L_DEF["b:" + w.t][1]}` : "שלד, פרק 02: לפי תוכניות הקונסטרוקציה, לא בכתב הזה";
        return `<div class="insp"><b>${esc(w.n)}</b>${kv([["אורך צירי", mono(fmt(w.len, 1) + ' מ"א')], ["עובי בשרטוט", mono(w.tm + ' ס"מ')], ["שיטה", "שלד הקיר מגוף הקיר בשכבה, עובי לפי חציון המקטע"], ["כתב כמויות", esc(inBoq)]])}</div>`;
      }
      if (kind === "o") {
        const o = O[+a], t = OT[o.t];
        const isDoor = o.t.startsWith("door");
        return `<div class="insp"><b>${esc(t.n)}</b>${kv([[isDoor ? "פתח (כנף + משקוף)" : "רוחב פתח", mono(fmt(o.w, 2) + " מ׳")], ["חדרים", esc(o.rm.map((i) => R[i].n).join(" · "))], ["גובה (הנחה)", mono(`${fmt(t.sill, 2)}–${fmt(t.head, 2)} מ׳`)], ...(o.sh ? [["תריס חשמלי", "מנוע " + mono(o.sh) + " בגיליון E-102"]] : []), ["שימוש", isDoor ? "ספירת דלתות, ניכוי בטיח, בשיפולים ובחיפוי" : "ספירת חלונות, ניכוי בטיח ובחיפוי"]])}</div>`;
      }
      if (kind === "r") {
        const ref = [a, b, c].filter((x) => x != null).join(":");
        const [t, i] = ref.split(":");
        if (t === "l") {
          const g = labelGroup[+i];
          return `<div class="insp"><b>תווית: ${esc(DATA.plTypes[DATA.pl[+i][0]][0])}</b>${kv([["גיליון", mono("P-101")], ["משמעות", esc(DATA.plTypes[DATA.pl[+i][0]][1])], ["סוג זה", mono(g.n + " תוויות")], ["סעיף", g.cat ? esc(optLabel(g, g.cat)) : '<span class="pill bad">טרם סווג</span>']])}</div>`;
        }
        if (t === "t") return `<div class="insp"><b>${b === "A02" ? "אסלה תלויה (סמל ברקע)" : "מסגרת מיכל הדחה סמוי (סמל ברקע)"}</b>${kv([["גיליון", mono("P-101")], ["מופעים", mono(DATA.inst.P[b].length)], ["ספירה", "אותן אסלות כמו תוויות הניאגרה: לא נספרות שוב"]])}</div>`;
        if (t === "n") {
          const n = EL.notes[+i];
          return `<div class="insp"><b>הערת מתכנן</b>${kv([["גיליון", mono(SHEETS[n.s].code)], ["טקסט", esc(n.t)], ["השלכה", n.k ? esc(EB[n.k].d) : "מידע בלבד"]])}</div>`;
        }
        const box = refBox(ref);
        let code, rv = 0, tag = "", g = null;
        if (t === "e") { const it = EL.inst[+i]; code = it[1]; rv = it[6]; tag = it[7]; g = instGroup[+i]; }
        else { g = unkGroup[+i]; code = null; tag = EL.unk[+i].items[+c][4]; }
        const status = t === "u" ? "צורה שאינה במקרא" : rv ? (rv === 2 ? "צורה דומה, לבדיקה" : "קנה מידה אחר, לבדיקה") : "העתק מדויק של סמל המקרא";
        return `<div class="insp"><b>${code ? esc(code + " · " + LG[code][0]) : "צורה חוזרת שאינה במקרא"}</b>${kv([["גיליון", mono(SHEETS[box[0]].code)], ["זיהוי", esc(status)], ...(tag ? [["תגית", mono(esc(tag))]] : []), ["סעיף", g ? (g.cat ? esc(optLabel(g, g.cat)) : '<span class="pill bad">טרם סווג</span>') : esc(code ? (EB[LG[code][1]] ? EB[LG[code][1]].code : "כלול בנקודה") : "")]])}</div>`;
      }
      return "";
    }

    /* ---------------- side palette ---------------- */
    const discTag = (k) => `<span class="dtag" style="color:${SHEETS[k].color};background:${SHEETS[k].color}22">${esc(SHEETS[k].disc)}</span>`;
    const thumbs = {};
    function thumb(k) {
      if (thumbs[k]) return thumbs[k];
      const s = document.createElementNS(D.NS, "svg");
      s.setAttribute("viewBox", homeVB(k).join(" "));
      s.setAttribute("preserveAspectRatio", "xMidYMid meet");
      s.setAttribute("aria-hidden", "true");
      const fr = D.el("g", { transform: k === "A" ? "rotate(90)" : null }, s);
      if (k === "A") { drawPaths(fr, DATA.sheets.A.layers.hatch, STY.A.hatch, "h"); drawPaths(fr, DATA.sheets.A.layers.walls, STY.A.walls, "w"); drawPaths(fr, DATA.sheets.A.layers.open, STY.A.open, "o"); }
      else {
        const sh = DATA.sheets[k];
        const b = D.el("g", { transform: `translate(${sh.off[0]} ${sh.off[1]})` }, fr);
        drawPaths(b, DATA.base.walls, STY.base.walls, "w");
        drawPaths(fr, sh.disc, discSty(k), "d");
      }
      return (thumbs[k] = s);
    }

    function symSvg(g, big) {
      const cls = `sym ${big ? "big" : ""}`;
      const col = SHEETS[g.s].color;
      if (g.kind === "el" || g.kind === "unk") {
        const gl = g.kind === "el" ? LG[g.c][3] : EL.unk[g.u].gl;
        const txt = gl.t ? `<text x="${gl.t[1]}" y="${gl.t[2]}" font-size="${gl.t[3]}" fill="${col}" text-anchor="middle" dominant-baseline="central" font-family="IBM Plex Mono, monospace">${esc(gl.t[0])}</text>` : "";
        return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">${gl.f ? `<path d="${gl.f}" fill="${col}"/>` : ""}<path d="${gl.l}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round"/>${txt}</svg>`;
      }
      if (g.kind === "note") return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><rect x="12" y="24" width="76" height="52" rx="4" fill="#c39bff33" stroke="#c39bff" stroke-width="2.4"/><path d="M22 40h56M22 50h56M22 60h36" stroke="#c39bff" stroke-width="3"/></svg>`;
      const s = DATA.sym["PL:" + g.t];
      return `<svg class="${cls}" viewBox="0 0 ${s.w} ${s.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${s.b ? `<path d="${s.b}" fill="#26303a"/>` : ""}${s.f ? `<path d="${s.f}" fill="${col}"/>` : ""}<path d="${s.s}" fill="none" stroke="${col}" stroke-width="1.1" vector-effect="non-scaling-stroke"/></svg>`;
    }

    function renderSide() {
      const step = D.step;
      let h = "";
      if (step === 1) {
        const k = st.sheet, hid = st.hidden[k];
        const rows = (k === "A" ? LAYER_NAMES.A : LAYER_NAMES.X).map(([key, name, code, keys]) => {
          const nm = key === "disc" ? `שכבת ${SHEETS[k].disc}` : name, cd = key === "disc" ? DISC_LAYER[k] : code;
          const col = key === "disc" ? SHEETS[k].color : key === "walls" ? "#c9d1d4" : key === "open" ? "#8c979c" : key === "fix" ? "#6d7b85" : "#46515a";
          return `<label><input type="checkbox" data-lay="${keys.join(",")}" ${keys.some((x) => hid.has(x)) ? "" : "checked"}><i class="sw" style="background:${col}"></i><span class="grow">${esc(nm)}</span><code>${esc(cd)}</code></label>`;
        }).join("");
        h = `<div class="hd"><h2>סט השרטוטים</h2><p>בית פרטי, קומת קרקע: ארבעה גיליונות PDF וקטוריים משלושה תחומים. בחרו גיליון כדי לפתוח אותו.</p></div>
        <div class="bd">
          <div class="sheets">${ORDER.map((x) => `<button class="sc ${x === k ? "on" : ""}" type="button" data-open="${x}" aria-pressed="${x === k}"><span class="th" data-thumb="${x}"></span><span class="m"><span class="r"><b>${SHEETS[x].code}</b>${discTag(x)}</span><span class="s">${esc(SHEETS[x].t)}</span></span></button>`).join("")}</div>
          <div class="lbl">שכבות בגיליון ${SHEETS[k].code}</div>
          <div class="layers">${rows}</div>
          <div class="note">כל פריט נמדד בגיליון אחד בלבד: <b>חדרים, קירות, דלתות וחלונות</b> מגיליון האדריכלות; <b>סמלי חשמל ותאורה</b> מגיליונות החשמל; <b>נקודות וכלים סניטריים</b> מגיליון האינסטלציה. הרקע האדריכלי שמופיע בגיליונות האחרים לא נמדד שוב.</div>
        </div>${D.nav(null, 2, "הרץ ניתוח")}`;
      } else if (step === 2) {
        const busy = st.running;
        h = `<div class="hd"><h2>ניתוח הגיליונות</h2><p>לכל גיליון: זיהוי תחום, קנה מידה, קריאת מקרא, ספירת סמלים ותוויות, ומדידת חדרים, קירות ופתחים.</p></div>
        <div class="bd">
          <div class="stats"><div><b>4</b><span>גיליונות</span></div><div><b>${st.analyzed ? R.length : "…"}</b><span>חדרים</span></div><div><b>${st.analyzed ? O.length : "…"}</b><span>פתחים</span></div><div><b>${st.analyzed ? nSymbols : "…"}</b><span>סמלים ותוויות</span></div></div>
          <div class="proc" id="proc">${ORDER.map(procRow).join("")}</div>
          ${busy ? `<button class="btn sm" type="button" id="skip">דלג לסוף הניתוח</button>` : `
          <div class="lbl">מה להציג בשרטוט</div>
          <div class="chk">
            <label><input type="checkbox" data-show="rooms" ${st.show.rooms ? "checked" : ""}>חדרים</label>
            <label><input type="checkbox" data-show="walls" ${st.show.walls ? "checked" : ""}>קירות לפי סוג</label>
            <label><input type="checkbox" data-show="open" ${st.show.open ? "checked" : ""}>דלתות וחלונות</label>
            <label><input type="checkbox" data-show="sym" ${st.show.sym ? "checked" : ""}>סמלים ותוויות</label>
          </div>
          <div id="insp">${inspectHtml()}</div>
          <div class="row"><button class="btn sm" type="button" id="rerun">הרץ שוב</button></div>`}
        </div>${D.nav(1, 3, "לסיווג ובדיקה", busy)}`;
      } else if (step === 3) {
        const done = groups.filter((g) => g.cat).length, n = groups.length;
        const g = groups[st.selGroup];
        const opts = optsOf(g).map(([v, lab]) => `<option value="${esc(v)}" ${g.choice === v ? "selected" : ""}>${esc(lab)}</option>`).join("");
        const kindTxt = { el: "לבדיקה", unk: "לא במקרא", note: "הערה", pl: "תווית" };
        h = `<div class="hd"><h2>סיווג ובדיקה</h2><p>מה שהמערכת זיהתה אבל לא סגרה לבד: סמלים שדומים למקרא ולא זהים לו, צורה שאינה במקרא, הערות מתכנן עם כמות, ותוויות האינסטלציה שהטקסט שלהן נקרא. אשרו את ההצעה או בחרו אחרת.</p></div>
        <div class="bd">
          <div class="row" style="justify-content:space-between"><span>סווגו <b class="mono">${done}/${n}</b> קבוצות · <b class="mono">${sum(groups.filter((x) => x.cat), (x) => x.n)}</b> פריטים</span>${done < n ? `<button class="btn sm" type="button" id="acceptAll">אשר את כל ההצעות</button>` : '<span class="pill ok">הכל סווג</span>'}</div>
          <div class="progress"><i style="width:${(done / n) * 100}%"></i></div>
          <div class="cdet">
            <div class="top">${symSvg(g, true)}<div class="t"><b>${esc(g.leg || "צורה חוזרת שאינה במקרא")}</b><span class="mono" style="color:var(--muted)">${SHEETS[g.s].code} · ${g.kind === "el" ? g.c + " · " : ""}${g.n} ${g.kind === "note" ? "הערות" : g.kind === "pl" ? "תוויות" : "מופעים"}</span></div></div>
            <div class="why">${esc(g.why)}${g.cat ? ` · <span class="pill ok">${g.cat === "x" ? "לא נספר" : "שויך"}</span>` : ""}</div>
            <select id="catSel" aria-label="סעיף לשיוך">${opts}</select>
            <div class="row"><button class="btn pri" type="button" id="confirm">${g.cat ? "עדכן" : "אשר"} (${g.n})</button>${g.cat ? '<button class="btn sm ghost" type="button" id="unassign">בטל שיוך</button>' : ""}</div>
          </div>
          <div class="clist" id="clist">${["E", "L", "P"].map((s) => {
            const gs = groups.map((x, i) => [x, i]).filter(([x]) => x.s === s);
            return `<div class="cg">${SHEETS[s].code} · ${esc(SHEETS[s].disc)}</div>` + gs.map(([x, i]) => `
              <div class="cl ${i === st.selGroup ? "on" : ""}" data-g="${i}" role="button" tabindex="0">${symSvg(x)}<div class="t"><div>${esc(x.leg || "צורה חוזרת שאינה במקרא")}</div><div class="mt"><span class="mono">×${x.n}</span> · ${esc(kindTxt[x.kind])}${x.cat ? "" : ` · הצעה: ${esc(optLabel(x, x.choice))}`}</div></div>${x.cat ? `<span class="pill ${x.cat === "x" ? "" : "ok"}">${x.cat === "x" ? "—" : "✓"}</span>` : '<span class="pill warn">ממתין</span>'}</div>`).join("");
          }).join("")}</div>
          <div class="note">שיוך אחד מעביר את כל הפריטים של הקבוצה לסעיף. מה שלא ישויך יישאר ברשימת "לבירור" ולא ייכנס לכתב הכמויות. כשהכל מאושר, פרק 08 זהה לכתב הכמויות של החשמל.</div>
        </div>${D.nav(2, 4, "לכתב הכמויות")}`;
      } else if (step === 4) {
        const line = st.lines.find((l) => l.id === st.selLine) || st.lines[0];
        const real = st.lines.filter((l) => !l.u99);
        const chs = [...new Set(real.map((l) => l.ch))];
        const pend = st.lines.filter((l) => l.u99);
        const C = checks();
        h = `<div class="hd"><h2>כתב כמויות לפי פרקים</h2><p>${real.length} סעיפים ב־${chs.length} פרקים של המפרט הכללי. כמויות נטו לפי אופני המדידה; כל סעיף מקושר למה שנספר או נמדד. לחצו על סעיף כדי לראות את המקור, או על פריט בשרטוט כדי למצוא את הסעיף שלו.</p></div>
        <div class="bd">
          ${st.selCheck ? checkDetail(C.find((c) => c.id === st.selCheck)) : lineDetail(line)}
          <div class="boq" id="boqList">${chs.map((ch) => {
            const ls = real.filter((l) => l.ch === ch);
            return `<div class="chs"><div class="chh">פרק ${ch} · ${esc(CH[ch])}<span>${ls.length} סעיפים</span></div>${ls.map((l) => blRow(l, line)).join("")}</div>`;
          }).join("")}${pend.length ? `<div class="chs"><div class="chh">לבירור · לא בכתב הכמויות<span>${pend.length}</span></div>${pend.map((l) => blRow(l, line)).join("")}</div>` : ""}</div>
          <div class="lbl">בקרה בין הגיליונות</div>
          <div class="qa" id="qaList">${C.map((c) => `<div class="qr ${st.selCheck === c.id ? "on" : ""}" data-qa="${c.id}" role="button" tabindex="0"><span class="pill ${c.ok === "ok" ? "ok" : c.ok === "warn" ? "warn" : ""}">${c.ok === "ok" ? "✓" : c.ok === "warn" ? "!" : "i"}</span><span><b>${esc(c.t)}</b><span>${esc(c.d)}</span></span></div>`).join("")}</div>
          <div class="lbl">הנחות חישוב (משנות את הכמויות)</div>
          <div class="sets">
            <label>גובה בנייה, רצפה עד תקרה (מ׳)<input type="number" step="0.05" min="2.6" max="4" value="${st.set.hb}" data-set="hb"></label>
            <label>גובה חדר נטו (מ׳)<input type="number" step="0.05" min="2.4" max="3.6" value="${st.set.hn}" data-set="hn"></label>
            <label>חיפוי בחדרי רחצה עד (מ׳)<input type="number" step="0.1" min="0.6" max="3.6" value="${st.set.hbath}" data-set="hbath"></label>
            <label>חיפוי בשירותים ובכביסה עד (מ׳)<input type="number" step="0.1" min="0.6" max="3.6" value="${st.set.hwc}" data-set="hwc"></label>
          </div>
          <div class="note"><b>לא בכתב הזה:</b> שלד ובטון (פרק 02) ועבודות עפר, לפי תוכניות הקונסטרוקציה; גג, איטום ובידוד גג; חזיתות (אין חזיתות בסט); מטבח, כלים סניטריים וגופי תאורה (בהספקת המזמין); מיזוג אוויר וציוד הסינון בממ״ד; מערכת סולארית; מתקן גז; צנרת ביוב חיצונית, שוחות וחיבור המים; פיתוח וגינון; הזנת חברת החשמל.</div>
        </div>${D.nav(3, 5, "לתמחור")}`;
      } else if (step === 5) {
        const T = totals();
        h = `<div class="hd"><h2>תמחור ועריכה</h2><p>${st.priced ? "המחירים נטענו ממחירון לדוגמה. ערכו כמות או מחיר בטבלה, והסכומים מתעדכנים." : "פרק 08 מתומחר כבר לפי כתב הכמויות של החשמל. טענו מחירון לשאר הפרקים, או הקלידו מחיר ישירות בטבלה."}</p></div>
        <div class="bd">
          ${st.priced ? "" : '<button class="btn pri" type="button" id="loadPrices">טען מחירון לדוגמה</button>'}
          <div class="stats c3"><div><b id="s-pr">${T.priced}/${T.n}</b><span>סעיפים מתומחרים</span></div><div><b id="s-miss" style="color:${T.missing ? "var(--warn)" : "var(--ok)"}">${T.missing}</b><span>בלי מחיר</span></div><div><b id="s-ov">${Object.keys(st.qty).length}</b><span>כמויות שנערכו</span></div></div>
          ${T.missing ? `<button class="btn sm" type="button" id="nextMiss">לסעיף הבא בלי מחיר ←</button>` : ""}
          <div class="tots">
            <div><span>סה"כ לפני מע"מ</span><b id="t-sub">${D.money(T.sub)}</b></div>
            <div><span>בלתי צפויים<input type="number" min="0" max="20" step="1" value="${st.cont}" id="ctIn" aria-label="בלתי צפויים באחוזים">%</span><b id="t-ct">${D.money(T.cont)}</b></div>
            <div><span>מע"מ ${st.vat}%</span><b id="t-vat">${D.money(T.vat)}</b></div>
            <div><span>סה"כ כולל מע"מ</span><b id="t-tot">${D.money(T.total)}</b></div>
          </div>
          <div class="lbl">התפלגות לפי פרק</div>
          <div class="bars" id="bars">${barsHtml(T)}</div>
          <div class="note">מחירון לדוגמה: מחירי קבלן 2026 לפני מע״מ, כולל תקורה ורווח, לא הצעת מחיר. "בלתי צפויים" הוא רזרבה של אומדן מסט שעדיין חסרים בו פרטים. ${T.pend ? `<b>${T.pend}</b> קבוצות שלא סווגו אינן בסכום.` : ""} במערכת נטען המחירון שלכם, ומחיר שנערך ידנית נשמר גם כשמחשבים את הכמויות מחדש.</div>
        </div>${D.nav(4, 6, "לייצוא")}`;
      } else if (step === 6) {
        const T = totals();
        const chs = [...new Set(st.lines.filter((l) => !l.u99).map((l) => l.ch))];
        h = `<div class="hd"><h2>ייצוא</h2><p>סיכום לפי פרקים, מוכן להדבקה באקסל. כל סעיף יוצא עם המקור וההנחות שלו.</p></div>
        <div class="bd">
          <div class="stats c3"><div><b>${T.n}</b><span>סעיפים</span></div><div><b>${chs.length}</b><span>פרקים</span></div><div><b style="font-size:15px">${D.money(T.total)}</b><span>כולל מע"מ</span></div></div>
          <button class="btn pri" type="button" id="copyBoq">העתק את כתב הכמויות לאקסל</button>
          <button class="btn" type="button" id="copySum">העתק סיכום פרקים</button>
          ${T.missing ? `<div class="note"><b>${T.missing}</b> סעיפים בלי מחיר לא נכללו בסכום. הם יוצאים עם תא מחיר ריק.</div>` : ""}
          <div class="note">במערכת המלאה: קובץ <span class="mono">.xlsx</span> בפורמט כתב כמויות, עם גיליון מקורות שמפנה מכל סעיף לגיליון ולפריטים בשרטוט, גיליון הנחות וגיליון בקרות.</div>
          ${D.cta("רוצים כתב כמויות כזה מהשרטוטים שלכם?", "נריץ את המערכת על סט שרטוטים של פרויקט שלכם ונעבור יחד על הסעיפים, המקורות והבקרות.")}
        </div>${D.nav(5, null)}`;
      }
      D.side(h);
      bindSide();
    }
    const blRow = (l, sel) => `<div class="bl ${l.id === sel.id && !st.selCheck ? "on" : ""} ${l.u99 ? "u" : ""}" data-l="${esc(l.id)}" role="button" tabindex="0"><span class="c">${l.code}</span><span class="ds" title="${esc(l.d)}">${esc(l.d)}</span><span class="q">${qfmt(l)} ${esc(l.u)}</span></div>`;

    function scrollInto(box, row) {
      if (!box || !row) return;
      const top = row.offsetTop - box.offsetTop, bot = top + row.offsetHeight;
      if (top < box.scrollTop + 30 || bot > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 2 + row.offsetHeight / 2);
    }

    function srcChips(src) {
      return sheetsOfSrc(src).map((k) => {
        const n = (src.refs || []).filter((r) => refBox(r)[0] === k).length;
        const what = k === "A" ? (src.walls && src.walls.length ? " · קירות" : src.open && src.open.length ? ` · ${src.open.length} פתחים` : src.showers ? " · מקלחות" : src.counter ? " · משטח המטבח" : ` · ${(src.rooms || []).length} חדרים`) : ` · ${n}`;
        return `<button class="chip" type="button" data-sh="${k}">${SHEETS[k].code}${what}</button>`;
      }).join("");
    }
    function lineDetail(l) {
      if (!l) return "";
      const [cc, ct] = CONF[l.conf];
      return `<div class="ldet"><div class="ch"><b>${l.code}</b><span class="row" style="gap:4px"><span class="pill">${METHOD[l.m]}</span><span class="pill ${cc}">${ct}</span></span></div>
        <div class="bd2"><div>${esc(l.d)}${l.u99 ? ' <span class="pill warn">לבירור</span>' : ""}</div>
        <div class="qq"><span style="color:var(--muted)">${l.u99 ? "לא בכתב הכמויות" : `פרק ${l.ch} · ${esc(CH[l.ch])}`}</span><span class="v">${qfmt(l)} <span style="font-size:13px;font-weight:500">${esc(l.u)}</span></span></div>
        <ul>${l.as.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
        <div class="chips"><span style="color:var(--muted);font-size:12px">מקור:</span>${srcChips(l.src)}</div></div></div>`;
    }
    function checkDetail(c) {
      if (!c) return "";
      return `<div class="ldet"><div class="ch"><b style="font-family:var(--font)">${esc(c.t)}</b><span class="pill ${c.ok === "ok" ? "ok" : c.ok === "warn" ? "warn" : ""}">${c.ok === "ok" ? "תואם" : c.ok === "warn" ? "לבדיקה" : "לידיעה"}</span></div>
        <div class="bd2"><div>${esc(c.d)}</div><div class="chips"><span style="color:var(--muted);font-size:12px">מקור:</span>${srcChips(c.src)}</div>
        <div class="row"><button class="btn sm ghost" type="button" id="closeQa">חזרה לסעיף</button></div></div></div>`;
    }

    function barsHtml(T) {
      const chs = Object.keys(T.byCh).sort();
      if (!chs.length) return '<div class="note" style="display:block">עוד אין סעיפים מתומחרים.</div>';
      const mx = Math.max(...chs.map((c) => T.byCh[c]));
      return chs.map((c) => `<div><span>${c} · ${esc(CH[c])}</span><i style="width:${(T.byCh[c] / mx) * 100}%"></i><b>${D.money(T.byCh[c])}</b></div>`).join("");
    }

    const onKey = (e, fn) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
    function bindSide() {
      const side = D.sideEl, step = D.step;
      if (step === 1) {
        side.querySelectorAll("[data-thumb]").forEach((ph) => ph.appendChild(thumb(ph.dataset.thumb)));
        side.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => { openSheet(b.dataset.open); D.cmd(`BOQ OPEN ${SHEETS[b.dataset.open].code}.pdf`); D.track("demo_action", { action: "open_sheet" }); }));
        side.querySelectorAll("[data-lay]").forEach((c) => (c.onchange = () => {
          const keys = c.dataset.lay.split(","), hid = st.hidden[st.sheet];
          keys.forEach((x) => (c.checked ? hid.delete(x) : hid.add(x)));
          applyLayers();
          D.cmd(`LAYER ${c.checked ? "ON" : "OFF"} ${keys.join(" ").toUpperCase()}`);
        }));
      }
      if (step === 2) {
        bindOpen(side);
        const sk = document.getElementById("skip");
        if (sk) sk.onclick = skipRun;
        const rr = document.getElementById("rerun");
        if (rr) rr.onclick = () => { startRun(); renderSide(); };
        side.querySelectorAll("[data-show]").forEach((c) => (c.onchange = () => { st.show[c.dataset.show] = c.checked; paint(); }));
      }
      if (step === 3) {
        side.querySelectorAll("[data-g]").forEach((r) => { r.onclick = () => selectGroup(+r.dataset.g); r.onkeydown = (e) => onKey(e, () => selectGroup(+r.dataset.g)); });
        const sel = document.getElementById("catSel");
        sel.onchange = () => { groups[st.selGroup].choice = sel.value; };
        document.getElementById("confirm").onclick = () => assign(st.selGroup, sel.value);
        const un = document.getElementById("unassign");
        if (un) un.onclick = () => { const g = groups[st.selGroup]; g.cat = null; buildLines(); D.cmd(`BOQ REVIEW UNSET ${SHEETS[g.s].code}:${g.c || g.t || g.k || "SHAPE"}`); paint(); renderSide(); };
        const all = document.getElementById("acceptAll");
        if (all) all.onclick = () => {
          const todo = groups.filter((g) => !g.cat);
          todo.forEach((g) => (g.cat = g.choice));
          buildLines(); paint(); renderSide();
          D.cmd(`BOQ REVIEW APPLY --suggestions  (${todo.length} groups)`);
          D.toast(`${todo.length} קבוצות שויכו, ${sum(todo, (g) => g.n)} פריטים עברו לסעיפים`);
          D.track("demo_action", { action: "classify_all" });
        };
        scrollInto(document.getElementById("clist"), side.querySelector(".cl.on"));
      }
      if (step === 4) {
        side.querySelectorAll("[data-l]").forEach((r) => { r.onclick = () => selectLine(r.dataset.l, true); r.onkeydown = (e) => onKey(e, () => selectLine(r.dataset.l, true)); });
        side.querySelectorAll("[data-qa]").forEach((r) => { r.onclick = () => selectCheck(r.dataset.qa); r.onkeydown = (e) => onKey(e, () => selectCheck(r.dataset.qa)); });
        const cq = document.getElementById("closeQa");
        if (cq) cq.onclick = () => { st.selCheck = null; selectLine(st.selLine, true); };
        side.querySelectorAll("[data-sh]").forEach((b) => (b.onclick = () => { openSheet(b.dataset.sh); paint(); zoomToHl(); }));
        side.querySelectorAll("[data-set]").forEach((inp) => (inp.onchange = () => {
          const v = parseFloat(inp.value), key = inp.dataset.set;
          const lim = { hb: [2.6, 4], hn: [2.4, 3.6], hbath: [0.6, 3.6], hwc: [0.6, 3.6] }[key];
          if (!isFinite(v)) { inp.value = st.set[key]; return; }
          st.set[key] = Math.min(lim[1], Math.max(lim[0], v));
          buildLines();
          D.cmd(`BOQ SET ${key.toUpperCase()}=${st.set[key]}  → REBUILD`);
          D.toast("הכמויות חושבו מחדש לפי ההנחה החדשה");
          D.track("demo_action", { action: "assumption" });
          renderSide(); paint();
        }));
        scrollInto(document.getElementById("boqList"), side.querySelector(".bl.on"));
      }
      if (step === 5) {
        const lp = document.getElementById("loadPrices");
        if (lp) lp.onclick = loadPrices;
        const nm = document.getElementById("nextMiss");
        if (nm) nm.onclick = nextMissing;
        const ct = document.getElementById("ctIn");
        ct.oninput = () => { const v = parseFloat(ct.value); st.cont = isFinite(v) ? Math.min(20, Math.max(0, v)) : 0; refreshTotals(); };
      }
      if (step === 6) {
        document.getElementById("copyBoq").onclick = () => { D.copy(tsvLines(), "כתב הכמויות הועתק. הדביקו בגיליון אקסל"); D.track("demo_export", { what: "boq" }); D.cmd("BOQ EXPORT --clipboard  BOQ"); };
        document.getElementById("copySum").onclick = () => { D.copy(tsvSummary(), "סיכום הפרקים הועתק. הדביקו בגיליון אקסל"); D.track("demo_export", { what: "summary" }); D.cmd("BOQ EXPORT --clipboard  SUMMARY"); };
      }
    }

    /* ---------------- step 3 actions ---------------- */
    function selectGroup(i, fromCanvas) {
      st.selGroup = i;
      const g = groups[i];
      if (st.sheet !== g.s) openSheet(g.s);
      paint();
      renderSide();
      if (!fromCanvas) zoomToHl();
      D.cmd(`BOQ REVIEW SHOW ${SHEETS[g.s].code}:${g.c || g.t || g.k || "SHAPE"}  (${g.n})`);
    }
    function assign(i, cat) {
      const g = groups[i];
      g.cat = cat; g.choice = cat;
      buildLines();
      D.cmd(`BOQ REVIEW SET ${SHEETS[g.s].code}:${g.c || g.t || g.k || "SHAPE"} → ${cat.toUpperCase()}`);
      D.toast(cat === "x" ? `${g.n} פריטים סומנו כלא לספירה` : `${g.n} פריטים שויכו: ${optLabel(g, cat)}`);
      D.track("demo_action", { action: "classify" });
      const next = groups.findIndex((x) => !x.cat);
      if (next >= 0) selectGroup(next);
      else { paint(); renderSide(); }
    }

    /* ---------------- step 4 actions ---------------- */
    function selectLine(id, zoom) {
      st.selLine = id; st.selCheck = null;
      const l = st.lines.find((x) => x.id === id);
      if (!l) return;
      const shs = sheetsOfSrc(l.src);
      if (shs.length && !shs.includes(st.sheet)) openSheet(shs[0]);
      paint();
      renderSide();
      if (zoom) zoomToHl();
      D.cmd(`BOQ SHOW ${l.code}  → ${shs.map((k) => SHEETS[k].code).join(" + ")}`);
    }
    function selectCheck(id) {
      st.selCheck = id;
      const c = checks().find((x) => x.id === id);
      const shs = sheetsOfSrc(c.src);
      if (shs.length && !shs.includes(st.sheet)) openSheet(shs[0]);
      paint(); renderSide(); zoomToHl();
      D.cmd(`BOQ CHECK ${id.toUpperCase()}  → ${shs.map((k) => SHEETS[k].code).join(" + ")}`);
      D.track("demo_action", { action: "check" });
    }

    /* ---------------- step 5: pricing table ---------------- */
    function tableHtml() {
      const T = totals();
      const chs = [...new Set(st.lines.filter((l) => !l.u99).map((l) => l.ch))];
      let h = `<table><thead><tr><th>סעיף</th><th>תיאור</th><th>יח'</th><th class="num">כמות</th><th class="num">מחיר יח' (₪)</th><th class="num">סה"כ (₪)</th></tr></thead><tbody>`;
      const row = (l) => {
        const p = priceOf(l), q = qtyOf(l), ovr = st.qty[l.id] != null;
        const miss = !l.u99 && p == null;
        return `<tr id="r-${cssId(l.id)}" class="${miss ? "miss" : ""} ${l.u99 ? "u" : ""}">
            <td class="code">${l.code}</td>
            <td class="desc">${esc(l.d)}${miss ? ` <span class="pill warn">${st.priced || l.el ? "חסר מחיר" : "לא תומחר"}</span>` : ""}${l.u99 ? ' <span class="pill warn">לא סווג</span>' : ""}</td>
            <td>${esc(l.u)}</td>
            <td class="num">${l.u99 ? qfmt(l) : `<input class="q ${ovr ? "ov" : ""}" type="number" step="any" min="0" value="${+q.toFixed(2)}" data-q="${esc(l.id)}" aria-label="כמות ${esc(l.code)}" title="${ovr ? `מחושב: ${qfmt(l, l.qty)}` : "כמות מחושבת"}">${ovr ? `<button class="rs" type="button" data-rs="${esc(l.id)}" title="חזרה לכמות המחושבת" aria-label="חזרה לכמות המחושבת">↺</button>` : ""}`}</td>
            <td class="num">${l.u99 ? "—" : `<input class="p ${miss ? "need" : ""}" type="number" step="any" min="0" value="${p == null ? "" : p}" placeholder="—" data-p="${esc(l.id)}" aria-label="מחיר ${esc(l.code)}">`}</td>
            <td class="num" id="t-${cssId(l.id)}">${!l.u99 && p != null ? fmt(p * q) : "—"}</td></tr>`;
      };
      chs.forEach((ch) => {
        h += `<tr class="grp"><td colspan="5">פרק ${ch} · ${esc(CH[ch])}</td><td class="num" id="cs-${ch}">${T.byCh[ch] ? fmt(T.byCh[ch]) : "—"}</td></tr>`;
        st.lines.filter((l) => l.ch === ch && !l.u99).forEach((l) => (h += row(l)));
      });
      const pend = st.lines.filter((l) => l.u99);
      if (pend.length) { h += `<tr class="grp"><td colspan="6">לבירור · לא בכתב הכמויות</td></tr>`; pend.forEach((l) => (h += row(l))); }
      h += `</tbody><tfoot>
        <tr><td colspan="5">סה"כ לפני מע"מ</td><td class="num" id="f-sub">${fmt(T.sub)}</td></tr>
        <tr><td colspan="5">בלתי צפויים ${st.cont}%</td><td class="num" id="f-ct">${fmt(T.cont)}</td></tr>
        <tr><td colspan="5">מע"מ ${st.vat}%</td><td class="num" id="f-vat">${fmt(T.vat)}</td></tr>
        <tr class="gt"><td colspan="5">סה"כ כולל מע"מ</td><td class="num" id="f-tot">${fmt(T.total)}</td></tr></tfoot></table>`;
      return h;
    }
    const cssId = (id) => id.replace(/[^a-zA-Z0-9_-]/g, "_");
    function refreshTotals() {
      const T = totals();
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      set("t-sub", D.money(T.sub)); set("t-ct", D.money(T.cont)); set("t-vat", D.money(T.vat)); set("t-tot", D.money(T.total));
      set("f-sub", fmt(T.sub)); set("f-ct", fmt(T.cont)); set("f-vat", fmt(T.vat)); set("f-tot", fmt(T.total));
      const ct = document.querySelector("#f-ct")?.previousElementSibling;
      if (ct) ct.textContent = `בלתי צפויים ${st.cont}%`;
      set("s-pr", `${T.priced}/${T.n}`);
      const sm = document.getElementById("s-miss");
      if (sm) { sm.textContent = T.missing; sm.style.color = T.missing ? "var(--warn)" : "var(--ok)"; }
      set("s-ov", Object.keys(st.qty).length);
      for (const ch of new Set(st.lines.map((l) => l.ch))) set(`cs-${ch}`, T.byCh[ch] ? fmt(T.byCh[ch]) : "—");
      const bars = document.getElementById("bars");
      if (bars) bars.innerHTML = barsHtml(T);
      const nm = document.getElementById("nextMiss");
      if (nm && !T.missing) nm.remove();
      updTotalKpi();
    }
    function refreshRow(l) {
      const p = priceOf(l), q = qtyOf(l), miss = !l.u99 && p == null;
      const tr = document.getElementById("r-" + cssId(l.id));
      if (!tr) return;
      tr.classList.toggle("miss", miss);
      tr.querySelector("input.p")?.classList.toggle("need", miss);
      const pill = tr.querySelector("td.desc .pill.warn");
      if (pill && !miss) pill.remove();
      if (!pill && miss) tr.querySelector("td.desc").insertAdjacentHTML("beforeend", ' <span class="pill warn">חסר מחיר</span>');
      document.getElementById("t-" + cssId(l.id)).textContent = p != null ? fmt(p * q) : "—";
    }
    D.tableEl.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.p) {
        const l = st.lines.find((x) => x.id === t.dataset.p);
        const v = parseFloat(t.value);
        st.price[l.id] = t.value === "" || !isFinite(v) ? null : Math.max(0, v);
        refreshRow(l); refreshTotals();
      } else if (t.dataset.q) {
        const l = st.lines.find((x) => x.id === t.dataset.q);
        const v = parseFloat(t.value);
        if (t.value === "" || !isFinite(v)) return;
        st.qty[l.id] = Math.max(0, v);
        t.classList.add("ov");
        refreshRow(l); refreshTotals();
      }
    });
    D.tableEl.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.p || t.dataset.q) {
        const l = st.lines.find((x) => x.id === (t.dataset.p || t.dataset.q));
        D.cmd(`BOQ EDIT ${l.code} ${t.dataset.p ? "PRICE" : "QTY"}=${t.value || "∅"}`);
        D.track("demo_action", { action: t.dataset.p ? "price_edit" : "qty_edit" });
        if (t.dataset.q) { D.table(tableHtml()); renderSide(); }
      }
    });
    D.tableEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rs]");
      if (!b) return;
      delete st.qty[b.dataset.rs];
      D.table(tableHtml()); renderSide(); updTotalKpi();
    });
    function loadPrices() {
      st.priced = true;
      D.table(tableHtml());
      D.tableEl.querySelectorAll("tbody tr:not(.grp)").forEach((tr, i) => { tr.style.animationDelay = `${i * 12}ms`; tr.classList.add("flash"); });
      const T = totals();
      D.cmd(`BOQ PRICE --list SAMPLE  (${T.priced} priced, ${T.missing} missing)`);
      D.toast(`${T.priced} סעיפים מתומחרים. ${T.missing} סעיפים בלי מחיר במחירון מסומנים בצהוב`);
      D.track("demo_action", { action: "load_prices" });
      renderSide(); updTotalKpi();
    }
    function nextMissing() {
      const inp = [...D.tableEl.querySelectorAll("input.p.need")][0];
      if (!inp) return;
      inp.scrollIntoView({ block: "center", behavior: "smooth" });
      inp.focus({ preventScroll: true });
    }

    /* ---------------- step 6: export ---------------- */
    const n2 = (v) => (Math.round(v * 100) / 100).toString();
    const srcText = (src) => sheetsOfSrc(src).map((k) => SHEETS[k].code).join(" + ");
    function tsvLines() {
      const rows = [["פרק", "שם פרק", "סעיף", "תיאור", "יחידה", "כמות", "מחיר יחידה", "סה\"כ", "מקור", "הנחות"].join("\t")];
      st.lines.forEach((l) => {
        const p = priceOf(l), q = qtyOf(l);
        rows.push([l.ch, l.u99 ? "לבירור" : CH[l.ch], l.code, l.d, l.u, n2(q), p == null ? "" : n2(p), p == null || l.u99 ? "" : n2(p * q), srcText(l.src), l.as.join(" | ")].map((x) => String(x).replace(/[\t\n]/g, " ")).join("\t"));
      });
      const T = totals();
      rows.push("", ["", "", "", "סה\"כ לפני מע\"מ", "", "", "", n2(T.sub)].join("\t"), ["", "", "", `בלתי צפויים ${st.cont}%`, "", "", "", n2(T.cont)].join("\t"), ["", "", "", `מע"מ ${st.vat}%`, "", "", "", n2(T.vat)].join("\t"), ["", "", "", "סה\"כ כולל מע\"מ", "", "", "", n2(T.total)].join("\t"));
      return rows.join("\n");
    }
    function tsvSummary() {
      const T = totals();
      const rows = [["פרק", "שם פרק", "סעיפים", "סה\"כ (₪)", "% מהסכום"].join("\t")];
      [...new Set(st.lines.filter((l) => !l.u99).map((l) => l.ch))].forEach((ch) => {
        const v = T.byCh[ch] || 0;
        rows.push([ch, CH[ch], st.lines.filter((l) => l.ch === ch).length, n2(v), T.sub ? n2((v / T.sub) * 100) : "0"].join("\t"));
      });
      rows.push(["", "סה\"כ לפני מע\"מ", "", n2(T.sub), ""].join("\t"), ["", `בלתי צפויים ${st.cont}%`, "", n2(T.cont), ""].join("\t"), ["", `מע"מ ${st.vat}%`, "", n2(T.vat), ""].join("\t"), ["", "סה\"כ כולל מע\"מ", "", n2(T.total), ""].join("\t"));
      return rows.join("\n");
    }
    function summaryHtml() {
      const T = totals();
      const chs = [...new Set(st.lines.filter((l) => !l.u99).map((l) => l.ch))];
      let h = `<table><thead><tr><th>פרק</th><th>שם הפרק</th><th class="num">סעיפים</th><th class="num">בלי מחיר</th><th class="num">סה"כ (₪)</th><th class="num">%</th></tr></thead><tbody>`;
      chs.forEach((ch) => {
        const ls = st.lines.filter((l) => l.ch === ch), v = T.byCh[ch] || 0;
        const miss = ls.filter((l) => priceOf(l) == null).length;
        h += `<tr><td class="code">${ch}</td><td>${esc(CH[ch])}</td><td class="num">${ls.length}</td><td class="num">${miss ? `<span class="pill warn">${miss}</span>` : "—"}</td><td class="num">${v ? fmt(v) : "—"}</td><td class="num">${T.sub && v ? fmt((v / T.sub) * 100, 1) : "—"}</td></tr>`;
      });
      h += `</tbody><tfoot><tr><td colspan="4">סה"כ לפני מע"מ</td><td class="num">${fmt(T.sub)}</td><td></td></tr>
        <tr><td colspan="4">בלתי צפויים ${st.cont}%</td><td class="num">${fmt(T.cont)}</td><td></td></tr>
        <tr><td colspan="4">מע"מ ${st.vat}%</td><td class="num">${fmt(T.vat)}</td><td></td></tr>
        <tr class="gt"><td colspan="4">סה"כ כולל מע"מ</td><td class="num">${fmt(T.total)}</td><td></td></tr></tfoot></table>`;
      return h;
    }

    /* ---------------- canvas clicks ---------------- */
    // A tap (no drag) selects whatever is under the finger. Resolved on pointerup with elementsFromPoint, because
    // the shell captures the pointer for panning and a large clickable area (a room) must still pan when dragged.
    let down = null;
    svg.addEventListener("pointerdown", (e) => { down = e.isPrimary ? { x: e.clientX, y: e.clientY } : null; });
    svg.addEventListener("pointerup", (e) => {
      if (!down || !e.isPrimary) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
      down = null;
      if (moved || D.dragged || (e.pointerType === "mouse" && e.button !== 0)) return;
      const hits = document.elementsFromPoint(e.clientX, e.clientY).filter((x) => x.dataset && x.dataset.k);
      // smallest thing first: a symbol or an opening over the room around it
      const t = hits.find((x) => !x.dataset.k.startsWith("m:")) || hits[0];
      if (t) tap(t.dataset.k);
    });
    function tap(key) {
      const [kind, ...rest] = key.split(":");
      const ref = rest.join(":");
      if (D.step === 2 && st.analyzed) {
        st.insp = key;
        paint();
        const box = document.getElementById("insp");
        if (box) box.innerHTML = inspectHtml();
        D.cmd(kind === "r" ? `BOQ INSPECT ${ref.toUpperCase()}` : kind === "m" ? `BOQ INSPECT ROOM ${+rest[0] + 1}` : kind === "w" ? "BOQ INSPECT WALL" : "BOQ INSPECT OPENING");
        D.track("demo_action", { action: "inspect" });
      } else if (D.step === 3 && kind === "r") {
        const [t, a] = ref.split(":");
        const g = t === "e" ? instGroup[+a] : t === "u" ? unkGroup[+a] : t === "n" ? noteGroup[+a] : t === "l" ? labelGroup[+a] : null;
        const i = groups.indexOf(g);
        if (i >= 0) selectGroup(i, true);
      } else if (D.step === 4) {
        let id = null;
        const real = st.lines.filter((l) => !l.u99);
        if (kind === "r") id = (real.find((l) => (l.src.refs || []).includes(ref)) || st.lines.find((l) => (l.src.refs || []).includes(ref)))?.id;
        if (kind === "o") id = real.find((l) => (l.src.open || []).includes(+rest[0]) && l.ch !== "04")?.id;
        if (kind === "m") id = WET.has(R[+rest[0]].k) || R[+rest[0]].k === "service" ? "fl:wet" : "fl:dry";
        if (id) { selectLine(id, false); D.track("demo_action", { action: "reverse_lookup" }); }
      }
    }
    svg.addEventListener("pointermove", (e) => {
      const t = e.target.closest?.("[data-layer]");
      if (t && D.step === 1) D.barMid(`${esc(SHEETS[st.sheet].disc)} · Layer: <b>${t.dataset.layer.toUpperCase()}</b>`);
    });

    /* ---------------- steps ---------------- */
    function onStep(n, _D, prev) {
      if (n !== 2 && st.running) skipRun();
      if (n >= 3 && !st.analyzed) { st.analyzed = true; D.kpi("sym", nSymbols); }
      if (n >= 3) buildLines();
      D.table(n === 5 ? tableHtml() : n === 6 ? summaryHtml() : null);
      if (n === 1) {
        D.legend(null);
        renderSide();
        if (!cur) openSheet("A");
        else paint();
        if (!prev) D.hint("בחרו גיליון ברשימה או בלשוניות שמעל השרטוט");
      } else if (n === 2) {
        if (!st.analyzed && !st.running) { startRun(); renderSide(); }
        else { renderSide(); paint(); }
      } else if (n === 3) {
        D.legend([{ color: COL.pend, label: "ממתין לסיווג" }, { color: COL.ok, label: "נספר" }, { color: COL.info, label: "לא נספר / מידע" }, { color: "#ff5b2e", label: "הקבוצה הנבחרת" }]);
        const g = groups[st.selGroup];
        if (st.sheet !== g.s) openSheet(g.s);
        paint(); renderSide(); zoomToHl();
      } else if (n === 4) {
        D.legend([{ color: "#ff5b2e", label: "מקור הסעיף הנבחר" }, { color: "#8c979c", label: "פריט שנספר (לחצו למציאת הסעיף)" }]);
        if (!st.lines.some((l) => l.id === st.selLine)) st.selLine = st.lines[0].id;
        if (st.selCheck) selectCheck(st.selCheck); else selectLine(st.selLine, true);
        if (prev !== 4) D.hint("לחצו על סעיף ברשימה, או על פריט בשרטוט");
      } else {
        D.legend(null);
        renderSide();
      }
      updTotalKpi();
    }

    D.ready();
  }
})();
