import React, { useEffect, useRef, useState } from "react";
import { Film, Loader2, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { api, fileToDataUrl } from "@/sales/lib";
import DemoFilm, { VideoFilm } from "../../client/DemoFilm.jsx";
import { Card, run, useApi } from "./AdminUi.jsx";

// The demo film on the client's order page (api/_routes/sales/deal-film.js): sales uploads the demo HTML and
// the client's logo, Claude writes the script, sales watches it here, fixes what did not play, edits the
// captions and publishes it. Until it is published the client sees nothing.

const MAX_GZ = 3.2 * 1024 * 1024;
// as in api/_lib/demo-film.js
const VIDEO_PART = 2.5 * 1024 * 1024;
const VIDEO_MAX = 60 * 1024 * 1024;
const VIDEO_TYPES = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

const toBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// the demo HTML, gzipped in the browser (a 3.6MB demo is about 2.6MB), as base64 for JSON
async function gzBase64(file) {
  const buf = await new Response(file.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  return buf.byteLength > MAX_GZ ? null : toBase64(buf);
}

function FilePick({ accept, label, busy, onFile }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent ${busy ? "pointer-events-none opacity-60" : ""}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{label}
      <input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </label>
  );
}

const n = (v) => Number(v || 0).toLocaleString("he-IL");

// while Claude writes the script (up to about two minutes): what it is doing now, a bar that fills slowly
// towards the end and never claims to be done, and the time so far
const STEPS = [
  [0, "קורא את קוד הדמו"],
  [12, "מאתר את המסכים, הכפתורים והשדות"],
  [30, "מתכנן את מהלך הסרטון"],
  [55, "כותב את הלחיצות וההקלדות לכל סצנה"],
  [80, "כותב כיתוב קצר לכל סצנה"],
  [105, "בודק שכל צעד מתאים לדמו"],
];
const EXPECT = 120;

export function Writing({ fix }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setT((Date.now() - start) / 1000), 250);
    return () => clearInterval(timer);
  }, []);
  const step = STEPS.filter(([at]) => t >= at).length - 1;
  // eases towards 95%: fast at first, then slower, and keeps creeping past the expected time
  const pct = Math.min(95, 95 * (1 - Math.exp(-t / (EXPECT / 2.2))));
  const sec = Math.floor(t);
  return (
    <div className="film-writing mt-4 overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.04] p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="film-orb relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{fix ? "Claude מתקן את התסריט" : "Claude כותב את הסרטון"}</p>
          <p key={step} className="film-step text-sm text-muted-foreground">{STEPS[step][1]}…</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground" dir="ltr">{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}</span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary/10">
        <div className="film-bar h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-3 flex gap-1.5" aria-hidden="true">
        {STEPS.map(([, label], i) => (
          <li key={label} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= step ? "bg-primary/60" : "bg-primary/10"}`} />
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        {t < EXPECT ? "בדרך כלל עד שתי דקות. אפשר להמשיך למלא את שאר הטופס בינתיים." : "לוקח קצת יותר מהרגיל, עוד רגע."}
      </p>
    </div>
  );
}

// what the scripts of this deal cost: the last request and the total
function Usage({ rows }) {
  const last = rows[rows.length - 1];
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const priced = rows.every((r) => r.usd != null);
  const usd = (v) => `$${v.toFixed(2)}`;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      בקשה אחרונה{last.fix ? " (תיקון)" : ""}: {n(last.input + last.cacheWrite + last.cacheRead)} טוקני קלט
      {last.cacheRead ? ` (${n(last.cacheRead)} מהמטמון)` : ""}, {n(last.output)} טוקני פלט{last.usd != null ? ` · ${usd(last.usd)}` : ""}.
      {rows.length > 1 && ` סה"כ לעסקה (${rows.length} בקשות): ${n(sum("input") + sum("cacheWrite") + sum("cacheRead"))} קלט, ${n(sum("output"))} פלט${priced ? ` · ${usd(sum("usd"))}` : ""}.`}
    </p>
  );
}

// id: a saved deal. Without it (the new-deal form) the film is a draft: the first upload creates it, onDraft
// gets its id, and creating the deal moves it into the deal (deals.js filmDraft). project/summary: the form's.
export default function DealFilm({ id, draft, onDraft, project, summary }) {
  // the draft id arrives with the first answer; a video upload already under way goes on with it
  const draftRef = useRef(draft || null);
  useEffect(() => { draftRef.current = draft || draftRef.current; }, [draft]);
  const where = () => (id ? `id=${id}` : `draft=${draftRef.current || "new"}`);
  const path = `sales/deal-film?${id ? `id=${id}` : `draft=${draft || "new"}`}`;
  const { data, setData } = useApi(path);
  const call = (body) => api(`sales/deal-film?${where()}`, { method: "POST", body: id ? body : { ...body, project, summary } }).then((r) => {
    if (!id && r?.draft && r.draft !== draftRef.current) { draftRef.current = r.draft; onDraft?.(r.draft); }
    return r;
  });
  const [busy, setBusy] = useState("");            // demo | logo | generate | save
  const [failures, setFailures] = useState(null);  // after watching the preview
  const [captions, setCaptions] = useState(null);  // editing
  const [json, setJson] = useState(null);          // editing the whole script
  const [watch, setWatch] = useState(0);           // remounts the preview
  const [sent, setSent] = useState(null);          // the video upload: parts sent of total
  const film = data?.film;
  useEffect(() => { setCaptions(null); setJson(null); setFailures(null); }, [film?.scriptAt, film?.demoV]);

  const post = async (body, ok, kind) => {
    setBusy(kind);
    const r = await run(() => call(body), ok);
    setBusy("");
    if (r) setData(r);
    return r;
  };

  const uploadDemo = async (file) => {
    if (!/\.html?$/i.test(file.name)) return run(() => Promise.reject({ code: "unsupported_file_type" }));
    setBusy("demo");
    const gz = await gzBase64(file).catch(() => null);
    setBusy("");
    if (!gz) return run(() => Promise.reject({ code: "too_large" }));
    await post({ action: "demo", name: file.name, gz }, "הדמו הועלה", "demo");
  };

  const uploadLogo = async (file) => {
    setBusy("logo");
    const up = await run(async () => api("sales/upload", { method: "POST", body: { name: file.name, data_url: await fileToDataUrl(file) } }));
    setBusy("");
    if (up) await post({ action: "logo", fileId: up.fileId }, "הלוגו נשמר", "logo");
  };

  // a ready video, in parts (a request takes up to 4.5MB), one after the other
  const uploadVideo = async (file) => {
    const type = file.type && Object.values(VIDEO_TYPES).includes(file.type) ? file.type : VIDEO_TYPES[file.name.split(".").pop().toLowerCase()];
    if (!type) return run(() => Promise.reject({ code: "unsupported_file_type" }));
    if (file.size > VIDEO_MAX) return run(() => Promise.reject({ code: "video_too_large" }));
    const total = Math.ceil(file.size / VIDEO_PART);
    setBusy("video");
    let r = null;
    for (let i = 0; i < total; i++) {
      setSent([i, total]);
      const data = toBase64(await file.slice(i * VIDEO_PART, Math.min(file.size, (i + 1) * VIDEO_PART)).arrayBuffer());
      r = await run(() => call({ action: "video_part", index: i, total, size: file.size, name: file.name, type, data }), i === total - 1 ? "הסרטון הועלה" : null);
      if (!r) break;
    }
    setSent(null);
    setBusy("");
    if (r) setData(r);
  };

  const [writingFix, setWritingFix] = useState(false);
  const generate = (fix) => {
    setWritingFix(Boolean(fix));
    return post(fix ? { action: "generate", failures: fix, script: film.script } : { action: "generate" },
      fix ? "התסריט תוקן" : "התסריט נכתב", "generate").then((r) => { if (r) setWatch((w) => w + 1); });
  };

  if (!data) return <Card title="סרטון דמו"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>;

  const fileUrl = (kind, v) => `/api/sales/deal-file?${where()}&kind=${kind}&v=${v}`;
  const demoUrl = film?.hasDemo ? fileUrl("demo", film.demoV) : null;
  const logoUrl = film?.hasLogo ? fileUrl("logo", film.logoV) : null;
  const scenes = film?.script?.scenes || [];
  const videoUrl = film?.hasVideo ? fileUrl("video", film.videoV) : null;

  return (
    <Card title="סרטון דמו בעמוד ההזמנה" actions={(film?.script || film?.hasVideo) && (
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={film.published} disabled={busy === "save"} onCheckedChange={(v) => post({ action: "save", published: v }, v ? "הסרטון מוצג ללקוח" : "הסרטון הוסתר", "save")} />
        מוצג ללקוח
      </label>
    )}>
      <p className="mb-3 text-sm text-muted-foreground">
        מעלים את קובץ ה-HTML של הדמו ואת הלוגו של הלקוח. Claude קורא את קוד הדמו וכותב תסריט: איפה ללחוץ, מה להקליד וכיתוב לכל סצנה.
        בעמוד ההזמנה הדמו האמיתי רץ לבד עם סמן וכיתובים, ומתחתיו הלוגואים של הלקוחות שלנו.
        אם המתכנת כבר הקליט סרטון, אפשר להעלות אותו במקום, והוא מוצג במקום הסרטון של Claude.
        {!id && " הסרטון נשמר עם העסקה, והלקוח רואה אותו כבר בכניסה הראשונה לקישור."}
      </p>
      {!data.configured && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">ANTHROPIC_API_KEY לא מוגדר בשרת, ולכן אי אפשר לכתוב תסריט.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <FilePick accept=".html,.htm,text/html" label={film?.hasDemo ? "החלפת הדמו" : "העלאת הדמו (HTML)"} busy={busy === "demo"} onFile={uploadDemo} />
        <FilePick accept="image/png,image/jpeg,image/webp" label={film?.hasLogo ? "החלפת הלוגו" : "לוגו הלקוח"} busy={busy === "logo"} onFile={uploadLogo} />
        {logoUrl && <img src={logoUrl} alt="" className="h-8 max-w-32 rounded border border-border bg-white object-contain p-0.5" />}
        {film?.hasDemo && (
          <Button size="sm" disabled={!data.configured || Boolean(busy)} onClick={() => generate(null)}>
            {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {film.script ? "תסריט חדש" : "יצירת הסרטון"}
          </Button>
        )}
        {film?.hasDemo && <Button size="sm" variant="ghost" className="text-destructive" disabled={Boolean(busy)} onClick={() => post({ action: "remove", what: "demo" }, "הדמו הוסר", "save")}><Trash2 className="h-4 w-4" />הסרת הדמו</Button>}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Film className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">סרטון מוכן</span>
          <FilePick accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov" label={film?.hasVideo ? "החלפת הסרטון" : "העלאת סרטון (MP4, עד 60MB)"} busy={busy === "video"} onFile={uploadVideo} />
          {film?.hasVideo && <Button size="sm" variant="ghost" className="text-destructive" disabled={Boolean(busy)} onClick={() => post({ action: "remove", what: "video" }, "הסרטון הוסר", "save")}><Trash2 className="h-4 w-4" />הסרת הסרטון</Button>}
        </div>
        {sent && <p className="mt-2 text-sm text-muted-foreground">מעלה… חלק {sent[0] + 1} מתוך {sent[1]}</p>}
        {film?.hasVideo && (
          <>
            <p className="mt-2 text-xs text-muted-foreground">{film.videoName} · {Math.round(film.videoSize / 1024 / 1024 * 10) / 10}MB · זה מה שהלקוח רואה{film.script ? " (במקום הסרטון של Claude)" : ""}</p>
            <VideoFilm key={film.videoV} video={videoUrl} logo={logoUrl} title={project} className="mt-3 max-w-3xl" />
          </>
        )}
      </div>
      {film?.hasDemo && <p className="mt-2 text-xs text-muted-foreground">{film.demoName}{film.demoSize ? ` · ${Math.round(film.demoSize / 1024)}KB` : ""}</p>}
      {film?.usage?.length > 0 && <Usage rows={film.usage} />}
      {busy === "generate" && <Writing fix={writingFix} />}

      {demoUrl && film.script && (
        <div className="mt-5">
          <DemoFilm key={`${watch}-${film.scriptAt}`} demo={demoUrl} logo={logoUrl} script={film.script} title={project} autoplay={false} onDone={setFailures} className="max-w-3xl" />
          {failures && (failures.length ? (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">{failures.length === 1 ? "פעולה אחת לא רצה בצפייה הזו" : `${failures.length} פעולות לא רצו בצפייה הזו`}</p>
              <ul className="mt-1 list-inside list-disc text-xs text-amber-900/80" dir="ltr">{failures.slice(0, 8).map((f) => <li key={f}>{f}</li>)}</ul>
              <Button size="sm" className="mt-2" disabled={!data.configured || Boolean(busy)} onClick={() => generate(failures)}>
                {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}תיקון עם Claude
              </Button>
            </div>
          ) : <p className="mt-3 text-sm text-emerald-700">כל הפעולות רצו.</p>)}
        </div>
      )}

      {film?.script && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">כיתובים ({scenes.length} סצנות)</p>
            {!captions && <Button size="sm" variant="ghost" onClick={() => setCaptions(scenes.map((x) => x.caption))}>עריכה</Button>}
          </div>
          {captions ? (
            <form className="space-y-2" onSubmit={async (e) => {
              e.preventDefault();
              const script = { scenes: scenes.map((x, i) => ({ ...x, caption: captions[i] })) };
              if (await post({ action: "save", script }, "הכיתובים נשמרו", "save")) setCaptions(null);
            }}>
              {captions.map((c, i) => (
                <div key={i} className="flex items-center gap-2"><span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                  <Input value={c} maxLength={140} onChange={(e) => setCaptions((cs) => cs.map((x, k) => (k === i ? e.target.value : x)))} /></div>
              ))}
              <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy === "save"}>שמירה</Button><Button type="button" size="sm" variant="ghost" onClick={() => setCaptions(null)}>ביטול</Button></div>
            </form>
          ) : (
            <ol className="list-inside list-decimal space-y-1 text-sm">{scenes.map((x, i) => <li key={i}>{x.caption}</li>)}</ol>
          )}
          <details className="text-sm" onToggle={(e) => setJson(e.currentTarget.open ? JSON.stringify(film.script, null, 2) : null)}>
            <summary className="cursor-pointer text-muted-foreground">התסריט המלא (JSON)</summary>
            {json !== null && (
              <form className="mt-2 space-y-2" onSubmit={async (e) => {
                e.preventDefault();
                let script;
                try { script = JSON.parse(json); } catch { return run(() => Promise.reject({ code: "bad_script" })); }
                await post({ action: "save", script }, "התסריט נשמר", "save");
              }}>
                <Textarea dir="ltr" rows={12} className="font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} />
                <Button type="submit" size="sm" variant="outline" disabled={busy === "save"}>שמירת התסריט</Button>
              </form>
            )}
          </details>
        </div>
      )}
    </Card>
  );
}
