// /api/billing/subscriptions   standing orders, admin
//   GET                 all, with this month's numbers
//   GET    ?id=         one, with its charges, events and emails
//   POST   { customer, description, vatRate, schedule, startDate, dayOfMonth, sendLink }   a standing
//          order not tied to a deal; the customer sets the card through its link
//   PATCH  ?id= { action, ... }
//     pause | resume | cancel
//     update { schedule, dayOfMonth, nextChargeDate, description, customer, notes }
//     charge_now          due today, and asks Toro to run the charges now
//     send_card_link      emails the customer the link to set or replace the card
import { HttpError, json, origin, readJson, route } from "../../_lib/http.js";
import { query, transaction } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { uuidParam } from "../../_lib/sign.js";
import { events, getSettings, isEmail, logEvent, mailsFor, sendMail, str } from "../../_lib/sales.js";
import { advanceAfterPaid, chargeRow, createSubscription, subscriptionRow, today } from "../../_lib/billing.js";
import { cardReminderMail } from "../../_lib/sales-mail.js";
import { callToro } from "../../_lib/toro.js";

function cleanSchedule(list) {
  const out = (list || []).slice(0, 6).map((p) => ({
    months: p.months ? Math.max(1, Math.trunc(Number(p.months))) : null,
    amount: Math.round(Number(p.amount) * 100) / 100,
  }));
  if (!out.length || out.some((p) => !(p.amount > 0))) throw new HttpError(400, "bad_schedule");
  return out;
}

const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);

function cleanCustomer(c = {}) {
  const out = {
    name: str(c.name, 120), company: str(c.company, 160), taxId: str(c.taxId, 20),
    email: str(c.email, 160), phone: str(c.phone, 30), accountingEmail: str(c.accountingEmail, 160),
  };
  if (!out.name && !out.company) throw new HttpError(400, "bad_customer");
  if (!isEmail(out.email)) throw new HttpError(400, "bad_email");
  return out;
}

async function cardLinkFor(s, base) {
  if (s.deal_id) {
    const d = (await query("SELECT token FROM sales.deals WHERE id = $1", [s.deal_id])).rows[0];
    if (d) return `${base}/deal/${d.token}`;
  }
  return `${base}/card/${s.card_link_token}`;
}

