import React from "react";
import { Type, AlignRight, Minus, Image, TextCursorInput, PenLine } from "lucide-react";

const ITEMS = [
  { type: "title", label: "כותרת", desc: "כותרת ראשית או תת כותרת", icon: Type },
  { type: "text", label: "טקסט", desc: "פסקה, סעיף או תוכן משפטי", icon: AlignRight },
  { type: "image", label: "תמונה", desc: "לוגו או תמונה במסמך", icon: Image },
  { type: "separator", label: "פס מפריד", desc: "קו מפריד בין חלקים", icon: Minus },
  { type: "field", label: "שדה למילוי", desc: "שדה טקסט שהלקוח ממלא", icon: TextCursorInput },
  { type: "signature", label: "חתימה", desc: "משטח חתימה ללקוח", icon: PenLine },
];

export default function BlockPalette({ onAdd }) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-medium text-muted-foreground">לחצו על אלמנט להוספתו לסוף המסמך</p>
      {ITEMS.map(({ type, label, desc, icon: Icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => onAdd(type)}
          className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-right transition-all hover:border-primary/40 hover:bg-accent/40"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground/70"><Icon className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{label}</span>
            <span className="block truncate text-xs text-muted-foreground">{desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}