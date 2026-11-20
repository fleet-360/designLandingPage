// /api/contracts/files  (stands in for Base44 UploadPublicFile / private file URLs)
//   GET  ?id=<uuid>                 the file. Images placed in forms are public; signature
//                                   images only for the signed-in admin.
//   POST {name, data_url}           upload an image for a form (admin) -> { file_url }
// Files live in the database (sign.files); SVG is refused because it could carry script.
import { HttpError, json, readJson, route } from "../../_lib/http.js";
import { connectionString, query } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { sessionUser } from "../../_lib/session.js";
import { fileUrl, parseDataUrl, uuidParam } from "../../_lib/sign.js";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE = 3 * 1024 * 1024;

export default route(["GET", "POST"], async (req, res) => {
  if (req.method === "POST") {
    requireAdmin(req);
    const body = await readJson(req, 4 * 1024 * 1024 + 1024);
    const { contentType, bytes } = parseDataUrl(body.data_url, { allowed: IMAGE_TYPES, maxBytes: MAX_IMAGE });
    const { rows } = await query(
      "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (true, $1, $2, $3, $4) RETURNING id",
      [String(body.name || "").slice(0, 200) || null, contentType, bytes.length, bytes]);
    return json(res, 201, { file_url: fileUrl(rows[0].id) });
  }

  if (!connectionString()) throw new HttpError(503, "not_configured");
  const id = uuidParam(new URL(req.url, "http://x").searchParams.get("id"));
  const { rows } = await query("SELECT is_public, content_type, data FROM sign.files WHERE id = $1", [id]);
  const file = rows[0];
  if (!file || (!file.is_public && !sessionUser(req))) throw new HttpError(404, "not_found");

  res.statusCode = 200;
  res.setHeader("Content-Type", file.content_type);
  res.setHeader("Content-Length", file.data.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  // a file never changes under its id; private ones are not kept in shared caches
  res.setHeader("Cache-Control", file.is_public ? "public, max-age=31536000, immutable" : "private, max-age=300");
  res.end(file.data);
});
