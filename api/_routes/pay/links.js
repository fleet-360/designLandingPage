// GET  /api/pay/links -> { links: [...], payments: [...] }   (signed in)
// POST /api/pay/links { amount, description, maxPayments, expiryDays, lock, lang,
//                       customerName, customerPhone, customerEmail, customerTaxId }
//                     -> 201 { link }                         (signed in)
// The link's id travels inside the token, /pay sends it to Toro, Toro returns it with the
// payment (api/pay/paid.js), and that is how a payment finds its link.
import { randomUUID } from "node:crypto";
import { HttpError, json, origin, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { encodeToken } from "../../_lib/pay-token.js";
import { linkRow, MAX_PAYMENTS, MAX_SUM, MIN_SUM, paymentRow, requireConfigured, text } from "../../_lib/pay.js";
import { requireUser } from "../../_lib/session.js";

const LIST_LIMIT = 500;

export default route(["GET", "POST"], async (req, res) => {
  requireConfigured();
  const user = requireUser(req);
  if (req.method === "GET") return list(res);
  return create(req, res, user);
});

async function list(res) {
  const [links, payments] = await Promise.all([
    query(`SELECT l.*, p.paid_count, p.paid_sum, p.last_paid_at
             FROM pay.links l
             LEFT JOIN (SELECT link_id, count(*) AS paid_count, sum(sum) AS paid_sum, max(received_at) AS last_paid_at
                          FROM pay.payments WHERE link_id IS NOT NULL GROUP BY link_id) p ON p.link_id = l.id
            ORDER BY l.created_at DESC LIMIT ${LIST_LIMIT}`),
    query(`SELECT p.*, l.description AS link_description
             FROM pay.payments p LEFT JOIN pay.links l ON l.id = p.link_id
            ORDER BY p.received_at DESC LIMIT ${LIST_LIMIT}`),
  ]);
  json(res, 200, { links: links.rows.map(linkRow), payments: payments.rows.map(paymentRow) });
}

function normalizePhone(raw) {
  return String(raw || "").replace(/[^\d+]/g, "").replace(/^\+?972/, "0").replace(/\D/g, "");
}

async function create(req, res, user) {
  const b = await readJson(req);

  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < MIN_SUM || amount > MAX_SUM) throw new HttpError(400, "bad_amount");
  const description = text(b.description, 120);
  if (!description) throw new HttpError(400, "bad_description");
  const maxPayments = Math.trunc(Number(b.maxPayments) || 1);
  if (maxPayments < 1 || maxPayments > MAX_PAYMENTS) throw new HttpError(400, "bad_payments");
  const expiryDays = Math.trunc(Number(b.expiryDays) || 0);
  if (expiryDays < 0 || expiryDays > 365) throw new HttpError(400, "bad_expiry");
  const phone = b.customerPhone ? normalizePhone(b.customerPhone) : null;
  if (phone && !/^0\d{8,9}$/.test(phone)) throw new HttpError(400, "bad_phone");
  const email = text(b.customerEmail, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, "bad_email");

  const link = {
    id: randomUUID(),
    amount,
    amountLocked: b.lock !== false,
    maxPayments,
    description,
    customerName: text(b.customerName, 120),
    customerPhone: phone,
    customerEmail: email,
    customerTaxId: text(b.customerTaxId, 20),
    lang: b.lang === "en" ? "en" : "he",
    expiresAt: expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400000) : null,
  };

  // Same short keys as before (see payment.js fromTokenPayload); k is the link id
  const payload = { a: link.amount, d: link.description, k: link.id };
  if (link.maxPayments > 1) payload.i = link.maxPayments;
  if (link.customerName) payload.n = link.customerName;
  if (link.customerPhone) payload.p = link.customerPhone;
  if (link.customerEmail) payload.e = link.customerEmail;
  if (link.customerTaxId) payload.t = link.customerTaxId;
  if (link.lang === "en") payload.l = "en";
  if (!link.amountLocked) payload.f = 1;
  if (link.expiresAt) payload.x = link.expiresAt.getTime();
  const url = `${origin(req)}/pay?d=${encodeToken(payload, process.env.PAY_LINK_SECRET)}`;

  const { rows } = await query(
    `INSERT INTO pay.links (id, created_by, amount, amount_locked, max_payments, description, customer_name,
                            customer_phone, customer_email, customer_tax_id, lang, expires_at, url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [link.id, user, link.amount, link.amountLocked, link.maxPayments, link.description, link.customerName,
      link.customerPhone, link.customerEmail, link.customerTaxId, link.lang, link.expiresAt, url]);
  json(res, 201, { link: linkRow(rows[0]) });
}
