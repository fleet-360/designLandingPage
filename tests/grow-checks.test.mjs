// What the site checks before Grow, and how Grow's refusals reach the customer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, isEmail, mobileIL, str, taxIdIL } from "../api/_lib/sales.js";
import * as client from "../contracts/src/sales/lib.js";
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

// copied from WhatsApp, mail or a Hebrew document: invisible direction marks and no-break spaces
test("pasted values with invisible characters pass, on the page and on the server", () => {
  for (const lib of [{ cleanText, isEmail, mobileIL, taxIdIL }, client]) {
    assert.equal(lib.taxIdIL("\u202A558358495\u202C"), "558358495");
    assert.equal(lib.taxIdIL("\u200F51-555555-5 "), "515555555");
    assert.equal(lib.taxIdIL("515.555.555"), "515555555");
    assert.equal(lib.mobileIL("\u202A053\u00A0946\u200B2842\u202C"), "0539462842");
    assert.ok(lib.isEmail("\u202Adana@example.co.il\u202C"));
    assert.equal(lib.cleanText("\u200Fdana@example.co.il\u00A0"), "dana@example.co.il");
    assert.equal(lib.taxIdIL("\u200F558358494"), "");   // still checks the digit
  }
  assert.ok(client.fullNameOk("\u200Fדנה\u00A0כהן"));
  assert.equal(str("\u202Adana@example.co.il\u202C"), "dana@example.co.il");
});

test("Grow's reason is shown only when it is Grow's own (Hebrew) message", () => {
  assert.equal(growReason("Grow: מספר טלפון לא תקין"), "מספר טלפון לא תקין");
  assert.equal(growReason("toro_502"), "");
  assert.equal(growReason("The operation was aborted due to timeout"), "");
  assert.equal(growReason(undefined), "");
});
