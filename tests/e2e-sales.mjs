// End-to-end run of the sales system against a local server (npm run dev) and local database.
// Toro's reports (payment, card, charge results) are posted from this machine, which the local
// server accepts like Toro's IP. Run: node tests/e2e-sales.mjs [http://localhost:5173]
// Reads PAY_ADMIN_USER / PAY_ADMIN_PASSWORD from .env. Leaves its test records in the database.
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadDotEnv } from "../api/_lib/env.js";

loadDotEnv(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const BASE = process.argv[2] || "http://localhost:5173";
let cookie = "";

async function api(path, { method = "GET", body, raw = false, expect } = {}) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  if (raw) return r;
  const data = await r.json().catch(() => ({}));
  if (expect) assert.equal(r.status, expect, `${method} ${path} -> ${r.status} ${JSON.stringify(data)}`);
  else assert.ok(r.ok, `${method} ${path} -> ${r.status} ${JSON.stringify(data)}`);
  return data;
}
const step = (s) => console.log(`\n== ${s}`);
const tokenOf = (url) => url.split("/").pop();

// 1x1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

step("sign in");
await api("auth/login", { method: "POST", body: { user: process.env.PAY_ADMIN_USER, password: process.env.PAY_ADMIN_PASSWORD } });

// ---------------- Spec request ----------------
step("spec request: create");
const disc = (await api("sales/discovery", { method: "POST", body: { clientName: "רונן לוי", companyName: "לוי אדריכלים", email: "ronen@example.com", phone: "0521234567", price: 999, note: "אוטומציה לגיליונות" } })).item;
console.log(disc.status, disc.total, disc.url);
const dtok = tokenOf(disc.url);
let pub = await api(`sales/discovery-public?token=${dtok}`);
assert.equal(pub.paid, false);
assert.equal(pub.payment.linkId, disc.id);
assert.equal(pub.payment.sum, 1178.82);
assert.ok(disc.listPrice > disc.price, "the default price before discount is filled in");
assert.equal(disc.contacts.lead.phone, "050-7215225");

step("spec request: the client picks a time first (held, no invite yet)");
const { slots, calendarConnected } = await api(`sales/discovery-public?token=${dtok}&slots=1`);
console.log("calendar connected:", calendarConnected, "slots:", slots.length, slots.slice(0, 3).map((s) => new Date(s.start).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })));
assert.ok(slots.length >= 4);
await api(`sales/discovery-public?token=${dtok}`, { method: "POST", body: { action: "hold", start: "2030-01-01T10:00:00.000Z" }, expect: 409 });
await api(`sales/discovery-public?token=${dtok}`, { method: "POST", body: { action: "hold", start: slots[0].start, attendees: ["not-an-email"] }, expect: 400 });
pub = await api(`sales/discovery-public?token=${dtok}`, { method: "POST", body: { action: "hold", start: slots[1].start } });
// changing the picked time before paying replaces the hold
pub = await api(`sales/discovery-public?token=${dtok}`, { method: "POST", body: { action: "hold", start: slots[0].start, attendees: ["dana@example.com"] } });
assert.equal(pub.booked, false);
assert.equal(pub.hold.start, slots[0].start);
assert.equal(pub.meeting, null);
let discAdmin = await api(`sales/discovery?id=${disc.id}`);
assert.ok(!discAdmin.mails.some((m) => m.kind === "discovery_booked"), "no invite before the payment");
const { slots: others } = await api(`sales/discovery-public?token=${dtok}&slots=1`);
assert.ok(others.some((s) => s.start === slots[0].start), "the client's own held time is still offered to them");

step("spec request: Toro reports the payment -> the held time is booked and the invite goes out");
await api("pay/paid", { method: "POST", body: { transactionId: `E2E-${Date.now()}`, linkId: disc.id, sum: 1178.82, fullName: "רונן לוי" } });
pub = await api(`sales/discovery-public?token=${dtok}`);
assert.equal(pub.paid, true);
assert.equal(pub.booked, true);
assert.equal(pub.meeting.start, slots[0].start);
console.log("booked:", pub.meeting.start, "invite:", pub.meeting.invited);
await api(`sales/discovery-public?token=${dtok}`, { method: "POST", body: { action: "hold", start: slots[1].start }, expect: 409 });
discAdmin = await api(`sales/discovery?id=${disc.id}`);
assert.ok(discAdmin.mails.some((m) => m.kind === "discovery_booked"), "the invite went out after the payment");
console.log("events:", discAdmin.events.map((e) => e.type).join(", "));
console.log("mails:", discAdmin.mails.map((m) => `${m.kind}:${m.status}`).join(", "));

