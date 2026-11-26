import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Image } from "@/components/ui/image";
import {
  X, Settings, Upload, Bold, Italic, Underline, Strikethrough,
  AlignRight, AlignCenter, AlignLeft, HelpCircle,
} from "lucide-react";
import {
  FIELD_TYPES, FONT_SIZES, FONT_FAMILIES, DIRECTION_OPTIONS,
  DISPLAY_OPTIONS, HEADING_LEVELS, defaultStyle,
} from "@/lib/formUtils";
import { t, isEn } from "@/i18n";

const TYPE_LABELS = {
  title: t("כותרת"),
  text: t("טקסט"),
  image: t("תמונה"),
  separator: t("פס מפריד"),
  field: t("שדה למילוי"),
  signature: t("חתימה"),
};

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// align "start"/"end" follow the text direction: in English (LTR) start is on the left
const [StartIcon, EndIcon] = isEn ? [AlignLeft, AlignRight] : [AlignRight, AlignLeft];

const selectCls =
  "h-9 w-full rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function SpacingInputs({ label, value, onChange }) {
  const sides = [
    { key: "top", icon: "↑" },
    { key: "right", icon: "→" },
    { key: "bottom", icon: "↓" },
    { key: "left", icon: "←" },
  ];
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="grid grid-cols-4 gap-2">
        {sides.map((s) => (
          <div key={s.key} className="flex flex-col items-center gap-1">
            <Input
              type="number"
              value={value?.[s.key] ?? 0}
              onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) || 0 })}
              className="h-8 px-1.5 text-center text-sm"
            />
            <span className="text-[10px] text-muted-foreground">{s.icon}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToggleBtn({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md border text-sm transition-colors ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

export default function BlockSettings({ block, blocks, onChange, onClose }) {
  // סגירה במקש Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!block) return null;
  const style = { ...defaultStyle(), ...(block.style || {}) };
  const setStyle = (patch) => onChange({ style: { ...style, ...patch } });
  const set = (patch) => onChange(patch);
  const otherFields = blocks.filter((b) => b.type === "field" && b.id !== block.id);
  const condition = block.condition || { field_id: "", value: "" };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
    set({ content: file_url });
  };

  // מרונדר ב-portal ל-body — כך שהשכבה והפאנל לא מושפעים ממרווחים/פריסה של העמוד
  // ומכסים את כל המסך כולל כותרת האפליקציה
  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div data-block-settings dir={isEn ? "ltr" : "rtl"} className="fixed inset-y-0 end-0 z-50 flex w-[400px] max-w-[92vw] flex-col border-s border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Settings className="h-4 w-4 text-primary" /> {t("הגדרות אלמנט")}
          </div>
          <span className="w-8" />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <h2 className="text-lg font-semibold">{t("הגדרות {type}", { type: TYPE_LABELS[block.type] })}</h2>
            <p className="text-xs text-muted-foreground">{t("הגדירו את הנתונים המתאימים לאלמנט הנבחר")}</p>
          </div>

          {/* Content */}
          <Section title={t("תוכן")}>
            {block.type === "title" && (
              <>
                <Row label={t("טקסט")}>
                  <Input value={block.content || ""} onChange={(e) => set({ content: e.target.value })} placeholder={t("טקסט הכותרת")} />
                </Row>
                <Row label={t("סוג כותרת")}>
                  <select value={block.heading_level || "h2"} onChange={(e) => set({ heading_level: e.target.value })} className={selectCls}>
                    {HEADING_LEVELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Row>
              </>
            )}
            {block.type === "text" && (
              <Row label={t("טקסט")}>
                <Textarea value={block.content || ""} onChange={(e) => set({ content: e.target.value })} placeholder={t("הקלידו תוכן...")} className="min-h-[110px]" />
              </Row>
            )}
            {block.type === "image" && (
              <>
                <Row label={t("תמונה")}>
                  <div className="space-y-2">
                    {block.content && <Image src={block.content} fittingType="fit" className="max-h-40 w-full rounded-lg border border-border" />}
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-primary/60 bg-card px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent">
                      <Upload className="h-4 w-4" /> {block.content ? t("החלפת תמונה") : t("העלאת תמונה")}
                      <input type="file" accept="image/*" className="hidden" onChange={upload} />
                    </label>
                  </div>
                </Row>
                <Row label={t("רוחב תמונה (px)")}>
                  <Input type="number" value={block.width ?? ""} onChange={(e) => set({ width: Number(e.target.value) || undefined })} placeholder="200" />
                </Row>
              </>
            )}
            {(block.type === "field" || block.type === "signature") && (
              <>
                <Row label={t("תווית השדה")}>
                  <Input value={block.label || ""} onChange={(e) => set({ label: e.target.value })} placeholder={t("תווית")} />
                </Row>
                {block.type === "field" && (
                  <Row label={t("סוג קלט")}>
                    <select value={block.input_type || "text"} onChange={(e) => set({ input_type: e.target.value })} className={selectCls}>
                      {Object.entries(FIELD_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Row>
                )}
                {block.type === "field" && block.input_type === "select" && (
                  <Row label={t("אפשרויות בחירה")}>
                    <div className="space-y-2">
                      {(block.options || []).map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            value={opt}
                            onChange={(e) => {
                              const opts = [...(block.options || [])];
                              opts[i] = e.target.value;
                              set({ options: opts });
                            }}
                            placeholder={t("אפשרות {n}", { n: i + 1 })}
                            className="h-8"
                          />
                          <button
                            type="button"
                            onClick={() => set({ options: (block.options || []).filter((_, j) => j !== i) })}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => set({ options: [...(block.options || []), ""] })}
                        className="w-full rounded-md border border-dashed border-primary/50 py-1.5 text-xs font-medium text-primary hover:bg-accent"
                      >
                        {t("+ הוספת אפשרות")}
                      </button>
                    </div>
                  </Row>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!block.required} onCheckedChange={(v) => set({ required: !!v })} /> {t("שדה חובה")}
                </label>
              </>
            )}
            {block.type === "separator" && <p className="text-xs text-muted-foreground">{t("אלמנט פס מפריד — אין תוכן לעריכה.")}</p>}
          </Section>

          {/* Display */}
          <Section title={t("הצגת אלמנט")}>
            <Row label={t("הצגה")}>
              <select value={block.display || "both"} onChange={(e) => set({ display: e.target.value })} className={selectCls}>
                {DISPLAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Row>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!block.conditional} onCheckedChange={(v) => set({ conditional: !!v })} />
                {t("הצגה מותנית בערך של שדה אחר")}
              </label>
              <a className="flex items-center gap-1 ps-6 pt-1 text-xs text-blue-600" title={t("האלמנט יוצג רק כאשר שדה אחר מכיל את הערך שהוגדר")}>
                <HelpCircle className="h-3 w-3" /> {t("מה זה?")}
              </a>
              {block.conditional && (
                <div className="mt-2 space-y-2 rounded-lg border border-border bg-card p-2.5">
                  {otherFields.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("אין שדות אחרים בטופס לתנאי.")}</p>
                  ) : (
                    <>
                      <select
                        value={condition.field_id}
                        onChange={(e) => set({ condition: { ...condition, field_id: e.target.value } })}
                        className={selectCls}
                      >
                        <option value="">{t("בחרו שדה...")}</option>
                        {otherFields.map((f) => <option key={f.id} value={f.id}>{f.label || t("שדה")}</option>)}
                      </select>
                      <Input
                        value={condition.value}
                        onChange={(e) => set({ condition: { ...condition, value: e.target.value } })}
                        placeholder={t("ערך נדרש להצגה")}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* Default style */}
          {block.type !== "separator" && (
            <Section title={t("עיצוב ברירת מחדל / תצוגת מילוי")}>
              <div className="grid grid-cols-2 gap-2">
                <Row label={t("גודל פונט")}>
                  <select value={style.font_size} onChange={(e) => setStyle({ font_size: e.target.value })} className={selectCls}>
                    {FONT_SIZES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Row>
                <Row label={t("גופן")}>
                  <select value={style.font_family} onChange={(e) => setStyle({ font_family: e.target.value })} className={selectCls}>
                    {FONT_FAMILIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Row>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Row label={t("צבע טקסט")}>
                  <div className="flex items-center gap-2">
                    <input type="color" value={style.color || "#111111"} onChange={(e) => setStyle({ color: e.target.value })} className="h-9 w-9 cursor-pointer rounded-md border border-border bg-card p-0.5" />
                    <Input value={style.color || ""} onChange={(e) => setStyle({ color: e.target.value })} placeholder="#111111" className="h-9" />
                  </div>
                </Row>
                <Row label={t("כיוון כתיבה")}>
                  <select value={style.direction} onChange={(e) => setStyle({ direction: e.target.value })} className={selectCls}>
                    {DIRECTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Row>
              </div>
              <Row label={t("עיצוב טקסט")}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ToggleBtn active={style.bold} onClick={() => setStyle({ bold: !style.bold })} title={t("מודגש")}><Bold className="h-4 w-4" /></ToggleBtn>
                  <ToggleBtn active={style.italic} onClick={() => setStyle({ italic: !style.italic })} title={t("נטוי")}><Italic className="h-4 w-4" /></ToggleBtn>
                  <ToggleBtn active={style.underline} onClick={() => setStyle({ underline: !style.underline })} title={t("קו תחתי")}><Underline className="h-4 w-4" /></ToggleBtn>
                  <ToggleBtn active={style.strikethrough} onClick={() => setStyle({ strikethrough: !style.strikethrough })} title={t("קו חוצה")}><Strikethrough className="h-4 w-4" /></ToggleBtn>
                  <span className="mx-1 h-5 w-px bg-border" />
                  <ToggleBtn active={style.align === "start"} onClick={() => setStyle({ align: style.align === "start" ? "" : "start" })} title={t(isEn ? "שמאל" : "ימין")}><StartIcon className="h-4 w-4" /></ToggleBtn>
                  <ToggleBtn active={style.align === "center"} onClick={() => setStyle({ align: style.align === "center" ? "" : "center" })} title={t("מרכז")}><AlignCenter className="h-4 w-4" /></ToggleBtn>
                  <ToggleBtn active={style.align === "end"} onClick={() => setStyle({ align: style.align === "end" ? "" : "end" })} title={t(isEn ? "ימין" : "שמאל")}><EndIcon className="h-4 w-4" /></ToggleBtn>
                </div>
              </Row>
              <SpacingInputs label={t("מרווח חיצוני (margin)")} value={style.margin} onChange={(m) => setStyle({ margin: m })} />
              <SpacingInputs label={t("מרווח פנימי (padding)")} value={style.padding} onChange={(p) => setStyle({ padding: p })} />
            </Section>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}