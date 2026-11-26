import React from "react";
import { isEn, setLang } from "@/i18n";

// Hebrew / English, saved in this browser
export default function LangSwitch({ className = "" }) {
  return (
    <button type="button" onClick={() => setLang(isEn ? "he" : "en")} lang={isEn ? "he" : "en"}
      className={`rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground ${className}`}>
      {isEn ? "עברית" : "English"}
    </button>
  );
}
