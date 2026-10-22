/* Tenant-changes control demo (/catalog/tenant-changes/).
   Standard sales plan of one apartment (real drawing, anonymized) vs the tenant's change plan:
   align, detect changes by layer with three agents, cross-check against the structural / MEP reference (xref),
   approve / reject / send to a consultant, price with derived lines and credits, offer to the tenant. */
(() => {
  const COL = { pend: "#ff5b2e", ok: "#3ecf8e", no: "#ff5d6c", elec: "#b07cff", water: "#5b9dff", esc: "#ffb547", noise: "#6f7680", add: "#5b9dff", str: "#e6d84a" };
  const PCOL = { pend: "#e8572a", ok: "#1f9e65", no: "#d43b4b", elec: "#7b4ce0", water: "#2f6fd6", esc: "#c98a1a" };
  const CATS = [
    { id: "wall", name: "קירות ומחיצות" },
    { id: "door", name: "דלתות ופתחים" },
    { id: "elec", name: "חשמל ותקשורת" },
    { id: "plumb", name: "אינסטלציה" },
  ];
  const KIND = { removed: "הוסר", moved: "הוזז", added: "נוסף", changed: "שונה" };
  const ST_NAME = { pend: "ממתין", ok: "אושר", no: "נדחה", esc: "אצל היועץ" };
  const AGENT = { geo: "גאומטריה", price: "תמחור", qa: "בקרת איכות" };
  const PT_NAME = { s: ["שקע", "שקעים"], l: ["נק׳ מאור", "נק׳ מאור"], w: ["מפסק", "מפסקים"], t: ["נק׳ תקשורת", "נק׳ תקשורת"], p: ["נק׳ מים", "נק׳ מים"], f: ["נק׳ כוח", "נק׳ כוח"], b: ["לוח חשמל", "לוחות"] };
  const XREF_FILE = "SALES_PLAN_APT.dwg + XREF STR_TYP.dwg";
  const VAT = 0.18;

  let DATA = null, W = 1288, H = 979, CH = [], NOISE = [], ALL = [], PKG = null;
  const BY = {}, PR = {};
  const S = {
    aligned: false, aligning: false, mode: "swipe", splitX: 644,
    detected: false, detecting: false, revealed: new Set(), gone: new Set(),
    dec: {}, sel: null, room: null, blocked: null,
    layers: { wall: true, conc: true, furn: true, elec: true, plumb: true, str: false },
    up: {}, log: [], t0: 0, swiped: false, strSeen: false,
  };
  const E = { ch: { a: {}, b: {} }, mk: {}, al: {}, sug: {}, rooms: {} };

  const D = Demo({
    slug: "tenant-changes",
    plugin: "PA_TENANT",
    tag: "AI · בקרת שינויי דיירים",
    title: "בקרת שינויי דיירים: מתוכנית הדייר להצעת מחיר",
    sub: "דירת 5 חדרים בקומה טיפוסית. הדייר הגיש תוכנית שינויים: המערכת משווה אותה לתוכנית המכר, מצליבה כל שינוי עם תוכניות הקונסטרוקציה, האינסטלציה והחשמל, ומתמחרת את מה שאושר.",
    file: "SALES_PLAN_APT.dwg",
    viewBox: [-40, -40, 1368, 1060],
    flipY: H,
    kpis: [{ id: "n", label: "שינויים" }, { id: "ok", label: "אושרו" }, { id: "no", label: "נדחו" }, { id: "sum", label: "לתשלום" }],
    steps: [
      { t: "תוכנית המכר", d: "שכבות ותוכניות ייחוס", cmd: "OPEN SALES_PLAN_APT.dwg" },
      { t: "תוכנית הדייר", d: "יישור והשוואה", cmd: "PA_TENANT LOAD TENANT_PLAN.pdf" },
      { t: "זיהוי שינויים", d: "שלושה סוכני AI", cmd: "PA_DIFF LAYERS=ALL AGENTS=GEO,PRICE,QA" },
      { t: "בדיקה הנדסית", d: "הצלבה והחלטה", cmd: "PA_CHECK XREF=STR,PLB,ELEC" },
      { t: "תמחור", d: "סעיפים, נלווים וזיכויים", cmd: "PA_PRICE LIST=SAMPLE" },
      { t: "הצעה לדייר", d: "לחתימה ותשלום", cmd: "PA_REPORT TENANT" },
    ],
    onStep,
  });
  const svg = D.svg, el = D.el, esc = D.esc, fmt = D.fmt, money = D.money;

  /* ---------------------------------------------------------------- helpers */
  const st = (c) => (c.noise ? "noise" : S.dec[c.id] || "pend");
  const col = (c, pal = COL) => {
    const s = st(c);
    if (s === "noise") return COL.noise;
    if (s === "ok") return c.cat === "elec" ? pal.elec : c.cat === "plumb" ? pal.water : pal.ok;
    return pal[s];
  };
  const res = (c) => (c.check ? c.check.res : "ok");
  const flagged = (c) => res(c) === "fail" || res(c) === "eng";
  const isAdd = (c) => res(c) === "add";
  const safe = (c) => !flagged(c);
  const unitOf = (code) => (S.up[code] != null ? S.up[code] : PR[code].up);
  const lineVal = (ln) => ln.qty * unitOf(ln.code) * (PR[ln.code].credit ? -1 : 1);
  const lineTotal = (c) => c.lines.reduce((a, ln) => a + lineVal(ln), 0);
  const approved = () => CH.filter((c) => st(c) === "ok");
  const pkgFee = () => (PKG && approved().length ? unitOf(PKG.code) : 0);
  const sumNet = () => approved().reduce((a, c) => a + lineTotal(c), 0) + pkgFee();
  const estSafe = () => CH.filter(safe).reduce((a, c) => a + lineTotal(c), 0) + (PKG ? unitOf(PKG.code) : 0);
  const count = (s) => CH.filter((c) => st(c) === s).length;
  const ptsA = () => DATA.points.concat(...CH.map((c) => c.pa));
  const roomName = (id) => (DATA.rooms.find((r) => r.id === id) || {}).name || "";
  const qtyTxt = (q) => fmt(q, q % 1 ? 1 : 0);
  const signed = (v) => (v < 0 ? "−" + money(-v) : money(v));
  const fmtSigned = (v) => (v < 0 ? "−" + fmt(-v) : fmt(v));
  const L = (s) => "⁦" + s + "⁩"; // keep codes / numbers left-to-right inside Hebrew log lines
  const tm = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${String(m).padStart(2, "0")}:${r.toFixed(1).padStart(4, "0")}`; };
  const tagOf = (c) => (flagged(c) || isAdd(c) ? c.check.tag : "תקין");
  const chkCls = (c) => ({ ok: "ok", add: "add", fail: "bad", eng: "eng" }[res(c)]);
  const pillCls = (c) => ({ ok: "ok", add: "info", fail: "bad", eng: "warn" }[res(c)]);
  const icon = (c) => ({ ok: "✓", add: "＋", fail: "⚠", eng: "⇪" }[res(c)]);

  function log(a, m, quiet) {
    if (!S.t0) S.t0 = performance.now();
    S.log.push({ t: (performance.now() - S.t0) / 1000, a, m, fresh: !quiet });
    if (S.log.length > 90) S.log.shift();
  }
  const logHtml = (n = 60) => `<div class="log" id="tcLog">${S.log.slice(-n).map((l) => {
    const h = `<div class="${l.fresh ? "new" : ""}"><span class="tm">${tm(l.t)}</span><span class="ag ${l.a}">${AGENT[l.a]}</span><span>${esc(l.m)}</span></div>`;
    l.fresh = false;
    return h;
  }).join("")}</div>`;
  const scrollLog = () => { const b = document.getElementById("tcLog"); if (b) b.scrollTop = b.scrollHeight; };

  /* ---------------------------------------------------------------- drawing */
  let planA, planB, xrefG, sugG, mkG, alG, sw, swGrip, swTagA, swTagB, swLine, swHit, clipA, clipB, scan;

  function build() {
    el("rect", { x: -600, y: -600, width: W + 1200, height: H + 1200, fill: "#111519" });
    const defs = el("defs");
    defs.innerHTML = `
      <pattern id="tc-grid" patternUnits="userSpaceOnUse" width="100" height="100"><path d="M100 0H0V100" fill="none" stroke="#171d23" stroke-width="1.4"/></pattern>
      <pattern id="tc-hatch" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)"><rect width="9" height="9" fill="#2a1a1f"/><line x1="0" y1="0" x2="0" y2="9" stroke="#e0566a" stroke-opacity=".7" stroke-width="2.4"/></pattern>
      <pattern id="tc-wet" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="14" stroke="#5b9dff" stroke-opacity=".35" stroke-width="1.6"/></pattern>
      <g id="tc-s"><circle r="8.5" fill="#111519" stroke="currentColor" stroke-width="2"/><path d="M-3 -4.5V4.5M3 -4.5V4.5" stroke="currentColor" stroke-width="2"/></g>
      <g id="tc-l"><circle r="10.5" fill="#111519" stroke="currentColor" stroke-width="2"/><path d="M-7.4 -7.4L7.4 7.4M7.4 -7.4L-7.4 7.4" stroke="currentColor" stroke-width="1.8"/></g>
      <g id="tc-w"><circle r="4.5" fill="currentColor"/><path d="M3 -3L10 -10" stroke="currentColor" stroke-width="2"/></g>
      <g id="tc-t"><path d="M0 -10L10 8H-10Z" fill="#111519" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></g>
      <g id="tc-p"><circle r="8.5" fill="#111519" stroke="currentColor" stroke-width="2"/><circle r="4" fill="currentColor"/></g>
      <g id="tc-f"><rect x="-9" y="-9" width="18" height="18" rx="2" fill="#111519" stroke="currentColor" stroke-width="2"/><path d="M-4.5 4L0 -4.5L4.5 4Z" fill="currentColor"/></g>
      <g id="tc-b"><rect x="-20" y="-7" width="40" height="14" fill="#111519" stroke="currentColor" stroke-width="2"/><path d="M-20 7L20 -7" stroke="currentColor" stroke-width="1.6"/></g>
      <clipPath id="tc-clipA"><rect id="tc-clipAr" x="644" y="-600" width="${W + 1200}" height="${H + 1200}"/></clipPath>
      <clipPath id="tc-clipB"><rect id="tc-clipBr" x="-600" y="-600" width="1244" height="${H + 1200}"/></clipPath>`;
    clipA = document.getElementById("tc-clipAr");
    clipB = document.getElementById("tc-clipBr");
    el("rect", { x: -600, y: -600, width: W + 1200, height: H + 1200, fill: "url(#tc-grid)" });

    const rooms = el("g", { class: "rooms" });
    DATA.rooms.forEach((r) => {
      const p = el("polygon", { points: r.poly.map((q) => q.join(",")).join(" "), "data-room": r.id }, rooms);
      p.addEventListener("click", () => { if (D.step === 1) pickRoom(r.id, true); });
      E.rooms[r.id] = p;
    });

    planA = plan("planA", "a");
    planB = plan("planB", "b");
    const a = DATA.meta.align;
    planB.setAttribute("transform", `translate(${-a.dx} ${-a.dy})`);
    xrefG = xref();

    sugG = el("g", { class: "sugs" });
    CH.forEach((c) => {
      if (!c.sug || !c.sug.length) return;
      const g = el("g", { class: "sug", "data-id": c.id }, sugG);
      c.sug.forEach((p) => {
        el("circle", { cx: p.x, cy: p.y, r: p.k === "b" ? 30 : 17, class: "ring" }, g);
        el("use", { href: "#tc-" + p.k, x: p.x, y: p.y }, g);
      });
      E.sug[c.id] = g;
    });

    scan = el("rect", { id: "tc-scan", x: -100, y: -60, width: 60, height: H + 120, fill: "#ff5b2e", "fill-opacity": 0.22 });

    alG = el("g", { class: "als" });
    mkG = el("g", { class: "mks" });
    ALL.forEach((c) => {
      const g = el("g", { class: "mk" + (c.noise ? " noise" : ""), "data-id": c.id, "data-hit": "", style: `--c:${COL.pend}` }, mkG);
      const pop = el("g", { class: "pop" }, g);
      el("circle", { class: "ring", r: 17 }, pop);
      el("circle", { class: "f", r: 15 }, pop);
      el("circle", { class: "b", r: 11.5 }, pop);
      el("text", { y: 0.5 }, pop).textContent = c.noise ? "×" : c.id;
      g.addEventListener("click", () => { if (!c.noise) select(c.id, true); });
      g.addEventListener("pointerenter", () => D.barMid(`CH-${c.id} · <b>${esc(c.layer)}</b>`));
      E.mk[c.id] = g;
      if (flagged(c) || isAdd(c)) {
        const t = el("g", { class: "al " + res(c), "data-id": c.id }, alG);
        el("rect", { y: -10, height: 20, rx: 10 }, t);
        el("text", { y: 0.5 }, t);
        E.al[c.id] = t;
        pillText(c, icon(c) + " " + c.check.tag);
      }
    });

    sw = el("g", { class: "sw", style: "display:none" });
    swLine = el("line", { x1: S.splitX, x2: S.splitX, y1: -600, y2: H + 600 }, sw);
    swHit = el("line", { x1: S.splitX, x2: S.splitX, y1: -600, y2: H + 600, "data-hit": "", style: "stroke:transparent;stroke-width:26px;cursor:ew-resize" }, sw);
    swTagB = tag(sw, "◂ תוכנית הדייר");
    swTagA = tag(sw, "תוכנית המכר ▸");
    swGrip = el("g", { class: "grip", "data-hit": "" }, sw);
    el("circle", { r: 15 }, swGrip);
    el("path", { d: "M-4 -5L-9 0L-4 5M4 -5L9 0L4 5" }, swGrip);
    let drag = false;
    [swGrip, swHit].forEach((n) => n.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      drag = true;
      svg.setPointerCapture(e.pointerId);
      e.stopPropagation();
    }));
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      S.splitX = Math.max(-40, Math.min(W + 40, D.pt(e).x));
      applySplit();
    });
    const endDrag = () => {
      if (!drag) return;
      drag = false;
      if (!S.swiped) { S.swiped = true; D.track("demo_action", { action: "swipe" }); }
      const r = document.getElementById("tcSplit");
      if (r) r.value = Math.round(((S.splitX + 40) / (W + 80)) * 100);
    };
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);

    D.onView(rescale);
    addEventListener("resize", rescale);
  }

  function pillText(c, label) {
    const t = E.al[c.id];
    if (!t || t.dataset.label === label) return;
    t.dataset.label = label;
    const w = label.length * 6.9 + 18;
    const r = t.querySelector("rect");
    r.setAttribute("x", -w / 2);
    r.setAttribute("width", w);
    t.querySelector("text").textContent = label;
  }

  /* the structural / MEP reference, drawn over both plans (it does not change with the tenant's plan) */
  function xref() {
    const X = DATA.xref, g = el("g", { id: "tcX" });
    X.recess.forEach((r) => {
      const [x0, y0, x1, y1] = r.box;
      el("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: "xr" }, g);
      xlabel(g, x0 + 52, y0 + 160, r.label, "wet", true);
    });
    el("path", { d: X.conc, class: "xa" }, g);
    el("path", { d: DATA.layers.col, class: "xcol" }, g);
    el("path", { d: X.thin, class: "xc" }, g);
    const [m0, n0, m1, n1] = X.mamad;
    el("rect", { x: m0 - 6, y: n0 - 6, width: m1 - m0 + 12, height: n1 - n0 + 12, class: "xm" }, g);
    xlabel(g, (m0 + m1) / 2, n0 + 62, "מעטפת ממ״ד · אין חציבה", "", true);
    X.risers.forEach((r) => {
      el("circle", { cx: r.x, cy: r.y, r: r.r + 6, class: "xp" }, g);
      xlabel(g, r.x + 92, r.y + 4, r.label);
    });
    xlabel(g, W / 2, -18, "XREF · תוכנית קונסטרוקציה · קומה טיפוסית", "tag", true);
    return g;
  }
  const XL = [];
  function xlabel(parent, x, y, text, cls, minor) {
    const g = el("g", { class: "xlg" + (minor ? " minor" : "") }, parent);
    el("text", { y: 4, class: "xl" + (cls ? " " + cls : "") }, g).textContent = text;
    XL.push({ g, x, y });
  }

  function tag(parent, text) {
    const g = el("g", { class: "tag" }, parent);
    const w = text.length * 6.6 + 18;
    el("rect", { x: -w / 2, y: -11, width: w, height: 22, rx: 5 }, g);
    el("text", { y: 0.5 }, g).textContent = text;
    g.w = w;
    return g;
  }

  function plan(id, side) {
    const g = el("g", { id, class: "pl" });
    const base = el("g", { class: "base" }, g);
    const Ly = DATA.layers;
    [["tile", Ly.tile], ["furn", Ly.furn], ["fix", Ly.fix], ["conc", Ly.conc], ["col", Ly.col], ["wall", Ly.wall]].forEach(([c, d]) => { if (d) el("path", { d, class: c }, base); });
    const chs = el("g", { class: "chs" }, g);
    ALL.forEach((c) => {
      const cg = el("g", { class: "ch" + (c.noise ? " noise" : ""), "data-id": c.id }, chs);
      const geo = side === "a" ? c.a : c.b;
      ["conc", "furn", "fix", "wall"].forEach((k) => { if (geo[k]) el("path", { d: geo[k], class: k }, cg); });
      (side === "a" ? c.pa : c.pb).forEach((p) => sym(cg, p));
      E.ch[side][c.id] = cg;
    });
    const pts = el("g", { class: "pts" }, g);
    DATA.points.forEach((p) => sym(pts, p));
    const lbl = el("g", { class: "lbl" }, g);
    const ren = side === "b" ? Object.assign({}, ...NOISE.map((n) => n.rename || {})) : {};
    DATA.rooms.forEach((r) => {
      el("text", { x: r.lx, y: r.ly, "font-size": r.small ? 17 : 23 }, lbl).textContent = ren[r.id] || r.name;
      if (!r.small) el("text", { x: r.lx, y: r.ly + 24, "font-size": 16, class: "a" }, lbl).textContent = `${fmt(r.area, 1)} מ״ר`;
    });
    return g;
  }

  function sym(parent, p) {
    return el("use", { href: "#tc-" + p.k, x: p.x, y: p.y, class: p.k === "p" ? "pw" : "", "data-pid": p.id }, parent);
  }

  function applySplit() {
    const x = S.splitX;
    clipA.setAttribute("x", x);
    clipA.setAttribute("width", W + 640 - x);
    clipB.setAttribute("width", x + 600);
    swLine.setAttribute("x1", x); swLine.setAttribute("x2", x);
    swHit.setAttribute("x1", x); swHit.setAttribute("x2", x);
    rescale();
  }

  /* markers, alerts and the swipe grip keep a constant screen size */
  function rescale() {
    const m = svg.getScreenCTM();
    if (!m || !m.a || D.canvas.hidden) return;
    const k = 1 / m.a, km = k * (svg.clientWidth < 560 ? 0.8 : 1);
    ALL.forEach((c) => {
      const [x, y] = c.at;
      E.mk[c.id].setAttribute("transform", `translate(${x} ${y}) scale(${km})`);
      if (E.al[c.id]) E.al[c.id].setAttribute("transform", `translate(${x} ${y + (c.pill === "below" ? 30 : -30) * km}) scale(${km})`);
    });
    XL.forEach((l) => l.g.setAttribute("transform", `translate(${l.x} ${l.y}) scale(${km})`));
    const vb = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    if (vb.length === 4) {
      const cy = vb[1] + vb[3] / 2, top = vb[1] + 22 * k;
      swGrip.setAttribute("transform", `translate(${S.splitX} ${cy}) scale(${k})`);
      swTagB.setAttribute("transform", `translate(${S.splitX - (swTagB.w / 2 + 10) * k} ${top}) scale(${k})`);
      swTagA.setAttribute("transform", `translate(${S.splitX + (swTagA.w / 2 + 10) * k} ${top}) scale(${k})`);
    }
  }

  function paint() {
    const step = D.step;
    svg.dataset.step = step;
    document.body.dataset.tcstep = step;
    ["wall", "conc", "furn", "elec", "plumb"].forEach((k) => svg.classList.toggle("no-" + k, !S.layers[k]));
    const strOn = S.layers.str && (step === 1 || step === 3 || step === 4);
    svg.classList.toggle("str-on", strOn);
    D.file(strOn ? XREF_FILE : "SALES_PLAN_APT.dwg");
    ALL.forEach((c) => {
      const s = st(c), cc = col(c);
      ["a", "b"].forEach((side) => {
        const g = E.ch[side][c.id];
        g.setAttribute("class", `ch st-${s}${c.noise ? " noise" : ""}`);
        g.style.setProperty("--c", cc);
      });
      const m = E.mk[c.id];
      const show = (step === 3 || step === 4) && (c.noise ? step === 3 && S.revealed.has(c.id) : S.revealed.has(c.id));
      m.style.display = show ? "" : "none";
      m.classList.toggle("in", show);
      m.classList.toggle("gone", S.gone.has(c.id));
      m.classList.toggle("sel", S.sel === c.id);
      m.style.setProperty("--c", cc);
      if (E.al[c.id]) {
        const a = E.al[c.id];
        a.style.display = show && S.detected && s !== "no" && s !== "ok" ? "" : "none";
        a.classList.toggle("esc", s === "esc");
        pillText(c, s === "esc" ? "⇪ אצל היועץ" : icon(c) + " " + c.check.tag);
      }
      if (E.sug[c.id]) E.sug[c.id].style.display = show && S.detected && s !== "no" ? "" : "none";
    });
    if (S.sel && E.mk[S.sel]) mkG.appendChild(E.mk[S.sel]);
    Object.entries(E.rooms).forEach(([id, p]) => p.classList.toggle("on", step === 1 && S.room === id));
    sw.style.display = step === 2 && S.aligned && S.mode === "swipe" ? "" : "none";
    requestAnimationFrame(rescale);
  }

  function setView(v) { svg.dataset.view = v; }

  function legend() {
    const n = D.step, strOn = S.layers.str;
    const xl = strOn ? [{ color: COL.str, label: "בטון לפי הקונסטרוקציה" }] : [];
    if (n === 1) D.legend((strOn ? xl.concat([{ color: "#5b9dff", label: "שקיעה ברצפה (אזור רטוב)" }]) : [{ color: "#e0566a", label: "בטון בתוכנית המכר" }]).concat([
      { color: "#c9d1d4", label: "קירות ומחיצות" },
      { color: "#9b8ad6", label: "חשמל ותקשורת" },
      { color: "#6f9be0", label: "נקודות מים" },
    ]));
    else if (n === 2) D.legend(!S.aligned || S.mode === "overlay"
      ? [{ color: "#4f8dff", label: "תוכנית המכר" }, { color: "#ffb547", label: "תוכנית הדייר" }, { color: "#ffe9f4", label: "זהה בשתיהן" }]
      : S.mode === "swipe" ? [{ color: "#ff5b2e", label: "קו החלוקה: גררו" }] : []);
    else if (n === 3) D.legend([
      { color: COL.pend, label: "שינוי שזוהה" },
      { color: COL.noise, label: "סונן: לא שינוי בנייה" },
      { color: COL.no, label: "נחסם בבדיקה" },
      { color: COL.add, label: "חסר סעיף נלווה" },
    ].concat(xl));
    else if (n === 4) D.legend([
      { color: COL.ok, label: "שינוי מאושר" },
      { color: COL.no, label: "נדחה" },
      { color: COL.esc, label: "אצל היועץ" },
      { color: COL.pend, label: "ממתין להחלטה" },
      { color: COL.esc, label: "נוסף בבדיקה (מקווקו)" },
    ].concat(xl));
    else D.legend([]);
  }

  function kpis() {
    D.kpi("n", S.detected ? CH.length : "—");
    D.kpi("ok", S.detected ? count("ok") : "—");
    D.kpi("no", S.detected ? count("no") : "—");
    D.kpi("sum", S.detected ? money(sumNet() * (1 + VAT)) : "—");
  }

  function setStr(on, why) {
    S.layers.str = on;
    if (on && !S.strSeen) { S.strSeen = true; D.track("demo_action", { action: "xref_structure" }); }
    D.cmd(`XREF ${on ? "ATTACH" : "DETACH"} STR_TYP.dwg${why ? "  " + why : ""}`);
    paint(); legend();
  }

  /* ---------------------------------------------------------------- step 2: alignment */
  let alignFinish = null;
  function alignNow(instant) {
    if (S.aligned) return;
    if (S.aligning) { if (instant && alignFinish) alignFinish(); return; }
    const a = DATA.meta.align;
    let safety = null;
    const done = () => {
      if (S.aligned) return;
      clearTimeout(safety);
      S.aligned = true; S.aligning = false; alignFinish = null;
      planB.removeAttribute("transform");
      log("geo", `יישור תוכנית הדייר: ${a.inliers} נקודות עיגון, שגיאה ממוצעת ${a.residual_px} פיקסל. הוזזה ${Math.abs(a.dx)} ס״מ ו־${Math.abs(a.dy)} ס״מ, סיבוב ${L(Math.abs(a.rot).toFixed(3) + "°")}.`, true);
      D.cmd(`PA_ALIGN AUTO  pts=${a.inliers}  err=${a.residual_px}px  dx=${a.dx}cm dy=${a.dy}cm`);
      if (D.step === 2) { setView(S.mode); D.barMid(`View: <b>${{ swipe: "SWIPE", overlay: "OVERLAY", A: "SALES PLAN", B: "TENANT PLAN" }[S.mode]}</b>`); paint(); renderSide(); legend(); D.hint(S.mode === "swipe" ? "גררו את הפס הכתום על השרטוט" : "התוכניות מיושרות"); }
    };
    if (instant) { done(); return; }
    S.aligning = true;
    alignFinish = done;
    D.track("demo_action", { action: "align" });
    const t0 = performance.now(), dur = 1100;
    // the animation runs on requestAnimationFrame; the timer finishes it if the tab is in the background
    safety = setTimeout(done, dur + 600);
    const tick = (t) => {
      if (S.aligned) return;
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      planB.setAttribute("transform", `translate(${(-a.dx * (1 - e)).toFixed(2)} ${(-a.dy * (1 - e)).toFixed(2)})`);
      if (p < 1) requestAnimationFrame(tick);
      else { clearTimeout(safety); setTimeout(done, 250); }
    };
    requestAnimationFrame(tick);
    renderSide();
  }

  function setMode(m) {
    S.mode = m;
    if (!S.aligned) { alignNow(false); return; }
    setView(m);
    D.barMid(`View: <b>${{ swipe: "SWIPE", overlay: "OVERLAY", A: "SALES PLAN", B: "TENANT PLAN" }[m]}</b>`);
    paint(); renderSide(); legend();
  }

  /* ---------------------------------------------------------------- step 3: detection */
  function detectScript() {
    const nWall = (DATA.layers.wall.match(/M/g) || []).length;
    const nPts = ptsA().filter((p) => p.k !== "b").length;
    const order = ALL.slice().sort((p, q) => p.at[0] - q.at[0]);
    const fails = CH.filter((c) => res(c) === "fail"), engs = CH.filter((c) => res(c) === "eng"), adds = CH.filter(isAdd);
    const notes = CH.filter((c) => flagged(c) || isAdd(c)).sort((p, q) => +p.id - +q.id);
    const th = DATA.meta.thin, bd = DATA.meta.board;
    const nLines = CH.filter(safe).reduce((a, c) => a + c.lines.length, 0);
    const nCredit = CH.filter(safe).reduce((a, c) => a + c.lines.filter((l) => PR[l.code].credit).length, 0);
    const layers = [...new Set(ALL.map((c) => c.layer))].join(", ");
    const sc = [];
    sc.push({ ms: 0, a: "geo", m: `קריאת שתי התוכניות: ${nWall} קטעי קיר, ${DATA.rooms.length} חללים, ${nPts} נקודות חשמל ומים.`, fx: runScan });
    sc.push({ ms: 450, a: "geo", m: `השוואה לפי שכבות: ${L(layers)}.` });
    order.forEach((c) => {
      sc.push({ ms: 650 + Math.round((c.at[0] / W) * 1700), a: "geo", m: `${KIND[c.kind]}: ${c.title} (${c.noise ? "" : L("#" + c.id) + ", "}${L(c.layer)})`, fx: () => S.revealed.add(c.id) });
    });
    sc.push({ ms: 2700, a: "qa", m: `סינון: ${NOISE.map((n) => n.title).join("; ")}. אינם שינויי בנייה, הוצאו מהרשימה.`, fx: () => NOISE.forEach((n) => S.gone.add(n.id)) });
    sc.push({ ms: 2950, a: "qa", m: `טעינת תוכניות ייחוס: קונסטרוקציה, אינסטלציה, טבלת לוח החשמל (${L(bd.conn)}, ${bd.slots - bd.used} מקומות פנויים).` });
    sc.push({ ms: 3250, a: "qa", m: `הצלבה עם הקונסטרוקציה: ${th.n} קטעי קיר (${fmt(th.m, 1)} מ״א) מצוירים בתוכנית המכר כמחיצה, אבל הם בטון.` });
    notes.forEach((c, i) => sc.push({ ms: 3550 + i * 300, a: "qa", m: `${L("#" + c.id)}: ${c.check.log}` }));
    const t1 = 3550 + notes.length * 300;
    sc.push({ ms: t1, a: "qa", m: `${CH.length - fails.length - engs.length} שינויים עברו את הבדיקות, ${adds.length} מהם עם סעיף נלווה. ${fails.length} נחסמו, ${engs.length} ליועץ.` });
    sc.push({ ms: t1 + 350, a: "price", m: `שיוך ${nLines} סעיפים ממחירון לדוגמה לשינויים שעברו, כולל ${adds.length} נלווים ו־${nCredit} זיכוי. אומדן: ${money(estSafe())} לפני מע״מ, כולל דמי טיפול.` });
    sc.push({ ms: t1 + 700, a: "geo", m: `סיום: ${CH.length} שינויים ב־${new Set(CH.map((c) => c.cat)).size} קטגוריות.`, fx: () => { S.detected = true; S.detecting = false; afterDetect(); } });
    return sc.sort((p, q) => p.ms - q.ms);
  }

  let detectTimers = [], script = null, scriptAt = 0;
  function runDetect() {
    S.detecting = true;
    script = detectScript();
    scriptAt = 0;
    D.track("demo_action", { action: "detect" });
    script.forEach((s, i) => detectTimers.push(setTimeout(() => {
      scriptAt = i + 1;
      log(s.a, s.m);
      s.fx && s.fx();
      if (D.step === 3) { paint(); renderSide(); kpis(); }
    }, s.ms)));
  }
  function finishDetect() {
    if (S.detected) return;
    detectTimers.forEach(clearTimeout);
    detectTimers = [];
    if (!script) script = detectScript();
    script.slice(scriptAt).forEach((s) => { log(s.a, s.m, true); if (s.fx && s.fx !== runScan) s.fx(); });
    scriptAt = script.length;
    S.detected = true; S.detecting = false;
    ALL.forEach((c) => S.revealed.add(c.id));
    NOISE.forEach((n) => S.gone.add(n.id));
  }
  function afterDetect() {
    const f = CH.filter((c) => res(c) === "fail").length, e = CH.filter((c) => res(c) === "eng").length, a = CH.filter(isAdd).length;
    D.toast(`זוהו ${CH.length} שינויים: ${f} נחסמו, ${e} ליועץ, ${a} עם סעיף נלווה`);
    D.cmd(`PA_DIFF DONE  changes=${CH.length}  filtered=${NOISE.length}  blocked=${f}  consult=${e}  derived=${a}`);
    kpis();
  }
  function runScan() {
    scan.classList.remove("run");
    void scan.getBBox();
    scan.classList.add("run");
  }

  /* ---------------------------------------------------------------- selection and decisions */
  function select(id, zoom) {
    const c = BY[id];
    if (!c) return;
    S.sel = id;
    if (S.blocked !== id) S.blocked = null;
    if (zoom && !D.canvas.hidden) D.zoomTo(...c.zoom, 0.1);
    ["a", "b"].forEach((s) => {
      const g = E.ch[s][id];
      g.classList.remove("flash");
      void g.getBBox();
      g.classList.add("flash");
      setTimeout(() => g.classList.remove("flash"), 2100);
    });
    D.barMid(`CH-${id} · <b>${esc(c.layer)}</b>`);
    D.cmd(`PA_SHOW CH-${id}  ${c.layer}  ${c.kind.toUpperCase()}`);
    paint(); renderSide();
    const li = D.sideEl.querySelector(`.li[data-id="${id}"]`);
    if (li) li.scrollIntoView({ block: "nearest" });
  }

  function decide(id, s) {
    const c = BY[id];
    if (s === "ok" && flagged(c)) {
      S.blocked = id; S.sel = id;
      const eng = res(c) === "eng";
      D.hint(eng ? `לא ניתן לאשר לפני היועץ: ${c.check.tag}` : `לא ניתן לאשר: ${c.check.tag}`, 3200);
      log("qa", `ניסיון לאשר את ${L("#" + id)} נחסם: ${c.check.tag}.`);
      D.track("demo_action", { action: "blocked_approve" });
      if (c.check.str) { if (!S.layers.str) setStr(true, "CH-" + id); D.zoomTo(...c.zoom, 0.1); }
      paint(); renderSide();
      const b = D.sideEl.querySelector(".block");
      if (b) b.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    S.blocked = null;
    const prev = S.dec[id];
    if (prev === s) delete S.dec[id]; else S.dec[id] = s;
    const now = st(c);
    if (now === "ok") {
      const auto = c.lines.filter((l) => l.auto);
      log("price", `${L("#" + id)} אושר ותומחר: ${L(c.lines.map((l) => `${l.code} × ${qtyTxt(l.qty)}`).join(" + "))} = ${L(signed(lineTotal(c)))}${auto.length ? `, כולל סעיף נלווה` : ""}.`);
    } else if (now === "no") log("qa", `${L("#" + id)} נדחה${flagged(c) ? `: ${c.check.tag}` : ""}. ההסבר וההצעה יופיעו בהצעה לדייר.`);
    else if (now === "esc") log("qa", `${L("#" + id)} הועבר ליועץ. יתומחר אחרי תשובתו.`);
    else log("qa", `${L("#" + id)} חזר לממתין.`);
    D.cmd(`PA_CHECK CH-${id} ${{ ok: "APPROVE", no: "REJECT", esc: "CONSULT", pend: "RESET" }[now]}`);
    D.track("demo_action", { action: { ok: "approve", no: "reject", esc: "escalate", pend: "reset" }[now] });
    paint(); renderSide(); kpis();
  }

  function approveSafe() {
    const ids = CH.filter((c) => safe(c) && !S.dec[c.id]).map((c) => c.id);
    ids.forEach((id) => (S.dec[id] = "ok"));
    if (ids.length) {
      log("qa", `אושרו ${ids.length} שינויים שעברו את הבדיקות: ${L(ids.map((i) => "#" + i).join(", "))}.`);
      log("price", `תומחרו ${ids.length} שינויים, כולל הסעיפים הנלווים ודמי טיפול. סה״כ מאושר: ${money(sumNet())} לפני מע״מ.`);
      D.track("demo_action", { action: "approve_all" });
      D.cmd(`PA_CHECK APPROVE PASSED (${ids.length})`);
    }
    paint(); renderSide(); kpis();
  }

  function pickRoom(id, zoom) {
    S.room = S.room === id ? null : id;
    const r = DATA.rooms.find((q) => q.id === id);
    if (S.room && zoom) {
      const xs = r.poly.map((p) => p[0]), ys = r.poly.map((p) => p[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
      const W2 = Math.max(w, 460), H2 = Math.max(h, 340);
      D.zoomTo(x0 + w / 2 - W2 / 2, y0 + h / 2 - H2 / 2, W2, H2, 0.12);
    }
    D.barMid(S.room ? `Room: <b>${esc(r.name)}</b>` : "");
    paint(); renderSide();
  }

  /* ---------------------------------------------------------------- side palette */
  const strToggle = () => `<label class="xtog"><input type="checkbox" data-layer="str" ${S.layers.str ? "checked" : ""}><span><b>תוכנית קונסטרוקציה</b> · XREF</span><code>S-CONC</code></label>`;

  const chRow = (c, actions) => {
    const s = st(c), cc = col(c);
    const pill = c.noise ? `<span class="pill">סונן</span>`
      : D.step >= 4 || S.dec[c.id] ? `<span class="pill ${{ ok: "ok", no: "bad", esc: "warn", pend: "" }[s]}">${ST_NAME[s]}</span>`
      : flagged(c) || isAdd(c) ? `<span class="pill ${pillCls(c)}">${icon(c)} ${esc(c.check.tag)}</span>` : `<span class="pill">${KIND[c.kind]}</span>`;
    const acts = actions && !c.noise ? `<span class="acts">
        <button class="ib ok ${s === "ok" ? "on" : ""}" type="button" data-dec="ok" data-id="${c.id}" aria-label="אישור #${c.id}" title="אישור">✓</button>
        <button class="ib no ${s === "no" ? "on" : ""}" type="button" data-dec="no" data-id="${c.id}" aria-label="דחייה #${c.id}" title="דחייה">✕</button></span>` : pill;
    const note = actions && (flagged(c) || isAdd(c)) && s !== "no" ? ` · <span class="nt ${pillCls(c)}">${icon(c)} ${esc(c.check.tag)}</span>` : "";
    return `<div class="li ch ${S.sel === c.id ? "on" : ""} ${c.noise ? "noise" : ""}" data-id="${c.id}" style="--c:${cc}">
      <span class="num">${c.noise ? "×" : c.id}</span>
      <span class="tt"><b>${esc(c.title)}</b><span class="meta">${esc(c.room)} · <span class="mono">${esc(c.layer)}</span>${note}</span></span>
      ${acts}</div>`;
  };
  const listHtml = (actions) => {
    let h = `<div class="list" id="tcList">`;
    CATS.forEach((cat) => {
      const items = CH.filter((c) => c.cat === cat.id && S.revealed.has(c.id));
      if (!items.length) return;
      h += `<div class="gh">${cat.name} · ${items.length}</div>` + items.map((c) => chRow(c, actions)).join("");
    });
    const nz = NOISE.filter((c) => S.revealed.has(c.id));
    if (nz.length && D.step === 3) h += `<div class="gh">סוננו: לא שינויי בנייה · ${nz.length}</div>` + nz.map((c) => chRow(c, false)).join("");
    return h + `</div>`;
  };

  const lineHtml = (c) => c.lines.map((ln) => {
    const pr = PR[ln.code];
    return `<div class="pl-ln ${ln.auto ? "auto" : ""}"><span><span class="mono">${esc(pr.code)}</span> · ${esc(pr.desc)}${ln.auto ? ` <span class="pill info">נלווה</span>` : ""}</span><span class="mono">${qtyTxt(ln.qty)} ${esc(pr.unit)} · ${signed(lineVal(ln))}</span></div>`;
  }).join("");

  function detailCard(actions) {
    const c = BY[S.sel];
    if (!c || c.noise) return `<div class="note">לחצו על שינוי ברשימה או על הסמן שלו בשרטוט כדי לראות את ההסבר ואת תוצאת הבדיקה.</div>`;
    const s = st(c), r = res(c), f = flagged(c);
    let h = `<div class="card det"><div class="ch"><b><span class="mono">#${c.id}</span> · ${esc(c.title)}</b><span class="pill ${pillCls(c)}">${icon(c)} ${esc(tagOf(c))}</span></div><div class="cb">
      <div class="ai"><b>הסבר AI · ${esc(c.layer)} · ${KIND[c.kind]}</b>${esc(c.ai)}</div>
      <div class="chk ${chkCls(c)}"><span><b>${r === "ok" ? "✓ בדיקה הנדסית:" : icon(c) + " " + esc(c.check.tag) + ":"}</b> ${esc(c.check.detail)}</span>
        ${c.check.add ? `<span class="sug">נוסף לתמחור: ${esc(c.check.add)}.</span>` : ""}
        ${c.check.suggest ? `<span class="sug">הצעה לדייר: ${esc(c.check.suggest)}</span>` : ""}
        <span class="src">מקור: ${esc(c.check.src)}</span></div>
      ${c.check.str ? `<button class="btn sm xbtn ${S.layers.str ? "on" : ""}" type="button" id="tcShowStr">${S.layers.str ? "✓ תוכנית הקונסטרוקציה מוצגת" : "הצגה בתוכנית הקונסטרוקציה"}</button>` : ""}
      <div class="ai"><b>סעיפי מחירון</b>${lineHtml(c)}</div>`;
    if (actions) {
      if (S.blocked === c.id) h += `<div class="block"><b>${r === "eng" ? "לא ניתן לאשר לפני תשובת היועץ." : `לא ניתן לאשר: ${esc(c.check.tag)}.`}</b> ${r === "eng" ? "העבירו ליועץ, או דחו את הסעיף." : "דחו את הסעיף. ההסבר וההצעה החלופית יופיעו בהצעה לדייר."}</div>`;
      h += `<div class="acts">
        <button class="btn sm okb ${s === "ok" ? "on" : ""}" type="button" data-dec="ok" data-id="${c.id}">✓ אישור</button>
        <button class="btn sm nob ${s === "no" ? "on" : ""}" type="button" data-dec="no" data-id="${c.id}">✕ דחייה</button>
        ${r === "eng" ? `<button class="btn sm escb ${s === "esc" ? "on" : ""}" type="button" data-dec="esc" data-id="${c.id}">⇪ ליועץ האינסטלציה</button>` : ""}</div>`;
    }
    return h + `</div></div>`;
  }

  function renderSide() {
    const n = D.step;
    let h = "";
    if (n === 1) {
      const pa = ptsA(), nE = pa.filter((p) => !"pb".includes(p.k)).length, nP = pa.filter((p) => p.k === "p").length;
      const main = DATA.rooms.filter((r) => r.id !== "balc");
      const area = main.reduce((a, r) => a + r.area, 0);
      const cnt = (d) => (d.match(/M/g) || []).length;
      const room = S.room && DATA.rooms.find((r) => r.id === S.room);
      const inRoom = room ? pa.filter((p) => p.r === room.id) : [];
      const byK = {};
      inRoom.forEach((p) => (byK[p.k] = (byK[p.k] || 0) + 1));
      const th = DATA.meta.thin;
      h = `<div class="hd"><h2>תוכנית המכר</h2><p>דירת 5 חדרים בקומה טיפוסית, כפי שנמכרה. זה הבסיס: כל שינוי שהדייר מבקש נבדק מולה ומול תוכניות הייחוס.</p></div>
      <div class="bd">
        <div class="stats"><div><b>5</b><span>חדרים</span></div><div><b>${fmt(area, 0)}</b><span>מ״ר נטו</span></div><div><b>${nE}</b><span>נק׳ חשמל</span></div><div><b>${nP}</b><span>נק׳ מים</span></div></div>
        <div class="stage"><b>שלב ביצוע בקומה</b>${esc(DATA.meta.stage)}</div>
        <div class="lbl">שכבות</div>
        <div class="lay">
          <label><input type="checkbox" data-layer="wall" ${S.layers.wall ? "checked" : ""}><span>קירות ומחיצות</span><code>A-WALL · ${cnt(DATA.layers.wall)}</code></label>
          <label><input type="checkbox" data-layer="conc" ${S.layers.conc ? "checked" : ""}><span>בטון בתוכנית המכר</span><code>A-CONC · ${cnt(DATA.layers.conc)}</code></label>
          <label><input type="checkbox" data-layer="furn" ${S.layers.furn ? "checked" : ""}><span>דלתות, כלים סניטריים וריהוט</span><code>A-FURN</code></label>
          <label><input type="checkbox" data-layer="elec" ${S.layers.elec ? "checked" : ""}><span>חשמל, תקשורת ולוח</span><code>E-* · ${nE + 1}</code></label>
          <label><input type="checkbox" data-layer="plumb" ${S.layers.plumb ? "checked" : ""}><span>נקודות מים</span><code>P-WATR · ${nP}</code></label>
        </div>
        <div class="lbl">תוכניות ייחוס</div>
        <div class="lay">${strToggle()}</div>
        ${S.layers.str
          ? `<div class="note xnote">בצהוב: כל הבטון לפי תוכנית הקונסטרוקציה. <b>${th.n} קטעי קיר פנימיים (${fmt(th.m, 1)} מ״א)</b> מצוירים בתוכנית המכר כמו מחיצה רגילה, אבל הם בטון. גם הקולטן ליד העמוד והשקיעה ברצפת חדר הרחצה מגיעים מכאן.</div>`
          : `<div class="note">בתוכנית המכר מסומנים כבטון רק הממ״ד, קירות החוץ והגרעין. הדליקו את תוכנית הקונסטרוקציה וראו מה עוד בטון.</div>`}
        <div class="lbl">חדרים · לחצו לבחירה</div>
        <div class="list" style="max-height:200px">${DATA.rooms.map((r) => `<div class="li rm ${S.room === r.id ? "on" : ""}" data-room="${r.id}"><span>${esc(r.name)}</span><span class="mono" style="color:var(--muted)">${fmt(r.area, 1)} מ״ר</span></div>`).join("")}</div>
        ${room ? `<div class="note"><b>${esc(room.name)}</b> · ${fmt(room.area, 1)} מ״ר · ${Object.entries(byK).map(([k, v]) => `${v} ${PT_NAME[k][v > 1 ? 1 : 0]}`).join(" · ") || "ללא נקודות"}</div>` : ""}
      </div>${D.nav(null, 2, "לתוכנית הדייר")}`;
    } else if (n === 2) {
      const a = DATA.meta.align;
      const box = S.aligned
        ? `<div class="alignbox ok"><span><b>התוכניות מיושרות.</b> <span class="mono">${a.inliers}</span> נקודות עיגון, שגיאה ממוצעת <span class="mono">${a.residual_px}px</span>.</span></div>`
        : `<div class="alignbox"><span><b>התוכנית שהתקבלה לא יושבת על תוכנית המכר.</b> היא הגיעה מהאדריכל של הדייר בקובץ נפרד, מוזזת ב־<span class="mono">${Math.abs(a.dx)}</span> ס״מ וב־<span class="mono">${Math.abs(a.dy)}</span> ס״מ.</span>
           <button class="btn pri" type="button" id="tcAlign" ${S.aligning ? "disabled" : ""}>${S.aligning ? "מיישר…" : "יישור אוטומטי"}</button></div>`;
      const modes = [["swipe", "החלקה"], ["overlay", "שכבת־על"], ["A", "מכר"], ["B", "דייר"]];
      const pct = Math.round(((S.splitX + 40) / (W + 80)) * 100);
      h = `<div class="hd"><h2>תוכנית הדייר</h2><p>תוכנית השינויים שהאדריכל של הדייר הגיש. קודם מיישרים אותה על תוכנית המכר, ואז משווים.</p></div>
      <div class="bd">
        ${box}
        <div class="lbl">תצוגה</div>
        <div class="seg">${modes.map(([m, t]) => `<button type="button" data-mode="${m}" class="${S.aligned && S.mode === m ? "on" : ""}">${t}</button>`).join("")}</div>
        ${S.aligned && S.mode === "swipe" ? `<label class="lbl" for="tcSplit">מיקום קו החלוקה</label><input type="range" id="tcSplit" min="0" max="100" value="${pct}" aria-label="מיקום קו החלוקה">` : ""}
        <div class="note">${!S.aligned ? "בשכבת־על אפשר לראות שהקירות לא נופלים זה על זה: כל קו מופיע פעמיים." : S.mode === "swipe" ? "גררו את הקו הכתום על השרטוט. מימין תוכנית המכר, משמאל תוכנית הדייר. נסו למצוא את ההבדלים בעצמכם, גם את הקטנים." : S.mode === "overlay" ? "תוכנית המכר בכחול, תוכנית הדייר בכתום. קו בהיר מופיע בשתיהן, קו כחול או כתום קיים רק באחת." : S.mode === "A" ? "תוכנית המכר בלבד." : "תוכנית הדייר בלבד."}</div>
        <div class="note">בשלב הבא שלושה סוכנים עוברים על ההבדלים שכבה אחר שכבה, ומצליבים כל אחד עם הקונסטרוקציה, האינסטלציה ולוח החשמל.</div>
      </div>${D.nav(1, 3, "הפעל זיהוי שינויים")}`;
    } else if (n === 3) {
      const done = S.detected, flags = CH.filter(flagged).length, adds = CH.filter(isAdd).length;
      const rev = CH.filter((c) => S.revealed.has(c.id)).length;
      const prog = script ? Math.round((scriptAt / script.length) * 100) : 0;
      const ag = (k, title, sub, on) => `<div class="${on ? "done" : S.detecting ? "run" : ""}"><b><i></i>${title}</b><span>${sub}</span></div>`;
      h = `<div class="hd"><h2>זיהוי שינויים</h2><p>גאומטריה מוצאת הבדלים לפי שכבה. בקרת איכות מסננת, ומצליבה כל שינוי עם תוכניות הייחוס. תמחור משייך סעיפים.</p></div>
      <div class="bd">
        <div class="agents">
          ${ag("geo", "גאומטריה", done ? `${ALL.length} הבדלים` : `${rev} עד עכשיו`, done)}
          ${ag("qa", "בקרת איכות", done ? `${flags} חסומים · ${adds} נלווים` : "בודק…", done)}
          ${ag("price", "תמחור", done ? `${CH.filter(safe).reduce((a, c) => a + c.lines.length, 0)} סעיפים` : "ממתין…", done)}
        </div>
        ${done ? "" : `<div class="prog"><i style="width:${prog}%"></i></div>`}
        ${done ? `<div class="stats">${CATS.map((c) => `<div><b>${CH.filter((x) => x.cat === c.id).length}</b><span>${c.name}</span></div>`).join("")}</div>` : ""}
        ${done ? `<div class="lay">${strToggle()}</div>` : ""}
        ${done ? detailCard(false) : ""}
        ${rev || NOISE.some((c) => S.revealed.has(c.id)) ? listHtml(false) : ""}
        <div class="lbl">יומן הסוכנים</div>
        ${logHtml()}
      </div>${D.nav(2, 4, "לבדיקה ההנדסית", !done)}`;
    } else if (n === 4) {
      const nSafe = CH.filter((c) => safe(c) && !S.dec[c.id]).length;
      h = `<div class="hd"><h2>בדיקה הנדסית</h2><p>החליטו על כל שינוי. שינוי שנחסם בהצלבה עם התוכניות אי אפשר לאשר: דוחים אותו עם הצעה חלופית, או מעבירים ליועץ.</p></div>
      <div class="bd">
        <div class="stats"><div class="s-pend"><b>${count("pend")}</b><span>ממתינים</span></div><div class="s-ok"><b>${count("ok")}</b><span>אושרו</span></div><div class="s-no"><b>${count("no")}</b><span>נדחו</span></div><div class="s-esc"><b>${count("esc")}</b><span>אצל יועץ</span></div></div>
        <div class="row"><button class="btn ${nSafe ? "pri" : ""}" type="button" id="tcSafe" ${nSafe ? "" : "disabled"}>אשר את כל מה שעבר (${nSafe})</button>${Object.keys(S.dec).length ? `<button class="btn ghost sm" type="button" id="tcReset">איפוס</button>` : ""}</div>
        <div class="lay">${strToggle()}</div>
        ${detailCard(true)}
        ${listHtml(true)}
      </div>${D.nav(3, 5, "לתמחור")}`;
    } else if (n === 5) {
      const net = sumNet(), pend = count("pend"), mod = Object.keys(S.up).length;
      const nAuto = approved().reduce((a, c) => a + c.lines.filter((l) => l.auto).length, 0);
      h = `<div class="hd"><h2>תמחור</h2><p>כל שינוי שאושר מקבל סעיפים ממחירון שינויי הדיירים, וכמות שנמדדה מהשרטוט. ערכו מחיר יחידה בטבלה, והסכום מתעדכן.</p></div>
      <div class="bd">
        <span class="badge">מחירון לדוגמה · לא מחירון מחייב</span>
        <div class="totbox" id="tcTot">${totHtml(net)}</div>
        <div class="stats c2"><div><b>${count("ok")}</b><span>שינויים מתומחרים</span></div><div><b>${nAuto}</b><span>סעיפים נלווים</span></div></div>
        ${pend ? `<div class="note"><b>${pend}</b> שינויים עדיין ממתינים להחלטה ולא נכנסו לתמחור. <a href="#" id="tcBack4" style="color:var(--redline)">חזרה לבדיקה ההנדסית</a></div>` : ""}
        ${mod ? `<button class="btn sm" type="button" id="tcRestore">שחזור מחירי המחירון</button>` : ""}
        <div class="note">סעיף נלווה הוא עבודה שתוכנית הדייר לא כללה, אבל הבדיקה הראתה שהיא חובה. מחיצה שמבטלים לפני שנבנתה מקבלת זיכוי. דמי הטיפול נגבים פעם אחת לבקשה. במערכת המלאה נטען המחירון של החברה.</div>
        <div class="lbl">יומן הסוכנים</div>
        ${logHtml(6)}
      </div>${D.nav(4, 6, "להצעה לדייר")}`;
    } else if (n === 6) {
      const net = sumNet();
      h = `<div class="hd"><h2>הצעה לדייר</h2><p>הצעת מחיר לחתימת הדייר: מה אושר ובכמה, מה נדחה ולמה, מה ההצעה החלופית, ומה ממתין ליועץ.</p></div>
      <div class="bd">
        <div class="stats c3"><div class="s-ok"><b>${count("ok")}</b><span>אושרו</span></div><div class="s-no"><b>${count("no")}</b><span>נדחו</span></div><div class="s-esc"><b>${count("esc")}</b><span>אצל יועץ</span></div></div>
        <div class="totbox">${totHtml(net)}</div>
        <div class="row"><button class="btn pri" type="button" id="tcPrint">הדפסה / שמירה כ־PDF</button><button class="btn" type="button" id="tcCopy">העתקה לאקסל</button></div>
        <div class="note">במערכת המלאה ההצעה נשלחת לדייר לחתימה. אחרי חתימה ותשלום, התוכנית המעודכנת עוברת למנהל העבודה ולקבלני המשנה, וסעיפים שאצל היועץ נפתחים כמשימה.</div>
        ${D.cta()}
      </div>${D.nav(5, null)}`;
    }
    D.side(h);
    bindSide();
    scrollLog();
  }

  const totHtml = (net) => `<div><span>סה״כ לפני מע״מ</span><b>${money(net)}</b></div><div><span>מע״מ ${Math.round(VAT * 100)}%</span><b>${money(net * VAT)}</b></div><div class="g"><span>סה״כ לתשלום</span><b>${money(net * (1 + VAT))}</b></div>`;

  function bindSide() {
    const side = D.sideEl;
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    side.querySelectorAll("input[data-layer]").forEach((i) => (i.onchange = () => {
      if (i.dataset.layer === "str") { setStr(i.checked); renderSide(); return; }
      S.layers[i.dataset.layer] = i.checked;
      D.cmd(`LAYER ${i.checked ? "ON" : "OFF"} ${{ wall: "A-WALL", conc: "A-CONC", furn: "A-FURN", elec: "E-*", plumb: "P-WATR" }[i.dataset.layer]}`);
      paint();
    }));
    side.querySelectorAll(".li.rm").forEach((li) => (li.onclick = () => pickRoom(li.dataset.room, true)));
    side.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    on("tcAlign", () => alignNow(false));
    const r = document.getElementById("tcSplit");
    if (r) r.oninput = () => { S.splitX = -40 + (r.value / 100) * (W + 80); applySplit(); if (!S.swiped) { S.swiped = true; D.track("demo_action", { action: "swipe" }); } };
    side.querySelectorAll(".li.ch:not(.noise)").forEach((li) => (li.onclick = (e) => { if (e.target.closest("[data-dec]")) return; select(li.dataset.id, true); }));
    side.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); decide(b.dataset.id, b.dataset.dec); }));
    on("tcShowStr", () => { const c = BY[S.sel]; setStr(!S.layers.str, c ? "CH-" + c.id : ""); if (S.layers.str && c) D.zoomTo(...c.zoom, 0.1); renderSide(); });
    on("tcSafe", approveSafe);
    on("tcReset", () => { S.dec = {}; S.blocked = null; log("qa", "כל ההחלטות אופסו."); paint(); renderSide(); kpis(); });
    on("tcRestore", () => { S.up = {}; log("price", "המחירים חזרו למחירון."); D.table(priceTable()); bindTable(); renderSide(); kpis(); });
    on("tcBack4", (e) => { e.preventDefault(); D.go(4); });
    on("tcPrint", () => { D.track("demo_action", { action: "print" }); D.track("demo_export", { format: "print" }); window.print(); });
    on("tcCopy", () => { D.copy(tsv(), "ההצעה הועתקה. הדביקו בגיליון אקסל"); D.track("demo_action", { action: "copy" }); D.track("demo_export", { format: "tsv" }); });
  }

  /* ---------------------------------------------------------------- step 5: price table */
  const upInput = (code) => `<input class="up ${S.up[code] != null ? "mod" : ""}" type="number" min="0" step="10" value="${unitOf(code)}" data-code="${code}" aria-label="מחיר יחידה ${code}">`;
  function priceTable() {
    let h = `<table><thead><tr><th>#</th><th>סעיף</th><th>תיאור העבודה</th><th class="num">כמות</th><th>יח׳</th><th class="num">מחיר יח׳ ₪</th><th class="num">סה״כ ₪</th><th>סטטוס</th></tr></thead><tbody>`;
    CATS.forEach((cat) => {
      const items = CH.filter((c) => c.cat === cat.id);
      const sub = items.filter((c) => st(c) === "ok").reduce((a, c) => a + lineTotal(c), 0);
      h += `<tr class="grp"><td colspan="6">${cat.name}</td><td class="num" data-sub="${cat.id}">${fmtSigned(sub)}</td><td></td></tr>`;
      items.forEach((c) => {
        const s = st(c), ok = s === "ok";
        const why = s === "no" ? (flagged(c) ? c.check.tag : "נדחה") : s === "esc" ? "יתומחר אחרי תשובת היועץ" : s === "pend" ? "ממתין להחלטה" : "";
        c.lines.forEach((ln, i) => {
          const pr = PR[ln.code];
          h += `<tr class="${ok ? "" : "dim"} ${ln.auto ? "auto" : ""}" data-id="${c.id}"><td class="mono">${i ? "" : c.id}</td><td class="mono">${pr.code}</td>
            <td class="desc">${i ? (ln.auto ? `<span class="pill info">נלווה</span> ` : `<span class="cont">↳ </span>`) : esc(c.title)}<small>${esc(pr.desc)}${ln.note ? ` · ${esc(ln.note)}` : ""}${pr.credit ? " · זיכוי" : ""}</small></td>
            <td class="num">${qtyTxt(ln.qty)}</td><td>${esc(pr.unit)}</td>
            <td class="num">${ok ? upInput(pr.code) : fmt(unitOf(pr.code))}</td>
            <td class="num" data-line="${c.id}-${i}">${ok ? fmtSigned(lineVal(ln)) : "—"}</td>
            <td>${i ? "" : `<span class="stt ${s}">${ST_NAME[s]}</span>${why && !ok ? `<small style="display:block;color:var(--faint)">${esc(why)}</small>` : ""}`}</td></tr>`;
        });
      });
    });
    if (PKG) {
      const has = approved().length > 0;
      h += `<tr class="grp"><td colspan="6">כללי</td><td class="num" data-sub="pkg">${fmt(pkgFee())}</td><td></td></tr>
        <tr class="${has ? "" : "dim"}"><td class="mono"></td><td class="mono">${PKG.code}</td><td class="desc">דמי טיפול בבקשה<small>${esc(PKG.desc)}</small></td>
        <td class="num">1</td><td>${esc(PKG.unit)}</td><td class="num">${has ? upInput(PKG.code) : fmt(unitOf(PKG.code))}</td><td class="num" id="tcPkg">${has ? fmt(pkgFee()) : "—"}</td><td><small style="color:var(--faint)">פעם אחת לבקשה</small></td></tr>`;
    }
    const net = sumNet();
    h += `<tr class="sub"><td colspan="6">סה״כ לפני מע״מ</td><td class="num" id="tcNet">${fmt(net)}</td><td></td></tr>
      <tr class="sub"><td colspan="6">מע״מ ${Math.round(VAT * 100)}%</td><td class="num" id="tcVat">${fmt(Math.round(net * VAT))}</td><td></td></tr>
      <tr class="tot"><td colspan="6">סה״כ לתשלום</td><td class="num" id="tcGross">${fmt(Math.round(net * (1 + VAT)))}</td><td></td></tr></tbody></table>
      <div class="tnote">מחירון לדוגמה, מספור לפי פרקי המפרט הכללי. כמויות קירות במ״ר: אורך שנמדד מהשרטוט × גובה ${fmt(DATA.meta.h_wall, 2)} מ׳. שינויים שנדחו, ממתינים או אצל היועץ מופיעים בטבלה ואינם נכללים בסכום.</div>`;
    return h;
  }
  let priceLogT = null;
  function bindTable() {
    D.tableEl.querySelectorAll("input.up").forEach((inp) => {
      inp.oninput = () => {
        const code = inp.dataset.code, v = Math.max(0, +inp.value || 0);
        const before = PR[code].up;
        if (v === before) delete S.up[code]; else S.up[code] = v;
        D.tableEl.querySelectorAll(`input.up[data-code="${code}"]`).forEach((o) => { if (o !== inp) o.value = v; o.classList.toggle("mod", v !== before); });
        refreshTotals();
        clearTimeout(priceLogT);
        priceLogT = setTimeout(() => {
          log("price", `מחיר ${L(code)} עודכן: ${L(money(before))} ← ${L(money(v))}. סה״כ ${L(money(sumNet()))} לפני מע״מ.`);
          D.track("demo_action", { action: "price_edit" });
          D.cmd(`PA_PRICE SET ${code} ${v}`);
          if (D.step === 5) renderSide();
        }, 700);
      };
    });
  }
  function refreshTotals() {
    CH.forEach((c) => c.lines.forEach((ln, i) => { const td = D.tableEl.querySelector(`[data-line="${c.id}-${i}"]`); if (td && st(c) === "ok") td.textContent = fmtSigned(lineVal(ln)); }));
    CATS.forEach((cat) => {
      const td = D.tableEl.querySelector(`[data-sub="${cat.id}"]`);
      if (td) td.textContent = fmtSigned(CH.filter((c) => c.cat === cat.id && st(c) === "ok").reduce((a, c) => a + lineTotal(c), 0));
    });
    const net = sumNet();
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set("tcPkg", fmt(pkgFee())); const ps = D.tableEl.querySelector(`[data-sub="pkg"]`); if (ps) ps.textContent = fmt(pkgFee());
    set("tcNet", fmt(net)); set("tcVat", fmt(Math.round(net * VAT))); set("tcGross", fmt(Math.round(net * (1 + VAT))));
    const tot = document.getElementById("tcTot");
    if (tot) tot.innerHTML = totHtml(net);
    kpis();
  }

  /* ---------------------------------------------------------------- step 6: offer to the tenant */
  function miniMap() {
    const Ly = DATA.layers;
    let s = `<svg viewBox="-30 -30 1348 1040" xmlns="${D.NS}" role="img" aria-label="מפת השינויים בדירה">
      <rect x="-30" y="-30" width="1348" height="1040" fill="#fff"/>
      <path d="${Ly.conc}" fill="#d5dade"/><path d="${Ly.col}" fill="#9aa3aa"/>
      <path d="${Ly.fix}" fill="none" stroke="#b7c0c6" stroke-width="1.2"/><path d="${Ly.wall}" fill="none" stroke="#39424a" stroke-width="2.2"/>`;
    ALL.forEach((c) => {
      if (c.noise) { Object.entries(c.b).forEach(([k, d]) => { if (k !== "furn") s += `<path d="${d}" fill="none" stroke="#39424a" stroke-width="2"/>`; }); return; }
      const sc = st(c), cc = col(c, PCOL);
      if (sc === "no") {
        Object.entries(c.a).forEach(([k, d]) => { s += k === "conc" ? `<path d="${d}" fill="#d5dade"/>` : `<path d="${d}" fill="none" stroke="#39424a" stroke-width="2.2"/>`; });
        Object.entries(c.b).forEach(([, d]) => { s += `<path d="${d}" fill="none" stroke="${cc}" stroke-width="2.4" stroke-dasharray="7 6" opacity=".7"/>`; });
      } else {
        Object.entries(c.a).forEach(([k, d]) => { s += `<path d="${d}" fill="none" stroke="${cc}" stroke-width="2" stroke-dasharray="7 6" opacity=".8"/>`; });
        Object.entries(c.b).forEach(([, d]) => { s += `<path d="${d}" fill="none" stroke="${cc}" stroke-width="3.6"/>`; });
        (c.sug || []).forEach((p) => { s += `<circle cx="${p.x}" cy="${p.y}" r="${p.k === "b" ? 26 : 13}" fill="none" stroke="${cc}" stroke-width="2.4" stroke-dasharray="5 4"/>`; });
      }
      c.pb.forEach((p) => { s += `<circle cx="${p.x}" cy="${p.y}" r="9" fill="${cc}"/>`; });
    });
    DATA.rooms.filter((r) => !r.small).forEach((r) => { s += `<text x="${r.lx}" y="${r.ly}" font-size="22" fill="#7b858d" text-anchor="middle" font-family="IBM Plex Sans Hebrew, sans-serif">${esc(r.name)}</text>`; });
    CH.forEach((c) => {
      const cc = col(c, PCOL), [x, y] = c.at;
      s += `<circle cx="${x}" cy="${y}" r="19" fill="#fff" stroke="${cc}" stroke-width="4"/><text x="${x}" y="${y + 7}" font-size="19" font-weight="700" fill="#1b1f24" text-anchor="middle" font-family="IBM Plex Mono, monospace">${c.id}</text>`;
    });
    return s + `</svg>`;
  }

  function report() {
    const today = new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
    const ok = approved(), no = CH.filter((c) => st(c) === "no"), es = CH.filter((c) => st(c) === "esc"), pe = CH.filter((c) => st(c) === "pend");
    const net = sumNet();
    let h = `<div class="paper-wrap"><article class="paper">
      <div class="ph"><div><h2>הצעת מחיר לשינויי דיירים</h2><p>דירת 5 חדרים, קומה טיפוסית, בניין מגורים · תוכנית הדייר מול תוכנית המכר ותוכניות הייחוס</p></div>
        <div class="mono">${esc(today)}<br>REF TC-DEMO-0001</div></div>
      <div class="chips"><span>${CH.length} שינויים התבקשו</span><span class="c-ok">${ok.length} אושרו</span><span class="c-no">${no.length} נדחו</span><span class="c-esc">${es.length} אצל יועץ</span>${pe.length ? `<span>${pe.length} טרם הוחלט</span>` : ""}</div>
      <div class="map">${miniMap()}</div>
      <h3>שינויים מאושרים ומתומחרים</h3>`;
    if (ok.length) {
      h += `<table><thead><tr><th>#</th><th>השינוי</th><th>סעיף</th><th class="num">כמות</th><th class="num">מחיר יח׳</th><th class="num">סה״כ</th></tr></thead><tbody>`;
      ok.forEach((c) => c.lines.forEach((ln, i) => {
        const pr = PR[ln.code];
        h += `<tr><td>${i ? "" : c.id}</td><td>${i ? `${ln.auto ? "נלווה: " : "↳ "}${esc(pr.desc)}` : esc(c.title)}${pr.credit ? " (זיכוי)" : ""}</td><td class="num">${pr.code}</td><td class="num">${qtyTxt(ln.qty)} ${esc(pr.unit)}</td><td class="num">${money(unitOf(pr.code))}</td><td class="num">${signed(lineVal(ln))}</td></tr>`;
      }));
      if (PKG) h += `<tr><td></td><td>${esc(PKG.desc)}</td><td class="num">${PKG.code}</td><td class="num">1 ${esc(PKG.unit)}</td><td class="num">${money(pkgFee())}</td><td class="num">${money(pkgFee())}</td></tr>`;
      h += `<tr><td colspan="5">סה״כ לפני מע״מ</td><td class="num">${money(net)}</td></tr><tr><td colspan="5">מע״מ ${Math.round(VAT * 100)}%</td><td class="num">${money(net * VAT)}</td></tr>
        <tr class="tot"><td colspan="5">סה״כ לתשלום</td><td class="num">${money(net * (1 + VAT))}</td></tr></tbody></table>`;
    } else h += `<p class="empty">עדיין לא אושרו שינויים. חזרו לשלב הבדיקה ההנדסית.</p>`;
    const reasonTable = (arr, title, head, fn) => arr.length ? `<h3>${title}</h3><table><thead><tr><th>#</th><th>השינוי</th><th>${head}</th></tr></thead><tbody>${arr.map((c) => `<tr><td>${c.id}</td><td>${esc(c.title)}</td><td>${fn(c)}</td></tr>`).join("")}</tbody></table>` : "";
    h += reasonTable(no, "שינויים שנדחו", "סיבה והצעה חלופית", (c) => (flagged(c)
      ? `<span class="reason">${esc(c.check.tag)}: ${esc(c.check.detail)}</span>${c.check.suggest ? `<br><span class="alt">הצעה: ${esc(c.check.suggest)}</span>` : ""}`
      : "נדחה בבדיקה"));
    h += reasonTable(es, "אצל יועץ, יתומחר אחרי תשובתו", "מה נבדק", (c) => `${esc(c.check.detail)}`);
    h += reasonTable(pe, "טרם הוחלט", "סטטוס", () => "ממתין לבדיקה הנדסית");
    h += `<ul class="terms">
        <li>תוקף ההצעה 14 יום, ובכל מקרה עד יציקת תקרת הדירה. שינויי חשמל בתקרה אחרי היציקה לא יבוצעו.</li>
        <li>השינויים יועברו לביצוע רק אחרי חתימה על ההצעה ותשלום.</li>
        <li>נגרות, ריהוט ומחיצות זכוכית אינם חלק מההצעה.</li>
      </ul>
      <p class="disc">מחירון לדוגמה, אינו הצעת מחיר מחייבת. הכמויות נמדדו אוטומטית מהשרטוט. ההצעה הופקה מתוך דמו.</p>
      <div class="foot"><div>חתימת הדייר</div><div>מתאם/ת שינויי דיירים</div></div></article></div>`;
    return h;
  }

  function tsv() {
    const q = (s) => String(s).replace(/״/g, '"').replace(/׳/g, "'");
    const rows = [["מס'", "השינוי", "קטגוריה", "שכבה", "סטטוס", "סעיף", "תיאור", "כמות", "יחידה", "מחיר יחידה", "סה\"כ", "הערה"].join("\t")];
    CH.forEach((c) => {
      const s = st(c);
      c.lines.forEach((ln, i) => {
        const pr = PR[ln.code];
        const note = i === 0 ? (s === "no" && flagged(c) ? c.check.tag : s === "esc" ? "אצל יועץ" : "") : ln.auto ? "נלווה" : "";
        rows.push([c.id, c.title, CATS.find((x) => x.id === c.cat).name, c.layer, ST_NAME[s], pr.code, pr.desc, ln.qty, q(pr.unit), unitOf(pr.code), s === "ok" ? Math.round(lineVal(ln)) : 0, note].join("\t"));
      });
    });
    if (PKG) rows.push(["", "דמי טיפול", "כללי", "", approved().length ? "אושר" : "", PKG.code, PKG.desc, 1, q(PKG.unit), unitOf(PKG.code), Math.round(pkgFee()), ""].join("\t"));
    const net = sumNet();
    rows.push(["", "סה\"כ לפני מע\"מ", "", "", "", "", "", "", "", "", Math.round(net), ""].join("\t"));
    rows.push(["", "סה\"כ כולל מע\"מ", "", "", "", "", "", "", "", "", Math.round(net * (1 + VAT)), ""].join("\t"));
    return q(rows.join("\n"));
  }

  /* ---------------------------------------------------------------- steps */
  function onStep(n) {
    if (!DATA) return;
    if (n >= 3 && !S.aligned) alignNow(true);
    if (n >= 4 && !S.detected) finishDetect();
    D.table(n === 5 ? priceTable() : n === 6 ? report() : null);
    if (n === 5) bindTable();
    if (n === 1) { setView("A"); D.barMid(S.room ? `Room: <b>${esc(roomName(S.room))}</b>` : "Plan: <b>SALES</b>"); }
    if (n === 2) { setView(S.aligned ? S.mode : "mis"); D.barMid(S.aligned ? "View: <b>SWIPE</b>" : "View: <b>RECEIVED</b>"); }
    if (n === 3 || n === 4) { setView("review"); D.barMid("Plan: <b>TENANT vs SALES</b>"); }
    if (n <= 2) D.fit();
    paint(); renderSide(); kpis(); legend();
    if (n === 2 && !S.aligned) D.hint("התוכנית שהתקבלה לא יושבת על תוכנית המכר. לחצו ״יישור אוטומטי״", 3600);
    if (n === 3 && !S.detected && !S.detecting) { D.fit(); runDetect(); }
    if (n === 4) {
      if (!S.sel || BY[S.sel].noise || !Object.keys(S.dec).length) S.sel = CH.find((c) => res(c) === "fail").id;
      D.fit();
      paint(); renderSide();
      if (!Object.keys(S.dec).length) D.hint(`נסו לאשר את ${L("#" + S.sel)}. בתוכנית המכר זו מחיצה רגילה.`, 3400);
    }
  }

  fetch("/catalog/tenant-changes/data.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      DATA = data;
      W = data.meta.w; H = data.meta.h; S.splitX = W / 2;
      CH = data.changes.filter((c) => !c.noise);
      NOISE = data.changes.filter((c) => c.noise);
      ALL = CH.concat(NOISE);
      ALL.forEach((c) => (BY[c.id] = c));
      data.prices.forEach((p) => (PR[p.code] = p));
      PKG = data.prices.find((p) => p.pkg) || null;
      build();
      D.ready();
    })
    .catch((e) => { console.warn(e); D.hint("טעינת השרטוט נכשלה. רעננו את הדף.", 10000); });
})();
