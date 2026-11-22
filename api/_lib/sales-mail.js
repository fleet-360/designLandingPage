// Emails of the sales system (queued with sales.js sendMail, sent by Toro from info@pro-algo.com).
// Hebrew, RTL, inline styles (mail clients ignore <style>). Every value from a person is escaped.

import { payInstructions } from "./deal.js";
import { PAYMENT_METHODS } from "./sales-calc.js";

// the colors of the client pages: a mint header, tomato buttons, cream around, coffee ink
const BRAND = "#9ED9C3";
const ACCENT = "#E0432F";
const MAIL_FONT = "Rubik,Heebo,Arial,sans-serif";
const MAIL_FONT_LINK = '<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">';

export const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const nis = (n) => `₪\u00a0${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const ddmmyyyy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
export const israelDateTime = (d) =>
  new Date(d).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function layout({ preheader = "", title, body, button, footer = "" }) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">${MAIL_FONT_LINK}</head><body style="margin:0;background:#F4ECD6;">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4ECD6;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFF9EC;border-radius:18px;overflow:hidden;font-family:${MAIL_FONT};color:#3A2418;direction:rtl;text-align:right;">
<tr><td style="background:${BRAND};padding:22px 28px;">
<img src="https://www.pro-algo.com/pay-assets/all-dark-logo.png" alt="Pro Algorithm" width="150" style="display:block;width:150px;height:auto;border:0;">
</td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.35;color:#3A2418;font-weight:900;">${title}</h1>
<div style="font-size:16px;line-height:1.65;">${body}</div>
${button ? `<p style="margin:26px 0 8px;"><a href="${esc(button.href)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:12px;font-size:17px;">${esc(button.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px 26px;color:#6A4330;font-size:13px;line-height:1.6;border-top:2px dashed #E3D6B8;">
${footer || 'פרו אלגוריתם בע"מ · pro-algo.com'}
</td></tr>
</table></td></tr></table></body></html>`;
}

const table = (rows) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:12px 0;font-size:15px;">
${rows.map((r, i) => `<tr style="background:${i % 2 ? "#FFF9EC" : "#F4ECD6"}">${r.map((c) => `<td style="padding:8px 10px;border-bottom:1px solid #E3D6B8;">${c}</td>`).join("")}</tr>`).join("")}
</table>`;

// ---------------- Deals ----------------

// the key lines sales chose (a spec request or a deal): the headline and its lines, for the top of an email
function pitchHtml(pitch, { ink = "#3A2418", mark = "#E0432F" } = {}) {
  if (!pitch || !(pitch.headline || pitch.lines?.length)) return "";
  const lines = (pitch.lines || []).map((l) => `<tr><td width="26" style="vertical-align:top;padding:4px 0;color:${mark};font-size:16px;font-weight:900;">✓</td><td style="padding:4px 0;font-size:15.5px;line-height:1.55;color:${ink};">${esc(l)}</td></tr>`).join("");
  return `${pitch.headline ? `<div style="font-size:19px;font-weight:800;line-height:1.45;color:${ink};margin:0 0 6px;">${esc(pitch.headline)}</div>` : ""}${lines ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;">${lines}</table>` : ""}`;
}

export function dealInviteMail(deal, settings, url) {
  const c = deal.client;
  const project = deal.data.project?.name || "הפרויקט";
  return {
    to: [c.email],
    replyTo: settings.officeEmail,
    subject: `הזמנת העבודה ל${project} מוכנה לאישור`,
    html: layout({
      preheader: "כל פרטי ההזמנה, התשלומים וההסכם במקום אחד",
      title: `${esc(c.signerName || c.companyName || "שלום")}, הזמנת העבודה מוכנה`,
      body: `${pitchHtml(deal.pitch)}<p style="margin:0 0 10px;">ריכזנו בעמוד אחד את מה שסיכמנו על <strong>${esc(project)}</strong>: מה מפתחים, כמה זה עולה ומתי משלמים.</p>
<p style="margin:0;">אחרי האישור תעברו לחתימה על ההסכם, ובסוף להגדרת אמצעי התשלום לשירות החודשי. אפשר לעצור בכל שלב ולחזור דרך אותו קישור.</p>`,
      button: { href: url, label: "לצפייה ואישור" },
      footer: `הזמנה מס' ${deal.number} · ${esc(settings.company.name)} · ${esc(settings.company.phone)}`,
    }),
  };
}

// the payment schedule table and how to pay it, shared by the accounting email and the order confirmation
const scheduleRows = (s) => [["<strong>#</strong>", "<strong>מועד</strong>", "<strong>לפני מע\"מ</strong>", "<strong>כולל מע\"מ</strong>"],
  ...s.rows.map((r) => [r.n, `${r.kind === "deposit" ? "מקדמה · " : ""}${ddmmyyyy(r.date)}${r.method ? ` · ${esc(PAYMENT_METHODS[r.method] || "")}` : ""}${r.dateNote ? `<br><span style="color:#6B7280;font-size:13px">${esc(r.dateNote)}</span>` : ""}`, nis(r.before), nis(r.total)]),
  ["", "<strong>סה\"כ</strong>", `<strong>${nis(s.totals.before)}</strong>`, `<strong>${nis(s.totals.total)}</strong>`]];
function howToPay(order, settings, number) {
  const lines = payInstructions(order);
  if (lines) return lines.map((l) => { const [head, ...rest] = l.split(": "); return `<p><strong>${esc(head)}:</strong> ${esc(rest.join(": "))}</p>`; }).join("");
  const b = settings.bank;
  return order.balanceMethod === "checks"
    ? `<p><strong>שיקים דחויים:</strong> לפקודת ${esc(settings.checks.payee)}, שיק לכל תשלום לפי הטבלה. השיקים ייאספו בתוך ${esc(settings.checks.pickupDays)} ימי עסקים מהחתימה; נתאם איתכם את האיסוף.</p>`
    : `<p><strong>העברה בנקאית:</strong> מוטב ${esc(b.beneficiary)}${b.bank ? `, בנק ${esc(b.bank)}` : ""}${b.branch ? `, סניף ${esc(b.branch)}` : ""}${b.account ? `, חשבון ${esc(b.account)}` : ""}. אסמכתה: מספר הזמנה ${number}.</p>`;
}

export function dealAccountingMail(deal, snapshot, settings) {
  const rows = scheduleRows(snapshot.order.schedule);
  const how = howToPay(snapshot.order, settings, deal.number);
  const signedNote = deal.agreement_status === "signed" ? "" : `<p style="color:#B45309;"><strong>לעיון:</strong> ההסכם טרם נחתם. לוח התשלומים יחייב לאחר החתימה.</p>`;
  const ac = settings.accountingContact;
  return {
    to: [deal.client.accountingEmail || deal.client.email],
    cc: [settings.officeEmail],
    replyTo: settings.officeEmail,
    subject: `פרטי תשלום · ${deal.data.project?.name || ""} · הזמנה ${deal.number}`,
    html: layout({
      title: `פרטי תשלום להזמנה ${deal.number}`,
      body: `<p>${esc(deal.client.companyName || "")} אישרו את הזמנת העבודה ל<strong>${esc(deal.data.project?.name || "")}</strong>. אלה התשלומים:</p>
${signedNote}${table(rows)}${how}
<p style="margin-top:14px;">לענייני תשלום: ${esc(ac.name || settings.company.name)} · ${esc(ac.phone || "")} · ${esc(ac.email || settings.officeEmail)}</p>`,
    }),
  };
}

export function dealSignedMail(deal, settings, pdf) {
  return {
    to: [deal.client.email],
    cc: [settings.officeEmail, deal.client.accountingEmail].filter(Boolean),
    replyTo: settings.officeEmail,
    subject: `ההסכם נחתם · ${deal.data.project?.name || ""} · הזמנה ${deal.number}`,
    html: layout({
      title: "תודה, ההסכם נחתם",
      body: `<p>מצורף עותק חתום של הסכם ההתקשרות ל<strong>${esc(deal.data.project?.name || "")}</strong>, כולל הזמנת העבודה ולוח התשלומים.</p>
<p>נתחיל לעבוד עם קבלת המקדמה והחומרים שסיכמנו. נהיה בקשר בקרוב.</p>`,
    }),
    attachments: pdf ? [{ filename: pdf.name, fileId: pdf.fileId }] : [],
  };
}

// The order confirmation, sent by sales at the end of a deal closed by hand (the client signed outside the
// link): the order, the payment schedule and how to pay, with or without the signed contract attached, and
// the card link when the standing order still waits for one.
export function dealOrderMail(deal, settings, { pdf = null, cardUrl = null } = {}) {
  const o = deal.snapshot.order;
  const c = deal.client;
  const project = deal.data.project?.name || "";
  const service = o.service?.enabled && o.service.rows?.length
    ? `<h2 style="margin:22px 0 4px;font-size:17px;color:#3A2418;">שירות חודשי</h2>${table(o.service.rows.map((r) => [esc(r.when), r.price ? `${nis(r.priceWithVat)} לחודש כולל מע"מ` : "ללא עלות"]))}`
    : "";
  return {
    to: [c.email],
    cc: [settings.officeEmail, c.accountingEmail].filter(Boolean),
    replyTo: settings.officeEmail,
    subject: `אישור הזמנה ${deal.number} · ${project}`,
    html: layout({
      preheader: "פרטי ההזמנה ולוח התשלומים",
      title: `אישור הזמנה מס' ${deal.number}`,
      body: `<p style="margin:0 0 10px;">${esc(c.signerName || c.companyName || "שלום")}, תודה על ההתקשרות. ריכזנו כאן את פרטי ההזמנה ל<strong>${esc(project)}</strong>.</p>
${o.project?.summary ? `<p style="margin:0 0 10px;color:#6A4330;">${esc(o.project.summary)}</p>` : ""}
${table([...(o.price.listAmount ? [["מחיר לפני הנחה", `<s>${nis(o.price.listAmount)}</s>`], ["הנחה", nis(o.price.discount)]] : []), ["מחיר הפרויקט", `${nis(o.price.amount)} + מע"מ`], ["כולל מע\"מ", `<strong>${nis(o.price.total)}</strong>`]])}
<h2 style="margin:22px 0 4px;font-size:17px;color:#3A2418;">לוח תשלומים</h2>
${table(scheduleRows(o.schedule))}${howToPay(o, settings, deal.number)}
${service}
${pdf ? "<p>מצורף עותק של ההסכם החתום.</p>" : ""}
${cardUrl ? "<p>לשירות החודשי נשאר להגדיר כרטיס אשראי להוראת קבע. הכרטיס נשמר אצל ספק הסליקה ולא יחויב לפני מועד החיוב הראשון.</p>" : ""}`,
      button: cardUrl ? { href: cardUrl, label: "להגדרת כרטיס" } : undefined,
      footer: `הזמנה מס' ${deal.number} · ${esc(settings.company.name)} · ${esc(settings.company.phone)}`,
    }),
    attachments: pdf ? [{ filename: pdf.name, fileId: pdf.fileId }] : [],
  };
}

