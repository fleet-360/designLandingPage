// Shared by the sales screens (admin, under /contracts) and the client pages (/discovery, /deal, /card).
import { t } from "@/i18n";

export class ApiError extends Error {
  constructor(status, code, data) {
    super(code);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let r;
  try {
    r = await fetch(`/api/${path}`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error || "server_error", data);
  return data;
}

// A GET for a client's page: a passing failure (no network, a server error while the server wakes up) is tried
// again before the page gives up. A 4xx is the answer itself (404: the link is not active).
export async function getWithRetry(path, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await api(path);
    } catch (err) {
      if (i >= tries || (err.status >= 400 && err.status < 500)) throw err;
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
}

export const nis = (n, { decimals } = {}) =>
  n == null || n === "" ? "" :
    `₪\u00a0${Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals ?? (Number(n) % 1 ? 2 : 0), maximumFractionDigits: 2 })}`;

export const dmy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

export const meetingTime = (iso) =>
  new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const dayLabel = (iso) =>
  new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long" });

export const timeLabel = (iso) =>
  new Date(iso).toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });

// Text pasted from WhatsApp, mail or a Hebrew document often carries invisible direction marks and
// zero-width characters (and no-break spaces). They look like nothing but fail every check below.
export const cleanText = (v) => String(v ?? "").replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g, "").replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ").trim();
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanText(s));

// What Grow accepts, checked before we call it, so the customer sees what to fix.
// Israeli mobile: 05XXXXXXXX (spaces, dashes and +972 allowed) -> "05XXXXXXXX", or "" when not valid
export const mobileIL = (v) => {
  const d = cleanText(v).replace(/[^\d+]/g, "").replace(/^\+?972/, "0");
  return /^05\d{8}$/.test(d) ? d : "";
};
// ID / company number (ת.ז, ח.פ, ע.מ): up to 9 digits with the Israeli check digit -> 9 digits, or ""
export const taxIdIL = (v) => {
  const s = cleanText(v).replace(/[\s\-./]/g, "");
  if (!/^\d{5,9}$/.test(s) || !Number(s)) return "";
  const p = s.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) { const x = Number(p[i]) * ((i % 2) + 1); sum += x > 9 ? x - 9 : x; }
  return sum % 10 === 0 ? p : "";
};
export const fullNameOk = (v) => cleanText(v).split(/\s+/).filter((w) => w.length > 1).length >= 2;
export const FIELD_ERRORS = {
  fullName: t("יש להזין שם מלא: לפחות שתי מילים"),
  email: t("יש להזין אימייל תקין"),
  phone: t("יש להזין טלפון נייד תקין: 10 ספרות שמתחילות ב-05"),
  taxId: t("מספר ח.פ / ע.מ / ת.ז לא תקין. בדקו שהוזנו כל הספרות"),
};

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const whatsappLink = (phone, text) => {
  const p = String(phone || "").replace(/\D/g, "").replace(/^0/, "972");
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
};

