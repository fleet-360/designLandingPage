// /api/sales/deals   deals, admin
//   GET                    list, newest first
//   GET    ?id=            one, with its order (live or frozen), events, emails, standing order
//   POST   { data, client, sendEmail, paymentNote, filmDraft }    create (?preview=1: compute only, nothing saved)
//          filmDraft: the demo film made in the form (sales/deal-film?draft=), moved into the deal before the
//          invite goes out, so the client sees it from the first visit
//          signMode "manual": the client already signed outside the link. With signedOn, fileId (the signed
//          contract, uploaded through /api/sales/upload), sendOrderMail, attachContract: see close_manual
//   PATCH  ?id= { action, ... }
//     update { data, client, cc }    before the client signed; an approved order is reopened and the
//                                    invite is emailed again (cc: copies, as in POST)
//     send_email                     the invite with the link
//     mark_deposit_paid { ref }
//     mark_project_started { date }  sets the standing order's first charge when it had none
//     mark_delivered
//     cancel                         the link stops working (before signing only)
//     close_manual { signedOn, fileId, sendOrderMail, attachContract }
//                                    signed outside the link: approved and signed as of signedOn (the order is
//                                    frozen from then, unless the client already approved it), the standing
//                                    order waits for the card as usual; optionally emails the order confirmation
//     signed_file { fileId }         replaces (or removes) the signed contract of a deal closed by hand
//     send_order { attachContract }  emails the client the order confirmation, with the signed contract or without
//     payment_note { note }          how the client pays or paid (internal), at any time
//     pitch { pitch }                the key lines at the top of the client's page and in the order email
//                                    ({ problem, headline, lines } or null), at any time: not part of the order
import { HttpError, json, origin, readJson, route } from "../../_lib/http.js";
import { pitchOf } from "./discovery.js";
import { query } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { uuidParam } from "../../_lib/sign.js";
import { ccOf, events, getSettings, isEmail, logEvent, mailsFor, newToken, sendMail, str } from "../../_lib/sales.js";
import { buildOrder, cleanClient, cleanDealData } from "../../_lib/deal.js";
import { dealInviteMail, dealOrderMail, firstChargeDateMail } from "../../_lib/sales-mail.js";
import { addMonths, billingDayOnOrAfter, israelDate } from "../../_lib/sales-calc.js";
import { createDealSubscription, firstCharge, subscriptionRow } from "../../_lib/billing.js";
import { dealDepositPaid, syncSignedDeal } from "../../_lib/collections.js";

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
    signMode: r.sign_mode || "link",
    signedOn: r.signature?.manual ? r.signature.on : null,
    signerIdNumber: r.signature?.idNumber || null,
    paymentNote: r.payment_note || null,
    pitch: r.pitch || null,
  };
}

// an uploaded file (sign.files) given as the signed contract
async function signedFile(id) {
  const fid = uuidParam(id);
  if (!(await query("SELECT 1 FROM sign.files WHERE id = $1", [fid])).rows[0]) throw new HttpError(400, "bad_file");
  return fid;
}

/** The client signed outside the link (see close_manual in the header). -> the fresh row */
async function closeManually(d, b, user, settings) {
  if (d.canceled_at) throw new HttpError(409, "canceled");
  if (d.signed_at) throw new HttpError(409, "already_signed");
  const today = israelDate();
  const on = /^\d{4}-\d{2}-\d{2}$/.test(String(b.signedOn || "")) && b.signedOn <= today ? b.signedOn : today;
  const fileId = b.fileId ? await signedFile(b.fileId) : null;
  const at = on === today ? new Date() : new Date(`${on}T10:00:00Z`);   // midday in Israel
  // an order the client already approved through the link keeps its frozen schedule
  const order = d.snapshot?.order || buildOrder(d, settings, on);
  const name = d.client.signerName || d.client.companyName;
  const approval = d.approval || { name, email: d.client.email, manual: true, by: user, at: at.toISOString() };
  const signature = { name, role: d.client.signerRole, email: d.client.email, manual: true, by: user, on, at: at.toISOString() };
  const u = await query(
    `UPDATE sales.deals SET approved_at = COALESCE(approved_at, $2), approval = COALESCE(approval, $3), order_status = 'approved',
            signed_at = $2, signature = $4, agreement_status = 'signed', snapshot = $5, snapshot_hash = NULL,
            signed_pdf_file_id = $6, sign_mode = 'manual', updated_at = now()
      WHERE id = $1 AND signed_at IS NULL AND canceled_at IS NULL RETURNING *`,
    [d.id, at, JSON.stringify(approval), JSON.stringify(signature),
      JSON.stringify({ order, client: d.client, approval, signature, manual: true }), fileId]);
  if (!u.rows[0]) throw new HttpError(409, "already_signed");
  await logEvent("deal", d.id, "signed_manual", { by: user, on, file: Boolean(fileId) });
  const signed = await createDealSubscription(u.rows[0]);
  // the customer and the payment schedule into collections (never fails the closing)
  await syncSignedDeal(signed, logEvent);
  return signed;
}