// ---------------- Standing orders ----------------

export function cardSetMail(sub, settings, firstCharge) {
  return {
    to: [sub.customer.email],
    cc: [settings.officeEmail],
    replyTo: settings.officeEmail,
    subject: "אמצעי התשלום לשירות החודשי הוגדר",
    html: layout({
      title: "אמצעי התשלום הוגדר",
      body: `<p>הכרטיס${sub.card?.suffix ? ` המסתיים ב-${esc(sub.card.suffix)}` : ""} נשמר אצל ספק הסליקה לחיוב החודשי של ${esc(sub.description)}.</p>
<p>${firstCharge ? `החיוב הראשון: <strong>${ddmmyyyy(firstCharge.date)}</strong>, ${nis(firstCharge.amount)} כולל מע"מ.` : "מועד החיוב הראשון ייקבע עם תחילת הפרויקט, ונעדכן אתכם בכתב."} הכרטיס לא יחויב לפני כן. על כל חיוב תישלח אליכם חשבונית מס קבלה.</p>`,
    }),
  };
}

// sent when the project starts and fixes the first charge date; the card may or may not be saved yet
export function firstChargeDateMail(sub, settings, fc, cardUrl) {
  const hasCard = sub.status !== "pending_card";
  return {
    to: [sub.customer.email],
    cc: [settings.officeEmail],
    replyTo: settings.officeEmail,
    subject: "מועד החיוב הראשון לשירות החודשי נקבע",
    html: layout({
      title: "מועד החיוב הראשון נקבע",
      body: `<p>העבודה על הפרויקט התחילה, ולכן נקבע מועד החיוב הראשון של ${esc(sub.description)}: <strong>${ddmmyyyy(fc.date)}</strong>, ${nis(fc.amount)} כולל מע"מ.</p>
<p>${hasCard
        ? `החיוב יתבצע מהכרטיס${sub.card?.suffix ? ` המסתיים ב-${esc(sub.card.suffix)}` : ""} שהגדרתם. על כל חיוב תישלח אליכם חשבונית מס קבלה.`
        : "עדיין לא הוגדר כרטיס אשראי לשירות. אפשר להגדיר אותו עכשיו בקישור. הכרטיס לא יחויב לפני המועד."}</p>`,
      button: hasCard ? undefined : { href: cardUrl, label: "להגדרת כרטיס" },
    }),
  };
}

