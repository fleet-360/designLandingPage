// גבייה (collections): customers, payment schedules, check pickups and their change log (schema
// `collections`, db/migrations/014). The admin screen is contracts/src/pages/collections/; the routes are
// api/_routes/collections/*. Payments arrive three ways: typed by hand, from a deal when it is signed
// (syncSignedDeal, called by both signing paths) and from Kaspit's open documents (collections-kaspit.js).
// A document number belongs to one payment only (unique index), whichever way it came in.
import { query, transaction } from "./db.js";
import { HttpError } from "./http.js";
import { israelDate } from "./sales-calc.js";

export const METHODS = ["check", "transfer", "cash", "credit", "other"];
export const STATUSES = ["pending", "paid", "blocked", "cancelled"];
export const PICKUP_STATUSES = ["scheduled", "collected", "cancelled"];
export const DOC_TYPES = ["tax_invoice", "deal_invoice", "invoice_receipt", "receipt", "other"];
const STATUS_LABELS = { pending: "ממתין", paid: "שולם", blocked: "לא לגבות", cancelled: "בוטל" };
const PICKUP_LABELS = { scheduled: "מתוכנן", collected: "נאסף", cancelled: "בוטל" };
export const VAT_RATE = 0.18;

// ---- small helpers ----

export const str = (v, max = 200) => String(v ?? "").replace(/[​-‏‪-‮⁠-⁩﻿]/g, "").trim().slice(0, max);
export const isoDate = (v) => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
// "01/3008", " 01 / 3008 " -> "01/3008"; empty -> null
export const docNumber = (v) => {
  const s = str(v, 40).replace(/\s+/g, "");
  return s || null;
};
// ח.פ / ע.מ / ת.ז -> 9 digits, or null
export const taxId = (v) => {
  const s = String(v ?? "").replace(/\D/g, "");
  if (s.length < 5 || s.length > 9 || !Number(s)) return null;
  return s.padStart(9, "0");
};
const amount = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) throw new HttpError(400, "bad_amount");
  return Math.round(n * 100) / 100;
};
export const withVat = (p) => (p.vat_included === false ? Math.round(Number(p.amount) * (1 + VAT_RATE) * 100) / 100 : Number(p.amount));
// a name as people write it, for matching ("בע״מ", quotes and spaces aside)
const nameKey = (s) => String(s || "").replace(/בע["״'׳]?מ|בעמ|\(.*?\)/g, "").replace(/["״'׳.,\-\s]/g, "").toLowerCase();

// ---- rows as the screen reads them (dates as "YYYY-MM-DD" or "", amounts as numbers) ----

const d = (v) => (v ? String(v).slice(0, 10) : "");
export const customerView = (r) => ({
  id: r.id, name: r.name, tax_id: r.tax_id || "", contact_person: r.contact_person, phone: r.phone, email: r.email,
  internal_owner: r.internal_owner, project_stages: r.project_stages, notes: r.notes, source: r.source,
  created_at: r.created_at,
});
export const paymentView = (r) => ({
  id: r.id, customer_id: r.customer_id, description: r.description, milestone: r.milestone,
  amount: Number(r.amount), vat_included: r.vat_included, due_date: d(r.due_date), method: r.method, status: r.status,
  doc_type: r.doc_type, doc_number: r.doc_number || "", doc_date: d(r.doc_date), receipt_number: r.receipt_number,
  receipt_date: d(r.receipt_date), billing_name: r.billing_name, check_number: r.check_number,
  collection_date: d(r.collection_date), check_received: r.check_received, paid_date: d(r.paid_date),
  needs_review: r.needs_review, notes: r.notes, source: r.source, deal_id: r.deal_id, deal_row: r.deal_row,
  kaspit_open: r.kaspit_open,
});
export const pickupView = (r) => ({
  id: r.id, customer_id: r.customer_id, customer_name: r.customer_name, collection_date: d(r.collection_date),
  status: r.status, check_count: r.check_count, total_amount: Number(r.total_amount), contact_person: r.contact_person,
  address: r.address, notes: r.notes, manual: r.manual,
});

// ---- change log ----

/** One history entry. History never blocks the action itself. */
export async function logActivity(db, user, e) {
  try {
    await db.query(
      `INSERT INTO collections.activity (action, entity, record_id, title, customer_name, user_name, details, snapshot, restorable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [e.action, e.entity, String(e.record_id || ""), str(e.title, 200), str(e.customer_name, 200), str(user || "", 120),
        str(e.details, 500), e.snapshot ? JSON.stringify(e.snapshot) : null, e.restorable !== false]);
  } catch (err) {
    console.warn("[collections] activity log failed:", err.message);
  }
}

// ---- reads ----

export async function board() {
  const [c, p, k, s] = await Promise.all([
    query("SELECT * FROM collections.customers ORDER BY name"),
    query("SELECT * FROM collections.payments ORDER BY due_date NULLS LAST, created_at"),
    query("SELECT * FROM collections.check_pickups ORDER BY collection_date"),
    query(`SELECT started_at, finished_at, ok, stats, error, trigger FROM collections.sync_runs
            WHERE source = 'kaspit' ORDER BY started_at DESC LIMIT 1`),
  ]);
  const payments = p.rows.map(paymentView);
  return {
    customers: c.rows.map((r) => ({ ...customerView(r), payments: payments.filter((x) => x.customer_id === r.id) })),
    collections: k.rows.map(pickupView),
    lastSync: s.rows[0] || null,
    kaspitConfigured: kaspitConfigured(),
  };
}

export const kaspitConfigured = () =>
  Boolean(process.env.CASPIT_USER && process.env.CASPIT_PASSWORD && process.env.CASPIT_OSEK_MORSHE);

export async function activity(limit = 300) {
  const r = await query("SELECT * FROM collections.activity ORDER BY created_at DESC LIMIT $1", [limit]);
  return r.rows.map((a) => ({
    id: a.id, action: a.action, entity: a.entity, record_id: a.record_id, title: a.title, customer_name: a.customer_name,
    user_name: a.user_name, details: a.details, restorable: a.restorable && (a.action === "create" || Boolean(a.snapshot)),
    created_at: a.created_at,
  }));
}

async function one(db, table, id) {
  const r = await db.query(`SELECT * FROM collections.${table} WHERE id = $1`, [id]);
  if (!r.rows[0]) throw new HttpError(404, "not_found");
  return r.rows[0];
}

// ---- customers ----

function customerFields(b) {
  const name = str(b.name, 120);
  if (!name) throw new HttpError(400, "bad_customer");
  return {
    name,
    tax_id: taxId(b.tax_id),
    contact_person: str(b.contact_person, 120),
    phone: str(b.phone, 40),
    email: str(b.email, 160),
    internal_owner: str(b.internal_owner, 80),
    project_stages: str(b.project_stages, 2000),
    notes: str(b.notes, 1000),
  };
}

export async function saveCustomer(b, user) {
  const v = customerFields(b);
  return transaction(async (db) => {
    if (b.id) {
      const before = await one(db, "customers", b.id);
      const r = await db.query(
        `UPDATE collections.customers SET name=$2, tax_id=$3, contact_person=$4, phone=$5, email=$6, internal_owner=$7,
                project_stages=$8, notes=$9, updated_at=now() WHERE id=$1 RETURNING *`,
        [b.id, v.name, v.tax_id, v.contact_person, v.phone, v.email, v.internal_owner, v.project_stages, v.notes]);
      await db.query("UPDATE collections.check_pickups SET customer_name = $2, updated_at = now() WHERE customer_id = $1", [b.id, v.name]);
      await logActivity(db, user, {
        action: "update", entity: "customer", record_id: b.id, title: v.name, customer_name: v.name,
        details: before.name !== v.name ? `שם הלקוח שונה מ-${before.name}` : "פרטי הלקוח עודכנו", snapshot: before,
      });
      return customerView(r.rows[0]);
    }
    const r = await db.query(
      `INSERT INTO collections.customers (name, tax_id, contact_person, phone, email, internal_owner, project_stages, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [v.name, v.tax_id, v.contact_person, v.phone, v.email, v.internal_owner, v.project_stages, v.notes]);
    await logActivity(db, user, { action: "create", entity: "customer", record_id: r.rows[0].id, title: v.name, customer_name: v.name, details: "לקוח חדש נוסף" });
    return customerView(r.rows[0]);
  });
}

export async function deleteCustomer(id, user) {
  return transaction(async (db) => {
    const customer = await one(db, "customers", id);
    const payments = (await db.query("SELECT * FROM collections.payments WHERE customer_id = $1", [id])).rows;
    const pickups = (await db.query("SELECT * FROM collections.check_pickups WHERE customer_id = $1", [id])).rows;
    await db.query("DELETE FROM collections.customers WHERE id = $1", [id]);   // payments and pickups cascade
    await logActivity(db, user, {
      action: "delete", entity: "customer", record_id: id, title: customer.name, customer_name: customer.name,
      details: `נמחקו גם ${payments.length} תשלומים ו-${pickups.length} איסופי צ׳קים`, snapshot: { customer, payments, collections: pickups },
    });
  });
}

/**
 * An existing customer for a deal or a Kaspit document: by tax ID; else by name, the same name or one name
 * inside the other ("רפאל" / "רפאל מערכות לחימה מתקדמות בע״מ") when exactly one customer fits. A name match
 * learns the tax ID, so the next match is exact. -> the row, or null
 */
export async function findCustomer(db, c) {
  const tid = taxId(c.tax_id);
  if (tid) {
    const r = await db.query("SELECT * FROM collections.customers WHERE tax_id = $1 ORDER BY created_at LIMIT 1", [tid]);
    if (r.rows[0]) return r.rows[0];
  }
  const key = nameKey(c.name);
  if (key.length < 2) return null;
  const all = (await db.query("SELECT * FROM collections.customers")).rows.filter((r) => !tid || !r.tax_id || r.tax_id === tid);
  let hit = all.find((r) => nameKey(r.name) === key);
  if (!hit) {
    const near = all.filter((r) => {
      const k = nameKey(r.name);
      const [short, long] = k.length <= key.length ? [k, key] : [key, k];
      return short.length >= 3 && long.startsWith(short);
    });
    if (near.length === 1) hit = near[0];
  }
  if (hit && tid && !hit.tax_id) await db.query("UPDATE collections.customers SET tax_id = $2, updated_at = now() WHERE id = $1", [hit.id, tid]);
  return hit || null;
}

/**
 * The customer a deal or a Kaspit document belongs to: findCustomer, otherwise a new one.
 * c: { name, tax_id, contact_person, phone, email, notes } -> { row, created }
 */
export async function findOrCreateCustomer(db, c, source, user) {
  const hit = await findCustomer(db, c);
  if (hit) return { row: hit, created: false };
  const tid = taxId(c.tax_id);
  const name = str(c.name, 120) || "לקוח ללא שם";
  const r = await db.query(
    `INSERT INTO collections.customers (name, tax_id, contact_person, phone, email, notes, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, tid, str(c.contact_person, 120), str(c.phone, 40), str(c.email, 160), str(c.notes, 1000), source]);
  await logActivity(db, user, {
    action: "create", entity: "customer", record_id: r.rows[0].id, title: name, customer_name: name,
    details: source === "deal" ? "לקוח חדש מעסקה שנחתמה" : source === "kaspit" ? "לקוח חדש מכספית" : "לקוח חדש נוסף",
  });
  return { row: r.rows[0], created: true };
}

// ---- payments ----

function paymentFields(b) {
  const method = METHODS.includes(b.method) ? b.method : null;
  if (!method) throw new HttpError(400, "bad_payment_method");
  const status = STATUSES.includes(b.status) ? b.status : null;
  if (!status) throw new HttpError(400, "bad_payment_status");
  const isCheck = method === "check";
  return {
    customer_id: str(b.customer_id, 40),
    description: str(b.description, 200),
    milestone: str(b.milestone, 200),
    amount: amount(b.amount),
    vat_included: b.vat_included !== false,
    due_date: isoDate(b.due_date),
    method,
    status,
    doc_type: DOC_TYPES.includes(b.doc_type) ? b.doc_type : "",
    doc_number: docNumber(b.doc_number),
    doc_date: isoDate(b.doc_date),
    billing_name: str(b.billing_name, 120),
    receipt_number: str(b.receipt_number, 40),
    receipt_date: isoDate(b.receipt_date),
    check_number: isCheck ? str(b.check_number, 40) : "",
    collection_date: isCheck ? isoDate(b.collection_date) : null,
    check_received: isCheck ? Boolean(b.check_received) : false,
    needs_review: Boolean(b.needs_review),
    notes: str(b.notes, 1000),
  };
}

const PAYMENT_COLS = ["customer_id", "description", "milestone", "amount", "vat_included", "due_date", "method", "status", "doc_type",
  "doc_number", "doc_date", "billing_name", "receipt_number", "receipt_date", "check_number", "collection_date", "check_received",
  "paid_date", "needs_review", "notes"];

// a unique-index violation on the document number, as the error the screen explains
const docTaken = (err) => {
  if (err?.code === "23505" && /payments_doc_number/.test(err.constraint || err.message)) throw new HttpError(409, "doc_number_taken");
  throw err;
};

export async function savePayment(b, user) {
  const v = paymentFields(b);
  return transaction(async (db) => {
    const customer = await one(db, "customers", v.customer_id).catch(() => { throw new HttpError(400, "bad_customer"); });
    const before = b.id ? await one(db, "payments", b.id) : null;
    v.paid_date = v.status === "paid" ? d(before?.paid_date) || israelDate() : null;
    let row;
    if (before) {
      const sets = PAYMENT_COLS.map((c, i) => `${c} = $${i + 2}`).join(", ");
      row = (await db.query(`UPDATE collections.payments SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
        [b.id, ...PAYMENT_COLS.map((c) => v[c])]).catch(docTaken)).rows[0];
    } else {
      row = (await db.query(
        `INSERT INTO collections.payments (${PAYMENT_COLS.join(", ")}) VALUES (${PAYMENT_COLS.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
        PAYMENT_COLS.map((c) => v[c])).catch(docTaken)).rows[0];
    }
    await logActivity(db, user, {
      action: before ? "update" : "create", entity: "payment", record_id: row.id, title: v.description || "תשלום",
      customer_name: customer.name, details: before ? "פרטי התשלום עודכנו" : "תשלום חדש נוסף", snapshot: before,
    });
    await syncPickups(db, v.customer_id);
    if (before && before.customer_id !== v.customer_id) await syncPickups(db, before.customer_id);
    return paymentView(row);
  });
}

export async function setPaymentStatus(id, status, user) {
  if (!STATUSES.includes(status)) throw new HttpError(400, "bad_payment_status");
  return transaction(async (db) => {
    const p = await one(db, "payments", id);
    await db.query("UPDATE collections.payments SET status = $2, paid_date = $3, updated_at = now() WHERE id = $1",
      [id, status, status === "paid" ? israelDate() : null]);
    await syncPickups(db, p.customer_id);
    const c = await db.query("SELECT name FROM collections.customers WHERE id = $1", [p.customer_id]);
    await logActivity(db, user, {
      action: "update", entity: "payment", record_id: id, title: p.description || "תשלום", customer_name: c.rows[0]?.name || "",
      details: `הסטטוס שונה ל-${STATUS_LABELS[status]}`, snapshot: p,
    });
  });
}

export async function deletePayment(id, user) {
  return transaction(async (db) => {
    const p = await one(db, "payments", id);
    await db.query("DELETE FROM collections.payments WHERE id = $1", [id]);
    await syncPickups(db, p.customer_id);
    const c = await db.query("SELECT name FROM collections.customers WHERE id = $1", [p.customer_id]);
    await logActivity(db, user, {
      action: "delete", entity: "payment", record_id: id, title: p.description || "תשלום", customer_name: c.rows[0]?.name || "",
      details: "התשלום נמחק", snapshot: p,
    });
  });
}

// ---- check pickups ----

/**
 * Rebuilds a customer's automatic pickups from their open check payments that have a pickup date, one pickup
 * per date. A pickup that already happened, or was edited by hand, stays as it is.
 */
export async function syncPickups(db, customerId) {
  const customer = (await db.query("SELECT name FROM collections.customers WHERE id = $1", [customerId])).rows[0];
  if (!customer) return;
  const payments = (await db.query(
    `SELECT * FROM collections.payments WHERE customer_id = $1 AND method = 'check' AND status = 'pending' AND collection_date IS NOT NULL`,
    [customerId])).rows;
  const groups = new Map();
  for (const p of payments) {
    const date = d(p.collection_date);
    const g = groups.get(date) || { date, count: 0, total: 0 };
    g.count += 1;
    g.total += withVat(p);
    groups.set(date, g);
  }
  const existing = (await db.query("SELECT * FROM collections.check_pickups WHERE customer_id = $1", [customerId])).rows;
  const byDate = new Map(existing.map((r) => [d(r.collection_date), r]));
  for (const g of groups.values()) {
    const r = byDate.get(g.date);
    if (r) {
      byDate.delete(g.date);
      if (r.status !== "scheduled" || r.manual) continue;
      await db.query("UPDATE collections.check_pickups SET customer_name=$2, check_count=$3, total_amount=$4, updated_at=now() WHERE id=$1",
        [r.id, customer.name, g.count, Math.round(g.total * 100) / 100]);
    } else {
      await db.query(
        `INSERT INTO collections.check_pickups (customer_id, customer_name, collection_date, status, check_count, total_amount)
         VALUES ($1,$2,$3,'scheduled',$4,$5)`, [customerId, customer.name, g.date, g.count, Math.round(g.total * 100) / 100]);
    }
  }
  for (const stale of byDate.values()) {
    if (stale.status !== "scheduled" || stale.manual) continue;
    await db.query("DELETE FROM collections.check_pickups WHERE id = $1", [stale.id]);
  }
}

export async function setPickupStatus(id, status, user) {
  if (!PICKUP_STATUSES.includes(status)) throw new HttpError(400, "bad_status");
  return transaction(async (db) => {
    const r = await one(db, "check_pickups", id);
    await db.query("UPDATE collections.check_pickups SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
    await logActivity(db, user, {
      action: "update", entity: "collection", record_id: id, title: r.customer_name || "איסוף צ׳קים", customer_name: r.customer_name,
      details: status === "collected" ? "האיסוף סומן כנאסף" : `הסטטוס שונה ל-${PICKUP_LABELS[status]}`, snapshot: r,
    });
  });
}

export async function savePickup(b, user) {
  const date = isoDate(b.collection_date);
  if (!date) throw new HttpError(400, "bad_date");
  const count = b.check_count === "" || b.check_count == null ? null : Math.max(0, Math.min(1000, Math.trunc(Number(b.check_count) || 0)));
  const total = b.total_amount === "" || b.total_amount == null ? null : amount(b.total_amount);
  const contact = { contact_person: str(b.contact_person, 120), address: str(b.address, 200), notes: str(b.notes, 1000) };
  return transaction(async (db) => {
    const customer = await one(db, "customers", str(b.customer_id, 40)).catch(() => { throw new HttpError(400, "bad_customer"); });
    if (b.id) {
      const before = await one(db, "check_pickups", b.id);
      await db.query(
        `UPDATE collections.check_pickups SET customer_name=$2, collection_date=$3, check_count=$4, total_amount=$5, contact_person=$6,
                address=$7, notes=$8, manual=true, updated_at=now() WHERE id=$1`,
        [b.id, customer.name, date, count ?? before.check_count, total ?? before.total_amount, contact.contact_person, contact.address, contact.notes]);
      await logActivity(db, user, { action: "update", entity: "collection", record_id: b.id, title: customer.name, customer_name: customer.name, details: "פרטי איסוף הצ׳קים עודכנו", snapshot: before });
      return { ok: true, assigned: 0 };
    }
    // the customer's open checks without a pickup date join this pickup
    const assigned = await db.query(
      `UPDATE collections.payments SET collection_date = $2, updated_at = now()
        WHERE customer_id = $1 AND method = 'check' AND status = 'pending' AND collection_date IS NULL RETURNING id`, [customer.id, date]);
    if (assigned.rowCount) await syncPickups(db, customer.id);
    const record = (await db.query(
      "SELECT * FROM collections.check_pickups WHERE customer_id = $1 AND collection_date = $2 AND status = 'scheduled' LIMIT 1", [customer.id, date])).rows[0];
    const manual = count != null || total != null || !record;
    let id = record?.id;
    if (record) {
      await db.query(
        `UPDATE collections.check_pickups SET customer_name=$2, check_count=$3, total_amount=$4, contact_person=$5, address=$6, notes=$7,
                manual=$8, updated_at=now() WHERE id=$1`,
        [record.id, customer.name, count ?? record.check_count, total ?? record.total_amount, contact.contact_person, contact.address, contact.notes, manual]);
    } else {
      id = (await db.query(
        `INSERT INTO collections.check_pickups (customer_id, customer_name, collection_date, status, check_count, total_amount, contact_person, address, notes, manual)
         VALUES ($1,$2,$3,'scheduled',$4,$5,$6,$7,$8,$9) RETURNING id`,
        [customer.id, customer.name, date, count ?? 0, total ?? 0, contact.contact_person, contact.address, contact.notes, manual])).rows[0].id;
    }
    await logActivity(db, user, {
      action: "create", entity: "collection", record_id: id, title: customer.name, customer_name: customer.name,
      details: `נקבע איסוף ל-${date}${assigned.rowCount ? ` (${assigned.rowCount} צ׳קים)` : ""}`,
    });
    return { ok: true, assigned: assigned.rowCount };
  });
}

export async function deletePickup(id, user) {
  return transaction(async (db) => {
    const r = await one(db, "check_pickups", id);
    await db.query(
      `UPDATE collections.payments SET collection_date = NULL, updated_at = now()
        WHERE customer_id = $1 AND method = 'check' AND status = 'pending' AND collection_date = $2`, [r.customer_id, d(r.collection_date)]);
    await db.query("DELETE FROM collections.check_pickups WHERE id = $1", [id]);
    await logActivity(db, user, {
      action: "delete", entity: "collection", record_id: id, title: r.customer_name || "איסוף צ׳קים", customer_name: r.customer_name,
      details: `איסוף מתאריך ${d(r.collection_date)} נמחק`, snapshot: r,
    });
  });
}

// ---- restore from the change log ----

const TABLES = { customer: "customers", payment: "payments", collection: "check_pickups" };
// the columns a snapshot may write back (ids and bookkeeping stay as they are)
const COLUMNS = {
  customers: ["name", "tax_id", "contact_person", "phone", "email", "internal_owner", "project_stages", "notes", "source"],
  payments: [...PAYMENT_COLS, "source", "deal_id", "deal_row", "kaspit_document_id", "kaspit_open", "kaspit_synced_at"],
  check_pickups: ["customer_id", "customer_name", "collection_date", "status", "check_count", "total_amount", "contact_person", "address", "notes", "manual"],
};

async function insertRow(db, table, row, extra = {}) {
  const v = { ...row, ...extra };
  const cols = ["id", ...COLUMNS[table]].filter((c) => v[c] !== undefined);
  return db.query(`INSERT INTO collections.${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) ON CONFLICT (id) DO NOTHING`,
    cols.map((c) => v[c]));
}

export async function restore(logId, user) {
  return transaction(async (db) => {
    const log = (await db.query("SELECT * FROM collections.activity WHERE id = $1", [logId])).rows[0];
    if (!log) throw new HttpError(404, "not_found");
    const table = TABLES[log.entity];
    if (!table || !log.restorable) throw new HttpError(409, "not_restorable");
    const snap = log.snapshot;
    if (log.action === "create") {
      await db.query(`DELETE FROM collections.${table} WHERE id::text = $1`, [log.record_id]);
    } else if (log.action === "update" && snap) {
      const cols = COLUMNS[table].filter((c) => snap[c] !== undefined);
      await db.query(`UPDATE collections.${table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id::text = $1`,
        [log.record_id, ...cols.map((c) => snap[c])]).catch(docTaken);
    } else if (log.action === "delete" && snap) {
      if (log.entity === "customer") {
        await insertRow(db, "customers", snap.customer);
        for (const p of snap.payments || []) await insertRow(db, "payments", p, { customer_id: snap.customer.id }).catch(docTaken);
        for (const k of snap.collections || []) await insertRow(db, "check_pickups", k, { customer_id: snap.customer.id });
      } else {
        await insertRow(db, table, snap).catch(docTaken);
      }
    } else {
      throw new HttpError(409, "not_restorable");
    }
    const customerId = log.entity === "customer" ? (snap?.customer?.id || null) : snap?.customer_id;
    if (customerId) await syncPickups(db, customerId);
    await db.query("UPDATE collections.activity SET restorable = false WHERE id = $1", [logId]);
    await logActivity(db, user, {
      action: "restore", entity: log.entity, record_id: log.record_id, title: log.title, customer_name: log.customer_name,
      details: `שוחזר: ${log.details || log.title}`, restorable: false,
    });
  });
}

// ---- signed deals ----

const DEAL_METHODS = { transfer: "transfer", check: "check", card: "credit" };

/**
 * A deal was just signed (by link or closed by hand): its customer and every payment of the frozen schedule
 * (deposit and installments, with VAT) go into collections. Safe to run again: one payment per schedule row.
 * The monthly service is charged by standing order (billing), so it is not added here.
 * Never throws: signing must not fail because of collections; a failure is logged on the deal.
 */
export async function syncSignedDeal(deal, logEvent) {
  try {
    const order = deal.snapshot?.order;
    const rows = order?.schedule?.rows || [];
    if (!deal.signed_at || !rows.length) return { added: 0 };
    const c = deal.client || {};
    const project = order.project?.name || deal.data?.project?.name || "";
    const pickup = isoDate(order.payInfo?.checks?.pickupDate);
    return await transaction(async (db) => {
      const { row: customer } = await findOrCreateCustomer(db, {
        name: c.companyName || c.signerName,
        tax_id: c.taxId,
        contact_person: c.signerName || c.authorizedContact?.name,
        phone: c.phone,
        email: c.accountingEmail || c.email,
        notes: `עסקה #${deal.number}${project ? ` — ${project}` : ""}`,
      }, "deal", "חתימה על הסכם");
      let added = 0;
      for (const r of rows) {
        const method = DEAL_METHODS[r.method] || "transfer";
        const paid = r.kind === "deposit" && deal.deposit_status === "paid";
        const ins = await db.query(
          `INSERT INTO collections.payments (customer_id, description, milestone, amount, vat_included, due_date, method, status,
                  collection_date, paid_date, notes, source, deal_id, deal_row)
           VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,'deal',$11,$12)
           ON CONFLICT (deal_id, deal_row) WHERE deal_id IS NOT NULL DO NOTHING RETURNING id`,
          [customer.id,
            r.kind === "deposit" ? `מקדמה${project ? ` — ${project}` : ""}` : `תשלום ${r.n - 1}${project ? ` — ${project}` : ""}`,
            r.dateNote || "", Number(r.total), isoDate(r.date), method, paid ? "paid" : "pending",
            method === "check" ? pickup : null, paid ? israelDate() : null, `מעסקה #${deal.number}`, deal.id, r.n]);
        added += ins.rowCount;
      }
      if (added) {
        await logActivity(db, "חתימה על הסכם", {
          action: "create", entity: "customer", record_id: customer.id, title: customer.name, customer_name: customer.name,
          details: `עסקה #${deal.number} נחתמה: נוספו ${added} תשלומים`, restorable: false,
        });
        await syncPickups(db, customer.id);
      }
      return { added, customerId: customer.id };
    });
  } catch (err) {
    console.error("[collections] signed deal sync failed:", err);
    await logEvent?.("deal", deal.id, "collections_failed", { error: String(err.message || err).slice(0, 200) }).catch(() => {});
    return { added: 0, error: true };
  }
}

/** The deposit of a deal was marked paid in sales: the same in collections. Never throws. */
export async function dealDepositPaid(dealId) {
  try {
    await query(
      `UPDATE collections.payments SET status = 'paid', paid_date = $2, updated_at = now()
        WHERE deal_id = $1 AND deal_row = 1 AND status = 'pending'`, [dealId, israelDate()]);
  } catch (err) {
    console.error("[collections] deposit paid sync failed:", err);
  }
}
