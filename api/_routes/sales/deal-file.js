// GET /api/sales/deal-file?token=&kind=signed|spec|demo|logo|video     the client's own files (the token is the key)
// GET /api/sales/deal-file?id=&kind=signed|spec|demo|logo|video        the same for the signed-in admin
// demo: the demo film's HTML with its driver (api/_lib/demo-film.js), sandboxed: it runs without an origin,
// so it can reach neither the page that frames it nor anyone's cookies.
import { HttpError, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { sessionUser } from "../../_lib/session.js";
import { uuidParam } from "../../_lib/sign.js";
import { stampedSpecPdf } from "../../_lib/spec-pdf.js";
import { demoHtml, VIDEO_PART, withDriver } from "../../_lib/demo-film.js";

// the ready video, one part per answer: the browser asks again for the next range
async function sendVideo(req, res, v) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
  let start = m && m[1] !== "" ? Number(m[1]) : 0;
  let end = m && m[2] !== "" ? Number(m[2]) : v.size - 1;
  if (m && m[1] === "" && m[2] !== "") { start = Math.max(0, v.size - Number(m[2])); end = v.size - 1; }
  if (start >= v.size || start > end) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${v.size}`);
    return res.end();
  }
  const part = Math.floor(start / VIDEO_PART);
  end = Math.min(end, v.size - 1, (part + 1) * VIDEO_PART - 1);
  const f = (await query("SELECT data FROM sign.files WHERE id = $1", [v.parts[part]])).rows[0];
  if (!f) throw new HttpError(404, "not_found");
  const body = f.data.subarray(start - part * VIDEO_PART, end - part * VIDEO_PART + 1);
  // always partial, also without a Range header: the whole file never fits in one answer
  res.statusCode = 206;
  res.setHeader("Content-Type", v.type);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Range", `bytes ${start}-${end}/${v.size}`);
  res.setHeader("Content-Length", body.length);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(body);
}


export default route(["GET"], async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams;
  let d;
  if (q.get("id")) {
    if (!sessionUser(req)) throw new HttpError(401, "signed_out");
    d = (await query("SELECT * FROM sales.deals WHERE id = $1", [uuidParam(q.get("id"))])).rows[0];
  } else if (/^[A-Za-z0-9_-]{20,40}$/.test(String(q.get("token") || ""))) {
    d = (await query("SELECT * FROM sales.deals WHERE token = $1", [q.get("token")])).rows[0];
  }
  if (!d) throw new HttpError(404, "not_found");
  const kind = q.get("kind");
  if (kind === "video") {
    if (!d.film?.video) throw new HttpError(404, "not_found");
    return sendVideo(req, res, d.film.video);
  }
  // the spec as it was approved and signed, once it was; before that, the one in the deal
  const specId = d.snapshot?.spec?.fileId || d.snapshot?.order?.project?.specFileId || d.data.project?.specFileId;
  const fileId = { signed: d.signed_pdf_file_id, spec: specId, demo: d.film?.demoFileId, logo: d.film?.logoFileId }[kind];
  if (!fileId) throw new HttpError(404, "not_found");
  const f = (await query("SELECT name, content_type, data FROM sign.files WHERE id = $1", [fileId])).rows[0];
  if (!f) throw new HttpError(404, "not_found");
  if (kind === "demo" || kind === "logo") {
    const body = kind === "demo" ? Buffer.from(withDriver(demoHtml(f.data)), "utf8") : f.data;
    res.statusCode = 200;
    res.setHeader("Content-Type", kind === "demo" ? "text/html; charset=utf-8" : f.content_type);
    res.setHeader("Content-Length", body.length);
    // the address changes with the file (?v=), so a short private cache is safe
    res.setHeader("Cache-Control", "private, max-age=600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (kind === "demo") res.setHeader("Content-Security-Policy", "sandbox allow-scripts");
    return res.end(body);
  }
  // the spec opens as Appendix B: each page with the strip that says the hours in it are estimates
  if (kind === "spec" && f.content_type === "application/pdf") {
    try {
      const pr = d.snapshot?.spec || { pages: (d.snapshot?.order?.project || d.data.project)?.specPages, pageCount: (d.snapshot?.order?.project || d.data.project)?.specPageCount };
      f.data = await stampedSpecPdf(f.data, { number: d.number, pages: pr.pages, pageCount: pr.pageCount });
    } catch (e) { console.error("[deal-file] spec stamp failed:", e?.message); }
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", f.content_type);
  res.setHeader("Content-Length", f.data.length);
  res.setHeader("Content-Disposition", `${kind === "signed" ? "attachment" : "inline"}; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(f.name || "document.pdf")}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(f.data);
});