export function cardReminderMail(sub, settings, url, firstDate) {
  return {
    to: [sub.customer.email],
    replyTo: settings.officeEmail,
    subject: "תזכורת: הגדרת אמצעי תשלום לשירות החודשי",
    html: layout({
      title: "נשאר צעד אחד קטן",
      body: `<p>כדי שהשירות החודשי (${esc(sub.description)}) ימשיך בלי הפסקה, צריך להגדיר כרטיס אשראי${firstDate ? ` עד <strong>${ddmmyyyy(firstDate)}</strong>` : ""}. הכרטיס נשמר אצל ספק הסליקה ולא יחויב לפני המועד.</p>`,
      button: { href: url, label: "להגדרת כרטיס" },
    }),
  };
}

export function chargeFailedMail(sub, charge, settings, url, final) {
  return {
    to: [sub.customer.email],
    cc: [settings.officeEmail],
    replyTo: settings.officeEmail,
    subject: "החיוב החודשי לא עבר",
    html: layout({
      title: "החיוב החודשי לא עבר",
      body: `<p>ניסינו לחייב ${nis(charge.amount)} עבור ${esc(sub.description)}, והחיוב לא אושר${charge.error ? ` (${esc(charge.error)})` : ""}.</p>
<p>${final ? "החיובים נעצרו עד לעדכון הכרטיס." : "ננסה שוב בעוד יומיים."} אפשר לעדכן כרטיס בקישור:</p>`,
      button: { href: url, label: "עדכון כרטיס" },
    }),
  };
}

