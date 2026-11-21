// /api/sales/discovery   spec requests, admin
//   GET                 list, newest first
//   GET    ?id=         one, with its events and emails
//   POST   { clientName, companyName, email, phone, taxId, price, listPrice, note, meetingMinutes, sendEmail }
//          listPrice: the price before discount, struck through on the page and in the email; "" = none
//          salesName, salesPhone, leadName, leadPhone, officeName, officePhone: the responsible salesperson,
//          team lead and office manager, shown in
//          the booking confirmation (default: settings.discovery.contacts)
//          pitch { problem, headline, lines: [] }: the key lines at the top of the client's page (see
//          sales/pitch, which writes them with Claude); null = the standard opening
//          showBooking, showPayment (default true): what the client's page offers. When one is false, sales
//          types it in, with the same fields as the "manual" action below
//   PATCH  ?id= { action: "cancel" | "mark_paid" | "send_email" | "update" | "manual", ...fields }
//     manual { showBooking, showPayment, meetingStart ("YYYY-MM-DDTHH:MM" Israel time, or ISO), meetingMinutes,
//              paymentMethod, paymentStatus ("paid" | "pending"), paidOn (YYYY-MM-DD), paymentNote }
//            a meeting or a payment arranged outside the client's page; editable later
import { HttpError, json, origin, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { uuidParam } from "../../_lib/sign.js";
import { events, getSettings, isEmail, logEvent, mailsFor, markDiscoveryPaid, money, newToken, sendMail, str } from "../../_lib/sales.js";
import { discoveryInviteMail } from "../../_lib/sales-mail.js";
import { israelDate, withVat } from "../../_lib/sales-calc.js";
import { israelTime } from "../../_lib/slots.js";
import { confirmHeld } from "../../_lib/discovery-book.js";

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
    listPrice: r.list_price === null ? null : Number(r.list_price),
    vatRate: Number(r.vat_rate),
    total: withVat(r.price, r.vat_rate),
    note: r.note,
    pitch: r.pitch || null,
    meetingMinutes: r.meeting_minutes,
    status: r.canceled_at ? "canceled" : r.status,
    viewedAt: iso(r.viewed_at),
    paidAt: iso(r.paid_at),
    paidVia: r.paid_via,
    paymentRef: r.payment_ref,
    bookingStatus: r.booking_status,
    meetingStart: iso(r.meeting_start),
    meetingEnd: iso(r.meeting_end),
    heldUntil: r.booking_status === "held" ? iso(r.held_until) : null,
    contacts: r.contacts || null,
    attendees: r.attendees || [],
    meetUrl: r.meet_url,
    calendarEventId: r.calendar_event_id,
    bookingError: r.booking_error,
    showBooking: r.show_booking !== false,
    showPayment: r.show_payment !== false,
    manualMeeting: r.booking_status === "manual",
    paymentMethod: r.payment_method || null,
    paymentNote: r.payment_note || null,
  };
}

export const PAY_METHODS = ["transfer", "bit", "card", "check", "cash", "other"];

// "2026-11-24T10:00" (Israel time, from the admin's date and time fields) or a full ISO time -> Date
function meetingStartOf(v) {
  const s = String(v || "");
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(s);
  const t = m ? israelTime(m[1], m[2]) : new Date(s);
  if (!s || Number.isNaN(t.getTime())) throw new HttpError(400, "bad_meeting_start");
  return t;
}

// what the manual fields must have, checked before anything is saved
function checkManual(b, d = null) {
  const showBooking = b.showBooking === undefined ? (d ? d.show_booking : true) : b.showBooking !== false;
  const showPayment = b.showPayment === undefined ? (d ? d.show_payment : true) : b.showPayment !== false;
  if (!showBooking && (b.meetingStart !== undefined || d?.booking_status !== "manual")) meetingStartOf(b.meetingStart);
  const method = b.paymentMethod !== undefined ? String(b.paymentMethod || "") : d?.payment_method;
  if (!showPayment && !PAY_METHODS.includes(method)) throw new HttpError(400, "bad_payment_method");
  if (b.paymentStatus !== undefined && !["paid", "pending"].includes(b.paymentStatus)) throw new HttpError(400, "bad_payment_status");
  return { showBooking, showPayment, method };
}

const LINK_BOOKED = ["pending", "confirmed", "invited"];

