// api/_lib/calendar.js against a fake Google: the signed service-account token, free/busy and booking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY = privateKey.export({ type: "pkcs8", format: "pem" });
const settings = { calendar: { user: "developers@pro-algo.com" }, discovery: { title: "ספרינט תכנון ומיפוי" }, officeEmail: "sales@pro-algorithm.co.il" };
const calls = [];

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  calls.push({ url, opts });
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
  if (url === "https://oauth2.googleapis.com/token") {
    const assertion = new URLSearchParams(opts.body.toString()).get("assertion");
    const [h, p, sig] = assertion.split(".");
    const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, sig, "base64url");
    if (!ok) return reply(400, { error: "invalid_grant" });
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    if (claims.sub === "nodelegation@pro-algo.com") return reply(401, { error: "unauthorized_client", error_description: "Client is unauthorized to retrieve access tokens using this method" });
    assert.equal(claims.iss, "sales-calendar@pro-algo-sales.iam.gserviceaccount.com");
    assert.equal(claims.scope, "https://www.googleapis.com/auth/calendar");
    return reply(200, { access_token: `tok-for-${claims.sub}`, expires_in: 3600 });
  }
  if (url.endsWith("/freeBusy")) {
    const body = JSON.parse(opts.body);
    return reply(200, { calendars: { [body.items[0].id]: { busy: [{ start: "2026-11-23T08:00:00Z", end: "2026-11-23T09:00:00Z" }] } } });
  }
  if (url.includes("/events?")) {
    return reply(200, { id: "evt123", hangoutLink: "https://meet.google.com/abc-defg-hij" });
  }
  return reply(404, { error: { message: "unexpected " + url } });
};

process.env.GOOGLE_CALENDAR_CREDENTIALS = JSON.stringify({
  type: "service_account", client_email: "sales-calendar@pro-algo-sales.iam.gserviceaccount.com", private_key: KEY,
});
const cal = await import("../api/_lib/calendar.js");

test("direct: free/busy with a signed token acting as the calendar user", async () => {
  assert.equal(cal.calendarVia(), "google");
  const r = await cal.calendarBusy(settings, "2026-11-23T00:00:00Z", "2026-11-24T00:00:00Z");
  assert.equal(r.ok, true);
  assert.deepEqual(r.busy, [{ start: "2026-11-23T08:00:00Z", end: "2026-11-23T09:00:00Z" }]);
  const fb = calls.find((c) => c.url.endsWith("/freeBusy"));
  assert.equal(fb.opts.headers.Authorization, "Bearer tok-for-developers@pro-algo.com");
});

test("direct: booking creates an event with Meet and invitations", async () => {
  const d = { id: "d1", client_name: "רונן לוי", company_name: "לוי אדריכלים", email: "ronen@example.com", phone: "050", attendees: ["dana@example.com"],
    meeting_start: new Date("2026-11-23T10:00:00Z"), meeting_end: new Date("2026-11-23T11:00:00Z") };
  const r = await cal.calendarBook(d, settings);
  assert.deepEqual(r, { ok: true, eventId: "evt123", meetUrl: "https://meet.google.com/abc-defg-hij" });
  const ev = calls.find((c) => c.url.includes("/events?"));
  assert.ok(ev.url.includes("/calendars/developers%40pro-algo.com/events?conferenceDataVersion=1&sendUpdates=all"));
  const body = JSON.parse(ev.opts.body);
  assert.deepEqual(body.attendees.map((a) => a.email), ["ronen@example.com", "dana@example.com", "sales@pro-algorithm.co.il"]);
  assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  assert.equal(body.start.dateTime, "2026-11-23T10:00:00.000Z");
  // one token for both calls (cached)
  assert.equal(calls.filter((c) => c.url.includes("oauth2")).length, 1);
});

test("direct: a missing delegation is reported, not thrown", async () => {
  const r = await cal.calendarBusy({ calendar: { user: "nodelegation@pro-algo.com" } }, "2026-11-23T00:00:00Z", "2026-11-24T00:00:00Z");
  assert.equal(r.ok, false);
  assert.match(r.error, /unauthorized_client/);
});

test("a variable that is not a service account key is reported", async () => {
  process.env.GOOGLE_CALENDAR_CREDENTIALS = "not json";
  assert.equal(cal.calendarVia(), "misconfigured");
  const r = await cal.calendarBusy(settings, "a", "b");
  assert.equal(r.ok, false);
});

test("without the key the calendar goes through Toro", async () => {
  delete process.env.GOOGLE_CALENDAR_CREDENTIALS;
  const saved = process.env.TORO_URL;
  delete process.env.TORO_URL;
  assert.equal(cal.calendarVia(), "toro");
  const r = await cal.calendarBusy(settings, "a", "b");
  if (saved) process.env.TORO_URL = saved;
  assert.equal(r.ok, false);
  assert.equal(r.error, "toro_not_configured");
});
