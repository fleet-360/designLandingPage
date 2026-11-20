// GET /api/billing/invoice?charge=<uid>   admin: the Caspit invoice PDF of a paid charge
import { HttpError, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { uuidParam } from "../../_lib/sign.js";

export default route(["GET"], async (req, res) => {
  requireAdmin(req);
  const uid = uuidParam(new URL(req.url, "http://x").searchParams.get("charge"));
  const f = (await query(
    "SELECT f.name, f.data FROM billing.charges c JOIN sign.files f ON f.id = c.invoice_file_id WHERE c.uid = $1", [uid])).rows[0];
  if (!f) throw new HttpError(404, "not_found");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", f.data.length);
  res.setHeader("Content-Disposition", `attachment; filename="invoice.pdf"; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.end(f.data);
});
