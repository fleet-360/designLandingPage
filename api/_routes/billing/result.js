// POST /api/billing/result   Toro only: the outcome of one charge
// { chargeId, ok, transactionId, asmachta, cardSuffix, error, invoiceNumber, invoicePdf (base64), invoiceError }
// Paid: the invoice PDF is kept, the standing order moves to its next month (or ends with its
// schedule). Failed: it is retried two days later, up to three attempts, then stops ("failed") until
// the card is replaced or someone resumes it; the customer gets a link to update the card.
import { HttpError, json, origin, readJson, route } from "../../_lib/http.js";
import { query, transaction } from "../../_lib/db.js";
import { requireToro } from "../../_lib/toro.js";
import { uuidParam } from "../../_lib/sign.js";
import { getSettings, logEvent, sendMail, str } from "../../_lib/sales.js";
import { advanceAfterPaid, subscriptionRow, today } from "../../_lib/billing.js";
import { addDays } from "../../_lib/sales-calc.js";
import { chargeFailedMail } from "../../_lib/sales-mail.js";

const MAX_ATTEMPTS = 3;

export default route(["POST"], async (req, res) => {
  requireToro(req);
  const b = await readJson(req, 4 * 1024 * 1024);
  const uid = uuidParam(b.chargeId);

  const out = await transaction(async (db) => {
    const c = (await db.query("SELECT * FROM billing.charges WHERE uid = $1 FOR UPDATE", [uid])).rows[0];
    if (!c) throw new HttpError(404, "not_found");
    if (c.status !== "processing") return { already: true };
    const s = (await db.query("SELECT * FROM billing.subscriptions WHERE id = $1 FOR UPDATE", [c.subscription_id])).rows[0];

    if (b.ok) {
      let fileId = null;
      if (b.invoicePdf) {
        const pdf = Buffer.from(String(b.invoicePdf), "base64");
        fileId = (await db.query(
          "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (false, $1, 'application/pdf', $2, $3) RETURNING id",
          [`חשבונית ${str(b.invoiceNumber, 40) || c.id}.pdf`, pdf.length, pdf])).rows[0].id;
      }
      await db.query(
        `UPDATE billing.charges SET status = 'paid', processed_at = now(), transaction_id = $2, asmachta = $3,
                invoice_number = $4, invoice_file_id = $5, invoice_error = $6 WHERE id = $1`,
        [c.id, str(b.transactionId, 60) || null, str(b.asmachta, 40) || null, str(b.invoiceNumber, 40) || null, fileId, str(b.invoiceError, 300) || null]);
      const next = await advanceAfterPaid(db, s, c.due_date, str(b.cardSuffix, 8) || null);
      await logEvent("subscription", s.id, "charged", { amount: Number(c.amount), invoice: b.invoiceNumber || null, next }, db);
      return { paid: true };
    }

    const attempts = s.failed_attempts + 1;
    const final = attempts >= MAX_ATTEMPTS;
    await db.query("UPDATE billing.charges SET status = 'failed', processed_at = now(), error = $2 WHERE id = $1", [c.id, str(b.error, 300) || "declined"]);
    await db.query(
      `UPDATE billing.subscriptions SET failed_attempts = $2, retry_on = $3, status = CASE WHEN $4 THEN 'failed' ELSE status END,
              updated_at = now() WHERE id = $1`, [s.id, attempts, final ? null : addDays(today(), 2), final]);
    await logEvent("subscription", s.id, "charge_failed", { attempt: attempts, error: b.error || null, final }, db);
    return { failed: true, final, s: { ...s, failed_attempts: attempts }, charge: { amount: Number(c.amount), error: b.error } };
  });

  if (out.failed) {
    const settings = await getSettings();
    const base = origin(req);
    let link = `${base}/card/${out.s.card_link_token}`;
    if (out.s.deal_id) {
      const d = (await query("SELECT token FROM sales.deals WHERE id = $1", [out.s.deal_id])).rows[0];
      if (d) link = `${base}/deal/${d.token}`;
    }
    await sendMail({ ...chargeFailedMail(subscriptionRow(out.s), out.charge, settings, link, out.final), entity: "subscription", entityId: out.s.id, kind: "charge_failed" });
  }
  json(res, 200, { ok: true });
});
