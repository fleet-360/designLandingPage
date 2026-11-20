// Emails of the sales system (queued with sales.js sendMail, sent by Toro from info@pro-algo.com).
// Hebrew, RTL, inline styles (mail clients ignore <style>). Every value from a person is escaped.

const BRAND = "#2B2A8C";
const ACCENT = "#4A6FD8";

export const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const nis = (n) => `₪\u00a0${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const ddmmyyyy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
export const israelDateTime = (d) =>
  new Date(d).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function layout({ preheader = "", title, body, button, footer = "" }) {
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#F5F7FA;">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Heebo,Arial,sans-serif;color:#1F2937;direction:rtl;text-align:right;">
<tr><td style="background:${BRAND};padding:22px 28px;">
<img src="https://www.pro-algo.com/images/logo/Vertical-logo-white.png" alt="Pro Algorithm" width="150" style="display:block;width:150px;height:auto;border:0;">
</td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.35;color:#111827;">${title}</h1>
<div style="font-size:16px;line-height:1.65;">${body}</div>
${button ? `<p style="margin:26px 0 8px;"><a href="${esc(button.href)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:10px;font-size:16px;">${esc(button.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px 26px;color:#6B7280;font-size:13px;line-height:1.6;border-top:1px solid #EEF0F4;">
${footer || 'פרו אלגוריתם בע"מ · buildalgo.co.il'}
</td></tr>
</table></td></tr></table></body></html>`;
}

const table = (rows) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:12px 0;font-size:15px;">
${rows.map((r, i) => `<tr style="background:${i % 2 ? "#ffffff" : "#F8FAFC"}">${r.map((c) => `<td style="padding:8px 10px;border-bottom:1px solid #EEF0F4;">${c}</td>`).join("")}</tr>`).join("")}
</table>`;

// ---------------- Deals ----------------

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
      body: `<p style="margin:0 0 10px;">ריכזנו בעמוד אחד את מה שסיכמנו על <strong>${esc(project)}</strong>: מה מפתחים, כמה זה עולה ומתי משלמים.</p>
<p style="margin:0;">אחרי האישור תעברו לחתימה על ההסכם, ובסוף להגדרת אמצעי התשלום לשירות החודשי. אפשר לעצור בכל שלב ולחזור דרך אותו קישור.</p>`,
      button: { href: url, label: "לצפייה ואישור" },
      footer: `הזמנה מס' ${deal.number} · ${esc(settings.company.name)} · ${esc(settings.company.phone)}`,
    }),
  };
}

export function dealAccountingMail(deal, snapshot, settings) {
  const s = snapshot.order.schedule;
  const checks = snapshot.order.balanceMethod === "checks";
  const rows = [["<strong>#</strong>", "<strong>מועד</strong>", "<strong>לפני מע\"מ</strong>", "<strong>כולל מע\"מ</strong>"],
    ...s.rows.map((r) => [r.n, `${r.kind === "deposit" ? "מקדמה · " : ""}${ddmmyyyy(r.date)}${r.dateNote ? `<br><span style="color:#6B7280;font-size:13px">${esc(r.dateNote)}</span>` : ""}`, nis(r.before), nis(r.total)]),
    ["", "<strong>סה\"כ</strong>", `<strong>${nis(s.totals.before)}</strong>`, `<strong>${nis(s.totals.total)}</strong>`]];
  const b = settings.bank;
  const how = checks
    ? `<p><strong>שיקים דחויים:</strong> לפקודת ${esc(settings.checks.payee)}, שיק לכל תשלום לפי הטבלה. השיקים ייאספו בתוך ${esc(settings.checks.pickupDays)} ימי עסקים מהחתימה; נתאם איתכם את האיסוף.</p>`
    : `<p><strong>העברה בנקאית:</strong> מוטב ${esc(b.beneficiary)}${b.bank ? `, בנק ${esc(b.bank)}` : ""}${b.branch ? `, סניף ${esc(b.branch)}` : ""}${b.account ? `, חשבון ${esc(b.account)}` : ""}. אסמכתה: מספר הזמנה ${deal.number}.</p>`;
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
      body: `<p>מצורף עותק חתום של הסכם ההתקשרות ל<strong>${esc(deal.data.project?.name || "")}</strong>, כולל הזמנת העבודה, לוח התשלומים ונספח א'.</p>
<p>נתחיל לעבוד עם קבלת המקדמה והחומרים שסיכמנו. נהיה בקשר בקרוב.</p>`,
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

export function discoveryInviteMail(d, settings, url) {
  return {
    to: [d.email],
    replyTo: settings.officeEmail,
    subject: `${settings.discovery.title} · ${d.company_name || d.client_name}`,
    html: layout({
      title: `${esc(d.client_name)}, הצעד הראשון לפרויקט`,
      body: `<p>הכנו עבורכם עמוד שמסביר איך עובד ${esc(settings.discovery.title)}: מה עושים, מה מקבלים בסוף ומה המחיר.</p>
<p>בעמוד אפשר לשלם ולקבוע מיד את פגישת הפתיחה ביומן.</p>`,
      button: { href: url, label: "לפרטים וקביעת פגישה" },
    }),
  };
}

export function discoveryPaidMail(d, settings, paid = null) {
  return {
    to: [settings.officeEmail],
    subject: `שולם: ${settings.discovery.title} · ${d.company_name || d.client_name}`,
    html: layout({
      title: "התקבל תשלום על ספרינט האיפיון",
      body: table([["לקוח", esc(d.client_name)], ["חברה", esc(d.company_name || "")], ["סכום לפני מע\"מ", nis(d.price)], ...(paid !== null ? [["שולם (כולל מע\"מ)", nis(paid)]] : []), ["אימייל", esc(d.email || "")], ["טלפון", esc(d.phone || "")]])
        + "<p>הלקוח מועבר עכשיו לקביעת פגישת הפתיחה ביומן.</p>",
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

export function discoveryBookedMail(d, settings, { calendarInvited }) {
  const when = israelDateTime(d.meeting_start);
  return {
    to: [d.email, ...(d.attendees || [])],
    cc: [settings.officeEmail, settings.calendar.user],
    replyTo: settings.officeEmail,
    subject: `נקבעה פגישת פתיחה · ${settings.discovery.title}`,
    html: layout({
      title: "הפגישה נקבעה",
      body: `<p>פגישת הפתיחה של ${esc(settings.discovery.title)} נקבעה ל<strong>${esc(when)}</strong> (${d.meeting_minutes} דקות).</p>
${d.meet_url ? `<p>קישור לפגישה: <a href="${esc(d.meet_url)}">${esc(d.meet_url)}</a></p>` : ""}
<p>${calendarInvited ? "זימון ליומן נשלח לכל המשתתפים." : "מצורף זימון ליומן (קובץ ics). פתחו אותו כדי להוסיף את הפגישה ליומן."}</p>
<p>כדאי להגיע עם דוגמאות לתהליך העבודה היום ועם אנשי המקצוע שמכירים אותו.</p>`,
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
    ...[d.email, ...(d.attendees || [])].filter(Boolean).map((e) => `ATTENDEE;RSVP=TRUE:mailto:${e}`),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
