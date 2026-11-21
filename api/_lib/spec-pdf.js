// The approved spec (the Canva PDF) as Appendix B of the deal. Sales picks the pages in the deal form
// (contracts/src/pages/sales/SpecPagePicker.jsx) and only those pages are uploaded, so the stored file is
// already the appendix. Here every page gets a strip added under it (the page grows, nothing is covered)
// that names it as Appendix B and says the hours in it are estimates. The strip text is drawn with
// jsPDF, which lays out Hebrew, and placed on the spec page with pdf-lib.
import { createHash } from "node:crypto";
import { jsPDF } from "jspdf";
import { PDFDocument, rgb } from "pdf-lib";
import { query } from "./db.js";
import { loadFonts, RTL_OPTIONS, rtlText } from "./sign-pdf.js";

export const HOURS_NOTE = "הערכת השעות באפיון היא אומדן משוער בלבד, לתכנון העבודה. המחיר קבוע וסגור ואינו תלוי בשעות העבודה בפועל (סעיף 1 להסכם).";

export async function specFile(id) {
  if (!id) return null;
  const { rows } = await query("SELECT name, content_type, data FROM sign.files WHERE id = $1", [id]);
  return rows[0]?.content_type === "application/pdf" ? rows[0] : null;
}

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// one strip per page, as its own little PDF page the width of that spec page
function strips(sizes, { label, pages, pageCount }) {
  const { regular, bold } = loadFonts();
  let pdf = null;
  sizes.forEach(({ w, h }, i) => {
    const page = [w, h];
    if (!pdf) {
      pdf = new jsPDF({ orientation: w > h ? "l" : "p", unit: "pt", format: page, compress: true });
      pdf.addFileToVFS("Heebo-Regular.ttf", regular);
      pdf.addFont("Heebo-Regular.ttf", "Heebo", "normal");
      pdf.addFileToVFS("Heebo-Bold.ttf", bold);
      pdf.addFont("Heebo-Bold.ttf", "Heebo", "bold");
    } else pdf.addPage(page, w > h ? "l" : "p");
    const size = Math.max(7, Math.min(11, w / 70));
    const pad = size * 1.6;
    pdf.setFillColor(248, 247, 244);
    pdf.rect(0, 0, w, h, "F");
    pdf.setDrawColor(209, 213, 219);
    pdf.line(0, 0.5, w, 0.5);
    pdf.setTextColor(31, 41, 55);
    pdf.setFont("Heebo", "bold");
    pdf.setFontSize(size);
    // the page's number in the original Canva file when known (sales picked pages 1 and 9 of 9)
    const of = pages?.length === sizes.length && pageCount ? `עמוד ${pages[i]} מתוך ${pageCount} באפיון` : `עמוד ${i + 1} מתוך ${sizes.length}`;
    pdf.text(rtlText(`${label} · ${of}`), w - pad, h / 2 - size * 0.15, { align: "right", ...RTL_OPTIONS });
    pdf.setFont("Heebo", "normal");
    pdf.setFontSize(size * 0.92);
    pdf.setTextColor(75, 85, 99);
    const note = pdf.splitTextToSize(HOURS_NOTE, w - 2 * pad)[0];
    pdf.text(rtlText(note), w - pad, h / 2 + size * 1.15, { align: "right", ...RTL_OPTIONS });
  });
  return pdf.output("arraybuffer");
}

/** the stored spec (only the picked pages) -> the same pages with the Appendix B strip under each, as pdf-lib pages in `out` */
async function stampedPages(out, specBytes, { label, pages: numbers, pageCount }) {
  const src = await PDFDocument.load(specBytes, { ignoreEncryption: true });
  const pages = await out.copyPages(src, src.getPageIndices());
  const boxes = pages.map((p) => p.getMediaBox());
  const stripH = boxes.map((b) => Math.round(Math.max(30, Math.min(56, b.width / 26))));
  const stripDoc = await PDFDocument.load(strips(boxes.map((b, i) => ({ w: b.width, h: stripH[i] })), { label, pages: numbers, pageCount }));
  const embedded = await out.embedPdf(stripDoc, stripDoc.getPageIndices());
  pages.forEach((p, i) => {
    const b = boxes[i];
    const s = stripH[i];
    // grow the page downward by the strip, so the strip never covers the spec's own content
    p.setMediaBox(b.x, b.y - s, b.width, b.height + s);
    p.setCropBox(b.x, b.y - s, b.width, b.height + s);
    p.drawRectangle({ x: b.x, y: b.y - s, width: b.width, height: s, color: rgb(1, 1, 1) });
    p.drawPage(embedded[i], { x: b.x, y: b.y - s, width: b.width, height: s });
  });
  return pages;
}

/** the spec alone, stamped: what the client opens from the deal page. pages/pageCount: see deal.js specPages */
export async function stampedSpecPdf(specBytes, { number, pages, pageCount }) {
  const out = await PDFDocument.create();
  for (const p of await stampedPages(out, specBytes, { label: `נספח ב' להזמנה מס' ${number} · האפיון המאושר`, pages, pageCount })) out.addPage(p);
  return Buffer.from(await out.save());
}

/** the deal PDF (jsPDF) + the spec pages inserted after page `afterPage` (1-based) */
export async function insertSpec(dealPdf, specBytes, { afterPage, number, pages: numbers, pageCount }) {
  const out = await PDFDocument.load(dealPdf);
  const pages = await stampedPages(out, specBytes, { label: `נספח ב' להזמנה מס' ${number} · האפיון המאושר`, pages: numbers, pageCount });
  pages.forEach((p, i) => out.insertPage(afterPage + i, p));
  return Buffer.from(await out.save());
}

export async function specPageCount(specBytes) {
  return (await PDFDocument.load(specBytes, { ignoreEncryption: true })).getPageCount();
}
