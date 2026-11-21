// End-to-end run of what sales enters by hand: a spec request whose meeting or payment was arranged
// outside the client's page, and a deal the client signed outside the link (with the order confirmation).
// Run against a local server and database: node tests/e2e-sales-manual.mjs [http://localhost:5175]
// Reads PAY_ADMIN_USER / PAY_ADMIN_PASSWORD and DATABASE_URL from .env. Leaves its test records in the database.
import assert from "node:assert/strict";
import pg from "pg";
import { loadDotEnv } from "../api/_lib/env.js";

loadDotEnv(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const BASE = process.argv[2] || "http://localhost:5175";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let cookie = "";

async function api(path, { method = "GET", body, expect } = {}) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const data = await r.json().catch(() => ({}));
  if (expect) assert.equal(r.status, expect, `${method} ${path} -> ${r.status} ${JSON.stringify(data)}`);
  else assert.ok(r.ok, `${method} ${path} -> ${r.status} ${JSON.stringify(data)}`);
  return data;
}
const step = (s) => console.log(`\n== ${s}`);
const tokenOf = (url) => url.split("/").pop();
const israelDay = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
const daysAgo = (n) => israelDay(Date.now() - n * 86400e3);
const outbox = async (entityId, kind) => (await db.query(
  "SELECT kind, to_list, cc_list, attachments, html FROM sales.outbox WHERE entity_id = $1 AND kind = $2 ORDER BY created_at", [entityId, kind])).rows;

step("sign in");
await api("auth/login", { method: "POST", body: { user: process.env.PAY_ADMIN_USER, password: process.env.PAY_ADMIN_PASSWORD } });

// ---------------- Spec request ----------------
const client = { clientName: "נועה ברק", companyName: "ברק הנדסה", email: "noa@example.com", phone: "0521112233", price: 999 };
// a meeting time a week from now at 11:00 Israel time, sales's choice (not one of the offered slots)
const meetDay = israelDay(Date.now() + 7 * 86400e3);

step("spec request: the fields that are switched off must be filled");
await api("sales/discovery", { method: "POST", body: { ...client, showBooking: false }, expect: 400 });
await api("sales/discovery", { method: "POST", body: { ...client, showPayment: false, paymentMethod: "barter" }, expect: 400 });

step("spec request: meeting and payment both arranged outside the page");
let disc = (await api("sales/discovery", { method: "POST", body: {
  ...client, showBooking: false, meetingStart: `${meetDay}T11:00`, meetingMinutes: 90,
  showPayment: false, paymentMethod: "transfer", paymentStatus: "pending", paymentNote: "ישלם בהעברה עד סוף החודש",
} })).item;
assert.equal(disc.showBooking, false);
assert.equal(disc.showPayment, false);
assert.equal(disc.manualMeeting, true);
assert.equal(disc.meetingMinutes, 90);
assert.equal(new Date(disc.meetingStart).toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }), "11:00");
assert.equal(disc.paidAt, null);
assert.equal(disc.paymentMethod, "transfer");
assert.equal(disc.paymentNote, "ישלם בהעברה עד סוף החודש");
const dtok = tokenOf(disc.url);
let pub = await api(`sales/discovery-public?token=${dtok}`);
assert.equal(pub.showBooking, false);
assert.equal(pub.payment, null, "no payment widget when the payment is outside the page");
assert.equal(pub.booked, true);
assert.equal(pub.meeting.invited, "manual");
assert.deepEqual(await api(`sales/discovery-public?token=${dtok}&slots=1`), { slots: [], manual: true });
await api(`sales/discovery-public?token=${dtok}`, { method: "POST", body: { action: "hold", start: disc.meetingStart }, expect: 409 });

step("spec request: later marked paid by hand, with the payment date");
disc = (await api(`sales/discovery?id=${disc.id}`, { method: "PATCH", body: { action: "manual", paymentStatus: "paid", paidOn: daysAgo(2), paymentNote: "אסמכתא 4471" } })).item;
assert.equal(disc.paidVia, "manual");
assert.equal(israelDay(disc.paidAt), daysAgo(2));
assert.equal(disc.manualMeeting, true, "the typed-in meeting stays");
const paidMail = await outbox(disc.id, "discovery_paid_office");
assert.equal(paidMail.length, 1);
assert.ok(paidMail[0].html.includes("העברה בנקאית") && paidMail[0].html.includes("תואמה ידנית"), "the office email says how it was paid and that the meeting was set by hand");

