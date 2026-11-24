// Kaspit (כספית) → collections: every open (unpaid) invoice appears as a payment to collect. Runs every two hours
// (GitHub Actions calls /api/collections/kaspit-cron, see .github/workflows/collections-kaspit.yml) and from the
// "sync now" button. Credentials: CASPIT_USER, CASPIT_PASSWORD, CASPIT_OSEK_MORSHE (the same login Toro uses,
// cars-server/caspit). One payment per document number:
//   1. a payment with the same document number exists (typed by hand, an earlier sync): it is that payment;
//   2. else an open payment of a signed deal, same customer, same amount, no document yet: the document is
//      attached to it (the invoice for that installment), so the debt is not counted twice;
//   3. else a new payment, under the customer with the document's business number (or name), created if needed.
// A document this sync saw open before and that is no longer open was paid: its payment is marked paid.
import { query, transaction } from "./db.js";
import { HttpError } from "./http.js";
import { VAT_RATE, docNumber, findCustomer, findOrCreateCustomer, isoDate, logActivity, str, syncPickups, taxId } from "./collections.js";
import { israelDate } from "./sales-calc.js";

const BASE = "https://app.caspit.biz/api/v1/";
// Kaspit TrxTypeId -> our document type. Only documents that ask for money: credit notes (9) and receipts are not debts.
const TYPES = { 1: "tax_invoice", 6: "deal_invoice" };
const TYPE_LABELS = { 1: "חשבונית מס", 6: "חשבונית עסקה" };
const CANCELLED = 3;
const DRAFT = 0;
const SYNC_USER = "סנכרון כספית";
const LOCK = 727_281;   // pg advisory lock: one sync at a time

async function caspit(path, params) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    const text = await r.text();
    if (!r.ok) throw Object.assign(new Error(`kaspit ${path} http ${r.status}`), { httpStatus: r.status });
    try { return JSON.parse(text); } catch { return text; }
  } finally {
    clearTimeout(t);
  }
}

export async function kaspitToken() {
  const v = await caspit("Token", { user: process.env.CASPIT_USER, pwd: process.env.CASPIT_PASSWORD, osekmorshe: process.env.CASPIT_OSEK_MORSHE });
  const token = typeof v === "string" ? v : v?.token;
  // a failed login can come back as 200 with an error word instead of a token
  if (typeof token !== "string" || token.length < 20 || /USER_DOES_NOT_EXIST|BAD_PASSWORD|INVALID_OSEK|Login Result|error/i.test(token)) {
    throw new Error("kaspit login failed");
  }
  return token.replace(/^"|"$/g, "");
}

/** Every open document of the types above, all pages. Throws when any page fails (then nothing is closed). */
export async function openDocuments(token) {
  const out = [];
  for (const type of Object.keys(TYPES)) {
    for (let page = 0, pages = 1; page < pages && page < 100; page++) {
      const r = await caspit("Documents", { token, trxTypeId: type, onlyOpenDocuments: "true", page });
      if (!r || typeof r !== "object" || !Array.isArray(r.Results)) throw new Error(`kaspit documents type ${type}: bad answer`);
      pages = Number(r.TotalPages) || 0;
      for (const doc of r.Results) {
        // Kaspit's filter is by type; keep only what was asked for, final and not cancelled
        if (Number(doc.TrxTypeId) !== Number(type) || doc.Status === CANCELLED || doc.Status === DRAFT) continue;
        out.push(doc);
      }
    }
  }
  return out;
}

const money = (v) => Math.round(Number(String(v ?? 0).replace(/,/g, "")) * 100) / 100;

function describe(doc) {
  const line = Array.isArray(doc.DocumentLines) ? doc.DocumentLines.find((l) => str(l?.Details || l?.Description)) : null;
  const text = str(doc.Details, 200) || str(line?.Details || line?.Description, 200);
  return text || `${TYPE_LABELS[doc.TrxTypeId] || "מסמך"} ${docNumber(doc.Number)}`;
}

