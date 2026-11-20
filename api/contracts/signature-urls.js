// GET /api/contracts/signature-urls?submission_id=<uuid>   (Base44 function getSignatureUrl), admin
// -> { signed_url, signed_urls: { [signature block id]: url } }
// The addresses are /api/contracts/files?id=..., readable with the admin's session cookie.
import { HttpError, json, route } from "../_lib/http.js";
import { query } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { fileUrl, uuidParam } from "../_lib/sign.js";

export default route(["GET"], async (req, res) => {
  requireAdmin(req);
  const id = uuidParam(new URL(req.url, "http://x").searchParams.get("submission_id"), "missing_submission_id");
  const { rows } = await query("SELECT signatures FROM sign.submissions WHERE id = $1", [id]);
  if (!rows[0]) throw new HttpError(404, "not_found");
  const entries = Object.entries(rows[0].signatures || {}).map(([blockId, fileId]) => [blockId, fileUrl(fileId)]);
  json(res, 200, {
    signed_url: entries[0]?.[1] || null,
    signed_urls: entries.length ? Object.fromEntries(entries) : null,
  });
});
