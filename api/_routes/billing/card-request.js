// GET /api/billing/card-request?id=   Toro only (proAlgoSales /card/createProcess): who the card
// page is for, and where Grow returns the customer afterwards.
import { HttpError, json, origin, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireToro } from "../../_lib/toro.js";
import { uuidParam } from "../../_lib/sign.js";

export default route(["GET"], async (req, res) => {
  requireToro(req);
  const id = uuidParam(new URL(req.url, "http://x").searchParams.get("id"));
  const s = (await query("SELECT * FROM billing.subscriptions WHERE id = $1 AND status <> 'canceled'", [id])).rows[0];
  if (!s) throw new HttpError(404, "not_found");
  const base = origin(req);
  let back = `${base}/card/${s.card_link_token}`;
  if (s.deal_id) {
    const d = (await query("SELECT token FROM sales.deals WHERE id = $1", [s.deal_id])).rows[0];
    if (d) back = `${base}/deal/${d.token}`;
  }
  const c = s.customer;
  json(res, 200, {
    fullName: c.name || c.company,
    phone: c.phone || "",
    email: c.email || "",
    description: s.description,
    successUrl: `${back}?card=done`,
    cancelUrl: `${back}?card=canceled`,
  });
});
