// GET /api/sales/booking?id=<discovery id>   Toro only (proAlgoSales /calendar/book)
// -> the calendar event to create in developers@pro-algo.com: { start, end, summary, description, attendees }
import { HttpError, json, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireToro } from "../../_lib/toro.js";
import { uuidParam } from "../../_lib/sign.js";
import { getSettings } from "../../_lib/sales.js";

export default route(["GET"], async (req, res) => {
  requireToro(req);
  const id = uuidParam(new URL(req.url, "http://x").searchParams.get("id"));
  const { rows } = await query(
    "SELECT * FROM sales.discovery WHERE id = $1 AND meeting_start IS NOT NULL AND calendar_event_id IS NULL AND canceled_at IS NULL", [id]);
  const d = rows[0];
  if (!d) throw new HttpError(404, "not_found");
  const settings = await getSettings();
  const who = d.company_name ? `${d.client_name} · ${d.company_name}` : d.client_name;
  json(res, 200, {
    start: d.meeting_start.toISOString(),
    end: d.meeting_end.toISOString(),
    summary: `${settings.discovery.title} · ${who}`,
    description: [`פגישת פתיחה של ${settings.discovery.title}.`, `לקוח: ${who}`, d.email ? `אימייל: ${d.email}` : "", d.phone ? `טלפון: ${d.phone}` : "", d.note ? `\n${d.note}` : ""].filter(Boolean).join("\n"),
    attendees: [...new Set([d.email, ...(d.attendees || []), settings.officeEmail].filter(Boolean))],
  });
});
