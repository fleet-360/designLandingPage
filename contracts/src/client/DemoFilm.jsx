import React, { useCallback, useEffect, useRef, useState } from "react";
import { MousePointerClick, Pause, Play, RotateCcw } from "lucide-react";

// The demo film: the client's real demo plays inside a sandboxed frame, driven by the script Claude wrote
// (api/_lib/demo-film.js). The driver inside the frame moves the cursor and acts; this player sends it one
// action at a time, shows the scene's caption, moves the camera in and out, and lets the viewer pause,
// watch again, or try the demo themselves at the end. Nothing here is a video file.

const W = 1280;
const H = 720;
const INK = "#1c1a4f";
// the film plays faster than the demo's real pace, like a video at 1.5x: the demo's own clock runs at this
// speed inside the frame (api/_lib/demo-film.js), and the player's pauses shrink with it
export const SPEED = 1.5;
const INTRO_MS = 2600 / SPEED;
const CAMERA_MS = Math.round(900 / SPEED);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const label = (a) => `${a.do}${a.selector ? ` ${a.selector}` : ""}${a.text ? ` "${a.text}"` : ""}`;

// the camera: moves in on rect (frame pixels) by k, keeping the frame covered
function camera(rect, k) {
  if (!rect || k <= 1) return "translate(0px,0px) scale(1)";
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const tx = Math.min(0, Math.max(W - W * k, W / 2 - k * cx));
  const ty = Math.min(0, Math.max(H - H * k, H / 2 - k * cy));
  return `translate(${tx}px,${ty}px) scale(${k})`;
}

/**
 * demo: the demo's address (api/sales/deal-file kind=demo); logo: the client's logo or null
 * script: { scenes: [{ caption, actions }] }
 * onDone(failures): after a full run, with the actions that could not play (the sales preview shows them)
 * autoplay: start when half of the player is in view (the client page); otherwise on the play button
 */
