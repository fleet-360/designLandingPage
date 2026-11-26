// A deal's content, built once from what sales entered (deal.data), what the client corrected
// (deal.client) and the settings. The order page, the agreement screen, the PDF and the emails all
// render this same object, so a number is never typed twice. When the client approves, the order
// part is frozen; when they sign, the whole thing is frozen with its hash (deal.snapshot).
import { createHash } from "node:crypto";
import { AGREEMENT as AGREEMENT_V1 } from "./agreement-v1.js";
import { AGREEMENT as AGREEMENT_V2 } from "./agreement-v2.js";
import { AGREEMENT as AGREEMENT_V3 } from "./agreement-v3.js";
import { chargeDayOf, israelDate, PAYMENT_METHODS, paymentSchedule, servicePeriods, withVat } from "./sales-calc.js";
import { HttpError } from "./http.js";
import { str } from "./sales.js";

export const AGREEMENTS = { v1: AGREEMENT_V1, v2: AGREEMENT_V2, v3: AGREEMENT_V3 };
export const CURRENT_AGREEMENT = "v3";

// v3 describes payments set one by one (date, amount, method each). Deals made before that keep the
// deposit % and equal monthly installments, which v2 describes.
export const agreementVersionFor = (deal) => (deal.data?.price?.payments?.length ? CURRENT_AGREEMENT : "v2");

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const contact = (c = {}) => ({ name: str(c.name, 100), role: str(c.role, 100), phone: str(c.phone, 30), email: str(c.email, 160) });

