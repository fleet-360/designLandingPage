// A payment's document (invoice) as Kaspit prints it, shown inside the site: the PDF's pages drawn with pdf.js
// (so it shows the same in every browser, whatever its PDF settings), with a download button.
import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchPaymentDocument } from "@/collections/api";
import { docTypeLabel } from "@/collections/format";
import { errorText } from "@/sales/lib";

let pdfjsPromise = null;
const loadPdfjs = () =>
  (pdfjsPromise ||= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    },
  ));

async function renderPage(doc, n, width) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (width * Math.min(window.devicePixelRatio || 1, 2)) / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/png");
}

/** payment: the payment whose document to show, or null (closed). */
export default function InvoiceViewer({ payment, onClose }) {
  const title = payment
    ? [docTypeLabel(payment.doc_type) || "מסמך", payment.doc_number].filter(Boolean).join(" ")
    : "";
  return (
    <Dialog open={!!payment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="collections-app flex h-[92vh] w-[96vw] max-w-3xl flex-col gap-3 p-4 sm:p-5">
        <DialogHeader className="pr-8 text-right sm:text-right">
          <DialogTitle className="font-display text-lg font-bold text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">כפי שהופק בכספית</DialogDescription>
        </DialogHeader>
        {payment && <Pages key={payment.id} payment={payment} />}
      </DialogContent>
    </Dialog>
  );
}

function Pages({ payment }) {
  const [state, setState] = useState({ loading: true, error: "", pages: [], file: null });
  const box = useRef(null);

  useEffect(() => {
    let alive = true;
    let doc = null;
    (async () => {
      try {
        const file = await fetchPaymentDocument(payment.id);
        if (!alive) return;
        setState((s) => ({ ...s, file }));
        const pdfjs = await loadPdfjs();
        doc = await pdfjs.getDocument({ data: new Uint8Array(await file.blob.arrayBuffer()) }).promise;
        const width = Math.min(900, (box.current?.clientWidth || 700) - 2);
        for (let n = 1; n <= doc.numPages && alive; n++) {
          const src = await renderPage(doc, n, width);
          if (alive) setState((s) => ({ ...s, loading: false, pages: [...s.pages, src] }));
        }
      } catch (err) {
        if (alive) setState((s) => ({ ...s, loading: false, error: err?.status ? errorText(err) : "לא הצלחנו להציג את המסמך" }));
      }
    })();
    return () => {
      alive = false;
      doc?.destroy?.();
    };
  }, [payment.id]);

  // the download link's address, made once the file is here and released when the viewer closes
  const [href, setHref] = useState("");
  useEffect(() => {
    if (!state.file) return undefined;
    const url = URL.createObjectURL(state.file.blob);
    setHref(url);
    return () => URL.revokeObjectURL(url);
  }, [state.file]);

  return (
    <>
      <div ref={box} className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-slate-100 p-2">
        {state.error ? (
          <p className="py-16 text-center text-sm text-red-700">{state.error}</p>
        ) : state.loading ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            טוען את המסמך מכספית…
          </p>
        ) : (
          <div className="space-y-2">
            {state.pages.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`עמוד ${i + 1}`}
                className="mx-auto block w-full max-w-[900px] bg-white shadow-sm"
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <a
          href={href || undefined}
          download={state.file?.name || "document.pdf"}
          aria-disabled={!href}
          className={
            "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white transition-colors hover:bg-slate-800 " +
            (href ? "" : "pointer-events-none opacity-50")
          }
        >
          <Download className="h-4 w-4" />
          הורדה
        </a>
      </div>
    </>
  );
}
