// A deal's content, built once from what sales entered (deal.data), what the client corrected
// (deal.client) and the settings. The order page, the agreement screen, the PDF and the emails all
// render this same object, so a number is never typed twice. When the client approves, the order
// part is frozen; when they sign, the whole thing is frozen with its hash (deal.snapshot).
import { createHash } from "node:crypto";
import { AGREEMENT as AGREEMENT_V1 } from "./agreement-v1.js";
import { billingDayOnOrAfter, israelDate, paymentSchedule, servicePeriods, withVat } from "./sales-calc.js";
import { HttpError } from "./http.js";
import { str } from "./sales.js";

export const AGREEMENTS = { v1: AGREEMENT_V1 };
export const CURRENT_AGREEMENT = "v1";

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
      specName: str(p.specName, 160),
      specVersion: str(p.specVersion, 40),
      specDate: str(p.specDate, 10),
      specFileId: p.specFileId && /^[0-9a-f-]{36}$/i.test(p.specFileId) ? p.specFileId : null,
      targetWeeks: Math.max(0, Math.trunc(num(p.targetWeeks))),
      kickoffNeeds: str(p.kickoffNeeds, 600),
    },
    price: {
      amount: Math.round(num(pr.amount) * 100) / 100,
      vatRate: num(pr.vatRate, settings.vatRate),
      depositPercent: num(pr.depositPercent, settings.depositPercent),
      installments: Math.min(36, Math.max(1, Math.trunc(num(pr.installments, 1)))),
      installmentDay: Math.min(28, Math.max(1, Math.trunc(num(pr.installmentDay, 1)))),
      balanceMethod: pr.balanceMethod === "checks" ? "checks" : "transfer",
    },
    service: {
      enabled: sv.enabled !== false,
      includedMonths: Math.max(0, Math.trunc(num(sv.includedMonths, 3))),
      periods: (sv.periods || []).slice(0, 4).map((x) => ({ months: x.months ? Math.trunc(num(x.months)) : null, price: Math.round(num(x.price) * 100) / 100 }))
        .filter((x) => x.price > 0),
    },
    standingOrder: (() => {
      // a start date moves forward to the billing day, so the first two charges are a month apart
      const dayOfMonth = Math.min(28, Math.max(1, Math.trunc(num(so.dayOfMonth, 1))));
      const start = /^\d{4}-\d{2}-\d{2}$/.test(String(so.startDate || "")) ? billingDayOnOrAfter(so.startDate, dayOfMonth) : "";
      return { enabled: Boolean(so.enabled), startDate: start, dayOfMonth };
    })(),
    appendix: {
      authorizedContact: contact(a.authorizedContact),
      accountingContact: contact(a.accountingContact),
      companyContact: contact(a.companyContact),
      demoFeatures: str(a.demoFeatures, 2000),
      optionalExtensions: str(a.optionalExtensions, 1000),
      notIncluded: str(a.notIncluded, 2000),
      exclusivity: str(a.exclusivity, 300),
      stages: (a.stages || []).slice(0, 8).map((s) => ({
        name: str(s.name, 120), deliverable: str(s.deliverable, 400), testFiles: str(s.testFiles, 400),
        criteria: str(s.criteria, 600), target: str(s.target, 60),
      })).filter((s) => s.name || s.deliverable),
      testPeriodDays: Math.max(1, Math.trunc(num(a.testPeriodDays, 14))),
      hourlyRate: Math.round(num(a.hourlyRate) * 100) / 100,
      serviceComponents: (a.serviceComponents || []).map((x) => str(x, 60)).filter(Boolean).slice(0, 8),
      backupFrequency: str(a.backupFrequency, 60),
      hostingDependent: str(a.hostingDependent, 600),
      liabilityCapIncluded: Math.round(num(a.liabilityCapIncluded) * 100) / 100,
      thirdParty: (a.thirdParty || []).slice(0, 8).map((t) => ({
        component: str(t.component, 120), payer: t.payer === "company" ? "company" : "client", nature: str(t.nature, 200), approval: str(t.approval, 200),
      })).filter((t) => t.component),
      usersCount: str(a.usersCount, 60),
      environment: ["local", "cloud", "mixed"].includes(a.environment) ? a.environment : "",
      softwareVersions: str(a.softwareVersions, 400),
      personalData: a.personalData === "attached" ? "attached" : "na",
    },
  };
  if (!data.project.name) throw new HttpError(400, "bad_project_name");
  if (!(data.price.amount > 0)) throw new HttpError(400, "bad_price");
  if (data.standingOrder.enabled && !data.service.periods.length) throw new HttpError(400, "bad_service_periods");
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
  };
}

