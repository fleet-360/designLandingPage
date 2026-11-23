// /api/collections/pickups   check pickups, admin
//   POST   { id?, customer_id, collection_date, check_count, total_amount, contact_person, address, notes }
//          a new one: the customer's open checks without a pickup date join it -> { assigned }
//   PATCH  ?id= { status }    scheduled | collected | cancelled
//   DELETE ?id=               its checks go back to "no pickup date"
import { json, readJson, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { deletePickup, savePickup, setPickupStatus } from "../../_lib/collections.js";
import { bodyId, idParam } from "../../_lib/collections-ids.js";

export default route(["POST", "PATCH", "DELETE"], async (req, res) => {
  const user = requireAdmin(req);
  if (req.method === "DELETE") {
    await deletePickup(idParam(req), user);
    return json(res, 200, { ok: true });
  }
  if (req.method === "PATCH") {
    const b = await readJson(req);
    await setPickupStatus(idParam(req), b.status, user);
    return json(res, 200, { ok: true });
  }
  const b = await readJson(req, 64 * 1024);
  bodyId(b);
  json(res, 200, await savePickup(b, user));
});