export default route(["GET", "POST", "PATCH"], async (req, res) => {
  const user = requireAdmin(req);
  const base = origin(req);
  const q = new URL(req.url, "http://x").searchParams;

  if (req.method === "GET" && q.get("id")) {
    const id = uuidParam(q.get("id"));
    const s = (await query("SELECT * FROM billing.subscriptions WHERE id = $1", [id])).rows[0];
    if (!s) throw new HttpError(404, "not_found");
    const charges = await query("SELECT * FROM billing.charges WHERE subscription_id = $1 ORDER BY created_at DESC", [id]);
    let deal = null;
    if (s.deal_id) {
      const d = (await query("SELECT id, number, data->'project'->>'name' AS project FROM sales.deals WHERE id = $1", [s.deal_id])).rows[0];
      if (d) deal = { id: d.id, number: d.number, project: d.project };
    }
    return json(res, 200, {
      item: { ...subscriptionRow(s, base), cardLink: await cardLinkFor(s, base) },
      deal,
      charges: charges.rows.map(chargeRow),
      events: await events("subscription", id),
      mails: await mailsFor("subscription", id),
    });
  }
  if (req.method === "GET") {
    const { rows } = await query(
      `SELECT s.*, (SELECT max(processed_at) FROM billing.charges c WHERE c.subscription_id = s.id AND c.status = 'paid') AS last_paid_at,
              (SELECT count(*) FROM billing.charges c WHERE c.subscription_id = s.id AND c.status = 'failed') AS failed_total
         FROM billing.subscriptions s ORDER BY s.created_at DESC LIMIT 500`);
    const month = today().slice(0, 7);
    const paidThisMonth = await query(
      `SELECT coalesce(sum(amount),0) AS sum, count(*) AS n FROM billing.charges
        WHERE status = 'paid' AND to_char(processed_at AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM') = $1`, [month]);
    return json(res, 200, {
      items: rows.map((r) => ({ ...subscriptionRow(r, base), lastPaidAt: r.last_paid_at ? r.last_paid_at.toISOString() : null, failedTotal: Number(r.failed_total) })),
      month: { paid: Number(paidThisMonth.rows[0].sum), charges: Number(paidThisMonth.rows[0].n) },
    });
  }

  const settings = await getSettings();

  if (req.method === "POST") {
    const b = await readJson(req);
    const s = await createSubscription({
      createdBy: user,
      customer: cleanCustomer(b.customer),
      description: str(b.description, 160) || "שירות חודשי",
      vatRate: Number.isFinite(Number(b.vatRate)) ? Number(b.vatRate) : settings.vatRate,
      schedule: cleanSchedule(b.schedule),
      startDate: dateOrNull(b.startDate),
      dayOfMonth: Math.min(28, Math.max(1, Math.trunc(Number(b.dayOfMonth) || 1))),
    });
    await logEvent("subscription", s.id, "created", { by: user });
    let mail = null;
    if (b.sendLink) {
      mail = await sendMail({ ...cardReminderMail(subscriptionRow(s), settings, await cardLinkFor(s, base), s.start_date),
        subject: "הגדרת אמצעי תשלום לשירות החודשי", entity: "subscription", entityId: s.id, kind: "card_link" });
    }
    return json(res, 201, { item: { ...subscriptionRow(s, base), cardLink: await cardLinkFor(s, base) }, mail });
  }

  // PATCH
  const id = uuidParam(q.get("id"));
  const b = await readJson(req);
  const s = (await query("SELECT * FROM billing.subscriptions WHERE id = $1", [id])).rows[0];
  if (!s) throw new HttpError(404, "not_found");
  let runNow = false;

  switch (b.action) {
    // a charge Toro took but never reported (it stays "processing" and blocks the standing order):
    // "paid" after checking it in Grow, or "not_charged" to release it for the next run
    case "settle_charge": {
      const c = (await query("SELECT * FROM billing.charges WHERE uid = $1 AND subscription_id = $2", [uuidParam(b.chargeId), id])).rows[0];
      if (!c || c.status !== "processing") throw new HttpError(409, "bad_status");
      const ref = str(b.ref, 60) || null;
      if (b.outcome === "paid") {
        await transaction(async (db) => {
          const u = await db.query(
            "UPDATE billing.charges SET status = 'paid', processed_at = now(), transaction_id = COALESCE($2, transaction_id) WHERE id = $1 AND status = 'processing' RETURNING id",
            [c.id, ref]);
          if (!u.rows[0]) throw new HttpError(409, "bad_status");
          const locked = (await db.query("SELECT * FROM billing.subscriptions WHERE id = $1 FOR UPDATE", [id])).rows[0];
          await advanceAfterPaid(db, locked, c.due_date);
        });
      } else if (b.outcome === "not_charged") {
        await query("UPDATE billing.charges SET status = 'failed', processed_at = now(), error = 'סומן ידנית: לא חויב' WHERE id = $1 AND status = 'processing'", [c.id]);
      } else {
        throw new HttpError(400, "bad_outcome");
      }
      await logEvent("subscription", id, "charge_settled", { by: user, outcome: b.outcome, ref });
      break;
    }
    case "pause":
      if (!["active", "pending_card", "failed"].includes(s.status)) throw new HttpError(409, "bad_status");
      await query("UPDATE billing.subscriptions SET status = 'paused', paused_at = now(), updated_at = now() WHERE id = $1", [id]);
      break;
    case "resume": {
      if (!["paused", "failed"].includes(s.status)) throw new HttpError(409, "bad_status");
      const next = s.status === "failed" || !s.next_charge_date || s.next_charge_date < today() ? today() : null;
      await query(
        `UPDATE billing.subscriptions SET status = CASE WHEN card_token IS NULL THEN 'pending_card' ELSE 'active' END,
                paused_at = NULL, failed_attempts = 0, retry_on = NULL, next_charge_date = COALESCE($2, next_charge_date), updated_at = now()
          WHERE id = $1`, [id, next]);
      break;
    }
    case "cancel":
      await query("UPDATE billing.subscriptions SET status = 'canceled', canceled_at = now(), next_charge_date = NULL, updated_at = now() WHERE id = $1", [id]);
      if (s.deal_id) await query("UPDATE sales.deals SET card_status = CASE WHEN card_status = 'pending' THEN 'not_required' ELSE card_status END WHERE id = $1", [s.deal_id]);
      break;
    case "update": {
      const sets = [];
      const vals = [id];
      const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
      if (b.schedule !== undefined) add("schedule", JSON.stringify(cleanSchedule(b.schedule)));
      if (b.dayOfMonth !== undefined) add("day_of_month", Math.min(28, Math.max(1, Math.trunc(Number(b.dayOfMonth) || 1))));
      if (b.nextChargeDate !== undefined) {
        const nd = dateOrNull(b.nextChargeDate);
        add("next_charge_date", nd);
        if (s.charges_done === 0) add("start_date", nd);
      }
      if (b.description !== undefined) add("description", str(b.description, 160) || s.description);
      if (b.customer !== undefined) add("customer", JSON.stringify(cleanCustomer(b.customer)));
      if (b.notes !== undefined) add("notes", str(b.notes, 2000) || null);
      if (!sets.length) throw new HttpError(400, "nothing_to_update");
      await query(`UPDATE billing.subscriptions SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, vals);
      break;
    }
    case "charge_now":
      if (!s.card_token) throw new HttpError(409, "no_card");
      if (!["active", "failed", "paused"].includes(s.status)) throw new HttpError(409, "bad_status");
      await query(
        `UPDATE billing.subscriptions SET status = 'active', next_charge_date = LEAST(COALESCE(next_charge_date, $2::date), $2::date),
                retry_on = NULL, paused_at = NULL, updated_at = now() WHERE id = $1`, [id, today()]);
      runNow = true;
      break;
    case "send_card_link": {
      const mail = await sendMail({ ...cardReminderMail(subscriptionRow(s), settings, await cardLinkFor(s, base), s.next_charge_date),
        subject: s.card_token ? "עדכון אמצעי התשלום לשירות החודשי" : "הגדרת אמצעי תשלום לשירות החודשי",
        entity: "subscription", entityId: id, kind: "card_link" });
      await logEvent("subscription", id, "email_sent", { kind: "card_link", sent: mail.sent });
      break;
    }
    default:
      throw new HttpError(400, "bad_action");
  }
  if (!["send_card_link", "settle_charge"].includes(b.action)) await logEvent("subscription", id, b.action, { by: user, ...(b.action === "update" ? { fields: Object.keys(b).filter((k) => k !== "action") } : {}) });

  let run = null;
  if (runNow) {
    run = await callToro("/proAlgoSales/billing/run", {}, 90000);
    await logEvent("subscription", id, "charge_requested", { ok: run.ok, error: run.error || null });
  }
  const after = (await query("SELECT * FROM billing.subscriptions WHERE id = $1", [id])).rows[0];
  json(res, 200, { item: subscriptionRow(after, base), run });
});
