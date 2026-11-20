import React from "react";
import { Eye, Trash2 } from "lucide-react";
import { fmtDate } from "@/lib/formUtils";

export default function SubmissionRow({ sub, fields, gridTemplateColumns, getValue, onDelete, onView }) {
  return (
    <div className="grid items-center gap-3 rounded-2xl border border-border/70 bg-card px-5 py-3.5 text-sm" style={{ gridTemplateColumns }}>
      {fields.map((f) => {
        const v = getValue(sub, f);
        return <span key={f.key} className={`truncate ${v ? "text-foreground" : "text-muted-foreground/60"}`} title={v}>{v || "—"}</span>;
      })}
      <span className="inline-flex w-fit rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">נחתם</span>
      <span className="whitespace-nowrap text-muted-foreground">{fmtDate(sub.created_date)}</span>
      <div className="flex items-center justify-end gap-1">
        <button type="button" onClick={() => onView(sub)} title="צפייה והורדת PDF" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          <Eye className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onDelete(sub)} title="מחיקה" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}