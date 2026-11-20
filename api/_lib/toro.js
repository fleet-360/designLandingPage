// Toro (fleet-360/cars-server, api.fleet360.co.il) and this site trust each other without secrets:
// - Toro -> site: accepted only from Toro's server address (requireToro). On Vercel the caller's IP
//   comes from Vercel's own headers and cannot be forged.
// - site -> Toro: Toro's proAlgoSales endpoints take ids only and read the details back from this
//   site's fixed address, through requireToro endpoints.
import { clientIp, HttpError } from "./http.js";

const TORO_IPS = ["213.165.85.39"]; // api.fleet360.co.il (the live "staging" server)
const LOCAL_IPS = ["127.0.0.1", "::1"];
const TORO_URL = "https://api.fleet360.co.il";

export function toroIps() {
  const fromEnv = String(process.env.PAY_WEBHOOK_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const list = fromEnv.length ? fromEnv : TORO_IPS;
  return process.env.VERCEL ? list : [...list, ...LOCAL_IPS]; // local development: tools/dev.mjs
}

export function requireToro(req) {
  const ip = clientIp(req);
  if (!toroIps().includes(ip)) {
    console.warn(`[toro] refused a call from ${ip} to ${req.url}`);
    throw new HttpError(403, "forbidden");
  }
}

// Toro's address: production on Vercel; locally only when TORO_URL points at a test server.
export const toroUrl = () => process.env.TORO_URL || (process.env.VERCEL ? TORO_URL : "");

// POST to a Toro endpoint; never throws. -> { ok, ...answer } | { ok: false, error }
export async function callToro(path, body, timeoutMs = 25000) {
  const base = toroUrl();
  if (!base) return { ok: false, error: "toro_not_configured" };
  try {
    const r = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await r.json().catch(() => ({}));
    return r.ok ? { ok: data.ok !== false, ...data } : { ok: false, error: data.error || `toro_${r.status}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
