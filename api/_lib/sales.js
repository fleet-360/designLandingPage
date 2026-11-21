// Shared by api/_routes/sales/* and billing/*: settings, tokens, the event log, the email outbox and
// the spec request's payment. See sales/README.md.
import { randomBytes } from "node:crypto";
import { query } from "./db.js";
import { callToro } from "./toro.js";
import { HttpError } from "./http.js";

export const newToken = () => randomBytes(18).toString("base64url");

// ---- Settings (sales.settings, edited on /contracts/settings) ----

export const DEFAULT_SETTINGS = {
  company: {
    name: 'פרו אלגוריתם בע"מ',
    taxId: "517124608",
    address: "הרברט סמואל 51, חדרה",
    phone: "052-6247267",
    website: "pro-algo.com",
  },
  officeEmail: "sales@pro-algorithm.co.il",
  accountingContact: { name: "", phone: "052-6247267", email: "sales@pro-algorithm.co.il" },
  bank: { beneficiary: 'פרו אלגוריתם בע"מ', bank: "", branch: "", account: "" },
  checks: { payee: 'פרו אלגוריתם בע"מ', pickupDays: 7 },
  signer: { name: "", role: "", signatureFileId: null },
  // our contact in Appendix A of every deal
  companyContact: { name: "ליאת", role: "", phone: "053-946-2842", email: "accounts@pro-algorithm.co.il" },
  // hourly rates by role (Appendix A; clauses 8 and 9.2), before VAT; each deal starts from these
  hourlyRates: [{ role: "מתכנת", rate: 360 }, { role: "ראש צוות", rate: 450 }],
  vatRate: 18,
  depositPercent: 30,
  discovery: {
    title: "ספרינט תכנון ומיפוי",
    defaultPrice: 999,
    meetingMinutes: 60,
  },
  calendar: {
    user: "developers@pro-algo.com",
    days: [0, 1, 2, 3, 4],          // Sunday..Thursday
    from: "09:00",
    to: "17:00",
    daysAhead: 14,
    minNoticeHours: 24,
    slotsToOffer: 8,
    bufferMinutes: 15,
  },
  service: {
    // the options sales picks from for each deal's monthly service
    includes: ["תמיכה ומענה", "הדרכות", "תיקון תקלות", "אירוח ועדכוני אבטחה", "סקירת AI רבעונית ללא עלות"],
  },
};

const merge = (base, over) => {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  }
  return out;
};

export async function getSettings() {
  const { rows } = await query("SELECT value FROM sales.settings WHERE key = 'main'");
  return merge(DEFAULT_SETTINGS, rows[0]?.value || {});
}

export async function saveSettings(value) {
  await query(
    `INSERT INTO sales.settings (key, value) VALUES ('main', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(value)]);
}

// ---- Event log ----

export async function logEvent(entity, entityId, type, detail = null, db = { query }) {
  await db.query("INSERT INTO sales.events (entity, entity_id, type, detail) VALUES ($1, $2, $3, $4)",
    [entity, entityId, type, detail ? JSON.stringify(detail) : null]);
}

export async function events(entity, entityId) {
  const { rows } = await query(
    "SELECT at, type, detail FROM sales.events WHERE entity = $1 AND entity_id = $2 ORDER BY at, id", [entity, entityId]);
  return rows.map((r) => ({ at: r.at.toISOString(), type: r.type, detail: r.detail }));
}

// ---- Email: queued here, sent by Toro (cars-server proAlgoSales /mail) ----

const cleanList = (v) => [...new Set([].concat(v || []).map((s) => String(s || "").trim()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)))];

// mail: { entity, entityId, kind, to, cc, replyTo, subject, html, attachments: [{ filename, fileId }] }
// -> { id, sent, error }
export async function sendMail(mail) {
  const to = cleanList(mail.to);
  if (!to.length) return { id: null, sent: false, error: "no_recipient" };
  const { rows } = await query(
    `INSERT INTO sales.outbox (entity, entity_id, kind, to_list, cc_list, reply_to, subject, html, attachments)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [mail.entity || null, mail.entityId || null, mail.kind, to, cleanList(mail.cc), mail.replyTo || null,
      mail.subject, mail.html, JSON.stringify((mail.attachments || []).map((a) => ({ filename: a.filename, file_id: a.fileId })))]);
  const id = rows[0].id;
  const r = await callToro("/proAlgoSales/mail", { id });
  if (!r.ok) {
    await query("UPDATE sales.outbox SET status = 'failed', error = $2 WHERE id = $1 AND status <> 'sent'", [id, r.error || "failed"]);
    console.warn(`[sales] mail ${mail.kind} ${id} not sent: ${r.error}`);
  }
  return { id, sent: r.ok, error: r.ok ? null : r.error };
}

