import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2, Maximize2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { api, errorText } from "@/sales/lib";

// Picks the pages of the Canva spec that go into the contract as Appendix B. The PDF is read here in the
// browser (pdf.js): thumbnails, and each page's text for the AI pick (api/_routes/sales/spec-pages.js),
// which preselects the proposal summary and the hours estimate. Only the picked pages are uploaded, as a
// new PDF (pdf-lib). The original Canva file can be any size: it never leaves the browser. When the picked
// pages are still over the upload limit (Canva embeds full-size images), each page is drawn as a JPEG at the
// page's own size, smaller step by step until the file fits. The limit is the server's (a Vercel function
// takes about 4.5MB per request, and the signed PDF that includes these pages is served the same way).
const MAX_UPLOAD = 3 * 1024 * 1024;
// [pixels on the page's longer side, JPEG quality], sharpest first
const SHRINK = [[2400, 0.85], [2000, 0.8], [1600, 0.75], [1300, 0.7], [1000, 0.62]];
const THUMB_W = 220;

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ||= Promise.all([
  import("pdfjs-dist"),
  import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
]).then(([lib, worker]) => {
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return lib;
}));

async function renderPage(doc, n, width) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (width * (window.devicePixelRatio || 1)) / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

// a page as a JPEG of `longSide` pixels on its longer side, with the page's size in points
async function pageJpeg(doc, n, longSide, quality) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: longSide / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  canvas.width = canvas.height = 0;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: base.width, h: base.height };
}

// the picked pages as a PDF of images, at the first SHRINK step that fits; null when none does
async function shrunkPdf(doc, pages, PDFDocument, onStep) {
  for (const [i, [side, q]] of SHRINK.entries()) {
    onStep?.(i);
    const out = await PDFDocument.create();
    for (const n of pages) {
      const { bytes, w, h } = await pageJpeg(doc, n, side, q);
      const img = await out.embedJpg(bytes);
      out.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
    }
    const blob = new Blob([await out.save()], { type: "application/pdf" });
    if (blob.size <= MAX_UPLOAD) return blob;
  }
  return null;
}

