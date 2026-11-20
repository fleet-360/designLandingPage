// /api/sales/discovery   spec requests, admin
//   GET                 list, newest first
//   GET    ?id=         one, with its events and emails
//   POST   { clientName, companyName, email, phone, taxId, price, note, meetingMinutes, sendEmail }
//   PATCH  ?id= { action: "cancel" | "mark_paid" | "send_email" | "update", ...fields }
import { HttpError, json, origin, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { uuidParam } from "../../_lib/sign.js";
import { events, getSettings, isEmail, logEvent, mailsFor, markDiscoveryPaid, money, newToken, sendMail, str } from "../../_lib/sales.js";
import { discoveryInviteMail } from "../../_lib/sales-mail.js";
import { withVat } from "../../_lib/sales-calc.js";

const iso = (d) => (d ? new Date(d).toISOString() : null);

export function discoveryRow(r, base) {
  return {
    id: r.id,
    url: `${base}/discovery/${r.token}`,
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
    clientName: r.client_name,
    companyName: r.company_name,
    email: r.email,
    phone: r.phone,
    taxId: r.tax_id,
    price: Number(r.price),
    vatRate: Number(r.vat_rate),
    total: withVat(r.price, r.vat_rate),
    note: r.note,
    meetingMinutes: r.meeting_minutes,
    status: r.canceled_at ? "canceled" : r.status,
    viewedAt: iso(r.viewed_at),
    paidAt: iso(r.paid_at),
    paidVia: r.paid_via,
    paymentRef: r.payment_ref,
    bookingStatus: r.booking_status,
    meetingStart: iso(r.meeting_start),
    meetingEnd: iso(r.meeting_end),
    attendees: r.attendees || [],
    meetUrl: r.meet_url,
    calendarEventId: r.calendar_event_id,
    bookingError: r.booking_error,
  };
}

function fields(b, settings, partial = false) {
  const out = {};
  const set = (k, v) => { if (!partial || v !== undefined) out[k] = v; };
  if (!partial || b.clientName !== undefined) {
    const name = str(b.clientName, 120);
    if (!name) throw new HttpError(400, "bad_client_name");
    out.client_name = name;
  }
  set("company_name", b.companyName === undefined ? undefined : str(b.companyName, 160) || null);
  if (b.email !== undefined || !partial) {
    const email = str(b.email, 160);
    if (email && !isEmail(email)) throw new HttpError(400, "bad_email");
    out.email = email || null;
  }
  set("phone", b.phone === undefined ? undefined : str(b.phone, 30) || null);
  set("tax_id", b.taxId === undefined ? undefined : str(b.taxId, 20) || null);
  if (!partial || b.price !== undefined) {
    const price = money(b.price ?? settings.discovery.defaultPrice, "price");
    if (price <= 0) throw new HttpError(400, "bad_price");
    out.price = price;
  }
  set("note", b.note === undefined ? undefined : str(b.note, 1500) || null);
  if (!partial || b.meetingMinutes !== undefined) {
    out.meeting_minutes = Math.min(180, Math.max(15, Math.trunc(Number(b.meetingMinutes) || settings.discovery.meetingMinutes)));
  }
  return out;
}

export default route(["GET", "POST", "PATCH"], async (req, res) => {
  const user = requireAdmin(req);
  const base = origin(req);
  const q = new URL(req.url, "http://x").searchParams;
  const settings = await getSettings();

  if (req.method === "GET" && q.get("id")) {
    const id = uuidParam(q.get("id"));
    const { rows } = await query("SELECT * FROM sales.discovery WHERE id = $1", [id]);
    if (!rows[0]) throw new HttpError(404, "not_found");
    return json(res, 200, { item: discoveryRow(rows[0], base), events: await events("discovery", id), mails: await mailsFor("discovery", id) });
  }
  if (req.method === "GET") {
    const { rows } = await query("SELECT * FROM sales.discovery ORDER BY created_at DESC LIMIT 500");
    return json(res, 200, { items: rows.map((r) => discoveryRow(r, base)) });
  }

  if (req.method === "POST") {
    const b = await readJson(req);
    const f = fields(b, settings);
    const { rows } = await query(
      `INSERT INTO sales.discovery (token, created_by, client_name, company_name, email, phone, tax_id, price, vat_rate, note, meeting_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [newToken(), user, f.client_name, f.company_name, f.email, f.phone, f.tax_id, f.price, settings.vatRate, f.note, f.meeting_minutes]);
    const d = rows[0];
    await logEvent("discovery", d.id, "created", { by: user, price: Number(d.price) });
    let mail = null;
    if (b.sendEmail && d.email) {
      mail = await sendMail({ ...discoveryInviteMail(d, settings, `${base}/discovery/${d.token}`), entity: "discovery", entityId: d.id, kind: "discovery_invite" });
      await logEvent("discovery", d.id, "email_sent", { kind: "invite", sent: mail.sent });
    }
    return json(res, 201, { item: discoveryRow(d, base), mail });
  }

  // PATCH
  const id = uuidParam(q.get("id"));
  const b = await readJson(req);
  const { rows } = await query("SELECT * FROM sales.discovery WHERE id = $1", [id]);
  const d = rows[0];
  if (!d) throw new HttpError(404, "not_found");

  if (b.action === "cancel") {
    await query("UPDATE sales.discovery SET canceled_at = now(), updated_at = now() WHERE id = $1", [id]);
    await logEvent("discovery", id, "canceled", { by: user });
  } else if (b.action === "mark_paid") {
    await markDiscoveryPaid(id, { via: "manual", ref: str(b.ref, 80) || `by ${user}` });
  } else if (b.action === "send_email") {
    if (!d.email) throw new HttpError(400, "no_email");
    const mail = await sendMail({ ...discoveryInviteMail(d, settings, `${base}/discovery/${d.token}`), entity: "discovery", entityId: id, kind: "discovery_invite" });
    await logEvent("discovery", id, "email_sent", { kind: "invite", sent: mail.sent });
  } else if (b.action === "update") {
    if (d.paid_at) throw new HttpError(409, "already_paid");
    const f = fields(b, settings, true);
    const keys = Object.keys(f);
    if (keys.length) {
      await query(`UPDATE sales.discovery SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`,
        [id, ...keys.map((k) => f[k])]);
      await logEvent("discovery", id, "updated", { by: user, fields: keys });
    }
  } else {
    throw new HttpError(400, "bad_action");
  }
  const after = await query("SELECT * FROM sales.discovery WHERE id = $1", [id]);
  json(res, 200, { item: discoveryRow(after.rows[0], base) });
});
