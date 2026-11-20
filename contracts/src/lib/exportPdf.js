import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// מייצא אלמנט DOM לקובץ PDF מרובה עמודים בגודל A4 — מפצל בין עמודים רק בגבולות
// שבין בלוקים, כדי שבלוק לא יחתך באמצע. בלוק שגדול מעמוד שלם נחתך כמפולט.
export async function exportElementToPdf(el, filename = "document.pdf") {
  // המתנה לטעינת גופנים ותמונות — כדי שכל הפריטים ייכנסו ל-PDF
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(
    Array.from(el.querySelectorAll("img")).map((img) =>
      img.complete ? null : new Promise((res) => { img.onload = res; img.onerror = res; })
    )
  );

  const scale = 2;
  const canvas = await html2canvas(el, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    // רוחב חלון וירטואלי רחב מספיק כדי שהמסמך (800px) לא יצומצם במסכים צרים
    windowWidth: Math.max(window.innerWidth, el.scrollWidth + 40),
    scrollX: 0,
    scrollY: 0,
  });

  const pdf = new jsPDF("p", "pt", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const ptPerPx = pageW / canvas.width;
  const pageHeightPx = pageH / ptPerPx;

  // האלמנט המכיל את הבלוקים בפועל (docRef עוטף את מסמך ה-SignedDocument)
  const contentEl = el.children.length === 1 ? el.children[0] : el;
  const elRect = el.getBoundingClientRect();
  const boundaries = Array.from(contentEl.children)
    .map((child) => {
      const r = child.getBoundingClientRect();
      return { top: (r.top - elRect.top) * scale, bottom: (r.bottom - elRect.top) * scale };
    })
    .filter((b) => b.bottom > b.top);

  // בונה רשימת נקודות חיתוך שלא נופלות באמצע בלוק
  const totalHeightPx = canvas.height;
  const breaks = [0];
  let cursor = 0;
  while (cursor < totalHeightPx - 1) {
    let next = cursor + pageHeightPx;
    if (next >= totalHeightPx) {
      breaks.push(totalHeightPx);
      break;
    }
    const straddling = boundaries.find((b) => b.top < next && b.bottom > next && b.bottom - b.top <= pageHeightPx);
    if (straddling) next = straddling.top;
    if (next <= cursor) next = cursor + pageHeightPx; // בלוק גדול מעמוד שלם — חיתוך מפולט
    breaks.push(next);
    cursor = next;
  }

  for (let i = 0; i < breaks.length - 1; i++) {
    const sliceTop = breaks[i];
    const sliceHeightPx = Math.max(0, breaks[i + 1] - sliceTop);
    if (sliceHeightPx <= 0) continue;

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    const ctx = pageCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, sliceTop, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

    const imgData = pageCanvas.toDataURL("image/jpeg", 0.95);
    const imgH = sliceHeightPx * ptPerPx;
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pageW, imgH);
  }

  pdf.save(filename);
}