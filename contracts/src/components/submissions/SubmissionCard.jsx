import React from "react";
import { Eye, Trash2 } from "lucide-react";
import { fmtDate } from "@/lib/formUtils";
import { t } from "@/i18n";

export default function SubmissionCard({ sub, fields, getValue, onDelete, onView }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">{t("נחתם")}</span>
        <span className="text-xs text-muted-foreground">{fmtDate(sub.created_date)}</span>
      </div>
      {/* בכרטיס מוצגים רק שדות שמולאו — השדות מכל גרסאות הטופס מופיעים בטבלה ובייצוא */}
      <dl className="space-y-1.5">
        {fields.map((f) => ({ f, v: getValue(sub, f) })).filter(({ v }) => v).map(({ f, v }) => (
          <div key={f.key} className="flex items-baseline gap-2 text-sm">
            <dt className="w-32 shrink-0 truncate text-muted-foreground" title={f.label}>{f.label}</dt>
            <dd className="min-w-0 flex-1 truncate font-medium" title={v}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-end gap-1 border-t border-border/60 pt-3">
        <button type="button" onClick={() => onView(sub)} title={t("צפייה והורדת PDF")} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          <Eye className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onDelete(sub)} title={t("מחיקה")} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}