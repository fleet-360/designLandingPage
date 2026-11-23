// /api/collections/customers   admin
//   POST   { id?, name, tax_id, contact_person, phone, email, internal_owner, project_stages, notes }   create / update
//   DELETE ?id=      the customer with their payments and pickups (restorable from the history)
import { json, readJson, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { deleteCustomer, saveCustomer } from "../../_lib/collections.js";
import { bodyId, idParam } from "../../_lib/collections-ids.js";

export default route(["POST", "DELETE"], async (req, res) => {
  const user = requireAdmin(req);
  if (req.method === "DELETE") {
    await deleteCustomer(idParam(req), user);
    return json(res, 200, { ok: true });
  }
  const b = await readJson(req, 64 * 1024);
  bodyId(b);
  json(res, 200, { customer: await saveCustomer(b, user) });
});
