// POST /api/outbox/result { id, ok, error }   Toro only: the outcome of sending a message
import { json, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireToro } from "../../_lib/toro.js";
import { uuidParam } from "../../_lib/sign.js";

export default route(["POST"], async (req, res) => {
  requireToro(req);
  const b = await readJson(req);
  const id = uuidParam(b.id);
  if (b.ok) await query("UPDATE sales.outbox SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1", [id]);
  else await query("UPDATE sales.outbox SET status = 'failed', error = $2 WHERE id = $1 AND status <> 'sent'", [id, String(b.error || "failed").slice(0, 500)]);
  json(res, 200, { ok: true });
});