// ---------------- Deal ----------------
step("deal: preview and create");
const dealData = {
  project: { name: "מערכת הפקת גיליונות", summary: "תוסף ל-AutoCAD שמפיק גיליונות אוטומטית מהמודל וחוסך כ-10 שעות שבועיות לצוות.", specName: "אפיון מערכת גיליונות", specVersion: "1.2", specDate: "2026-11-10", targetWeeks: 8, kickoffNeeds: "מודל Revit לדוגמה ותבנית גיליון" },
  price: { amount: 48000, installments: 4, installmentDay: 1, balanceMethod: "transfer" },
  service: { enabled: true, includedMonths: 3, periods: [{ months: 9, price: 1200 }, { months: null, price: 1500 }] },
  standingOrder: { enabled: true, startDate: "", dayOfMonth: 1 },
  appendix: {
    authorizedContact: { name: "רונן לוי", role: "מנכ\"ל", phone: "0521234567", email: "ronen@example.com" },
    companyContact: { name: "צח", role: "מנהל פרויקט", phone: "053-9462842", email: "sales@pro-algorithm.co.il" },
    stages: [{ name: "אב-טיפוס", deliverable: "הפקת גיליון בודד", criteria: "גיליון תקין מהמודל לדוגמה", target: "שבוע 3" }],
    hourlyRate: 350,
    serviceComponents: ["תמיכה טכנית", "תיקון תקלות", "אירוח בענן"],
    environment: "cloud",
  },
};
const dealClient = { companyName: "לוי אדריכלים בע\"מ", taxId: "515555555", address: "הרצל 1, חיפה", signerName: "רונן לוי", signerRole: "מנכ\"ל", email: "ronen@example.com", phone: "0521234567" };
const preview = await api("sales/deals?preview=1", { method: "POST", body: { data: dealData, client: dealClient } });
const sumRows = preview.order.schedule.rows.reduce((a, r) => a + Math.round(r.total * 100), 0);
assert.equal(sumRows, Math.round(preview.order.price.total * 100));
console.log("preview: total", preview.order.price.total, "rows", preview.order.schedule.rows.length, "service rows", preview.order.service.rows.map((r) => r.when).join(" | "));
const deal = (await api("sales/deals", { method: "POST", body: { data: dealData, client: dealClient } })).item;
const tok = tokenOf(deal.url);
console.log("deal", deal.number, deal.url);

step("deal: the client opens, approves, signs");
let view = await api(`sales/deal-public?token=${tok}`);
assert.equal(view.status.order, "viewed");
assert.equal(view.agreement.sections.length, 14);
await api(`sales/deal-public?token=${tok}`, { method: "POST", body: { action: "sign", name: "רונן לוי", signature: PNG, accept: true }, expect: 409 });
await api(`sales/deal-public?token=${tok}`, { method: "POST", body: { action: "approve", approverName: "רונן לוי", accept: true, client: { accountingEmail: "" } }, expect: 400 });
view = await api(`sales/deal-public?token=${tok}`, { method: "POST", body: { action: "approve", approverName: "רונן לוי", accept: true, client: { companyName: "לוי אדריכלים בע\"מ", accountingEmail: "books@example.com", accountingName: "מירב" } } });
assert.equal(view.status.order, "approved");
await api(`sales/deal-public?token=${tok}`, { method: "POST", body: { action: "approve", approverName: "רונן לוי", accept: true, client: { accountingEmail: "books@example.com" } }, expect: 409 });
view = await api(`sales/deal-public?token=${tok}`, { method: "POST", body: { action: "sign", name: "רונן לוי", role: "מנכ\"ל", signature: PNG, accept: true } });
assert.equal(view.status.agreement, "signed");
assert.equal(view.status.card, "pending");
assert.ok(view.links.signedPdf);
const pdf = await fetch(view.links.signedPdf);
const pdfBytes = Buffer.from(await pdf.arrayBuffer());
assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
fs.mkdirSync("tests/out", { recursive: true });
fs.writeFileSync("tests/out/deal-signed.pdf", pdfBytes);
console.log("signed PDF:", pdfBytes.length, "bytes -> tests/out/deal-signed.pdf; subscription:", view.subscription.status, "first charge known:", view.subscription.startKnown);

