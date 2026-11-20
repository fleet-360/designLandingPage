// /api/billing/card-link?token=   a standing order's own card page (for orders not made from a deal,
// and for replacing a card). GET -> what the page shows; POST -> opens Grow's card page through Toro.
import { HttpError, json, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { callToro } from "../../_lib/toro.js";
import { getSettings, logEvent } from "../../_lib/sales.js";
import { firstCharge } from "../../_lib/billing.js";

export default route(["GET", "POST"], async (req, res) => {
  const token = new URL(req.url, "http://x").searchParams.get("token");
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ""))) throw new HttpError(404, "not_found");
  const s = (await query("SELECT * FROM billing.subscriptions WHERE card_link_token = $1 AND status NOT IN ('canceled', 'ended')", [token])).rows[0];
  if (!s) throw new HttpError(404, "not_found");
  if (req.method === "GET") {
    const settings = await getSettings();
    return json(res, 200, {
      customer: { name: s.customer.name, company: s.customer.company },
      description: s.description,
      status: s.status,
      card: s.card,
      cardSetAt: s.card_set_at ? new Date(s.card_set_at).toISOString() : null,
      firstCharge: firstCharge(s),
      schedule: s.schedule,
      vatRate: Number(s.vat_rate),
      company: { name: settings.company.name, phone: settings.company.phone, email: settings.officeEmail },
      includes: settings.service.includes,
    });
  }
  const r = await callToro("/proAlgoSales/card/createProcess", { subscriptionId: s.id });
  if (!r.ok) {
    await logEvent("subscription", s.id, "card_page_failed", { error: r.error });
    throw new HttpError(502, "card_unavailable");
  }
  await logEvent("subscription", s.id, "card_page_opened");
  json(res, 200, { authCode: r.authCode || null, url: r.url || null });
});