// Normalizes what the sales form sent. Throws 400 on anything unusable.
export function cleanDealData(b, settings) {
  const p = b.project || {};
  const pr = b.price || {};
  const sv = b.service || {};
  const so = b.standingOrder || {};
  const a = b.appendix || {};
  const data = {
    project: {
      name: str(p.name, 160),
      summary: str(p.summary, 1200),
      // the spec is identified by its file (the PDF from Canva); its name comes from the file name
      specName: str(p.specName, 160),
      specVersion: str(p.specVersion, 40),
      specDate: str(p.specDate, 10) || israelDate(),
      specFileId: p.specFileId && /^[0-9a-f-]{36}$/i.test(p.specFileId) ? p.specFileId : null,
      // the file holds only the pages sales picked (Appendix B); these are their numbers in the original
      // Canva PDF and how many pages it had, to say so in the appendix. null: the whole file (older deals)
      specPages: Array.isArray(p.specPages) && p.specPages.length
        ? [...new Set(p.specPages.map((n) => Math.trunc(num(n))).filter((n) => n >= 1 && n <= 500))].sort((a, b) => a - b).slice(0, 100)
        : null,
      specPageCount: Math.trunc(num(p.specPageCount)) > 0 ? Math.min(500, Math.trunc(num(p.specPageCount))) : null,
      targetWeeks: Math.max(0, Math.trunc(num(p.targetWeeks))),
      kickoffNeeds: str(p.kickoffNeeds, 600),
    },
    price: {
      amount: Math.round(num(pr.amount) * 100) / 100,
      // the price before a discount, when sales gave one; `amount` is always the price after it
      listAmount: Math.round(num(pr.listAmount) * 100) / 100 || null,
      vatRate: num(pr.vatRate, settings.vatRate),
      depositPercent: num(pr.depositPercent, settings.depositPercent),
      installments: Math.min(36, Math.max(1, Math.trunc(num(pr.installments, 1)))),
      installmentDay: Math.min(28, Math.max(1, Math.trunc(num(pr.installmentDay, 1)))),
      balanceMethod: pr.balanceMethod === "checks" ? "checks" : "transfer",
      // every payment with its exact date, amount (before VAT) and method; the first is the deposit.
      // When set, it replaces the formula above (kept for deals made before it).
      ...(Array.isArray(pr.payments) && {
        payments: pr.payments.slice(0, 36).map((x) => ({
          date: /^\d{4}-\d{2}-\d{2}$/.test(String(x?.date || "")) ? x.date : "",
          amount: Math.round(num(x?.amount) * 100) / 100,
          method: PAYMENT_METHODS[x?.method] ? x.method : "",
        })),
        // checks: the day a courier collects them (optional)
        checksPickupDate: /^\d{4}-\d{2}-\d{2}$/.test(String(pr.checksPickupDate || "")) ? pr.checksPickupDate : "",
      }),
    },
    service: {
      enabled: sv.enabled !== false,
      // the service is included in the project price until the first charge date (standingOrder.startDate);
      // includedMonths is kept only for deals made before that (agreement v1)
      includedMonths: sv.includedMonths == null ? null : Math.max(0, Math.trunc(num(sv.includedMonths, 3))),
      periods: (sv.periods || []).slice(0, 4).map((x) => ({ months: x.months ? Math.trunc(num(x.months)) : null, price: Math.round(num(x.price) * 100) / 100 }))
        .filter((x) => x.price > 0),
    },
    standingOrder: (() => {
      // a first charge date sets the billing day; without one, the day asked for is used when the
      // project starts (api/_routes/sales/deals.js mark_project_started)
      const start = /^\d{4}-\d{2}-\d{2}$/.test(String(so.startDate || "")) ? so.startDate : "";
      return { enabled: Boolean(so.enabled), startDate: start, dayOfMonth: chargeDayOf(start, so.dayOfMonth) };
    })(),
    appendix: {
      notIncluded: str(a.notIncluded, 2000),
      exclusivity: str(a.exclusivity, 300),
      stages: (a.stages || []).slice(0, 8).map((s) => ({
        name: str(s.name, 120), deliverable: str(s.deliverable, 400), testFiles: str(s.testFiles, 400),
        criteria: str(s.criteria, 600), target: str(s.target, 60),
      })).filter((s) => s.name || s.deliverable),
      testPeriodDays: Math.max(1, Math.trunc(num(a.testPeriodDays, 14))),
      hourlyRates: (Array.isArray(a.hourlyRates) ? a.hourlyRates : settings.hourlyRates || []).slice(0, 8)
        .map((r) => ({ role: str(r.role, 60), rate: Math.round(num(r.rate) * 100) / 100 })).filter((r) => r.role && r.rate > 0),
      serviceComponents: (a.serviceComponents || []).map((x) => str(x, 60)).filter(Boolean).slice(0, 8),
      liabilityCapIncluded: Math.round(num(a.liabilityCapIncluded) * 100) / 100,
      usersCount: str(a.usersCount, 60),
    },
  };
  if (!data.project.name) throw new HttpError(400, "bad_project_name");
  if (!(data.price.amount > 0)) throw new HttpError(400, "bad_price");
  // a "discount" that does not lower the price is no discount
  if (!(data.price.listAmount > data.price.amount)) data.price.listAmount = null;
  const pays = data.price.payments;
  if (pays) {
    if (!pays.length) throw new HttpError(400, "bad_payments");
    if (pays.some((x) => !x.date)) throw new HttpError(400, "bad_payment_date");
    if (pays.some((x) => !(x.amount > 0))) throw new HttpError(400, "bad_payment_amount");
    if (pays.some((x) => !x.method)) throw new HttpError(400, "bad_payment_method");
    const sum = pays.reduce((a, x) => a + Math.round(x.amount * 100), 0);
    if (sum !== Math.round(data.price.amount * 100)) throw new HttpError(400, "bad_payments_sum");
    if (!pays.some((x) => x.method === "check")) data.price.checksPickupDate = "";
  }
  if (data.service.enabled && !data.service.periods.length) throw new HttpError(400, "bad_service_periods");
  // the agreement (clause 6.2) names the date the monthly charge starts
  if (data.service.enabled && !data.standingOrder.startDate) throw new HttpError(400, "bad_first_charge_date");
  return data;
}

export function cleanClient(c = {}) {
  return {
    companyName: str(c.companyName, 160),
    taxId: str(c.taxId, 20),
    address: str(c.address, 200),
    signerName: str(c.signerName, 120),
    signerRole: str(c.signerRole, 80),
    email: str(c.email, 160),
    phone: str(c.phone, 30),
    accountingEmail: str(c.accountingEmail, 160),
    accountingName: str(c.accountingName, 120),
    // clause 4.2: who hands over changes and development requests and approves them for the client
    authorizedContact: contact(c.authorizedContact),
  };
}

