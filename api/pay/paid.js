// POST /api/pay/paid   Authorization: Bearer <PAY_WEBHOOK_SECRET>
// Called by Toro (cars-server, grow/routes/growController.js notifyProAlgorithm) after Grow
// confirms a Pro Algorithm payment. Grow may notify more than once, so a transaction id
// already recorded only fills in what was missing (for example the invoice number).
import { HttpError, json, readJson, route, sameSecret } from "../_lib/http.js";
import { connectionString, query } from "../_lib/db.js";
import { text, UUID_RE } from "../_lib/pay.js";

export default route(["POST"], async (req, res) => {
  const secret = process.env.PAY_WEBHOOK_SECRET;
  if (!secret || !connectionString()) throw new HttpError(503, "not_configured");
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ") || !sameSecret(auth.slice(7), secret)) throw new HttpError(401, "unauthorized");

  const b = await readJson(req);
  const transactionId = text(b.transactionId, 64);
  const sum = Number(b.sum);
  if (!transactionId || !Number.isFinite(sum)) throw new HttpError(400, "bad_payment");
  const linkId = UUID_RE.test(String(b.linkId || "")) ? String(b.linkId).toLowerCase() : null;
  const paymentsNum = Number.isInteger(Number(b.paymentsNum)) ? Number(b.paymentsNum) : null;

  await query(
    `INSERT INTO pay.payments (transaction_id, link_id, payment_date, sum, payments_num, description, payer_name,
                               payer_phone, payer_email, asmachta, card_suffix, process_id, invoice_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (transaction_id) DO UPDATE SET
       link_id        = COALESCE(pay.payments.link_id, EXCLUDED.link_id),
       invoice_number = COALESCE(EXCLUDED.invoice_number, pay.payments.invoice_number)`,
    [transactionId, linkId, text(b.paymentDate, 40), sum, paymentsNum, text(b.description, 200),
      text(b.fullName, 120), text(b.payerPhone, 30), text(b.payerEmail, 160), text(b.asmachta, 40),
      text(b.cardSuffix, 8), text(b.processId, 64), text(b.invoiceNumber, 40)]);
  json(res, 200, { ok: true });
});
