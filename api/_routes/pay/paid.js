// POST /api/pay/paid
// Called by Toro (cars-server, grow/routes/growController.js notifyProAlgorithm) after Grow
// confirms a Pro Algorithm payment. Grow may notify more than once, so a transaction id
// already recorded only fills in what was missing (for example the invoice number).
//
// Accepted only from Toro's server address: TORO_IPS, or PAY_WEBHOOK_IPS (comma separated)
// to override it. On Vercel the caller's IP comes from Vercel and cannot be forged. If
// PAY_WEBHOOK_SECRET is set, the request must also carry it as a Bearer token.
// A refused call is logged with its IP, so a Toro move shows up in the Vercel logs.
import { HttpError, json, readJson, route, sameSecret } from "../../_lib/http.js";
import { toroIps } from "../../_lib/toro.js";
import { clientIp } from "../../_lib/http.js";
import { markDiscoveryPaid } from "../../_lib/sales.js";
import { connectionString, query } from "../../_lib/db.js";
import { text, UUID_RE } from "../../_lib/pay.js";

export default route(["POST"], async (req, res) => {
  if (!connectionString()) throw new HttpError(503, "not_configured");
  const ip = clientIp(req);
  const secret = process.env.PAY_WEBHOOK_SECRET;
  const auth = String(req.headers.authorization || "");
  const secretOk = !secret || (auth.startsWith("Bearer ") && sameSecret(auth.slice(7), secret));
  if (!toroIps().includes(ip) || !secretOk) {
    console.warn(`[pay/paid] refused a report from ${ip}${secretOk ? "" : " (bad secret)"}`);
    throw new HttpError(403, "forbidden");
  }

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
  // a spec request paid on its page (its id travels as the link id)
  if (linkId) await markDiscoveryPaid(linkId, { via: "grow", ref: transactionId, payer: { email: b.payerEmail, phone: b.payerPhone } });
  json(res, 200, { ok: true });
});
