// GET /api/auth/session -> 200 { user } | 401 signed_out | 503 not_configured
import { json, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";

export default route(["GET"], async (req, res) => {
  json(res, 200, { user: requireAdmin(req) });
});