// ---------------- Spec requests ----------------

// ---- The spec request emails: the boarding-pass design of the client's page (mint, tomato, cream) ----

const SITE = "https://www.pro-algo.com";
const PV = { page: "#E9DFC4", hero: "#9ED9C3", heroMuted: "#4F3324", ink: "#3A2418", muted: "#6A4330", tk: "#FFF9EC", line: "#E3D6B8", acc: "#E0432F", cream: "#F4ECD6", ok: "#1F7A55" };
// Rubik where the mail client loads web fonts (Apple Mail, iOS, Outlook for Mac), Arial elsewhere (Gmail)
const PV_FONT = "Rubik,Heebo,Arial,sans-serif";
const PV_FONT_LINK = '<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">';
// the client logos of the site (assets/img/clients), trimmed, with their size in the email
const MAIL_CLIENTS = [["idf", 'צה"ל', 41, 38], ["mod", "משרד הביטחון", 32, 38], ["rafael", "רפאל", 88, 19], ["mafat", 'מפא"ת', 31, 37],
  ["tau", "אוניברסיטת תל אביב", 49, 31], ["bar-ilan", "אוניברסיטת בר-אילן", 73, 27], ["acb", "התאחדות הקבלנים בוני הארץ", 51, 31], ["pekerman", "פקרמן הנדסה ואדריכלות", 70, 16],
  ["redmark", "רדמרק אדריכלות וניהול פרויקטים", 75, 22], ["aspire-home", "אספייר הום", 70, 25], ["mydesk", "myDESK", 29, 32]];

const withVatOf = (d) => Math.round(Number(d.price) * (1 + Number(d.vat_rate) / 100) * 100) / 100;
function dealOf(d) {
  const list = d.list_price !== null && d.list_price !== undefined && Number(d.list_price) > Number(d.price) ? Number(d.list_price) : null;
  return { list, price: Number(d.price), save: list ? Math.round((list - Number(d.price)) * 100) / 100 : 0 };
}
const tbl = (inner, style = "") => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"${style ? ` style="${style}"` : ""}>${inner}</table>`;
const fieldCell = (label, value) => `<td width="33%" style="padding:0 0 12px;vertical-align:top;"><div style="font-size:11.5px;color:${PV.muted};font-weight:700;">${label}</div><div style="font-size:15px;font-weight:800;color:${PV.ink};">${value}</div></td>`;
const footerOf = (settings) => `${esc(settings.company.name)}${settings.company.phone ? ` · <span dir="ltr">${esc(settings.company.phone)}</span>` : ""} · pro-algo.com`;

