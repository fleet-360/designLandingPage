/* Shared shell for the interactive product demos.
   Builds the page frame (top bar, ribbon of steps, CAD stage, side palette) from a config and hands the demo
   helpers for drawing, pan/zoom, the command line, toasts and analytics.

   const D = Demo({
     slug: "facades", plugin: "PA_FACADE", tag: "AutoCAD plug-in", title: "...", sub: "...",
     file: "SAMPLE.dwg", viewBox: [x, y, w, h], kpis: [{ id: "total", label: "פאנלים" }],
     steps: [{ t: "קריאת השרטוט", d: "שכבות וחתכים", cmd: "OPEN SAMPLE.dwg" }, ...],
     onStep(n, D) { ... render canvas + D.side(html) ... },
   });
*/
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function Demo(cfg) {
    const steps = cfg.steps || [];
    const D = { cfg, step: 0, esc, NS };
    let started = false;

    /* ---------- frame ---------- */
    document.body.classList.add("demo");
    const kpis = (cfg.kpis || []).map((k) => `<span>${esc(k.label)} <b id="kpi-${esc(k.id)}">—</b></span>`).join("");
    document.body.insertAdjacentHTML("afterbegin", `
<div class="d-wrap">
  <header class="d-top">
    <div class="d-top__main">
      <a class="d-back" href="/catalog/"><span aria-hidden="true">→</span> כל הדמואים</a>
      <span class="d-tag">${esc(cfg.tag || "Pro Algorithm · DEMO")}</span>
      <h1>${esc(cfg.title)}</h1>
      ${cfg.sub ? `<div class="d-sub">${esc(cfg.sub)}</div>` : ""}
    </div>
    <div class="d-top__side">
      ${kpis ? `<div class="d-kpi">${kpis}</div>` : ""}
      <a class="btn pri" href="/Contact?from=demo-${esc(cfg.slug)}" data-cta="top">רוצים את זה על השרטוטים שלכם?</a>
    </div>
  </header>
  <nav class="d-ribbon" aria-label="שלבי הדמו">
    ${cfg.plugin ? `<div class="d-ribbon__tab">${esc(cfg.plugin)}</div>` : ""}
    ${steps.map((s, i) => `<button class="d-step" data-step="${i + 1}" type="button"><span class="n">${i + 1}</span><span><span class="t">${esc(s.t)}</span>${s.d ? `<span class="d">${esc(s.d)}</span>` : ""}</span></button>`).join("")}
  </nav>
  <div class="d-ws">
    <section class="d-stage" aria-label="שרטוט">
      <div class="d-bar"><span><span id="d-file">${esc(cfg.file || "")}</span> · <b>Model</b></span><span id="d-bar-mid"></span><span id="d-coords">X 0 · Y 0</span></div>
      <div class="d-canvas${cfg.tall ? " tall" : ""}" id="d-canvas">
        <svg id="d-svg" xmlns="${NS}" ${cfg.viewBox ? `viewBox="${cfg.viewBox.join(" ")}"` : ""} preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(cfg.title)}"></svg>
        <div class="d-zoom" ${cfg.zoom === false ? "hidden" : ""}>
          <button type="button" data-zoom="in" aria-label="הגדלה">+</button>
          <button type="button" data-zoom="out" aria-label="הקטנה">−</button>
          <button type="button" data-zoom="fit" aria-label="התאמה למסך">⤢</button>
        </div>
        <div class="d-hint" id="d-hint"></div>
      </div>
      <div class="d-table" id="d-table" hidden></div>
      <div class="d-legend" id="d-legend"></div>
      <div class="d-cmd" id="d-cmd"><span class="p">Command:</span> </div>
    </section>
    <aside class="d-side" id="d-side" aria-live="polite"></aside>
  </div>
</div>
<div class="d-toast" id="d-toast" role="status" hidden></div>`);

    const $ = (id) => document.getElementById(id);
    D.svg = $("d-svg");
    D.canvas = $("d-canvas");
    D.tableEl = $("d-table");
    D.legendEl = $("d-legend");
    D.sideEl = $("d-side");

    /* ---------- small helpers ---------- */
    D.el = (tag, attrs = {}, parent = D.svg) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    };
    D.fmt = (n, d = 0) => Number(n).toLocaleString("he-IL", { minimumFractionDigits: d, maximumFractionDigits: d });
    D.money = (n) => "₪" + D.fmt(Math.round(n));
    D.cmd = (text) => { $("d-cmd").innerHTML = `<span class="p">Command:</span> ${esc(text)}`; };
    D.file = (name) => { $("d-file").textContent = name; };
    D.barMid = (html) => { $("d-bar-mid").innerHTML = html; };
    D.coords = (x, y) => { $("d-coords").textContent = `X ${Math.round(x)} · Y ${Math.round(y)}`; };
    D.kpi = (id, v) => { const e = $("kpi-" + id); if (e) e.textContent = v; };
    D.legend = (items) => {
      D.legendEl.innerHTML = (items || []).map((it) => `<div><i style="background:${it.color}"></i>${it.mono ? `<span class="mono">${esc(it.label)}</span>` : esc(it.label)}</div>`).join("");
    };
    D.table = (html) => {
      const show = html != null;
      D.tableEl.hidden = !show;
      D.canvas.hidden = show;
      D.legendEl.hidden = show;
      if (show) D.tableEl.innerHTML = html;
    };

    let toastT;
    D.toast = (msg, ms = 3400) => {
      const t = $("d-toast");
      t.textContent = msg;
      t.hidden = false;
      clearTimeout(toastT);
      toastT = setTimeout(() => (t.hidden = true), ms);
    };
    let hintT;
    D.hint = (msg, ms = 2600) => {
      const h = $("d-hint");
      h.textContent = msg;
      h.classList.add("show");
      clearTimeout(hintT);
      hintT = setTimeout(() => h.classList.remove("show"), ms);
    };
    D.copy = async (text, okMsg = "הועתק — הדביקו בגיליון אקסל") => {
      try { await navigator.clipboard.writeText(text); D.toast(okMsg); }
      catch { D.toast("ההעתקה נחסמה בדפדפן. סמנו את הטבלה ידנית והעתיקו."); }
    };

    /* side palette: header, body, footer with back/next */
    D.nav = (back, next, nextLabel = "לשלב הבא", nextDisabled = false) =>
      `<div class="ft">${back ? `<button class="btn" type="button" data-go="${back}">→ חזרה</button>` : "<span></span>"}${next ? `<button class="btn pri" type="button" data-go="${next}" ${nextDisabled ? "disabled" : ""}>${esc(nextLabel)} ←</button>` : ""}</div>`;
    D.side = (html) => {
      D.sideEl.innerHTML = html;
      D.sideEl.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => D.go(+b.dataset.go)));
      D.sideEl.querySelectorAll("[data-cta]").forEach((a) => a.addEventListener("click", () => D.track("demo_cta", { place: a.dataset.cta })));
    };
    D.cta = (title = "רוצים את זה על השרטוטים שלכם?", text = "נריץ את התוסף על פרויקט אמיתי שלכם ונראה את התוצאה יחד.") =>
      `<div class="d-cta"><b>${esc(title)}</b><p>${esc(text)}</p><a class="btn pri" href="/Contact?from=demo-${esc(cfg.slug)}" data-cta="end">קבעו הדגמה</a></div>`;

    /* ---------- analytics ---------- */
    D.track = (event, params = {}) => {
      try { window.gtag?.("event", event, { demo: cfg.slug, ...params }); } catch { /* blocked */ }
    };
    const markStart = () => {
      if (started) return;
      started = true;
      D.track("demo_start");
    };
    document.querySelectorAll("[data-cta]").forEach((a) => a.addEventListener("click", () => D.track("demo_cta", { place: a.dataset.cta })));

    /* ---------- steps ---------- */
    D.go = (n) => {
      const prev = D.step;
      D.step = n;
      document.querySelectorAll(".d-step").forEach((b) => {
        const s = +b.dataset.step;
        b.toggleAttribute("aria-current", false);
        if (s === n) b.setAttribute("aria-current", "step");
        b.classList.toggle("done", s < n);
      });
      const s = steps[n - 1] || {};
      if (s.cmd) D.cmd(s.cmd);
      cfg.onStep?.(n, D, prev);
      if (prev) {
        markStart();
        D.track("demo_step", { step: n, step_name: s.t });
        if (n === steps.length) {
          D.track("demo_complete");
          try { window.fbq?.("trackCustom", "DemoComplete", { demo: cfg.slug }); } catch { /* blocked */ }
        }
      }
    };
    document.querySelectorAll(".d-step").forEach((b) => (b.onclick = () => D.go(+b.dataset.step)));

    /* ---------- pan / zoom on the SVG viewBox ---------- */
    let home = cfg.viewBox ? [...cfg.viewBox] : null;
    let vb = home ? [...home] : null;
    let panLeft = cfg.panLeft !== false; // left-drag pans unless the demo needs it for a tool
    const viewListeners = [];
    D.onView = (fn) => viewListeners.push(fn); // called with [x, y, w, h] after every pan/zoom
    const applyVB = () => {
      if (!vb) return;
      D.svg.setAttribute("viewBox", vb.map((v) => +v.toFixed(2)).join(" "));
      viewListeners.forEach((fn) => fn(vb));
    };
    D.setView = (box, asHome = false) => { vb = [...box]; if (asHome) home = [...box]; applyVB(); };
    D.fit = () => { if (home) { vb = [...home]; applyVB(); } };
    D.panLeft = (on) => { panLeft = on; };
    D.pt = (e) => {
      const p = D.svg.createSVGPoint();
      p.x = e.clientX; p.y = e.clientY;
      return p.matrixTransform(D.svg.getScreenCTM().inverse());
    };
    const zoomAt = (px, py, s) => {
      if (!vb) return;
      const minW = home[2] / 25, maxW = home[2] * 1.6;
      const nw = Math.min(maxW, Math.max(minW, vb[2] * s));
      const k = nw / vb[2];
      vb = [px - (px - vb[0]) * k, py - (py - vb[1]) * k, vb[2] * k, vb[3] * k];
      applyVB();
    };
    D.zoomTo = (x, y, w, h, pad = 0.15) => {
      if (!home) return;
      const ar = home[3] / home[2];
      let W = w * (1 + pad * 2), H = h * (1 + pad * 2);
      if (H / W > ar) W = H / ar; else H = W * ar;
      vb = [x + w / 2 - W / 2, y + h / 2 - H / 2, W, H];
      applyVB();
    };
    D.canvas.querySelectorAll("[data-zoom]").forEach((b) => (b.onclick = () => {
      if (!vb) return;
      const z = b.dataset.zoom;
      if (z === "fit") D.fit();
      else zoomAt(vb[0] + vb[2] / 2, vb[1] + vb[3] / 2, z === "in" ? 1 / 1.4 : 1.4);
    }));
    D.svg.addEventListener("wheel", (e) => {
      if (!vb || cfg.zoom === false) return;
      e.preventDefault();
      const p = D.pt(e);
      zoomAt(p.x, p.y, e.deltaY > 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    const ptrs = new Map();
    let pan = null, pinch = null, spaceDown = false;
    D.dragged = false;
    addEventListener("keydown", (e) => { if (e.code === "Space" && e.target === document.body) { spaceDown = true; e.preventDefault(); } });
    addEventListener("keyup", (e) => { if (e.code === "Space") spaceDown = false; });
    D.svg.addEventListener("pointerdown", (e) => {
      if (!vb || cfg.zoom === false) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), vb: [...vb] };
        pan = null;
        return;
      }
      const wantPan = e.button === 1 || spaceDown || (panLeft && e.button === 0 && !e.target.closest?.("[data-hit]"));
      // capture the pointer only once it really moves (see pointermove), so a plain click still reaches its target
      if (wantPan) pan = { x: e.clientX, y: e.clientY, vb: [...vb], moved: false, id: e.pointerId };
    });
    D.svg.addEventListener("pointermove", (e) => {
      const p = D.pt(e);
      D.coords(p.x, cfg.flipY ? cfg.flipY - p.y : p.y);
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = D.svg.getBoundingClientRect();
        const cx = pinch.vb[0] + (((a.x + b.x) / 2 - r.left) / r.width) * pinch.vb[2];
        const cy = pinch.vb[1] + (((a.y + b.y) / 2 - r.top) / r.height) * pinch.vb[3];
        vb = [...pinch.vb];
        zoomAt(cx, cy, pinch.d / Math.max(d, 1));
        D.dragged = true;
        return;
      }
      if (!pan) return;
      const r = D.svg.getBoundingClientRect();
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 5) return;
      if (!pan.moved) { try { D.svg.setPointerCapture(pan.id); } catch { /* pointer already gone */ } }
      pan.moved = true;
      D.dragged = true;
      const s = Math.max(pan.vb[2] / r.width, pan.vb[3] / r.height);
      vb = [pan.vb[0] - dx * s, pan.vb[1] - dy * s, pan.vb[2], pan.vb[3]];
      applyVB();
    });
    const endPtr = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (pan) pan = null;
      if (D.dragged) setTimeout(() => (D.dragged = false), 0);
    };
    D.svg.addEventListener("pointerup", endPtr);
    D.svg.addEventListener("pointercancel", endPtr);
    // a pan or pinch must not also count as a click on whatever was under the cursor
    D.svg.addEventListener("click", (e) => { if (D.dragged) { e.stopPropagation(); e.preventDefault(); } }, true);
    D.svg.addEventListener("pointerdown", markStart, { once: true });

    D.ready = () => D.go(1);
    return D;
  }

  window.Demo = Demo;
})();
