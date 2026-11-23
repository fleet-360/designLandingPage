// /api/collections/board   GET: customers with their payments, check pickups, the last Kaspit sync. Admin.
import { json, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { board } from "../../_lib/collections.js";

export default route(["GET"], async (req, res) => {
  requireAdmin(req);
  json(res, 200, await board());
});
