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
    if (!r.ok) throw new Error(`kaspit ${path} http ${r.status}`);
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
                    doc_type = CASE WHEN doc_type = '' THEN $3 ELSE doc_type END, doc_date = COALESCE(doc_date, $4)
              WHERE id = $1`, [same.id, docId, fields.doc_type, fields.doc_date]);
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
                    kaspit_synced_at = now(), updated_at = now() WHERE id = $1`, [deal.id, number, fields.doc_type, fields.doc_date, docId]);
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
                  doc_date, billing_name, notes, source, kaspit_document_id, kaspit_open, kaspit_synced_at)
           VALUES ($1,$2,$3,true,$4,'transfer','pending',$5,$6,$7,$8,$9,'kaspit',$10,true,now())
           ON CONFLICT DO NOTHING RETURNING *`,
          [customer.id, describe(doc), total, fields.due, fields.doc_type, number, fields.doc_date,
            str(doc.CustomerBusinessName, 120) !== customer.name ? str(doc.CustomerBusinessName, 120) : "",
            "יובא מכספית", docId]);
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
