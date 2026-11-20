// /api/sales/deals   deals, admin
//   GET                    list, newest first
//   GET    ?id=            one, with its order (live or frozen), events, emails, standing order
//   POST   { data, client, sendEmail }           create (?preview=1: compute only, nothing saved)
//   PATCH  ?id= { action, ... }
//     update { data, client }        before the client approved
//     send_email                     the invite with the link
//     mark_deposit_paid { ref }
//     mark_project_started { date }  sets the standing order's first charge when it had none
//     mark_delivered
//     cancel                         the link stops working (before signing only)
import { HttpError, json, origin, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { uuidParam } from "../../_lib/sign.js";
import { events, getSettings, logEvent, mailsFor, newToken, sendMail, str } from "../../_lib/sales.js";
import { buildOrder, cleanClient, cleanDealData } from "../../_lib/deal.js";
import { dealInviteMail, cardSetMail } from "../../_lib/sales-mail.js";
import { addMonths, israelDate } from "../../_lib/sales-calc.js";
import { firstCharge, subscriptionRow } from "../../_lib/billing.js";

const iso = (d) => (d ? new Date(d).toISOString() : null);

export function dealRow(r, base) {
  return {
    id: r.id,
    number: r.number,
    url: `${base}/deal/${r.token}`,
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
    data: r.data,
    client: r.client,
    status: {
      order: r.order_status,
      agreement: r.agreement_status,
      deposit: r.deposit_status,
      card: r.card_status,
      project: r.project_status,
      canceled: Boolean(r.canceled_at),
    },
    projectStartedOn: r.project_started_on || null,
    viewedAt: iso(r.viewed_at),
    approvedAt: iso(r.approved_at),
    signedAt: iso(r.signed_at),
    snapshotHash: r.snapshot_hash,
    hasSignedPdf: Boolean(r.signed_pdf_file_id),
    subscriptionId: r.subscription_id,
  };
}

export default route(["GET", "POST", "PATCH"], async (req, res) => {
  const user = requireAdmin(req);
  const base = origin(req);
  const q = new URL(req.url, "http://x").searchParams;
  const settings = await getSettings();

  if (req.method === "GET" && q.get("id")) {
    const id = uuidParam(q.get("id"));
    const { rows } = await query("SELECT * FROM sales.deals WHERE id = $1", [id]);
    const d = rows[0];
    if (!d) throw new HttpError(404, "not_found");
    const order = d.snapshot?.order || buildOrder(d, settings);
    let subscription = null;
    if (d.subscription_id) {
      const s = await query("SELECT * FROM billing.subscriptions WHERE id = $1", [d.subscription_id]);
      if (s.rows[0]) subscription = subscriptionRow(s.rows[0], base);
    }
    return json(res, 200, { item: dealRow(d, base), order, events: await events("deal", id), mails: await mailsFor("deal", id), subscription });
  }
  if (req.method === "GET") {
    const { rows } = await query("SELECT * FROM sales.deals ORDER BY created_at DESC LIMIT 500");
    return json(res, 200, { items: rows.map((r) => dealRow(r, base)) });
  }

  if (req.method === "POST") {
    const b = await readJson(req, 1024 * 1024);
    const data = cleanDealData(b.data || {}, settings);
    const client = cleanClient(b.client || {});
    if (q.get("preview")) return json(res, 200, { order: buildOrder({ number: 0, data, client }, settings) });
    if (!client.email) throw new HttpError(400, "bad_client_email");
    const { rows } = await query(
      `INSERT INTO sales.deals (token, created_by, data, client, card_status)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [newToken(), user, JSON.stringify(data), JSON.stringify(client), data.standingOrder.enabled ? "pending" : "not_required"]);
    const d = rows[0];
    await logEvent("deal", d.id, "created", { by: user });
    let mail = null;
    if (b.sendEmail) {
      mail = await sendMail({ ...dealInviteMail(d, settings, `${base}/deal/${d.token}`), entity: "deal", entityId: d.id, kind: "deal_invite" });
      await logEvent("deal", d.id, "email_sent", { kind: "invite", to: client.email, sent: mail.sent });
    }
    return json(res, 201, { item: dealRow(d, base), mail });
  }

  // PATCH
  const id = uuidParam(q.get("id"));
  const b = await readJson(req, 1024 * 1024);
  const { rows } = await query("SELECT * FROM sales.deals WHERE id = $1", [id]);
  const d = rows[0];
  if (!d) throw new HttpError(404, "not_found");

  switch (b.action) {
    case "update": {
      if (d.approved_at) throw new HttpError(409, "already_approved");
      const data = cleanDealData(b.data || d.data, settings);
      const client = cleanClient(b.client || d.client);
      await query(
        `UPDATE sales.deals SET data = $2, client = $3, card_status = CASE WHEN card_status IN ('not_required','pending') THEN $4 ELSE card_status END,
                updated_at = now() WHERE id = $1`,
        [id, JSON.stringify(data), JSON.stringify(client), data.standingOrder.enabled ? "pending" : "not_required"]);
      await logEvent("deal", id, "updated", { by: user });
      break;
    }
    case "send_email": {
      if (d.canceled_at) throw new HttpError(409, "canceled");
      const mail = await sendMail({ ...dealInviteMail(d, settings, `${base}/deal/${d.token}`), entity: "deal", entityId: id, kind: "deal_invite" });
      await logEvent("deal", id, "email_sent", { kind: "invite", to: d.client.email, sent: mail.sent });
      break;
    }
    case "mark_deposit_paid":
      await query("UPDATE sales.deals SET deposit_status = 'paid', updated_at = now() WHERE id = $1", [id]);
      await logEvent("deal", id, "deposit_paid", { by: user, ref: str(b.ref, 80) || null });
      break;
    case "mark_project_started": {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? b.date : israelDate();
      await query("UPDATE sales.deals SET project_status = 'started', project_started_on = $2, updated_at = now() WHERE id = $1", [id, date]);
      await logEvent("deal", id, "project_started", { by: user, date });
      // the included months run from the start of work; the first service charge follows them
      if (d.subscription_id) {
        const months = Number(d.data.service?.includedMonths ?? 3);
        // the first billing day on or after the end of the included months
        const dom = d.data.standingOrder?.dayOfMonth || 1;
        const end = addMonths(date, months);
        const sameMonth = addMonths(end, 0, dom);
        const first = sameMonth >= end ? sameMonth : addMonths(end, 1, dom);
        const u = await query(
          `UPDATE billing.subscriptions SET start_date = $2, next_charge_date = $2, updated_at = now()
            WHERE id = $1 AND start_date IS NULL AND charges_done = 0 RETURNING *`, [d.subscription_id, first]);
        if (u.rows[0]) {
          await logEvent("subscription", d.subscription_id, "start_date_set", { date: first, from: "project_started" });
          const fc = firstCharge(u.rows[0]);
          await sendMail({ ...cardSetMail(subscriptionRow(u.rows[0]), settings, fc), subject: "מועד החיוב הראשון לשירות החודשי נקבע",
            entity: "deal", entityId: id, kind: "first_charge_date" });
        }
      }
      break;
    }
    case "mark_delivered":
      await query("UPDATE sales.deals SET project_status = 'delivered', updated_at = now() WHERE id = $1", [id]);
      await logEvent("deal", id, "delivered", { by: user });
      break;
    case "cancel":
      if (d.signed_at) throw new HttpError(409, "already_signed");
      await query("UPDATE sales.deals SET canceled_at = now(), updated_at = now() WHERE id = $1", [id]);
      await logEvent("deal", id, "canceled", { by: user });
      break;
    default:
      throw new HttpError(400, "bad_action");
  }
  const after = await query("SELECT * FROM sales.deals WHERE id = $1", [id]);
  json(res, 200, { item: dealRow(after.rows[0], base) });
});
