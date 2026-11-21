// /api/sales/discovery-public?token=   the client's spec request page (no sign-in; the token is the key)
//   GET   -> the page's data; the first visit marks it viewed
//   GET &slots=1 -> meeting slots: the first suggestions + every free time per day
//   POST { action: "hold", start, attendees: [email] }  -> keeps the time for the client until they pay
//                                                         (once paid, or when the payment is not on the page:
//                                                         books it, and the invites go out)
// Sales may leave the booking or the payment off the page (show_booking / show_payment) and enter them by hand.
import { HttpError, json, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { getSettings, isEmail, logEvent } from "../../_lib/sales.js";
import { withVat } from "../../_lib/sales-calc.js";
import { availableSlots } from "../../_lib/slots.js";
import { reserveSlot, sendInvites } from "../../_lib/discovery-book.js";

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
    listPrice: d.list_price === null ? null : Number(d.list_price),   // before discount, struck through
    vatRate: Number(d.vat_rate),
    total: withVat(d.price, d.vat_rate),
    meetingMinutes: d.meeting_minutes,
    status: d.status,
    paid: Boolean(d.paid_at),
    paidOnline: d.paid_via === "grow",   // Toro sent an invoice
    showBooking: d.show_booking !== false,
    showPayment: d.show_payment !== false,
    booked: Boolean(d.meeting_start) && d.booking_status !== "held",
    // the time the client picked, kept for them while they pay
    hold: d.booking_status === "held" && d.held_until > new Date()
      ? { start: iso(d.meeting_start), end: iso(d.meeting_end), until: iso(d.held_until), attendees: d.attendees } : null,
    bookingPending: d.booking_status === "held",   // paid and held: the booking is being made right now
    email: d.email || "",   // where the meeting invite goes
    meeting: d.meeting_start && d.booking_status !== "held" ? { start: iso(d.meeting_start), end: iso(d.meeting_end), meetUrl: d.meet_url, attendees: d.attendees, invited: d.booking_status } : null,
    // for the payment widget (Toro createPaymentLink, the same as /pay): the request's id is the link id
    payment: d.paid_at || d.show_payment === false ? null : {
      linkId: d.id,
      sum: withVat(d.price, d.vat_rate),
      description: `${settings.discovery.title} - ${d.company_name || d.client_name}`.slice(0, 120),
      // the customer name on the charge, which Toro's invoice uses: the company when sales entered one
      fullName: d.company_name || d.client_name,
      email: d.email || "",
      phone: d.phone || "",
      taxId: d.tax_id || "",
    },
    company: { name: settings.company.name, phone: settings.company.phone, email: settings.officeEmail },
    contacts: d.contacts || null,   // the responsible salesperson and team lead
  };
}

export default route(["GET", "POST"], async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams;
  const d = await load(q.get("token"));
  const settings = await getSettings();

  if (req.method === "GET" && q.get("slots")) {
    if (d.show_booking === false) return json(res, 200, { slots: [], days: [], manual: true });
    if (d.meeting_start && d.booking_status !== "held") return json(res, 200, { slots: [], days: [], booked: true });
    const { slots, days, calendarConnected } = await availableSlots(settings, d.meeting_minutes, { excludeId: d.id });
    return json(res, 200, { slots, days, calendarConnected });
  }

  if (req.method === "GET") {
    if (!d.viewed_at) {
      await query("UPDATE sales.discovery SET viewed_at = now(), status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END WHERE id = $1", [d.id]);
      await logEvent("discovery", d.id, "viewed");
    }
    return json(res, 200, view(d, settings));
  }

  // POST: hold a time before payment, or book it once paid (a paid request that has no time yet)
  const b = await readJson(req);
  if (b.action !== "hold" && b.action !== "book") throw new HttpError(400, "bad_action");
  if (d.show_booking === false) throw new HttpError(409, "booking_manual");
  if (d.meeting_start && d.booking_status !== "held") throw new HttpError(409, "already_booked");
  const attendees = [...new Set([].concat(b.attendees || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  if (attendees.some((e) => !isEmail(e))) throw new HttpError(400, "bad_attendee");
  const { isFree } = await availableSlots(settings, d.meeting_minutes, { excludeId: d.id });
  if (!b.start || !isFree(b.start)) throw new HttpError(409, "slot_taken");
  const start = new Date(b.start);

  if (!d.paid_at && d.show_payment !== false) {
    // the invite goes out only after the payment is confirmed (confirmHeld, from markDiscoveryPaid)
    await reserveSlot(d, start, attendees, { hold: true });
  } else {
    await reserveSlot(d, start, attendees, { hold: false });
    await sendInvites((await query("SELECT * FROM sales.discovery WHERE id = $1", [d.id])).rows[0], settings);
  }
  const fresh = (await query("SELECT * FROM sales.discovery WHERE id = $1", [d.id])).rows[0];
  json(res, 200, view(fresh, settings));
});
