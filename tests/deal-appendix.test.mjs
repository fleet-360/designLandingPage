import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAppendix, snapshotHash } from "../api/_lib/deal.js";
import { generateAppendixPdf } from "../api/_lib/deal-pdf.js";

test("an appendix: VAT at the deal's rate on each payment, and the totals", () => {
  const a = cleanAppendix({ title: " מודול דוחות ", body: "תוספת מודול.", payments: [
    { date: "2027-01-01", amount: 1000, method: "transfer" }, { date: "2027-02-01", amount: 333.33, method: "check" }] }, 18);
  assert.equal(a.title, "מודול דוחות");
  assert.deepEqual(a.payments[0], { date: "2027-01-01", amount: 1000, method: "transfer", vat: 180, total: 1180 });
  assert.equal(a.payments[1].total, 393.33);
  assert.deepEqual(a.totals, { amount: 1333.33, vat: 240, total: 1573.33 });
});

test("an appendix needs a title and a text; a payment needs a date, an amount and a method", () => {
  assert.throws(() => cleanAppendix({ body: "x" }, 18), /bad_title/);
  assert.throws(() => cleanAppendix({ title: "x" }, 18), /bad_body/);
  assert.throws(() => cleanAppendix({ title: "x", body: "y", payments: [{ date: "", amount: 10, method: "transfer" }] }, 18), /bad_appendix_payments/);
  assert.throws(() => cleanAppendix({ title: "x", body: "y", payments: [{ date: "2027-01-01", amount: 10, method: "bitcoin" }] }, 18), /bad_appendix_payments/);
  assert.deepEqual(cleanAppendix({ title: "x", body: "y" }, 18).payments, []);
});

test("the signed appendix renders as a PDF", async () => {
  const s = {
    number: 1042, project: "מערכת", company: { name: "פרו אלגוריתם" }, client: { companyName: "לקוח בע\"מ" },
    parent: { signedOn: "2026-11-01", hash: "a".repeat(64) },
    appendix: { n: 1, ...cleanAppendix({ title: "שינוי תכולה", body: "שורה 1\nשורה 2", payments: [{ date: "2027-01-01", amount: 5000, method: "transfer" }] }, 18) },
    signature: { name: "ישראל ישראלי", at: "2026-11-26T10:00:00Z", ip: "1.2.3.4" }, companySigner: {}, companySignature: null,
  };
  const pdf = await generateAppendixPdf({ ...s, hash: snapshotHash(s) });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});