/**
 * One sync. trigger: "schedule" | "manual". -> { ok, skipped?, stats }
 * The schedule skips a run when the last good one was under 100 minutes ago, so calling the endpoint often
 * (or by anyone: it returns only counts) costs nothing.
 */
export async function syncKaspit(trigger) {
  if (!process.env.CASPIT_USER || !process.env.CASPIT_PASSWORD || !process.env.CASPIT_OSEK_MORSHE) {
    return { ok: false, skipped: "not_configured" };
  }
  if (trigger === "schedule") {
    const last = await query(
      "SELECT 1 FROM collections.sync_runs WHERE source = 'kaspit' AND ok AND started_at > now() - interval '100 minutes' LIMIT 1");
    if (last.rows[0]) return { ok: true, skipped: "recent" };
  }
  const run = (await query("INSERT INTO collections.sync_runs (trigger) VALUES ($1) RETURNING id", [trigger])).rows[0].id;
  const stats = { open: 0, linked: 0, attached: 0, added: 0, customersAdded: 0, closed: 0, updated: 0 };
  try {
    const token = await kaspitToken();
    const docs = await openDocuments(token);
    stats.open = docs.length;
    const own = taxId(process.env.CASPIT_OSEK_MORSHE);
    const result = await transaction(async (db) => {
      const locked = (await db.query("SELECT pg_try_advisory_xact_lock($1) AS ok", [LOCK])).rows[0].ok;
      if (!locked) return { busy: true };
      const seen = new Set();
      const seenIds = new Set();
      const touched = new Set();
      for (const doc of docs) {
        const number = docNumber(doc.Number);
        const docId = str(doc.DocumentId, 80) || null;
        if (!number) continue;
        // a document to our own business number is not a customer's debt
        if (own && taxId(doc.CustomerOsekMorshe) === own) { stats.ownSkipped = (stats.ownSkipped || 0) + 1; continue; }
        seen.add(number);
        if (docId) seenIds.add(docId);
        const total = money(doc.Total);
        const fields = {
          doc_type: TYPES[doc.TrxTypeId], doc_date: isoDate(doc.Date), due: isoDate(doc.DueDate) || isoDate(doc.Date),
        };

        // 1. the document is already here (same number, or the same Kaspit document under an old number)
        const same = (await db.query(
          "SELECT * FROM collections.payments WHERE doc_number = $1 OR (kaspit_document_id IS NOT NULL AND kaspit_document_id = $2) LIMIT 1",
          [number, docId])).rows[0];
        if (same) {
          await db.query(
            `UPDATE collections.payments SET kaspit_document_id = COALESCE(kaspit_document_id, $2), kaspit_open = true, kaspit_synced_at = now(),
                    doc_type = CASE WHEN doc_type = '' THEN $3 ELSE doc_type END, doc_date = COALESCE(doc_date, $4),
                    kaspit_trx_type = COALESCE(kaspit_trx_type, $5)
              WHERE id = $1`, [same.id, docId, fields.doc_type, fields.doc_date, Number(doc.TrxTypeId)]);
          stats.linked += 1;
          continue;
        }

        const tid = taxId(doc.CustomerOsekMorshe);
        const who = { name: doc.CustomerBusinessName, tax_id: tid && tid !== own ? tid : null };
        // 2. the invoice for a payment already here without its document: same customer, same amount with VAT
        //    (to the shekel), still open. A signed deal's installment first, then the earliest due.
        const known = await findCustomer(db, who);
        const deal = known ? (await db.query(
          `SELECT * FROM collections.payments
            WHERE customer_id = $1 AND status IN ('pending', 'blocked') AND (doc_number IS NULL OR doc_number = '')
              AND abs(CASE WHEN vat_included THEN amount ELSE round(amount * ${1 + VAT_RATE}, 2) END - $2) < 1
            ORDER BY (source = 'deal') DESC, due_date NULLS LAST, created_at LIMIT 1`, [known.id, total])).rows[0] : null;
        if (deal) {
          await db.query(
            `UPDATE collections.payments SET doc_number = $2, doc_type = $3, doc_date = $4, kaspit_document_id = $5, kaspit_open = true,
                    kaspit_trx_type = $6, kaspit_synced_at = now(), updated_at = now() WHERE id = $1`,
            [deal.id, number, fields.doc_type, fields.doc_date, docId, Number(doc.TrxTypeId)]);
          await logActivity(db, SYNC_USER, {
            action: "update", entity: "payment", record_id: deal.id, title: deal.description || "תשלום",
            details: `שויך למסמך ${number} מכספית`, snapshot: deal,
          });
          stats.attached += 1;
          continue;
        }

        // 3. a new payment
        const { row: customer, created } = known ? { row: known, created: false } : await findOrCreateCustomer(db, {
          ...who,
          contact_person: doc.CustomerContactName,
          phone: doc.MobilePhone,
          email: doc.CustomerEmail,
          notes: "נוצר מסנכרון כספית",
        }, "kaspit", SYNC_USER);
        if (created) stats.customersAdded += 1;
        const ins = await db.query(
          `INSERT INTO collections.payments (customer_id, description, amount, vat_included, due_date, method, status, doc_type, doc_number,
                  doc_date, billing_name, notes, source, kaspit_document_id, kaspit_open, kaspit_synced_at, kaspit_trx_type)
           VALUES ($1,$2,$3,true,$4,'transfer','pending',$5,$6,$7,$8,$9,'kaspit',$10,true,now(),$11)
           ON CONFLICT DO NOTHING RETURNING *`,
          [customer.id, describe(doc), total, fields.due, fields.doc_type, number, fields.doc_date,
            str(doc.CustomerBusinessName, 120) !== customer.name ? str(doc.CustomerBusinessName, 120) : "",
            "יובא מכספית", docId, Number(doc.TrxTypeId)]);
        if (ins.rows[0]) {
          stats.added += 1;
          touched.add(customer.id);
          await logActivity(db, SYNC_USER, {
            action: "create", entity: "payment", record_id: ins.rows[0].id, title: ins.rows[0].description, customer_name: customer.name,
            details: `${TYPE_LABELS[doc.TrxTypeId]} ${number} מכספית`,
          });
        }
      }

      // documents seen open before and not open now were paid in Kaspit. A fetch that came back empty while
      // several were open is more likely a Kaspit hiccup than everyone paying at once: then nothing is closed.
      const wasOpen = (await db.query("SELECT * FROM collections.payments WHERE kaspit_open = true")).rows;
      const gone = wasOpen.filter((p) => !seen.has(p.doc_number) && !seenIds.has(p.kaspit_document_id));
      if (!(docs.length === 0 && wasOpen.length >= 3)) {
        for (const p of gone) {
          await db.query(
            `UPDATE collections.payments SET kaspit_open = false, kaspit_synced_at = now(),
                    status = CASE WHEN status = 'pending' THEN 'paid' ELSE status END,
                    paid_date = CASE WHEN status = 'pending' THEN $2::date ELSE paid_date END, updated_at = now()
              WHERE id = $1`, [p.id, israelDate()]);
          if (p.status === "pending") {
            stats.closed += 1;
            touched.add(p.customer_id);
            await logActivity(db, SYNC_USER, {
              action: "update", entity: "payment", record_id: p.id, title: p.description || "תשלום",
              details: `המסמך ${p.doc_number} שולם בכספית: סומן כשולם`, snapshot: p,
            });
          }
        }
      } else {
        stats.closeSkipped = gone.length;
      }
      for (const id of touched) await syncPickups(db, id);
      return { busy: false };
    });
    if (result.busy) {
      await query("UPDATE collections.sync_runs SET finished_at = now(), ok = false, error = 'busy' WHERE id = $1", [run]);
      return { ok: false, skipped: "busy" };
    }
    await query("UPDATE collections.sync_runs SET finished_at = now(), ok = true, stats = $2 WHERE id = $1", [run, JSON.stringify(stats)]);
    return { ok: true, stats };
  } catch (err) {
    console.error("[collections] kaspit sync failed:", err);
    await query("UPDATE collections.sync_runs SET finished_at = now(), ok = false, error = $2, stats = $3 WHERE id = $1",
      [run, String(err.message || err).slice(0, 300), JSON.stringify(stats)]).catch(() => {});
    return { ok: false, error: "sync_failed", stats };
  }
}