function passMail({ preheader, title, text, rows, footer }) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">${PV_FONT_LINK}</head><body style="margin:0;background:${PV.page};">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
${tbl(`<tr><td align="center" style="padding:28px 12px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${PV_FONT};direction:rtl;text-align:right;color:${PV.ink};">
<tr><td style="background:${PV.hero};border-radius:18px 18px 0 0;padding:22px 28px;">${tbl(`<tr><td><img src="${SITE}/pay-assets/all-dark-logo.png" width="150" alt="Pro Algorithm" style="display:block;width:150px;height:auto;border:0;"></td>
<td style="text-align:left;font-size:13px;font-weight:700;color:${PV.heroMuted};">כרטיס עלייה לפרויקט</td></tr>`)}</td></tr>
<tr><td style="background:${PV.hero};padding:6px 28px 26px;color:${PV.ink};"><div style="font-size:28px;font-weight:900;line-height:1.25;">${title}</div>
<div style="font-size:16px;line-height:1.65;margin-top:10px;">${text}</div></td></tr>
${rows}
<tr><td style="padding:20px 8px 0;font-size:12.5px;line-height:1.7;color:${PV.muted};text-align:center;">${footer}</td></tr>
</table></td></tr>`, `background:${PV.page};`)}</body></html>`;
}

// the benefit band (or the plain price when there is no price before discount)
function benefitRow(d) {
  const p = dealOf(d);
  return `<tr><td style="background:${PV.acc};color:#FFFFFF;padding:18px 28px;">${tbl(`<tr><td style="font-size:${p.list ? 44 : 34}px;font-weight:900;line-height:1;">${p.list ? "הטבה" : "המחיר"}</td>
<td style="font-size:17px;font-weight:800;text-align:left;line-height:1.45;">${p.list ? `מחיר מלא <span style="text-decoration:line-through;">${nis(p.list)}</span><br>ההטבה שלכם ` : ""}<span style="font-size:26px;font-weight:900;">${nis(p.price)}</span> + מע"מ${p.list ? `<br>חוסכים ${nis(p.save)}` : ""}</td></tr>`)}</td></tr>`;
}

function clientsRow() {
  const cells = MAIL_CLIENTS.map(([key, name, w, h]) => `<td width="25%" height="70" align="center" valign="middle" style="padding:6px;"><img src="${SITE}/pay-assets/clients/${key}.png" width="${w}" height="${h}" alt="${esc(name)}" style="display:block;width:${w}px;height:${h}px;border:0;"></td>`);
  while (cells.length % 4) cells.push('<td width="25%">&nbsp;</td>');
  const rows = [];
  for (let i = 0; i < cells.length; i += 4) rows.push(`<tr>${cells.slice(i, i + 4).join("")}</tr>`);
  return `<tr><td style="background:#FFFFFF;padding:22px 22px 16px;border-bottom:2px solid ${PV.line};"><div style="text-align:center;font-size:19px;font-weight:900;color:#1A1A1A;">בין לקוחותינו</div>
<div style="text-align:center;font-size:13.5px;color:#4A4A4A;margin-top:2px;">ארגונים שבוחרים לעבוד איתנו</div>${tbl(rows.join(""), "margin-top:8px;")}</td></tr>`;
}

// the pass: from "רעיון" to "דמו עובד", its fields, and a stub on the side
function passRow(fields, stub) {
  const grid = [];
  for (let i = 0; i < fields.length; i += 3) {
    const row = fields.slice(i, i + 3);
    grid.push(`<tr>${row.map(([l, v]) => fieldCell(l, v)).join("")}${'<td width="33%"></td>'.repeat(3 - row.length)}</tr>`);
  }
  return `<tr><td style="background:${PV.tk};padding:0;">${tbl(`<tr>
<td style="padding:22px 24px 8px;vertical-align:top;">${tbl(`<tr><td style="font-size:12px;color:${PV.muted};font-weight:700;">מוצא</td><td></td><td style="font-size:12px;color:${PV.muted};font-weight:700;text-align:left;">יעד</td></tr>
<tr><td style="font-size:28px;font-weight:900;color:${PV.ink};white-space:nowrap;">רעיון</td><td style="text-align:center;color:${PV.acc};font-size:14px;letter-spacing:2px;white-space:nowrap;">· · <img src="${SITE}/pay-assets/plane-left.png" width="22" height="22" alt="" style="display:inline-block;width:22px;height:22px;border:0;vertical-align:middle;"> · ·</td><td style="font-size:28px;font-weight:900;color:${PV.ink};text-align:left;white-space:nowrap;">דמו עובד</td></tr>`)}
${tbl(`<tr><td colspan="3" style="height:12px;font-size:0;">&nbsp;</td></tr>${grid.join("")}`, `margin-top:12px;border-top:1px solid ${PV.line};`)}</td>
<td width="180" style="width:180px;border-right:2px dashed ${PV.line};padding:20px 18px;vertical-align:top;">${stub}</td></tr>`)}</td></tr>`;
}

function dealStub(d) {
  const p = dealOf(d);
  return p.list
    ? `<div style="display:inline-block;background:${PV.acc};color:#FFFFFF;font-weight:900;font-size:17px;border-radius:10px;padding:5px 12px;">הטבה</div>
