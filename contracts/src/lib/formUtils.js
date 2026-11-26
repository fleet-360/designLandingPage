import { t } from "@/i18n";
// השרת מחזיר תאריכי מערכת (created_date וכו') ב-UTC ללא ציון אזור זמן — מוסיפים Z
// כדי שהדפדפן יפרש אותם כ-UTC ויציג בשעון המקומי, ולא כשעה מקומית.
export const parseDate = (d) => {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(d)) return new Date(`${d}Z`);
  return new Date(d);
};

export const fmtDate = (d) => {
  if (!d) return "—";
  const date = parseDate(d);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} | ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const SIGNER_FIELDS = {
  name: t("שם מלא"),
  id_number: t("ת.ז."),
  email: t("דואר אלקטרוני"),
  phone: t("מספר נייד"),
  address: t("כתובת"),
};

export const FIELD_TYPES = {
  text: t("טקסט קצר"),
  textarea: t("טקסט ארוך"),
  email: t("אימייל"),
  tel: t("טלפון"),
  date: t("תאריך"),
  number: t("מספר"),
  select: t("בחירה מרשימה"),
};

export const newBlock = (type) => ({
  id: uid(),
  type,
  content: "",
  label: type === "field" ? t("שדה למילוי") : type === "signature" ? t("חתימת הלקוח") : "",
  input_type: type === "field" ? "text" : undefined,
  required: type === "field" || type === "signature",
});

export const defaultForm = () => ({
  title: t("טופס חדש"),
  is_published: false,
  signer_fields: ["name", "id_number", "email", "phone"],
  blocks: [
    { id: uid(), type: "title", content: t("הסכם למתן שירותים") },
    {
      id: uid(),
      type: "text",
      content: t("מסמך זה מהווה הסכם בין הצדדים. ניתן לערוך את הטקסט, להוסיף סעיפים, תמונות ושדות למילוי."),
    },
    { id: uid(), type: "separator" },
    { id: uid(), type: "signature", label: t("חתימת הלקוח"), required: true },
  ],
});

// The public page sits under the app's base path (/contracts/sign)
export const signLink = (id) => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign?id=${id}`;

export const FONT_SIZES = [
  { value: "default", label: t("ברירת מחדל") },
  { value: "12px", label: t("קטן (12)") },
  { value: "14px", label: t("רגיל (14)") },
  { value: "16px", label: t("בינוני (16)") },
  { value: "18px", label: t("גדול (18)") },
  { value: "24px", label: t("כותרת (24)") },
  { value: "32px", label: t("כותרת גדולה (32)") },
];

export const FONT_FAMILIES = [
  { value: "default", label: t("לפי הגדרות הטופס") },
  { value: "var(--font-body)", label: t("Heebo (גוף)") },
  { value: "var(--font-heading)", label: t("Frank Ruhl Libre (כותרת)") },
];

export const ALIGN_OPTIONS = [
  { value: "start", label: t("ימין"), icon: "AlignRight" },
  { value: "center", label: t("מרכז"), icon: "AlignCenter" },
  { value: "end", label: t("שמאל"), icon: "AlignLeft" },
];

export const DIRECTION_OPTIONS = [
  { value: "", label: t("ברירת מחדל") },
  { value: "rtl", label: "RTL" },
  { value: "ltr", label: "LTR" },
  { value: "auto", label: t("אוטומטי") },
];

export const DISPLAY_OPTIONS = [
  { value: "both", label: t("הצגה בגרסת מילוי + גרסת PDF") },
  { value: "fill", label: t("הצגה בגרסת מילוי בלבד") },
  { value: "pdf", label: t("הצגה בגרסת PDF בלבד") },
];

export const HEADING_LEVELS = [
  { value: "h1", label: t("כותרת ראשית") },
  { value: "h2", label: t("כותרת משנית") },
  { value: "h3", label: t("כותרת שלישית") },
];

export const defaultStyle = () => ({
  font_size: "default",
  font_family: "default",
  color: "",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: "",
  direction: "",
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
});

export const blockStyleToCss = (style = {}) => {
  style = style || {};
  const css = {};
  if (style.font_size && style.font_size !== "default") css.fontSize = style.font_size;
  if (style.font_family && style.font_family !== "default") css.fontFamily = style.font_family;
  if (style.color) css.color = style.color;
  if (style.bold) css.fontWeight = "700";
  if (style.italic) css.fontStyle = "italic";
  const deco = [];
  if (style.underline) deco.push("underline");
  if (style.strikethrough) deco.push("line-through");
  if (deco.length) css.textDecoration = deco.join(" ");
  if (style.align) css.textAlign = style.align;
  if (style.direction) css.direction = style.direction;
  const m = style.margin || {};
  if (m.top || m.right || m.bottom || m.left)
    css.margin = `${m.top || 0}px ${m.right || 0}px ${m.bottom || 0}px ${m.left || 0}px`;
  const p = style.padding || {};
  if (p.top || p.right || p.bottom || p.left)
    css.padding = `${p.top || 0}px ${p.right || 0}px ${p.bottom || 0}px ${p.left || 0}px`;
  return css;
};

export const ensureBlockStyle = (block) => ({
  ...block,
  style: { ...defaultStyle(), ...(block.style || {}) },
});

// אפשרויות רשימה ללא ערך ממשי (ריקות / רווחים בלבד) — לא נשמרות ולא מוצגות
export const cleanOptions = (options) =>
  (options || []).map((o) => (o ?? "").toString().trim()).filter(Boolean);

export const cleanBlocksForSave = (blocks) =>
  (blocks || []).map((b) => (Array.isArray(b.options) ? { ...b, options: cleanOptions(b.options) } : b));

// תנאי תצוגה — אותו היגיון בטופס המילוי, בתצוגת המסמך החתום וב-PDF
export const isBlockVisible = (block, values = {}) => {
  if (!block.conditional || !block.condition?.field_id) return true;
  return (values[block.condition.field_id] || "") === (block.condition.value || "");
};

// מזהה גרסה של הטופס (כותרת + בלוקים) — זהה למימוש בפונקציה submitSignature בשרת.
// משמש לוודא שהחותם שלח את הגרסה העדכנית ביותר של הטופס, כך שתמונת המצב שנשמרת
// היא בדיוק מה שהוצג לו.
const stableStringify = (v) => {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stableStringify(x))).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
};

const cyrb53 = (str) => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

export const formVersion = (form) => cyrb53(stableStringify({ title: form?.title ?? "", blocks: form?.blocks ?? [] }));