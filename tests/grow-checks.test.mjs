// What the site checks before Grow, and how Grow's refusals reach the customer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mobileIL, taxIdIL } from "../api/_lib/sales.js";
import { growReason } from "../api/_lib/toro.js";

test("mobile numbers", () => {
  assert.equal(mobileIL("053-9462842"), "0539462842");
  assert.equal(mobileIL("+972 53 946 2842"), "0539462842");
  assert.equal(mobileIL("053946284"), "");   // 9 digits
  assert.equal(mobileIL("04-8123456"), "");   // a landline
});

test("ID and company numbers (check digit)", () => {
  assert.equal(taxIdIL("558358495"), "558358495");
  assert.equal(taxIdIL("515555555"), "515555555");
  assert.equal(taxIdIL("558358494"), "");
  assert.equal(taxIdIL("12345"), "");
});

test("Grow's reason is shown only when it is Grow's own (Hebrew) message", () => {
  assert.equal(growReason("Grow: מספר טלפון לא תקין"), "מספר טלפון לא תקין");
  assert.equal(growReason("toro_502"), "");
  assert.equal(growReason("The operation was aborted due to timeout"), "");
  assert.equal(growReason(undefined), "");
});
