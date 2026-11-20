// POST /api/auth/logout -> 200, session cookie cleared (also served as /api/pay/logout)
import { json, route } from "../../_lib/http.js";
import { clearSession } from "../../_lib/session.js";

export default route(["POST"], async (req, res) => {
  clearSession(res);
  json(res, 200, { ok: true });
});