// ---- documents for the screen: view an invoice, link a payment to a Kaspit document ----

// Kaspit TrxTypeId <-> our doc_type, for the document kinds a payment can be tied to
const LINKABLE = { 1: "tax_invoice", 6: "deal_invoice", 7: "invoice_receipt", 2: "receipt" };
const LINKABLE_LABELS = { 1: "חשבונית מס", 6: "חשבונית עסקה", 7: "חשבונית מס קבלה", 2: "קבלה" };
const TRX_OF = { tax_invoice: 1, deal_invoice: 6, invoice_receipt: 7, receipt: 2 };

function needKaspit() {
  if (!process.env.CASPIT_USER || !process.env.CASPIT_PASSWORD || !process.env.CASPIT_OSEK_MORSHE) {
    throw new HttpError(503, "kaspit_not_configured");
  }
}

// a Kaspit call from a screen action: Kaspit being down is a 502 the screen explains, not a 500
async function kaspitCall(fn) {
  needKaspit();
  try {
    return await fn(await kaspitToken());
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("[collections] kaspit:", err.message);
    throw new HttpError(502, "kaspit_unavailable");
  }
}

async function allDocuments(token, type, onlyOpen) {
  const out = [];
  for (let page = 0, pages = 1; page < pages && page < 100; page++) {
    const q = { token, trxTypeId: type, page };
    if (onlyOpen) q.onlyOpenDocuments = "true";
    const r = await caspit("Documents", q);
    if (!r || typeof r !== "object" || !Array.isArray(r.Results)) throw new Error(`kaspit documents type ${type}: bad answer`);
    pages = Number(r.TotalPages) || 0;
    for (const doc of r.Results) {
      if (Number(doc.TrxTypeId) !== Number(type) || doc.Status === CANCELLED || doc.Status === DRAFT) continue;
      out.push(doc);
    }
  }
  return out;
}

