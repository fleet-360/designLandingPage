// GET /api/cron/daily   Vercel Cron, every morning (vercel.json "crons"). Safe to call again.
// Reminds customers who have not set the card for a standing order whose first charge is within
// seven days (at most every three days), and tries again emails Toro could not send (up to three times,
// for two days). The charges themselves run in Toro at 08:00.
import { HttpError, json, origin, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { getSettings, logEvent, sendMail } from "../../_lib/sales.js";
import { callToro } from "../../_lib/toro.js";
import { subscriptionRow, today } from "../../_lib/billing.js";
import { addDays } from "../../_lib/sales-calc.js";
import { cardReminderMail } from "../../_lib/sales-mail.js";

export default route(["GET"], async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) throw new HttpError(401, "unauthorized");
  const settings = await getSettings();
  const base = process.env.VERCEL ? "https://www.pro-algo.com" : origin(req);
  const { rows } = await query(
    `SELECT s.*, d.token AS deal_token FROM billing.subscriptions s LEFT JOIN sales.deals d ON d.id = s.deal_id
      WHERE s.status = 'pending_card' AND s.next_charge_date IS NOT NULL AND s.next_charge_date <= $1
        AND (s.reminded_at IS NULL OR s.reminded_at < now() - interval '3 days')`, [addDays(today(), 7)]);
  let sent = 0;
  for (const s of rows) {
    const link = s.deal_token ? `${base}/deal/${s.deal_token}` : `${base}/card/${s.card_link_token}`;
    const m = await sendMail({ ...cardReminderMail(subscriptionRow(s), settings, link, s.next_charge_date), entity: "subscription", entityId: s.id, kind: "card_reminder" });
    await query("UPDATE billing.subscriptions SET reminded_at = now() WHERE id = $1", [s.id]);
    await logEvent("subscription", s.id, "reminder_sent", { sent: m.sent });
    if (m.sent) sent++;
  }

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
  json(res, 200, { ok: true, reminders: rows.length, sent, retried: failed.rows.length, resent });
});
