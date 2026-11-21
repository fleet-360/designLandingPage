// Appendix B: the spec pages sales picked are stamped and inserted into the signed deal PDF.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";
import { insertSpec, stampedSpecPdf } from "../api/_lib/spec-pdf.js";
import { generateDealPdf } from "../api/_lib/deal-pdf.js";
import { buildAgreement, buildOrder, cleanDealData, cleanClient } from "../api/_lib/deal.js";
import { DEFAULT_SETTINGS } from "../api/_lib/sales.js";
import { pickSpecPages } from "../api/_lib/ai-spec-pages.js";

// a spec like Canva exports: landscape slides
function fakeSpec(pages = 2, [w, h] = [960, 540]) {
  const pdf = new jsPDF({ orientation: "l", unit: "pt", format: [w, h] });
  for (let i = 0; i < pages; i++) {
    if (i) pdf.addPage([w, h], "l");
    pdf.setFillColor(30, 40, 90);
    pdf.rect(0, h - 40, w, 40, "F"); // content right at the bottom edge, which the strip must not cover
    pdf.setFontSize(40);
    pdf.text(`Spec page ${i + 1}`, 40, 80);
  }
  return Buffer.from(pdf.output("arraybuffer"));
}

test("the stamped spec keeps every page and grows each one by the strip", async () => {
  const spec = fakeSpec(2);
  const out = await PDFDocument.load(await stampedSpecPdf(spec, { number: "1042" }));
  assert.equal(out.getPageCount(), 2);
  for (const p of out.getPages()) {
    const b = p.getMediaBox();
    assert.equal(b.width, 960);
    assert.ok(b.height > 540 && b.height < 620, `height ${b.height}`);
    assert.ok(b.y < 0, "the strip is added below the original page");
  }
});

test("the spec pages go in after the given page", async () => {
  const main = new jsPDF({ unit: "pt", format: "a4" });
  for (let i = 0; i < 3; i++) main.addPage();
  const merged = await PDFDocument.load(await insertSpec(Buffer.from(main.output("arraybuffer")), fakeSpec(2), { afterPage: 3, number: "1" }));
  assert.equal(merged.getPageCount(), 6);
  const widths = merged.getPages().map((p) => Math.round(p.getMediaBox().width));
  assert.deepEqual(widths, [595, 595, 595, 960, 960, 595]);
});

test("the signed deal PDF carries Appendix B before the verification page", async () => {
  const settings = { ...DEFAULT_SETTINGS };
  const deal = {
    number: "1042",
    client: cleanClient({ companyName: "חברה לדוגמה בע\"מ", signerName: "ישראל ישראלי", email: "a@b.co" }),
    data: cleanDealData({
      project: { name: "מערכת לדוגמה", summary: "תיאור קצר", specName: "אפיון", specFileId: "00000000-0000-0000-0000-000000000000", specPages: [1, 9], specPageCount: 9 },
      price: { amount: 10000, payments: [{ date: "2026-12-01", amount: 10000, method: "transfer" }] },
      service: { enabled: false },
    }, settings),
  };
  const order = buildOrder(deal, settings, "2026-11-21");
  const at = new Date("2026-11-21T10:00:00Z").toISOString();
  const snapshot = {
    order, agreement: buildAgreement(deal, settings), client: deal.client,
    approval: { name: "ישראל ישראלי", at }, signature: { name: "ישראל ישראלי", at, fileId: null },
    spec: { fileId: deal.data.project.specFileId, pages: [1, 9], pageCount: 9, sha256: "ab".repeat(32) }, hash: "cd".repeat(32),
  };
  const without = await PDFDocument.load(await generateDealPdf({ ...snapshot, spec: null }));
  const pdf = await generateDealPdf(snapshot, { specBytes: fakeSpec(2) });
  if (process.env.SPEC_PDF_OUT) fs.writeFileSync(process.env.SPEC_PDF_OUT, pdf);
  const doc = await PDFDocument.load(pdf);
  // + the Appendix B cover page + the two spec pages
  assert.equal(doc.getPageCount(), without.getPageCount() + 3);
  const widths = doc.getPages().map((p) => Math.round(p.getMediaBox().width));
  assert.deepEqual(widths.slice(-3), [960, 960, 595], "spec pages, then the verification page last");
});

test("without an AI key the pick is the first and the last page", async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const r = await pickSpecPages(Array.from({ length: 7 }, (_, i) => ({ n: i + 1, text: `page ${i + 1}` })));
    assert.deepEqual(r.pages, [1, 7]);
    assert.equal(r.source, "default");
    assert.deepEqual((await pickSpecPages([{ n: 1, text: "x" }])).pages, [1]);
  } finally {
    if (key !== undefined) process.env.ANTHROPIC_API_KEY = key;
  }
});
