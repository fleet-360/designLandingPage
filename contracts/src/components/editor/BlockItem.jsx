import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronUp, ChevronDown, Trash2, Upload, PenLine, GripVertical, Settings2 } from "lucide-react";
import { FIELD_TYPES, blockStyleToCss } from "@/lib/formUtils";
import { t } from "@/i18n";

const ctrlBtn = "rounded-md bg-card p-1.5 text-muted-foreground md:p-1";
const ctrlIcon = "h-4 w-4 md:h-3.5 md:w-3.5";

export default function BlockItem({ block, onChange, onRemove, onMove, onOpenSettings, onSelect, onActivate, first, last, dragHandleProps, isActive }) {
  const [uploading, setUploading] = useState(false);
  const style = blockStyleToCss(block.style);
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
    onChange({ content: file_url });
    setUploading(false);
  };

  return (
    <div
      data-block-item
      data-block-id={block.id}
      className={`group relative rounded-xl border p-3 transition-colors ${isActive ? "border-primary/40 bg-secondary/40" : "border-transparent hover:border-border/80 hover:bg-secondary/40"}`}
      onPointerDown={() => onActivate?.()}
      onClick={(e) => { if (e.target === e.currentTarget) onSelect?.(); }}
    >
      {/* controls — בדסקטופ מוצגים בריחוף או כשהאלמנט פעיל; במובייל מוצגים בלחיצה על האלמנט
          ומוסתרים בלחיצה מחוצה לו. כשהם מוסתרים הם גם לא לחיצים. */}
      <div
        className={`absolute -top-4 end-2 z-10 flex flex-row gap-0.5 rounded-lg bg-card/95 p-0.5 shadow-sm ring-1 ring-border/60 backdrop-blur-sm transition-opacity md:end-1 md:top-1 ${
          isActive ? "opacity-100" : "pointer-events-none opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100"
        }`}
      >
        <button
          type="button"
          {...(dragHandleProps || {})}
          title={t("גרירה לסידור")}
          className={`${ctrlBtn} cursor-grab hover:text-foreground active:cursor-grabbing`}
        >
          <GripVertical className={ctrlIcon} />
        </button>
        <button type="button" disabled={first} onClick={() => onMove(-1)} title={t("הזזה למעלה")} className={`${ctrlBtn} hover:text-foreground disabled:opacity-30`}><ChevronUp className={ctrlIcon} /></button>
        <button type="button" disabled={last} onClick={() => onMove(1)} title={t("הזזה למטה")} className={`${ctrlBtn} hover:text-foreground disabled:opacity-30`}><ChevronDown className={ctrlIcon} /></button>
        <button type="button" onClick={onOpenSettings} title={t("הגדרות")} className={`${ctrlBtn} hover:text-primary`}><Settings2 className={ctrlIcon} /></button>
        <button type="button" onClick={onRemove} title={t("מחיקה")} className={`${ctrlBtn} hover:text-destructive`}><Trash2 className={ctrlIcon} /></button>
      </div>

      <div onClick={() => onSelect?.()} className="cursor-pointer rounded-lg">
        {block.type === "title" && (
          <Input
            value={block.content || ""}
            onChange={(e) => onChange({ content: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder={t("כותרת")}
            style={style}
            className="h-auto border-0 bg-transparent px-0 font-heading text-2xl font-semibold shadow-none focus-visible:ring-0"
          />
        )}
        {block.type === "text" && (
          <Textarea
            value={block.content || ""}
            onChange={(e) => onChange({ content: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder={t("הקלידו את תוכן הסעיף...")}
            style={style}
            className="min-h-[90px] resize-y border-0 bg-transparent px-0 leading-7 shadow-none focus-visible:ring-0"
          />
        )}
        {block.type === "separator" && <hr className="my-2 border-border" style={style} />}
        {block.type === "image" && (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            {/* יישור וכיוון חלים על העוטף — על התמונה עצמה הם אינם משפיעים */}
            {block.content && (
              <div style={style}>
                <img src={block.content} alt="" className="inline-block h-auto max-h-60 max-w-full rounded-lg object-contain" style={block.width ? { width: `${block.width}px` } : undefined} />
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary">
              <Upload className="h-4 w-4" /> {uploading ? t("מעלה...") : block.content ? t("החלפת תמונה") : t("העלאת תמונה")}
              <input type="file" accept="image/*" className="hidden" onChange={upload} />
            </label>
          </div>
        )}
        {block.type === "signature" && (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <PenLine className="h-4 w-4 text-muted-foreground" />
              <Input value={block.label || ""} onChange={(e) => onChange({ label: e.target.value })} placeholder={t("תווית השדה")} style={style} className="h-9 max-w-xs bg-card" />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox checked={!!block.required} onCheckedChange={(v) => onChange({ required: !!v })} /> {t("חובה")}
              </label>
            </div>
            <div className="h-28 rounded-lg border border-dashed border-border bg-card/60" />
          </div>
        )}
        {block.type === "field" && (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={block.label || ""} onChange={(e) => onChange({ label: e.target.value })} placeholder={t("תווית השדה")} style={style} className="h-9 max-w-xs bg-card" />
              <select
                value={block.input_type || "text"}
                onChange={(e) => onChange({ input_type: e.target.value })}
                className="h-9 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {Object.entries(FIELD_TYPES).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox checked={!!block.required} onCheckedChange={(v) => onChange({ required: !!v })} /> {t("חובה")}
              </label>
            </div>
            {block.input_type === "textarea"
              ? <Textarea disabled placeholder={t("תצוגה מקדימה — טקסט ארוך")} style={style} className="min-h-[70px] resize-none bg-card/60" />
              : <Input disabled placeholder={block.input_type === "select" ? t("בחירה מרשימה - הערכים בהגדרות השדה") : FIELD_TYPES[block.input_type] || t("תצוגה מקדימה")} type={block.input_type === "number" ? "number" : block.input_type === "tel" ? "tel" : block.input_type === "email" ? "email" : block.input_type === "date" ? "date" : "text"} style={style} className="h-9 bg-card/60" />}
          </div>
        )}
      </div>
    </div>
  );
}