// /api/contracts/forms  (Base44 entity "Form")
//   GET    ?id=<uuid>  one form. Anyone may read a published form (the public sign page);
//                      a draft only the admin.
//   GET               all forms, newest first (admin)
//   POST   {title, blocks, ...}      create (admin)
//   PATCH  ?id=<uuid> {fields}        update (admin)
//   DELETE ?id=<uuid>                 delete (admin); its submissions and audit log stay
import { HttpError, json, readJson, route } from "../_lib/http.js";
import { connectionString, query } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { sessionUser } from "../_lib/session.js";
import { formRow, uuidParam } from "../_lib/sign.js";

const MAX_BODY = 4 * 1024 * 1024; // forms carry their blocks (text, styles) as JSON
const FIELDS = ["title", "blocks", "is_published", "published_date", "submission_count"];

function values(body) {
  const out = {};
  for (const k of FIELDS) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === "title") out.title = String(v ?? "").slice(0, 300);
    else if (k === "blocks") {
      if (!Array.isArray(v)) throw new HttpError(400, "bad_blocks");
      out.blocks = JSON.stringify(v);
    } else if (k === "is_published") out.is_published = Boolean(v);
    else if (k === "published_date") out.published_date = v ? new Date(v) : null;
    else if (k === "submission_count") out.submission_count = Math.max(0, Math.trunc(Number(v) || 0));
  }
  return out;
}

export default route(["GET", "POST", "PATCH", "DELETE"], async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams;

  if (req.method === "GET" && q.get("id")) {
    if (!connectionString()) throw new HttpError(503, "not_configured");
    const id = uuidParam(q.get("id"));
    const { rows } = await query("SELECT * FROM sign.forms WHERE id = $1", [id]);
    const form = rows[0];
    if (!form || (!form.is_published && !sessionUser(req))) throw new HttpError(404, "not_found");
    return json(res, 200, { item: formRow(form) });
  }

  const user = requireAdmin(req);

  if (req.method === "GET") {
    const { rows } = await query("SELECT * FROM sign.forms ORDER BY created_date DESC LIMIT 1000");
    return json(res, 200, { items: rows.map(formRow) });
  }

  if (req.method === "POST") {
    const v = values(await readJson(req, MAX_BODY));
    const { rows } = await query(
      `INSERT INTO sign.forms (title, blocks, is_published, published_date, submission_count, created_by)
       VALUES ($1, COALESCE($2::jsonb, '[]'::jsonb), COALESCE($3, false), $4, COALESCE($5, 0), $6) RETURNING *`,
      [v.title || "טופס ללא שם", v.blocks ?? null, v.is_published ?? null, v.published_date ?? null, v.submission_count ?? null, user]);
    return json(res, 201, { item: formRow(rows[0]) });
  }

  const id = uuidParam(q.get("id"));

  if (req.method === "PATCH") {
    const v = values(await readJson(req, MAX_BODY));
    const keys = Object.keys(v);
    if (!keys.length) throw new HttpError(400, "nothing_to_update");
    const sets = keys.map((k, i) => `${k} = $${i + 2}${k === "blocks" ? "::jsonb" : ""}`);
    const { rows } = await query(
      `UPDATE sign.forms SET ${sets.join(", ")}, updated_date = now() WHERE id = $1 RETURNING *`,
      [id, ...keys.map((k) => v[k])]);
    if (!rows[0]) throw new HttpError(404, "not_found");
    return json(res, 200, { item: formRow(rows[0]) });
  }

  // DELETE
  const { rowCount } = await query("DELETE FROM sign.forms WHERE id = $1", [id]);
  if (!rowCount) throw new HttpError(404, "not_found");
  json(res, 200, { ok: true });
});
