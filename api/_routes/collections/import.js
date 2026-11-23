// /api/collections/import   POST, admin: the one-time move from the previous collections system (Base44).
// Body: { customers, payments, collections, activity } as Base44 lists them. Every record keeps its Base44 id
// in legacy_id, so running it again adds nothing twice. -> how many of each were added
import { json, readJson, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { importLegacy } from "../../_lib/collections-import.js";

export default route(["POST"], async (req, res) => {
  const user = requireAdmin(req);
  const b = await readJson(req, 4 * 1024 * 1024);
  json(res, 200, await importLegacy(b, user));
});
