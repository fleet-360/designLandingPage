// GET /api/sales/deal-file?token=&kind=signed|spec     the client's own files (the token is the key)
// GET /api/sales/deal-file?id=&kind=signed|spec        the same for the signed-in admin
import { HttpError, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { sessionUser } from "../../_lib/session.js";
import { uuidParam } from "../../_lib/sign.js";
import { stampedSpecPdf } from "../../_lib/spec-pdf.js";

export default route(["GET"], async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams;
  let d;
  if (q.get("id")) {
    if (!sessionUser(req)) throw new HttpError(401, "signed_out");
    d = (await query("SELECT * FROM sales.deals WHERE id = $1", [uuidParam(q.get("id"))])).rows[0];
  } else if (/^[A-Za-z0-9_-]{20,40}$/.test(String(q.get("token") || ""))) {
    d = (await query("SELECT * FROM sales.deals WHERE token = $1", [q.get("token")])).rows[0];
  }
  if (!d) throw new HttpError(404, "not_found");
  const kind = q.get("kind");
  // the spec as it was approved and signed, once it was; before that, the one in the deal
  const specId = d.snapshot?.spec?.fileId || d.snapshot?.order?.project?.specFileId || d.data.project?.specFileId;
  const fileId = kind === "signed" ? d.signed_pdf_file_id : kind === "spec" ? specId : null;
  if (!fileId) throw new HttpError(404, "not_found");
  const f = (await query("SELECT name, content_type, data FROM sign.files WHERE id = $1", [fileId])).rows[0];
  if (!f) throw new HttpError(404, "not_found");
  // the spec opens as Appendix B: each page with the strip that says the hours in it are estimates
  if (kind === "spec" && f.content_type === "application/pdf") {
    try {
      const pr = d.snapshot?.spec || { pages: (d.snapshot?.order?.project || d.data.project)?.specPages, pageCount: (d.snapshot?.order?.project || d.data.project)?.specPageCount };
      f.data = await stampedSpecPdf(f.data, { number: d.number, pages: pr.pages, pageCount: pr.pageCount });
    } catch (e) { console.error("[deal-file] spec stamp failed:", e?.message); }
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", f.content_type);
  res.setHeader("Content-Length", f.data.length);
  res.setHeader("Content-Disposition", `${kind === "signed" ? "attachment" : "inline"}; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(f.name || "document.pdf")}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(f.data);
});
