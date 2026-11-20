// GET /api/contracts/notice?guid=<uuid>   public, read by Toro (cars-server contracts/notifySigned)
// -> { form_title, form_id, signer_name, signer_email, signed_at, submissions_url,
//      pdf: { name, sha256, base64 } | null }   (the stored signed PDF, for the email attachment)
// Answers once per signature and only within 30 minutes of it, then 404. Toro builds the office
// email from this, so a call to Toro with a guid can only ever announce a real, new signature.
import { HttpError, json, origin, route } from "../_lib/http.js";
import { connectionString, query } from "../_lib/db.js";
import { uuidParam } from "../_lib/sign.js";

export default route(["GET"], async (req, res) => {
  if (!connectionString()) throw new HttpError(503, "not_configured");
  const guid = uuidParam(new URL(req.url, "http://x").searchParams.get("guid"), "bad_guid");
  const { rows } = await query(
    `UPDATE sign.submissions SET notified_at = now()
      WHERE guid = $1 AND notified_at IS NULL AND created_date > now() - interval '30 minutes'
      RETURNING form_id, form_title, signer_name, signer_email, signed_at, pdf_file_id, pdf_sha256`, [guid]);
  const s = rows[0];
  if (!s) throw new HttpError(404, "not_found");
  let pdf = null;
  if (s.pdf_file_id) {
    const f = await query("SELECT name, data FROM sign.files WHERE id = $1", [s.pdf_file_id]);
    if (f.rows[0]) pdf = { name: f.rows[0].name, sha256: s.pdf_sha256, base64: f.rows[0].data.toString("base64") };
  }
  json(res, 200, {
    form_id: s.form_id,
    form_title: s.form_title,
    signer_name: s.signer_name || null,
    signer_email: s.signer_email || null,
    signed_at: new Date(s.signed_at).toISOString(),
    submissions_url: `${origin(req)}/contracts/submissions?id=${s.form_id}`,
    pdf,
  });
});