// The order page: what was agreed, price, schedule, service. `from`: the approval date (or today)
export function buildOrder(deal, settings, from = israelDate()) {
  const d = deal.data;
  const schedule = paymentSchedule({
    price: d.price.amount, vatRate: d.price.vatRate, depositPercent: d.price.depositPercent,
    installments: d.price.installments, installmentDay: d.price.installmentDay, balanceMethod: d.price.balanceMethod,
    payments: d.price.payments,
  }, from);
  // with payments set one by one, the deposit's share is what its amount comes to
  const depositPercent = d.price.payments?.length && d.price.amount > 0
    ? Math.round((schedule.rows[0].before / d.price.amount) * 1000) / 10
    : d.price.depositPercent;
  const methods = new Set(schedule.rows.map((r) => r.method));
  const checks = schedule.rows.filter((r) => r.method === "check");
  return {
    number: deal.number,
    date: from,
    company: settings.company,
    client: deal.client,
    project: d.project,
    price: {
      amount: d.price.amount, vatRate: d.price.vatRate, total: schedule.total, depositPercent,   // whole shekels, as the schedule
      // the discount, when there is one: the price before it, how much and what share (all before VAT)
      ...(d.price.listAmount > d.price.amount && {
        listAmount: d.price.listAmount,
        discount: Math.round((d.price.listAmount - d.price.amount) * 100) / 100,
        discountPercent: Math.round((1 - d.price.amount / d.price.listAmount) * 1000) / 10,
      }),
    },
    balanceMethod: d.price.balanceMethod,
    schedule,
    // how to pay, frozen with the order: the bank account for transfers, and for checks how many, to whom,
    // and when the courier collects them (the client prepares each one at its amount including VAT)
    payInfo: {
      transfer: methods.has("transfer") || (!d.price.payments && d.price.balanceMethod !== "checks")
        ? { beneficiary: settings.bank.beneficiary, bank: settings.bank.bank, branch: settings.bank.branch, account: settings.bank.account }
        : null,
      checks: checks.length || (!d.price.payments && d.price.balanceMethod === "checks")
        ? { payee: settings.checks.payee, count: checks.length, pickupDate: d.price.checksPickupDate || "", pickupDays: settings.checks.pickupDays }
        : null,
      card: methods.has("card"),
    },
    service: {
      ...d.service,
      rows: servicePeriods(d.service, d.price.vatRate, d.standingOrder?.startDate),
      includes: d.appendix?.serviceComponents?.length ? d.appendix.serviceComponents : settings.service.includes,
    },
    standingOrder: d.standingOrder,
  };
}

// How to pay, as plain lines for the PDF and the emails (the client page says the same in its own layout).
// Orders frozen before payInfo existed get null, and their old wording stays.
export function payInstructions(order) {
  const p = order.payInfo;
  if (!p) return null;
  const dmy = (iso) => String(iso).slice(0, 10).split("-").reverse().join("/");
  const nis = (n) => `${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} ₪`;
  const lines = [];
  if (p.transfer) {
    const b = p.transfer;
    lines.push(`העברה בנקאית: מוטב ${b.beneficiary}${b.bank ? `, בנק ${b.bank}` : ""}${b.branch ? `, סניף ${b.branch}` : ""}${b.account ? `, חשבון ${b.account}` : ""}. אסמכתה: מספר הזמנה ${order.number}.`);
  }
  if (p.checks) {
    const checks = order.schedule.rows.filter((r) => r.method === "check");
    lines.push(`שיקים: נא להכין מראש ${checks.length === 1 ? "שיק אחד" : `${checks.length} שיקים`} לפקודת ${p.checks.payee}, כל שיק על הסכום כולל מע"מ ובתאריך שבטבלה: ${checks.map((r) => `${dmy(r.date)} · ${nis(r.total)}`).join("; ")}.`
      + (p.checks.pickupDate ? ` שליח יאסוף את השיקים ב-${dmy(p.checks.pickupDate)}.` : ` נתאם איתכם את איסוף השיקים בתוך ${p.checks.pickupDays} ימי עסקים מהחתימה.`));
  }
  if (p.card) lines.push("כרטיס אשראי: לקראת מועד התשלום נשלח אליכם קישור מאובטח לתשלום.");
  return lines;
}

