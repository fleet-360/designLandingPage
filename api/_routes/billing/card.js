// POST /api/billing/card   Toro only (proAlgoSales /grow/notifyCard): the customer saved a card
// { subscriptionId, token, cardSuffix, cardBrand, cardExp, transactionId }
// A new card also restarts a standing order that stopped on failed charges.
import { HttpError, json, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireToro } from "../../_lib/toro.js";
import { uuidParam } from "../../_lib/sign.js";
import { getSettings, logEvent, sendMail, str } from "../../_lib/sales.js";
import { firstCharge, subscriptionRow, today } from "../../_lib/billing.js";
import { cardSetMail } from "../../_lib/sales-mail.js";

export default route(["POST"], async (req, res) => {
  requireToro(req);
  const b = await readJson(req);
  const id = uuidParam(b.subscriptionId);
  const token = str(b.token, 200);
  if (!token) throw new HttpError(400, "no_token");
  const card = { suffix: str(b.cardSuffix, 8) || null, brand: str(b.cardBrand, 40) || null, exp: str(b.cardExp, 8) || null };
  const { rows } = await query(
    `UPDATE billing.subscriptions SET card_token = $2, card = $3, card_set_at = now(),
            status = CASE WHEN status IN ('pending_card', 'failed') THEN 'active' ELSE status END,
            failed_attempts = CASE WHEN status = 'failed' THEN 0 ELSE failed_attempts END,
            retry_on = NULL,
            next_charge_date = CASE WHEN status = 'failed' AND next_charge_date < $4::date THEN $4::date ELSE next_charge_date END,
            updated_at = now()
      WHERE id = $1 AND status <> 'canceled' RETURNING *`, [id, token, JSON.stringify(card), today()]);
  const s = rows[0];
  if (!s) throw new HttpError(404, "not_found");
  if (s.deal_id) await query("UPDATE sales.deals SET card_status = 'set', updated_at = now() WHERE id = $1", [s.deal_id]);
  await logEvent("subscription", id, "card_set", { suffix: card.suffix });
  const settings = await getSettings();
  await sendMail({ ...cardSetMail(subscriptionRow(s), settings, firstCharge(s)), entity: s.deal_id ? "deal" : "subscription", entityId: s.deal_id || id, kind: "card_set" });
  json(res, 200, { ok: true });
});
