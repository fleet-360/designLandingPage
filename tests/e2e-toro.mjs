// The site and Toro's proAlgoSales module together: a site server with TORO_URL pointing at a local
// Toro (Grow, Caspit and email stubbed there). Checks that every email goes out through Toro with
// its attachments, the card page opens, Grow's card notice reaches the site, and Toro's billing run
// charges, invoices and reports. Run: node tests/e2e-toro.mjs <site> <toro>
import assert from "node:assert/strict";
import { loadDotEnv } from "../api/_lib/env.js";

loadDotEnv(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const SITE = process.argv[2] || "http://localhost:5196";
const TORO = process.argv[3] || "http://localhost:5181";
let cookie = "";
async function api(path, { method = "GET", body, expect } = {}) {
  const r = await fetch(`${SITE}/api/${path}`, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const data = await r.json().catch(() => ({}));
  assert.equal(r.status, expect || (r.ok ? r.status : 200), `${method} ${path} -> ${r.status} ${JSON.stringify(data)}`);
  return data;
}
const toro = async (path, body) => (await fetch(`${TORO}${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).json();
const state = () => toro("/__state");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

await api("auth/login", { method: "POST", body: { user: process.env.PAY_ADMIN_USER, password: process.env.PAY_ADMIN_PASSWORD } });

console.log("== spec request: invite email, payment, booking (calendar not connected -> .ics through Toro)");
const disc = (await api("sales/discovery", { method: "POST", body: { clientName: "נועה כהן", companyName: "כהן הנדסה", email: "noa@example.com", phone: "0527654321", price: 1500, sendEmail: true } })).item;
await api("pay/paid", { method: "POST", body: { transactionId: `T2-${Date.now()}`, linkId: disc.id, sum: 1770 } });
const tok = disc.url.split("/").pop();
const { slots } = await api(`sales/discovery-public?token=${tok}&slots=1`);
const booked = await api(`sales/discovery-public?token=${tok}`, { method: "POST", body: { action: "book", start: slots[2].start, attendees: ["eng@example.com"] } });
console.log("booking:", booked.meeting.invited);

console.log("== deal: invite, approve (accounting email), sign (signed PDF email)");
const data = {
  project: { name: "בדיקת אינטגרציה", summary: "מערכת בדיקה.", targetWeeks: 6 },
  price: { amount: 10000, installments: 2, balanceMethod: "checks" },
  service: { enabled: true, includedMonths: 3, periods: [{ months: null, price: 800 }] },
  standingOrder: { enabled: true, startDate: new Date().toISOString().slice(0, 10), dayOfMonth: 1 },
};
const deal = (await api("sales/deals", { method: "POST", body: { data, client: { companyName: "כהן הנדסה", signerName: "נועה כהן", email: "noa@example.com", phone: "0527654321", taxId: "512345678" }, sendEmail: true } })).item;
const dtok = deal.url.split("/").pop();
await api(`sales/deal-public?token=${dtok}`);
await api(`sales/deal-public?token=${dtok}`, { method: "POST", body: { action: "approve", approverName: "נועה כהן", accept: true, client: { accountingEmail: "books@example.com" } } });
await api(`sales/deal-public?token=${dtok}`, { method: "POST", body: { action: "sign", name: "נועה כהן", role: "בעלים", signature: PNG, accept: true } });

console.log("== card: the page opens through Toro, Grow's notice reaches the site");
const card = await api(`sales/deal-public?token=${dtok}`, { method: "POST", body: { action: "card" } });
assert.equal(card.authCode, "AUTH-CARD");
const subId = (await api(`sales/deals?id=${deal.id}`)).item.subscriptionId;
const notify = await fetch(`${TORO}/proAlgoSales/grow/notifyCard`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ data: { status: "שולם", transactionId: 777, transactionToken: "tt", cardToken: "tok_good", cardSuffix: "4580", cardBrand: "Visa", cardExp: "1229", customFields: { cField1: subId, cField5: "proAlgoCard" } } }),
});
assert.equal(notify.status, 200);
let sub = await api(`billing/subscriptions?id=${subId}`);
assert.equal(sub.item.status, "active");
assert.equal(sub.item.card.suffix, "4580");
const bad = await fetch(`${TORO}/proAlgoSales/grow/notifyCard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { cardToken: "x", customFields: { cField1: subId, cField5: "other" } } }) });
assert.equal(bad.status, 400);

console.log("== billing run in Toro: charge, invoice, report");
const run = await toro("/proAlgoSales/billing/run", {});
console.log("run:", JSON.stringify(run.results));
sub = await api(`billing/subscriptions?id=${subId}`);
console.log("after:", sub.item.chargesDone, "charges:", sub.charges.map((c) => `${c.status}/${c.amount}/inv ${c.invoiceNumber}/pdf ${c.hasInvoice}`).join(", "), "next:", sub.item.nextChargeDate);
assert.equal(sub.charges[0].status, "paid");
assert.ok(sub.charges[0].hasInvoice);
const again = await toro("/proAlgoSales/billing/run", {});
assert.equal(again.results.length, 0, "nothing due twice");

console.log("== a declined card");
await api(`billing/subscriptions?id=${subId}`, { method: "PATCH", body: { action: "update", nextChargeDate: new Date().toISOString().slice(0, 10) } });
await fetch(`${TORO}/proAlgoSales/grow/notifyCard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { cardToken: "tok_declined", cardSuffix: "1111", customFields: { cField1: subId, cField5: "proAlgoCard" } } }) });
const run2 = await toro("/proAlgoSales/billing/run", {});
console.log("declined run:", JSON.stringify(run2.results));
sub = await api(`billing/subscriptions?id=${subId}`);
console.log("after decline:", sub.item.status, "failed", sub.item.failedAttempts, "retry", sub.item.retryOn);

const st = await state();
console.log("\n== emails sent by Toro:");
for (const m of st.mails) console.log(`- ${m.subject} -> ${[].concat(m.to).join(", ")} ${m.attachments.map((a) => `[${a.filename} ${a.type} ${a.size}b ${a.head}]`).join(" ")}`);
console.log("== Grow calls:", st.grow.map((g) => `${g.url}(${g.body?.chargeType || g.body?.cardToken || ""}${g.body?.transactionUniqueIdentifier ? `#${g.body.transactionUniqueIdentifier}` : ""})`).join(", "));
console.log("== invoices:", JSON.stringify(st.invoices));
const subjects = st.mails.map((m) => m.subject).join(" | ");
for (const s of ["ספרינט תכנון ומיפוי ·", "שולם:", "נקבעה פגישת", "מוכנה לאישור", "פרטי תשלום", "ההסכם נחתם", "אמצעי התשלום", "החיוב החודשי לא עבר"]) {
  assert.ok(subjects.includes(s), `email "${s}"`);
}
assert.ok(st.mails.find((m) => m.subject.includes("ההסכם נחתם")).attachments[0].head === "%PDF-");
assert.ok(st.mails.find((m) => m.subject.includes("נקבעה")).attachments[0].type === "text/calendar");
console.log("\nE2E with Toro OK");
