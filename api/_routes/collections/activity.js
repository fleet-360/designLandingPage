// /api/collections/activity   the change log, admin
//   GET              newest first
//   POST { id }      undo that change (a creation is removed, a deletion or an edit is put back)
import { HttpError, json, readJson, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { activity, restore } from "../../_lib/collections.js";
import { bodyId } from "../../_lib/collections-ids.js";

export default route(["GET", "POST"], async (req, res) => {
  const user = requireAdmin(req);
  if (req.method === "GET") return json(res, 200, { activity: await activity() });
  const b = await readJson(req);
  if (!bodyId(b)) throw new HttpError(400, "bad_id");
  await restore(b.id, user);
  json(res, 200, { ok: true });
});
