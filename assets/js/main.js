(() => {
  const root = document.documentElement;
  const EN = window.I18N_EN || {};
  const HE_EXTRA = window.I18N_HE_EXTRA || {};
  const TITLES = {
    he: document.title,
    en: document.querySelector('meta[name="title-en"]')?.content || document.title
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
  };

  const track = (event, params = {}) => {
    try { window.gtag?.("event", event, params); } catch { /* blocked */ }
  };
  const pixel = (event, params) => {
    try { window.fbq?.("track", event, params); } catch { /* blocked */ }
  };

  /* ---------- i18n ---------- */

  const heCache = new Map();
  const attrCache = new Map();
  let lang = store.get("lang") === "en" ? "en" : "he";

  const t = (key) => (lang === "en" ? EN[key] : HE_EXTRA[key]) ?? key;

  const prose = document.querySelector("[data-prose]");
  const proseEn = document.querySelector("template[data-prose-en]");

  function applyLang(next) {
    lang = next;
    // static strings with a dictionary key
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (!heCache.has(el)) heCache.set(el, el.innerHTML);
      const val = next === "en" ? EN[key] : heCache.get(el);
      if (val != null) el.innerHTML = val;
    });
    // generated content carries its own English copy
    document.querySelectorAll("[data-en]").forEach((el) => {
      if (!heCache.has(el)) heCache.set(el, el.innerHTML);
      if (next === "en") el.textContent = el.dataset.en;
      else el.innerHTML = heCache.get(el);
    });
    document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(",").forEach((pair) => {
        const [attr, key] = pair.split(":");
        const id = attr + "|" + key;
        if (!attrCache.has(el)) attrCache.set(el, {});
        const cache = attrCache.get(el);
        if (!(id in cache)) cache[id] = el.getAttribute(attr);
        const val = next === "en" ? EN[key] : cache[id];
        if (val != null) el.setAttribute(attr, val);
      });
    });
    if (prose && proseEn) {
      if (!heCache.has(prose)) heCache.set(prose, prose.innerHTML);
      prose.innerHTML = next === "en" ? proseEn.innerHTML : heCache.get(prose);
    }
    root.lang = next;
    root.dir = next === "en" ? "ltr" : "rtl";
    document.title = TITLES[next];
    document.dispatchEvent(new CustomEvent("langchange", { detail: next }));
    document.querySelectorAll("[data-lang-toggle]").forEach((btn) => {
      btn.textContent = next === "en" ? "עב" : "EN";
      btn.setAttribute("aria-label", next === "en" ? "מעבר לעברית" : "Switch to English");
    });
  }

  if (lang === "en") applyLang("en");

  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches || root.classList.contains("a11y-motion");
  document.querySelectorAll("[data-lang-toggle]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const next = lang === "en" ? "he" : "en";
      store.set("lang", next);
      track("language_switch", { language: next });
      if (reduce()) return applyLang(next);
      root.classList.add("i18n-swap");
      setTimeout(() => {
        applyLang(next);
        requestAnimationFrame(() => root.classList.remove("i18n-swap"));
      }, 180);
    })
  );

  /* ---------- Header ---------- */

  const header = document.querySelector(".header");
  const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const menuBtn = document.querySelector(".menu-btn");
  const nav = document.getElementById("nav");
  if (menuBtn && nav) {
    const setMenu = (open) => {
      nav.classList.toggle("is-open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.innerHTML = open ? '<i class="ph ph-x" aria-hidden="true"></i>' : '<i class="ph ph-list" aria-hidden="true"></i>';
    };
    menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
    addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  }

  /* ---------- Reveal ---------- */

  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add("is-in");
      revealIO.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });

  document.querySelectorAll(".reveal").forEach((el) => {
    // stagger siblings inside the same grid
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
    const i = sibs.indexOf(el);
    if (i > 0) el.style.transitionDelay = Math.min(i * 60, 300) + "ms";
    revealIO.observe(el);
  });

  /* ---------- Floor-plan model (WebGL, loaded only where used) ---------- */

  const heroModel = document.querySelector('[data-model="hero"]');
  const pinModel = document.querySelector('[data-model="pin"]');
  const PIN_MODES = ["gnn", "qa", "reg", "bim"];
  let pinApi = null;
  let pinIndex = 0;

  if (heroModel || pinModel) {
    import("/assets/js/model.js").then(({ createModel }) => {
      if (heroModel) {
        const api = createModel(heroModel, { mode: "plan", auto: true });
        const btns = [...heroModel.querySelectorAll("[data-view]")];
        const show = (m) => {
          api?.setMode(m);
          btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === m)));
        };
        let touched = false;
        btns.forEach((b) => b.addEventListener("click", () => { touched = true; show(b.dataset.view); track("model_view", { view: b.dataset.view }); }));
        // the plan draws first, then rises into BIM
        setTimeout(() => { if (!touched) show("bim"); }, reduce() ? 0 : 2200);
      }
      if (pinModel) {
        pinApi = createModel(pinModel, { mode: PIN_MODES[pinIndex] });
      }
    }).catch(() => {
      [heroModel, pinModel].forEach((m) => m?.classList.add("model--fallback"));
    });
  }

  /* ---------- Construction pinned model ---------- */

  const caps = [...document.querySelectorAll("[data-cap]")];
  const layerOut = document.querySelector("[data-pin-layer]");
  if (caps.length) {
    const setActive = (idx) => {
      caps.forEach((c, i) => c.classList.toggle("is-active", i === idx));
      pinIndex = idx;
      pinApi?.setMode(PIN_MODES[idx]);
      if (layerOut) layerOut.textContent = caps[idx].dataset.layer || "";
    };
    const capIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setActive(+en.target.dataset.cap); });
    }, {
      // on narrow screens the sticky drawing covers the top of the viewport
      rootMargin: matchMedia("(max-width: 860px)").matches ? "-62% 0px -30% 0px" : "-45% 0px -45% 0px"
    });
    caps.forEach((c) => capIO.observe(c));
  }

  /* ---------- Products TOC ---------- */

  const tocLinks = [...document.querySelectorAll(".toc a")];
  if (tocLinks.length) {
    const byId = new Map(tocLinks.map((a) => [a.hash.slice(1), a]));
    const tocIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        tocLinks.forEach((a) => a.classList.remove("is-active"));
        byId.get(en.target.id)?.classList.add("is-active");
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    document.querySelectorAll(".product[id]").forEach((p) => tocIO.observe(p));
  }

  /* ---------- Podcast: load YouTube only on click ---------- */

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-yt]");
    if (!btn || btn.querySelector("iframe")) return;
    const id = btn.dataset.yt;
    const f = document.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    f.title = btn.getAttribute("aria-label") || "YouTube";
    f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    f.allowFullscreen = true;
    btn.append(f);
    track("video_play", { video_id: id });
  });

  /* ---------- Blog filter ---------- */

  const chips = [...document.querySelectorAll("[data-filter]")];
  if (chips.length) {
    const cards = [...document.querySelectorAll("[data-posts] .post-card")];
    chips.forEach((chip) => chip.addEventListener("click", () => {
      const f = chip.dataset.filter;
      chips.forEach((c) => {
        const on = c === chip;
        c.classList.toggle("is-on", on);
        c.setAttribute("aria-pressed", String(on));
      });
      cards.forEach((card) => { card.hidden = f !== "all" && card.dataset.cat !== f; });
    }));
  }

  /* ---------- Accessibility menu ---------- */

  const a11yBtn = document.querySelector("[data-a11y-toggle]");
  const a11yPanel = document.getElementById("a11y");
  const A11Y_MODES = ["contrast", "links", "readable", "motion"];
  const a11yState = (() => {
    try { return JSON.parse(store.get("a11y") || "{}"); } catch { return {}; }
  })();

  function applyA11y() {
    root.style.fontSize = a11yState.font ? `${100 + a11yState.font * 10}%` : "";
    A11Y_MODES.forEach((m) => {
      root.classList.toggle(`a11y-${m}`, !!a11yState[m]);
      a11yPanel?.querySelector(`[data-a11y="${m}"]`)?.setAttribute("aria-pressed", String(!!a11yState[m]));
    });
    store.set("a11y", JSON.stringify(a11yState));
  }
  applyA11y();

  if (a11yBtn && a11yPanel) {
    const setOpen = (open) => {
      a11yPanel.hidden = !open;
      a11yBtn.setAttribute("aria-expanded", String(open));
      if (open) a11yPanel.querySelector("button")?.focus();
    };
    a11yBtn.addEventListener("click", () => setOpen(a11yPanel.hidden));
    a11yPanel.querySelector("[data-a11y-close]").addEventListener("click", () => { setOpen(false); a11yBtn.focus(); });
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !a11yPanel.hidden) { setOpen(false); a11yBtn.focus(); } });
    a11yPanel.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a11y]");
      if (!b) return;
      const act = b.dataset.a11y;
      if (act === "font-up") a11yState.font = Math.min((a11yState.font || 0) + 1, 4);
      else if (act === "font-down") a11yState.font = Math.max((a11yState.font || 0) - 1, -1);
      else if (act === "reset") Object.keys(a11yState).forEach((k) => delete a11yState[k]);
      else a11yState[act] = !a11yState[act];
      applyA11y();
    });
  }

  /* ---------- Click tracking ---------- */

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-track]");
    if (!a) return;
    const kind = a.dataset.track;
    track("contact_click", { method: kind });
    pixel("Contact", { method: kind });
  });

  /* ---------- Contact form (Netlify Forms, mailto fallback) ---------- */

  document.querySelectorAll("[data-form]").forEach((form) => {
    const status = form.querySelector("[data-status]");
    const submit = form.querySelector('button[type="submit"]');
    const showErr = (name, msg) => {
      const input = form.elements[name];
      const slot = form.querySelector(`[data-err="${name}"]`);
      input.setAttribute("aria-invalid", msg ? "true" : "false");
      if (slot) slot.textContent = msg || "";
    };
    const mailto = (d) => {
      const body = [`Name: ${d.name}`, `Company: ${d.company}`, `Email: ${d.email}`, `Phone: ${d.phone}`, `Topic: ${d.topic}`, "", d.message].join("\n");
      location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent("Pro Algorithm | " + d.topic)}&body=${encodeURIComponent(body)}`;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const d = Object.fromEntries(fd);
      const nameOk = (d.name || "").trim().length > 1;
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((d.email || "").trim());
      showErr("name", nameOk ? "" : t("form.err.name"));
      showErr("email", emailOk ? "" : t("form.err.email"));
      if (!nameOk) return form.elements.name.focus();
      if (!emailOk) return form.elements.email.focus();

      submit.disabled = true;
      status.textContent = t("form.sending");
      try {
        const res = await fetch("/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(fd).toString()
        });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        status.textContent = t("form.done");
        track("generate_lead", { form: d.source, topic: d.topic });
        pixel("Lead", { content_category: d.topic });
      } catch {
        // not on Netlify (local preview or another host): hand off to the mail app
        status.textContent = t("form.ok");
        mailto(d);
      } finally {
        submit.disabled = false;
      }
    });
  });
})();