/** A meeting or a payment arranged outside the client's page (see the header). -> the fresh row */
async function applyManual(id, b, user) {
  const d = (await query("SELECT * FROM sales.discovery WHERE id = $1", [id])).rows[0];
  if (d.canceled_at) throw new HttpError(409, "canceled");
  const { showBooking, showPayment, method } = checkManual(b, d);
  const set = { show_booking: showBooking, show_payment: showPayment };

  if (!showBooking) {
    // a time booked through the page is in the calendar with its invites; it is not replaced from here
    if (d.meeting_start && LINK_BOOKED.includes(d.booking_status)) throw new HttpError(409, "already_booked");
    const start = b.meetingStart !== undefined ? meetingStartOf(b.meetingStart) : d.meeting_start;
    const minutes = b.meetingMinutes !== undefined && b.meetingMinutes !== ""
      ? Math.min(480, Math.max(15, Math.trunc(Number(b.meetingMinutes)) || d.meeting_minutes)) : d.meeting_minutes;
    Object.assign(set, {
      meeting_start: start, meeting_end: new Date(start.getTime() + minutes * 60000), meeting_minutes: minutes,
      booking_status: "manual", held_until: null,
    });
  } else if (d.booking_status === "manual") {
    // back to booking through the page: the typed-in time is dropped
    Object.assign(set, { meeting_start: null, meeting_end: null, booking_status: null });
  }

  let pay = null;   // paid | unpaid | redate
  if (!showPayment) {
    set.payment_method = method;
    const status = b.paymentStatus || (d.paid_at ? "paid" : "pending");
    if (status === "paid") pay = d.paid_at ? "redate" : "paid";
    else if (d.paid_at) {
      if (d.paid_via === "grow") throw new HttpError(409, "already_paid");
      pay = "unpaid";
    }
  }
  if (b.paymentNote !== undefined) set.payment_note = str(b.paymentNote, 500) || null;
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(String(b.paidOn || "")) && b.paidOn <= israelDate() ? b.paidOn : null;

  const keys = Object.keys(set);
  await query(`UPDATE sales.discovery SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`,
    [id, ...keys.map((k) => set[k])]);
  if (pay === "unpaid") {
    await query("UPDATE sales.discovery SET paid_at = NULL, paid_via = NULL, payment_ref = NULL WHERE id = $1", [id]);
  } else if (pay === "paid") {
    // the same as a payment through the page: a time the client picked is booked, and the office is told
    await markDiscoveryPaid(id, { via: "manual", ref: `by ${user}` });
  } else if (!showPayment && showBooking && d.booking_status === "held") {
    // the client picked a time and will pay outside the page: the time is booked now
    await confirmHeld(id, await getSettings());
  }
  // the payment date sales typed (not for a payment made through the page)
  if (paidOn && paidOn !== israelDate() && (pay === "paid" || (pay === "redate" && d.paid_via === "manual"))) {
    await query("UPDATE sales.discovery SET paid_at = ($2::date + time '12:00') AT TIME ZONE 'Asia/Jerusalem' WHERE id = $1", [id, paidOn]);
  }
  await query(
    `UPDATE sales.discovery SET status = CASE WHEN meeting_start IS NOT NULL AND booking_status <> 'held' THEN 'booked'
            WHEN paid_at IS NOT NULL THEN 'paid' WHEN viewed_at IS NOT NULL THEN 'viewed' ELSE 'sent' END WHERE id = $1`, [id]);
  const after = (await query("SELECT * FROM sales.discovery WHERE id = $1", [id])).rows[0];
  await logEvent("discovery", id, "manual", {
    by: user, showBooking, showPayment,
    ...(after.booking_status === "manual" && { meeting: after.meeting_start.toISOString() }),
    ...(!showPayment && { method: after.payment_method, paid: Boolean(after.paid_at) }),
  });
  return after;
}

const CONTACT_KEYS = [["salesName", "sales", "name"], ["salesPhone", "sales", "phone"], ["leadName", "lead", "name"], ["leadPhone", "lead", "phone"], ["officeName", "office", "name"], ["officePhone", "office", "phone"]];

function fields(b, settings, partial = false, current = null) {
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
  if (!partial || b.listPrice !== undefined) {
    const raw = b.listPrice === undefined ? settings.discovery.defaultListPrice : b.listPrice;
    out.list_price = raw === null || raw === "" || raw === undefined ? null : money(raw, "list_price") || null;
  }
  if (!partial || CONTACT_KEYS.some(([k]) => b[k] !== undefined)) {
    const base = current || settings.discovery.contacts || {};
    const c = { sales: { ...base.sales }, lead: { ...base.lead }, office: { ...base.office } };
    for (const [k, who, field] of CONTACT_KEYS) if (b[k] !== undefined) c[who][field] = str(b[k], field === "name" ? 80 : 30);
    out.contacts = JSON.stringify(c);
  }
  set("note", b.note === undefined ? undefined : str(b.note, 1500) || null);
  if (b.pitch !== undefined) out.pitch = pitchOf(b.pitch);
  if (!partial || b.meetingMinutes !== undefined) {
    out.meeting_minutes = Math.min(180, Math.max(15, Math.trunc(Number(b.meetingMinutes) || settings.discovery.meetingMinutes)));
  }
  return out;
}

// { problem, headline, lines } as sales left it -> the stored JSON, or null when there is nothing to show
export function pitchOf(p) {
  if (!p || typeof p !== "object") return null;
  const headline = str(p.headline, 200);
  const lines = (Array.isArray(p.lines) ? p.lines : []).map((l) => str(l, 240)).filter(Boolean).slice(0, 4);
  if (!headline && !lines.length) return null;
  return JSON.stringify({ problem: str(p.problem, 500), headline, lines });
}

// a price before discount is only shown when it is higher than the price
function checkListPrice(price, listPrice) {
  if (listPrice !== null && listPrice !== undefined && Number(listPrice) <= Number(price)) throw new HttpError(400, "bad_list_price");
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
    checkListPrice(f.price, f.list_price);
    checkManual(b);
    const { rows } = await query(
      `INSERT INTO sales.discovery (token, created_by, client_name, company_name, email, phone, tax_id, price, list_price, vat_rate, note, meeting_minutes, contacts, pitch)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [newToken(), user, f.client_name, f.company_name, f.email, f.phone, f.tax_id, f.price, f.list_price, settings.vatRate, f.note, f.meeting_minutes, f.contacts, f.pitch ?? null]);
    let d = rows[0];
    await logEvent("discovery", d.id, "created", { by: user, price: Number(d.price), ...(d.list_price !== null && { listPrice: Number(d.list_price) }) });
    if (b.showBooking === false || b.showPayment === false) d = await applyManual(d.id, b, user);
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
  } else if (b.action === "manual") {
    await applyManual(id, b, user);
  } else if (b.action === "update") {
    if (d.paid_at) throw new HttpError(409, "already_paid");
    const f = fields(b, settings, true, d.contacts);
    checkListPrice(f.price ?? d.price, f.list_price !== undefined ? f.list_price : d.list_price);
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