export async function mailsFor(entity, entityId) {
  const { rows } = await query(
    `SELECT id, created_at, kind, to_list, subject, status, sent_at, error FROM sales.outbox
      WHERE entity = $1 AND entity_id = $2 ORDER BY created_at`, [entity, entityId]);
  return rows.map((r) => ({
    id: r.id, at: r.created_at.toISOString(), kind: r.kind, to: r.to_list, subject: r.subject,
    status: r.status, sentAt: r.sent_at ? r.sent_at.toISOString() : null, error: r.error,
  }));
}

// ---- Spec request payment (reported by Toro through /api/pay/paid, or marked by hand) ----

// payer: what the client typed in the payment form; fills the request's contact details when sales left them empty
// amount: what the client actually paid (VAT included), when the payment came through Grow. The browser
// sends the sum to Grow, so a payment below the price is reported to the office and not marked paid.
export async function markDiscoveryPaid(id, { via, ref, payer = {}, amount = null }) {
  if (amount !== null) {
    const cur = (await query("SELECT * FROM sales.discovery WHERE id = $1", [id])).rows[0];
    if (!cur) return null;
    const { withVat } = await import("./sales-calc.js");
    const due = withVat(cur.price, cur.vat_rate);
    if (!(Number(amount) + 0.01 >= due)) {
      await logEvent("discovery", id, "underpaid", { via, ref: ref || null, amount: Number(amount), due });
      const { discoveryUnderpaidMail } = await import("./sales-mail.js");
      await sendMail({ ...discoveryUnderpaidMail(cur, await getSettings(), Number(amount), due), entity: "discovery", entityId: id, kind: "discovery_underpaid_office" });
      return null;
    }
  }
  const email = isEmail(payer.email) ? str(payer.email, 160).toLowerCase() : null;
  const { rows } = await query(
    `UPDATE sales.discovery SET status = CASE WHEN status IN ('sent','viewed') THEN 'paid' ELSE status END,
            paid_at = COALESCE(paid_at, now()), paid_via = COALESCE(paid_via, $2), payment_ref = COALESCE(payment_ref, $3),
            email = COALESCE(email, $4), phone = COALESCE(phone, $5), updated_at = now()
      WHERE id = $1 AND canceled_at IS NULL AND paid_at IS NULL RETURNING *`, [id, via, ref || null, email, str(payer.phone, 30) || null]);
  if (!rows[0]) return null;
  await logEvent("discovery", id, "paid", { via, ref: ref || null });
  const { discoveryPaidMail } = await import("./sales-mail.js");
  const settings = await getSettings();
  await sendMail({ ...discoveryPaidMail(rows[0], settings, amount), entity: "discovery", entityId: id, kind: "discovery_paid_office" });
  return rows[0];
}

// ---- Small helpers ----

export const str = (v, max = 300) => {
  if (v === null || v === undefined) return "";
  return String(v).trim().slice(0, max);
};

export const money = (v, field = "amount") => {
  const n = Math.round(Number(v) * 100) / 100;
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpError(400, `bad_${field}`);
  return n;
};

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "").trim());

// What Grow accepts (the same checks as contracts/src/sales/lib.js): an Israeli mobile -> "05XXXXXXXX",
// an ID / company number with its check digit -> 9 digits; "" when not valid
export const mobileIL = (v) => {
  const d = String(v || "").replace(/[^\d+]/g, "").replace(/^\+?972/, "0");
  return /^05\d{8}$/.test(d) ? d : "";
};
export const taxIdIL = (v) => {
  const s = String(v || "").replace(/[\s-]/g, "");
  if (!/^\d{5,9}$/.test(s) || !Number(s)) return "";
  const p = s.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) { const x = Number(p[i]) * ((i % 2) + 1); sum += x > 9 ? x - 9 : x; }
  return sum % 10 === 0 ? p : "";
};
