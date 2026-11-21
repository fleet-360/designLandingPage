// POST /api/sales/spec-pages { pages: [{ n, text }] }   admin: which pages of the Canva spec to attach to
// the contract as Appendix B -> { pages, summaryPage, hoursPage, source: "ai"|"default" }.
// The browser reads the PDF and sends only each page's text (contracts/src/pages/sales/SpecPagePicker.jsx).
import { HttpError, json, readJson, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { pickSpecPages } from "../../_lib/ai-spec-pages.js";

export default route(["POST"], async (req, res) => {
  requireAdmin(req);
  const b = await readJson(req, 1024 * 1024);
  if (!Array.isArray(b.pages) || !b.pages.length || b.pages.length > 300) throw new HttpError(400, "bad_pages");
  const pages = b.pages.map((p, i) => ({ n: i + 1, text: String(p?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 2500) }));
  json(res, 200, await pickSpecPages(pages));
});
