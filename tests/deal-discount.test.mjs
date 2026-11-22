import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrder, cleanDealData } from "../api/_lib/deal.js";

const settings = {
  vatRate: 18, depositPercent: 30, hourlyRates: [],
  company: { name: "חברה" }, bank: {}, checks: { payee: "", pickupDays: 3 }, service: { includes: [] },
};
const body = (price) => ({
  project: { name: "פרויקט" },
  price: { amount: 45000, vatRate: 18, payments: [{ date: "2026-12-01", amount: 45000, method: "transfer" }], ...price },
  service: { enabled: false },
});

test("a discount: the price before it is kept, the order shows how much and what share", () => {
  const data = cleanDealData(body({ listAmount: 50000 }), settings);
  assert.equal(data.price.listAmount, 50000);
  const o = buildOrder({ number: 1, client: {}, data }, settings, "2026-11-22");
  assert.equal(o.price.amount, 45000);
  assert.equal(o.price.listAmount, 50000);
  assert.equal(o.price.discount, 5000);
  assert.equal(o.price.discountPercent, 10);
});

test("no discount, or one that does not lower the price, leaves no trace in the order", () => {
  for (const listAmount of [undefined, "", 0, 45000, 40000]) {
    const data = cleanDealData(body({ listAmount }), settings);
    assert.equal(data.price.listAmount, null);
    const o = buildOrder({ number: 1, client: {}, data }, settings, "2026-11-22");
    assert.equal(o.price.listAmount, undefined);
    assert.equal(o.price.discount, undefined);
  }
});
