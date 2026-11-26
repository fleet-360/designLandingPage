import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SignaturePad from "@/components/sign/SignaturePad";
import { blockStyleToCss, cleanOptions, isBlockVisible } from "@/lib/formUtils";
import { t as tr, isEn } from "@/i18n";

export default function SignBlock({ block, value, onChange, padRef, allValues = {}, invalid }) {
  // conditional display
  if (!isBlockVisible(block, allValues)) return null;
  // display mode: hide pdf-only blocks in fill view
  if (block.display === "pdf") return null;

  const style = blockStyleToCss(block.style);
  const invalidCls = invalid ? "border-destructive focus-visible:ring-destructive" : "";

  if (block.type === "title") {
    const Tag = block.heading_level === "h1" ? "h1" : block.heading_level === "h3" ? "h3" : "h2";
    const sizes = { h1: "text-3xl", h2: "text-2xl", h3: "text-xl" };
    return <Tag style={style} className={`${sizes[Tag === "h1" ? "h1" : Tag === "h3" ? "h3" : "h2"]} font-semibold leading-snug`}>{block.content}</Tag>;
  }
  if (block.type === "text") return <p style={style} className="whitespace-pre-wrap leading-8 text-foreground/85">{block.content}</p>;
  if (block.type === "separator") return <hr style={style} className="my-2 border-border" />;
  if (block.type === "image")
    return block.content ? (
      // יישור וכיוון חלים על העוטף — על התמונה עצמה הם אינם משפיעים
      <div style={style}>
        <img src={block.content} alt="" className="inline-block h-auto max-h-72 max-w-full rounded-lg object-contain" style={block.width ? { width: `${block.width}px` } : undefined} />
      </div>
    ) : null;
  if (block.type === "field") {
    const t = block.input_type || "text";
    const common = { value: value || "", onChange: (e) => onChange(e.target.value), className: `bg-white ${invalidCls}`, style };
    return (
      <div style={style} className="space-y-1.5">
        <label className={`text-sm font-medium ${invalid ? "text-destructive" : ""}`}>{block.label}{block.required && <span className="text-destructive"> *</span>}</label>
        {t === "select" ? (
          <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className={`h-9 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-1 ${invalid ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring"}`}
            style={style}
          >
            <option value="">{tr("בחרו...")}</option>
            {cleanOptions(block.options).map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        ) : t === "textarea"
          ? <Textarea {...common} placeholder={tr("הקלידו כאן...")} className={`min-h-[90px] resize-y bg-white ${invalidCls}`} />
          : <Input {...common} dir={t === "email" || t === "tel" || t === "date" || t === "number" ? "ltr" : isEn ? "ltr" : "rtl"} type={t} placeholder={tr("הקלידו...")} />}
      </div>
    );
  }
  if (block.type === "signature")
    return (
      <div style={style} className="space-y-1.5">
        <label className={`text-sm font-medium ${invalid ? "text-destructive" : ""}`}>{block.label}{block.required && <span className="text-destructive"> *</span>}</label>
        <div className={invalid ? "rounded-xl ring-2 ring-destructive" : ""}>
          <SignaturePad ref={padRef} />
        </div>
      </div>
    );
  return null;
}