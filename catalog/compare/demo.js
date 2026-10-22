/* SuperPosition demo (/catalog/compare/): two real drawings of one floor, architecture (A) and HVAC (B).
   B is registered onto A, the line work is split into A-only (red), B-only (blue) and common, and the
   difference regions are a coordination log: the product's AI answers for a real comparison, reviewed
   against both full sheets (tools/demos/compare/findings.py). Everything is computed from data.json +
   data.bin, made by tools/demos/compare/extract.py (anonymized: no title block, texts, dimensions or frame).

   The drawings are painted on a <canvas> under the shell's SVG (one Path2D per class and tile, culled to
   the view); the SVG keeps the pan/zoom viewBox, the region frames and markers and the swipe handle. */
(() => {
  "use strict";
  const BASE = "/catalog/compare/";
  const CW = 5860, CH = 1920;              // the crop of the sheet, pt (data.json "crop")
  const SCALE = 50;                        // sheet scale 1:50
  const PT_M = (0.0254 / 72) * SCALE;      // metres on site per pt on the sheet
  const PT_CM = 2.54 / 72;                 // cm on paper per pt
  const COL = { a: "#ff5a52", b: "#4c8dff", c: "#d6dce1", n: "#d3dade", own: "#9fe3ff", bg: "#6c7882", reg: "#ff9800" };
  const TONE = { ss: 1, sl: 0.5, fd: 0.3, fl: 0.09 };   // stroke strong / light, fill dark / light
  const KIND = { only_a: "רק ב-A", only_b: "רק ב-B", changed: "שונה" };
  const TYPE = {
    room_changed: "ייעוד החדר השתנה", shaft: "פיר", opening: "פתח / רפפה", duct_route: "תוואי תעלה",
    background: "רקע לא מעודכן", info: "לידיעה", consultant_content: "תוכן של היועץ", other_consultants: "יועצים אחרים ב-A",
  };
  const SEV = { high: "גבוה", medium: "בינוני", low: "נמוך" };
  const DISC = { hvac: "מיזוג", arch: "אדריכלות", both: "אדריכלות + מיזוג", info: "לידיעה" };
  const DISC_SHORT = { hvac: "מיזוג", arch: "אדריכלות", both: "שניהם" };
  const STATUS = { coord: "לתיאום", done: "טופל" };
  const PRESETS = { all: [100, 100, 100], diff: [100, 100, 0], a: [100, 0, 0], b: [0, 100, 0] };
  // registration numbers in site units (A is 1:50): px on the comparison raster -> cm on site
  const pxCm = (px) => (px / REGI.ppt) * PT_M * 100;
  const thousands = (n) => fmt(Math.round(n / 1000));
  const PIPE = [
    ["העלאת הקבצים", () => "PDF · שני גיליונות"],
    ["קריאת השרטוטים", () => `A: כ־${thousands(CNT.a)} אלף קווים · B: כ־${thousands(CNT.b)} אלף`],
    ["יישור B על A", () => `${REGI.inliers} התאמות תקפות מתוך ${REGI.matches} · שגיאה ${pxCm(REGI.residual_px).toFixed(1)} ס״מ`],
    ["זיהוי טקסטים, מידות וחצים", () => "יוצאים מההשוואה, לא נספרים כשינוי"],
    ["דיוק מקומי", () => `${REGI.blocks} בלוקים · תיקון חציוני ${pxCm(REGI.median_shift_px).toFixed(1)} ס״מ, מרבי ${Math.round(pxCm(REGI.max_shift_px))} ס״מ`],
    ["חישוב ההבדלים", () => `סובלנות כ־1 מ״מ בגיליון (${pxCm(REGI.tol_px).toFixed(1)} ס״מ בשטח) · ${REG.length} אזורים`],
    ["הכנת התצוגה", () => "אדום, כחול ומשותף"],
  ];
  const ID = [1, 0, 0, 1, 0, 0];

  const narrow = matchMedia("(max-width: 700px)").matches;
  const ASPECT = narrow ? 1.25 : 2.2;
  const HOME = (() => {
    // phones: the middle of the plan at a readable size (pan / pinch for the rest); wider screens: all of it
    if (narrow) { const H = 2300, W = H * ASPECT; return [2950 - W / 2, CH / 2 - H / 2, W, H]; }
    const m = 70;
    let W = CW + 2 * m, H = W / ASPECT;
    if (H < CH + 2 * m) { H = CH + 2 * m; W = H * ASPECT; }
    return [CW / 2 - W / 2, CH / 2 - H / 2, W, H];
  })();

  /* ---------- shell ---------- */
  const D = Demo({
    slug: "compare",
    plugin: "SUPERPOSITION",
    tag: "Web app · השוואת שרטוטים",
    title: "SuperPosition: השוואת שרטוטים בין דיסציפלינות",
    sub: "שרטוט דוגמה: קומת מסחר תת־קרקעית מתחת לבנייני מגורים. A: תוכנית האדריכלות בגרסה האחרונה. B: תוכנית המיזוג של היועץ, על הרקע האדריכלי שהיה בידיו. המערכת מיישרת את B על A, מראה מה קיים רק באחד מהם, ומוציאה ממצאי תיאום עם חומרה וגורם אחראי.",
    file: "A_ARCH.pdf + B_HVAC.pdf",
    viewBox: HOME,
    kpis: [{ id: "regions", label: "אזורי שינוי" }, { id: "real", label: "ממצאים" }, { id: "coord", label: "לתיאום" }, { id: "done", label: "טופלו" }],
    steps: [
      { t: "שני שרטוטים", d: "אדריכלות מול מיזוג", cmd: "SP_OPEN A=A_ARCH.pdf B=B_HVAC.pdf" },
      { t: "יישור אוטומטי", d: "B על A, בלי נקודות ידניות", cmd: "SP_ALIGN" },
      { t: "שכבת הפרשים", d: "אדום, כחול ומשותף", cmd: "SP_DIFF TOL=1mm" },
      { t: "ממצאי תיאום", d: "הסבר ה־AI, חומרה ואחריות", cmd: "SP_REGIONS" },
      { t: "דוח לישיבת תיאום", d: "סיכום והעתקה לאקסל", cmd: "SP_REPORT" },
    ],
    onStep,
  });
  const fmt = D.fmt, esc = D.esc;
  const $ = (id) => document.getElementById(id);
  // the stage bar shows metres on site (sheet at 1:50), Y up
  D.coords = (x, y) => { $("d-coords").textContent = `X ${(x * PT_M).toFixed(2)} · Y ${((CH - y) * PT_M).toFixed(2)} m`; };

  /* ---------- state ---------- */
  let DATA = null, BIN = null, REG = [], REGI = null, CNT = { a: 0, b: 0 }, LEN = {};
  const S = {
    view: "a", bg: true,                        // step 1
    M0: null, M: null, aligned: false, anim: false, pipe: 1, moved: false, dragB: null,   // step 2
    op: { a: 100, b: 100, c: 100 }, diffOnly: false, mode: "layers", split: CW / 2, splitDrag: null, blinkA: true,  // step 3
    sel: null, sev: "all", type: null, status: {}, disc: {}, analysed: false, analysing: false, done: 0, forced: new Set(), fresh: null,  // step 4
    tableView: true, withNoise: false,          // step 5
  };
  let blinkT = null;

  /* ---------- canvas + overlays ---------- */
  const cv = document.createElement("canvas");
  cv.className = "cv";
  cv.setAttribute("aria-hidden", "true");
  D.canvas.prepend(cv);
  const ctx = cv.getContext("2d");
  const cap = document.createElement("div");
  cap.className = "cap";
  cap.hidden = true;
  D.canvas.appendChild(cap);
  const gReg = D.el("g", {});
  const gMk = D.el("g", {});
  const gSplit = D.el("g", { "data-hit": "", style: "cursor:ew-resize;display:none" });
  const splitLine = D.el("line", { y1: -20000, y2: 20000, stroke: "#ffffff", "stroke-width": 1.5, "vector-effect": "non-scaling-stroke" }, gSplit);
  const splitHit = D.el("line", { y1: -20000, y2: 20000, stroke: "transparent", "stroke-width": 24, "vector-effect": "non-scaling-stroke" }, gSplit);
  const knob = D.el("g", {}, gSplit);
  D.el("circle", { r: 15, fill: "#111519", stroke: "#ffffff", "stroke-width": 1.5 }, knob);
  D.el("path", { d: "M-4 -5 L-9 0 L-4 5 M4 -5 L9 0 L4 5", fill: "none", stroke: "#ffffff", "stroke-width": 1.6 }, knob);
  const lblA = D.el("text", { x: -26, y: 4, fill: COL.a, "text-anchor": "end", class: "split-lbl" }, knob);
  const lblB = D.el("text", { x: 26, y: 4, fill: COL.b, "text-anchor": "start", class: "split-lbl" }, knob);
  lblA.textContent = "A"; lblB.textContent = "B";

  let raf = 0;
  const req = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  if (D.onView) D.onView(req); else new MutationObserver(req).observe(D.svg, { attributes: true, attributeFilter: ["viewBox"] });
  if (window.ResizeObserver) new ResizeObserver(req).observe(D.svg);
  addEventListener("resize", req);

  /* ---------- matrices (canvas order: a b c d e f) ---------- */
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const inv = (m) => {
    const d = m[0] * m[3] - m[1] * m[2];
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
  };
  const isId = (m) => !m || m.every((v, i) => Math.abs(v - ID[i]) < 1e-9);
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ---------- data ---------- */
  const TILE = 400, TX = Math.ceil(CW / TILE), TY = Math.ceil(CH / TILE);
  function decode() {
    const q = DATA.q;
    for (const bt of DATA.batches) {
      const tiles = new Map();
      const fill = bt.kind === "f";
      let i = bt.off, x = 0, y = 0, len = 0, n = 0;
      const end = bt.off + bt.len;
      const rd = () => {
        let v = 0, sh = 0, b;
        do { b = BIN[i++]; v |= (b & 127) << sh; sh += 7; } while (b & 128);
        return (v >>> 1) ^ -(v & 1);
      };
      while (i < end) {
        const k = rd();
        x += rd(); y += rd();
        let px = x / q, py = y / q;
        const key = Math.min(TY - 1, Math.max(0, Math.floor(py / TILE))) * TX + Math.min(TX - 1, Math.max(0, Math.floor(px / TILE)));
        let t = tiles.get(key);
        if (!t) { t = { p: new Path2D(), x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; tiles.set(key, t); }
        t.p.moveTo(px, py);
        if (px < t.x0) t.x0 = px; if (px > t.x1) t.x1 = px; if (py < t.y0) t.y0 = py; if (py > t.y1) t.y1 = py;
        for (let j = 1; j < k; j++) {
          x += rd(); y += rd();
          const nx = x / q, ny = y / q;
          t.p.lineTo(nx, ny);
          if (!fill) len += Math.hypot(nx - px, ny - py);
          px = nx; py = ny;
          if (px < t.x0) t.x0 = px; if (px > t.x1) t.x1 = px; if (py < t.y0) t.y0 = py; if (py > t.y1) t.y1 = py;
        }
        if (fill) t.p.closePath();
        n++;
      }
      bt.tiles = [...tiles.values()];
      bt.m = len * PT_M;
      bt.n = n;
    }
    const sum = (f, k = "m") => DATA.batches.filter(f).reduce((a, b) => a + b[k], 0);
    const st = (side, cls) => (b) => b.side === side && b.kind === "s" && (!cls || b.cls === cls);
    const bs = (grp, cls) => sum((b) => b.side === "b" && b.kind === "s" && b.grp === grp && (!cls || b.cls === cls));
    LEN = {
      ao: sum(st("a", "o")), ac: sum(st("a", "c")), bo: sum(st("b", "o")), bc: sum(st("b", "c")),
      bown: bs("own"), bbg: bs("bg"), bgo: bs("bg", "o"), bgc: bs("bg", "c"), owno: bs("own", "o"), ownc: bs("own", "c"),
    };
    CNT = { a: sum(st("a"), "n"), b: sum(st("b"), "n") };
    REGI = DATA.reg;
    REG = DATA.regions.map((r, i) => {
      const [x, y, w, h] = r.bbox;
      return { ...r, n: i + 1, x, y, w, h, real: r.sev !== "none" };
    });
    REG.forEach((r) => { if (r.real && r.disc && r.disc !== "info") S.disc[r.id] = r.disc; });
    // B as received: the registration maps it onto A (s, theta, tx, ty in A's page points)
    const c = Math.cos(REGI.theta) * REGI.s, s = Math.sin(REGI.theta) * REGI.s;
    const T = [c, s, -s, c, REGI.tx, REGI.ty];
    const [cx, cy] = DATA.crop;
    S.M0 = mul(mul([1, 0, 0, 1, -cx, -cy], inv(T)), [1, 0, 0, 1, cx, cy]);
  }

  /* ---------- painting ---------- */
  function viewXf() {
    const r = D.svg.getBoundingClientRect();
    const vb = D.svg.viewBox.baseVal;
    const k = Math.min(r.width / vb.width, r.height / vb.height);
    return { cw: r.width, ch: r.height, k, ox: (r.width - vb.width * k) / 2 - vb.x * k, oy: (r.height - vb.height * k) / 2 - vb.y * k };
  }
  function layers() {
    const st = D.step, out = [], all = () => true, common = (bt) => bt.cls === "c";
    if (st === 1) {
      if (S.view === "a") out.push({ side: "a", pick: all, color: COL.n, alpha: 1 });
      else {
        if (S.bg) out.push({ side: "b", pick: (bt) => bt.grp === "bg", color: COL.bg, alpha: 1, m: S.M0 });
        out.push({ side: "b", pick: (bt) => bt.grp === "own", color: COL.own, alpha: 1, m: S.M0 });
      }
      return out;
    }
    if (st === 2) {
      out.push({ side: "a", pick: all, color: COL.a, alpha: 1, comp: "lighten" });
      out.push({ side: "b", pick: all, color: COL.b, alpha: 1, comp: "lighten", m: S.M });
      return out;
    }
    const op = { a: S.op.a / 100, b: S.op.b / 100, c: S.op.c / 100 };
    if (st >= 4) op.c = Math.min(op.c, 0.45);   // regions on top: the shared line work steps back
    const cls = S.diffOnly ? (bt) => bt.cls === "o" : all;
    if (st === 3 && S.mode === "swipe") {
      const L = [-1e6, S.split], R = [S.split, 1e6];
      out.push({ side: "a", pick: cls, color: COL.a, alpha: op.a, comp: "lighten", clip: L });
      out.push({ side: "b", pick: cls, color: COL.b, alpha: op.b, comp: "lighten", clip: R });
      if (!S.diffOnly) {
        out.push({ side: "a", pick: common, color: COL.c, alpha: op.c, clip: L });
        out.push({ side: "b", pick: common, color: COL.c, alpha: op.c, clip: R });
      }
      return out;
    }
    if (st === 3 && S.mode === "blink") {
      const s = S.blinkA ? "a" : "b";
      out.push({ side: s, pick: cls, color: COL[s], alpha: 1, comp: "lighten" });
      if (!S.diffOnly) out.push({ side: s, pick: common, color: COL.c, alpha: op.c });
      return out;
    }
    out.push({ side: "a", pick: cls, color: COL.a, alpha: op.a, comp: "lighten" });
    out.push({ side: "b", pick: cls, color: COL.b, alpha: op.b, comp: "lighten" });
    if (!S.diffOnly) {
      out.push({ side: "a", pick: common, color: COL.c, alpha: op.c });
      out.push({ side: "b", pick: common, color: COL.c, alpha: op.c });
    }
    return out;
  }
  function paint(L, base, k, vis) {
    if (L.alpha <= 0.004) return;
    ctx.setTransform(base[0], base[1], base[2], base[3], base[4], base[5]);
    ctx.save();
    if (L.clip) { ctx.beginPath(); ctx.rect(L.clip[0], -1e6, L.clip[1] - L.clip[0], 2e6); ctx.clip(); }
    let v = vis, sc = 1;
    if (L.m && !isId(L.m)) {
      ctx.transform(L.m[0], L.m[1], L.m[2], L.m[3], L.m[4], L.m[5]);
      const im = inv(L.m);
      const pts = [apply(im, vis[0], vis[1]), apply(im, vis[2], vis[1]), apply(im, vis[0], vis[3]), apply(im, vis[2], vis[3])];
      v = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
      sc = Math.sqrt(Math.abs(L.m[0] * L.m[3] - L.m[1] * L.m[2]));
    }
    ctx.globalCompositeOperation = L.comp || "source-over";
    ctx.strokeStyle = ctx.fillStyle = L.color;
    ctx.lineWidth = 1 / (k * sc);
    for (const bt of DATA.batches) {
      if (bt.side !== L.side || !L.pick(bt)) continue;
      const a = L.alpha * TONE[bt.kind + bt.tone];
      if (a <= 0.004) continue;
      ctx.globalAlpha = a;
      const f = bt.kind === "f";
      for (const t of bt.tiles) {
        if (t.x1 < v[0] || t.x0 > v[2] || t.y1 < v[1] || t.y0 > v[3]) continue;
        if (f) ctx.fill(t.p); else ctx.stroke(t.p);
      }
    }
    ctx.restore();
  }
  function draw() {
    if (!DATA || D.canvas.hidden) return;
    const V = viewXf();
    if (!V.cw || !V.ch) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(V.cw * dpr), H = Math.round(V.ch * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    const base = [V.k * dpr, 0, 0, V.k * dpr, V.ox * dpr, V.oy * dpr];
    const vis = [-V.ox / V.k, -V.oy / V.k, (V.cw - V.ox) / V.k, (V.ch - V.oy) / V.k];
    for (const L of layers()) paint(L, base, V.k, vis);
    overlays(V);
  }

  /* ---------- SVG overlays: region frames, numbered markers, caption, swipe handle ---------- */
  function buildRegions() {
    REG.forEach((r) => {
      r.box = D.el("rect", { class: "rb", x: r.x, y: r.y, width: r.w, height: r.h, "vector-effect": "non-scaling-stroke", "data-hit": "", "data-r": r.id }, gReg);
      r.mk = D.el("g", { class: "mk", "data-hit": "", "data-r": r.id }, gMk);
      D.el("circle", { r: 11 }, r.mk);
      D.el("text", { x: 0, y: 0.5 }, r.mk).textContent = r.n;
    });
  }
  function paintRegions() {
    const vis = new Set(filtered().map((r) => r.id));
    REG.forEach((r) => {
      const st = S.status[r.id] || "";
      const dim = D.step === 4 && !vis.has(r.id) ? " dim" : "";
      r.box.setAttribute("class", `rb${r.real ? "" : " muted"}${S.sel === r.id ? " sel" : ""}${dim}`);
      r.mk.setAttribute("class", `mk${r.real ? "" : " muted"}${st ? " " + st : ""}${S.sel === r.id ? " sel" : ""}${dim}`);
      r.mk.querySelector("text").textContent = st === "done" ? "✓" : r.n;
    });
    gReg.appendChild(gMk); // markers above frames
  }
  function overlays(V) {
    const s = 1 / V.k;
    const showReg = D.step >= 4;
    gReg.style.display = showReg ? "" : "none";
    if (showReg) REG.forEach((r) => r.mk.setAttribute("transform", `translate(${r.x + r.w} ${r.y}) scale(${s}) translate(-15 15)`));
    // caption of the selected region: its AI title, at the frame's top-right corner (as in the product)
    const r = showReg && S.sel ? REG.find((x) => x.id === S.sel) : null;
    if (r && answered(r) && r.title) {
      const sx = (r.x + r.w) * V.k + V.ox, sy = r.y * V.k + V.oy;
      if (sx < 40 || sx > V.cw + 200 || sy > V.ch || sy + r.h * V.k < 0) cap.hidden = true;
      else {
        cap.hidden = false;
        cap.className = "cap" + (r.real ? "" : " muted");
        cap.textContent = `${r.n}. ${r.title}`;
        cap.style.left = Math.min(sx, V.cw - 6) + "px";
        cap.style.top = Math.max(sy, 0) + "px";
        cap.style.transform = sy > 34 ? "translate(-100%, calc(-100% - 6px))" : "translate(-100%, 8px)";
      }
    } else cap.hidden = true;
    // swipe handle
    const sw = D.step === 3 && S.mode === "swipe";
    gSplit.style.display = sw ? "" : "none";
    if (sw) {
      [splitLine, splitHit].forEach((l) => { l.setAttribute("x1", S.split); l.setAttribute("x2", S.split); });
      const vb = D.svg.viewBox.baseVal;
      knob.setAttribute("transform", `translate(${S.split} ${vb.y + vb.height * 0.5}) scale(${s})`);
    }
  }

  /* ---------- registration ---------- */
  function deviation(M) {
    const m = M || ID;
    const pts = [[0, 0], [CW, 0], [0, CH], [CW, CH], [CW / 2, CH / 2]];
    return pts.reduce((a, [x, y]) => { const [u, v] = apply(m, x, y); return a + Math.hypot(u - x, v - y); }, 0) / pts.length;
  }
  const bScale = () => SCALE * REGI.s;                  // the scale B was really plotted at
  const shrink = () => (1 - 1 / REGI.s) * 100;          // how much smaller B is on paper, %
  function devHtml() {
    if (S.aligned) {
      return `<div class="dev ok" id="dev"><span>שגיאה שיורית אחרי היישור</span><b>${pxCm(REGI.residual_px).toFixed(1)} ס״מ</b></div>`;
    }
    const d = deviation(S.M);
    return `<div class="dev" id="dev"><span>סטייה ממוצעת בין השרטוטים<br><span class="mono">${(d * PT_CM).toFixed(1)} ס״מ על הגיליון</span></span><b>${(d * PT_M).toFixed(1)} מ׳</b></div>`;
  }
  function updateDev() { const e = $("dev"); if (e) e.outerHTML = devHtml(); }
  function setMode2() {
    const drag = D.step === 2 && !S.aligned && !S.anim;
    D.panLeft(!drag);
    document.body.classList.toggle("drag-b", drag);
  }
  function align() {
    if (S.anim) return;
    if (S.aligned) { // run it again from B as received
      S.aligned = false; S.M = S.M0.slice(); S.pipe = 1; S.moved = false;
      D.barMid("B: <b>AS RECEIVED</b>");
      setMode2(); renderSide(); req();
      D.cmd("SP_ALIGN RESET");
      D.hint("גררו את B (בכחול) כדי לנסות ליישר ידנית");
      return;
    }
    S.anim = true; S.pipe = 1;
    D.barMid("B: <b>ALIGNING…</b>");
    const from = (S.M || S.M0).slice();
    setMode2(); renderSide(); req();
    D.cmd("SP_ALIGN AUTO …");
    D.track("demo_action", { action: "align" });
    const dur = [380, 1400, 420, 460, 420, 300];
    let i = 0;
    const next = () => {
      if (!S.anim) return; // finished elsewhere (the visitor moved on)
      S.pipe = i + 1;
      if (S.pipe === 2) { // the alignment itself: B glides onto A
        const t0 = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / (dur[1] - 120));
          const e = ease(t);
          S.M = from.map((v, j) => v + (ID[j] - v) * e);
          req();
          if (t < 1 && S.anim) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      renderSide();
      if (i >= dur.length) return finishAlign(true);
      setTimeout(() => { i++; next(); }, dur[i]);
    };
    next();
  }
  function finishAlign(announce) {
    S.anim = false; S.aligned = true; S.M = null; S.pipe = PIPE.length;
    setMode2();
    if (D.step === 2) D.barMid("B: <b>ALIGNED</b>");
    if (announce) {
      D.cmd(`SP_ALIGN AUTO → S=${REGI.s.toFixed(4)} ROT=${REGI.theta_deg}° DX=${REGI.tx} DY=${REGI.ty} (${REGI.inliers}/${REGI.matches})`);
      D.toast(`B יושר על A. ה-PDF של B הודפס ב-1:${bScale().toFixed(0)} ולא ב-1:${SCALE}, ולכן המערכת הגדילה אותו פי ${REGI.s.toFixed(4)}.`);
      renderSide(); req();
    }
  }

  /* ---------- regions ---------- */
  const filtered = () => REG.filter((r) => (S.sev === "all" || (S.sev === "real") === r.real) && (!S.type || r.type === S.type));
  const answered = (r) => S.analysed || r.n <= S.done || S.forced.has(r.id);
  const size = (r) => `${(r.w * PT_M).toFixed(1)} × ${(r.h * PT_M).toFixed(1)} מ׳`;
  const where = (r) => `${r.loc} · ${r.ax}`;
  const discOf = (r) => (r.disc === "info" ? "info" : S.disc[r.id] || r.disc);
  function selectRegion(id, from) {
    const r = REG.find((x) => x.id === id);
    if (!r) return;
    S.sel = id;
    if (!answered(r)) S.forced.add(id);
    if (D.step === 5 && S.tableView) { S.tableView = false; D.table(null); }
    // frame the finding with some of the plan around it (at least ~14 m across), so it reads in context
    const pad = Math.max(0.35, (800 / Math.max(r.w, r.h) - 1) / 2);
    D.zoomTo(r.x, r.y, r.w, r.h, pad);
    D.cmd(`SP_REGION ${r.n} → ZOOM (${size(r).replace(" מ׳", " m")})`);
    D.barMid(`Region: <b>#${r.n}</b>`);
    D.track("demo_action", { action: "region_open", region: r.n, from });
    paintRegions(); renderSide(); req();
    // bring the card into view inside its list, without moving the page
    const card = D.sideEl.querySelector(`.rg[data-r="${id}"]`), list = card && card.parentElement;
    if (card && list) {
      if (from === "list" || from === "next") card.focus({ preventScroll: true });
      const top = card.offsetTop - list.offsetTop, bottom = top + card.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top - 4;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = Math.min(top - 4, bottom - list.clientHeight + 4);
    }
  }
  function setStatus(id, st) {
    const r = REG.find((x) => x.id === id);
    S.status[id] = S.status[id] === st ? undefined : st;
    if (!S.status[id]) delete S.status[id];
    D.cmd(`SP_MARK ${r.n} ${S.status[id] ? (st === "coord" ? "COORDINATE" : "RESOLVED") : "OPEN"}`);
    if (S.status[id]) D.toast(st === "coord" ? `ממצא ${r.n} נכנס לישיבת התיאום · אחריות: ${DISC[discOf(r)] || "—"}` : `ממצא ${r.n} סומן טופל`, 2000);
    D.track("demo_action", { action: "mark", status: S.status[id] || "open" });
    paintRegions(); renderSide(); updateKpi();
  }
  function setDisc(id, d) {
    const r = REG.find((x) => x.id === id);
    S.disc[id] = d;
    D.cmd(`SP_ASSIGN ${r.n} ${d.toUpperCase()}`);
    D.track("demo_action", { action: "assign", disc: d });
    renderSide();
  }
  function analyse() {
    if (S.analysed || S.analysing) return;
    S.analysing = true; S.done = 0;
    const tick = () => {
      if (!S.analysing) return;
      S.done++;
      S.fresh = REG[S.done - 1] && REG[S.done - 1].id;
      if (S.done >= REG.length) { S.analysing = false; S.analysed = true; }
      if (D.step === 4) { renderSide(); req(); }
      if (S.analysing) setTimeout(tick, 120);
      else S.fresh = null;
    };
    setTimeout(tick, 650);
  }

  /* ---------- side palette ---------- */
  function renderSide() {
    const st = D.step;
    const keep = D.sideEl.querySelector(".rgl");
    const scroll = keep ? keep.scrollTop : 0;
    let h = "";
    if (st === 1) h = side1();
    else if (st === 2) h = side2();
    else if (st === 3) h = side3();
    else if (st === 4) h = side4();
    else h = side5();
    D.side(h);
    const rgl = D.sideEl.querySelector(".rgl");
    if (rgl && keep) rgl.scrollTop = scroll;
    bindSide();
    legend();
  }
  const pct = (a, b) => Math.round((100 * a) / Math.max(1e-9, a + b));
  function side1() {
    const [aw, ah] = REGI.a_page, [bw, bh] = REGI.b_page;
    const cm = (v) => Math.round(v * PT_CM);
    const bgShare = pct(LEN.bbg, LEN.bown);
    return `<div class="hd"><h2>שני שרטוטים של אותה קומה</h2><p>A היא תוכנית האדריכלות בגרסה האחרונה. B היא תוכנית המיזוג של היועץ, עם הרקע האדריכלי שקיבל. אותה קומה, אבל גיליונות שונים, משרדים שונים וגרסאות שונות.</p></div>
    <div class="bd">
      <div class="slots">
        <button class="slot ${S.view === "a" ? "on" : ""}" type="button" data-view="a"><span class="row"><span class="tag a">A</span><b>שרטוט הבסיס</b></span><small>אדריכלות · תוכנית עבודה 1:${SCALE}</small><span class="mono">${cm(aw)}×${cm(ah)} ס״מ · כ־${thousands(CNT.a)} אלף קווים</span></button>
        <button class="slot ${S.view === "b" ? "on" : ""}" type="button" data-view="b"><span class="row"><span class="tag b">B</span><b>השרטוט לבדיקה</b></span><small>מיזוג אוויר ואוורור · 1:${SCALE} לפי הכותרת</small><span class="mono">${cm(bw)}×${cm(bh)} ס״מ · כ־${thousands(CNT.b)} אלף קווים</span></button>
      </div>
      ${S.view === "b" ? `
      <label class="toggle"><span>הצג את הרקע האדריכלי שבתוך B</span><input type="checkbox" id="bgB" ${S.bg ? "checked" : ""}></label>
      <div class="ai-box"><div class="row"><span class="badge">AI</span><span>${esc(DATA.reading_b.how_to_read)}</span></div>
        <div class="stats c2"><div><b>${bgShare}%</b><span>מהקווים ב-B: רקע אדריכלי (xref)</span></div><div><b>${100 - bgShare}%</b><span>תוכן היועץ (מיזוג)</span></div></div></div>
      <div class="note">היועץ מתכנן על <b>עותק</b> של האדריכלות. אם האדריכל שינה חדר או קיר אחרי שהעותק נשלח, התעלה, התריס או הפיר של היועץ כבר לא מתאימים. את זה ההשוואה מחפשת, ולא את התעלות עצמן: הן אמורות להיות רק ב-B.</div>`
      : `<div class="note">בחרו את <b>B</b> כדי לראות את תוכנית המיזוג. הגיליון שלה בגודל אחר ומוזז ביחס ל-A, כמו שקורה כמעט תמיד בין משרדים.</div>`}
      <div class="note">בדמו הוסרו מהשרטוטים טקסטים, מידות, כותרת וחותמות. ה-AI קרא את הגיליונות המלאים.</div>
    </div>${D.nav(null, 2, "ליישור אוטומטי")}`;
  }
  function side2() {
    const pipe = PIPE.map(([t, sub], i) => {
      const cls = i < S.pipe ? "done" : i === S.pipe && S.anim ? "run" : "";
      return `<li class="${cls}"><i class="ic"></i><span class="lb">${t}${cls ? `<small>${esc(sub())}</small>` : ""}</span></li>`;
    }).join("");
    const deg = REGI.theta_deg;
    const rotCm = Math.abs(Math.tan(REGI.theta)) * CW * PT_M * 100;   // the rotation over the plan's full length
    return `<div class="hd"><h2>יישור B על A</h2><p>${S.aligned ? "B יושב על A. המערכת מצאה לבד את קנה המידה, הסיבוב וההזזה, בלי לסמן נקודות." : "הגיליונות לא חופפים: B מוזז וקטן מעט. גררו את B (בכחול) ונסו ליישר ידנית, ואז תנו למערכת."}</p></div>
    <div class="bd">
      ${devHtml()}
      ${S.aligned ? `<div class="kv card">
        <div><span>קנה מידה</span><b class="mono ltr">×${REGI.s.toFixed(4)}</b></div>
        <div><span>קנה מידה בפועל של B</span><b class="mono ltr">1:${bScale().toFixed(1)}</b></div>
        <div><span>סיבוב</span><b class="mono ltr">${deg.toFixed(3)}°</b></div>
        <div><span>נקודות התאמה</span><b class="mono">${REGI.inliers}/${REGI.matches}</b></div>
        <div><span>הזזה X בגיליון</span><b class="mono ltr">${(REGI.tx * PT_CM).toFixed(1)} cm</b></div>
        <div><span>הזזה Y בגיליון</span><b class="mono ltr">${(REGI.ty * PT_CM).toFixed(1)} cm</b></div>
      </div>
      <div class="note">ה-PDF של B הודפס בהתאמה לגודל הדף ולא ב-1:${SCALE}: בפועל 1:${bScale().toFixed(1)}, קטן ב-${shrink().toFixed(1)}%. מי שמודד עליו בסרגל 1:${SCALE} יקרא 10 מ׳ כ-${(10 / REGI.s).toFixed(2)} מ׳. הסיבוב זניח: ${rotCm.toFixed(1)} ס״מ לאורך כל הקומה. התיקון המקומי (עד ${Math.round(pxCm(REGI.max_shift_px))} ס״מ) מסמן אזורים שבהם הרקע של B זז.</div>` : ""}
      <button class="btn ${S.aligned ? "" : "pri"}" type="button" id="alignBtn" ${S.anim ? "disabled" : ""}>${S.anim ? "מיישר…" : S.aligned ? "↺ החזר את B למצב המקורי" : "יישור אוטומטי"}</button>
      ${!S.aligned && S.moved && !S.anim ? `<div class="note">גם בהזזה מדויקת נשארת סטייה: B קטן מ-A ב-${shrink().toFixed(1)}% (הודפס ב-1:${bScale().toFixed(0)}), ואת זה אי אפשר לתקן בגרירה.</div>` : ""}
      <div class="lbl">תהליך ההשוואה</div>
      <ol class="pipe">${pipe}</ol>
    </div>${D.nav(1, 3, "לשכבת ההפרשים")}`;
  }
  function side3() {
    const vals = [S.op.a, S.op.b, S.op.c];
    const act = (p) => (p === "diff") === S.diffOnly && PRESETS[p].every((v, i) => v === vals[i]);
    const sl = (k, label, color) => `<label class="sl${S.op[k] === 0 ? " off" : ""}${k === "c" && S.diffOnly ? " off" : ""}"><span><i class="sw" style="background:${color}"></i>${label}</span><input type="range" min="0" max="100" value="${S.op[k]}" data-op="${k}" ${k === "c" && S.diffOnly ? "disabled" : ""} aria-label="שקיפות ${label}"><output>${S.op[k]}%</output></label>`;
    const matchA = pct(LEN.ac, LEN.ao), bgOnly = pct(LEN.bgo, LEN.bgc);
    return `<div class="hd"><h2>שכבת הפרשים</h2><p>מה שקיים רק ב-A באדום, רק ב-B בכחול, ומה ששני השרטוטים חולקים בבהיר. קו נחשב משותף כשהוא במרחק של עד כ־1 מ״מ בגיליון (${pxCm(REGI.tol_px).toFixed(1)} ס״מ בשטח).</p></div>
    <div class="bd">
      <div class="seg" role="group" aria-label="תצוגה">${[["all", "הכל"], ["diff", "רק הבדלים"], ["a", "A בלבד"], ["b", "B בלבד"]].map(([p, t]) => `<button type="button" data-preset="${p}" class="${act(p) ? "on" : ""}">${t}</button>`).join("")}</div>
      ${sl("a", "A", COL.a)}${sl("b", "B", COL.b)}${sl("c", "משותף", COL.c)}
      <div><div class="lbl" style="margin-bottom:6px">אופן ההשוואה</div>
      <div class="seg" role="group" aria-label="אופן ההשוואה">${[["layers", "שכבות"], ["swipe", "החלקה"], ["blink", "הבהוב"]].map(([m, t]) => `<button type="button" data-mode="${m}" class="${S.mode === m ? "on" : ""}">${t}</button>`).join("")}</div></div>
      ${S.mode === "swipe" ? `<div class="note">גררו את הקו הלבן על השרטוט: משמאל לו <b>A</b>, מימין לו <b>B</b>.</div>` : ""}
      ${S.mode === "blink" ? `<div class="note">השרטוטים מתחלפים כל ⅔ שנייה. מה שקופץ הוא מה שזז. עכשיו מוצג: <b id="blinkLbl">${S.blinkA ? "A" : "B"}</b>.</div>` : ""}
      <div class="lbl">מה ההבדלים אומרים</div>
      <div class="stats c2"><div><b>${matchA}%</b><span>מהקווים של A נמצאים גם ב-B</span></div><div><b>${bgOnly}%</b><span>מקווי הרקע האדריכלי של B לא נמצאים ב-A</span></div></div>
      <div class="note">רוב האדום והכחול צפוי: ב-A יש ריהוט, ריצוף וקווים של יועצים אחרים, ו-B מוסיף תעלות, תריסים וכיתובים. מה שלא צפוי הוא שהרקע האדריכלי של B שונה מ-A: היועץ עבד על גרסה קודמת, ושם צריך לחפש.</div>
    </div>${D.nav(2, 4, "לממצאי התיאום")}`;
  }
  function side4() {
    const real = REG.filter((r) => r.real).length, none = REG.length - real, high = REG.filter((r) => r.sev === "high").length;
    const list = filtered();
    const types = {};
    REG.forEach((r) => { types[r.type] = (types[r.type] || 0) + 1; });
    const status = S.analysing
      ? `<div class="ai-box"><div class="row"><span class="badge">AI</span><span>קורא כל אזור בשני הגיליונות המלאים · <b>${S.done}</b> מתוך ${REG.length}</span></div><div class="bar"><i style="width:${Math.max(4, (S.done / REG.length) * 100)}%"></i></div></div>`
      : `<div class="ai-box done"><div class="row"><span class="ok">✓</span><span>הניתוח הושלם: <b>${real}</b> ממצאי תיאום (${high} בחומרה גבוהה) · ${none} אזורים ללא משמעות תכנונית</span></div></div>`;
    return `<div class="hd"><h2>ממצאי תיאום <span class="mono" style="color:var(--muted);font-size:13px;font-weight:400">(${REG.length} אזורים)</span></h2><p>ה-AI קרא כל אזור בשני הגיליונות, הפריד בין תוכן צפוי של היועץ לבין ממצאי תיאום, וקבע חומרה וגורם אחראי. לחצו על ממצא ברשימה או על מספר בשרטוט ובדקו אותו. סמנו <b>לתיאום</b> (נכנס לישיבה) או <b>טופל</b>.</p></div>
    <div class="bd">
      ${status}
      <div class="seg" role="group" aria-label="חומרה">${[["all", `הכל ${REG.length}`], ["real", `ממצאים ${real}`], ["none", `ללא משמעות ${none}`]].map(([k, t]) => `<button type="button" data-sev="${k}" class="${S.sev === k ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="filt">${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<button type="button" data-type="${k}" class="${S.type === k ? "on" : ""}">${esc(TYPE[k] || k)} · ${n}</button>`).join("")}</div>
      <div class="rgl">${list.length ? list.map(card).join("") : `<div class="note">אין אזורים שמתאימים לסינון.</div>`}</div>
    </div>${D.nav(3, 5, "לדוח התיאום")}`;
  }
  const causeShort = (c) => c.replace(/ ב-A$/, "");
  function chips(r) {
    return `<div class="chips"><span class="chip">${esc(TYPE[r.type] || r.type)}</span>${r.real && r.disc !== "info" ? `<span class="chip who">${esc(DISC[discOf(r)] || "")}</span>` : ""}${r.cause ? `<span class="chip cause">${esc(causeShort(r.cause))}</span>` : ""}</div>`;
  }
  function card(r) {
    const pc = (v) => Math.round((100 * v) / Math.max(1, r.a_only + r.b_only + r.common));
    const on = S.sel === r.id, st = S.status[r.id], ok = answered(r);
    const pill = st ? `<span class="pill ${st === "done" ? "ok" : "warn"}">${STATUS[st]}</span>` : "";
    const sev = !ok ? "" : r.real ? `<span class="sev ${esc(r.sev)}">${SEV[r.sev]}</span>` : `<span class="sev none">ללא משמעות</span>`;
    const head = `<div class="top"><span class="idx">${r.n}</span>${sev}<span class="size">${size(r)}</span>${pill}</div>`;
    if (!ok) return `<div class="rg" data-r="${r.id}" tabindex="0">${head}<div class="skel"><i></i><i></i></div></div>`;
    let body = `<div class="t">${esc(r.title)}</div><div class="loc">${esc(where(r))}</div>${chips(r)}`;
    if (on) {
      const canAssign = r.real && r.disc !== "info";
      body += `<div class="sum"><span class="badge">AI</span><span>${esc(r.summary)}</span></div>
      ${r.action ? `<div class="need"><b>נדרש</b><span>${esc(r.action)}</span></div>` : ""}
      <div class="lens">הקווים באזור: <span class="mono">${pc(r.a_only)}%</span> רק ב-A · <span class="mono">${pc(r.b_only)}%</span> רק ב-B · <span class="mono">${pc(r.common)}%</span> משותף</div>
      ${canAssign ? `<div class="assign"><span>אחריות</span><div class="seg" role="group" aria-label="גורם אחראי">${["hvac", "arch", "both"].map((d) => `<button type="button" data-disc="${d}" class="${discOf(r) === d ? "on" : ""}">${DISC_SHORT[d]}</button>`).join("")}</div></div>` : ""}
      <div class="acts">${r.real ? `<button class="btn sm st-coord ${st === "coord" ? "on" : ""}" type="button" data-st="coord">⚑ לתיאום</button><button class="btn sm st-done ${st === "done" ? "on" : ""}" type="button" data-st="done">✓ טופל</button>` : ""}<button class="btn sm ghost nx" type="button" data-next>הבא ←</button></div>`;
    }
    return `<div class="rg${on ? " on" : ""}${r.real ? "" : " muted"}${S.fresh === r.id ? " fresh" : ""}" data-r="${r.id}" tabindex="0">${head}${body}</div>`;
  }
  // general remarks for the meeting's minutes, from the registration and the line statistics
  const generalNotes = () => [
    `הרקע האדריכלי ב-B ישן: ${pct(LEN.bgo, LEN.bgc)}% מקווי הרקע לא נמצאים ב-A. לעדכן את ה-xref לפני הסבב הבא.`,
    `ה-PDF של B הודפס ב-1:${bScale().toFixed(0)} ולא ב-1:${SCALE} (קטן ב-${shrink().toFixed(1)}%). לא למדוד עליו בסרגל.`,
  ];
  function side5() {
    const reals = REG.filter((r) => r.real), none = REG.length - reals.length;
    const nCoord = REG.filter((r) => S.status[r.id] === "coord").length, nDone = REG.filter((r) => S.status[r.id] === "done").length;
    const open = reals.filter((r) => !S.status[r.id]).length;
    const byDisc = {};
    reals.forEach((r) => { const d = discOf(r); byDisc[d] = (byDisc[d] || 0) + 1; });
    const max = Math.max(1, ...Object.values(byDisc));
    const caused = reals.filter((r) => r.cause);
    return `<div class="hd"><h2>דוח לישיבת התיאום</h2><p>הממצאים המהותיים: מה נמצא, מה נדרש, מי אחראי ואיזה סטטוס סימנתם. מוכן להדבקה בפרוטוקול.</p></div>
    <div class="bd">
      <div class="stats c3"><div><b>${reals.length}</b><span>ממצאים</span></div><div><b>${nCoord}</b><span>לתיאום</span></div><div><b>${nDone}</b><span>טופלו</span></div></div>
      <div class="lbl">לפי גורם אחראי</div>
      <div class="typebars">${["hvac", "arch", "both", "info"].filter((d) => byDisc[d]).map((d) => `<div><span>${esc(DISC[d])}</span><i style="width:${(byDisc[d] / max) * 100}%"></i><span class="mono">${byDisc[d]}</span></div>`).join("")}</div>
      ${caused.length ? `<div class="note"><b>${caused.length} מתוך ${reals.length}</b> הממצאים נובעים משינוי אחד: ${esc(caused[0].cause)}. B עדיין מתכנן לחדרים שבוטלו יניקה, תעלות ופירים, ולחדרים שבאו במקומם אין תכנון.</div>` : ""}
      <div class="lbl">הערות כלליות לפרוטוקול</div>
      <ol class="gen">${generalNotes().map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
      <label class="toggle"><span>לכלול בדוח ${none} אזורים ללא משמעות</span><input type="checkbox" id="withNoise" ${S.withNoise ? "checked" : ""}></label>
      ${open ? `<div class="note"><b>${open}</b> ממצאים עוד בלי סטטוס. לחצו על שורה בטבלה כדי לפתוח אותה על השרטוט.</div>` : `<div class="note">לכל הממצאים יש סטטוס.</div>`}
      <div class="row"><button class="btn pri" type="button" id="copyXls">העתק לאקסל</button><button class="btn" type="button" id="dlCsv">הורדת CSV</button><button class="btn" type="button" id="viewToggle">${S.tableView ? "הצג על השרטוט" : "הצג טבלה"}</button></div>
      ${D.cta("רוצים את זה על השרטוטים שלכם?", "נריץ השוואה על זוג גיליונות אמיתי מהפרויקט שלכם ונעבור יחד על הממצאים.")}
    </div>${D.nav(4, null)}`;
  }
  function reportRows() {
    return REG.filter((r) => r.real || S.withNoise).map((r) => ({
      r, n: r.n, loc: where(r), type: TYPE[r.type] || r.type, sev: r.real ? SEV[r.sev] : "ללא משמעות",
      title: r.title, summary: r.summary, action: r.action || "—", disc: r.real ? DISC[discOf(r)] || "" : "—",
      status: !r.real ? "—" : STATUS[S.status[r.id]] || "פתוח",
    }));
  }
  function reportHtml() {
    const rows = reportRows(), reals = REG.filter((r) => r.real);
    return `<table><thead><tr><th class="num">#</th><th>מיקום</th><th>ממצא</th><th>נדרש</th><th>חומרה</th><th>אחריות</th><th>סטטוס</th></tr></thead><tbody>${rows.map((x) => `
      <tr data-r="${x.r.id}" class="${x.r.real ? "" : "muted"}"><td class="num">${x.n}</td><td class="loc">${esc(x.loc)}</td><td class="ttl"><b>${esc(x.title)}</b><small>${esc(x.summary)}</small></td><td class="wrap">${esc(x.action)}</td><td>${x.r.real ? `<span class="sev ${esc(x.r.sev)}">${esc(x.sev)}</span>` : esc(x.sev)}</td><td>${esc(x.disc)}</td><td>${!x.r.real ? "—" : S.status[x.r.id] ? `<span class="pill ${S.status[x.r.id] === "done" ? "ok" : "warn"}">${esc(x.status)}</span>` : `<span class="pill">פתוח</span>`}</td></tr>`).join("")}
      <tr class="tot"><td colspan="7">${reals.length} ממצאים · ${reals.filter((r) => r.sev === "high").length} בחומרה גבוהה · ${REG.filter((r) => S.status[r.id] === "coord").length} לתיאום · ${REG.filter((r) => S.status[r.id] === "done").length} טופלו${S.withNoise ? "" : ` · ${REG.length - reals.length} אזורים ללא משמעות לא נכללו`}</td></tr></tbody></table>`;
  }
  const HEAD = ["מס'", "מיקום", "סוג", "חומרה", "ממצא", "הסבר", "נדרש", "אחריות", "סטטוס"];
  const cells = (x) => [x.n, x.loc, x.type, x.sev, x.title, x.summary, x.action, x.disc, x.status];
  const tsv = () => {
    const clean = (s) => String(s).replace(/[\t\n]+/g, " ").replace(/״/g, '"');
    const lines = [HEAD.join("\t"), ...reportRows().map((x) => cells(x).map(clean).join("\t")), "", "הערות כלליות"];
    generalNotes().forEach((t, i) => lines.push(`${i + 1}\t${clean(t)}`));
    return lines.join("\n");
  };
  const csv = () => {
    const q = (s) => `"${String(s).replace(/"/g, '""').replace(/\n+/g, " ")}"`;
    const lines = [HEAD.map(q).join(","), ...reportRows().map((x) => cells(x).map(q).join(",")), "", q("הערות כלליות")];
    generalNotes().forEach((t, i) => lines.push(`${i + 1},${q(t)}`));
    return lines.join("\r\n");
  };
  function downloadCsv() {
    const blob = new Blob(["﻿" + csv()], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "coordination_A_vs_B.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    D.toast("הקובץ הורד: coordination_A_vs_B.csv");
  }

  function bindSide() {
    const side = D.sideEl, st = D.step;
    if (st === 1) {
      side.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => {
        S.view = b.dataset.view;
        D.cmd(S.view === "a" ? "SP_SHOW A (ARCH)" : "SP_SHOW B (HVAC) AS RECEIVED");
        D.barMid(`Sheet: <b>${S.view === "a" ? "A · ARCH" : "B · HVAC"}</b>`);
        if (D.file) D.file(S.view === "a" ? "A_ARCH.pdf" : "B_HVAC.pdf");
        D.track("demo_action", { action: "view_" + S.view });
        renderSide(); req();
      }));
      const bg = $("bgB");
      if (bg) bg.onchange = () => { S.bg = bg.checked; D.cmd(`SP_LAYERS B BACKGROUND=${S.bg ? "ON" : "OFF"}`); req(); legend(); };
    }
    if (st === 2) $("alignBtn").onclick = align;
    if (st === 3) {
      side.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => {
        const p = b.dataset.preset;
        [S.op.a, S.op.b, S.op.c] = PRESETS[p];
        S.diffOnly = p === "diff";
        D.cmd(`SP_LAYERS PRESET=${p.toUpperCase()}`);
        D.track("demo_action", { action: "preset_" + p });
        renderSide(); req();
      }));
      side.querySelectorAll("[data-op]").forEach((inp) => {
        inp.oninput = () => {
          S.op[inp.dataset.op] = +inp.value;
          inp.nextElementSibling.textContent = inp.value + "%";
          inp.parentElement.classList.toggle("off", +inp.value === 0);
          D.cmd(`SP_LAYERS A=${S.op.a} B=${S.op.b} COMMON=${S.op.c}`);
          const vals = [S.op.a, S.op.b, S.op.c];
          side.querySelectorAll("[data-preset]").forEach((b) => { const p = b.dataset.preset; b.classList.toggle("on", (p === "diff") === S.diffOnly && PRESETS[p].every((v, i) => v === vals[i])); });
          req();
        };
      });
      side.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    }
    if (st === 4) {
      side.querySelectorAll("[data-sev]").forEach((b) => (b.onclick = () => { S.sev = b.dataset.sev; D.cmd(`SP_REGIONS FILTER SEVERITY=${S.sev.toUpperCase()}`); paintRegions(); renderSide(); }));
      side.querySelectorAll("[data-type]").forEach((b) => (b.onclick = () => {
        S.type = S.type === b.dataset.type ? null : b.dataset.type;
        D.cmd(`SP_REGIONS FILTER TYPE=${S.type || "ALL"}`);
        D.track("demo_action", { action: "filter" });
        paintRegions(); renderSide();
      }));
      side.querySelectorAll(".rg").forEach((c) => {
        c.onclick = (e) => {
          if (e.target.closest("button")) return;
          if (S.sel !== c.dataset.r) selectRegion(c.dataset.r, "list");
        };
        c.onkeydown = (e) => {
          if ((e.key === "Enter" || e.key === " ") && e.target === c) { e.preventDefault(); selectRegion(c.dataset.r, "list"); }
        };
      });
      side.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => setStatus(b.closest(".rg").dataset.r, b.dataset.st)));
      side.querySelectorAll("[data-disc]").forEach((b) => (b.onclick = () => setDisc(b.closest(".rg").dataset.r, b.dataset.disc)));
      side.querySelectorAll("[data-next]").forEach((b) => (b.onclick = () => {
        const list = filtered(), i = list.findIndex((r) => r.id === S.sel);
        const nx = list[(i + 1) % list.length];
        if (nx) selectRegion(nx.id, "next");
      }));
    }
    if (st === 5) {
      $("copyXls").onclick = () => { D.copy(tsv(), "הדוח הועתק. הדביקו בגיליון אקסל"); D.cmd("SP_REPORT EXPORT CLIPBOARD"); D.track("demo_export", { format: "clipboard" }); };
      $("dlCsv").onclick = () => { downloadCsv(); D.cmd("SP_REPORT EXPORT coordination_A_vs_B.csv"); D.track("demo_export", { format: "csv" }); };
      $("withNoise").onchange = (e) => {
        S.withNoise = e.target.checked;
        D.cmd(`SP_REPORT NOISE=${S.withNoise ? "INCLUDE" : "EXCLUDE"}`);
        if (S.tableView) { D.table(reportHtml()); bindTable(); }
      };
      $("viewToggle").onclick = () => {
        S.tableView = !S.tableView;
        D.table(S.tableView ? reportHtml() : null);
        if (S.tableView) bindTable(); else { D.fit(); req(); }
        renderSide();
      };
    }
  }
  function bindTable() {
    D.tableEl.querySelectorAll("tr[data-r]").forEach((tr) => (tr.onclick = () => selectRegion(tr.dataset.r, "table")));
  }
  function setMode(m) {
    S.mode = m;
    clearInterval(blinkT); blinkT = null;
    if (m === "swipe") {
      const vb = D.svg.viewBox.baseVal;
      S.split = Math.max(0, Math.min(CW, vb.x + vb.width / 2));
      D.hint("גררו את הקו: משמאל A, מימין B");
    }
    if (m === "blink") {
      S.blinkA = true;
      blinkT = setInterval(() => {
        S.blinkA = !S.blinkA;
        const l = $("blinkLbl");
        if (l) l.textContent = S.blinkA ? "A" : "B";
        D.barMid(`View: <b>BLINK ${S.blinkA ? "A" : "B"}</b>`);
        req();
      }, 660);
    }
    D.cmd(`SP_COMPARE MODE=${m.toUpperCase()}`);
    D.barMid(`View: <b>${m.toUpperCase()}</b>`);
    D.track("demo_action", { action: "mode_" + m });
    renderSide(); req();
  }
  function legend() {
    const st = D.step;
    if (st === 1) {
      D.legend(S.view === "a" ? [{ color: COL.n, label: "A · אדריכלות" }]
        : [{ color: COL.own, label: "B · תוכן היועץ (מיזוג)" }, ...(S.bg ? [{ color: COL.bg, label: "B · רקע אדריכלי (xref)" }] : [])]);
    } else if (st === 2) D.legend([{ color: COL.a, label: "A · אדריכלות" }, { color: COL.b, label: "B · מיזוג אוויר" }]);
    else D.legend([{ color: COL.a, label: "רק ב-A" }, { color: COL.b, label: "רק ב-B" }, { color: COL.c, label: "משותף" }, ...(st >= 4 ? [{ color: COL.reg, label: "ממצא" }, { color: "#7d8790", label: "ללא משמעות" }] : [])]);
  }
  function updateKpi() {
    D.kpi("regions", REG.length);
    D.kpi("real", REG.filter((r) => r.real).length);
    D.kpi("coord", REG.filter((r) => S.status[r.id] === "coord").length);
    D.kpi("done", REG.filter((r) => S.status[r.id] === "done").length);
  }

  /* ---------- canvas interactions ---------- */
  D.svg.addEventListener("click", (e) => {
    const g = e.target.closest && e.target.closest("[data-r]");
    if (g && D.step >= 4) selectRegion(g.dataset.r, "canvas");
  });
  D.svg.addEventListener("pointerdown", (e) => {
    if (D.step === 3 && S.mode === "swipe" && e.target.closest && e.target.closest("g[data-hit]") === gSplit) {
      S.splitDrag = e.pointerId;
      D.svg.setPointerCapture(e.pointerId);
      e.stopPropagation();
      return;
    }
    if (D.step !== 2 || S.aligned || S.anim || e.button !== 0) return;
    if (S.dragB) { S.dragB = null; return; } // a second finger: leave the pinch to the shell
    S.dragB = { id: e.pointerId, p: D.pt(e) };
    D.svg.setPointerCapture(e.pointerId);
  });
  D.svg.addEventListener("pointermove", (e) => {
    if (S.splitDrag === e.pointerId) { S.split = Math.max(-200, Math.min(CW + 200, D.pt(e).x)); req(); return; }
    if (!S.dragB || S.dragB.id !== e.pointerId) return;
    const p = D.pt(e);
    if (!S.M) S.M = S.M0.slice();
    S.M[4] += p.x - S.dragB.p.x;
    S.M[5] += p.y - S.dragB.p.y;
    S.dragB.p = p;
    if (!S.moved) { S.moved = true; renderSide(); D.track("demo_action", { action: "drag_b" }); }
    updateDev();
    req();
  });
  const endDrag = (e) => {
    if (S.splitDrag === e.pointerId) { S.splitDrag = null; D.cmd(`SP_COMPARE MODE=SWIPE X=${(S.split * PT_M).toFixed(1)}m`); }
    if (S.dragB && S.dragB.id === e.pointerId) {
      S.dragB = null;
      const d = deviation(S.M);
      D.cmd(`MOVE B → DEVIATION ${(d * PT_M).toFixed(2)} m`);
    }
  };
  D.svg.addEventListener("pointerup", endDrag);
  D.svg.addEventListener("pointercancel", endDrag);

  /* ---------- steps ---------- */
  function onStep(n, _D, prev) {
    if (!DATA) return;
    $("d-hint").classList.remove("show");
    if (n !== 3) { clearInterval(blinkT); blinkT = null; S.mode = "layers"; }
    if (n >= 3 && !S.aligned) finishAlign(false);
    if (n === 2 && !S.aligned && !S.anim && !S.M) S.M = S.M0.slice();
    setMode2();
    if (n !== 4 && S.analysing) { S.analysing = false; S.analysed = true; S.fresh = null; }
    if (n === 4) analyse();
    if (n === 5) { S.tableView = true; D.table(reportHtml()); bindTable(); }
    else D.table(null);
    if (n <= 3 || (n === 4 && !S.sel && prev !== 5)) D.fit();
    if (D.file) D.file(n === 1 ? (S.view === "a" ? "A_ARCH.pdf" : "B_HVAC.pdf") : "A_ARCH.pdf + B_HVAC.pdf");
    D.barMid(n === 1 ? `Sheet: <b>${S.view === "a" ? "A · ARCH" : "B · HVAC"}</b>`
      : n === 2 ? `B: <b>${S.aligned ? "ALIGNED" : "AS RECEIVED"}</b>`
      : n === 3 ? `View: <b>${S.mode.toUpperCase()}</b>`
      : `Region: <b>${S.sel ? "#" + REG.find((r) => r.id === S.sel).n : "—"}</b>`);
    paintRegions(); renderSide(); updateKpi(); req();
    if (n === 2 && !S.aligned) D.hint("גררו את B (בכחול) כדי לנסות ליישר ידנית", 3000);
    if (n === 4 && !S.sel) D.hint("לחצו על מספר בשרטוט או על ממצא ברשימה", 2800);
  }

  /* ---------- load ---------- */
  D.side(`<div class="hd"><h2>טוען שרטוטים…</h2><p>שני גיליונות, כ־${fmt(350000)} נקודות.</p></div>`);
  Promise.all([
    fetch(BASE + "data.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(BASE + "data.bin").then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
  ]).then(([j, b]) => {
    DATA = j;
    BIN = new Uint8Array(b);
    decode();
    buildRegions();
    D.ready();
  }).catch(() => {
    D.side(`<div class="hd"><h2>טעינת השרטוטים נכשלה</h2><p>רעננו את הדף ונסו שוב.</p></div>`);
  });
})();