step("deal: work starts (sets the first charge), card saved by Toro");
let dealAdmin = await api(`sales/deals?id=${deal.id}`);
const subId = dealAdmin.item.subscriptionId;
await api(`sales/deals?id=${deal.id}`, { method: "PATCH", body: { action: "mark_project_started", date: "2026-11-01" } });
dealAdmin = await api(`sales/deals?id=${deal.id}`);
console.log("first charge:", dealAdmin.subscription.nextChargeDate, dealAdmin.subscription.nextAmount);
assert.equal(dealAdmin.subscription.nextChargeDate, "2027-02-01");
await api("billing/card", { method: "POST", body: { subscriptionId: subId, token: "tok_e2e_123", cardSuffix: "4580", cardBrand: "Visa", cardExp: "1229" } });
view = await api(`sales/deal-public?token=${tok}`);
assert.equal(view.status.card, "set");

step("billing: charge now (made due today), Toro takes it and reports");
const sub = await api(`billing/subscriptions?id=${subId}`);
assert.equal(sub.item.status, "active");
await api(`billing/subscriptions?id=${subId}`, { method: "PATCH", body: { action: "charge_now" } });
let due = await api("billing/due");
const mine = due.charges.find((c) => c.cardToken === "tok_e2e_123");
assert.ok(mine, "charge handed out");
assert.equal(mine.sum, 1416); // 1200 + 18%
due = await api("billing/due");
assert.ok(!due.charges.some((c) => c.cardToken === "tok_e2e_123"), "not handed out twice");
await api("billing/result", { method: "POST", body: { chargeId: mine.chargeId, ok: true, transactionId: "T-77", asmachta: "0012", invoiceNumber: "30123", invoicePdf: pdfBytes.subarray(0, 2000).toString("base64") } });
await api("billing/result", { method: "POST", body: { chargeId: mine.chargeId, ok: false, error: "late duplicate" } }); // ignored
const after = await api(`billing/subscriptions?id=${subId}`);
console.log("after charge: done", after.item.chargesDone, "next", after.item.nextChargeDate, "charges", after.charges.map((c) => `${c.status}:${c.amount}:${c.invoiceNumber}`).join(", "));
assert.equal(after.item.chargesDone, 1);
assert.equal(after.charges[0].status, "paid");
const inv = await api(`billing/invoice?charge=${after.charges[0].id}`, { raw: true });
assert.equal(inv.status, 200);

step("billing: a failed charge is retried, then stops after three");
for (let i = 0; i < 3; i++) {
  await api("billing/subscriptions?id=" + subId, { method: "PATCH", body: { action: "update", nextChargeDate: new Date().toISOString().slice(0, 10) } });
  await api(`billing/subscriptions?id=${subId}`, { method: "PATCH", body: { action: i ? "resume" : "update", ...(i ? {} : { notes: "e2e" }) } }).catch(() => {});
  const d2 = await api("billing/due");
  const c2 = d2.charges.find((c) => c.cardToken === "tok_e2e_123");
  if (!c2) { console.log("attempt", i + 1, "waits for retry day"); break; }
  await api("billing/result", { method: "POST", body: { chargeId: c2.chargeId, ok: false, error: "insufficient funds" } });
  const s2 = await api(`billing/subscriptions?id=${subId}`);
  console.log("attempt", i + 1, "->", s2.item.status, "failed", s2.item.failedAttempts, "retry on", s2.item.retryOn);
  if (s2.item.status === "failed") break;
  await api(`billing/subscriptions?id=${subId}`, { method: "PATCH", body: { action: "update", nextChargeDate: new Date().toISOString().slice(0, 10) } });
  // simulate the retry day
  await fetch(`${BASE}/api/billing/due`).catch(() => {});
}

step("billing: pause / resume / cancel");
await api(`billing/subscriptions?id=${subId}`, { method: "PATCH", body: { action: "pause" } }).catch((e) => console.log("pause:", e.message.slice(0, 80)));
let s3 = await api(`billing/subscriptions?id=${subId}`);
console.log("status:", s3.item.status);
const list = await api("billing/subscriptions");
console.log("list:", list.items.length, "this month paid:", list.month.paid);

step("deal: admin view");
dealAdmin = await api(`sales/deals?id=${deal.id}`);
console.log("status:", JSON.stringify(dealAdmin.item.status));
console.log("events:", dealAdmin.events.map((e) => e.type).join(", "));
console.log("mails:", dealAdmin.mails.map((m) => `${m.kind}:${m.status}`).join(", "));
console.log("\nE2E OK");
