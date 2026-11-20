// GET /api/contracts/pdf?submission_id=<uuid>   admin
// The signed PDF stored when the customer signed (made now if that failed), as a download.
import { HttpError, route } from "../_lib/http.js";
import { query } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { ensureSignedPdf } from "../_lib/sign-pdf.js";
import { uuidParam } from "../_lib/sign.js";

export default route(["GET"], async (req, res) => {
  requireAdmin(req);
  const id = uuidParam(new URL(req.url, "http://x").searchParams.get("submission_id"), "missing_submission_id");
  const pdf = await ensureSignedPdf(id);
  if (!pdf) throw new HttpError(404, "not_found");
  const { rows } = await query("SELECT data FROM sign.files WHERE id = $1", [pdf.fileId]);
  const data = rows[0].data;
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", data.length);
  res.setHeader("Content-Disposition", `attachment; filename="signed.pdf"; filename*=UTF-8''${encodeURIComponent(pdf.name)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Document-SHA256", pdf.sha256 || "");
  res.end(data);
});
