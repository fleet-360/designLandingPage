// /api/collections/kaspit-sync   POST: the "sync now" button, admin. -> { ok, stats | skipped | error }
import { json, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { syncKaspit } from "../../_lib/collections-kaspit.js";

export default route(["POST"], async (req, res) => {
  requireAdmin(req);
  json(res, 200, await syncKaspit("manual"));
});
