// Deal money and dates, in one place: the screens, the PDF and the emails all show what this
// returns (stored in the deal's snapshot when it is sent). Amounts are worked in agorot (integers)
// so every column adds up exactly.
//
// Business day (agreement 2.4): Sunday to Thursday, not a holiday, not the eve of a holiday, not
// Independence Day. Holidays come from @hebcal/core (Israel schedule).
import { HebrewCalendar, flags } from "@hebcal/core";

const TZ = "Asia/Jerusalem";

// "2026-11-20" in Israel for a Date (or now)
export function israelDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const toUtc = (iso) => new Date(`${iso}T12:00:00Z`);
const fromUtc = (d) => d.toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = toUtc(iso); d.setUTCDate(d.getUTCDate() + n); return fromUtc(d); };

const offDaysCache = new Map();
function offDays(year) {
  if (!offDaysCache.has(year)) {
    const off = new Set();
    const events = HebrewCalendar.calendar({ start: new Date(year, 0, 1), end: new Date(year, 11, 31), il: true });
    for (const e of events) {
      const day = fromUtc(new Date(Date.UTC(...(() => { const g = e.getDate().greg(); return [g.getFullYear(), g.getMonth(), g.getDate(), 12]; })())));
      if (e.getFlags() & flags.CHAG) { off.add(day); off.add(addDays(day, -1)); }
      if (/Yom HaAtzma/.test(e.getDesc())) off.add(day);
    }
    // a holiday's own days are not "eves" of the next one; both are off anyway
    offDaysCache.set(year, off);
  }
  return offDaysCache.get(year);
}

export function isBusinessDay(iso) {
  const dow = toUtc(iso).getUTCDay(); // 0 Sunday .. 6 Saturday
  if (dow === 5 || dow === 6) return false;
  return !offDays(Number(iso.slice(0, 4))).has(iso);
}

export function addBusinessDays(iso, n) {
  let d = iso;
  let left = n;
  while (left > 0) { d = addDays(d, 1); if (isBusinessDay(d)) left--; }
  return d;
}

export function previousBusinessDay(iso) {
  let d = iso;
  while (!isBusinessDay(d)) d = addDays(d, -1);
  return d;
}

// the same day-of-month `months` months after iso, clamped to the month's length
// the first billing day (day of month) on or after iso
export const billingDayOnOrAfter = (iso, day) => {
  const same = addMonths(iso, 0, day);
  return same >= iso ? same : addMonths(iso, 1, day);
};

// The standing order's billing day. A first charge date sets it (charged on the 22nd, then every
// 22nd); without one it is the day asked for. Days past a month's end fall on its last day (addMonths).
export function chargeDayOf(startDate, dayOfMonth) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ""))) return Number(String(startDate).slice(8, 10));
  return Math.min(31, Math.max(1, Math.trunc(Number(dayOfMonth) || 1)));
}

export function addMonths(iso, months, day) {
  const [y, m] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day ?? Number(iso.slice(8, 10)), last));
  return fromUtc(target);
}

const agorot = (shekels) => Math.round(Number(shekels) * 100);
const shekels = (a) => a / 100;

// Split `total` agorot over `weights` (agorot), proportionally, remainder on the last
function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => (sum ? Math.floor((total * w) / sum) : 0));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

/**
 * deal: { price (before VAT), vatRate, depositPercent (30), installments (N>=1), installmentDay (1),
 *         balanceMethod ('transfer'|'checks') }
 * from: the date the order is approved ("2026-11-22"); defaults to today in Israel.
 * -> { price, vat, total, rows: [{ n, kind: 'deposit'|'installment', date, dateNote, before, vat, total }],
 *      totals: { before, vat, total } }
 */
