// Signed contract PDF, made on the server when the customer signs (api/contracts/submit.js) and kept
// in sign.files as the record of what was signed. Ported from SignEase's base44/shared/pdfGenerator.ts
// (same layout rules); images come from sign.files instead of Base44 storage, the Heebo font ships in
// ./fonts, and the last page carries the signature details (time, signer, IP, guid, document hash).
//
// Bump PDF_VERSION when the layout changes. A stored PDF is never replaced: it is the record.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { jsPDF } from "jspdf";
import { query } from "./db.js";

export const PDF_VERSION = 1;

let fonts = null;
export function loadFonts() {
  if (!fonts) {
    const read = (name) => fs.readFileSync(new URL(`./fonts/${name}`, import.meta.url)).toString("base64");
    fonts = { regular: read("Heebo-Regular.ttf"), bold: read("Heebo-Bold.ttf") };
  }
  return fonts;
}

export const HEBREW_RE = /[\u0590-\u05ff\ufb1d-\ufb4f]/;
const MIRROR = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<" };

// Text goes to jsPDF in logical order and jsPDF's own BiDi engine lays it out (isInputVisual:false,
// isInputRtl:true): that handles lines mixing Hebrew with Latin, numbers, emails and addresses.
// SignEase's manual reordering fought that engine on mixed lines in jsPDF 4. The engine does not
// mirror brackets, so in a line with Hebrew they are swapped first.
export function rtlText(text) {
  return HEBREW_RE.test(text) ? text.replace(/[()[\]{}<>]/g, (c) => MIRROR[c]) : text;
}
export const RTL_OPTIONS = { isInputVisual: false, isInputRtl: true, isOutputVisual: true, isOutputRtl: false };

function parseFontSize(sizeStr, defaultPt) {
  if (!sizeStr || sizeStr === "default") return defaultPt;
  const m = String(sizeStr).match(/(\d+)px/);
  return m ? Math.round(parseInt(m[1], 10) * 0.75) : defaultPt;
}

function hexToRgb(hex, fallback) {
  if (!hex) return fallback;
  let h = String(hex).replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const m = h.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : fallback;
}

const mapAlign = (align) => (align === "center" ? "center" : align === "end" ? "left" : "right");

// Same as isBlockVisible in contracts/src/lib/formUtils.js
function isBlockVisible(block, values) {
  if (!block.conditional || !block.condition || !block.condition.field_id) return true;
  return ((values || {})[block.condition.field_id] || "") === (block.condition.value || "");
}

const FILE_URL_RE = /^\/api\/contracts\/files\?id=([0-9a-f-]{36})$/i;

async function fileDataUrl(id) {
  const { rows } = await query("SELECT content_type, data FROM sign.files WHERE id = $1", [id]);
  return rows[0] ? `data:${rows[0].content_type};base64,${rows[0].data.toString("base64")}` : null;
}