const docView = (doc, open) => ({
  id: str(doc.DocumentId, 80),
  number: docNumber(doc.Number),
  trx_type: Number(doc.TrxTypeId),
  doc_type: LINKABLE[doc.TrxTypeId] || "other",
  type_label: LINKABLE_LABELS[doc.TrxTypeId] || "מסמך",
  customer: str(doc.CustomerBusinessName, 120),
  tax_id: taxId(doc.CustomerOsekMorshe) || "",
  total: money(doc.Total),
  date: isoDate(doc.Date) || "",
  due: isoDate(doc.DueDate) || "",
  details: describe(doc),
  open,
});

/**
 * The documents a payment can be linked to: invoices (open and paid) and invoice-receipts, newest first, each with
 * the payment it is already linked to, if any. Documents to the business's own number are left out.
 */
export async function kaspitDocuments() {
  const docs = await kaspitCall(async (token) => {
    const [inv, deal, ir, open1, open6] = await Promise.all([
      allDocuments(token, 1, false), allDocuments(token, 6, false), allDocuments(token, 7, false),
      allDocuments(token, 1, true), allDocuments(token, 6, true),
    ]);
    const openIds = new Set([...open1, ...open6].map((d) => str(d.DocumentId, 80)));
    const own = taxId(process.env.CASPIT_OSEK_MORSHE);
    return [...inv, ...deal, ...ir]
      .filter((d) => !(own && taxId(d.CustomerOsekMorshe) === own))
      .map((d) => docView(d, openIds.has(str(d.DocumentId, 80))));
  });
  const linked = await query(
    `SELECT p.id, p.doc_number, p.kaspit_document_id, c.name AS customer_name
       FROM collections.payments p JOIN collections.customers c ON c.id = p.customer_id
      WHERE p.kaspit_document_id IS NOT NULL OR (p.doc_number IS NOT NULL AND p.doc_number <> '')`);
  const byId = new Map(), byNumber = new Map();
  for (const r of linked.rows) {
    const v = { payment_id: r.id, customer_name: r.customer_name };
    if (r.kaspit_document_id) byId.set(r.kaspit_document_id, v);
    if (r.doc_number) byNumber.set(r.doc_number, v);
  }
  return docs
    .map((d) => ({ ...d, linked: byId.get(d.id) || byNumber.get(d.number) || null }))
    .sort((a, b) => Number(b.open) - Number(a.open) || b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
}

/**
 * The fields a payment takes from the Kaspit document it is linked to (the payment dialog's "link to Kaspit").
 * Kaspit is the source of truth for the number, type and date; open = unpaid in Kaspit right now.
 */
export async function kaspitLinkFields(documentId) {
  const id = str(documentId, 80);
  if (!/^[0-9a-f-]{20,80}$/i.test(id)) throw new HttpError(400, "bad_kaspit_document");
  return kaspitCall(async (token) => {
    const doc = await caspit(`Documents/${encodeURIComponent(id)}`, { token }).catch((err) => {
      if (err.httpStatus === 404) throw new HttpError(404, "kaspit_doc_not_found");
      throw err;
    });
    if (!doc || typeof doc !== "object" || str(doc.DocumentId, 80).toLowerCase() !== id.toLowerCase()) {
      throw new HttpError(404, "kaspit_doc_not_found");
    }
    const type = Number(doc.TrxTypeId);
    if (!LINKABLE[type] || doc.Status === CANCELLED || doc.Status === DRAFT) throw new HttpError(400, "bad_kaspit_document");
    const open = type === 1 || type === 6
      ? (await allDocuments(token, type, true)).some((d) => str(d.DocumentId, 80) === str(doc.DocumentId, 80))
      : false;
    return {
      doc_number: docNumber(doc.Number), doc_type: LINKABLE[type], doc_date: isoDate(doc.Date),
      kaspit_document_id: str(doc.DocumentId, 80), kaspit_trx_type: type, kaspit_open: open,
    };
  });
}

async function printDocument(token, documentId, type) {
  const url = `${BASE}Documents/${encodeURIComponent(documentId)}?${new URLSearchParams({ token, trxTypeId: type })}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const r = await fetch(url, { method: "PRINT", signal: ctrl.signal });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok || buf.subarray(0, 4).toString() !== "%PDF") throw new Error(`kaspit print http ${r.status}`);
    return buf;
  } finally {
    clearTimeout(t);
  }
}

/**
 * The PDF of a payment's document, printed by Kaspit. A payment with a document number but no Kaspit id yet (typed
 * by hand, imported) is looked up by number once, and the id is kept for next time. -> { pdf, name }
 */
export async function paymentDocumentPdf(paymentId) {
  const p = (await query("SELECT * FROM collections.payments WHERE id = $1", [paymentId])).rows[0];
  if (!p) throw new HttpError(404, "not_found");
  if (!p.kaspit_document_id && !p.doc_number) throw new HttpError(404, "kaspit_doc_not_found");
  return kaspitCall(async (token) => {
    let id = p.kaspit_document_id;
    let type = p.kaspit_trx_type || TRX_OF[p.doc_type] || 1;
    if (!id) {
      const order = [...new Set([TRX_OF[p.doc_type], 1, 7, 6, 2].filter(Boolean))];
      let found = null;
      for (const t of order) {
        found = (await allDocuments(token, t, false)).find((d) => docNumber(d.Number) === p.doc_number);
        if (found) break;
      }
      if (!found) throw new HttpError(404, "kaspit_doc_not_found");
      id = str(found.DocumentId, 80);
      type = Number(found.TrxTypeId);
      // keep it, unless another payment already holds that document
      await query(
        `UPDATE collections.payments SET kaspit_document_id = $2, kaspit_trx_type = $3
          WHERE id = $1 AND kaspit_document_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM collections.payments WHERE kaspit_document_id = $2)`, [p.id, id, type]).catch(() => {});
    }
    return { pdf: await printDocument(token, id, type), name: `${(p.doc_number || "document").replace(/[^\w.-]+/g, "-")}.pdf` };
  });
}
