// Shared by api/contracts/*.js (formerly SignEase on Base44). Rows go out in the Base44 entity
// shape the app (contracts/) was written for: id, created_date, updated_date, created_by_id, ...
import { createHash } from "node:crypto";
import { HttpError } from "./http.js";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidParam(value, code = "bad_id") {
  const s = String(value || "");
  if (!UUID_RE.test(s)) throw new HttpError(400, code);
  return s.toLowerCase();
}

const iso = (d) => (d ? new Date(d).toISOString() : null);

export function formRow(r) {
  return {
    id: r.id,
    title: r.title,
    blocks: r.blocks || [],
    is_published: r.is_published,
    published_date: iso(r.published_date),
    submission_count: r.submission_count,
    created_by: r.created_by,
    created_by_id: r.created_by,
    created_date: iso(r.created_date),
    updated_date: iso(r.updated_date),
  };
}

export const fileUrl = (id) => `/api/contracts/files?id=${id}`;

export function submissionRow(r) {
  const signatures = r.signatures || {};
  return {
    id: r.id,
    form_id: r.form_id,
    form_title: r.form_title,
    form_snapshot: r.form_snapshot,
    field_values: r.field_values || {},
    // values are sign.files ids; api/contracts/signature-urls.js turns them into addresses
    signatures,
    signature_url: Object.values(signatures)[0] || "",
    status: r.status,
    signer_name: r.signer_name,
    signer_id_number: r.signer_id_number,
    signer_email: r.signer_email,
    signer_ip: r.signer_ip,
    signer_user_agent: r.signer_user_agent,
    signed_at: iso(r.signed_at),
    document_hash: r.document_hash,
    guid: r.guid,
    consent_text: r.consent_text,
    consent_at: iso(r.consent_at),
    created_date: iso(r.created_date),
    updated_date: iso(r.updated_date),
  };
}

// --- Same as src/lib/formUtils.js in the app: the id of a form version (title + blocks) ---

function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stableStringify(x))).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function formVersion(form) {
  return cyrb53(stableStringify({ title: form?.title ?? "", blocks: form?.blocks ?? [] }));
}

// Signer details read from the form's fields by their labels, as SignEase did
export function extractSignerInfo(form, fieldValues) {
  let signer_name = "", signer_id_number = "", signer_email = "";
  for (const b of (form.blocks || []).filter((x) => x.type === "field")) {
    const label = b.label || "";
    const val = String(fieldValues[b.id] || "");
    if (!val) continue;
    const lower = label.toLowerCase();
    if (!signer_name && (label.includes("שם מלא") || label.includes("שם לקוח") || label.includes("שם הלקוח"))) signer_name = val;
    if (!signer_id_number && (label.includes("ח.פ") || label.includes("ת.ז") || label.includes("תעודת זהות"))) signer_id_number = val;
    if (!signer_email && (lower.includes("email") || label.includes("אימייל") || label.includes("דואר אלקטרוני") || b.input_type === "email")) signer_email = val;
  }
  return { signer_name, signer_id_number, signer_email };
}

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// "data:image/png;base64,...." -> { contentType, bytes }
export function parseDataUrl(dataUrl, { allowed, maxBytes }) {
  const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!m) throw new HttpError(400, "bad_file");
  const contentType = m[1].toLowerCase();
  if (!allowed.includes(contentType)) throw new HttpError(415, "unsupported_file_type");
  const bytes = Buffer.from(m[2], "base64");
  if (!bytes.length || bytes.length > maxBytes) throw new HttpError(413, "file_too_large");
  return { contentType, bytes };
}
