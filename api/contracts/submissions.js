// /api/contracts/submissions  (Base44 entity "Submission"), admin only
//   GET    ?form_id=<uuid>&limit=  a form's signed submissions, newest first
//   GET    ?id=<uuid>              one submission
//   DELETE ?id=<uuid>              delete it and its signature images (the audit log keeps its entry)
import { json, route, HttpError } from "../_lib/http.js";
import { query } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { submissionRow, uuidParam } from "../_lib/sign.js";

export default route(["GET", "DELETE"], async (req, res) => {
  requireAdmin(req);
  const q = new URL(req.url, "http://x").searchParams;

  if (req.method === "GET" && q.get("id")) {
    const { rows } = await query("SELECT * FROM sign.submissions WHERE id = $1", [uuidParam(q.get("id"))]);
    if (!rows[0]) throw new HttpError(404, "not_found");
    return json(res, 200, { item: submissionRow(rows[0]) });
  }

  if (req.method === "GET") {
    const formId = uuidParam(q.get("form_id"), "bad_form_id");
    const limit = Math.min(Math.max(Math.trunc(Number(q.get("limit")) || 1000), 1), 1000);
    const { rows } = await query(
      "SELECT * FROM sign.submissions WHERE form_id = $1 ORDER BY created_date DESC LIMIT $2", [formId, limit]);
    return json(res, 200, { items: rows.map(submissionRow) });
  }

  const id = uuidParam(q.get("id"));
  const { rows } = await query("DELETE FROM sign.submissions WHERE id = $1 RETURNING signatures", [id]);
  if (!rows[0]) throw new HttpError(404, "not_found");
  const fileIds = Object.values(rows[0].signatures || {});
  if (fileIds.length) await query("DELETE FROM sign.files WHERE id = ANY($1::uuid[]) AND NOT is_public", [fileIds]);
  json(res, 200, { ok: true });
});