step("spec request: a payment marked by mistake goes back to unpaid; the meeting time can be changed");
disc = (await api(`sales/discovery?id=${disc.id}`, { method: "PATCH", body: { action: "manual", paymentStatus: "pending", meetingStart: `${meetDay}T14:30` } })).item;
assert.equal(disc.paidAt, null);
assert.equal(new Date(disc.meetingStart).toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }), "14:30");

step("spec request: back to booking through the page drops the typed-in time");
disc = (await api(`sales/discovery?id=${disc.id}`, { method: "PATCH", body: { action: "manual", showBooking: true } })).item;
assert.equal(disc.meetingStart, null);
assert.equal(disc.manualMeeting, false);
const back = await api(`sales/discovery-public?token=${dtok}&slots=1`);
assert.ok(back.slots.length > 0);

step("spec request: booking on the page, payment outside it -> the time is booked at once");
let d2 = (await api("sales/discovery", { method: "POST", body: { ...client, showPayment: false, paymentMethod: "bit" } })).item;
const tok2 = tokenOf(d2.url);
const { slots } = await api(`sales/discovery-public?token=${tok2}&slots=1`);
pub = await api(`sales/discovery-public?token=${tok2}`, { method: "POST", body: { action: "hold", start: slots[0].start } });
assert.equal(pub.booked, true, "booked without a payment step");
assert.equal(pub.hold, null);
d2 = (await api(`sales/discovery?id=${d2.id}`)).item;
assert.ok(["pending", "confirmed", "invited"].includes(d2.bookingStatus), d2.bookingStatus);
assert.equal(d2.paidAt, null);
// a time booked through the page (with its invites) is not replaced by hand
await api(`sales/discovery?id=${d2.id}`, { method: "PATCH", body: { action: "manual", showBooking: false, meetingStart: `${meetDay}T09:00` }, expect: 409 });

step("spec request: a typed-in meeting blocks that time for others; two typed-in meetings may share a time");
const d3 = (await api("sales/discovery", { method: "POST", body: client })).item;
const free = (await api(`sales/discovery-public?token=${tokenOf(d3.url)}&slots=1`)).slots;
const at = free[free.length - 1].start;
await api("sales/discovery", { method: "POST", body: { ...client, showBooking: false, meetingStart: at } });
await api("sales/discovery", { method: "POST", body: { ...client, showBooking: false, meetingStart: at } });
const after = (await api(`sales/discovery-public?token=${tokenOf(d3.url)}&slots=1`)).slots;
assert.ok(!after.some((s) => s.start === at), "the typed-in time is no longer offered");

step("spec request: a held time becomes a booking when sales moves the payment off the page");
const d4 = (await api("sales/discovery", { method: "POST", body: client })).item;
const tok4 = tokenOf(d4.url);
const s4 = (await api(`sales/discovery-public?token=${tok4}&slots=1`)).slots;
pub = await api(`sales/discovery-public?token=${tok4}`, { method: "POST", body: { action: "hold", start: s4[0].start } });
assert.ok(pub.hold);
const h4 = (await api(`sales/discovery?id=${d4.id}`, { method: "PATCH", body: { action: "manual", showPayment: false, paymentMethod: "check", paymentStatus: "pending" } })).item;
assert.ok(["pending", "confirmed", "invited"].includes(h4.bookingStatus), h4.bookingStatus);
assert.equal(h4.meetingStart, s4[0].start);

// ---------------- Deal ----------------
const dealData = {
  project: { name: "מערכת תמחור הצעות", summary: "מחשבון הצעות מחיר שמחובר למחירון ומפיק PDF ללקוח." },
  price: { amount: 36000, installments: 3, installmentDay: 1, balanceMethod: "transfer" },
  service: { enabled: true, includedMonths: 3, periods: [{ months: null, price: 900 }] },
  standingOrder: { enabled: true, startDate: "", dayOfMonth: 1 },
};
const dealClient = { companyName: "ברק הנדסה בע\"מ", taxId: "515555555", signerName: "נועה ברק", signerRole: "מנכ\"לית", email: "noa@example.com", phone: "0521112233", accountingEmail: "books@example.com" };
const PDF = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n").toString("base64")}`;