// The order page: what was agreed, price, schedule, service. `from`: the approval date (or today)
export function buildOrder(deal, settings, from = israelDate()) {
  const d = deal.data;
  const schedule = paymentSchedule({
    price: d.price.amount, vatRate: d.price.vatRate, depositPercent: d.price.depositPercent,
    installments: d.price.installments, installmentDay: d.price.installmentDay, balanceMethod: d.price.balanceMethod,
  }, from);
  return {
    number: deal.number,
    date: from,
    company: settings.company,
    client: deal.client,
    project: d.project,
    price: { amount: d.price.amount, vatRate: d.price.vatRate, total: withVat(d.price.amount, d.price.vatRate), depositPercent: d.price.depositPercent },
    balanceMethod: d.price.balanceMethod,
    schedule,
    service: { ...d.service, rows: servicePeriods(d.service, d.price.vatRate), includes: settings.service.includes },
    standingOrder: d.standingOrder,
  };
}

// The agreement with its parties and Appendix A, ready to render
export function buildAgreement(deal, settings, version = CURRENT_AGREEMENT) {
  const text = AGREEMENTS[version];
  const c = deal.client;
  const a = deal.data.appendix;
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
        ["איש הקשר המוסמך מטעם הלקוח", fmtContact(a.authorizedContact)],
        ["איש קשר להנהלת חשבונות מטעם הלקוח", fmtContact(a.accountingContact.name || a.accountingContact.email ? a.accountingContact : { name: c.accountingName, email: c.accountingEmail })],
        ["איש קשר מטעם החברה", fmtContact(a.companyContact)],
      ],
      scope: [
        ["יכולות מתוך הדמו שנכללו במפורש", a.demoFeatures || "—"],
        ["הרחבות אופציונליות שהוזמנו", a.optionalExtensions || "לא הוזמנו"],
        ["לא כלול (מעבר לכל מה שאינו באפיון המאושר)", a.notIncluded || "—"],
        ["בלעדיות (סעיף 10.6)", a.exclusivity || "לא בלעדי"],
      ],
      stages: a.stages,
      testPeriodDays: a.testPeriodDays,
      hourlyRate: a.hourlyRate,
      balanceMethod: deal.data.price.balanceMethod,
      bankAccount: [settings.bank.bank, settings.bank.branch, settings.bank.account].filter(Boolean).join(" · "),
      serviceComponents: a.serviceComponents,
      backupFrequency: a.backupFrequency,
      hostingDependent: a.hostingDependent,
      liabilityCapIncluded: a.liabilityCapIncluded,
      thirdParty: a.thirdParty,
      operation: [
        ["מספר משתמשים / תחנות (סעיף 10.2)", a.usersCount || "—"],
        ["סביבת הפעלה", { local: "מקומית אצל הלקוח", cloud: "ענן של החברה", mixed: "משולב" }[a.environment] || "—"],
        ["תוכנות וגרסאות שהלקוח יחזיק (סעיף 3.4)", a.softwareVersions || "—"],
        ["עיבוד מידע אישי (סעיף 11.5)", a.personalData === "attached" ? "נספח עיבוד מידע מצורף" : "לא רלוונטי"],
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
