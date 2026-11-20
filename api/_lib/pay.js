// Shared by the api/pay/* endpoints. See pay/README.md.
import { connectionString } from "./db.js";
import { HttpError } from "./http.js";

export const MIN_SUM = 1;
export const MAX_SUM = 500000;
export const MAX_PAYMENTS = 12;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The admin needs credentials, the link secret and the database. Domains built from this
// repo without them answer 503, and /pay-link says it is not configured.
export function requireConfigured() {
  const env = process.env;
  if (!env.PAY_ADMIN_USER || !env.PAY_ADMIN_PASSWORD || !env.PAY_LINK_SECRET || !connectionString()) {
    throw new HttpError(503, "not_configured");
  }
}

const iso = d => (d ? new Date(d).toISOString() : null);
const num = v => (v === null || v === undefined ? null : Number(v));

export function linkRow(r) {
  return {
    id: r.id,
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
    amount: num(r.amount),
    amountLocked: r.amount_locked,
    maxPayments: r.max_payments,
    description: r.description,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    customerEmail: r.customer_email,
    customerTaxId: r.customer_tax_id,
    lang: r.lang,
    expiresAt: iso(r.expires_at),
    url: r.url,
    paidCount: Number(r.paid_count || 0),
    paidSum: num(r.paid_sum) || 0,
    lastPaidAt: iso(r.last_paid_at),
  };
}

export function paymentRow(r) {
  return {
    id: Number(r.id),
    transactionId: r.transaction_id,
    linkId: r.link_id,
    linkDescription: r.link_description || null,
    receivedAt: iso(r.received_at),
    paymentDate: r.payment_date,
    sum: num(r.sum),
    paymentsNum: r.payments_num,
    description: r.description,
    payerName: r.payer_name,
    payerPhone: r.payer_phone,
    payerEmail: r.payer_email,
    asmachta: r.asmachta,
    cardSuffix: r.card_suffix,
    invoiceNumber: r.invoice_number,
  };
}

// Trimmed text or null, capped at max characters
export function text(value, max) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}