<div style="font-size:13px;color:${PV.muted};font-weight:700;margin-top:10px;">מחיר מלא <span style="text-decoration:line-through;color:${PV.ink};font-size:16px;">${nis(p.list)}</span></div>
<div style="font-size:13px;font-weight:800;color:${PV.ink};margin-top:6px;">ההטבה שלכם</div><div style="font-size:36px;font-weight:900;color:${PV.ink};line-height:1.05;white-space:nowrap;">${nis(p.price)}</div>
<div style="font-size:13px;color:${PV.muted};font-weight:700;">+ מע"מ</div><div style="font-size:15px;font-weight:900;color:${PV.acc};margin-top:8px;">חוסכים ${nis(p.save)}</div>`
    : `<div style="font-size:13px;font-weight:800;color:${PV.ink};">המחיר</div><div style="font-size:36px;font-weight:900;color:${PV.ink};line-height:1.05;white-space:nowrap;">${nis(p.price)}</div>
<div style="font-size:13px;color:${PV.muted};font-weight:700;">+ מע"מ</div>`;
}

const GETS = ["פגישת איפיון עם מומחה תוכנה", "דמו עובד של המערכת שלכם", "מסמך אפיון מלא", "פגישת הצגת הדמו"];

// how a payment sales entered by hand was made
export const PAY_METHOD_LABELS = { transfer: "העברה בנקאית", bit: "ביט / פייבוקס", card: "כרטיס אשראי (מחוץ לעמוד)", check: "שיק", cash: "מזומן", other: "אחר" };

export function discoveryInviteMail(d, settings, url) {
  // what the page still asks of the client: sales may have left the booking or the payment off it
  const meeting = d.meeting_start && d.booking_status !== "held";
  const book = d.show_booking !== false && !meeting;
  const pay = d.show_payment !== false && !d.paid_at;
  const ask = book && pay ? "בוחרים מועד ומשלמים בעמוד." : book ? "בוחרים מועד בעמוד." : pay ? "התשלום בכרטיס אשראי בעמוד." : "";
  const manual = d.booking_status === "manual" && d.meeting_start;
  const p = dealOf(d);
  const fields = [["על שם", esc(d.client_name)], ...(d.company_name ? [["חברה", esc(d.company_name)]] : []), ["עם", "מומחה תוכנה"],
    ["שער", "Google Meet"], ["משך", `${d.meeting_minutes} דקות`], ["מועד", meeting ? esc(israelDateTime(d.meeting_start)) : "בוחרים בעמוד"]];
  const label = book ? "שריינו את הדמו שלכם" : pay ? "לפרטים ולתשלום" : "לפרטי הספרינט";
  const gets = GETS.map((b) => `<tr><td width="28" style="vertical-align:top;padding:5px 0;color:${PV.acc};font-size:17px;font-weight:900;">✓</td><td style="padding:5px 0;font-size:15.5px;line-height:1.5;font-weight:700;color:${PV.ink};">${b}</td></tr>`).join("");
  return {
    to: [d.email],
    replyTo: settings.officeEmail,
    subject: `${settings.discovery.title} · ${d.company_name || d.client_name}`,
    html: passMail({
      preheader: p.list ? `הטבה: ${nis(p.price)} במקום ${nis(p.list)}. דמו עובד של המערכת שלכם.` : "רואים את המערכת לפני שמפתחים אותה",
      title: `${esc(d.client_name)}, רואים את המערכת לפני שמפתחים אותה`,
      text: `${d.pitch && (d.pitch.headline || d.pitch.lines?.length) ? pitchHtml(d.pitch) : "פגישה אחת עם מומחה תוכנה, ובסופה דמו עובד של המערכת שלכם."}${manual ? `<br><strong>פגישת הפתיחה נקבעה ל${esc(israelDateTime(d.meeting_start))}</strong> (${d.meeting_minutes} דקות).` : ""}`,
      footer: footerOf(settings),
      rows: benefitRow(d) + clientsRow() + passRow(fields, dealStub(d))
        + `<tr><td style="background:${PV.tk};padding:4px 24px 6px;border-top:2px dashed ${PV.line};">${tbl(gets, "margin-top:8px;")}</td></tr>
<tr><td style="background:${PV.tk};padding:10px 24px 26px;color:${PV.ink};border-radius:0 0 18px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr><td style="background:${PV.acc};border-radius:14px;"><a href="${esc(url)}" style="display:inline-block;padding:16px 30px;font-size:19px;font-weight:900;color:#FFFFFF;text-decoration:none;">${label}</a></td></tr></table>
${ask ? `<div style="font-size:14px;color:${PV.muted};margin-top:12px;font-weight:600;">${ask}</div>` : ""}</td></tr>`,
    }),
  };
}

