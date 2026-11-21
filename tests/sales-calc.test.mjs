// node --test tests/  (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { paymentSchedule, isBusinessDay, addBusinessDays, addMonths, chargeAmountAt, servicePeriods } from "../api/_lib/sales-calc.js";

const cents = (x) => Math.round(x * 100) + 0;   // + 0: -0 is 0

test("schedule rows add up exactly, 1..12 installments, odd prices", () => {
  for (const price of [10000, 12345.67, 99999.99, 1, 7, 333.33, 48000]) {
    for (let n = 1; n <= 12; n++) {
      const s = paymentSchedule({ price, vatRate: 18, depositPercent: 30, installments: n, installmentDay: 1, balanceMethod: "transfer" }, "2026-11-22");
      assert.equal(s.rows.length, n + 1);
      assert.equal(cents(s.totals.before), cents(price), `before ${price}/${n}`);
      assert.equal(cents(s.totals.total), cents(s.total), `total ${price}/${n}`);
      assert.equal(cents(s.rows.reduce((a, r) => a + r.vat, 0)), cents(s.vat));
      for (const r of s.rows) assert.equal(cents(r.before) + cents(r.vat), cents(r.total));
    }
  }
});

test("deposit is 30% and due 3 business days later, skipping weekend and holidays", () => {
  const s = paymentSchedule({ price: 10000, vatRate: 18, installments: 3 }, "2026-11-19"); // Thursday
  assert.equal(s.rows[0].before, 3000);
  assert.equal(s.rows[0].date, "2026-11-24"); // Sun 22, Mon 23, Tue 24
  // approval Tue 2026-09-08: Wed 9, Thu 10, then Erev Rosh Hashana (Fri 11), RH 5787 (Sat 12, Sun 13)
  assert.equal(addBusinessDays("2026-09-08", 3), "2026-09-14");
  assert.equal(isBusinessDay("2026-09-13"), false); // Rosh Hashana II, a Sunday
  assert.equal(isBusinessDay("2026-09-21"), false); // Yom Kippur, a Monday
  assert.equal(isBusinessDay("2026-09-20"), false); // Erev Yom Kippur, a Sunday
  assert.equal(isBusinessDay("2027-05-12"), false); // Yom HaAtzmaut 5787
  assert.equal(isBusinessDay("2027-05-11"), true);
  assert.equal(isBusinessDay("2026-11-22"), true);
});

test("installments fall monthly on the chosen day; bank transfers note the earlier business day", () => {
  const s = paymentSchedule({ price: 12000, vatRate: 18, installments: 3, installmentDay: 1, balanceMethod: "transfer" }, "2026-11-22");
  assert.deepEqual(s.rows.slice(1).map((r) => r.date), ["2026-12-01", "2027-01-01", "2027-02-01"]);
  assert.match(s.rows[2].dateNote, /29\/12\/2026|31\/12\/2026/); // 2027-01-01 is a Friday
  const c = paymentSchedule({ price: 12000, vatRate: 18, installments: 3, installmentDay: 1, balanceMethod: "checks" }, "2026-11-22");
  assert.equal(c.rows[2].dateNote, null);
  assert.equal(addMonths("2027-01-31", 1, 31), "2027-02-28");
});

test("standing order amounts follow the periods", () => {
  const sched = [{ months: 6, amount: 500 }, { months: null, amount: 800 }];
  assert.equal(chargeAmountAt(sched, 0), 500);
  assert.equal(chargeAmountAt(sched, 5), 500);
  assert.equal(chargeAmountAt(sched, 6), 800);
  assert.equal(chargeAmountAt(sched, 60), 800);
  assert.equal(chargeAmountAt([{ months: 2, amount: 100 }], 2), null);
  const rows = servicePeriods({ enabled: true, includedMonths: 3, periods: [{ months: 6, price: 500 }, { months: null, price: 800 }] }, 18);
  assert.deepEqual(rows.map((r) => r.when), ["מתחילת הפרויקט", "חודשים 4–9", "מחודש 10"]);
  assert.equal(rows[1].priceWithVat, 590);
});

test("payments set one by one keep their dates and methods, and add up exactly", () => {
  const payments = [
    { date: "2026-11-26", amount: 3703.7, method: "transfer" },
    { date: "2026-12-01", amount: 2880, method: "check" },
    { date: "2027-01-01", amount: 2880, method: "check" },
    { date: "2027-02-01", amount: 2881.97, method: "card" },
  ];
  const s = paymentSchedule({ price: 12345.67, vatRate: 18, payments }, "2026-11-22");
  assert.deepEqual(s.rows.map((r) => [r.kind, r.date, r.method]), [
    ["deposit", "2026-11-26", "transfer"], ["installment", "2026-12-01", "check"],
    ["installment", "2027-01-01", "check"], ["installment", "2027-02-01", "card"],
  ]);
  assert.equal(cents(s.totals.before), cents(12345.67));
  assert.equal(cents(s.totals.total), cents(s.total));
  for (const r of s.rows) assert.equal(cents(r.before) + cents(r.vat), cents(r.total));
  // a transfer due on a Friday notes the business day before it; checks and cards do not
  const f = paymentSchedule({ price: 100, vatRate: 18, payments: [{ date: "2027-01-01", amount: 50, method: "transfer" }, { date: "2027-01-01", amount: 50, method: "check" }] });
  assert.match(f.rows[0].dateNote, /31\/12\/2026/);
  assert.equal(f.rows[1].dateNote, null);
});

test("amounts with VAT are whole shekels and still add up", () => {
  const payments = [
    { date: "2026-11-26", amount: 2500, method: "transfer" },
    { date: "2026-12-01", amount: 8333, method: "check" },
    { date: "2027-01-01", amount: 8333.5, method: "check" },
  ];
  const s = paymentSchedule({ price: 19166.5, vatRate: 18, payments }, "2026-11-22");
  for (const r of s.rows) {
    assert.equal(cents(r.total) % 100, 0, `payment ${r.n} has agorot`);
    assert.equal(cents(r.before) + cents(r.vat), cents(r.total));
  }
  assert.equal(cents(s.total) % 100, 0);
  assert.equal(cents(s.totals.total), cents(s.total));
  assert.equal(Math.abs(cents(s.total) - Math.round(19166.5 * 118)) <= 50, true);   // within half a shekel of the exact VAT
});

