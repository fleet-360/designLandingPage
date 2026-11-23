// /api/collections/kaspit-cron   GET | POST: the two-hourly Kaspit sync (.github/workflows/collections-kaspit.yml).
// Public on purpose: it only pulls from Kaspit, answers with counts (no customer data), and does nothing when
// the last good sync was under 100 minutes ago, so extra calls cost nothing.
import { json, route } from "../../_lib/http.js";
import { connectionString } from "../../_lib/db.js";
import { syncKaspit } from "../../_lib/collections-kaspit.js";

export default route(["GET", "POST"], async (req, res) => {
  if (!connectionString()) return json(res, 503, { error: "not_configured" });
  const r = await syncKaspit("schedule");
  json(res, r.ok || r.skipped ? 200 : 502, r);
});
