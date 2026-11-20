// Signed session cookie for the site admin (/pay-link, /contracts). No session table: the cookie
// carries the user and an expiry, signed with HMAC. Changing PAY_ADMIN_PASSWORD or PAY_LINK_SECRET
// (or setting PAY_SESSION_SECRET) signs everyone out.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, HttpError } from "./http.js";

const COOKIE = "pa_admin";
const TTL_SECONDS = 12 * 60 * 60;

function key() {
  const base = process.env.PAY_SESSION_SECRET
    || `${process.env.PAY_LINK_SECRET || ""}\n${process.env.PAY_ADMIN_PASSWORD || ""}`;
  return createHash("sha256").update(`pay-session:${base}`).digest();
}

function sign(body) {
  return createHmac("sha256", key()).update(body).digest("base64url");
}

export function setSession(res, user) {
  const body = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + TTL_SECONDS * 1000 })).toString("base64url");
  res.setHeader("Set-Cookie",
    `${COOKIE}=${body}.${sign(body)}; Path=/api; Max-Age=${TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`);
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
}

// The signed-in user, or null
export function sessionUser(req) {
  const raw = cookies(req)[COOKIE];
  if (!raw || !raw.includes(".")) return null;
  const [body, sig] = raw.split(".");
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig || "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof u === "string" && Date.now() < exp ? u : null;
  } catch {
    return null;
  }
}

export function requireUser(req) {
  const user = sessionUser(req);
  if (!user) throw new HttpError(401, "signed_out");
  return user;
}
