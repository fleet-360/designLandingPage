// Hebrew / English. The Hebrew text is the key: t("שמירה") is "שמירה" in Hebrew and the entry of
// src/i18n/*.js in English (the Hebrew itself when an entry is missing). Values: t("{n} ימים", { n }).
// The language is read once at load; switching it reloads the page, so module-level text follows.
const KEY = "lang";

export const lang = (() => {
  try { return localStorage.getItem(KEY) === "en" ? "en" : "he"; } catch { return "he"; }
})();
export const isEn = lang === "en";

const en = Object.assign({}, ...Object.values(import.meta.glob("./i18n/*.js", { eager: true })).map((m) => m.default));

export function t(he, vars) {
  const s = isEn ? en[he] ?? he : he;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m)) : s;
}

export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch { /* private window: stays for this load only */ }
  window.location.reload();
}

// <html lang dir>, before the first render
export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = isEn ? "ltr" : "rtl";
}
