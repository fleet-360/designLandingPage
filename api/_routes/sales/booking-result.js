// POST /api/sales/booking-result { id, ok, eventId, meetUrl, error }   Toro only
// Keeps the request in step with the calendar even when the site's own call to Toro timed out.
import { json, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireToro } from "../../_lib/toro.js";
import { uuidParam } from "../../_lib/sign.js";

export default route(["POST"], async (req, res) => {
  requireToro(req);
  const b = await readJson(req);
  const id = uuidParam(b.id);
  if (b.ok) {
    await query(
      `UPDATE sales.discovery SET booking_status = 'confirmed', calendar_event_id = COALESCE(calendar_event_id, $2),
              meet_url = COALESCE(meet_url, $3), booking_error = NULL WHERE id = $1`, [id, b.eventId || null, b.meetUrl || null]);
  }
  json(res, 200, { ok: true });
});
