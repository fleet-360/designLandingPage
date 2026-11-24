// GET /api/collections/invoice?id=<payment id>   admin: the payment's document (invoice) as Kaspit prints it, PDF.
// Opened as a plain link in a new tab, so a failure is a short Hebrew page there (signed out: the admin sign-in).
import { HttpError, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { paymentDocumentPdf } from "../../_lib/collections-kaspit.js";
import { idParam } from "../../_lib/collections-ids.js";

const MESSAGES = {
  kaspit_doc_not_found: "המסמך לא נמצא בכספית. בדקו את מספר המסמך בתשלום.",
  kaspit_unavailable: "כספית לא זמינה כרגע. נסו שוב בעוד דקה.",
  kaspit_not_configured: "החיבור לכספית עוד לא הוגדר בשרת.",
  not_found: "התשלום לא נמצא. ייתכן שנמחק.",
  bad_id: "התשלום לא נמצא. ייתכן שנמחק.",
};

function page(res, status, text) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>מסמך מכספית</title><body style="font-family:system-ui,sans-serif;margin:0;padding:40px 20px;color:#0f172a;background:#f8fafc">
<p style="max-width:420px;margin:0 auto;padding:16px 18px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;font-size:15px;line-height:1.6">${text}</p></body></html>`);
}

export default route(["GET"], async (req, res) => {
  try {
    requireAdmin(req);
    const { pdf, name } = await paymentDocumentPdf(idParam(req));
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdf.length);
    res.setHeader("Content-Disposition", `inline; filename="${name}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.end(pdf);
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    if (err.status === 401) {
      res.statusCode = 302;
      res.setHeader("Location", "/contracts/login");
      return res.end();
    }
    page(res, err.status, MESSAGES[err.code] || "לא הצלחנו לפתוח את המסמך.");
  }
});
