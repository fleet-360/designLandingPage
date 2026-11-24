// GET /api/collections/kaspit-docs   admin: Kaspit documents a payment can be linked to (the payment dialog's
// "link to Kaspit"), newest first, open ones first, each with the payment it is already linked to. -> { docs }
import { json, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { kaspitDocuments } from "../../_lib/collections-kaspit.js";

export default route(["GET"], async (req, res) => {
  requireAdmin(req);
  json(res, 200, { docs: await kaspitDocuments() });
});
