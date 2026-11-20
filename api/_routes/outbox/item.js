// GET /api/outbox/item?id=<uuid>   Toro only (cars-server proAlgoSales /mail)
// -> { to, cc, replyTo, subject, html, attachments: [{ filename, contentType, base64 }] }
// Handed out once: a message already fetched or sent answers 404.
import { HttpError, json, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireToro } from "../../_lib/toro.js";
import { uuidParam } from "../../_lib/sign.js";

export default route(["GET"], async (req, res) => {
  requireToro(req);
  const id = uuidParam(new URL(req.url, "http://x").searchParams.get("id"));
  const { rows } = await query(
    `UPDATE sales.outbox SET status = 'fetched', fetched_at = now()
      WHERE id = $1 AND status IN ('queued', 'failed') AND created_at > now() - interval '2 days' RETURNING *`, [id]);
  const m = rows[0];
  if (!m) throw new HttpError(404, "not_found");
  const attachments = [];
  for (const a of m.attachments || []) {
    const f = await query("SELECT content_type, data FROM sign.files WHERE id = $1", [a.file_id]);
    if (f.rows[0]) attachments.push({ filename: a.filename, contentType: f.rows[0].content_type, base64: f.rows[0].data.toString("base64") });
  }
  json(res, 200, { to: m.to_list, cc: m.cc_list, replyTo: m.reply_to, subject: m.subject, html: m.html, attachments });
});
