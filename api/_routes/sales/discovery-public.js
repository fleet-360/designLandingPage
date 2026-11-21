// /api/sales/discovery-public?token=   the client's spec request page (no sign-in; the token is the key)
//   GET   -> the page's data; the first visit marks it viewed
//   GET &slots=1 -> meeting slots (once paid)
//   POST { action: "book", start, attendees: [email] }  -> books the meeting
import { HttpError, json, readJson, route } from "../../_lib/http.js";
import { query, transaction } from "../../_lib/db.js";
import { getSettings, isEmail, logEvent, sendMail } from "../../_lib/sales.js";
import { withVat } from "../../_lib/sales-calc.js";
import { availableSlots } from "../../_lib/slots.js";
import { calendarBook } from "../../_lib/calendar.js";
import { discoveryBookedMail, meetingIcs } from "../../_lib/sales-mail.js";

const iso = (d) => (d ? new Date(d).toISOString() : null);

async function load(token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ""))) throw new HttpError(404, "not_found");
  const { rows } = await query("SELECT * FROM sales.discovery WHERE token = $1", [token]);
  const d = rows[0];
  if (!d || d.canceled_at) throw new HttpError(404, "not_found");
  return d;
}

function view(d, settings) {
  return {
    title: settings.discovery.title,
    clientName: d.client_name,
    companyName: d.company_name,
    note: d.note,
    price: Number(d.price),
    vatRate: Number(d.vat_rate),
    total: withVat(d.price, d.vat_rate),
    meetingMinutes: d.meeting_minutes,
    status: d.status,
    paid: Boolean(d.paid_at),
    booked: Boolean(d.meeting_start),
    email: d.email || "",   // where the meeting invite goes
    meeting: d.meeting_start ? { start: iso(d.meeting_start), end: iso(d.meeting_end), meetUrl: d.meet_url, attendees: d.attendees, invited: d.booking_status } : null,
    // for the payment widget (Toro createPaymentLink, the same as /pay): the request's id is the link id
    payment: d.paid_at ? null : {
      linkId: d.id,
      sum: withVat(d.price, d.vat_rate),
      description: `${settings.discovery.title} - ${d.company_name || d.client_name}`.slice(0, 120),
      fullName: d.client_name,
      email: d.email || "",
      phone: d.phone || "",
      taxId: d.tax_id || "",
    },
    company: { name: settings.company.name, phone: settings.company.phone, email: settings.officeEmail },
  };
}

export default route(["GET", "POST"], async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams;
  const d = await load(q.get("token"));
  const settings = await getSettings();

  if (req.method === "GET" && q.get("slots")) {
    if (!d.paid_at) throw new HttpError(402, "not_paid");
    if (d.meeting_start) return json(res, 200, { slots: [], booked: true });
    const { slots, calendarConnected } = await availableSlots(settings, d.meeting_minutes, { excludeId: d.id });
    return json(res, 200, { slots, calendarConnected });
  }

  if (req.method === "GET") {
    if (!d.viewed_at) {
      await query("UPDATE sales.discovery SET viewed_at = now(), status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END WHERE id = $1", [d.id]);
      await logEvent("discovery", d.id, "viewed");
    }
    return json(res, 200, view(d, settings));
  }

  // POST book
  const b = await readJson(req);
  if (b.action !== "book") throw new HttpError(400, "bad_action");
  if (!d.paid_at) throw new HttpError(402, "not_paid");
  if (d.meeting_start) throw new HttpError(409, "already_booked");
  const attendees = [...new Set([].concat(b.attendees || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  if (attendees.some((e) => !isEmail(e))) throw new HttpError(400, "bad_attendee");
  const { isFree } = await availableSlots(settings, d.meeting_minutes, { excludeId: d.id });
  if (!b.start || !isFree(b.start)) throw new HttpError(409, "slot_taken");
  const start = new Date(b.start);
  const end = new Date(start.getTime() + d.meeting_minutes * 60000);

  try {
    // one booking at a time, so two clients cannot take overlapping times in the same moment
    await transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext('sales.discovery.booking'))");
      const clash = await db.query(
        `SELECT 1 FROM sales.discovery WHERE id <> $1 AND canceled_at IS NULL AND meeting_start IS NOT NULL
            AND meeting_start < $3 AND meeting_end > $2 LIMIT 1`, [d.id, start, end]);
      if (clash.rows[0]) throw new HttpError(409, "slot_taken");
      const u = await db.query(
        `UPDATE sales.discovery SET meeting_start = $2, meeting_end = $3, attendees = $4, booking_status = 'pending',
                booked_at = now(), status = 'booked', updated_at = now()
          WHERE id = $1 AND meeting_start IS NULL RETURNING id`, [d.id, start, end, JSON.stringify(attendees)]);
      if (!u.rows[0]) throw new HttpError(409, "already_booked");
    });
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "slot_taken"); // the unique slot index
    throw err;
  }
  await logEvent("discovery", d.id, "booked", { start: start.toISOString(), attendees });

  // the calendar event (with a Meet link and invitations to everyone): Google directly, or through Toro
  const booked = (await query("SELECT * FROM sales.discovery WHERE id = $1", [d.id])).rows[0];
  const cal = await calendarBook(booked, settings);
  if (cal.ok) {
    await query(
      `UPDATE sales.discovery SET booking_status = 'confirmed', calendar_event_id = $2, meet_url = $3, booking_error = NULL
        WHERE id = $1`, [d.id, cal.eventId || null, cal.meetUrl || null]);
  } else {
    await query("UPDATE sales.discovery SET booking_status = 'invited', booking_error = $2 WHERE id = $1", [d.id, String(cal.error || "").slice(0, 300)]);
    await logEvent("discovery", d.id, "calendar_failed", { error: cal.error });
  }
  const fresh = (await query("SELECT * FROM sales.discovery WHERE id = $1", [d.id])).rows[0];

  // our confirmation; with an .ics invite when the calendar did not send invitations itself
  const attachments = [];
  if (!cal.ok) {
    const ics = Buffer.from(meetingIcs(fresh, settings), "utf8");
    const f = await query(
      "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (false, 'invite.ics', 'text/calendar', $1, $2) RETURNING id",
      [ics.length, ics]);
    attachments.push({ filename: "invite.ics", fileId: f.rows[0].id });
  }
  const mail = await sendMail({ ...discoveryBookedMail(fresh, settings, { calendarInvited: cal.ok }), attachments, entity: "discovery", entityId: d.id, kind: "discovery_booked" });
  await logEvent("discovery", d.id, "email_sent", { kind: "booked", sent: mail.sent });
  json(res, 200, view(fresh, settings));
});
