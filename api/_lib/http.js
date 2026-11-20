// Plain Node req/res helpers, so the handlers run the same on Vercel and under tools/dev.mjs.
import { createHash, timingSafeEqual } from "node:crypto";

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export async function readJson(req, limit = 32 * 1024) {
  // Vercel may have parsed the body already
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    return parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body));
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "too_large");
    chunks.push(chunk);
  }
  return parse(Buffer.concat(chunks).toString("utf8"));
}

function parse(text) {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
    // fall through
  }
  throw new HttpError(400, "bad_json");
}

export function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// On Vercel, x-real-ip and x-forwarded-for are set by Vercel itself (a client's own values are
// overwritten), so they can be trusted there. Locally they are whatever the request says.
export function clientIp(req) {
  const real = String(req.headers["x-real-ip"] || "").trim();
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (real || fwd || req.socket?.remoteAddress || "unknown").replace(/^::ffff:/, "");
}

// "https://www.pro-algo.com" for the host the request came in on
export function origin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim()
    || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

// Constant-time string comparison (hashing first makes the lengths equal)
export function sameSecret(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb) && String(a).length > 0;
}

// Wraps a handler: method check, HttpError -> JSON, anything else -> 500 without details.
export function route(methods, handler) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      return json(res, 405, { error: "method_not_allowed" }, { Allow: methods.join(", ") });
    }
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) return json(res, err.status, { error: err.code });
      console.error(`[api] ${req.method} ${req.url}:`, err);
      return json(res, 500, { error: "server_error" });
    }
  };
}
