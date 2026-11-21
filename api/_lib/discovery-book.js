// Spec request meetings. The client picks a time first and pays last:
//   hold     the picked time is kept for the client for HOLD_MINUTES (booking_status 'held'), no invite yet
//   paid     markDiscoveryPaid (sales.js) turns the hold into a booking: the calendar event with a Meet link,
//            and our confirmation email. A hold that ran out still becomes a booking when nobody took the time;
//            otherwise it is released and the client picks again (already paid, so it is booked at once).
// Bookings and holds are taken one at a time (an advisory lock), so two clients cannot take overlapping times.
import { query, transaction } from "./db.js";
import { HttpError } from "./http.js";
import { logEvent, sendMail } from "./sales.js";
import { calendarBook } from "./calendar.js";
import { discoveryBookedMail, meetingIcs } from "./sales-mail.js";

export const HOLD_MINUTES = 30;

// what blocks a time for others: a booking, or a hold that has not run out
export const BLOCKING = "meeting_start IS NOT NULL AND canceled_at IS NULL AND NOT (booking_status = 'held' AND held_until < now())";

const lock = (db) => db.query("SELECT pg_advisory_xact_lock(hashtext('sales.discovery.booking'))");

// holds that ran out and were not paid give their time back (the unique slot index would block it otherwise)
const releaseExpired = (db) => db.query(
  `UPDATE sales.discovery SET meeting_start = NULL, meeting_end = NULL, booking_status = NULL, held_until = NULL, updated_at = now()
    WHERE booking_status = 'held' AND held_until < now() AND paid_at IS NULL`);

async function clash(db, id, start, end) {
  const r = await db.query(
    `SELECT 1 FROM sales.discovery WHERE id <> $1 AND ${BLOCKING} AND meeting_start < $3 AND meeting_end > $2 LIMIT 1`, [id, start, end]);
  return Boolean(r.rows[0]);
}

/** Takes a time for a spec request: a hold before payment, a booking after it. Throws 409 slot_taken. */
export async function reserveSlot(d, start, attendees, { hold }) {
  const end = new Date(start.getTime() + d.meeting_minutes * 60000);
  try {
    await transaction(async (db) => {
      await lock(db);
      await releaseExpired(db);
      if (await clash(db, d.id, start, end)) throw new HttpError(409, "slot_taken");
      const u = hold
        ? await db.query(
          `UPDATE sales.discovery SET meeting_start = $2, meeting_end = $3, attendees = $4, booking_status = 'held',
                  held_until = now() + interval '${HOLD_MINUTES} minutes', updated_at = now()
            WHERE id = $1 AND paid_at IS NULL AND (meeting_start IS NULL OR booking_status = 'held') RETURNING id`,
          [d.id, start, end, JSON.stringify(attendees)])
        : await db.query(
          `UPDATE sales.discovery SET meeting_start = $2, meeting_end = $3, attendees = $4, booking_status = 'pending', held_until = NULL,
                  booked_at = now(), status = 'booked', updated_at = now()
            WHERE id = $1 AND (meeting_start IS NULL OR booking_status = 'held') RETURNING id`,
          [d.id, start, end, JSON.stringify(attendees)]);
      if (!u.rows[0]) throw new HttpError(409, hold && d.paid_at ? "already_paid" : "already_booked");
    });
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "slot_taken"); // the unique slot index
    throw err;
  }
  await logEvent("discovery", d.id, hold ? "held" : "booked", { start: start.toISOString(), attendees });
}

/** After the payment: the held time becomes a booking. -> the booked row, or null (no hold, or the time was taken) */
export async function confirmHeld(id, settings) {
  const taken = await transaction(async (db) => {
    await lock(db);
    const d = (await db.query("SELECT * FROM sales.discovery WHERE id = $1", [id])).rows[0];
    if (!d || d.canceled_at || d.booking_status !== "held" || !d.meeting_start) return "none";
    if (await clash(db, id, d.meeting_start, d.meeting_end)) {
      await db.query(
        "UPDATE sales.discovery SET meeting_start = NULL, meeting_end = NULL, booking_status = NULL, held_until = NULL, updated_at = now() WHERE id = $1", [id]);
      return "lost";
    }
    await db.query(
      `UPDATE sales.discovery SET booking_status = 'pending', held_until = NULL, booked_at = now(), status = 'booked', updated_at = now()
        WHERE id = $1`, [id]);
    return "booked";
  });
  if (taken === "lost") await logEvent("discovery", id, "hold_lost");
  if (taken !== "booked") return null;
  const d = (await query("SELECT * FROM sales.discovery WHERE id = $1", [id])).rows[0];
  await logEvent("discovery", id, "booked", { start: d.meeting_start.toISOString(), attendees: d.attendees, after: "payment" });
  return sendInvites(d, settings);
}

/** The calendar event (Meet link, invitations to everyone) and our confirmation. -> the fresh row */
export async function sendInvites(booked, settings) {
  const cal = await calendarBook(booked, settings);
  if (cal.ok) {
    await query(
      `UPDATE sales.discovery SET booking_status = 'confirmed', calendar_event_id = $2, meet_url = $3, booking_error = NULL
        WHERE id = $1`, [booked.id, cal.eventId || null, cal.meetUrl || null]);
  } else {
    await query("UPDATE sales.discovery SET booking_status = 'invited', booking_error = $2 WHERE id = $1", [booked.id, String(cal.error || "").slice(0, 300)]);
    await logEvent("discovery", booked.id, "calendar_failed", { error: cal.error });
  }
  const fresh = (await query("SELECT * FROM sales.discovery WHERE id = $1", [booked.id])).rows[0];

  // our confirmation; with an .ics invite when the calendar did not send invitations itself
  const attachments = [];
  if (!cal.ok) {
    const ics = Buffer.from(meetingIcs(fresh, settings), "utf8");
    const f = await query(
      "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (false, 'invite.ics', 'text/calendar', $1, $2) RETURNING id",
      [ics.length, ics]);
    attachments.push({ filename: "invite.ics", fileId: f.rows[0].id });
  }
  const mail = await sendMail({ ...discoveryBookedMail(fresh, settings, { calendarInvited: cal.ok }), attachments, entity: "discovery", entityId: fresh.id, kind: "discovery_booked" });
  await logEvent("discovery", fresh.id, "email_sent", { kind: "booked", sent: mail.sent });
  return fresh;
}
