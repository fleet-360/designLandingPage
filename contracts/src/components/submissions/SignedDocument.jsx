import React from "react";
import { blockStyleToCss, isBlockVisible } from "@/lib/formUtils";
import { t } from "@/i18n";

// מציג את המסמך החתום בגרסת PDF — מילוי ערכים, סגנון PDF, ותמונת חתימה.
// תמיד מקבל את תמונת המצב של הטופס מעת השליחה — כך שהמסמך מוצג בדיוק כפי שהוצג לחותם.
// signatureUrls — חתימה לכל בלוק חתימה; ברשומות ישנות (ללא מפה) אותה signatureUrl מוצגת בכל בלוק.
export default function SignedDocument({ form, values = {}, signatureUrl, signatureUrls }) {
  const blocks = (form.blocks || []).filter((b) => b.display !== "fill" && isBlockVisible(b, values));

  const renderBlock = (b) => {
    const raw = b.has_pdf_style ? (b.pdf_style || b.style) : b.style;
    const style = blockStyleToCss(raw || {});

    if (b.type === "title") {
      const Tag = b.heading_level === "h1" ? "h1" : b.heading_level === "h3" ? "h3" : "h2";
      const sizes = { h1: "24px", h2: "20px", h3: "18px" };
      return (
        <Tag key={b.id} style={{ ...style, fontSize: style.fontSize || sizes[Tag], fontWeight: style.fontWeight || 700, lineHeight: 1.3 }}>
          {b.content}
        </Tag>
      );
    }
    if (b.type === "text")
      return <p key={b.id} style={{ ...style, whiteSpace: "pre-wrap", lineHeight: 1.8, color: style.color || "#374151" }}>{b.content}</p>;
    if (b.type === "separator")
      return <hr key={b.id} style={{ ...style, border: 0, borderTop: "1px solid #d6d3d1", margin: "12px 0" }} />;
    if (b.type === "image")
      return b.content ? (
        <div key={b.id} style={style}>
          <img src={b.content} alt="" style={{ display: "inline-block", maxWidth: "100%", height: "auto", ...(b.width ? { width: b.width } : {}) }} />
        </div>
      ) : null;
    if (b.type === "field")
      return (
        <div key={b.id} style={{ ...style, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#57534e" }}>{b.label}</div>
          <div style={{ borderBottom: "1px solid #a8a29e", paddingBottom: 6, minHeight: 22, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#1c1917" }}>
            {values[b.id] || ""}
          </div>
        </div>
      );
    if (b.type === "signature") {
      const url = signatureUrls ? signatureUrls[b.id] : signatureUrl;
      return (
        <div key={b.id} style={{ ...style, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#57534e" }}>{b.label}</div>
          {url ? (
            <img src={url} alt={t("חתימה")} style={{ maxHeight: 120, objectFit: "contain" }} crossOrigin="anonymous" />
          ) : (
            <div style={{ borderBottom: "1px solid #a8a29e", height: 80 }} />
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div dir="rtl" style={{ width: 800, background: "#fff", padding: 40, boxSizing: "border-box", fontFamily: "var(--font-body), sans-serif" }}>
      {blocks.map(renderBlock)}
    </div>
  );
}