// The signed deal as one PDF: work order with the payment schedule, the general terms, Appendix A,
// both signatures, Appendix B (the approved spec pages, api/_lib/spec-pdf.js) and a last page that records how and when each step was approved (name, email,
// IP, browser, time, hash). Rendered from the deal's snapshot, so it shows exactly what was signed.
import { jsPDF } from "jspdf";
import { query } from "./db.js";
import { HEBREW_RE, loadFonts, RTL_OPTIONS, rtlText } from "./sign-pdf.js";
import { payInstructions } from "./deal.js";
import { PAYMENT_METHODS } from "./sales-calc.js";
import { HOURS_NOTE, insertSpec, specFile } from "./spec-pdf.js";

const nis = (n) => `${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} ₪`;
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const ilTime = (d) => new Date(d).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "medium" });

async function fileDataUrl(id) {
  if (!id) return null;
  const { rows } = await query("SELECT content_type, data FROM sign.files WHERE id = $1", [id]);
  return rows[0] ? `data:${rows[0].content_type};base64,${rows[0].data.toString("base64")}` : null;
}

function writer(meta) {
  const { regular, bold } = loadFonts();
  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4", compress: true });
  pdf.addFileToVFS("Heebo-Regular.ttf", regular);
  pdf.addFont("Heebo-Regular.ttf", "Heebo", "normal");
  pdf.addFileToVFS("Heebo-Bold.ttf", bold);
  pdf.addFont("Heebo-Bold.ttf", "Heebo", "bold");
  pdf.setFont("Heebo");
  pdf.setProperties({ title: meta.title, subject: meta.subject, creator: "Pro Algorithm" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 46;
  const R = W - M;
  let y = M;

  const header = () => {
    pdf.setFont("Heebo", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(107, 114, 128);
    pdf.text(rtlText(meta.header), R, 26, { align: "right", ...RTL_OPTIONS });
    pdf.setDrawColor(229, 231, 235);
    pdf.line(M, 32, R, 32);
  };
  const newPage = () => { pdf.addPage(); y = M; header(); };
  const space = (h) => { if (y + h > H - M) newPage(); };
  header();

  const text = (s, o = {}) => {
    const size = o.size || 10;
    const lh = size * (o.lh || 1.45);
    pdf.setFont("Heebo", o.bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...(o.color || [31, 41, 55]));
    const right = R - (o.indent || 0);
    const width = (o.width || R - M) - (o.indent || 0);
    for (const raw of String(s ?? "").split("\n")) {
      for (const line of pdf.splitTextToSize(raw, width)) {
        space(lh);
        const x = o.align === "center" ? W / 2 : o.align === "left" ? M : right;
        const rtl = HEBREW_RE.test(line);
        pdf.text(rtl ? rtlText(line) : line, x, y + size, rtl ? { align: o.align || "right", ...RTL_OPTIONS } : { align: o.align || "right" });
        y += lh;
      }
    }
    y += o.after ?? 2;
  };
  const gap = (h) => { y += h; };
  const rule = () => { space(10); pdf.setDrawColor(229, 231, 235); pdf.line(M, y + 4, R, y + 4); y += 12; };

  // right-to-left table: columns given right to left with widths in pt
  const table = (cols, rows, o = {}) => {
    const size = o.size || 9;
    const pad = 4;
    const drawRow = (cells, isHead) => {
      pdf.setFont("Heebo", isHead ? "bold" : "normal");
      pdf.setFontSize(size);
      const lines = cells.map((c, i) => pdf.splitTextToSize(String(c ?? ""), cols[i] - 2 * pad));
      const h = Math.max(...lines.map((l) => l.length)) * size * 1.35 + 2 * pad;
      space(h);
      if (isHead) { pdf.setFillColor(243, 244, 246); pdf.rect(M, y, R - M, h, "F"); }
      let x = R;
      lines.forEach((ls, i) => {
        pdf.setTextColor(31, 41, 55);
        ls.forEach((ln, j) => {
          const rtl = HEBREW_RE.test(ln);
          pdf.text(rtl ? rtlText(ln) : ln, x - pad, y + pad + size + j * size * 1.35, rtl ? { align: "right", ...RTL_OPTIONS } : { align: "right" });
        });
        x -= cols[i];
      });
      pdf.setDrawColor(229, 231, 235);
      pdf.line(M, y + h, R, y + h);
      y += h;
    };
    if (o.head) drawRow(o.head, true);
    rows.forEach((r) => drawRow(r, false));
    y += 8;
  };

  const image = (dataUrl, w, h, { side = "right" } = {}) => {
    if (!dataUrl) return;
    space(h + 4);
    try { pdf.addImage(dataUrl, "PNG", side === "right" ? R - w : M, y, w, h, undefined, "FAST"); } catch { /* skip */ }
    y += h + 4;
  };

  return { pdf, text, gap, rule, table, image, newPage, space, get y() { return y; }, R, M };
}

/** snapshot: deal.snapshot (order, agreement, client, approval, signature, spec) -> Buffer.
 *  specBytes: the spec file, when already at hand (otherwise read from sign.files) */
export async function generateDealPdf(snapshot, { specBytes } = {}) {
  const { order, agreement, approval, signature } = snapshot;
  const w = writer({
    title: `הזמנת עבודה ${order.number} · ${order.project.name}`,
    subject: `hash ${snapshot.hash || ""}`,
    header: `${order.company.name} · ${order.company.address} · ${order.company.phone} · ${order.company.website}`,
  });
  const c = order.client;

  // ---- Work order ----
  w.text(`הזמנת עבודה | ${order.project.name}`, { size: 18, bold: true, after: 4 });
  w.text(`${order.company.name} · עבור: ${c.companyName || c.signerName} · הזמנה מס' ${order.number} · ${dmy(order.date)}`, { size: 10, color: [107, 114, 128], after: 10 });
  w.text("מה מפתחים", { size: 12, bold: true });
  w.text(order.project.summary || "", { after: 6 });
  if (order.project.specName) w.text(`האפיון המאושר: ${order.project.specName}${order.project.specVersion ? ` · גרסה ${order.project.specVersion}` : ""}${order.project.specDate ? ` · מיום ${dmy(order.project.specDate)}` : ""}${snapshot.spec ? " · מצורף כנספח ב'" : ""}`, { after: snapshot.spec ? 2 : 8 });
  if (snapshot.spec) w.text(HOURS_NOTE, { size: 9.5, color: [107, 114, 128], after: 8 });
  w.text("מחיר ותנאי תשלום", { size: 12, bold: true });
  const off = order.price.listAmount ? ` אחרי הנחה של ${nis(order.price.discount)} ממחיר של ${nis(order.price.listAmount)}` : "";
  w.text(`מחיר הפרויקט: ${nis(order.price.amount)} לפני מע"מ${off} (${nis(order.price.total)} כולל מע"מ). המחיר קבוע וסגור לתכולה שבאפיון המאושר.`);
  const how = payInstructions(order);
  w.text(how
    ? "התשלומים משולמים בתאריכים ובאמצעי התשלום הקבועים בטבלה, ואינם תלויים באבני דרך. הראשון הוא המקדמה."
    : `מקדמה של ${order.price.depositPercent}% משולמת בתוך 3 ימי עסקים מהאישור. היתרה משולמת בתאריכים הקבועים בטבלה, ואינם תלויים באבני דרך. אמצעי תשלום היתרה: ${order.balanceMethod === "checks" ? "שיקים דחויים" : "העברה בנקאית"}.`, { after: 6 });
  w.table([26, 145, 76, 85, 80, 91],
    order.schedule.rows.map((r) => [r.n, `${r.kind === "deposit" ? "מקדמה · " : ""}${dmy(r.date)}${r.dateNote ? ` · ${r.dateNote}` : ""}`, PAYMENT_METHODS[r.method] || "", nis(r.before), nis(r.vat), nis(r.total)])
      .concat([["", "סה\"כ", "", nis(order.schedule.totals.before), nis(order.schedule.totals.vat), nis(order.schedule.totals.total)]]),
    { head: ["#", "מועד", "אמצעי תשלום", "לפני מע\"מ", "מע\"מ", "כולל מע\"מ"] });
  for (const l of how || []) w.text(l, { size: 9.5 });
  if (order.service?.enabled && order.service.rows.length) {
    w.text("שירות חודשי", { size: 12, bold: true });
    w.table([170, 170, 163], order.service.rows.map((r) => [r.label, r.when, r.price ? `${nis(r.price)} + מע"מ (${nis(r.priceWithVat)})` : "כלול"]), { head: ["תקופה", "מתי", "לחודש"] });
  }
  w.text("תחילת עבודה ויעד פיתוח משוער", { size: 12, bold: true });
  w.text(`העבודה מתחילה לאחר קבלת המקדמה בפועל וקבלת החומרים והגישות שסוכמו לפתיחת הפרויקט.${order.project.targetWeeks ? ` יעד פיתוח משוער: ${order.project.targetWeeks} שבועות מתחילת העבודה.` : ""}`);
  w.text("המערכת תימסר לשימוש שוטף לאחר השלמת בדיקות הקבלה ופירעון מלוא התשלום.");
  if (order.project.kickoffNeeds) w.text(`לפתיחת העבודה נצטרך: ${order.project.kickoffNeeds}`);
  w.text("הזמנת העבודה, האפיון המאושר והתנאים הכלליים המצורפים מהווים יחד את הסכם ההתקשרות.", { color: [107, 114, 128], after: 4 });

  // ---- General terms ----
  w.newPage();
  w.text(agreement.title, { size: 16, bold: true, align: "center", after: 2 });
  w.text(agreement.subtitle, { size: 10, color: [107, 114, 128], align: "center", after: 10 });
  w.text("הצדדים", { size: 11, bold: true });
  w.text(`בין: ${agreement.parties.company}`);
  w.text(`לבין: ${agreement.parties.client}`, { after: 8 });
  for (const r of agreement.recitals) w.text(r, { after: 4 });
  for (const s of agreement.sections) {
    w.gap(4);
    w.text(`${s.n}. ${s.title}`, { size: 11, bold: true });
    for (const cl of s.clauses) {
      w.text(`${cl.n}  ${cl.text}`, { size: 9.5 });
      for (const sub of cl.sub) w.text(`(${sub.n}) ${sub.text}`, { size: 9.5, indent: 16 });
    }
  }

  // ---- The order details: Appendix A up to agreement v2; from v3 part of the agreement itself, signed with it ----
  const ap = agreement.appendix;
  const appendixA = ["v1", "v2"].includes(agreement.version);
  // an appendix starts its own page; the details of v3 carry on right after the last clause
  if (appendixA) w.newPage(); else w.gap(14);
  if (appendixA) {
    w.text(`נספח א' – נספח הזמנה מס' ${order.number}`, { size: 14, bold: true, after: 2 });
    w.text(`פרויקט במחיר קבוע · מצורף להסכם המסגרת בין ${order.company.name} לבין ${c.companyName || c.signerName}`, { size: 9.5, color: [107, 114, 128], after: 8 });
  } else {
    w.text(`פרטי ההזמנה – הזמנה מס' ${order.number}`, { size: 14, bold: true, after: 2 });
    w.text("פרויקט במחיר קבוע · חלק בלתי נפרד מההסכם", { size: 9.5, color: [107, 114, 128], after: 8 });
  }
  w.text("א. אנשי קשר", { size: 11, bold: true });
  w.table([200, 303], ap.contacts);
  w.text("ב. תכולה", { size: 11, bold: true });
  w.table([200, 303], ap.scope);
  if (ap.stages.length) {
    w.text("ג. שלבים ובדיקות קבלה (סעיף 7 להסכם)", { size: 11, bold: true });
    w.table([30, 110, 110, 150, 103], ap.stages.map((s, i) => [String(i + 1).padStart(2, "0"), s.deliverable || s.name, s.testFiles, s.criteria, s.target]),
      { head: ["שלב", "תוצר", "קובצי בדיקה וגרסאות", "קריטריונים ופלט מצופה", "מועד יעד משוער"], size: 8.5 });
  }
  w.text(`תקופת בדיקה: ${ap.testPeriodDays} ימי עסקים.`);
  w.text("ד. תשלום (סעיפים 5 ו-9 להסכם)", { size: 11, bold: true });
  const rates = ap.hourlyRates || (ap.hourlyRate ? [{ role: "", rate: ap.hourlyRate }] : []);
  if (rates.length) w.text(`תעריפי שעה – לחישוב שווי העבודה בביטול (סעיף 9.2) ולתמחור שינויים (סעיף 8), לא כולל מע"מ: ${rates.map((r) => `${r.role ? `${r.role} ` : ""}${nis(r.rate)}`).join(" · ")}`);
  if (how) w.text("התשלומים, מועדיהם ואמצעי התשלום של כל אחד: לפי לוח התשלומים שבהזמנת העבודה.");
  else w.text(`אמצעי תשלום היתרה: ${ap.balanceMethod === "checks" ? "שיקים דחויים" : "העברות בנקאיות"}.${ap.bankAccount && ap.balanceMethod !== "checks" ? ` חשבון הבנק של החברה: ${ap.bankAccount}.` : ""}`);
  if (order.service?.enabled) {
    w.text("ה. שירות חודשי (סעיף 6 להסכם)", { size: 11, bold: true });
    if (ap.serviceComponents?.length) w.text(`רכיבי השירות: ${ap.serviceComponents.join(", ")}.`);
    if (ap.liabilityCapIncluded) w.text(`תקרת אחריות עד תחילת החיוב החודשי (סעיף 12.3): ${nis(ap.liabilityCapIncluded)}`);
  }
  w.text("ו. הפעלה ורישיון", { size: 11, bold: true });
  w.table([200, 303], ap.operation);
  if (appendixA) w.text("חתימת הצדדים על נספח זה מהווה אישור מחייב להזמנת העבודה, לאפיון המאושר ולתנאים המפורטים בנספח.", { color: [107, 114, 128] });

  // ---- Signatures ----
  w.gap(10);
  w.space(190);
  w.text("ולראיה באו הצדדים על החתום", { size: 11, bold: true, after: 8 });
  const cs = agreement.companySigner;
  w.text(`החברה: ${order.company.name}${cs.name ? ` · ${cs.name}${cs.role ? `, ${cs.role}` : ""}` : ""}`, { bold: true });
  if (snapshot.companySignature) w.image(snapshot.companySignature, 150, 52);
  w.text(`תאריך: ${dmy(String(signature.at).slice(0, 10))}`, { color: [107, 114, 128], after: 10 });
  w.text(`הלקוח: ${c.companyName || ""} · ${signature.name}${signature.role ? `, ${signature.role}` : ""}${signature.idNumber ? ` · ת.ז ${signature.idNumber}` : ""}`, { bold: true });
  w.image(await fileDataUrl(signature.fileId), 180, 63);
  w.text(`תאריך: ${dmy(String(signature.at).slice(0, 10))}`, { color: [107, 114, 128] });

  // ---- Appendix B: the approved spec (its pages are inserted after this page) ----
  const spec = snapshot.spec;
  let specAfter = 0;
  if (spec) {
    w.newPage();
    w.text(`נספח ב' – האפיון המאושר`, { size: 14, bold: true, after: 2 });
    w.text(`מצורף להזמנה מס' ${order.number}${order.project.specName ? ` · ${order.project.specName}` : ""}${order.project.specVersion ? ` · גרסה ${order.project.specVersion}` : ""}${order.project.specDate ? ` · מיום ${dmy(order.project.specDate)}` : ""}`, { size: 9.5, color: [107, 114, 128], after: 10 });
    w.text(spec.pages?.length && spec.pageCount
      ? `בעמודים הבאים: ${spec.pages.length === 1 ? "עמוד" : "עמודים"} ${spec.pages.join(", ")} מתוך ${spec.pageCount} עמודי האפיון.`
      : "בעמודים הבאים: מסמך האפיון.", { after: 8 });
    w.text("הערכת שעות משוערת", { size: 12, bold: true });
    w.text(HOURS_NOTE, { size: 10.5, after: 4 });
    w.text(`שעות פיתוח מעבר לאומדן כלולות בתמורה הקבועה ולא יחויבו ללקוח. תעריפי השעה ש${appendixA ? "בנספח א'" : "בפרטי ההזמנה"} משמשים רק לחישוב שווי העבודה בביטול ולתמחור שינויים.`, { size: 9.5, color: [107, 114, 128] });
    specAfter = w.pdf.getNumberOfPages();
  }

  // ---- Verification ----
  w.newPage();
  w.text("דף אימות חתימה", { size: 14, bold: true, after: 8 });
  const rec = (title, x) => {
    w.text(title, { size: 11, bold: true });
    w.table([170, 333], [
      ["שם", x.name || "—"], ["תפקיד", x.role || "—"], ...(x.idNumber ? [["ת.ז", x.idNumber]] : []), ["אימייל", x.email || "—"],
      ["מועד (שעון ישראל)", ilTime(x.at)], ["מועד (UTC)", new Date(x.at).toISOString()],
      ["כתובת IP", x.ip || "—"], ["דפדפן", x.userAgent || "—"],
    ], { size: 8.5 });
  };
  rec("שלב 1 · אישור הזמנת העבודה ולוח התשלומים", approval);
  rec("שלב 2 · חתימה על ההסכם", signature);
  w.text(`גרסת התנאים הכלליים: ${agreement.version} · הזמנה מס' ${order.number}`, { size: 9 });
  w.text(`גיבוב המסמך (SHA-256) של כל מה שנחתם: ${snapshot.hash}`, { size: 8.5, color: [107, 114, 128] });
  if (spec?.sha256) w.text(`גיבוב קובץ האפיון שבנספח ב' (SHA-256): ${spec.sha256}`, { size: 8.5, color: [107, 114, 128] });

  const out = Buffer.from(w.pdf.output("arraybuffer"));
  const bytes = spec && (specBytes || (await specFile(spec.fileId))?.data);
  return bytes ? insertSpec(out, bytes, { afterPage: specAfter, number: order.number, pages: spec.pages, pageCount: spec.pageCount }) : out;
}

/** An appendix signed after the agreement (sales.deal_appendices.snapshot) -> Buffer. The agreement's
 *  own PDF is never touched: this one refers to it by its date and hash. */
export async function generateAppendixPdf(s) {
  const a = s.appendix;
  const w = writer({
    title: `נספח ${a.n} להזמנה ${s.number} · ${s.project}`,
    subject: `hash ${s.hash || ""}`,
    header: `${s.company.name} · ${s.company.address || ""} · ${s.company.phone || ""} · ${s.company.website || ""}`,
  });
  const c = s.client;
  w.text(`נספח מס' ${a.n} להסכם ההתקשרות – ${a.title}`, { size: 16, bold: true, after: 4 });
  w.text(`${s.company.name} · עבור: ${c.companyName || c.signerName} · הזמנה מס' ${s.number} · ${s.project}`, { size: 10, color: [107, 114, 128], after: 10 });
  w.text(`נספח זה מצורף להסכם ההתקשרות בין ${s.company.name} לבין ${c.companyName || c.signerName}${s.parent.signedOn ? ` שנחתם ביום ${dmy(s.parent.signedOn)}` : ""}, ומהווה חלק בלתי נפרד ממנו. בכל סתירה בין נספח זה להסכם, יגברו הוראות נספח זה. יתר הוראות ההסכם נותרות בתוקפן ללא שינוי.`, { after: 8 });
  w.text(a.body, { after: 8 });
  if (a.payments.length) {
    w.text("תשלומים נוספים לפי נספח זה", { size: 12, bold: true });
    w.table([26, 160, 85, 80, 70, 82],
      a.payments.map((p, i) => [i + 1, dmy(p.date), PAYMENT_METHODS[p.method] || "", nis(p.amount), nis(p.vat), nis(p.total)])
        .concat([["", "סה\"כ", "", nis(a.totals.amount), nis(a.totals.vat), nis(a.totals.total)]]),
      { head: ["#", "מועד", "אמצעי תשלום", "לפני מע\"מ", "מע\"מ", "כולל מע\"מ"] });
    w.text("תשלומים אלה מתווספים ללוח התשלומים שבהזמנת העבודה, ואינם משנים אותו.", { size: 9.5, color: [107, 114, 128] });
  }

  w.gap(10);
  w.space(190);
  w.text("ולראיה באו הצדדים על החתום", { size: 11, bold: true, after: 8 });
  const cs = s.companySigner || {};
  const on = dmy(String(s.signature.at).slice(0, 10));
  w.text(`החברה: ${s.company.name}${cs.name ? ` · ${cs.name}${cs.role ? `, ${cs.role}` : ""}` : ""}`, { bold: true });
  if (s.companySignature) w.image(s.companySignature, 150, 52);
  w.text(`תאריך: ${on}`, { color: [107, 114, 128], after: 10 });
  w.text(`הלקוח: ${c.companyName || ""} · ${s.signature.name}${s.signature.role ? `, ${s.signature.role}` : ""}${s.signature.idNumber ? ` · ת.ז ${s.signature.idNumber}` : ""}`, { bold: true });
  w.image(await fileDataUrl(s.signature.fileId), 180, 63);
  w.text(`תאריך: ${on}`, { color: [107, 114, 128] });

  w.newPage();
  w.text("דף אימות חתימה", { size: 14, bold: true, after: 8 });
  const x = s.signature;
  w.table([170, 333], [
    ["שם", x.name || "—"], ["תפקיד", x.role || "—"], ...(x.idNumber ? [["ת.ז", x.idNumber]] : []), ["אימייל", x.email || "—"],
    ["מועד (שעון ישראל)", ilTime(x.at)], ["מועד (UTC)", new Date(x.at).toISOString()],
    ["כתובת IP", x.ip || "—"], ["דפדפן", x.userAgent || "—"],
  ], { size: 8.5 });
  w.text(`נספח מס' ${a.n} · הזמנה מס' ${s.number}`, { size: 9 });
  if (s.parent.hash) w.text(`גיבוב (SHA-256) של ההסכם המקורי: ${s.parent.hash}`, { size: 8.5, color: [107, 114, 128] });
  w.text(`גיבוב הנספח (SHA-256) של כל מה שנחתם: ${s.hash}`, { size: 8.5, color: [107, 114, 128] });
  return Buffer.from(w.pdf.output("arraybuffer"));
}