// The agreement with its parties and Appendix A, ready to render
export function buildAgreement(deal, settings, version = agreementVersionFor(deal)) {
  const c = deal.client;
  const a = deal.data.appendix;
  const start = deal.data.standingOrder?.startDate;
  // per-deal values in the text (v2 clause 6.2)
  const fill = (s) => String(s).replace(/\{\{firstChargeDate\}\}/g,
    start ? start.split("-").reverse().join("/") : "במועד שהחברה תודיע עליו בכתב");
  const text = JSON.parse(fill(JSON.stringify(AGREEMENTS[version])));
  const authorized = c.authorizedContact?.name || c.authorizedContact?.email ? c.authorizedContact : a.authorizedContact || {};
  const ours = a.companyContact?.name || a.companyContact?.email ? a.companyContact : settings.companyContact || {};
  const rates = a.hourlyRates?.length ? a.hourlyRates : a.hourlyRate ? [{ role: "", rate: a.hourlyRate }] : [];
  return {
    version,
    title: text.title,
    subtitle: text.subtitle,
    parties: {
      company: `${settings.company.name}, ח.פ ${settings.company.taxId}, ${settings.company.address} (להלן: "החברה")`,
      client: `${c.companyName || c.signerName}${c.taxId ? `, ח.פ / ע.מ ${c.taxId}` : ""}${c.address ? `, ${c.address}` : ""} (להלן: "הלקוח")`,
    },
    recitals: text.recitals,
    sections: text.sections,
    appendix: {
      contacts: [
        ["איש הקשר המוסמך מטעם הלקוח (סעיף 4.2)", fmtContact(authorized)],
        ["איש קשר להנהלת חשבונות מטעם הלקוח", fmtContact(a.accountingContact?.name || a.accountingContact?.email ? a.accountingContact : { name: c.accountingName, email: c.accountingEmail })],
        ["איש קשר מטעם החברה", fmtContact(ours)],
      ],
      scope: [
        ["לא כלול (מעבר לכל מה שאינו באפיון המאושר)", a.notIncluded || "—"],
        ["בלעדיות (סעיף 10.6)", a.exclusivity || "לא בלעדי"],
      ],
      stages: a.stages || [],
      testPeriodDays: a.testPeriodDays || 14,
      hourlyRates: rates,
      balanceMethod: deal.data.price.balanceMethod,
      bankAccount: [settings.bank.bank, settings.bank.branch, settings.bank.account].filter(Boolean).join(" · "),
      serviceComponents: a.serviceComponents?.length ? a.serviceComponents : settings.service.includes,
      liabilityCapIncluded: a.liabilityCapIncluded,
      operation: [
        ["מספר משתמשים / תחנות (סעיף 10.2)", a.usersCount || "—"],
      ],
    },
    companySigner: { name: settings.signer.name, role: settings.signer.role, signatureFileId: settings.signer.signatureFileId || null },
  };
}

function fmtContact(c = {}) {
  return [c.name, c.role, c.phone, c.email].filter(Boolean).join(" · ") || "—";
}

// Canonical JSON (sorted keys) for the hash
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`
    : JSON.stringify(v ?? null);

export const snapshotHash = (snapshot) => createHash("sha256").update(canonical(snapshot)).digest("hex");

// An appendix to a signed agreement (sales.deal_appendices.content): a title, free text and, optionally,
// more payments, each with its date, amount before VAT and method. VAT at the deal's rate.
// The payments are informational: nothing is added to the standing order or to collections.
export function cleanAppendix(b, vatRate) {
  const title = str(b.title, 160);
  const body = String(b.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, 20000);
  if (!title) throw new HttpError(400, "bad_title");
  if (!body) throw new HttpError(400, "bad_body");
  const payments = (Array.isArray(b.payments) ? b.payments : []).slice(0, 36).map((x) => {
    const amount = Math.round(num(x?.amount) * 100) / 100;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x?.date || "")) || !(amount > 0) || !PAYMENT_METHODS[x?.method]) throw new HttpError(400, "bad_appendix_payments");
    const total = withVat(amount, vatRate);
    return { date: x.date, amount, method: x.method, vat: Math.round((total - amount) * 100) / 100, total };
  });
  const sum = (k) => Math.round(payments.reduce((a, p) => a + p[k] * 100, 0)) / 100;
  return { title, body, vatRate, payments, totals: { amount: sum("amount"), vat: sum("vat"), total: sum("total") } };
}