const pageText = async (doc, n) => (await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(" ");

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** file: the PDF sales chose. onSave({ specFileId, specPages, specPageCount }) after the picked pages are uploaded */
export default function SpecPagePicker({ file, onClose, onSave }) {
  const [doc, setDoc] = useState(null);
  const [thumbs, setThumbs] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [ai, setAi] = useState(null); // { summaryPage, hoursPage, source } | "loading"
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shrinking, setShrinking] = useState(null); // the SHRINK step being tried
  const [zoom, setZoom] = useState(null); // { n, src }
  const bytes = useRef(null);

  useEffect(() => {
    let alive = true;
    let loaded = null;
    (async () => {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        bytes.current = buf.slice();
        const pdfjs = await loadPdfjs();
        loaded = await pdfjs.getDocument({ data: buf }).promise;
        if (!alive) return;
        setDoc(loaded);
        const count = loaded.numPages;
        setThumbs(Array(count).fill(null));
        setPicked(new Set(count <= 2 ? Array.from({ length: count }, (_, i) => i + 1) : [1, count]));
        // the AI pick runs while the thumbnails render
        setAi("loading");
        const texts = [];
        for (let n = 1; n <= count; n++) texts.push({ text: await pageText(loaded, n).catch(() => "") });
        api("sales/spec-pages", { method: "POST", body: { pages: texts } })
          .then((r) => { if (alive) { setAi(r); setPicked(new Set(r.pages)); } })
          .catch(() => { if (alive) setAi({ source: "default", summaryPage: 1, hoursPage: count }); });
        for (let n = 1; n <= count && alive; n++) {
          const src = await renderPage(loaded, n, THUMB_W).catch(() => "");
          if (alive) setThumbs((t) => t.map((x, i) => (i === n - 1 ? src : x)));
        }
      } catch {
        if (alive) setError("לא הצלחנו לקרוא את הקובץ. ודאו שזה קובץ PDF תקין.");
      }
    })();
    return () => { alive = false; loaded?.destroy?.(); };
  }, [file]);

  const toggle = (n) => setPicked((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const showLarge = async (n) => {
    setZoom({ n, src: thumbs[n - 1] });
    const src = await renderPage(doc, n, Math.min(1100, window.innerWidth - 64)).catch(() => null);
    if (src) setZoom((z) => (z?.n === n ? { n, src } : z));
  };

  const save = async () => {
    const pages = [...picked].sort((a, b) => a - b);
    if (!pages.length) return;
    setBusy(true);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const src = await PDFDocument.load(bytes.current, { ignoreEncryption: true });
      const out = await PDFDocument.create();
      for (const p of await out.copyPages(src, pages.map((n) => n - 1))) out.addPage(p);
      let blob = new Blob([await out.save()], { type: "application/pdf" });
      if (blob.size > MAX_UPLOAD) {
        setShrinking(0);
        blob = await shrunkPdf(doc, pages, PDFDocument, setShrinking);
        setShrinking(null);
        if (!blob) {
          toast({ title: `גם אחרי כיווץ, ${pages.length} העמודים שבחרתם גדולים מדי להעלאה. בחרו פחות עמודים.`, variant: "destructive" });
          return;
        }
      }
      const name = file.name.replace(/\.pdf$/i, "") + ` (עמודים ${pages.join(", ")}).pdf`;
      const r = await api("sales/upload", { method: "POST", body: { name, data_url: await blobToDataUrl(blob) } });
      onSave({ specFileId: r.fileId, specPages: pages, specPageCount: doc.numPages });
    } catch (e) {
      toast({ title: errorText(e), variant: "destructive" });
    } finally {
      setShrinking(null);
      setBusy(false);
    }
  };

  const count = doc?.numPages || 0;
  // labels only for what the AI found; the first/last default is not a finding
  const tag = (n) => (ai?.source === "ai" ? [n === ai.summaryPage && "סיכום ההצעה", n === ai.hoursPage && "הערכת שעות"].filter(Boolean).join(" · ") : "");

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 p-0" dir="rtl">
        <DialogHeader className="border-b border-border py-4 pl-5 pr-12 text-right sm:text-right">
          <DialogTitle>אילו עמודים מהאפיון לצרף להסכם?</DialogTitle>
          <DialogDescription className="text-right">
            העמודים שתבחרו יצורפו כנספח ב' להסכם ויוצגו ללקוח. בדרך כלל: עמוד סיכום ההצעה ועמוד הערכת השעות.
            בכל עמוד יירשם שהשעות הן הערכה משוערת והמחיר קבוע.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : !count ? (
            <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <p className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                {ai === "loading" ? <><Loader2 className="h-4 w-4 animate-spin" />מזהה את עמוד הסיכום ואת עמוד השעות...</>
                  : ai?.source === "ai" ? <><Sparkles className="h-4 w-4 text-primary" />זוהו אוטומטית עמוד {ai.summaryPage} (סיכום) ועמוד {ai.hoursPage} (שעות). אפשר לשנות.</>
                    : <>נבחרו העמוד הראשון והאחרון. אפשר לשנות.</>}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {thumbs.map((src, i) => {
                  const n = i + 1;
                  const on = picked.has(n);
                  return (
                    <div key={n} className={`group relative overflow-hidden rounded-lg border-2 bg-secondary/40 transition ${on ? "border-primary" : "border-transparent hover:border-border"}`}>
                      <button type="button" onClick={() => toggle(n)} className="block w-full text-right" aria-pressed={on} aria-label={`עמוד ${n}`}>
                        {src ? <img src={src} alt="" className="block w-full" /> : <div className="grid aspect-[4/3] place-items-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
                        <span className={`flex items-center justify-between gap-2 border-t px-2 py-1.5 text-xs ${on ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-background"}`}>
                              {on ? <Check className="h-3 w-3" /> : null}
                            </span>
                            עמוד {n}
                          </span>
                          {tag(n) && <span className="truncate text-primary">{tag(n)}</span>}
                        </span>
                      </button>
                      {src && (
                        <button type="button" onClick={() => showLarge(n)} className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-muted-foreground opacity-100 shadow-sm hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100" aria-label={`הגדלת עמוד ${n}`}>
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-sm text-muted-foreground">{count ? `${picked.size ? `נבחרו ${picked.size === 1 ? "עמוד אחד" : `${picked.size} עמודים`}` : "לא נבחרו עמודים"} מתוך ${count}` : ""}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>ביטול</Button>
            <Button onClick={save} disabled={busy || !picked.size || !count}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" />{shrinking !== null ? `מכווץ את העמודים (${shrinking + 1}/${SHRINK.length})...` : "מצרף..."}</> : "צירוף העמודים להסכם"}</Button>
          </div>
        </div>

        {zoom && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/70 p-3" onClick={() => setZoom(null)} role="presentation">
            <div className="flex max-h-full max-w-full flex-col rounded-lg bg-background p-2" onClick={(e) => e.stopPropagation()} role="presentation">
              <div className="mb-2 flex shrink-0 items-center justify-between gap-3 px-1">
                <span className="text-sm font-medium">עמוד {zoom.n}{tag(zoom.n) ? ` · ${tag(zoom.n)}` : ""}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant={picked.has(zoom.n) ? "default" : "outline"} onClick={() => toggle(zoom.n)}>{picked.has(zoom.n) ? "נבחר" : "בחירת העמוד"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setZoom(null)}>סגירה</Button>
                </div>
              </div>
              <img src={zoom.src} alt={`עמוד ${zoom.n}`} className="block min-h-0 max-w-full flex-1 object-contain" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
