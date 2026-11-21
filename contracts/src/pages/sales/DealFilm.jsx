import React, { useEffect, useState } from "react";
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

export default function DealFilm({ id, project }) {
  const path = `sales/deal-film?id=${id}`;
  const { data, setData } = useApi(path);
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
    const r = await run(() => api(path, { method: "POST", body }), ok);
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
      r = await run(() => api(path, { method: "POST", body: { action: "video_part", index: i, total, size: file.size, name: file.name, type, data } }), i === total - 1 ? "הסרטון הועלה" : null);
      if (!r) break;
    }
    setSent(null);
    setBusy("");
    if (r) setData(r);
  };

  const generate = (fix) => post(fix ? { action: "generate", failures: fix, script: film.script } : { action: "generate" },
    fix ? "התסריט תוקן" : "התסריט נכתב", "generate").then((r) => { if (r) setWatch((w) => w + 1); });

  if (!data) return <Card title="סרטון דמו"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>;

  const demoUrl = film?.hasDemo ? `/api/sales/deal-file?id=${id}&kind=demo&v=${film.demoV}` : null;
  const logoUrl = film?.hasLogo ? `/api/sales/deal-file?id=${id}&kind=logo&v=${film.logoV}` : null;
  const scenes = film?.script?.scenes || [];
  const videoUrl = film?.hasVideo ? `/api/sales/deal-file?id=${id}&kind=video&v=${film.videoV}` : null;

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
      {busy === "generate" && <p className="mt-2 text-sm text-muted-foreground">Claude קורא את קוד הדמו וכותב את התסריט. זה לוקח עד שתי דקות, אפשר להישאר בעמוד.</p>}

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
