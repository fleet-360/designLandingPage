// Shared by the sales screens (admin, under /contracts) and the client pages (/discovery, /deal, /card).

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

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "").trim());

// What Grow accepts, checked before we call it, so the customer sees what to fix.
// Israeli mobile: 05XXXXXXXX (spaces, dashes and +972 allowed) -> "05XXXXXXXX", or "" when not valid
export const mobileIL = (v) => {
  const d = String(v || "").replace(/[^\d+]/g, "").replace(/^\+?972/, "0");
  return /^05\d{8}$/.test(d) ? d : "";
};
// ID / company number (ת.ז, ח.פ, ע.מ): up to 9 digits with the Israeli check digit -> 9 digits, or ""
export const taxIdIL = (v) => {
  const s = String(v || "").replace(/[\s-]/g, "");
  if (!/^\d{5,9}$/.test(s) || !Number(s)) return "";
  const p = s.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) { const x = Number(p[i]) * ((i % 2) + 1); sum += x > 9 ? x - 9 : x; }
  return sum % 10 === 0 ? p : "";
};
export const fullNameOk = (v) => String(v || "").trim().split(/\s+/).filter((w) => w.length > 1).length >= 2;
export const FIELD_ERRORS = {
  fullName: "יש להזין שם מלא: לפחות שתי מילים",
  email: "יש להזין אימייל תקין",
  phone: "יש להזין טלפון נייד תקין: 10 ספרות שמתחילות ב-05",
  taxId: "מספר ח.פ / ע.מ / ת.ז לא תקין. בדקו שהוזנו כל הספרות",
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
  network: "אין חיבור לשרת. בדקו את החיבור ונסו שוב.",
  server_error: "משהו השתבש. נסו שוב בעוד רגע.",
  not_found: "הקישור אינו פעיל.",
  signed_out: "פג תוקף ההתחברות. היכנסו שוב.",
  not_configured: "המערכת לא מוגדרת בשרת הזה.",
  bad_client_name: "יש להזין את שם הלקוח",
  bad_tax_id: "מספר ח.פ / ע.מ / ת.ז לא תקין. בדקו שהוזנו כל הספרות",
  bad_phone: "יש להזין טלפון נייד תקין: 10 ספרות שמתחילות ב-05",
  bad_email: "כתובת האימייל לא תקינה",
  bad_price: "יש להזין מחיר",
  bad_project_name: "יש להזין שם לפרויקט",
  bad_client_email: "יש להזין אימייל של הלקוח",
  bad_service_periods: "להוראת קבע צריך לפחות תקופת שירות אחת בתשלום",
  bad_accounting_email: "יש להזין אימייל תקין של הנהלת החשבונות",
  bad_company: "יש להזין שם חברה או שם מלא",
  bad_name: "יש להזין שם מלא",
  not_accepted: "יש לסמן את תיבת האישור",
  already_approved: "ההזמנה כבר אושרה",
  already_signed: "ההסכם כבר נחתם",
  not_approved: "יש לאשר קודם את הזמנת העבודה",
  slot_taken: "המועד הזה נתפס הרגע. בחרו מועד אחר.",
  already_booked: "הפגישה כבר נקבעה",
  not_paid: "התשלום עדיין לא התקבל",
  bad_attendee: "אחת מכתובות המשתתפים לא תקינה",
  card_unavailable: "לא הצלחנו לפתוח את דף התשלום המאובטח. נסו שוב בעוד רגע.",
  bad_schedule: "יש להזין סכום לכל תקופה",
  bad_customer: "יש להזין שם לקוח",
  no_card: "עדיין לא הוגדר כרטיס",
  bad_status: "הפעולה לא אפשרית במצב הנוכחי",
  file_too_large: "הקובץ גדול מדי",
  unsupported_file_type: "סוג הקובץ לא נתמך",
};
export const errorText = (e) => ERRORS[e?.code] || ERRORS.server_error;

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});
