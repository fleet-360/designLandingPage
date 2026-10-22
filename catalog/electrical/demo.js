/* Electrical & lighting demo: read the legend and the tags next to every symbol, count, check the design
   (shutter motor <-> switch, switching circuits, missing points, the designer's notes), count per room,
   priced bill of quantities.  Drawing data: data.json, built from the parsed sheets of a private house by
   tools/demos/electrical/extract.py (anonymized, plan centimetres, y down). */
(async () => {
  let DATA;
  try {
    const r = await fetch("/catalog/electrical/data.json");
    if (!r.ok) throw new Error(r.status);
    DATA = await r.json();
  } catch {
    document.body.insertAdjacentHTML("beforeend", '<p style="padding:24px;color:#a1a7b0">טעינת הדמו נכשלה. רעננו את הדף.</p>');
    return;
  }

  /* ---------- data ---------- */
  const W = DATA.w, H = DATA.h;
  const LG = {};
  DATA.legend.forEach((l, k) => { l.k_ = k; LG[l.c] = l; });
  const GRP = Object.fromEntries(DATA.groups);
  const GORDER = DATA.groups.map((g) => g[0]);
  const ROOMS = DATA.rooms;
  const OUT = { n: "חוץ וקירות חיצוניים", a: null };
  const SHEETS = {
    E: { name: "חשמל ותקשורת", short: "חשמל", file: "HOUSE_DEMO_E-01.dwg", color: "#ff6b81", layer: "ELEC" },
    L: { name: "תאורה", short: "תאורה", file: "HOUSE_DEMO_E-02.dwg", color: "#8fd6ff", layer: "LIGHT" },
  };
  const INST = DATA.inst.map((d, i) => Object.assign(d, { i, rr: d.len ? 30 : d.r }));   // rr: halo radius (a linear fixture is long)
  const UNK = DATA.unknown.map((u, i) => Object.assign(u, { i, as: null, pick: u.sug || "" }));
  const NOTES = DATA.notes.map((n, i) => Object.assign(n, { i }));
  const BOQ = Object.fromEntries(DATA.boq.map(([k, code, desc, unit, price]) => [k, { k, code, desc, unit, price }]));
  const CH = [["08.01", "נקודות מאור ומפסקים"], ["08.02", "בתי תקע וכוח"], ["08.03", "נקודות ייעודיות"], ["08.04", "לוח והכנות"], ["08.05", "תקשורת ומתח נמוך"], ["08.06", "גילוי אש"]];
  const SWITCH = new Set(["L23", "L24", "L25", "L26"]);
  const LSW = new Set(["L23", "L24", "L25"]);
  const LIGHTS = new Set(DATA.legend.filter((l) => l.k === "light").map((l) => l.c));
  const WP = new Set(["L17", "L18"]);
  const SOCK = new Set(["L29", "L30", "L31", "L32a", "L32b", "L33"]);
  const WHY = { L16: "צלב קצר בתוך העיגול", L02: "אותה מסגרת, טקסט בגודל אחר" };
  const ROWBOQ = { light: "08.01.010", sw: "כלול בנק׳ מאור", sw_shutter: "כלול ב־08.03.030" };

  const S = {
    sheet: "E",
    lay: { walls: true, doors: true, glaz: true, furn: true, sani: true, misc: true, symE: true, symL: true, anno: true },
    acc: new Set(), rej: new Set(), notes: new Set(),
    sel: null, show: null, room: null, rowSel: "L26", grp: "all", roomTable: false, qa: null,
    prices: {}, scanned: false,
  };

  const pending = (it) => it.rv && !S.acc.has(it.i) && !S.rej.has(it.i);
  const counted = (it) => !it.rv || S.acc.has(it.i);
  /** every counted symbol: exact matches, accepted similar ones, and repeated shapes assigned to a row */
  function symbols() {
    const out = [];
    INST.forEach((it) => { if (counted(it)) out.push({ c: it.c, rm: it.rm, s: it.s, t: it.t, m: it.m, role: it.role, it }); });
    UNK.forEach((u) => { if (u.as && u.as !== "x") u.items.forEach((t) => out.push({ c: u.as, rm: t.rm, s: u.s, t: t.t, u: t })); });
    return out;
  }
  /** points in the BOQ sense: not the switches (they belong to their light / shutter / heater point) */
  const isPoint = (p) => !SWITCH.has(p.c) && p.role !== "of";
  const points = () => symbols().filter(isPoint);
  const tally = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const nPending = () => INST.filter(pending).length;
  const nUnk = () => UNK.reduce((a, u) => a + (u.as ? 0 : u.items.length), 0);
  const switchBoxes = () => INST.filter((it) => counted(it) && (SWITCH.has(it.c) || SWITCH.has(it.g))).length;
  const outlets = (pts) => pts.reduce((a, p) => a + (SOCK.has(p.c) ? p.m || 1 : 0), 0);

  /* ---------- quantities (same rules as boq_quantities() in extract.py) ---------- */
  function quantities() {
    const q = {}, src = {};
    const add = (k, n = 1, c) => { if (!n) return; q[k] = (q[k] || 0) + n; if (c) (src[k] = src[k] || new Set()).add(c); };
    const circ = new Set();
    let fix = 0, boxes2 = 0;
    const swBy = {};
    symbols().forEach((p, n) => {
      if (p.role === "of") return;
      const c = p.c, k = LG[c].k;
      if (LIGHTS.has(c)) {
        fix++;
        circ.add(p.t || "#" + n);
        (src.light = src.light || new Set()).add(c);
        if (WP.has(c)) add("light_wp", 1, c);
      } else if (LSW.has(c)) {
        if (p.t) swBy[p.t] = (swBy[p.t] || 0) + 1;
        if (c === "L25") add("sw_ind", 1, c);
      } else if (c !== "L26") add(k, 1, c);
      if (SOCK.has(c) && (p.m || 1) > 1) { add("socket_add", p.m - 1, c); boxes2++; }
    });
    add("light", circ.size);
    add("light_add", fix - circ.size);
    if (q.light_add) src.light_add = src.light;
    let n2 = 0, n3 = 0;
    Object.values(swBy).forEach((n) => { if (n >= 2) { add("sw_2way", 2, "L24"); add("sw_cross", n - 2, "L24"); n >= 3 ? n3++ : n2++; } });
    NOTES.forEach((nt) => { if (nt.k && S.notes.has(nt.i)) add(nt.k, nt.q === "switches" ? switchBoxes() : nt.q, "note"); });
    return { q, src, info: { circ: circ.size, fix, n2, n3, boxes2 } };
  }
  function boqLines() {
    const { q, src, info } = quantities();
    const hint = {
      light: `${info.circ} מעגלי הדלקה`, light_add: `${info.fix} גופים, ${info.circ} מעגלים`,
      sw_2way: `${info.n2 + info.n3} מעגלים משני מקומות ויותר`, sw_cross: `${info.n3} מעגלים משלושה מקומות ויותר`,
      socket_add: `${info.boxes2} קופסאות כפולות (x2)`, neutral: `${switchBoxes()} קופסאות מפסק`,
    };
    return Object.keys(q).filter((k) => q[k] > 0).map((k) => {
      const b = BOQ[k];
      const p = S.prices[k] ?? b.price;
      const codes = [...(src[k] || [])];
      return { ...b, n: q[k], price: p, total: p * q[k], codes, note: codes.includes("note"), hint: hint[k] || "" };
    }).sort((a, b) => a.code.localeCompare(b.code));
  }
  const totals = () => {
    const net = boqLines().reduce((a, l) => a + l.total, 0);
    const vat = net * DATA.vat / 100;
    return { net, vat, gross: net + vat };
  };

  /* ---------- shell ---------- */
  const D = Demo({
    slug: "electrical",
    plugin: "PA_ELEC",
    tag: "AutoCAD plug-in · חשמל ותאורה",
    title: "חשמל ותאורה: מהמקרא לבקרת תכנון ולכתב כמויות",
    sub: "שרטוט דוגמה: בית פרטי חד־קומתי, גיליון חשמל וגיליון תאורה. התוסף קורא את המקרא ואת התגיות שליד כל סמל, סופר, בודק את התכנון ומפיק כתב כמויות מתומחר.",
    file: SHEETS.E.file,
    viewBox: [-60, -60, W + 120, H + 120],
    flipY: H,
    kpis: [{ id: "rows", label: "שורות מקרא" }, { id: "found", label: "נקודות" }, { id: "review", label: "לבדיקה" }, { id: "total", label: "סה״כ כולל מע״מ" }],
    steps: [
      { t: "קריאת השרטוט", d: "שני גיליונות, שכבות", cmd: "OPEN HOUSE_DEMO_E-01.dwg HOUSE_DEMO_E-02.dwg" },
      { t: "קריאת המקרא", d: "סמל, תיאור, סעיף", cmd: "PA_LEGEND READ" },
      { t: "זיהוי וספירה", d: "שורה מדליקה סמלים", cmd: "PA_COUNT ALL" },
      { t: "בקרת תכנון", d: "תגיות, מפסקים, הערות", cmd: "PA_CHECK" },
      { t: "לפי חדר", d: "נקודות בכל חדר", cmd: "PA_ROOMS" },
      { t: "כתב כמויות", d: "מחירים, מע״מ, אקסל", cmd: "PA_BOQ EXPORT" },
    ],
    onStep,
  });
  const { el, esc, fmt } = D;
  const svg = D.svg;

  /* ---------- glyphs (legend samples, 0..100 box) ---------- */
  const glyph = (gl, size = 20, color) => {
    const t = gl.t ? `<text x="${gl.t[1]}" y="${gl.t[2]}" font-size="${Math.max(gl.t[3], 16)}">${esc(gl.t[0])}</text>` : "";
    return `<svg class="gly" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"${color ? ` style="color:${color}"` : ""}>` +
      `<path d="${gl.l}" fill="none" stroke="currentColor" stroke-width="${size > 40 ? 1.6 : 1.2}" vector-effect="non-scaling-stroke"/>` +
      `<path d="${gl.f}" fill="currentColor"/>${t}</svg>`;
  };
  const rowColor = (c) => (["light", "switch"].includes(LG[c].g) || c === "L13" ? SHEETS.L.color : SHEETS.E.color);

  /* ---------- drawing ---------- */
  el("rect", { x: -W, y: -H, width: W * 3, height: H * 3, fill: "#111519" });
  const gBase = el("g", {});
  const baseEl = {};
  [["misc", "b-misc"], ["furn", "b-furn"], ["sani", "b-sani"], ["wallfill", "b-wallfill"], ["glaz", "b-glaz"], ["doors", "b-doors"], ["walls", "b-walls"], ["wallsH", "b-wallsH"]]
    .forEach(([k, cls]) => (baseEl[k] = el("path", { d: DATA.base[k], class: cls }, gBase)));
  const gRooms = el("g", { class: "rooms" });
  const roomEls = ROOMS.map((r, k) => {
    let d = "";
    for (let j = 0; j < r.p.length; j += 2) d += (j ? "L" : "M") + r.p[j] + " " + r.p[j + 1];
    return el("path", { d: d + "Z", class: "room", "data-room": k }, gRooms);
  });
  const gSheet = {};
  for (const s of ["E", "L"]) {
    const g = el("g", { class: "s-" + s });
    const anno = el("g", { class: "anno" }, g);
    el("path", { d: DATA.sheets[s].annoN, class: "an" }, anno);
    el("path", { d: DATA.sheets[s].anno, class: "al" }, anno);
    el("path", { d: DATA.sheets[s].annoF, class: "af" }, anno);
    gSheet[s] = { g, anno, syms: el("g", {}, g) };
  }
  const gNotes = el("g", { class: "notes" });
  NOTES.forEach((n) => (n.el = el("rect", { x: n.b[0] - 8, y: n.b[1] - 8, width: n.b[2] + 16, height: n.b[3] + 16, rx: 6, class: "nb s-" + n.s, "data-hit": "", "data-n": n.i }, gNotes)));
  const symEl = (parent, x, y, r, d, f, attrs) => {
    const g = el("g", { class: "sym", "data-hit": "", ...attrs }, parent);
    el("circle", { class: "halo", cx: x, cy: y, r: Math.max(r * 1.5, 20) }, g);
    if (d) el("path", { d, class: "gl" }, g);
    if (f) el("path", { d: f, class: "gf" }, g);
    el("circle", { class: "hit", cx: x, cy: y, r: Math.max(r + 8, 22) }, g);
    return g;
  };
  INST.forEach((it) => (it.el = symEl(gSheet[it.s].syms, it.x, it.y, it.rr, it.d, it.f, { "data-i": it.i })));
  UNK.forEach((u) => u.items.forEach((t, j) => (t.el = symEl(gSheet[u.s].syms, t.x, t.y, t.r, t.d, t.f, { "data-u": u.i, "data-j": j }))));
  const gLabels = el("g", { class: "rlabels" });
  const roomLbl = ROOMS.map((r) => {
    const t1 = el("text", { x: r.c[0], y: r.c[1] }, gLabels);
    t1.textContent = r.n;
    const t2 = el("text", { x: r.c[0], y: r.c[1], class: "n" }, gLabels);
    return { t1, t2, r };
  });
  /* keep labels and halos a constant size on screen while zooming (the shell zooms the viewBox) */
  function onView() {
    const vb = svg.viewBox.baseVal, cw = svg.clientWidth, ch = svg.clientHeight;
    if (!cw || !ch || !vb.width) return;
    const k = Math.max(vb.width / cw, vb.height / ch);       // cm per screen px
    const fs = 11.5 * k;
    gLabels.style.setProperty("--fs", fs + "px");
    gLabels.classList.toggle("compact", k > 4.2);
    roomLbl.forEach(({ t1, t2, r }) => {
      const compact = k > 4.2;
      t1.setAttribute("y", r.c[1] - fs * 0.15);
      t2.setAttribute("y", compact ? r.c[1] + fs * 0.35 : r.c[1] + fs * 1.0);
    });
    const hr = 7 * k;
    INST.forEach((it) => it.el.firstChild.setAttribute("r", Math.max(it.rr * 1.45, hr)));
    UNK.forEach((u) => u.items.forEach((t) => t.el.firstChild.setAttribute("r", Math.max(t.r * 1.2, hr))));
  }
  let viewRaf = 0;
  const queueView = () => { if (!viewRaf) viewRaf = requestAnimationFrame(() => { viewRaf = 0; onView(); }); };
  if (D.onView) D.onView(queueView);
  else new MutationObserver(queueView).observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
  addEventListener("resize", queueView);
  const scan = el("rect", { id: "scan", x: -260, y: -60, width: 220, height: H + 120 });
  scan.style.setProperty("--scan-w", W + 400 + "px");

  /* ---------- design check (step 4) ---------- */
  const tagSort = (a, b) => String(a).localeCompare(String(b), "he", { numeric: true });
  const tagList = (arr, max = 8) => {
    const u = [...new Set(arr)].sort(tagSort);
    return u.slice(0, max).map((t) => `<b class="mono ltr">${esc(t)}</b>`).join(" · ") + (u.length > max ? ` ועוד ${u.length - max}` : "");
  };
  function checks() {
    const F = [];
    const sy = symbols();
    const ins = sy.filter((p) => p.it);
    const motors = ins.filter((p) => p.c === "L28"), ssw = ins.filter((p) => p.c === "L26");
    const mt = new Set(motors.map((p) => p.t).filter(Boolean)), stg = new Set(ssw.map((p) => p.t).filter(Boolean));
    const noSw = motors.filter((p) => !p.t || !stg.has(p.t)), noMot = ssw.filter((p) => !p.t || !mt.has(p.t));
    const pairs = [...mt].filter((t) => stg.has(t)).length;
    const mts = [...mt].sort(tagSort);
    F.push({
      id: "shut", sev: noSw.length || noMot.length ? "bad" : "ok", title: "תריס חשמלי: מנוע ומפסק לכל פתח",
      n: `${motors.length}/${ssw.length}`,
      text: `${motors.length} מנועי תריס, ${ssw.length} מפסקי תריס. ${pairs} זוגות מנוע־מפסק לפי התגית${mts.length ? ` (<b class="mono ltr">${esc(mts[0])}</b> עד <b class="mono ltr">${esc(mts[mts.length - 1])}</b>)` : ""}.` +
        (noSw.length ? ` <b>${noSw.length} מנועים בלי מפסק</b> (${tagList(noSw.map((p) => p.t || "?"))}).` : "") +
        (noMot.length ? ` <b>${noMot.length} מפסקים בלי מנוע</b>.` : "") +
        ` אין לחצן "סגירה כללית" (אופציונלי).`,
      els: [...motors, ...ssw].map((p) => p.it.el),
    });
    const swapSh = ssw.filter((p) => p.it.g && p.it.g !== "L26");
    const heatSw = INST.filter((it) => counted(it) && it.g === "L26" && it.c !== "L26");
    if (swapSh.length || heatSw.length) F.push({
      id: "glyph", sev: "warn", title: "סמלי המפסקים הוחלפו", n: swapSh.length + heatSw.length,
      text: `${swapSh.length} מפסקי התריס משורטטים בסמל "${esc(LG[swapSh[0]?.it.g || "L25"].he)}", ו־${heatSw.length} המפסקים של תנורי החימום והדוד (${tagList(heatSw.map((it) => it.t))}) משורטטים בסמל "מפסק תריס". ` +
        `התוסף סיווג לפי התגית שליד כל מפסק. כדאי לתקן את הבלוקים לפני הוצאה לביצוע.`,
      els: [...swapSh.map((p) => p.it.el), ...heatSw.map((it) => it.el)],
    });
    const boil = ins.filter((p) => p.c === "L10");
    F.push(boil.length ? {
      id: "boiler", sev: "warn", title: "נקודת דוד", n: boil.length,
      text: `אין בשרטוט סמל "שעון דוד". נמצא מפסק עם התווית "דוד" ליד חדר הרחצה, והוא נספר כנקודת דוד אחת (שעון דוד ומפסק עם נורית). לוודא מיקום דוד ושעון.`,
      els: boil.map((p) => p.it.el),
    } : { id: "boiler", sev: "bad", title: "נקודת דוד", n: 0, text: "לא נמצאה נקודת דוד בשרטוט.", els: [] });
    // switching circuits (tags)
    const lsw = ins.filter((p) => LSW.has(p.c) && p.t);
    const swBy = {};
    lsw.forEach((p) => (swBy[p.t] = swBy[p.t] || []).push(p));
    const multi = Object.keys(swBy).filter((t) => swBy[t].length >= 2);
    const three = multi.filter((t) => swBy[t].length >= 3);
    const wrong = INST.filter((it) => counted(it) && LSW.has(it.c) && it.g && LSW.has(it.g));
    const drawnSingle = wrong.filter((it) => it.c === "L24"), drawn2 = wrong.filter((it) => it.c !== "L24");
    F.push({
      id: "2way", sev: wrong.length ? "warn" : "ok", title: "הדלקה מכמה מקומות", n: multi.length,
      text: `${multi.length} מעגלים מודלקים מכמה מקומות ודורשים מחליפים; ${three.length} מהם משלושה מקומות ויותר ודורשים גם מפסק צלב (${tagList(three)}).` +
        (drawnSingle.length ? ` <b>${drawnSingle.length} מפסקים משורטטים כמפסק רגיל</b> במעגל דו־מקומי (${tagList(drawnSingle.map((it) => it.t))}).` : "") +
        (drawn2.length ? ` ${drawn2.length} מפסקים משורטטים כמחליף אבל מפעילים ממקום אחד בלבד (${tagList(drawn2.map((it) => it.t))}).` : ""),
      els: (wrong.length ? wrong.map((it) => it.el) : multi.flatMap((t) => swBy[t].map((p) => p.it.el))),
    });
    // loads without a switch / switches without a load
    const swT = new Set(lsw.map((p) => p.t));
    const loads = sy.filter((p) => (LIGHTS.has(p.c) || p.c === "L13") && p.t);
    const noSwitch = loads.filter((p) => !swT.has(p.t));
    const ldT = new Set(loads.map((p) => p.t));
    const idle = lsw.filter((p) => !ldT.has(p.t));
    const typo = [...INST.filter((it) => it.tr && counted(it)), ...UNK.flatMap((u) => u.items.filter((t) => t.tr))];
    if (typo.length) F.push({
      id: "typo", sev: "warn", title: "תגית בכתיב לא תקני", n: typo.length,
      text: `${typo.map((t) => `<b class="mono ltr">${esc(t.tr)}</b> נקראה כ־<b class="mono ltr">${esc(t.t)}</b>`).join(", ")}: נקודה במקום לוכסן. בלי התיקון המעגל היה נראה בלי מפסק. לתקן בשרטוט.`,
      els: typo.map((t) => t.el),
    });
    F.push({
      id: "nosw", sev: noSwitch.length ? "warn" : "ok", title: "נקודות מאור בלי מפסק באותה תגית", n: noSwitch.length,
      text: noSwitch.length ? `${noSwitch.length} נקודות ב־${new Set(noSwitch.map((p) => p.t)).size} מעגלים: ${tagList(noSwitch.map((p) => p.t))}. בחוץ ייתכן שעון או חיישן דמדומים; לברר עם המתכנן.` +
        (idle.length ? ` גם ${idle.length} מפסקים בלי נקודה: ${tagList(idle.map((p) => p.t))}.` : "") : "לכל נקודת מאור יש מפסק עם אותה תגית.",
      els: [...noSwitch, ...idle].map((p) => (p.it ? p.it.el : p.u.el)),
    });
    // outdoors: fixtures and sockets outside the rooms must be waterproof
    const outL = sy.filter((p) => p.rm < 0 && LIGHTS.has(p.c)), outS = sy.filter((p) => p.rm < 0 && SOCK.has(p.c) && p.c !== "L32a" && p.c !== "L32b");
    const dryL = outL.filter((p) => !WP.has(p.c)), dryS = outS.filter((p) => p.c !== "L33");
    F.push({
      id: "outdoor", sev: dryL.length || dryS.length ? "warn" : "ok", title: "חוץ: גופים ושקעים מוגני מים", n: `${outL.length - dryL.length}/${outL.length}`,
      text: `${outL.length} גופי תאורה ו־${outS.length} שקעים מחוץ לחדרים. ` +
        (dryL.length || dryS.length ? `<b>${dryL.length + dryS.length} לא מוגני מים</b>: ${[...dryL, ...dryS].map((p) => esc(LG[p.c].he)).join(", ")}. ייתכן שהם בקיר החיצוני מבפנים; לבדוק.` : "כולם מסוג מוגן מים."),
      els: [...outL, ...outS].map((p) => (p.it ? p.it.el : p.u.el)),
    });
    // legend rows with no symbol
    const have = tally(sy, (p) => p.c);
    const miss = (c) => !have[c];
    const smoke = miss("L34");
    F.push({
      id: "smoke", sev: smoke ? "bad" : "ok", title: "גלאי עשן", n: have.L34 || 0,
      text: smoke ? "שורת \"גלאי עשן עצמאי\" מופיעה במקרא, אבל אין אף גלאי בשרטוט. מקובל גלאי לפחות במסדרון החדרים ובסלון. להחזיר למתכנן; עד אז אין סעיף בכתב הכמויות." : "נמצאו גלאי עשן.",
      els: [],
    });
    const comm = ["L07", "L09", "L03", "L05"].filter(miss);
    if (comm.length) F.push({
      id: "comm", sev: "warn", title: "שורות מקרא שלא הופיעו בשרטוט", n: comm.length,
      text: `${comm.map((c) => `"${esc(LG[c].he)}"`).join(", ")}: אפס בשרטוט.` +
        (miss("L07") && miss("L09") && have.L08 ? " בכניסה יש פעמון בלבד, בלי אינטרקום ובלי פנל כניסה." : "") +
        (miss("L03") ? ` אין נקודת טלוויזיה; כנראה דרך הרשת (${have.L06 || 0} נקודות רשת, ${have.L43 || 0} צינורות קוברה ליד הטלוויזיה).` : ""),
      els: sy.filter((p) => ["L08", "L06", "L43"].includes(p.c) && p.it).map((p) => p.it.el),
    });
    const ac = sy.filter((p) => p.c === "L32a" || p.c === "L32b");
    const shab = NOTES.filter((n) => n.k === "shabbat");
    F.push({
      id: "ac", sev: ac.length < shab.length ? "warn" : "ok", title: `מיזוג: ${ac.length} פקטים מול ${shab.length} שעוני שבת`, n: ac.length,
      text: `${ac.length} נקודות פקט למזגן (${ac.map((p) => (p.c === "L32b" ? "תלת־פאזי" : "חד־פאזי")).join(", ")}), מעל חדר רחצה ומזווה, כמו במיני מרכזי. אבל ${shab.length} הערות "שעון שבת למזגן" בחדרים. לברר עם יועץ המיזוג: אזורים במערכת אחת, או חסרות נקודות מזגן.`,
      els: [...ac.map((p) => p.it.el), ...shab.map((n) => n.el)],
    });
    // kitchen: dedicated points
    const kit = ROOMS.findIndex((r) => r.k === "kitchen");
    const kp = sy.filter((p) => p.rm === kit && p.it);
    const ded = kp.filter((p) => p.c === "L31" || p.c === "L29");
    const hs = [...new Set(kp.filter((p) => p.c === "L30" && p.it.h).map((p) => p.it.h))].sort((a, b) => a - b);
    const n3 = ded.filter((p) => p.c === "L29").length, nk = ded.filter((p) => p.c === "L31").length;
    F.push({
      id: "kitchen", sev: nk < 2 ? "warn" : "ok", title: "מטבח: מעגלים ייעודיים", n: ded.length,
      text: `${kp.filter((p) => SOCK.has(p.c)).length} נקודות שקע במטבח. ${n3} תלת־פאזית (כיריים) ו־${nk} נקודת כוח בחיבור ישיר ללוח. ` +
        `שאר המכשירים (תנור, מדיח, מקרר, מיקרוגל) מסומנים כשקע רגיל עם גובה${hs.length ? " (" + hs.map((h) => "h=" + h).join(", ") + ")" : ""}. ` +
        `לברר אילו מהם במעגל נפרד ולסמן כנקודת כוח; כרגע הם מתומחרים כבית תקע רגיל.`,
      els: kp.filter((p) => SOCK.has(p.c)).map((p) => p.it.el),
    });
    // rooms: rule-of-thumb checklist
    const bad = [];
    ROOMS.forEach((r, k) => {
      const here = sy.filter((p) => p.rm === k);
      const cnt = tally(here, (p) => p.c);
      const n = (c) => cnt[c] || 0;
      if (r.k === "bed" && !n("L06") && !n("L04")) bad.push([k, "אין נקודת תקשורת"]);
      if (r.k === "bed" && outlets(here) < 4) bad.push([k, `${outlets(here)} בתי תקע בלבד`]);
      if (r.k === "bath" && !n("L12")) bad.push([k, "אין תנור חימום"]);
      if (r.k === "bath" && !n("L33")) bad.push([k, "אין שקע מוגן מים"]);
      if (r.k === "laundry" && !n("L31")) bad.push([k, "אין נקודת כוח למכונת כביסה"]);
      if ((r.k === "bed" || r.k === "living") && !here.some((p) => LIGHTS.has(p.c) || p.c === "L13")) bad.push([k, "אין נקודת מאור"]);
    });
    F.push({
      id: "rooms", sev: bad.length ? "warn" : "ok", title: "בדיקת סבירות לפי חדר", n: bad.length,
      text: (bad.length ? bad.map(([k, t]) => `${esc(ROOMS[k].n)}: ${t}`).join(". ") + ". " : "") +
        `לפי רשימת בדיקה של המשרד: בכל חדר שינה תקשורת ו־4 בתי תקע לפחות, בכל חדר רחצה תנור ושקע מוגן מים, נקודת כוח בכביסה.`,
      room: bad.map(([k]) => k), els: [],
    });
    return F;
  }

  /* ---------- paint ---------- */
  function litSet() {
    const lit = new Set();
    if (D.step === 3) {
      if (S.show?.kind === "rv") INST.forEach((it) => { if (it.c === S.show.c && pending(it)) lit.add(it.el); });
      else if (S.show?.kind === "u") UNK[S.show.i].items.forEach((t) => lit.add(t.el));
      else if (S.sel) {
        INST.forEach((it) => { if (it.c === S.sel && !S.rej.has(it.i)) lit.add(it.el); });
        UNK.forEach((u) => { if (u.as === S.sel) u.items.forEach((t) => lit.add(t.el)); });
      }
    } else if (D.step === 4 && S.qa) {
      if (S.qa.startsWith("n:")) S.qa.slice(2).split(",").forEach((i) => lit.add(NOTES[+i].el));
      else (checks().find((f) => f.id === S.qa)?.els || []).forEach((e) => lit.add(e));
    } else if (D.step === 5 && S.room != null) {
      symbols().forEach((p) => { if (p.rm === S.room) lit.add(p.it ? p.it.el : p.u.el); });
    }
    return lit;
  }
  function paint() {
    const st = D.step;
    for (const s of ["E", "L"]) {
      gSheet[s].g.style.display = (S.sheet === "all" || S.sheet === s) && S.lay["sym" + s] ? "" : "none";
      gSheet[s].anno.style.display = S.lay.anno ? "" : "none";
    }
    baseEl.walls.style.display = baseEl.wallsH.style.display = baseEl.wallfill.style.display = S.lay.walls ? "" : "none";
    ["doors", "glaz", "furn", "sani", "misc"].forEach((k) => (baseEl[k].style.display = S.lay[k] ? "" : "none"));
    const lit = litSet();
    svg.classList.toggle("focus", lit.size > 0);
    svg.classList.toggle("mark", st === 3);
    svg.classList.toggle("rooms-on", st === 5);
    svg.classList.toggle("notes-on", st === 4);
    INST.forEach((it) => {
      let c = "sym";
      if (it.rv) c += pending(it) ? " rv" : S.rej.has(it.i) ? " rej" : "";
      if (lit.has(it.el)) c += " lit";
      it.el.setAttribute("class", c);
    });
    UNK.forEach((u) => u.items.forEach((t) => {
      let c = "sym";
      if (!u.as) c += " unk";
      else if (u.as === "x") c += " ign";
      if (lit.has(t.el)) c += " lit";
      t.el.setAttribute("class", c);
    }));
    NOTES.forEach((n) => n.el.setAttribute("class", `nb s-${n.s}${S.notes.has(n.i) ? " on" : ""}${lit.has(n.el) ? " lit" : ""}`));
    if (st === 5) {
      const byRoom = tally(points(), (p) => p.rm);
      roomEls.forEach((e, k) => e.classList.toggle("on", S.room === k));
      roomLbl.forEach(({ t2 }, k) => (t2.textContent = (byRoom[k] || 0) + " נק׳"));
    }
    if (st === 5) D.legend([{ color: "rgba(62,207,142,.6)", label: "חדר" }, { color: "#ff5b2e", label: "חדר נבחר" }]);
    else if (st === 4) D.legend([{ color: "#ff5b2e", label: "ממצא נבחר" }, { color: "#c39bff", label: "הערת מתכנן" }]);
    else if (st === 3) D.legend([
      { color: SHEETS.E.color, label: "חשמל" }, { color: SHEETS.L.color, label: "תאורה" },
      { color: "#ffb547", label: "לבדיקה" }, { color: "#c39bff", label: "לא במקרא" },
    ]);
    else D.legend([{ color: SHEETS.E.color, label: "ELEC · חשמל" }, { color: SHEETS.L.color, label: "LIGHT · תאורה" }]);
    D.file(S.sheet === "L" ? SHEETS.L.file : S.sheet === "E" ? SHEETS.E.file : "E-01 + E-02 (aligned)");
    updateKpi();
  }
  function updateKpi() {
    D.kpi("rows", DATA.legend.length);
    D.kpi("found", fmt(points().length));
    D.kpi("review", fmt(nPending() + nUnk()));
    D.kpi("total", D.money(totals().gross));
  }

  /* ---------- side: helpers ---------- */
  const segSheet = (withAll) => `<div class="seg" role="group" aria-label="גיליון">${[["E", SHEETS.E.name], ["L", SHEETS.L.name], ...(withAll ? [["all", "שניהם"]] : [])]
    .map(([k, t]) => `<button type="button" data-sheet="${k}" class="${S.sheet === k ? "on" : ""}" aria-pressed="${S.sheet === k}">${t}</button>`).join("")}</div>`;
  const codesFound = () => {
    const m = {};
    const row = (c) => (m[c] = m[c] || { n: 0, p: 0, E: 0, L: 0, sw: 0 });
    INST.forEach((it) => {
      const r = row(it.c);
      if (it.role === "of") { if (counted(it)) r.sw++; return; }
      if (counted(it)) { r.n++; r[it.s]++; } else if (pending(it)) r.p++;
    });
    UNK.forEach((u) => {
      if (u.as && u.as !== "x") { const r = row(u.as); r.n += u.items.length; r[u.s] += u.items.length; }
    });
    return m;
  };
  const sortCodes = (codes) => codes.sort((a, b) => GORDER.indexOf(LG[a].g) - GORDER.indexOf(LG[b].g) || LG[a].k_ - LG[b].k_);
  const pendingNote = () => {
    const np = nPending() + nUnk();
    return np ? `<div class="note"><b>${np}</b> סמלים עדיין ממתינים לבדיקה ולא נספרו. <button class="btn sm" type="button" id="accAll" style="margin-top:6px">אשר את כל ההצעות</button></div>` : "";
  };
  const symInfo = (it) => {
    const parts = [it.c, LG[it.c].he];
    if (it.t) parts.push("תגית " + it.t);
    if (it.g) parts.push(`משורטט בסמל: ${LG[it.g].he}`);
    if (it.m > 1) parts.push(`x${it.m}`);
    if (it.h) parts.push(`h=${it.h}`);
    else if (SOCK.has(it.c)) parts.push("h=30 לפי הערת המקרא");
    else if (SWITCH.has(it.c) || SWITCH.has(it.g)) parts.push("h=110 לפי הערת המקרא");
    if (it.len) parts.push(`L=${it.len}`);
    if (it.role === "of") parts.push("המפסק של התנור");
    if (it.em) parts.push("חירום");
    return parts.join(" · ");
  };

  /* ---------- side palette per step ---------- */
  function renderSide() {
    const st = D.step;
    let h = "";
    if (st === 1) {
      const lc = DATA.layers;
      const sum = (...ks) => ks.reduce((a, k) => a + (lc[k] || 0), 0);
      const sl = (s) => Object.values(DATA.sheets[s].layers).reduce((a, n) => a + n, 0);
      const rows = [
        ["walls", "קירות", "A-WALL-*", sum("IN-WALL-CUT", "EX-WALL-CUT", "A-WALL-CUT", "A-WALL-PATT-CUT", "EX-WALL-PROJ", "IN-WALL-PROJ"), "#d3dbde"],
        ["doors", "דלתות", "A-DOOR", sum("A-DOOR", "A-DOOR-FRAM"), "#77838b"],
        ["glaz", "חלונות", "A-GLAZ", sum("A-GLAZ", "A-GLAZ-CUT", "A-GLAZ-SILL", "A-GLAZ-HDLN"), "#5f87a5"],
        ["furn", "ריהוט", "Furn Layout", sum("Furn Layout", "FURN", "furn", "ריהוט", "+FURN", "FURN-layout", "מיזוג אויר", "A-GENM"), "#3a444d"],
        ["sani", "כלים סניטריים", "P-SANR-FIXT", sum("sanitery", "P-SANR-FIXT"), "#4a5761"],
        ["misc", "קווי תקרה ופרגולה", "A-FLOR-PROJ", sum("A-FLOR-PROJ", "A-DETL"), "#2a333b"],
        ["symE", "סמלים · גיליון חשמל", "ELEC", sl("E"), SHEETS.E.color],
        ["symL", "סמלים · גיליון תאורה", "LIGHT", sl("L"), SHEETS.L.color],
        ["anno", "מידות, תגיות והערות של המתכנן", "ELEC / LIGHT", null, "#7a5560"],
      ];
      const dist = Math.hypot(DATA.align[0], DATA.align[1]) / 100;
      const nTags = INST.filter((it) => it.t).length + UNK.reduce((a, u) => a + u.items.filter((t) => t.t).length, 0);
      const nMul = INST.filter((it) => it.m > 1).length;
      const nBoxes = new Set(NOTES.map((n) => n.b.join())).size;
      h = `<div class="hd"><h2>קריאת השרטוט</h2><p>שני גיליונות של אותה קומה: חשמל ותקשורת, ותאורה. התוסף מפריד בין הרקע האדריכלי לשכבות הסמלים, מיישר את שני הגיליונות זה על זה וקורא את הטקסט שליד הסמלים.</p></div>
      <div class="bd">
        <div><div class="lbl" style="margin-bottom:6px">גיליון</div>${segSheet(true)}</div>
        <div><div class="lbl" style="margin-bottom:4px">שכבות (סמנו כדי להציג)</div>
        <div>${rows.map(([k, t, code, n, c]) => `<label class="lay"><input type="checkbox" data-lay="${k}" ${S.lay[k] ? "checked" : ""}><span class="sw" style="background:${c}"></span><span>${t} <code>${esc(code)}</code></span><span class="mono">${n == null ? "" : fmt(n)}</span></label>`).join("")}</div></div>
        <div class="stats c3"><div><b>1:50</b><span>קנה מידה</span></div><div><b>${nTags}</b><span>תגיות מעגל</span></div><div><b>${nBoxes}</b><span>הערות מתכנן</span></div></div>
        <div class="note">ליד כל סמל בגיליון התאורה כתובה תגית: <b class="mono ltr">4/1</b> (חדר 4, נקודה 1), <b class="mono ltr">A/6</b> לתאורת חוץ, <b class="mono ltr">B/8</b> לתריס. בגיליון החשמל כתובים מספר השקעים בקופסה (<b class="mono ltr">x2</b> ב־${nMul} קופסאות) וגובה ההתקנה (<b class="mono ltr">h=60</b>). התוסף קורא את הטקסט מקווי השרטוט, גם כשהוא לא טקסט של AutoCAD.</div>
        <div class="note">גיליון התאורה ממוקם אחרת בדף. התוסף מצא את ההזזה לפי התוכנית המשותפת (<b class="mono">${fmt(dist, 2)} מ׳</b>), כך שכל נקודה נספרת פעם אחת ובחדר הנכון. קנה המידה נגזר מ־14 קשתות דלת.</div>
      </div>${D.nav(null, 2, "לקריאת המקרא")}`;
    } else if (st === 2) {
      const m = codesFound();
      const withSyms = Object.keys(m).filter((c) => m[c].n + m[c].p > 0).length;
      const l = LG[S.rowSel];
      const f = m[l.c] || { n: 0, p: 0 };
      const b = BOQ[l.k];
      const sec = ROWBOQ[l.k] || b?.code || "";
      h = `<div class="hd"><h2>קריאת המקרא</h2><p>המקרא נקרא כטבלה: סמל ותיאור בכל שורה. הסמל נשמר כגאומטריה, וזה מה שהתוסף מחפש בשרטוט. כל שורה ממופה לסעיף בכתב הכמויות.</p></div>
      <div class="bd">
        <div class="stats c3"><div><b>${DATA.legend.length}</b><span>שורות</span></div><div><b>${DATA.groups.length}</b><span>קבוצות</span></div><div><b>${withSyms}</b><span>שורות בשרטוט</span></div></div>
        <div class="chips" role="group" aria-label="סינון לפי קבוצה"><button type="button" data-grp="all" class="${S.grp === "all" ? "on" : ""}">הכל</button>${DATA.groups.map(([k, t]) => `<button type="button" data-grp="${k}" class="${S.grp === k ? "on" : ""}">${t}</button>`).join("")}</div>
        <div class="rowcard">
          <div class="top"><div class="gbox">${glyph(l.gl, 60, rowColor(l.c))}</div><div><span class="mono">${l.c} · ${esc(GRP[l.g])}</span><b>${esc(l.he)}</b></div></div>
          <div class="kv"><div><span>סעיף</span><b class="mono">${esc(sec)}</b></div><div><span>יחידה</span><b>${esc(b && !ROWBOQ[l.k] ? b.unit : "–")}</b></div><div><span>בשרטוט</span><b class="mono">${f.n}${f.p ? ` <span class="pill warn">+${f.p}</span>` : ""}</b></div><div><span>קבוצה</span><b>${esc(GRP[l.g])}</b></div></div>
          <div class="act"><span style="font-size:12px;color:var(--muted);min-width:0">${esc(b && !ROWBOQ[l.k] ? b.desc : l.k === "light" ? "נקודת מאור; גוף נוסף על אותו מפסק בסעיף 08.01.020" : l.k === "sw" ? "כלול בנקודת המאור; מחליף וצלב כתוספת" : "כלול בנקודת התריס")}</span><button class="btn sm pri" type="button" id="toPlan" ${f.n + f.p ? "" : "disabled"}>הדלק בשרטוט ←</button></div>
        </div>
        <div class="note">לחצו על שורה בטבלה. בשורת המזגן שני סמלים (חד־פאזי ותלת־פאזי), והתוסף מפצל אותה לשתי שורות. שורת צינור הקוברה נקראה מהתא שלה בטבלה.</div>
      </div>${D.nav(1, 3, "לזיהוי וספירה")}`;
    } else if (st === 3) {
      const m = codesFound();
      const codes = sortCodes(Object.keys(m).filter((c) => m[c].n + m[c].p > 0));
      const total = symbols().filter((p) => p.role !== "of").length, np = nPending(), nu = nUnk();
      const sel = S.sel && LG[S.sel];
      const rvBy = {};
      INST.forEach((it) => { if (pending(it)) (rvBy[it.c] = rvBy[it.c] || { n: 0, why: it.rv }).n++; });
      const rvCodes = sortCodes(Object.keys(rvBy));
      const rvCards = rvCodes.length ? `<div class="flag warn"><div class="fh"><span class="pill warn">לבדיקה</span><b>דומים לשורת מקרא, לא זהים</b></div>
        <p>אותו סמל בגודל אחר, או באותה צורה עם פרט שונה. התוסף מסמן אותם ולא סופר עד שתאשרו.</p>
        ${rvCodes.map((c) => `<div class="fr"><span class="gb">${glyph(LG[c].gl, 24, rowColor(c))}</span><span class="tx"><b class="num">${rvBy[c].n}</b> × ${esc(LG[c].he)} <span class="mono">${c} · ${rvBy[c].why === 2 ? WHY[c] || "צורה דומה" : "גודל שונה מהמקרא"}</span></span>
          <span class="acts"><button class="btn sm" type="button" data-rv-show="${c}">הצג</button><button class="btn sm pri" type="button" data-rv-acc="${c}">אשר</button><button class="btn sm ghost" type="button" data-rv-rej="${c}">דחה</button></span></div>`).join("")}</div>` : "";
      const opts = (cur) => DATA.groups.map(([g, t]) => `<optgroup label="${esc(t)}">${DATA.legend.filter((l) => l.g === g).map((l) => `<option value="${l.c}" ${cur === l.c ? "selected" : ""}>${l.c} · ${esc(l.he)}</option>`).join("")}</optgroup>`).join("");
      const unkRow = (u) => {
        const gb = `<span class="gb">${glyph(u.glyph, 24, SHEETS[u.s].color)}</span>`;
        if (u.as === "x") return `<div class="fr">${gb}<span class="tx"><b class="num">${u.items.length}</b> הוחרגו מהספירה</span><span class="acts"><button class="btn sm ghost" type="button" data-u-undo="${u.i}">ביטול</button></span></div>`;
        if (u.as) return `<div class="fr">${gb}<span class="tx"><b class="num">${u.items.length}</b> שויכו ל״${esc(LG[u.as].he)}״ <span class="mono">${u.as}</span></span><span class="acts"><button class="btn sm" type="button" data-u-show="${u.i}">הצג</button><button class="btn sm ghost" type="button" data-u-undo="${u.i}">ביטול</button></span></div>`;
        return `<div class="fr">${gb}<span class="tx"><b class="num">${u.items.length}</b> סמלים זהים זה לזה · גיליון ${SHEETS[u.s].short}${u.sug ? `<span class="mono">הצעה: ${esc(LG[u.sug].he)}</span>` : ""}</span>
          <select data-u-pick="${u.i}" aria-label="שורת מקרא לשיוך"><option value="">בחרו שורת מקרא…</option>${opts(u.pick)}</select>
          <span class="acts"><button class="btn sm" type="button" data-u-show="${u.i}">הצג</button><button class="btn sm pri" type="button" data-u-as="${u.i}" ${u.pick ? "" : "disabled"}>שייך</button><button class="btn sm ghost" type="button" data-u-x="${u.i}">החרג</button></span></div>`;
      };
      const unkCards = UNK.length ? `<div class="flag ${nu ? "unk" : "done"}"><div class="fh"><span class="pill" style="background:rgba(195,155,255,.16);color:#c39bff">לא במקרא</span><b>סמלים חוזרים בלי שורה במקרא</b></div>
        <p>צורות שחוזרות בשרטוט ואינן במקרא, למשל מאוורר תקרה בשלוש כנפיים (במקרא: ארבע). שייכו לשורה כדי שייספרו, או החריגו.</p>${UNK.map(unkRow).join("")}</div>` : "";
      const f = sel ? m[S.sel] || { n: 0, p: 0, E: 0, L: 0, sw: 0 } : null;
      const selTags = sel ? [...INST.filter((it) => it.c === S.sel && counted(it) && it.role !== "of" && it.t).map((it) => it.t), ...UNK.filter((u) => u.as === S.sel).flatMap((u) => u.items.map((t) => t.t).filter(Boolean))] : [];
      h = `<div class="hd"><h2>זיהוי וספירה</h2><p>לחצו על שורה כדי להדליק את כל הסמלים שלה. לחיצה על סמל בשרטוט מציגה את התגית, את הסמל שבו שורטט ואת הגובה.</p></div>
      <div class="bd">
        <div class="stats c3"><div><b>${fmt(total)}</b><span>סמלים נספרו</span></div><div><b style="color:${np ? "var(--warn)" : "inherit"}">${np}</b><span>דומים, לבדיקה</span></div><div><b style="color:${nu ? "#c39bff" : "inherit"}">${nu}</b><span>לא במקרא</span></div></div>
        ${segSheet(true)}
        ${sel ? `<div class="selsum"><span class="gb">${glyph(sel.gl, 34, "#fff")}</span><span class="t">${esc(sel.he)}<span>${S.sel} · ${SHEETS.E.short} ${f.E} · ${SHEETS.L.short} ${f.L}${f.p ? ` · ${f.p} לבדיקה` : ""}${f.sw ? ` · +${f.sw} מפסקים` : ""}</span>${selTags.length ? `<span class="tags">תגיות: ${tagList(selTags, 10)}</span>` : ""}</span><b class="big">${f.n}</b></div>` : ""}
        <div><div class="lbl" style="margin-bottom:6px">שורות מקרא שנמצאו בשרטוט</div>
        <div class="list" id="rowList">${codes.map((c) => `<div class="li g ${S.sel === c ? "on" : ""}" data-c="${c}" role="button" tabindex="0"><span>${glyph(LG[c].gl, 20, rowColor(c))}</span><span class="meta">${esc(LG[c].he)}<span class="mono">${c}</span></span><span class="cnt">${m[c].n ? `<span class="pill">${m[c].n}</span>` : ""}${m[c].p ? `<span class="pill warn ltr" title="ממתינים לבדיקה">+${m[c].p}</span>` : ""}</span></div>`).join("")}</div></div>
        ${rvCards}${unkCards}
        <div class="note">${DATA.legend.length - codes.length} שורות במקרא לא מופיעות בשרטוט, למשל גלאי עשן ואינטרקום. הן נשארות בטבלה עם כמות 0, ובבקרת התכנון בשלב הבא.</div>
      </div>${D.nav(2, 4, "לבקרת התכנון")}`;
    } else if (st === 4) {
      const F = checks();
      const sevTxt = { ok: "תקין", warn: "לבדיקה", bad: "חסר", info: "מידע" };
      const card = (f) => `<div class="qa ${S.qa === f.id ? "on" : ""}" data-qa="${f.id}" role="button" tabindex="0"><div class="qh"><span class="pill ${f.sev}">${sevTxt[f.sev]}</span><b>${esc(f.title)}</b><span class="mono qn">${f.n}</span></div><p>${f.text}</p></div>`;
      const nApplied = NOTES.filter((n) => n.k && S.notes.has(n.i)).length;
      const nWith = NOTES.filter((n) => n.k).length;
      const grp = {};
      NOTES.forEach((n) => (grp[n.t] = grp[n.t] || []).push(n));
      const noteRows = Object.values(grp).map((ns) => {
        const n0 = ns[0];
        const b = n0.k ? BOQ[n0.k] : null;
        const q = n0.q === "switches" ? switchBoxes() : ns.reduce((a, n) => a + (n.q || 0), 0);
        const on = ns.every((n) => S.notes.has(n.i));
        const ids = ns.map((n) => n.i).join(",");
        return `<div class="nr ${S.qa === "n:" + ids ? "on" : ""}"><button class="nt" type="button" data-note="${ids}"><span class="mono">${ns.length > 1 ? ns.length + "×" : ""}</span>${esc(n0.t)}</button>
          ${b ? `<label class="na"><input type="checkbox" data-apply="${ns.map((n) => n.i).join(",")}" ${on ? "checked" : ""}><span>${esc(b.desc)} · <b class="mono">${q}</b> ${esc(b.unit)}</span></label>` : `<span class="na mute">מידע, בלי סעיף</span>`}</div>`;
      }).join("");
      h = `<div class="hd"><h2>בקרת תכנון</h2><p>התוסף מצליב את הסמלים עם התגיות, עם המקרא ועם ההערות של המתכנן. לחצו על ממצא כדי לראות אותו בשרטוט.</p></div>
      <div class="bd">
        ${pendingNote()}
        <div class="qal">${F.map(card).join("")}</div>
        <div class="card"><div class="ch"><b>הערות המתכנן בשרטוט</b><span class="mono">${nApplied}/${nWith}</span></div>
          <div class="notesl">${noteRows}</div>
          <div style="padding:8px 12px;border-top:1px solid var(--line)"><button class="btn sm ${nApplied === nWith ? "" : "pri"}" type="button" id="applyAll">${nApplied === nWith ? "הסר את ההערות מכתב הכמויות" : "הוסף את כל ההערות לכתב הכמויות"}</button></div></div>
      </div>${D.nav(3, 5, "לספירה לפי חדר")}`;
    } else if (st === 5) {
      const sy = symbols();
      const pts = sy.filter(isPoint);
      const byRoom = tally(pts, (p) => p.rm);
      const inRooms = pts.filter((p) => p.rm >= 0).length;
      let card = "";
      if (S.room != null) {
        const R = S.room >= 0 ? ROOMS[S.room] : OUT;
        const here = sy.filter((p) => p.rm === S.room);
        const hp = here.filter(isPoint), hs = here.filter((p) => !isPoint(p));
        const byC = tally(hp, (p) => p.c), bySw = tally(hs, (p) => (p.role === "of" ? "of" : p.c));
        const cs = sortCodes(Object.keys(byC));
        const swTxt = Object.entries(bySw).map(([c, n]) => `${n} ${c === "of" ? (n === 1 ? "מפסק תנור" : "מפסקי תנור") : LG[c].he}`).join(" · ");
        const out = outlets(hp);
        card = `<div class="card"><div class="ch"><b>${esc(R.n)}</b><span class="mono">${R.a ? fmt(R.a, 1) + " מ״ר · " : ""}${hp.length} נק׳</span></div>
          <div style="padding:6px 12px"><div class="items">${cs.length ? cs.map((c) => `<div>${glyph(LG[c].gl, 20, rowColor(c))}<span>${esc(LG[c].he)}</span><b>${byC[c]}</b></div>`).join("") : '<div><span></span><span style="color:var(--muted)">אין נקודות בחדר הזה</span><b></b></div>'}</div>
          ${hs.length || out ? `<div class="rsub">${out ? `${out} בתי תקע` : ""}${out && hs.length ? " · " : ""}${hs.length ? `מפסקים: ${swTxt}` : ""}</div>` : ""}</div></div>`;
      }
      const list = ROOMS.map((r, k) => [k, r]).concat([[-1, OUT]]);
      h = `<div class="hd"><h2>ספירה לפי חדר</h2><p>החדרים נסגרים מהקירות, החלונות ומשקופי הדלתות. כל נקודה משויכת לחדר שבו היא נמצאת. מפסקים לא נספרים כנקודה; הם חלק מנקודת המאור או התריס.</p></div>
      <div class="bd">
        <div class="stats c3"><div><b>${ROOMS.length}</b><span>חדרים</span></div><div><b>${inRooms}</b><span>נק׳ בחדרים</span></div><div><b>${pts.length - inRooms}</b><span>חוץ</span></div></div>
        ${pendingNote()}
        <button class="btn ${S.roomTable ? "on" : ""}" type="button" id="roomTable">${S.roomTable ? "חזרה לשרטוט" : "טבלת ספירה לפי חדר"}</button>
        ${card}
        <div class="list" id="roomList">${list.map(([k, r]) => `<div class="li ${S.room === k ? "on" : ""}" data-room="${k}" role="button" tabindex="0"><span class="sw" style="background:${k < 0 ? "#59646b" : "rgba(62,207,142,.6)"}"></span><span class="meta" style="color:var(--text)">${esc(r.n)}${r.a ? ` <span style="color:var(--faint)" class="mono">${fmt(r.a, 1)} מ״ר</span>` : ""}</span><span class="pill">${byRoom[k] || 0}</span></div>`).join("")}</div>
      </div>${D.nav(4, 6, "לכתב הכמויות")}`;
    } else if (st === 6) {
      const lines = boqLines(), T = totals();
      const nNotes = NOTES.filter((n) => n.k).length, nApplied = NOTES.filter((n) => n.k && S.notes.has(n.i)).length;
      h = `<div class="hd"><h2>כתב כמויות מתומחר</h2><p>הכמויות מחושבות מהספירה ומהתגיות: נקודת מאור לכל מעגל הדלקה, גוף נוסף על אותו מפסק, תוספת למחליף ולצלב, בית תקע נוסף בקופסה כפולה. המחירים לדוגמה; אפשר לשנות אותם בטבלה.</p></div>
      <div class="bd">
        <div class="stats c3"><div><b>${lines.length}</b><span>סעיפים</span></div><div><b>${fmt(points().length)}</b><span>נקודות</span></div><div><b>${DATA.vat}%</b><span>מע״מ</span></div></div>
        <div class="sum3"><div><span>סה״כ לפני מע״מ</span><b id="s-net">${D.money(T.net)}</b></div><div><span>מע״מ ${DATA.vat}%</span><b id="s-vat">${D.money(T.vat)}</b></div><div><span>סה״כ כולל מע״מ</span><b id="s-gross">${D.money(T.gross)}</b></div></div>
        ${pendingNote()}
        ${nApplied < nNotes ? `<div class="note"><b>${nNotes - nApplied}</b> הערות מתכנן עם השלכה על הכמויות עוד לא נוספו (שעוני שבת, הכנה לרכב חשמלי, PV ועוד). <button class="btn sm" type="button" id="applyAll" style="margin-top:6px">הוסף את ההערות</button></div>` : ""}
        <div class="row"><button class="btn pri" type="button" id="copyXls">העתק לאקסל</button><button class="btn" type="button" id="resetPrices">מחירי ברירת מחדל</button></div>
        <div class="note">לא כלול: גופי התאורה עצמם, הזנה מחברת החשמל, הארקת יסוד ומערכת האזעקה (לפי יועץ). גלאי העשן חסרים בתכנון, ראו בקרת תכנון.</div>
        ${D.cta()}
      </div>${D.nav(5, null)}`;
    }
    D.side(h);
    bindSide();
  }

  /* ---------- tables ---------- */
  function legendTable() {
    const m = codesFound();
    let h = `<table><thead><tr><th>סמל</th><th>תיאור במקרא</th><th>קוד</th><th>סעיף בכתב הכמויות</th><th>יח׳</th><th class="num">בשרטוט</th></tr></thead><tbody>`;
    DATA.groups.forEach(([g, t]) => {
      if (S.grp !== "all" && S.grp !== g) return;
      const rows = DATA.legend.filter((l) => l.g === g);
      h += `<tr class="grp"><td colspan="6">${esc(t)} · ${rows.length} שורות</td></tr>`;
      rows.forEach((l) => {
        const f = m[l.c] || { n: 0, p: 0 };
        const b = BOQ[l.k];
        const sec = ROWBOQ[l.k] || b?.code || "";
        h += `<tr class="pick ${S.rowSel === l.c ? "on" : ""}" data-c="${l.c}" tabindex="0"><td class="g"><span class="gcell">${glyph(l.gl, 24, rowColor(l.c))}</span></td><td class="desc">${esc(l.he)}</td><td class="mono">${l.c}</td><td class="mono">${esc(sec)}</td><td>${esc(b && !ROWBOQ[l.k] ? b.unit : "")}</td><td class="num ${f.n + f.p ? "" : "zero"}">${f.p ? `<span class="pill warn" title="ממתינים לבדיקה">+${f.p}</span> ` : ""}${f.n}</td></tr>`;
      });
    });
    return h + "</tbody></table>";
  }
  function roomTable() {
    const pts = points();
    const cols = DATA.groups.filter(([g]) => g !== "switch").concat([["switch", "תריסים"]]);
    const rows = ROOMS.map((r, k) => [k, r.n]).concat([[-1, OUT.n]]);
    const cell = {};
    pts.forEach((p) => { const key = p.rm + "|" + LG[p.c].g; cell[key] = (cell[key] || 0) + 1; });
    const tot = {};
    let h = `<table><caption>נקודות לפי חדר וקבוצה. מפסקים לא נספרים כנקודה; מנוע תריס נספר כנקודת תריס.</caption><thead><tr><th>חדר</th>${cols.map(([, t]) => `<th class="num">${esc(t)}</th>`).join("")}<th class="num">סה״כ</th></tr></thead><tbody>`;
    rows.forEach(([k, n]) => {
      let s = 0;
      h += `<tr class="pick ${S.room === k ? "on" : ""}" data-room="${k}" tabindex="0"><td>${esc(n)}</td>${cols.map(([g]) => { const v = cell[k + "|" + g] || 0; s += v; tot[g] = (tot[g] || 0) + v; return `<td class="num ${v ? "" : "zero"}">${v || "–"}</td>`; }).join("")}<td class="num"><b>${s}</b></td></tr>`;
    });
    h += `<tr class="tot"><td>סה״כ</td>${cols.map(([g]) => `<td class="num">${tot[g] || 0}</td>`).join("")}<td class="num">${pts.length}</td></tr></tbody></table>`;
    return h;
  }
  function boqTable() {
    const lines = boqLines(), T = totals();
    let h = `<table><thead><tr><th>סעיף</th><th>תיאור</th><th>יח׳</th><th class="num">כמות</th><th class="num">מחיר יח׳ ₪</th><th class="num">סה״כ ₪</th></tr></thead><tbody>`;
    h += `<tr class="grp"><td colspan="6">פרק 08 · מתקני חשמל</td></tr>`;
    CH.forEach(([ch, chName]) => {
      const ls = lines.filter((l) => l.code.startsWith(ch + "."));
      if (!ls.length) return;
      h += `<tr class="sgrp"><td colspan="6">${ch} · ${chName}</td></tr>`;
      ls.forEach((l) => {
        const src = l.note ? "מהערת המתכנן" : l.codes.join(" · ");
        h += `<tr><td class="mono">${l.code}</td><td class="desc">${esc(l.desc)} <span class="src">${esc(src)}</span>${l.hint ? `<span class="hint">${esc(l.hint)}</span>` : ""}</td><td>${esc(l.unit)}</td><td class="num">${l.n}</td><td class="num"><input type="number" min="0" step="5" inputmode="numeric" value="${l.price}" data-k="${l.k}" aria-label="מחיר ליחידה"></td><td class="num" id="bl-${l.k}">${fmt(l.total)}</td></tr>`;
      });
      h += `<tr class="sub"><td colspan="5">סה״כ ${ch}</td><td class="num" id="ch-${ch}">${fmt(ls.reduce((a, l) => a + l.total, 0))}</td></tr>`;
    });
    h += `<tr class="tot"><td colspan="5">סה״כ לפני מע״מ</td><td class="num" id="t-net">${fmt(T.net)}</td></tr>
      <tr><td colspan="5">מע״מ ${DATA.vat}%</td><td class="num" id="t-vat">${fmt(T.vat)}</td></tr>
      <tr class="tot"><td colspan="5">סה״כ כולל מע״מ</td><td class="num" id="t-gross">${fmt(T.gross)}</td></tr></tbody></table>`;
    return h;
  }
  const tsv = () => {
    const q = (s) => String(s).replace(/״/g, '"').replace(/׳/g, "'");
    const out = [["סעיף", "תיאור", "יחידה", "כמות", "מחיר ליחידה", "סה\"כ"].join("\t")];
    boqLines().forEach((l) => out.push([l.code, q(l.desc), q(l.unit), l.n, l.price, l.total].join("\t")));
    const T = totals();
    out.push(["", "סה\"כ לפני מע\"מ", "", "", "", Math.round(T.net)].join("\t"));
    out.push(["", `מע"מ ${DATA.vat}%`, "", "", "", Math.round(T.vat)].join("\t"));
    out.push(["", "סה\"כ כולל מע\"מ", "", "", "", Math.round(T.gross)].join("\t"));
    return out.join("\n");
  };
  function showTable() {
    const st = D.step;
    if (st === 2) D.table(legendTable());
    else if (st === 5 && S.roomTable) D.table(roomTable());
    else if (st === 6) D.table(boqTable());
    else { D.table(null); onView(); }
    bindTable();
  }

  /* ---------- interactions ---------- */
  const bbox = (els) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    els.forEach(({ x, y }) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    return [x0, y0, Math.max(x1 - x0, 200), Math.max(y1 - y0, 200)];
  };
  const elBox = (els) => bbox(els.map((e) => { const b = e.getBBox(); return [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height }]; }).flat());
  function selectCode(c, from) {
    S.sel = S.sel === c && from === "list" ? null : c;
    S.show = null;
    if (S.sel) {
      const f = codesFound()[c] || { n: 0 };
      D.cmd(`PA_COUNT "${c}" → ${f.n}`);
      D.hint(`${LG[c].he}: ${f.n} בשרטוט`);
      if (S.sheet !== "all") {
        const has = INST.some((it) => it.c === c && it.s !== S.sheet) || UNK.some((u) => u.as === c && u.s !== S.sheet);
        if (has) S.sheet = "all";
      }
      D.track("demo_action", { action: "legend_row", code: c });
    }
    paint(); renderSide();
    D.sideEl.querySelector(`.li[data-c="${c}"]`)?.scrollIntoView({ block: "nearest" });
  }
  function selectQa(id) {
    S.qa = S.qa === id ? null : id;
    if (S.qa) {
      S.sheet = "all";
      paint();
      const els = [...svg.querySelectorAll(".sym.lit, .nb.lit")];
      if (els.length) D.zoomTo(...elBox(els), 0.15);
      else if (S.qa === "rooms") D.fit();
      D.cmd(S.qa.startsWith("n:") ? `PA_NOTES SHOW ${S.qa.slice(2).split(",").length}` : `PA_CHECK ${S.qa.toUpperCase()}`);
      D.track("demo_action", { action: "check", id: S.qa });
    } else paint();
    renderSide();
    D.sideEl.querySelector(`[data-qa="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }
  function selectRoom(k, zoom) {
    S.room = S.room === k && !zoom ? null : k;
    if (S.room != null && S.room >= 0) {
      const r = ROOMS[S.room];
      if (zoom) {
        const xs = r.p.filter((_, j) => j % 2 === 0), ys = r.p.filter((_, j) => j % 2 === 1);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        D.zoomTo(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0, 0.35);
      }
      D.cmd(`PA_ROOMS "${r.n}"`);
      D.track("demo_action", { action: "room" });
    } else if (S.room === -1 && zoom) D.fit();
    paint(); renderSide();
    if (S.roomTable) showTable();
  }
  function acceptAll() {
    INST.forEach((it) => { if (pending(it)) S.acc.add(it.i); });
    UNK.forEach((u) => { if (!u.as && u.pick) u.as = u.pick; else if (!u.as) u.as = "x"; });
    D.toast("כל ההצעות אושרו. הכמויות חושבו מחדש.");
    D.track("demo_action", { action: "accept_all" });
    paint(); renderSide(); showTable();
  }
  function applyAll() {
    const all = NOTES.filter((n) => n.k);
    const on = all.every((n) => S.notes.has(n.i));
    all.forEach((n) => (on ? S.notes.delete(n.i) : S.notes.add(n.i)));
    D.toast(on ? "ההערות הוסרו מכתב הכמויות" : `${new Set(all.map((n) => n.k)).size} סעיפים מההערות נוספו לכתב הכמויות`);
    D.cmd(on ? "PA_NOTES REMOVE ALL" : "PA_NOTES APPLY ALL");
    D.track("demo_action", { action: on ? "notes_remove" : "notes_apply" });
    paint(); renderSide(); showTable();
  }

  function bindSide() {
    const side = D.sideEl;
    side.querySelectorAll("[data-sheet]").forEach((b) => (b.onclick = () => {
      S.sheet = b.dataset.sheet;
      D.cmd(S.sheet === "all" ? "PA_XREF ALIGN E-02 → E-01" : `OPEN ${SHEETS[S.sheet].file}`);
      paint(); renderSide();
    }));
    side.querySelectorAll("[data-lay]").forEach((c) => (c.onchange = () => {
      S.lay[c.dataset.lay] = c.checked;
      D.cmd(`LAYER ${c.checked ? "ON" : "OFF"} ${c.closest(".lay").querySelector("code").textContent}`);
      paint();
    }));
    side.querySelectorAll("[data-grp]").forEach((b) => (b.onclick = () => { S.grp = b.dataset.grp; renderSide(); showTable(); }));
    const tp = side.querySelector("#toPlan");
    if (tp) tp.onclick = () => { S.sel = S.rowSel; S.sheet = "all"; D.go(3); };
    side.querySelectorAll(".li[data-c]").forEach((li) => {
      li.onclick = () => selectCode(li.dataset.c, "list");
      li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); li.click(); } };
    });
    side.querySelectorAll("[data-rv-show]").forEach((b) => (b.onclick = () => {
      const c = b.dataset.rvShow;
      S.show = { kind: "rv", c }; S.sel = null;
      if (S.sheet !== "all") S.sheet = "all";
      const its = INST.filter((it) => it.c === c && pending(it));
      D.zoomTo(...bbox(its), 0.12);
      D.cmd(`PA_REVIEW "${c}" ${its.length}`);
      paint(); renderSide();
    }));
    side.querySelectorAll("[data-rv-acc]").forEach((b) => (b.onclick = () => {
      const c = b.dataset.rvAcc;
      let n = 0;
      INST.forEach((it) => { if (it.c === c && pending(it)) { S.acc.add(it.i); n++; } });
      S.show = null; S.sel = c;
      D.cmd(`PA_REVIEW "${c}" ACCEPT ${n}`);
      D.toast(`${n} סמלים נוספו ל״${LG[c].he}״`);
      D.track("demo_action", { action: "review_accept", code: c });
      paint(); renderSide();
    }));
    side.querySelectorAll("[data-rv-rej]").forEach((b) => (b.onclick = () => {
      const c = b.dataset.rvRej;
      INST.forEach((it) => { if (it.c === c && pending(it)) S.rej.add(it.i); });
      S.show = null;
      D.cmd(`PA_REVIEW "${c}" REJECT`);
      D.toast("הסמלים סומנו כלא שייכים ולא ייספרו");
      paint(); renderSide();
    }));
    side.querySelectorAll("[data-u-pick]").forEach((s) => (s.onchange = () => {
      UNK[+s.dataset.uPick].pick = s.value;
      const b = side.querySelector(`[data-u-as="${s.dataset.uPick}"]`);
      if (b) b.disabled = !s.value;
    }));
    side.querySelectorAll("[data-u-show]").forEach((b) => (b.onclick = () => {
      const u = UNK[+b.dataset.uShow];
      S.show = { kind: "u", i: u.i }; S.sel = null;
      if (S.sheet !== "all" && S.sheet !== u.s) S.sheet = u.s;
      D.zoomTo(...bbox(u.items), 0.15);
      D.cmd(`PA_DISCOVER GROUP ${u.i + 1} → ${u.items.length}`);
      paint(); renderSide();
    }));
    side.querySelectorAll("[data-u-as]").forEach((b) => (b.onclick = () => {
      const u = UNK[+b.dataset.uAs];
      if (!u.pick) return;
      u.as = u.pick; S.show = null; S.sel = u.as;
      D.cmd(`PA_LEGEND ASSIGN GROUP ${u.i + 1} → "${u.as}"`);
      D.toast(`${u.items.length} סמלים שויכו ל״${LG[u.as].he}״ ונכנסו לספירה`);
      D.track("demo_action", { action: "assign_unknown", code: u.as });
      paint(); renderSide();
    }));
    side.querySelectorAll("[data-u-x]").forEach((b) => (b.onclick = () => {
      UNK[+b.dataset.uX].as = "x"; S.show = null;
      D.cmd("PA_DISCOVER IGNORE");
      paint(); renderSide();
    }));
    side.querySelectorAll("[data-u-undo]").forEach((b) => (b.onclick = () => {
      const u = UNK[+b.dataset.uUndo];
      if (S.sel === u.as) S.sel = null;
      u.as = null; paint(); renderSide();
    }));
    side.querySelectorAll("[data-qa]").forEach((c) => {
      c.onclick = () => selectQa(c.dataset.qa);
      c.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); } };
    });
    side.querySelectorAll("[data-note]").forEach((b) => (b.onclick = () => selectQa("n:" + b.dataset.note)));
    side.querySelectorAll("[data-apply]").forEach((c) => (c.onchange = () => {
      const ids = c.dataset.apply.split(",").map(Number);
      ids.forEach((i) => (c.checked ? S.notes.add(i) : S.notes.delete(i)));
      const n = NOTES[ids[0]];
      D.cmd(`PA_NOTES ${c.checked ? "APPLY" : "REMOVE"} "${BOQ[n.k].code}"`);
      D.toast(c.checked ? `נוסף לכתב הכמויות: ${BOQ[n.k].desc}` : "הוסר מכתב הכמויות");
      paint(); renderSide();
    }));
    side.querySelectorAll(".li[data-room]").forEach((li) => {
      li.onclick = () => selectRoom(+li.dataset.room, true);
      li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); li.click(); } };
    });
    const rt = side.querySelector("#roomTable");
    if (rt) rt.onclick = () => { S.roomTable = !S.roomTable; D.cmd(S.roomTable ? "PA_ROOMS TABLE" : "PA_ROOMS"); renderSide(); showTable(); };
    const aa = side.querySelector("#accAll");
    if (aa) aa.onclick = acceptAll;
    const ap = side.querySelector("#applyAll");
    if (ap) ap.onclick = applyAll;
    const cx = side.querySelector("#copyXls");
    if (cx) cx.onclick = () => { D.copy(tsv(), "כתב הכמויות הועתק. הדביקו בגיליון אקסל"); D.cmd("PA_BOQ EXPORT CLIPBOARD"); D.track("demo_export"); };
    const rp = side.querySelector("#resetPrices");
    if (rp) rp.onclick = () => { S.prices = {}; showTable(); renderSide(); updateKpi(); D.toast("המחירים חזרו לברירת המחדל"); };
  }
  function bindTable() {
    const t = D.tableEl;
    t.querySelectorAll("tr.pick[data-c]").forEach((tr) => (tr.onclick = () => {
      S.rowSel = tr.dataset.c;
      t.querySelectorAll("tr.pick.on").forEach((x) => x.classList.remove("on"));
      tr.classList.add("on");
      D.cmd(`PA_LEGEND ROW ${tr.dataset.c}`);
      renderSide();
    }));
    t.querySelectorAll("tr.pick[data-room]").forEach((tr) => (tr.onclick = () => selectRoom(+tr.dataset.room, false)));
    t.querySelectorAll("tr.pick").forEach((tr) => (tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tr.click(); } }));
    t.querySelectorAll("input[data-k]").forEach((inp) => (inp.oninput = () => {
      const v = Math.max(0, Number(inp.value) || 0);
      S.prices[inp.dataset.k] = v;
      const lines = boqLines(), T = totals();
      lines.forEach((l) => { const c = document.getElementById("bl-" + l.k); if (c) c.textContent = fmt(l.total); });
      CH.forEach(([ch]) => { const c = document.getElementById("ch-" + ch); if (c) c.textContent = fmt(lines.filter((l) => l.code.startsWith(ch + ".")).reduce((a, l) => a + l.total, 0)); });
      document.getElementById("t-net").textContent = fmt(T.net);
      document.getElementById("t-vat").textContent = fmt(T.vat);
      document.getElementById("t-gross").textContent = fmt(T.gross);
      [["s-net", T.net], ["s-vat", T.vat], ["s-gross", T.gross]].forEach(([id, v2]) => { const e = document.getElementById(id); if (e) e.textContent = D.money(v2); });
      updateKpi();
    }));
  }

  /* canvas: hover + click (elementsFromPoint, since a pan captures the pointer on the svg) */
  const pick = (e) => {
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    const sym = els.find((x) => x.classList?.contains("hit"))?.closest(".sym");
    const room = els.find((x) => x.classList?.contains("room"));
    const note = els.find((x) => x.classList?.contains("nb"));
    return { sym, room, note };
  };
  svg.addEventListener("pointermove", (e) => {
    if (e.buttons) return;
    const { sym } = pick(e);
    if (sym?.dataset.i != null) {
      const it = INST[+sym.dataset.i];
      D.barMid(`Layer: <b>${SHEETS[it.s].layer}</b> · ${it.c}${it.t ? " · " + esc(it.t) : ""}`);
    } else if (sym?.dataset.u != null) D.barMid(`Layer: <b>LIGHT</b> · ?`);
    else D.barMid(`Layer: <b>${S.sheet === "L" ? "LIGHT" : S.sheet === "E" ? "ELEC" : "ELEC + LIGHT"}</b>`);
  });
  svg.addEventListener("click", (e) => {
    const { sym, room, note } = pick(e);
    const st = D.step;
    if (note && st === 4) {
      const n = NOTES[+note.dataset.n];
      selectQa("n:" + NOTES.filter((m) => m.t === n.t).map((m) => m.i).join(","));
      D.toast(n.t);
      return;
    }
    if (sym?.dataset.u != null) {
      const u = UNK[+sym.dataset.u];
      const t = u.items[+sym.dataset.j];
      if (st === 3) {
        if (u.as && u.as !== "x") selectCode(u.as);
        else { S.show = { kind: "u", i: u.i }; S.sel = null; paint(); renderSide(); D.sideEl.querySelector(`[data-u-show="${u.i}"]`)?.scrollIntoView({ block: "nearest" }); }
      } else D.toast((u.as && u.as !== "x" ? `${LG[u.as].he} · שויך ידנית` : "סמל חוזר שלא מופיע במקרא. שיוך בשלב 3") + (t.t ? ` · תגית ${t.t}` : ""));
      return;
    }
    if (sym?.dataset.i != null) {
      const it = INST[+sym.dataset.i];
      if (st === 3) { if (it.role !== "of") selectCode(it.c); D.toast(symInfo(it), 4200); return; }
      if (st === 5) { selectRoom(it.rm, false); D.toast(`${symInfo(it)} · ${it.rm >= 0 ? ROOMS[it.rm].n : OUT.n}`); return; }
      D.toast(`${symInfo(it)} · גיליון ${SHEETS[it.s].name}`, 4200);
      return;
    }
    if (room && st === 5) { selectRoom(+room.dataset.room, false); return; }
    if (st === 3 && (S.sel || S.show)) { S.sel = null; S.show = null; paint(); renderSide(); }
    if (st === 4 && S.qa) { S.qa = null; paint(); renderSide(); }
  });

  function runScan() {
    scan.classList.remove("run"); void scan.getBBox(); scan.classList.add("run");
    const all = [...INST.map((it) => it.el), ...UNK.flatMap((u) => u.items.map((t) => t.el))];
    all.forEach((g) => g.style.setProperty("opacity", "0"));
    void svg.getBoundingClientRect();
    setTimeout(() => {
      INST.forEach((it) => { it.el.style.transitionDelay = (it.x / W) * 1.2 + "s"; it.el.style.removeProperty("opacity"); });
      UNK.forEach((u) => u.items.forEach((t) => { t.el.style.transitionDelay = (t.x / W) * 1.2 + "s"; t.el.style.removeProperty("opacity"); }));
    }, 40);
    setTimeout(() => all.forEach((g) => (g.style.transitionDelay = "")), 1700);
    const codes = Object.keys(codesFound()).length;
    D.toast(`נמצאו ${INST.filter((it) => !it.rv).length} סמלים זהים למקרא ב־${codes} שורות. ${nPending() + nUnk()} סמלים מסומנים לבדיקה.`, 5200);
  }

  /* ---------- steps ---------- */
  function onStep(n) {
    if (n !== 3) { S.show = null; }
    if (n === 3 && !S.sel) S.sheet = "all";
    if (n === 4) S.sheet = "all";
    if (n !== 5) S.room = null;
    if (n !== 4) S.qa = null;
    if (n === 1 && S.sheet === "all") S.sheet = "E";
    paint(); renderSide(); showTable();
    if (n === 1 || n === 4) D.fit();
    onView();
    if (n === 3 && !S.scanned) { S.scanned = true; runScan(); }
    if (n === 3 && S.sel) D.hint(`${LG[S.sel].he}: ${(codesFound()[S.sel] || { n: 0 }).n} בשרטוט`);
    if (n === 4) D.hint("לחצו על ממצא כדי לראות אותו בשרטוט");
    if (n === 5 && !S.roomTable) D.hint("לחצו על חדר כדי לראות מה נספר בו");
    if (n === 6) D.cmd(`PA_BOQ EXPORT · ${boqLines().length} ITEMS`);
  }

  D.ready();
})();
