// Standing orders (billing.subscriptions) and their charges. The site decides what is due and when;
// Toro charges the saved card token, issues the invoice and reports back (api/_routes/billing/*).
import { query } from "./db.js";
import { addMonths, chargeAmountAt, israelDate, withVat } from "./sales-calc.js";
import { newToken } from "./sales.js";

const iso = (d) => (d ? new Date(d).toISOString() : null);
const day = (d) => (d ? String(d).slice(0, 10) : null); // DATE columns arrive as strings (db.js)

export function subscriptionRow(r, base = "") {
  const k = r.charges_done;
  const nextBefore = chargeAmountAt(r.schedule, k);
  return {
    id: r.id,
    createdAt: iso(r.created_at),
    dealId: r.deal_id,
    customer: r.customer,
    description: r.description,
    vatRate: Number(r.vat_rate),
    schedule: r.schedule,
    startDate: day(r.start_date),
    dayOfMonth: r.day_of_month,
    status: r.status,
    card: r.card,
    cardSetAt: iso(r.card_set_at),
    nextChargeDate: day(r.next_charge_date),
    nextAmount: nextBefore == null ? null : withVat(nextBefore, r.vat_rate),
    nextAmountBeforeVat: nextBefore,
    chargesDone: r.charges_done,
    failedAttempts: r.failed_attempts,
    retryOn: day(r.retry_on),
    pausedAt: iso(r.paused_at),
    canceledAt: iso(r.canceled_at),
    notes: r.notes,
    cardLink: base ? `${base}/card/${r.card_link_token}` : null,
  };
}

export function chargeRow(r) {
  return {
    id: r.uid,
    number: Number(r.id),
    chargeIndex: r.charge_index,
    dueDate: day(r.due_date),
    attempt: r.attempt,
    amountBeforeVat: Number(r.amount_before_vat),
    amount: Number(r.amount),
    status: r.status,
    manual: r.manual,
    createdAt: iso(r.created_at),
    processedAt: iso(r.processed_at),
    transactionId: r.transaction_id,
    asmachta: r.asmachta,
    error: r.error,
    invoiceNumber: r.invoice_number,
    hasInvoice: Boolean(r.invoice_file_id),
    invoiceError: r.invoice_error,
  };
}

// the date of the k-th charge for a subscription that starts on startDate
export const chargeDate = (startDate, dayOfMonth, k) => (k === 0 ? startDate : addMonths(startDate, k, dayOfMonth));

/**
 * s: { dealId, customer, description, vatRate, schedule, startDate|null, dayOfMonth, createdBy }
 * Starts as pending_card; becomes active when the card token arrives (api/_routes/billing/card.js).
 */
export async function createSubscription(s, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO billing.subscriptions (created_by, deal_id, card_link_token, customer, description, vat_rate, schedule,
                                       start_date, day_of_month, next_charge_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8) RETURNING *`,
    [s.createdBy || null, s.dealId || null, newToken(), JSON.stringify(s.customer), s.description, s.vatRate,
      JSON.stringify(s.schedule), s.startDate || null, s.dayOfMonth || 1]);
  return rows[0];
}

// The deal's monthly service -> a standing order schedule (the included months are not charged:
// the first charge is when they end)
export function scheduleFromService(service) {
  return (service.periods || []).map((p) => ({ months: p.months || null, amount: Number(p.price) }));
}

// First charge (date and amount with VAT) for messages; null while the start date is unknown
export function firstCharge(r) {
  const k = r.charges_done || 0;
  const date = day(r.next_charge_date) || day(r.start_date);
  const before = chargeAmountAt(r.schedule, k);
  if (!date || before == null) return null;
  return { date, amount: withVat(before, r.vat_rate) };
}

export const today = () => israelDate();