// Images placed in the form: our own files from the database, anything else fetched
async function imageDataUrl(src) {
  const own = FILE_URL_RE.exec(String(src || ""));
  if (own) return fileDataUrl(own[1]);
  if (!/^https:\/\//i.test(String(src || ""))) return null;
  const r = await fetch(src, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const type = r.headers.get("content-type") || "image/png";
  return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
}

// submission: a sign.submissions row (snake_case columns)
export async function generateSignedPdf(submission) {
  const form = submission.form_snapshot;
  const { regular, bold } = loadFonts();

  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4", compress: true });
  pdf.addFileToVFS("Heebo-Regular.ttf", regular);
  pdf.addFont("Heebo-Regular.ttf", "Heebo", "normal");
  pdf.addFileToVFS("Heebo-Bold.ttf", bold);
  pdf.addFont("Heebo-Bold.ttf", "Heebo", "bold");
  pdf.setFont("Heebo");
  pdf.setProperties({ title: form.title || "", subject: `guid ${submission.guid}`, creator: "Pro Algorithm" });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - 2 * margin;
  let y = margin;

  const ensureSpace = (h) => {
    if (y + h > pageH - margin) { pdf.addPage(); y = margin; }
  };

  function drawText(text, opts = {}) {
    const fontSize = opts.fontSize || 11;
    const color = opts.color || [0, 0, 0];
    const align = opts.align || "right";
    const lineHeight = opts.lineHeight || 1.4;
    pdf.setFont("Heebo", opts.bold ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    pdf.setTextColor(color[0], color[1], color[2]);
    for (const rawLine of String(text || "").split("\n")) {
      for (const line of pdf.splitTextToSize(rawLine, opts.maxWidth || contentW)) {
        ensureSpace(fontSize * lineHeight);
        const x = align === "right" ? pageW - margin : align === "center" ? pageW / 2 : margin;
        const rtl = !opts.ltr && HEBREW_RE.test(line);
        pdf.text(rtl ? rtlText(line) : line, x, y + fontSize, rtl ? { align, ...RTL_OPTIONS } : { align });
        y += fontSize * lineHeight;
      }
    }
  }

  const signatures = submission.signatures || {};
  const values = submission.field_values || {};
  const blocks = (form.blocks || []).filter((b) => b.display !== "fill" && isBlockVisible(b, values));

  for (const block of blocks) {
    const style = block.has_pdf_style ? (block.pdf_style || block.style) : block.style;
    const isLtr = style && style.direction === "ltr";
    const align = isLtr ? "left" : mapAlign(style && style.align);
    const color = hexToRgb(style && style.color, [28, 25, 23]);

    if (block.type === "title") {
      const sizes = { h1: 20, h2: 16, h3: 14 };
      drawText(block.content || "", { fontSize: parseFontSize(style && style.font_size, sizes[block.heading_level || "h2"]), bold: true, color, align, ltr: isLtr });
      y += 8;
    } else if (block.type === "text") {
      drawText(block.content || "", { fontSize: parseFontSize(style && style.font_size, 11), bold: style && style.bold, color, align, ltr: isLtr });
      y += 4;
    } else if (block.type === "separator") {
      ensureSpace(16);
      pdf.setDrawColor(214, 211, 209);
      pdf.setLineWidth(1);
      pdf.line(margin, y, pageW - margin, y);
      y += 16;
    } else if (block.type === "image" && block.content) {
      try {
        const dataUrl = await imageDataUrl(block.content);
        if (dataUrl) {
          const props = pdf.getImageProperties(dataUrl);
          let w = Math.min((block.width || props.width) * 0.75, contentW);
          let h = (w * props.height) / props.width;
          if (h > 216) { w = (w * 216) / h; h = 216; }
          const a = style && style.align;
          const side = a === "center" ? "center" : (a === "end") !== isLtr ? "left" : "right";
          const x = side === "center" ? (pageW - w) / 2 : side === "left" ? margin : pageW - margin - w;
          ensureSpace(h + 10);
          pdf.addImage(dataUrl, props.fileType || "JPEG", x, y, w, h, undefined, "FAST");
          y += h + 10;
        }
      } catch {
        // image unavailable: the rest of the document still goes out
      }
    } else if (block.type === "field") {
      drawText(block.label || "", { fontSize: 10, bold: true, color: [87, 83, 78], align, ltr: isLtr });
      drawText(values[block.id] || "", { fontSize: 11, color, align, ltr: isLtr });
      pdf.setDrawColor(168, 162, 158);
      pdf.setLineWidth(0.5);
      pdf.line(margin, y, pageW - margin, y);
      y += 8;
    } else if (block.type === "signature") {
      drawText(block.label || "", { fontSize: 10, bold: true, color: [87, 83, 78], align, ltr: isLtr });
      const sig = signatures[block.id] ? await fileDataUrl(signatures[block.id]) : null;
      if (sig) {
        ensureSpace(80);
        try { pdf.addImage(sig, "PNG", pageW - margin - 200, y, 200, 70, undefined, "FAST"); } catch { /* skip */ }
        y += 80;
      } else {
        ensureSpace(50);
        pdf.setDrawColor(168, 162, 158);
        pdf.setLineWidth(0.5);
        pdf.line(margin, y + 40, pageW - margin, y + 40);
        y += 50;
      }
    }
  }

  // Signature details, for the record
  const signedAt = new Date(submission.signed_at);
  const grey = [120, 113, 108];
  y += 16;
  ensureSpace(150);
  pdf.setDrawColor(214, 211, 209);
  pdf.setLineWidth(0.75);
  pdf.line(margin, y, pageW - margin, y);
  y += 10;
  drawText("פרטי החתימה", { fontSize: 10, bold: true, color: [87, 83, 78] });
  // label and value are drawn as separate strings (label on the right, value to its left), so no
  // string mixes directions
  const pad = (n) => String(n).padStart(2, "0");
  const il = new Date(signedAt.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const rows = [
    ["נחתם, שעון ישראל", `${pad(il.getDate())}.${pad(il.getMonth() + 1)}.${il.getFullYear()} ${pad(il.getHours())}:${pad(il.getMinutes())}:${pad(il.getSeconds())}`],
    ["נחתם, UTC", signedAt.toISOString()],
    submission.signer_name && ["שם החותם", submission.signer_name],
    submission.signer_id_number && ["ת.ז / ח.פ", submission.signer_id_number],
    submission.signer_email && ["אימייל", submission.signer_email],
    submission.signer_ip && ["כתובת IP", submission.signer_ip],
    ["מזהה חתימה", String(submission.guid)],
    ["גיבוב המסמך SHA-256", submission.document_hash],
  ].filter(Boolean);
  const size = 8;
  for (const [label, value] of rows) {
    ensureSpace(size * 1.6);
    pdf.setFontSize(size);
    pdf.setTextColor(grey[0], grey[1], grey[2]);
    pdf.setFont("Heebo", "bold");
    const labelText = `${label}:`;
    pdf.text(rtlText(labelText), pageW - margin, y + size, { align: "right", ...RTL_OPTIONS });
    const labelW = pdf.getTextWidth(labelText);
    pdf.setFont("Heebo", "normal");
    const v = String(value);
    const vx = pageW - margin - labelW - 6;
    if (HEBREW_RE.test(v)) pdf.text(rtlText(v), vx, y + size, { align: "right", ...RTL_OPTIONS });
    else pdf.text(v, vx, y + size, { align: "right" });
    y += size * 1.6;
  }

  return Buffer.from(pdf.output("arraybuffer"));
}

export const pdfFileName = (submission) => {
  const date = new Date(submission.signed_at).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }).replace(/\./g, "-");
  const who = submission.signer_name ? ` - ${submission.signer_name}` : "";
  return `${submission.form_title || "מסמך חתום"}${who} - ${date}.pdf`.replace(/[\\/:*?"<>|]+/g, "-");
};

// The submission's stored PDF, made and stored now if it has none yet. Never replaces a stored one.
// -> { fileId, name, sha256 } or null when the submission does not exist
export async function ensureSignedPdf(submissionId) {
  const { rows } = await query("SELECT * FROM sign.submissions WHERE id = $1", [submissionId]);
  const s = rows[0];
  if (!s) return null;
  const name = pdfFileName(s);
  if (s.pdf_file_id) return { fileId: s.pdf_file_id, name, sha256: s.pdf_sha256 };

  const bytes = await generateSignedPdf(s);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const f = await query(
    "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (false, $1, 'application/pdf', $2, $3) RETURNING id",
    [name, bytes.length, bytes]);
  const fileId = f.rows[0].id;
  const u = await query(
    "UPDATE sign.submissions SET pdf_file_id = $2, pdf_sha256 = $3, pdf_version = $4 WHERE id = $1 AND pdf_file_id IS NULL RETURNING id",
    [submissionId, fileId, sha256, PDF_VERSION]);
  if (!u.rows[0]) {
    // made at the same time by another request: keep theirs
    await query("DELETE FROM sign.files WHERE id = $1", [fileId]);
    return ensureSignedPdf(submissionId);
  }
  return { fileId, name, sha256 };
}