/** The order confirmation to the client (accounting and the office in copy). */
async function sendOrder(d, settings, base, attach) {
  if (!d.signed_at) throw new HttpError(409, "not_signed");
  if (!isEmail(d.client.email)) throw new HttpError(400, "bad_client_email");
  let pdf = null;
  if (attach && d.signed_pdf_file_id) {
    const f = (await query("SELECT name FROM sign.files WHERE id = $1", [d.signed_pdf_file_id])).rows[0];
    pdf = { fileId: d.signed_pdf_file_id, name: f?.name || `הסכם ${d.number}.pdf` };
  }
  let cardUrl = null;
  if (d.subscription_id && d.card_status === "pending") {
    const s = (await query("SELECT card_link_token, status FROM billing.subscriptions WHERE id = $1", [d.subscription_id])).rows[0];
    if (s && s.status === "pending_card") cardUrl = `${base}/card/${s.card_link_token}`;
  }
  const mail = await sendMail({ ...dealOrderMail(d, settings, { pdf, cardUrl }), entity: "deal", entityId: d.id, kind: "deal_order" });
  await logEvent("deal", d.id, "email_sent", { kind: "order", to: d.client.email, contract: Boolean(pdf), sent: mail.sent });
  return mail;
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
    const manual = b.signMode === "manual";
    // a deal closed by hand needs the email only to send the order confirmation
    if (!client.email && (!manual || b.sendOrderMail)) throw new HttpError(400, "bad_client_email");
    if (manual && b.fileId) await signedFile(b.fileId);
    const draft = b.filmDraft ? (await query("SELECT id, film FROM sales.film_drafts WHERE id = $1", [uuidParam(b.filmDraft)])).rows[0] : null;
    if (b.filmDraft && !draft) throw new HttpError(400, "bad_film_draft");
    const { rows } = await query(
      `INSERT INTO sales.deals (token, created_by, data, client, card_status, payment_note, pitch, film)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [newToken(), user, JSON.stringify(data), JSON.stringify(client), data.standingOrder.enabled ? "pending" : "not_required",
        str(b.paymentNote, 1000) || null, pitchOf(b.pitch), draft?.film && Object.keys(draft.film).length ? JSON.stringify(draft.film) : null]);
    let d = rows[0];
    if (draft) await query("DELETE FROM sales.film_drafts WHERE id = $1", [draft.id]);
    await logEvent("deal", d.id, "created", { by: user, ...(manual && { manual: true }), ...(d.film && { film: { script: Boolean(d.film.script), video: Boolean(d.film.video), published: Boolean(d.film.published) } }) });
    let mail = null;
    if (manual) {
      d = await closeManually(d, b, user, settings);
      if (b.sendOrderMail) mail = await sendOrder(d, settings, base, b.attachContract !== false);
    } else if (b.sendEmail) {
      mail = await sendMail({ ...dealInviteMail(d, settings, `${base}/deal/${d.token}`), cc: ccOf(b), entity: "deal", entityId: d.id, kind: "deal_invite" });
      await logEvent("deal", d.id, "email_sent", { kind: "invite", to: client.email, cc: ccOf(b), sent: mail.sent });
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
      // until the client signs. An approved order is reopened: the client approves the new one again
      // (the old approval stays in the events) and gets the link by email.
      if (d.signed_at) throw new HttpError(409, "already_signed");
      if (d.canceled_at) throw new HttpError(409, "canceled");
      const data = cleanDealData(b.data || d.data, settings);
      const client = cleanClient(b.client || d.client);
      const reopen = Boolean(d.approved_at);
      const u = await query(
        `UPDATE sales.deals SET data = $2, client = $3, card_status = CASE WHEN card_status IN ('not_required','pending') THEN $4 ELSE card_status END,
                approved_at = NULL, approval = NULL, snapshot = NULL,
                order_status = CASE WHEN approved_at IS NULL THEN order_status WHEN viewed_at IS NULL THEN 'sent' ELSE 'viewed' END,
                updated_at = now() WHERE id = $1 AND signed_at IS NULL RETURNING *`,
        [id, JSON.stringify(data), JSON.stringify(client), data.standingOrder.enabled ? "pending" : "not_required"]);
      if (!u.rows[0]) throw new HttpError(409, "already_signed");   // the client signed meanwhile
      await logEvent("deal", id, "updated", { by: user });
      if (reopen) {
        await logEvent("deal", id, "reopened", { by: user, approval: d.approval });
        const mail = await sendMail({ ...dealInviteMail(u.rows[0], settings, `${base}/deal/${d.token}`), cc: ccOf(b), entity: "deal", entityId: id, kind: "deal_invite" });
        await logEvent("deal", id, "email_sent", { kind: "invite", to: client.email, cc: ccOf(b), sent: mail.sent });
      }
      break;
    }
    case "send_email": {
      if (d.canceled_at) throw new HttpError(409, "canceled");
      const mail = await sendMail({ ...dealInviteMail(d, settings, `${base}/deal/${d.token}`), cc: ccOf(b), entity: "deal", entityId: id, kind: "deal_invite" });
      await logEvent("deal", id, "email_sent", { kind: "invite", to: d.client.email, cc: ccOf(b), sent: mail.sent });
      break;
    }
    case "mark_deposit_paid":
      await query("UPDATE sales.deals SET deposit_status = 'paid', updated_at = now() WHERE id = $1", [id]);
      await logEvent("deal", id, "deposit_paid", { by: user, ref: str(b.ref, 80) || null });
      await dealDepositPaid(id);
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
        const first = billingDayOnOrAfter(addMonths(date, months), dom);
        const u = await query(
          `UPDATE billing.subscriptions SET start_date = $2, next_charge_date = $2, updated_at = now()
            WHERE id = $1 AND start_date IS NULL AND charges_done = 0 RETURNING *`, [d.subscription_id, first]);
        if (u.rows[0]) {
          await logEvent("subscription", d.subscription_id, "start_date_set", { date: first, from: "project_started" });
          const fc = firstCharge(u.rows[0]);
          await sendMail({ ...firstChargeDateMail(subscriptionRow(u.rows[0]), settings, fc, `${base}/deal/${d.token}`),
            entity: "deal", entityId: id, kind: "first_charge_date" });
        }
      }
      break;
    }
    case "mark_delivered":
      await query("UPDATE sales.deals SET project_status = 'delivered', updated_at = now() WHERE id = $1", [id]);
      await logEvent("deal", id, "delivered", { by: user });
      break;
    case "close_manual": {
      const closed = await closeManually(d, b, user, settings);
      if (b.sendOrderMail) await sendOrder(closed, settings, base, b.attachContract !== false);
      break;
    }
    case "signed_file": {
      if (d.sign_mode !== "manual") throw new HttpError(409, "bad_status");
      const fileId = b.fileId ? await signedFile(b.fileId) : null;
      await query("UPDATE sales.deals SET signed_pdf_file_id = $2, updated_at = now() WHERE id = $1", [id, fileId]);
      await logEvent("deal", id, "signed_file", { by: user, removed: !fileId });
      break;
    }
    case "send_order":
      await sendOrder(d, settings, base, b.attachContract !== false);
      break;
    case "pitch":
      await query("UPDATE sales.deals SET pitch = $2, updated_at = now() WHERE id = $1", [id, pitchOf(b.pitch)]);
      await logEvent("deal", id, "pitch", { by: user });
      break;
    case "payment_note":
      await query("UPDATE sales.deals SET payment_note = $2, updated_at = now() WHERE id = $1", [id, str(b.note, 1000) || null]);
      await logEvent("deal", id, "payment_note", { by: user });
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
