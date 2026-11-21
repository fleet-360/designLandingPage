// /api/sales/deal-film?id=   the demo film on a deal's order page (admin). See api/_lib/demo-film.js.
//   GET                                            -> { configured, film }
//   POST { action: "demo", name, gz }              the demo HTML, gzipped in the browser, base64 (up to 3.2MB gzipped)
//   POST { action: "logo", fileId }                the client's logo, uploaded first through sales/upload
//   POST { action: "generate", failures?, script? } Claude writes the script (or corrects `script` after `failures`)
//   POST { action: "video_part", index, total, size, name, type, data }
//                                                  a ready video (MP4/WebM/MOV) instead of the film, in parts of
//                                                  VIDEO_PART bytes (base64) sent in order; it replaces the film on
//                                                  the page once the last part arrives
//   POST { action: "save", script?, published? }    sales edits the captions / shows or hides the film
//   POST { action: "remove", what: "demo"|"video"|"logo" }
// Each answers { configured, film }.
import { gunzipSync } from "node:zlib";
import { HttpError, json, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { uuidParam } from "../../_lib/sign.js";
import { logEvent, str } from "../../_lib/sales.js";
import { cleanScript, demoHtml, demoSource, filmConfigured, VIDEO_MAX, VIDEO_PART, VIDEO_TYPES, writeFilm } from "../../_lib/demo-film.js";

const MAX_GZ = 3.2 * 1024 * 1024;

// the parts of a replaced or abandoned video are deleted: nothing else points at them
const dropParts = async (ids) => {
  const list = (ids || []).filter(Boolean);
  if (list.length) await query("DELETE FROM sign.files WHERE id = ANY($1::uuid[])", [list]);
};

const out = (film) => film && {
  hasDemo: Boolean(film.demoFileId),
  // in the file addresses, so the preview reloads when a file is replaced
  demoV: film.demoFileId ? film.demoFileId.slice(0, 8) : null,
  logoV: film.logoFileId ? film.logoFileId.slice(0, 8) : null,
  demoName: film.demoName || null,
  demoSize: film.demoSize || null,
  hasLogo: Boolean(film.logoFileId),
  hasVideo: Boolean(film.video),
  videoV: film.video ? film.video.parts[0].slice(0, 8) : null,
  videoName: film.video?.name || null,
  videoSize: film.video?.size || null,
  script: film.script || null,
  scriptAt: film.scriptAt || null,
  // what Claude was paid for this deal's scripts, one row per request
  usage: film.usage || [],
  published: Boolean(film.published),
};

async function save(id, film) {
  await query("UPDATE sales.deals SET film = $2, updated_at = now() WHERE id = $1", [id, JSON.stringify(film)]);
  return film;
}

export default route(["GET", "POST"], async (req, res) => {
  const user = requireAdmin(req);
  const id = uuidParam(new URL(req.url, "http://x").searchParams.get("id"));
  const d = (await query("SELECT id, data, client, film FROM sales.deals WHERE id = $1", [id])).rows[0];
  if (!d) throw new HttpError(404, "not_found");
  let film = d.film || {};
  const reply = () => json(res, 200, { configured: filmConfigured(), film: out(d.film && film) });
  if (req.method === "GET") return reply();

  const b = await readJson(req, 4.4 * 1024 * 1024);
  switch (b.action) {
    case "demo": {
      const gz = Buffer.from(String(b.gz || ""), "base64");
      if (!gz.length || gz.length > MAX_GZ) throw new HttpError(413, "too_large");
      let html;
      try { html = gunzipSync(gz).toString("utf8"); } catch { throw new HttpError(400, "bad_file"); }
      if (!/<(html|body|script)\b/i.test(html)) throw new HttpError(400, "bad_file");
      demoSource(html); // refuses a demo too big for Claude now, not when the script is asked for
      const f = await query(
        "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (false, $1, 'application/gzip', $2, $3) RETURNING id",
        [str(b.name, 200) || "demo.html", gz.length, gz]);
      // a new demo: the old script points at elements that may be gone
      film = { ...film, demoFileId: f.rows[0].id, demoName: str(b.name, 200) || "demo.html", demoSize: html.length, script: null, scriptAt: null, published: Boolean(film.video && film.published) };
      break;
    }
    case "logo": {
      const fid = uuidParam(b.fileId);
      const f = (await query("SELECT content_type FROM sign.files WHERE id = $1", [fid])).rows[0];
      if (!f || !/^image\//.test(f.content_type)) throw new HttpError(400, "bad_file");
      film = { ...film, logoFileId: fid };
      break;
    }
    case "generate": {
      if (!film.demoFileId) throw new HttpError(400, "no_demo");
      const f = (await query("SELECT data FROM sign.files WHERE id = $1", [film.demoFileId])).rows[0];
      if (!f) throw new HttpError(400, "no_demo");
      const failures = Array.isArray(b.failures) ? b.failures.map((x) => str(x, 300)).filter(Boolean) : [];
      const fix = failures.length && b.script ? { script: cleanScript(b.script), failures } : null;
      const { script, usage } = await writeFilm(demoHtml(f.data), { project: d.data.project?.name, summary: d.data.project?.summary, fix });
      const at = new Date().toISOString();
      film = { ...film, script, scriptAt: at, usage: [...(film.usage || []), { at, fix: Boolean(fix), ...usage }].slice(-30) };
      await logEvent("deal", id, fix ? "film_fixed" : "film_written", { by: user, scenes: script.scenes.length, usage });
      break;
    }
    case "save": {
      if (b.script !== undefined) film = { ...film, script: cleanScript(b.script) };
      if (b.published !== undefined) {
        if (b.published && !film.video && !(film.demoFileId && film.script)) throw new HttpError(400, "no_script");
        film = { ...film, published: Boolean(b.published) };
      }
      break;
    }
    case "video_part": {
      const size = Math.trunc(Number(b.size));
      const total = Math.ceil(size / VIDEO_PART);
      const index = Math.trunc(Number(b.index));
      if (!VIDEO_TYPES.includes(b.type)) throw new HttpError(400, "unsupported_file_type");
      if (!(size > 0) || size > VIDEO_MAX) throw new HttpError(413, "too_large");
      if (Number(b.total) !== total || !(index >= 0 && index < total)) throw new HttpError(400, "bad_part");
      const bytes = Buffer.from(String(b.data || ""), "base64");
      if (bytes.length !== (index < total - 1 ? VIDEO_PART : size - VIDEO_PART * (total - 1))) throw new HttpError(400, "bad_part");
      let up = film.videoUpload;
      if (index === 0) { await dropParts(up?.parts); up = { name: str(b.name, 200) || "video.mp4", type: b.type, size, parts: [] }; }
      else if (!up || up.size !== size || up.parts.length !== index) throw new HttpError(409, "bad_part");
      const f = await query(
        "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (false, $1, $2, $3, $4) RETURNING id",
        [`${up.name} (${index + 1}/${total})`, b.type, bytes.length, bytes]);
      up = { ...up, parts: [...up.parts, f.rows[0].id] };
      if (up.parts.length < total) { film = { ...film, videoUpload: up }; break; }
      await dropParts(film.video?.parts);
      film = { ...film, video: up, videoUpload: null };
      await logEvent("deal", id, "film_video", { by: user, size });
      break;
    }
    case "remove": {
      if (b.what === "logo") film = { ...film, logoFileId: null };
      else if (b.what === "video") { await dropParts(film.video?.parts); film = { ...film, video: null }; }
      else film = { ...film, demoFileId: null, demoName: null, demoSize: null, script: null, scriptAt: null };
      // nothing left to show
      if (!film.video && !(film.demoFileId && film.script)) film.published = false;
      break;
    }
    default:
      throw new HttpError(400, "bad_action");
  }
  d.film = await save(id, film);
  film = d.film;
  return reply();
});