export function discoveryPaidMail(d, settings, paid = null) {
  return {
    to: [settings.officeEmail],
    subject: `שולם: ${settings.discovery.title} · ${d.company_name || d.client_name}`,
    html: layout({
      title: "התקבל תשלום על ספרינט האיפיון",
      body: table([["לקוח", esc(d.client_name)], ["חברה", esc(d.company_name || "")], ["סכום לפני מע\"מ", nis(d.price)], ...(paid !== null ? [["שולם (כולל מע\"מ)", nis(paid)]] : []),
        ...(d.paid_via === "manual" ? [["אמצעי תשלום", esc(PAY_METHOD_LABELS[d.payment_method] || "סומן ידנית")]] : []), ...(d.payment_note ? [["הערה", esc(d.payment_note)]] : []),
        ["אימייל", esc(d.email || "")], ["טלפון", esc(d.phone || "")]])
        + (d.paid_via === "manual" ? "<p>התשלום התקבל מחוץ לעמוד ולכן לא הופקה חשבונית אוטומטית.</p>" : "")
        + (d.booking_status === "manual" && d.meeting_start
          ? `<p>הפגישה תואמה ידנית ל<strong>${esc(israelDateTime(d.meeting_start))}</strong>.</p>`
          : d.meeting_start && d.booking_status !== "held"
            ? `<p>הפגישה נקבעה ל<strong>${esc(israelDateTime(d.meeting_start))}</strong> והזימון נשלח ללקוח.</p>`
            : d.show_booking === false ? "<p>מועד הפגישה עוד לא הוזן. אפשר להזין אותו במסך הבקשה.</p>"
              : "<p>הלקוח עדיין לא בחר מועד. הוא יוכל לבחור אותו מאותו קישור.</p>"),
    }),
  };
}

export function discoveryUnderpaidMail(d, settings, paid, due) {
  return {
    to: [settings.officeEmail],
    subject: `תשלום חלקי: ${settings.discovery.title} · ${d.company_name || d.client_name}`,
    html: layout({
      title: "התקבל תשלום נמוך מהמחיר",
      body: table([["לקוח", esc(d.client_name)], ["חברה", esc(d.company_name || "")], ["לתשלום (כולל מע\"מ)", nis(due)], ["שולם בפועל", nis(paid)]])
        + "<p>הבקשה לא סומנה כשולמה והלקוח לא יכול לקבוע פגישה. אם הסכום מוסכם, אפשר לסמן אותה כשולמה ידנית במסך הבקשה.</p>",
    }),
  };
}