export default function DemoFilm({ demo, logo, script, title, autoplay = true, onDone, className = "" }) {
  const box = useRef(null);
  const frame = useRef(null);
  const [scale, setScale] = useState(0);
  const [run, setRun] = useState(0);              // remounts the frame for each viewing
  const [phase, setPhase] = useState("poster");   // poster | intro | playing | end | free | failed
  const [scene, setScene] = useState(-1);
  const [step, setStep] = useState(0);            // the action within the scene, for the progress bar
  const [paused, setPaused] = useState(false);
  const [cam, setCam] = useState(camera(null, 1));
  const pausedRef = useRef(false);
  const ready = useRef(null);
  const pending = useRef(new Map());
  const token = useRef(0);
  const seq = useRef(0);
  const scenes = script?.scenes || [];

  // fit the 1280x720 stage to the width it gets
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // answers from the driver; only from this frame
  useEffect(() => {
    const on = (ev) => {
      const m = ev.data;
      if (!m || m.film !== 1 || ev.source !== frame.current?.contentWindow) return;
      if (m.ready) { ready.current?.(); return; }
      const p = pending.current.get(m.id);
      if (p) { pending.current.delete(m.id); p(m); }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  const send = useCallback((act) => new Promise((resolve) => {
    const id = ++seq.current;
    const limit = setTimeout(() => { pending.current.delete(id); resolve({ ok: false, error: "no answer" }); }, 12000 + (act.ms || 0));
    pending.current.set(id, (m) => { clearTimeout(limit); resolve(m); });
    frame.current?.contentWindow?.postMessage({ film: 1, id, act }, "*");
  }), []);

  const waitReady = useCallback(() => new Promise((resolve) => {
    const limit = setTimeout(() => { ready.current = null; resolve(false); }, 20000);
    ready.current = () => { clearTimeout(limit); ready.current = null; resolve(true); };
    // the frame may have loaded before we listened
    frame.current?.contentWindow?.postMessage({ film: 1, hello: true }, "*");
  }), []);

  const holdWhilePaused = async (t) => { while (pausedRef.current && token.current === t) await sleep(150); };

  const play = useCallback(async () => {
    const t = ++token.current;
    pausedRef.current = false;
    setPaused(false);
    setCam(camera(null, 1));
    setScene(-1);
    setPhase("intro");
    setRun((r) => r + 1);
    await sleep(50);
    const [ok] = await Promise.all([waitReady(), sleep(INTRO_MS)]);
    if (token.current !== t) return;
    if (!ok) { setPhase("failed"); onDone?.(["the demo did not load in the frame"]); return; }
    await send({ do: "speed", value: SPEED });
    setPhase("playing");
    const failures = [];
    for (let i = 0; i < scenes.length; i++) {
      setScene(i);
      setStep(0);
      for (let j = 0; j < scenes[i].actions.length; j++) {
        await holdWhilePaused(t);
        setStep(j);
        if (token.current !== t) return;
        const a = scenes[i].actions[j];
        if (a.do === "zoomOut") { setCam(camera(null, 1)); await sleep(CAMERA_MS); continue; }
        const r = await send(a);
        if (token.current !== t) return;
        if (!r.ok) { failures.push(`scene ${i + 1}, action ${j + 1} (${label(a)}): ${r.error}`); continue; }
        if (a.do === "zoom" && r.rect) { setCam(camera(r.rect, a.scale || 1.4)); await sleep(CAMERA_MS + 50); }
      }
      setStep(scenes[i].actions.length);
      await sleep((scenes[i].actions.length ? 500 : 2200) / SPEED);
    }
    if (token.current !== t) return;
    setCam(camera(null, 1));
    setPhase("end");
    onDone?.(failures);
  }, [scenes, send, waitReady, onDone]);

  // the client page: start once, when the viewer reaches the film
  useEffect(() => {
    if (!autoplay || phase !== "poster" || !box.current) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); play(); } }, { threshold: 0.5 });
    io.observe(box.current);
    return () => io.disconnect();
  }, [autoplay, phase, play]);

  useEffect(() => () => { token.current++; }, []);

  // a hidden tab stops the demo's animations (requestAnimationFrame) but not our clock: hold the film
  // while the tab is hidden, and go on where it stopped when the viewer comes back
  useEffect(() => {
    let held = false;
    const on = () => {
      if (document.hidden && !pausedRef.current) { held = true; pausedRef.current = true; setPaused(true); }
      else if (!document.hidden && held) { held = false; pausedRef.current = false; setPaused(false); }
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };
  const caption = phase === "playing" && scene >= 0 ? scenes[scene]?.caption : "";
  const progress = phase === "end" || phase === "free" ? scenes.length : Math.max(0, scene);

  return (
    <div className={className}>
      <div ref={box} className="relative w-full overflow-hidden rounded-2xl bg-[#0f0e2a] shadow-[0_24px_60px_-20px_rgba(28,26,79,.55)] ring-1 ring-black/10" style={{ aspectRatio: `${W} / ${H}` }}>
        {/* the stage, scaled to the box; the camera moves inside it */}
        {scale > 0 && phase !== "poster" && (
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }} dir="ltr">
            <div className="h-full w-full origin-top-left" style={{ transform: cam, transition: `transform ${CAMERA_MS}ms cubic-bezier(.45,.05,.25,1)` }}>
              {/* the demo is sandboxed by its own response header (Content-Security-Policy: sandbox allow-scripts,
                  api/_routes/sales/deal-file.js): it runs without an origin. A sandbox attribute here would add
                  nothing, and some embedded browsers refuse sandboxed frames outright. */}
              <iframe key={run} ref={frame} src={demo} title={title || "דמו"} loading="eager"
                className="block border-0 bg-white" style={{ width: W, height: H }} tabIndex={phase === "free" ? 0 : -1} />
            </div>
          </div>
        )}
        {/* while it plays the viewer watches; at the end they may take over */}
        {phase !== "free" && <div className="absolute inset-0" aria-hidden="true" />}

        {(phase === "poster" || phase === "intro") && (
          <Intro logo={logo} title={title} onPlay={phase === "poster" ? play : null} />
        )}

        {phase === "playing" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-4 pb-3 pt-10 sm:px-8 sm:pb-6">
            <p key={scene} className="pa-film-cap text-center text-[15px] font-bold leading-snug text-white sm:text-2xl" aria-live="polite">{caption}</p>
          </div>
        )}

        {phase === "playing" && logo && (
          <img src={logo} alt="" className="pointer-events-none absolute right-3 top-3 h-7 max-w-[28%] rounded-md bg-white/90 object-contain p-1 shadow sm:h-10" />
        )}

        {phase === "end" && (
          <div className="absolute inset-0 grid place-items-center bg-[#0f0e2a]/70 p-4 text-center backdrop-blur-[2px]">
            <div>
              {logo && <img src={logo} alt="" className="mx-auto mb-3 h-12 max-w-[55%] rounded-lg bg-white object-contain p-2 sm:h-16" />}
              {title && <p className="text-lg font-extrabold text-white sm:text-2xl">{title}</p>}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={play} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold" style={{ color: INK }}>
                  <RotateCcw className="h-4 w-4" />צפייה חוזרת
                </button>
                <button type="button" onClick={() => { send({ do: "speed", value: 1 }); setPhase("free"); }} className="inline-flex items-center gap-1.5 rounded-full border border-white/60 px-4 py-2 text-sm font-bold text-white">
                  <MousePointerClick className="h-4 w-4" />לנסות בעצמכם
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "failed" && (
          <div className="absolute inset-0 grid place-items-center bg-[#0f0e2a] p-4 text-center text-white/80">
            <div>
              <p>הדמו לא נטען</p>
              <button type="button" onClick={play} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold" style={{ color: INK }}><RotateCcw className="h-4 w-4" />לנסות שוב</button>
            </div>
          </div>
        )}
      </div>

      {/* the scenes as a progress bar, with pause and replay */}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={phase !== "playing"} onClick={togglePause} aria-label={paused ? "המשך" : "השהיה"}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#1c1a4f] shadow ring-1 ring-black/5 disabled:opacity-40">
          {paused || phase !== "playing" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {scenes.map((_, i) => (
            <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#d9d3c4]">
              <span className="block h-full rounded-full bg-[#2d2a8f] transition-[width] duration-700"
                style={{ width: i < progress ? "100%" : i === scene && phase === "playing" ? `${(100 * step) / Math.max(1, scenes[i].actions.length)}%` : "0%" }} />
            </span>
          ))}
        </div>
        {(phase === "end" || phase === "free" || phase === "playing") && (
          <button type="button" onClick={play} aria-label="מההתחלה" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#1c1a4f] hover:bg-white/70">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// A ready video a programmer recorded (uploaded instead of the film): plays muted when the viewer reaches
// it, like the film, with the usual controls.
export function VideoFilm({ video, logo, title, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); el.play().catch(() => {}); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [video]);
  return (
    <div className={`relative w-full overflow-hidden rounded-2xl bg-[#0f0e2a] shadow-[0_24px_60px_-20px_rgba(28,26,79,.55)] ring-1 ring-black/10 ${className}`}>
      <video ref={ref} src={video} controls muted playsInline preload="metadata" className="block aspect-video w-full bg-black" aria-label={title || "סרטון הדמו"} />
      {logo && <img src={logo} alt="" className="pointer-events-none absolute right-3 top-3 h-7 max-w-[28%] rounded-md bg-white/90 object-contain p-1 shadow sm:h-10" />}
    </div>
  );
}

function Intro({ logo, title, onPlay }) {
  return (
    <div className="pa-film-intro absolute inset-0 grid place-items-center bg-[radial-gradient(120%_90%_at_50%_10%,#2d2a8f_0%,#1c1a4f_55%,#0f0e2a_100%)] p-4 text-center">
      <div>
        <div className="flex items-center justify-center gap-3 sm:gap-5">
          {logo && <img src={logo} alt="" className="h-10 max-w-[38vw] rounded-lg bg-white object-contain p-1.5 sm:h-16 sm:p-2" />}
          {logo && <span className="text-xl font-light text-white/60 sm:text-3xl">×</span>}
          <img src="/assets/img/brand/logo-white-480.png" alt="Pro Algorithm" className="h-7 w-auto sm:h-11" />
        </div>
        {title && <p className="mt-4 text-lg font-extrabold text-white sm:mt-6 sm:text-3xl">{title}</p>}
        {onPlay ? (
          <button type="button" onClick={onPlay} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold sm:text-base" style={{ color: INK }}>
            <Play className="h-4 w-4 fill-current" />צפייה בדמו
          </button>
        ) : (
          <p className="mt-3 text-sm text-white/70 sm:text-base">ככה זה יעבוד אצלכם</p>
        )}
      </div>
    </div>
  );
}

// the client logos the site shows (assets/img/clients), with their Hebrew names
const CLIENTS = [
  ["idf", 'צה"ל'], ["mod", "משרד הביטחון"], ["rafael", "רפאל"], ["mafat", 'מפא"ת'], ["tau", "אוניברסיטת תל אביב"],
  ["bar-ilan", "אוניברסיטת בר-אילן"], ["acb", "התאחדות הקבלנים בוני הארץ"], ["pekerman", "פקרמן הנדסה ואדריכלות"],
  ["redmark", "רדמרק אדריכלות וניהול פרויקטים"], ["aspire-home", "אספייר הום"], ["mydesk", "myDESK"],
];

export function ClientsStrip() {
  return (
    <section aria-labelledby="clients-h" className="py-8">
      <h2 id="clients-h" className="mb-4 text-center text-sm font-bold tracking-wide text-[#5b5870]">בין לקוחותינו</h2>
      <div className="pa-marquee relative overflow-hidden" dir="ltr">
        <ul className="pa-marquee-track flex w-max items-center gap-10 sm:gap-14">
          {[...CLIENTS, ...CLIENTS].map(([key, name], i) => (
            <li key={`${key}-${i}`} aria-hidden={i >= CLIENTS.length || undefined} className="shrink-0">
              <img src={`/assets/img/clients/${key}.webp`} alt={i < CLIENTS.length ? name : ""} width="180" height="80"
                className="h-12 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0 sm:h-14" loading="lazy" decoding="async" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