export function paymentSchedule(deal, from = israelDate()) {
  const rate = Number(deal.vatRate);
  const priceA = agorot(deal.price);
  const vatA = Math.round((priceA * rate) / 100);
  const depositA = Math.round((priceA * Number(deal.depositPercent ?? 30)) / 100);
  const n = Math.max(1, Math.trunc(Number(deal.installments) || 1));
  const day = Math.min(28, Math.max(1, Math.trunc(Number(deal.installmentDay) || 1)));
  const balanceA = priceA - depositA;
  const each = Math.floor(balanceA / n);
  const befores = [depositA, ...Array.from({ length: n }, (_, i) => (i === n - 1 ? balanceA - each * (n - 1) : each))];
  const vats = allocate(vatA, befores);

  const rows = befores.map((before, i) => {
    let date;
    let dateNote = null;
    if (i === 0) {
      date = addBusinessDays(from, 3);
      dateNote = "תוך 3 ימי עסקים מהאישור";
    } else {
      date = addMonths(from, i, day);
      if (deal.balanceMethod !== "checks" && !isBusinessDay(date)) {
        const prev = previousBusinessDay(date);
        dateNote = `יום עסקים בנקאי קודם: ${prev.split("-").reverse().join("/")}`;
      }
    }
    return {
      n: i + 1,
      kind: i === 0 ? "deposit" : "installment",
      date,
      dateNote,
      before: shekels(before),
      vat: shekels(vats[i]),
      total: shekels(before + vats[i]),
    };
  });
  return {
    price: shekels(priceA),
    vat: shekels(vatA),
    total: shekels(priceA + vatA),
    rows,
    totals: {
      before: shekels(befores.reduce((a, b) => a + b, 0)),
      vat: shekels(vats.reduce((a, b) => a + b, 0)),
      total: shekels(befores.reduce((a, b) => a + b, 0) + vats.reduce((a, b) => a + b, 0)),
    },
  };
}

export const withVat = (amount, rate) => shekels(agorot(amount) + Math.round((agorot(amount) * Number(rate)) / 100));

/**
 * Monthly service for the order page: { includedMonths, periods: [{ months|null, price }] }
 * -> rows [{ label, when, price, priceWithVat }]
 */
export function servicePeriods(service, vatRate, firstChargeDate) {
  if (!service?.enabled) return [];
  // with a first charge date (agreement v2): included until then, the periods run from it
  if (firstChargeDate) {
    const dmy = (iso) => iso.split("-").reverse().join("/");
    const day = Number(firstChargeDate.slice(8, 10));
    const rows = [{ label: "כלול במחיר הפרויקט", when: `עד ${dmy(firstChargeDate)}`, price: 0, priceWithVat: 0 }];
    let from = firstChargeDate;
    for (const p of service.periods || []) {
      const months = p.months ? Math.trunc(Number(p.months)) : null;
      rows.push({ label: months ? `${months} חודשים` : "בהמשך", when: `מ-${dmy(from)}`, price: Number(p.price), priceWithVat: withVat(p.price, vatRate) });
      if (!months) break;
      from = addMonths(from, months, day);
    }
    return rows;
  }
  const included = Math.max(0, Math.trunc(Number(service.includedMonths ?? 3)));
  const rows = [];
  if (included) rows.push({ label: `${included} חודשים ראשונים`, when: "מתחילת הפרויקט", price: 0, priceWithVat: 0 });
  let month = included + 1;
  for (const p of service.periods || []) {
    const months = p.months ? Math.trunc(Number(p.months)) : null;
    const when = months ? `חודשים ${month}–${month + months - 1}` : `מחודש ${month}`;
    rows.push({ label: months ? `${months} חודשים` : "בהמשך", when, price: Number(p.price), priceWithVat: withVat(p.price, vatRate) });
    if (months) month += months;
  }
  return rows;
}

/**
 * The amount (before VAT) of the k-th monthly charge (0-based) of a standing order whose schedule
 * is [{ months|null, amount }], counted from its first charge.
 */
export function chargeAmountAt(schedule, k) {
  let start = 0;
  for (const p of schedule || []) {
    if (!p.months) return Number(p.amount);
    if (k < start + Number(p.months)) return Number(p.amount);
    start += Number(p.months);
  }
  return null; // the schedule ended
}
