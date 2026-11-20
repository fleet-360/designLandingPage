// GET/PUT /api/sales/settings   admin: company details, bank, signer, VAT, calendar hours...
// PUT takes the whole object (as GET returned it, edited). Defaults: api/_lib/sales.js DEFAULT_SETTINGS.
import { HttpError, json, readJson, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { DEFAULT_SETTINGS, getSettings, isEmail, saveSettings } from "../../_lib/sales.js";
import { callToro } from "../../_lib/toro.js";

export default route(["GET", "PUT"], async (req, res) => {
  requireAdmin(req);
  if (req.method === "GET") {
    const q = new URL(req.url, "http://x").searchParams;
    const settings = await getSettings();
    // is the developers@ calendar reachable through Toro?
    let calendar = null;
    if (q.get("check")) {
      const r = await callToro("/proAlgoSales/calendar/busy", { timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + 3600e3).toISOString() });
      calendar = { connected: r.ok, error: r.ok ? null : r.error };
    }
    return json(res, 200, { settings, defaults: DEFAULT_SETTINGS, calendar });
  }
  const b = await readJson(req, 256 * 1024);
  const s = b.settings;
  if (!s || typeof s !== "object") throw new HttpError(400, "bad_settings");
  if (!isEmail(s.officeEmail)) throw new HttpError(400, "bad_office_email");
  const vat = Number(s.vatRate);
  if (!(vat >= 0 && vat <= 50)) throw new HttpError(400, "bad_vat");
  await saveSettings(s);
  json(res, 200, { settings: await getSettings() });
});
