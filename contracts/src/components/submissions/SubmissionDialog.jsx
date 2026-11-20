import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import SignedDocument from "@/components/submissions/SignedDocument";
import { fmtDate } from "@/lib/formUtils";
import { exportElementToPdf } from "@/lib/exportPdf";

export default function SubmissionDialog({ form, submission, onClose }) {
  const [sigUrl, setSigUrl] = useState(null);
  const [sigUrls, setSigUrls] = useState(null); // חתימה לכל בלוק חתימה (רשומות חדשות)
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportRef = useRef(null);

  // שימוש בתמונת המצב של הטופס מעת השליחה, אם קיימת — להצגת הגרסה המקורית
  const displayForm = (submission?.form_snapshot && submission.form_snapshot.blocks ? submission.form_snapshot : form) || form;

  useEffect(() => {
    if (!submission) return;
    setSigUrl(null);
    setSigUrls(null);
    setExportError("");
    if (!submission.signature_url && !submission.signatures) { setLoading(false); return; }
    setLoading(true);
    base44.functions
      .invoke("getSignatureUrl", { submission_id: submission.id })
      .then((r) => { setSigUrl(r.data?.signed_url || null); setSigUrls(r.data?.signed_urls || null); })
      .catch(() => setSigUrl(null))
      .finally(() => setLoading(false));
  }, [submission?.id]);

  // ה-PDF נוצר מתוך אותו מסמך שמוצג בתצוגה המקדימה — כך שהוא כולל את כל הפריטים בדיוק כפי שהם מוצגים
  const download = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    setExportError("");
    try {
      const name = `${displayForm.title || form.title} - ${fmtDate(submission.created_date)}`.replace(/[\/:*?"<>|]+/g, "-").trim();
      await exportElementToPdf(exportRef.current, `${name}.pdf`);
    } catch {
      setExportError("שגיאה ביצירת ה-PDF, נסו שוב");
    } finally {
      setExporting(false);
    }
  };

  if (!submission) return null;

  return (
    <Dialog open={!!submission} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>מסמך חתום · {displayForm.title || form.title}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-4">
              <div className="mx-auto shadow-md">
                <SignedDocument form={displayForm} values={submission.field_values || {}} signatureUrl={sigUrl} signatureUrls={sigUrls} />
              </div>
            </div>
            <Button onClick={download} disabled={exporting} className="w-full gap-2">
              {exporting ? <><Loader2 className="h-4 w-4 animate-spin" />מכין PDF...</> : <><Download className="h-4 w-4" />הורדת PDF</>}
            </Button>
            {exportError && <p className="text-center text-sm text-destructive">{exportError}</p>}
            {/* עותק של המסמך לייצוא — מחוץ לחלון הדיאלוג (שנגלל ונחתך) ובגודל מלא, מאחורי תוכן העמוד */}
            {createPortal(
              <div aria-hidden style={{ position: "fixed", top: 0, left: 0, zIndex: -1, pointerEvents: "none" }}>
                <div ref={exportRef}>
                  <SignedDocument form={displayForm} values={submission.field_values || {}} signatureUrl={sigUrl} signatureUrls={sigUrls} />
                </div>
              </div>,
              document.body
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}