// the booking confirmation: the meeting on the pass, what to prepare, and the people responsible for the request
export function discoveryBookedMail(d, settings, { calendarInvited }) {
  const tz = { timeZone: "Asia/Jerusalem" };
  const at = new Date(d.meeting_start);
  const when = israelDateTime(d.meeting_start);
  const dateOnly = at.toLocaleDateString("he-IL", { ...tz, day: "numeric", month: "long" });
  const day = at.toLocaleDateString("he-IL", { ...tz, weekday: "short", day: "numeric", month: "numeric" });
  const time = at.toLocaleTimeString("he-IL", { ...tz, hour: "2-digit", minute: "2-digit" });
  const others = (d.attendees || []).filter((a) => a && a !== d.email);
  const c = d.contacts || {};
  const lead = c.lead?.name ? esc(c.lead.name) : "";
  const paidStub = d.paid_at
    ? `<div style="display:inline-block;background:${PV.ok};color:#FFFFFF;font-weight:900;font-size:15px;border-radius:10px;padding:5px 12px;">✓ שולם · מאושר</div>
<div style="font-size:12px;color:${PV.muted};font-weight:700;margin-top:12px;">שולם, כולל מע"מ</div><div style="font-size:24px;font-weight:900;color:${PV.ink};white-space:nowrap;">${nis(withVatOf(d))}</div>
${d.paid_via === "grow" ? `<div style="font-size:12.5px;color:${PV.muted};margin-top:2px;">חשבונית נשלחת בנפרד</div>` : ""}`
    : `<div style="display:inline-block;background:${PV.ok};color:#FFFFFF;font-weight:900;font-size:15px;border-radius:10px;padding:5px 12px;">✓ מאושר</div>`;
  const prep = [["שיחה יום לפני", `יום לפני הפגישה${lead ? `, ${lead}, ראש הצוות שלכם,` : " ראש הצוות שלכם"} יתקשר אליכם לשיחה קצרה. נחדד יחד את הפרטים ונוודא שהמטרה של האיפיון מוגדרת.`],
    ["דוגמאות מהעבודה היום", "הכינו דוגמאות מהעבודה היום: קבצים, טפסים, צילומי מסך או דוחות שאתם עובדים איתם."],
    ["מטרה אחת ממוקדת", "הגיעו עם מטרה אחת ממוקדת: הדבר שהכי חשוב לכם שהמערכת תפתור."]];
  const team = [["ראש צוות אחראי", c.lead], ["איש מכירות אחראי", c.sales], ["לכל שאלה", c.office && { ...c.office, name: c.office.name || "מנהלת משרד" }]]
    .filter(([, x]) => x?.name || x?.phone);
  const teamCells = team.map(([role, x], i) => `${i ? '<td width="2%">&nbsp;</td>' : ""}<td width="32%" style="vertical-align:top;padding:14px;background:${PV.cream};border-radius:12px;"><div style="font-size:12px;color:${PV.muted};font-weight:700;">${role}</div>
<div style="font-size:16px;font-weight:900;color:${PV.ink};margin-top:2px;">${esc(x.name || "")}</div>${x.phone ? `<a href="tel:${esc(String(x.phone).replace(/[^\d+]/g, ""))}" dir="ltr" style="font-size:15px;color:${PV.ink};font-weight:800;text-decoration:underline;">${esc(x.phone)}</a>` : ""}</td>`).join("");
  const prepRows = prep.map(([b, t], i) => `<tr><td width="44" style="vertical-align:top;padding:14px 0;"><div style="width:32px;height:32px;border-radius:50%;border:2px solid ${PV.acc};color:${PV.acc};text-align:center;line-height:32px;font-weight:900;font-size:15px;">${i + 1}</div></td>
<td style="padding:12px 0;${i < prep.length - 1 ? `border-bottom:1px solid ${PV.line};` : ""}"><div style="font-size:16px;font-weight:900;color:${PV.ink};">${b}</div><div style="font-size:14.5px;line-height:1.65;color:${PV.ink};margin-top:2px;">${t}</div></td></tr>`).join("");
  const sentTo = others.length ? ` ואל ${others.map((a) => `<span dir="ltr">${esc(a)}</span>`).join(", ")}` : "";
  return {
    to: [d.email, ...(d.attendees || [])],
    cc: [settings.officeEmail, ...(settings.calendar.invitees || []), settings.calendar.user],
    replyTo: settings.officeEmail,
    subject: `נקבעה פגישת פתיחה · ${settings.discovery.title}`,
    html: passMail({
      preheader: `הפגישה נקבעה ל${when}`,
      title: `הפגישה נקבעה. נתראה ב-${esc(dateOnly)}`,
      text: `${d.paid_at ? "התשלום התקבל. " : ""}${calendarInvited ? `זימון ליומן${d.meet_url ? " עם קישור ל-Meet" : ""} נשלח אליכם${sentTo}.` : "מצורף זימון ליומן (קובץ ics). פתחו אותו כדי להוסיף את הפגישה ליומן."}`,
      footer: footerOf(settings),
      rows: passRow([["מועד", esc(day)], ["שעה", `<span dir="ltr">${esc(time)}</span>`], ["משך", `${d.meeting_minutes} דקות`], ["שער", "Google Meet"], ["עם", "מומחה תוכנה"], ["זימון", calendarInvited ? "נשלח ליומן" : "מצורף למייל"]], paidStub)
        + (d.meet_url ? `<tr><td style="background:${PV.tk};padding:0 24px 16px;color:${PV.ink};font-size:14.5px;">קישור לפגישה: <a href="${esc(d.meet_url)}" dir="ltr" style="color:${PV.ink};font-weight:800;">${esc(String(d.meet_url).replace(/^https?:\/\//, ""))}</a></td></tr>` : "")
        + `<tr><td style="background:${PV.tk};padding:20px 24px 6px;border-top:2px dashed ${PV.line};"><div style="font-size:21px;font-weight:900;color:${PV.ink};">עד הפגישה</div>${tbl(prepRows)}</td></tr>
<tr><td style="background:${PV.tk};padding:10px 24px 26px;border-radius:0 0 18px 18px;">${team.length ? `<div style="font-size:17px;font-weight:900;color:${PV.ink};margin-bottom:10px;">הצוות שלכם</div>${tbl(`<tr>${teamCells}</tr>`)}` : ""}</td></tr>`,
    }),
  };
}

// iCalendar invite (when the Google calendar is not connected yet)
export function meetingIcs(d, settings) {
  const stamp = (x) => new Date(x).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pro Algorithm//Sales//HE", "METHOD:REQUEST", "BEGIN:VEVENT",
    `UID:${d.id}@pro-algo.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(d.meeting_start)}`, `DTEND:${stamp(d.meeting_end)}`,
    `SUMMARY:${settings.discovery.title} · ${String(d.company_name || d.client_name).replace(/[,;\n]/g, " ")}`,
    `ORGANIZER;CN=Pro Algorithm:mailto:${settings.calendar.user}`,
    ...[...new Set([d.email, ...(d.attendees || []), ...(settings.calendar.invitees || [])].filter(Boolean))].map((e) => `ATTENDEE;RSVP=TRUE:mailto:${e}`),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
