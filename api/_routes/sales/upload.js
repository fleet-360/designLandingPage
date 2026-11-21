// POST /api/sales/upload { name, data_url }   admin: a spec PDF for a deal, the client's logo for the demo
// film (PNG, JPEG, WebP), or the company's signature image (PNG) for the settings -> { fileId }. Stored private in sign.files.
import { json, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { parseDataUrl } from "../../_lib/sign.js";
import { str } from "../../_lib/sales.js";

export default route(["POST"], async (req, res) => {
  requireAdmin(req);
  const b = await readJson(req, 4 * 1024 * 1024);
  const { contentType, bytes } = parseDataUrl(b.data_url, { allowed: ["application/pdf", "image/png", "image/jpeg", "image/webp"], maxBytes: 3 * 1024 * 1024 });
  const { rows } = await query(
    "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (false, $1, $2, $3, $4) RETURNING id",
    [str(b.name, 200) || null, contentType, bytes.length, bytes]);
  json(res, 201, { fileId: rows[0].id });
});
