// GET /api/pay/session -> 200 { user } | 401 signed_out | 503 not_configured
import { json, route } from "../../_lib/http.js";
import { requireConfigured } from "../../_lib/pay.js";
import { requireUser } from "../../_lib/session.js";

export default route(["GET"], async (req, res) => {
  requireConfigured();
  json(res, 200, { user: requireUser(req) });
});
