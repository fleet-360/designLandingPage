// The site admin: one user for every module (PAY_ADMIN_USER / PAY_ADMIN_PASSWORD, the names
// the payment links started with). See api/auth/*.js and api/_lib/session.js.
import { connectionString } from "./db.js";
import { HttpError } from "./http.js";
import { requireUser } from "./session.js";

export function requireAdminConfigured() {
  if (!process.env.PAY_ADMIN_USER || !process.env.PAY_ADMIN_PASSWORD || !connectionString()) {
    throw new HttpError(503, "not_configured");
  }
}

// The signed-in admin, or 401 / 503
export function requireAdmin(req) {
  requireAdminConfigured();
  return requireUser(req);
}