// Messages for API error codes (Hebrew, short, what to do next)
const ERRORS = {
  network: t("אין חיבור לשרת. בדקו את החיבור ונסו שוב."),
  server_error: t("משהו השתבש. נסו שוב בעוד רגע."),
  not_found: t("הקישור אינו פעיל."),
  signed_out: t("פג תוקף ההתחברות. היכנסו שוב."),
  not_configured: t("המערכת לא מוגדרת בשרת הזה."),
  bad_client_name: t("יש להזין את שם הלקוח"),
  bad_tax_id: t("מספר ח.פ / ע.מ / ת.ז לא תקין. בדקו שהוזנו כל הספרות"),
  bad_phone: t("יש להזין טלפון נייד תקין: 10 ספרות שמתחילות ב-05"),
  bad_address: t("יש להזין כתובת. היא מופיעה בהסכם"),
  bad_first_charge_date: t("יש לבחור את תאריך החיוב הראשון של השירות החודשי"),
  bad_email: t("כתובת האימייל לא תקינה"),
  bad_price: t("יש להזין מחיר"),
  bad_list_price: t("המחיר לפני הנחה צריך להיות גבוה מהמחיר"),
  bad_project_name: t("יש להזין שם לפרויקט"),
  bad_client_email: t("יש להזין אימייל של הלקוח"),
  bad_service_periods: t("להוראת קבע צריך לפחות תקופת שירות אחת בתשלום"),
  bad_accounting_email: t("יש להזין אימייל תקין של הנהלת החשבונות"),
  bad_company: t("יש להזין שם חברה או שם מלא"),
  bad_name: t("יש להזין שם מלא"),
  not_accepted: t("יש לסמן את תיבת האישור"),
  already_approved: t("ההזמנה כבר אושרה"),
  already_signed: t("ההסכם כבר נחתם"),
  not_approved: t("יש לאשר קודם את הזמנת העבודה"),
  slot_taken: t("המועד הזה נתפס הרגע. בחרו מועד אחר."),
  already_booked: t("הפגישה כבר נקבעה"),
  already_paid: t("התשלום כבר התקבל. רעננו את העמוד כדי לקבוע את הפגישה"),
  not_paid: t("התשלום עדיין לא התקבל"),
  bad_attendee: t("אחת מכתובות המשתתפים לא תקינה"),
  card_unavailable: t("לא הצלחנו לפתוח את דף התשלום המאובטח. נסו שוב בעוד רגע."),
  bad_schedule: t("יש להזין סכום לכל תקופה"),
  bad_customer: t("יש להזין שם לקוח"),
  no_card: t("עדיין לא הוגדר כרטיס"),
  bad_status: t("הפעולה לא אפשרית במצב הנוכחי"),
  file_too_large: t("הקובץ גדול מדי (עד 3MB)"),
  too_large: t("הקובץ גדול מדי"),
  bad_meeting_start: t("יש להזין תאריך ושעה לפגישה"),
  bad_payment_method: t("יש לבחור אמצעי תשלום"),
  bad_payments: t("יש להזין לפחות תשלום אחד"),
  bad_payment_date: t("יש להזין תאריך לכל תשלום"),
  bad_payment_amount: t("יש להזין סכום לכל תשלום"),
  bad_payments_sum: t("סכום התשלומים צריך להיות שווה למחיר הפרויקט"),
  bad_id_number: t("מספר תעודת הזהות לא תקין"),
  bad_payment_status: t("מצב התשלום לא תקין"),
  booking_manual: t("מועד הפגישה נקבע איתכם ישירות. לשינוי צרו קשר."),
  bad_file: t("הקובץ לא נמצא. העלו אותו שוב"),
  not_signed: t("העסקה עוד לא נחתמה"),
  bad_title: t("יש להזין כותרת"),
  bad_body: t("יש להזין את נוסח הנספח"),
  bad_appendix_payments: t("בכל תשלום יש להזין תאריך, סכום ואמצעי תשלום"),
  canceled: t("הפריט בוטל"),
  unsupported_file_type: t("סוג הקובץ לא נתמך"),
  bad_problem: t("כתבו בכמה מילים מה הלקוח רוצה לפתור"),
  ai_not_configured: t("כתיבה אוטומטית לא מוגדרת בשרת. אפשר לכתוב את המשפטים ידנית."),
  ai_busy: t("יש עומס על שירות הכתיבה. נסו שוב בעוד דקה."),
  ai_failed: t("הכתיבה לא הצליחה. נסו שוב, או כתבו את המשפטים ידנית."),
  ai_refused: t("לא הצלחנו לכתוב משפטים מהתיאור הזה. נסו לנסח אותו אחרת."),
  demo_too_big: t("קוד הדמו גדול מדי לכתיבת תסריט (מעל 900 אלף תווים בלי התמונות המוטמעות)"),
  no_demo: t("יש להעלות קודם את קובץ הדמו"),
  no_script: t("אין עדיין תסריט לסרטון"),
  bad_script: t("התסריט לא תקין"),
  video_too_large: t("הסרטון גדול מ-60MB. אפשר לכווץ אותו (למשל ב-HandBrake) ולהעלות שוב"),
  bad_part: t("ההעלאה נקטעה. העלו את הסרטון שוב"),
  doc_number_taken: t("מספר המסמך הזה כבר רשום בתשלום אחר"),
  kaspit_doc_linked: t("המסמך הזה מכספית כבר מקושר לתשלום אחר"),
  kaspit_doc_not_found: t("המסמך לא נמצא בכספית"),
  kaspit_unavailable: t("כספית לא זמינה כרגע. נסו שוב בעוד דקה"),
  kaspit_not_configured: t("החיבור לכספית עוד לא הוגדר בשרת"),
  bad_kaspit_document: t("אי אפשר לקשר את המסמך הזה"),
  bad_amount: t("יש להזין סכום תקין"),
  bad_date: t("יש לבחור תאריך"),
  bad_id: t("הרשומה לא נמצאה. רעננו את העמוד"),
  not_restorable: t("את הפעולה הזו אי אפשר לשחזר"),
};
export const errorText = (e) => ERRORS[e?.code] || ERRORS.server_error;

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});
