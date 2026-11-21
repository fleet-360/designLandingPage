// The developers@pro-algo.com calendar: free/busy times and booking meetings (with a Meet link and
// invitations sent by Google).
//
// Directly from the site when GOOGLE_CALENDAR_CREDENTIALS is set in Vercel: the JSON key (the whole
// downloaded file) of a service account in Pro Algo's own Google Cloud project. In the pro-algo.com
// Google Workspace admin console (Security > API controls > Domain-wide delegation) that service
// account's client id needs the scope https://www.googleapis.com/auth/calendar; it then acts as
// the calendar set on the settings screen (developers@pro-algo.com by default).
// Without the key, the same calls go through Toro (proAlgoSales /calendar/*) as before.
import { createSign } from "node:crypto";
import { callToro } from "./toro.js";

const SCOPE = "https://www.googleapis.com/auth/calendar";
const API = "https://www.googleapis.com/calendar/v3";
const TZ = "Asia/Jerusalem";

export const calendarUser = (settings) => settings?.calendar?.user || "developers@pro-algo.com";

function credentials() {
  const raw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    if (!c.client_email || !c.private_key) return null;
    return { email: c.client_email, key: String(c.private_key).replace(/\\n/g, "\n"), tokenUri: c.token_uri || "https://oauth2.googleapis.com/token" };
  } catch {
    return null;
  }
}

/** "google" (direct), "toro", or "misconfigured" when the variable is set but is not a service account key */
export function calendarVia() {
  if (!process.env.GOOGLE_CALENDAR_CREDENTIALS) return "toro";
  return credentials() ? "google" : "misconfigured";
}

let cached = null; // { token, exp, key }

async function accessToken(user) {
  const c = credentials();
  const cacheKey = `${c.email}|${user}`;
  if (cached && cached.key === cacheKey && cached.exp > Date.now() + 60e3) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iss: c.email, sub: user, scope: SCOPE, aud: c.tokenUri, iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(c.key, "base64url");
  const r = await fetch(c.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json().catch(() => ({}));
  // "unauthorized_client" here means the domain-wide delegation is missing or lacks the calendar scope
  if (!r.ok || !data.access_token) throw new Error(data.error_description ? `${data.error}: ${data.error_description}` : data.error || `token_${r.status}`);
  cached = { token: data.access_token, exp: Date.now() + Number(data.expires_in || 3600) * 1000, key: cacheKey };
  return cached.token;
}

async function google(user, path, { method = "GET", body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(user)}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `google_${r.status}`);
  return data;
}

const failed = (err) => ({ ok: false, error: String(err?.message || err).slice(0, 300) });

/** -> { ok, busy: [{ start, end }] } or { ok: false, error } */
export async function calendarBusy(settings, timeMin, timeMax) {
  const via = calendarVia();
  if (via === "toro") return callToro("/proAlgoSales/calendar/busy", { timeMin, timeMax });
  if (via === "misconfigured") return failed("GOOGLE_CALENDAR_CREDENTIALS is not a service account JSON key");
  const user = calendarUser(settings);
  try {
    const data = await google(user, "/freeBusy", { method: "POST", body: { timeMin, timeMax, timeZone: TZ, items: [{ id: user }] } });
    const cal = data.calendars?.[user];
    if (cal?.errors?.length) throw new Error(cal.errors.map((e) => e.reason).join(", "));
    return { ok: true, busy: (cal?.busy || []).map((b) => ({ start: b.start, end: b.end })) };
  } catch (err) {
    return failed(err);
  }
}

/** The event for a booked spec request (a sales.discovery row) */
export function bookingEvent(d, settings) {
  const who = d.company_name ? `${d.client_name} · ${d.company_name}` : d.client_name;
  return {
    start: new Date(d.meeting_start).toISOString(),
    end: new Date(d.meeting_end).toISOString(),
    summary: `${settings.discovery.title} · ${who}`,
    description: [`פגישת פתיחה של ${settings.discovery.title}.`, `לקוח: ${who}`, d.email ? `אימייל: ${d.email}` : "", d.phone ? `טלפון: ${d.phone}` : "", d.note ? `\n${d.note}` : ""].filter(Boolean).join("\n"),
    // the client, the guests they added, our team (settings) and the calendar user who organizes the meeting
    attendees: [...new Set([d.email, ...(d.attendees || []), ...(settings.calendar?.invitees || []), calendarUser(settings)]
      .map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))],
  };
}

/** Creates the meeting for a booked spec request -> { ok, eventId, meetUrl } or { ok: false, error } */
export async function calendarBook(d, settings) {
  const via = calendarVia();
  if (via === "toro") return callToro("/proAlgoSales/calendar/book", { bookingId: d.id });
  if (via === "misconfigured") return failed("GOOGLE_CALENDAR_CREDENTIALS is not a service account JSON key");
  const e = bookingEvent(d, settings);
  const user = calendarUser(settings);
  try {
    const data = await google(user, `/calendars/${encodeURIComponent(user)}/events?conferenceDataVersion=1&sendUpdates=all`, {
      method: "POST",
      body: {
        summary: e.summary,
        description: e.description,
        start: { dateTime: e.start, timeZone: TZ },
        end: { dateTime: e.end, timeZone: TZ },
        attendees: e.attendees.map((email) => ({ email })),
        conferenceData: { createRequest: { requestId: String(d.id), conferenceSolutionKey: { type: "hangoutsMeet" } } },
        reminders: { useDefault: true },
      },
    });
    return { ok: true, eventId: data.id, meetUrl: data.hangoutLink || null };
  } catch (err) {
    return failed(err);
  }
}
