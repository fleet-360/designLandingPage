// GET /api/sales/booking?id=<discovery id>   Toro only (proAlgoSales /calendar/book)
// -> the calendar event to create in developers@pro-algo.com: { start, end, summary, description, attendees }
// Used only while the calendar goes through Toro (see api/_lib/calendar.js).
import { HttpError, json, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireToro } from "../../_lib/toro.js";
import { uuidParam } from "../../_lib/sign.js";
import { getSettings } from "../../_lib/sales.js";
import { bookingEvent } from "../../_lib/calendar.js";

export default route(["GET"], async (req, res) => {
  requireToro(req);
  const id = uuidParam(new URL(req.url, "http://x").searchParams.get("id"));
  const { rows } = await query(
    "SELECT * FROM sales.discovery WHERE id = $1 AND meeting_start IS NOT NULL AND calendar_event_id IS NULL AND canceled_at IS NULL", [id]);
  const d = rows[0];
  if (!d) throw new HttpError(404, "not_found");
  json(res, 200, bookingEvent(d, await getSettings()));
});
