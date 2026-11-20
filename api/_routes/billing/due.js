// GET /api/billing/due   Toro only (proAlgoSales runBilling, every morning and on demand)
// Hands out each due charge once: a "processing" row is created per standing order (one at a time,
// enforced by a unique index), and its id is Grow's transactionUniqueIdentifier, so a repeated
// request can never charge twice. -> { charges: [{ chargeId, uniqueId, cardToken, sum, ... }] }
import { json, route } from "../../_lib/http.js";
import { query, transaction } from "../../_lib/db.js";
import { requireToro } from "../../_lib/toro.js";
import { chargeAmountAt, withVat } from "../../_lib/sales-calc.js";
import { logEvent } from "../../_lib/sales.js";
import { today } from "../../_lib/billing.js";

export default route(["GET"], async (req, res) => {
  requireToro(req);
  const day = today();
  const charges = await transaction(async (db) => {
    const due = await db.query(
      `SELECT * FROM billing.subscriptions
        WHERE status = 'active' AND card_token IS NOT NULL AND next_charge_date IS NOT NULL AND next_charge_date <= $1
          AND (retry_on IS NULL OR retry_on <= $1)
          AND NOT EXISTS (SELECT 1 FROM billing.charges c WHERE c.subscription_id = billing.subscriptions.id AND c.status = 'processing')
        ORDER BY next_charge_date FOR UPDATE SKIP LOCKED LIMIT 50`, [day]);
    const out = [];
    for (const s of due.rows) {
      const before = chargeAmountAt(s.schedule, s.charges_done);
      if (before == null) {
        await db.query("UPDATE billing.subscriptions SET status = 'ended', next_charge_date = NULL, updated_at = now() WHERE id = $1", [s.id]);
        await logEvent("subscription", s.id, "ended", null, db);
        continue;
      }
      const amount = withVat(before, s.vat_rate);
      const c = await db.query(
        `INSERT INTO billing.charges (subscription_id, charge_index, due_date, attempt, amount_before_vat, amount)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [s.id, s.charges_done, s.next_charge_date, s.failed_attempts + 1, before, amount]);
      const cu = s.customer;
      out.push({
        chargeId: c.rows[0].uid,
        uniqueId: Number(c.rows[0].id),
        cardToken: s.card_token,
        sum: amount,
        description: `${s.description} · ${new Date(`${s.next_charge_date}T12:00:00Z`).toLocaleDateString("he-IL", { month: "long", year: "numeric" })}`.slice(0, 120),
        fullName: cu.name || cu.company,
        invoiceName: cu.company || cu.name,
        phone: cu.phone || "",
        email: cu.accountingEmail || cu.email,
        taxId: cu.taxId || "",
        cardSuffix: s.card?.suffix || "",
        cardBrand: s.card?.brand || "",
      });
    }
    return out;
  });
  json(res, 200, { charges });
});
