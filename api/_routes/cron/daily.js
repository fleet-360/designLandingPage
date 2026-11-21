// GET /api/cron/daily   Vercel Cron, every morning (vercel.json "crons"). Safe to call again.
// Tries again emails Toro could not send at the time (up to three times, for two days), so a signed
// agreement or a meeting confirmation still arrives. Customers get no automatic reminders.
// The charges themselves run in Toro at 08:00.
import { HttpError, json, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { callToro } from "../../_lib/toro.js";

export default route(["GET"], async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) throw new HttpError(401, "unauthorized");

  // emails that failed (Toro unreachable at the time)
  const failed = await query(
    `UPDATE sales.outbox SET retries = retries + 1 WHERE id IN (
       SELECT id FROM sales.outbox WHERE status = 'failed' AND retries < 3 AND created_at > now() - interval '2 days'
        ORDER BY created_at LIMIT 50) RETURNING id`);
  let resent = 0;
  for (const m of failed.rows) {
    const r = await callToro("/proAlgoSales/mail", { id: m.id });
    if (r.ok) resent++;
    else await query("UPDATE sales.outbox SET status = 'failed', error = $2 WHERE id = $1 AND status <> 'sent'", [m.id, r.error || "failed"]);
  }
  json(res, 200, { ok: true, retried: failed.rows.length, resent });
});
