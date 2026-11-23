// The one-time move from the previous collections system (Base44, app "גבייה-פלוס"): its export, as its
// entity API lists it, into the collections schema. Each record keeps its Base44 id in legacy_id, so a second
// run adds nothing. History entries come over for reading only (their snapshots point at Base44 ids).
import { transaction } from "./db.js";
import { DOC_TYPES, METHODS, PICKUP_STATUSES, STATUSES, docNumber, isoDate, logActivity, str, syncPickups } from "./collections.js";

const list = (v) => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

export async function importLegacy(b, user) {
  const customers = list(b.customers);
  const payments = list(b.payments);
  const pickups = list(b.collections);
  const logs = list(b.activity);
  return transaction(async (db) => {
    const added = { customers: 0, payments: 0, collections: 0, activity: 0, skipped: [] };
    const ids = new Map();   // Base44 customer id -> our id
    for (const c of customers) {
      const legacy = str(c.id, 64);
      if (!legacy) continue;
      const r = await db.query(
        `INSERT INTO collections.customers (name, contact_person, phone, internal_owner, project_stages, notes, source, legacy_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'import',$7,COALESCE($8::timestamptz, now()))
         ON CONFLICT (legacy_id) DO NOTHING RETURNING id`,
        [str(c.name, 120) || "לקוח", str(c.contact_person, 120), str(c.phone, 40), str(c.internal_owner, 80),
          str(c.project_stages, 2000), str(c.notes, 1000), legacy, c.created_date || null]);
      if (r.rows[0]) added.customers += 1;
      const id = r.rows[0]?.id || (await db.query("SELECT id FROM collections.customers WHERE legacy_id = $1", [legacy])).rows[0]?.id;
      ids.set(legacy, id);
    }
    for (const p of payments) {
      const legacy = str(p.id, 64);
      const customerId = ids.get(str(p.customer_id, 64));
      if (!legacy || !customerId) { added.skipped.push({ payment: legacy, reason: "no_customer" }); continue; }
      const method = METHODS.includes(p.method) ? p.method : "other";
      const status = STATUSES.includes(p.status) ? p.status : "pending";
      const doc = docNumber(p.doc_number);
      // a document number already here (e.g. from Kaspit) stays with that payment: reported, not duplicated
      if (doc) {
        const taken = (await db.query("SELECT legacy_id FROM collections.payments WHERE doc_number = $1", [doc])).rows[0];
        if (taken && taken.legacy_id !== legacy) { added.skipped.push({ payment: legacy, reason: "doc_number_taken", doc }); continue; }
      }
      const r = await db.query(
        `INSERT INTO collections.payments (customer_id, description, milestone, amount, vat_included, due_date, method, status, doc_type,
                doc_number, doc_date, receipt_number, receipt_date, billing_name, check_number, collection_date, check_received, paid_date,
                needs_review, notes, source, legacy_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'import',$21,COALESCE($22::timestamptz, now()))
         ON CONFLICT (legacy_id) DO NOTHING RETURNING id`,
        [customerId, str(p.description, 200), str(p.milestone, 200), num(p.amount), p.vat_included !== false, isoDate(p.due_date), method,
          status, DOC_TYPES.includes(p.doc_type) ? p.doc_type : "", doc, isoDate(p.doc_date), str(p.receipt_number, 40), isoDate(p.receipt_date),
          str(p.billing_name, 120), str(p.check_number, 40), method === "check" ? isoDate(p.collection_date) : null, Boolean(p.check_received),
          status === "paid" ? isoDate(p.paid_date) || isoDate(p.updated_date) : null, Boolean(p.needs_review), str(p.notes, 1000), legacy,
          p.created_date || null]);
      if (r.rows[0]) added.payments += 1;
    }
    for (const k of pickups) {
      const legacy = str(k.id, 64);
      const customerId = ids.get(str(k.customer_id, 64));
      const date = isoDate(k.collection_date);
      if (!legacy || !customerId || !date) { added.skipped.push({ collection: legacy, reason: "no_customer_or_date" }); continue; }
      const r = await db.query(
        `INSERT INTO collections.check_pickups (customer_id, customer_name, collection_date, status, check_count, total_amount, contact_person,
                address, notes, manual, legacy_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamptz, now()))
         ON CONFLICT (legacy_id) DO NOTHING RETURNING id`,
        [customerId, str(k.customer_name, 120), date, PICKUP_STATUSES.includes(k.status) ? k.status : "scheduled",
          Math.trunc(num(k.check_count)), num(k.total_amount), str(k.contact_person, 120), str(k.address, 200), str(k.notes, 1000),
          Boolean(k.manual), legacy, k.created_date || null]);
      if (r.rows[0]) added.collections += 1;
    }
    for (const a of logs) {
      const legacy = str(a.id, 64);
      if (!legacy || !["create", "update", "delete", "restore"].includes(a.action) || !["customer", "payment", "collection"].includes(a.entity)) continue;
      const r = await db.query(
        `INSERT INTO collections.activity (action, entity, record_id, title, customer_name, user_name, details, restorable, legacy_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,COALESCE($9::timestamptz, now()))
         ON CONFLICT (legacy_id) DO NOTHING RETURNING id`,
        [a.action, a.entity, str(a.record_id, 64), str(a.title, 200), str(a.customer_name, 200), str(a.user_name || a.user_email, 120),
          str(a.details, 500), legacy, a.created_date || null]);
      if (r.rows[0]) added.activity += 1;
    }
    // automatic pickups follow the imported checks (a pickup that came over as collected stays as it is)
    for (const id of new Set(ids.values())) if (id) await syncPickups(db, id);
    if (added.customers || added.payments) {
      await logActivity(db, user, {
        action: "create", entity: "customer", title: "ייבוא מהמערכת הקודמת",
        details: `יובאו ${added.customers} לקוחות, ${added.payments} תשלומים ו-${added.collections} איסופי צ׳קים`, restorable: false,
      });
    }
    return added;
  });
}
