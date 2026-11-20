// POST /api/contracts/submit   (Base44 function submitSignature), public: the customer's sign page.
// { form_id, field_values: {blockId: value}, signatures: {signatureBlockId: "data:image/png;base64,..."},
//   form_version }  -> { ok, id, guid, document_hash }
//
// 404 form_not_found, 403 form_not_published, 409 form_changed (the signer had an older version
// open; the page reloads it), 429 too_many_submissions (30 per form in 10 minutes).
// The submission, its signature images, the audit log entry and the form's counter are written
// in one transaction. Then the signed PDF is made and stored (api/_lib/sign-pdf.js; if that fails it is
// made on first download), and Toro is asked to email the office with it (see notifyOffice).
import { clientIp, HttpError, json, readJson, route } from "../../_lib/http.js";
import { connectionString, query, transaction } from "../../_lib/db.js";
import { extractSignerInfo, formVersion, parseDataUrl, sha256, uuidParam } from "../../_lib/sign.js";
import { ensureSignedPdf } from "../../_lib/sign-pdf.js";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = "10 minutes";
const MAX_SIGNATURE = 1024 * 1024;
const NOTIFY_URL = "https://api.fleet360.co.il/contracts/notifySigned";

export default route(["POST"], async (req, res) => {
  if (!connectionString()) throw new HttpError(503, "not_configured");
  const body = await readJson(req, 4 * 1024 * 1024);
  const formId = uuidParam(body.form_id, "missing_form_id");

  const { rows } = await query("SELECT * FROM sign.forms WHERE id = $1", [formId]);
  const form = rows[0];
  if (!form) throw new HttpError(404, "form_not_found");
  if (!form.is_published) throw new HttpError(403, "form_not_published");
  if (body.form_version && body.form_version !== formVersion(form)) throw new HttpError(409, "form_changed");

  const recent = await query(
    `SELECT count(*)::int AS n FROM sign.submissions WHERE form_id = $1 AND created_date > now() - interval '${RATE_LIMIT_WINDOW}'`,
    [formId]);
  if (recent.rows[0].n >= RATE_LIMIT_MAX) throw new HttpError(429, "too_many_submissions");

  // Only fields and signature blocks that exist in this form are kept
  const blocks = form.blocks || [];
  const fieldIds = new Set(blocks.filter((b) => b.type === "field").map((b) => b.id));
  const sigIds = new Set(blocks.filter((b) => b.type === "signature").map((b) => b.id));
  const fieldValues = {};
  for (const [k, v] of Object.entries(body.field_values || {})) {
    if (fieldIds.has(k) && v !== undefined && v !== null) fieldValues[k] = String(v).slice(0, 5000);
  }
  const images = [];
  for (const [k, v] of Object.entries(body.signatures || {})) {
    if (!sigIds.has(k) || typeof v !== "string" || !v) continue;
    images.push([k, parseDataUrl(v, { allowed: ["image/png"], maxBytes: MAX_SIGNATURE })]);
  }

  const formSnapshot = { title: form.title, blocks };
  const signer = extractSignerInfo(form, fieldValues);
  const ip = clientIp(req);
  const ua = String(req.headers["user-agent"] || "").slice(0, 500);
  const signedAt = new Date();
  const guid = crypto.randomUUID();

  // Integrity hash of what was signed: form, values, the signature images themselves, and time
  const sortKeys = (o) => Object.keys(o).sort().reduce((acc, k) => ({ ...acc, [k]: o[k] }), {});
  const documentHash = sha256(JSON.stringify({
    form_id: formId,
    form_title: form.title,
    form_version: formVersion(form),
    field_values: sortKeys(fieldValues),
    signatures: sortKeys(Object.fromEntries(images.map(([k, img]) => [k, sha256(img.bytes)]))),
    signed_at: signedAt.toISOString(),
  }));

  const submission = await transaction(async (db) => {
    const signatures = {};
    for (const [blockId, img] of images) {
      const f = await db.query(
        "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (false, $1, $2, $3, $4) RETURNING id",
        [`signature-${blockId}.png`, img.contentType, img.bytes.length, img.bytes]);
      signatures[blockId] = f.rows[0].id;
    }
    const s = await db.query(
      `INSERT INTO sign.submissions (form_id, form_title, form_snapshot, field_values, signatures, signer_name,
         signer_id_number, signer_email, signer_ip, signer_user_agent, signed_at, document_hash, guid)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [formId, form.title, JSON.stringify(formSnapshot), JSON.stringify(fieldValues), JSON.stringify(signatures),
        signer.signer_name, signer.signer_id_number, signer.signer_email, ip, ua, signedAt, documentHash, guid]);
    const id = s.rows[0].id;
    await db.query(
      `INSERT INTO sign.audit_log (submission_id, form_id, signer_name, signer_email, signer_ip, signer_user_agent,
         signed_at_utc, guid, document_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, formId, signer.signer_name, signer.signer_email, ip, ua, signedAt, guid, documentHash]);
    await db.query("UPDATE sign.forms SET submission_count = submission_count + 1 WHERE id = $1", [formId]);
    return { id };
  });

  try {
    await ensureSignedPdf(submission.id);
  } catch (err) {
    console.error("[contracts/submit] signed PDF failed:", err);
  }
  await notifyOffice(guid);
  json(res, 200, { ok: true, id: submission.id, guid, document_hash: documentHash });
});

// Toro emails the office (sales@pro-algorithm.co.il). It is only told the signature's guid and
// reads the details back from api/contracts/notice.js, which answers once per signature, so this
// call cannot be used to send it made-up content. Never fails the signature. Off outside Vercel
// unless CONTRACTS_NOTIFY_URL is set, so local testing does not email the office.
async function notifyOffice(guid) {
  const url = process.env.CONTRACTS_NOTIFY_URL || (process.env.VERCEL ? NOTIFY_URL : "");
  if (!url || url === "off") return;
  try {
    // only the guid: Toro reads the details from its own fixed address of this site
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guid }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn("[contracts/submit] notify failed:", err.message);
  }
}