step("deal: the signed contract is uploaded, the deal is saved signed, the order confirmation goes out with it");
const { fileId } = await api("sales/upload", { method: "POST", body: { name: "חוזה חתום - ברק.pdf", data_url: PDF } });
const signedOn = daysAgo(3);
let deal = (await api("sales/deals", { method: "POST", body: {
  data: dealData, client: dealClient, signMode: "manual", signedOn, fileId, sendOrderMail: true, attachContract: true,
  paymentNote: "המקדמה הועברה",
} })).item;
assert.equal(deal.signMode, "manual");
assert.equal(deal.signedOn, signedOn);
assert.equal(deal.status.order, "approved");
assert.equal(deal.status.agreement, "signed");
assert.equal(deal.hasSignedPdf, true);
assert.ok(deal.subscriptionId, "the standing order waits for the card");
assert.equal(deal.paymentNote, "המקדמה הועברה");
let order = (await api(`sales/deals?id=${deal.id}`)).order;
assert.equal(order.date, signedOn, "the schedule is frozen from the signing date");
let mails = await outbox(deal.id, "deal_order");
assert.equal(mails.length, 1);
assert.deepEqual(mails[0].to_list, ["noa@example.com"]);
assert.ok(mails[0].cc_list.includes("books@example.com"));
assert.equal(mails[0].attachments.length, 1);
assert.equal(mails[0].attachments[0].file_id, fileId);
assert.ok(mails[0].html.includes("/card/"), "the order confirmation carries the card link for the standing order");
assert.equal((await outbox(deal.id, "deal_invite")).length, 0, "no link invite for a deal signed outside it");

step("deal: the client's link goes straight to the card step");
const dview = await api(`sales/deal-public?token=${tokenOf(deal.url)}`);
assert.equal(dview.signature.manual, true);
assert.ok(dview.links.signedPdf);
assert.equal(dview.subscription.status, "pending_card");

step("deal: the order confirmation again, without the contract; the payment note edited");
await api(`sales/deals?id=${deal.id}`, { method: "PATCH", body: { action: "send_order", attachContract: false } });
mails = await outbox(deal.id, "deal_order");
assert.equal(mails.length, 2);
assert.equal(mails[1].attachments.length, 0);
deal = (await api(`sales/deals?id=${deal.id}`, { method: "PATCH", body: { action: "payment_note", note: "המקדמה הועברה, השירות בהוראת קבע" } })).item;
assert.equal(deal.paymentNote, "המקדמה הועברה, השירות בהוראת קבע");
await api(`sales/deals?id=${deal.id}`, { method: "PATCH", body: { action: "cancel" }, expect: 409 });
await api(`sales/deals?id=${deal.id}`, { method: "PATCH", body: { action: "close_manual" }, expect: 409 });

step("deal: sent through the link, then signed on paper; the contract is uploaded afterwards");
let linkDeal = (await api("sales/deals", { method: "POST", body: { data: { ...dealData, standingOrder: { enabled: false } }, client: dealClient } })).item;
await api(`sales/deals?id=${linkDeal.id}`, { method: "PATCH", body: { action: "signed_file", fileId }, expect: 409 });
linkDeal = (await api(`sales/deals?id=${linkDeal.id}`, { method: "PATCH", body: { action: "close_manual" } })).item;
assert.equal(linkDeal.signMode, "manual");
assert.equal(linkDeal.hasSignedPdf, false);
assert.equal(linkDeal.signedOn, israelDay(Date.now()));
assert.equal(linkDeal.subscriptionId, null);
linkDeal = (await api(`sales/deals?id=${linkDeal.id}`, { method: "PATCH", body: { action: "signed_file", fileId } })).item;
assert.equal(linkDeal.hasSignedPdf, true);

step("deal: approved through the link before it was signed on paper keeps the approved schedule");
let approved = (await api("sales/deals", { method: "POST", body: { data: dealData, client: dealClient } })).item;
await api(`sales/deal-public?token=${tokenOf(approved.url)}`, { method: "POST", body: { action: "approve", approverName: "נועה ברק", accept: true, client: { accountingEmail: "books@example.com" } } });
const approvedOn = (await api(`sales/deals?id=${approved.id}`)).order.date;
approved = (await api(`sales/deals?id=${approved.id}`, { method: "PATCH", body: { action: "close_manual", signedOn: daysAgo(1) } })).item;
assert.equal((await api(`sales/deals?id=${approved.id}`)).order.date, approvedOn);
assert.ok(approved.subscriptionId);

step("deal: closed by hand without an email, no order confirmation possible");
const noMail = (await api("sales/deals", { method: "POST", body: { data: dealData, client: { ...dealClient, email: "" }, signMode: "manual", sendOrderMail: false } })).item;
await api(`sales/deals?id=${noMail.id}`, { method: "PATCH", body: { action: "send_order" }, expect: 400 });
await api("sales/deals", { method: "POST", body: { data: dealData, client: { ...dealClient, email: "" }, signMode: "manual", sendOrderMail: true }, expect: 400 });

await db.end();
console.log("\nall manual-entry checks passed");
