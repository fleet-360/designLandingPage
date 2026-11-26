import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

const ACTIONS = {
  create: { label: t("נוצר"), tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  update: { label: t("עודכן"), tone: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  delete: { label: t("נמחק"), tone: "bg-red-50 text-red-700 ring-red-600/20" },
  restore: { label: t("שוחזר"), tone: "bg-violet-50 text-violet-700 ring-violet-600/20" },
};

const ENTITIES = { customer: t("לקוח"), payment: t("תשלום"), collection: t("איסוף צ׳קים") };

const RESTORE_LABELS = {
  create: t("ביטול היצירה"),
  delete: t("שחזור"),
  update: t("החזרת המצב הקודם"),
};

function stamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(2)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function HistoryRow({ log, onRestore, restoring }) {
  const action = ACTIONS[log.action] || { label: log.action, tone: "bg-slate-100 text-slate-600 ring-slate-500/20" };
  const subtitle = [log.customer_name && log.customer_name !== log.title ? log.customer_name : "", log.details]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{stamp(log.created_at)}</span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", action.tone)}>
            {action.label}
          </span>
          <span className="text-sm font-medium text-foreground">{log.title || ENTITIES[log.entity] || ""}</span>
          <span className="text-xs text-muted-foreground">· {ENTITIES[log.entity] || log.entity}</span>
        </div>
        {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {t("בוצע על ידי {name}", { name: log.user_name || log.user_email || t("לא ידוע") })}
        </div>
      </div>

      {log.restorable && RESTORE_LABELS[log.action] && (
        <button
          type="button"
          onClick={() => onRestore?.(log)}
          disabled={restoring}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {RESTORE_LABELS[log.action]}
        </button>
      )}
    </li>
  );
}