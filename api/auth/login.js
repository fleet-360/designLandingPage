// POST /api/auth/login { user, password } -> 200 { user } + session cookie for all of /api
// 401 bad_credentials, 429 too_many_attempts (10 failures from one IP in 15 minutes).
// One admin for the site: PAY_ADMIN_USER / PAY_ADMIN_PASSWORD (also served as /api/pay/login).
import { clientIp, HttpError, json, readJson, route, sameSecret } from "../_lib/http.js";
import { query } from "../_lib/db.js";
import { requireAdminConfigured } from "../_lib/auth.js";
import { setSession } from "../_lib/session.js";

const MAX_FAILURES = 10;
const WINDOW = "15 minutes";

export default route(["POST"], async (req, res) => {
  requireAdminConfigured();
  const ip = clientIp(req);
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM pay.login_failures WHERE ip = $1 AND at > now() - interval '${WINDOW}'`, [ip]);
  if (rows[0].n >= MAX_FAILURES) throw new HttpError(429, "too_many_attempts");

  const body = await readJson(req);
  const user = String(body.user || "").trim();
  const userOk = sameSecret(user.toLowerCase(), String(process.env.PAY_ADMIN_USER).trim().toLowerCase());
  const passOk = sameSecret(String(body.password || ""), process.env.PAY_ADMIN_PASSWORD);

  if (!userOk || !passOk) {
    await query("INSERT INTO pay.login_failures (ip) VALUES ($1)", [ip]);
    await query(`DELETE FROM pay.login_failures WHERE at < now() - interval '1 day'`);
    await new Promise(r => setTimeout(r, 600));
    throw new HttpError(401, "bad_credentials");
  }

  await query("DELETE FROM pay.login_failures WHERE ip = $1", [ip]);
  setSession(res, user);
  json(res, 200, { user });
});
