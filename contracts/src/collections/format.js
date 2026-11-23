export const PAYMENT_METHODS = [
  { value: "check", label: "צ'ק" },
  { value: "transfer", label: "העברה בנקאית" },
  { value: "cash", label: "מזומן" },
  { value: "credit", label: "כרטיס אשראי" },
  { value: "other", label: "אחר" },
];

export const PAYMENT_STATUSES = [
  { value: "pending", label: "ממתין" },
  { value: "paid", label: "שולם" },
  { value: "blocked", label: "לא לגבות" },
  { value: "cancelled", label: "בוטל" },
];

export const COLLECTION_STATUSES = [
  { value: "scheduled", label: "מתוכנן" },
  { value: "collected", label: "נאסף" },
  { value: "cancelled", label: "בוטל" },
];

export const DOC_TYPES = [
  { value: "tax_invoice", label: "חשבונית מס" },
  { value: "deal_invoice", label: "חשבונית עסקה" },
  { value: "invoice_receipt", label: "חשבונית מס קבלה" },
  { value: "receipt", label: "קבלה" },
  { value: "other", label: "אחר" },
];

export const VAT_RATE = 0.18;

export const methodLabel = (value) => PAYMENT_METHODS.find((m) => m.value === value)?.label || "אחר";

export const docTypeLabel = (value) => DOC_TYPES.find((d) => d.value === value)?.label || "";

export const vatIncluded = (payment) => payment?.vat_included !== false;

// Every amount on screen is shown including VAT. A payment entered before VAT
// (vat_included: false) is grossed up; one entered with VAT is shown as is.
export const amountWithVat = (payment) => {
  const amount = Number(payment?.amount || 0);
  return vatIncluded(payment) ? amount : Math.round(amount * (1 + VAT_RATE) * 100) / 100;
};

export const amountBeforeVat = (payment) => {
  const amount = Number(payment?.amount || 0);
  return vatIncluded(payment) ? Math.round((amount / (1 + VAT_RATE)) * 100) / 100 : amount;
};

export function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatMoney(value) {
  const n = Number(value || 0);
  return `₪${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y.slice(2)}`;
}

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function formatDateLong(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(value);
  const day = new Date(y, m - 1, d).getDay();
  return `יום ${WEEKDAYS[day]}, ${formatDate(value)}`;
}

export function paymentState(payment, today = todayISO()) {
  if (payment.status === "paid") return "paid";
  if (payment.status === "cancelled") return "cancelled";
  if (payment.status === "blocked") return "blocked";
  if (payment.due_date && payment.due_date < today) return "overdue";
  return "pending";
}

const byDate = (a, b) => String(a.due_date || "").localeCompare(String(b.due_date || ""));
const sum = (rows) => rows.reduce((total, row) => total + amountWithVat(row), 0);

/**
 * All money figures include VAT.
 * - remaining: everything the customer still owes (pending + "do not collect"),
 *   so a customer who owes money never shows a zero balance.
 * - total: the whole deal (every payment that wasn't cancelled).
 * - toCollect: the part of `remaining` that is due to be collected now (pending).
 * - blockedTotal: the part of `remaining` marked "do not collect".
 */
export function summarizeCustomer(customer, today = todayISO()) {
  const active = (customer.payments || []).filter((p) => p.status !== "cancelled");
  const open = active.filter((p) => p.status === "pending").sort(byDate);
  const blocked = active.filter((p) => p.status === "blocked");
  const nextPayment = open[0] || null;
  const overdue = open.some((p) => p.due_date && p.due_date < today);

  const pickups = active
    .filter((p) => p.method === "check" && p.collection_date)
    .map((p) => p.collection_date)
    .sort();

  let state = "clear";
  if (overdue) state = "overdue";
  else if (open.length) state = "pending";
  else if (blocked.length) state = "blocked";
  else if (active.length) state = "paid";

  const toCollect = sum(open);
  const blockedTotal = sum(blocked);

  return {
    remaining: toCollect + blockedTotal,
    total: sum(active),
    toCollect,
    blockedTotal,
    nextDate: nextPayment?.due_date || null,
    state,
    openCount: open.length + blocked.length,
    blockedCount: blocked.length,
    pickupDate: pickups[0] || null,
  };
}
