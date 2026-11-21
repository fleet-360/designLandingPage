// /api/sales/pitch   key lines for the top of a spec request page, written by Claude (admin)
//   GET                    -> { configured }   is ANTHROPIC_API_KEY set
//   POST { problem }       -> { headlines: [3], lines: [3] }   options for sales to pick and edit
//                             problem: a few words about what the client wants solved
// Saving is part of the spec request itself (sales/discovery, field pitch).
import { HttpError, json, readJson, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { str } from "../../_lib/sales.js";
import { pitchConfigured, writePitch } from "../../_lib/ai-pitch.js";

export default route(["GET", "POST"], async (req, res) => {
  requireAdmin(req);
  if (req.method === "GET") return json(res, 200, { configured: pitchConfigured() });
  const b = await readJson(req);
  const problem = str(b.problem, 500);
  if (problem.length < 3) throw new HttpError(400, "bad_problem");
  json(res, 200, await writePitch(problem));
});
