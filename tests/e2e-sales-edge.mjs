// Edge cases of the sales system against a local server and database (see e2e-sales.mjs):
// an underpaid spec request, overlapping bookings, standing-order dates after a pause, a start date
// off the billing day, and a charge Toro never reported. Run: node tests/e2e-sales-edge.mjs http://localhost:5175
import assert from "node:assert/strict";
import { loadDotEnv } from "../api/_lib/env.js";
import { addDays, addMonths, israelDate } from "../api/_lib/sales-calc.js";

loadDotEnv(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const BASE = process.argv[2] || "http://localhost:5173";
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
const today = israelDate();

await api("auth/login", { method: "POST", body: { user: process.env.PAY_ADMIN_USER, password: process.env.PAY_ADMIN_PASSWORD } });

step("spec request paid below its price is not marked paid");
const disc = (await api("sales/discovery", { method: "POST", body: { clientName: "בדיקת קצה", email: "edge@example.com", price: 999 } })).item;
await api("pay/paid", { method: "POST", body: { transactionId: `EDGE-${Date.now()}`, linkId: disc.id, sum: 1, fullName: "בדיקת קצה" } });
let pub = await api(`sales/discovery-public?token=${tokenOf(disc.url)}`);
assert.equal(pub.paid, false, "1 shekel must not count as paid");
let admin = await api(`sales/discovery?id=${disc.id}`);
assert.ok(admin.events.some((e) => e.type === "underpaid"));
assert.ok(admin.mails.some((m) => m.kind === "discovery_underpaid_office"));
await api("pay/paid", { method: "POST", body: { transactionId: `EDGE-${Date.now()}-full`, linkId: disc.id, sum: 1178.82, fullName: "בדיקת קצה" } });
pub = await api(`sales/discovery-public?token=${tokenOf(disc.url)}`);
assert.equal(pub.paid, true, "the full price counts");
console.log("underpaid: refused and reported; full payment accepted");

step("two clients cannot book overlapping times");
const disc2 = (await api("sales/discovery", { method: "POST", body: { clientName: "בדיקת קצה 2", email: "edge2@example.com", price: 999 } })).item;
await api("sales/discovery?id=" + disc2.id, { method: "PATCH", body: { action: "mark_paid" } });
const { slots } = await api(`sales/discovery-public?token=${tokenOf(disc.url)}&slots=1`);
const first = slots[0].start;
const half = new Date(new Date(first).getTime() + 30 * 60000).toISOString();
const [a, b] = await Promise.all([
  fetch(`${BASE}/api/sales/discovery-public?token=${tokenOf(disc.url)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "book", start: first }) }),
  fetch(`${BASE}/api/sales/discovery-public?token=${tokenOf(disc2.url)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "book", start: half }) }),
]);
console.log("booking statuses:", a.status, b.status);
assert.equal([a.status, b.status].filter((s) => s === 200).length, 1, "exactly one of two overlapping bookings succeeds");
assert.ok([a.status, b.status].includes(409));
// clean up the meeting so later runs have the slot
for (const d of [disc, disc2]) await api(`sales/discovery?id=${d.id}`, { method: "PATCH", body: { action: "cancel" } }).catch(() => {});

step("a deal's charge day comes from its first charge date");
const deal = {
  project: { name: "בדיקת קצה", summary: "בדיקה", specName: "אפיון", specVersion: "1", specDate: today, targetWeeks: 4, kickoffNeeds: "" },
  price: { amount: 10000, installments: 1, installmentDay: 1, balanceMethod: "transfer" },
  service: { enabled: true, periods: [{ months: null, price: 500 }] },
  standingOrder: { enabled: true, startDate: "2026-12-25", dayOfMonth: 1 },
  appendix: { stages: [] },
};
const client = { companyName: "קצה בע\"מ", taxId: "515555555", address: "א", signerName: "א", signerRole: "", email: "a@example.com", phone: "0500000000" };
const created = (await api("sales/deals", { method: "POST", body: { data: deal, client } })).item;
// the charge day comes from the first charge date (PR #22)
assert.equal(created.data.standingOrder.startDate, "2026-12-25");
assert.equal(created.data.standingOrder.dayOfMonth, 25);
console.log("first charge 25/12 -> charge day", created.data.standingOrder.dayOfMonth);
await api(`sales/deals?id=${created.id}`, { method: "PATCH", body: { action: "cancel" } });

step("after a long pause the next charge is next month, not tomorrow");
const start = addMonths(today, -4, 1);
const sub = (await api("billing/subscriptions", { method: "POST", body: {
  customer: { name: "בדיקת קצה", email: "edge@example.com" }, description: "בדיקת קצה", schedule: [{ months: null, amount: 100 }], startDate: start, dayOfMonth: 1,
} })).item;
const token = `tok_edge_${Date.now()}`;
await api("billing/card", { method: "POST", body: { subscriptionId: sub.id, token, cardSuffix: "1111", cardBrand: "Visa", cardExp: "1229" } });
let due = await api("billing/due");
let mine = due.charges.find((c) => c.cardToken === token);
assert.ok(mine, "the overdue first charge is handed out");
await api("billing/result", { method: "POST", body: { chargeId: mine.chargeId, ok: true, transactionId: "EDGE-T1" } });
let s = (await api(`billing/subscriptions?id=${sub.id}`)).item;
console.log("start", start, "-> after one charge next is", s.nextChargeDate);
assert.ok(s.nextChargeDate > today, "next charge is after today");
assert.equal(s.nextChargeDate, addMonths(addDays(today, 1), 0, 1) >= addDays(today, 1) ? addMonths(addDays(today, 1), 0, 1) : addMonths(addDays(today, 1), 1, 1));
due = await api("billing/due");
assert.ok(!due.charges.some((c) => c.cardToken === token), "nothing more today");

step("a charge Toro never reported can be settled by the admin");
await api(`billing/subscriptions?id=${sub.id}`, { method: "PATCH", body: { action: "charge_now" } });
due = await api("billing/due");
mine = due.charges.find((c) => c.cardToken === token);
assert.ok(mine);
await api(`billing/subscriptions?id=${sub.id}`, { method: "PATCH", body: { action: "settle_charge", chargeId: mine.chargeId, outcome: "not_charged" } });
due = await api("billing/due");
mine = due.charges.find((c) => c.cardToken === token);
assert.ok(mine, "released: handed out again");
await api(`billing/subscriptions?id=${sub.id}`, { method: "PATCH", body: { action: "settle_charge", chargeId: mine.chargeId, outcome: "paid", ref: "GROW-123" } });
await api(`billing/subscriptions?id=${sub.id}`, { method: "PATCH", body: { action: "settle_charge", chargeId: mine.chargeId, outcome: "paid" }, expect: 409 });
const detail = await api(`billing/subscriptions?id=${sub.id}`);
console.log("charges:", detail.charges.map((c) => `${c.status}:${c.transactionId || c.error || ""}`).join(", "), "done", detail.item.chargesDone, "next", detail.item.nextChargeDate);
assert.equal(detail.item.chargesDone, 2);
assert.ok(detail.item.nextChargeDate > today);
await api(`billing/subscriptions?id=${sub.id}`, { method: "PATCH", body: { action: "cancel" } });

console.log("\nEDGE OK");
