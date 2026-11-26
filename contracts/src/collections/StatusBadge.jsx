import { cn } from "@/lib/utils";
import { t } from "@/i18n";

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-slate-100 text-slate-600 ring-slate-500/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

const LABELS = {
  paid: { label: t("שולם"), tone: "green" },
  pending: { label: t("ממתין"), tone: "amber" },
  overdue: { label: t("באיחור"), tone: "red" },
  cancelled: { label: t("בוטל"), tone: "gray" },
  blocked: { label: t("לא לגבות"), tone: "violet" },
  scheduled: { label: t("מתוכנן"), tone: "amber" },
  collected: { label: t("נאסף"), tone: "green" },
  clear: { label: t("אין יתרה"), tone: "green" },
  empty: { label: t("ללא תשלומים"), tone: "gray" },
};

export default function StatusBadge({ status, className }) {
  const config = LABELS[status] || { label: status, tone: "gray" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap",
        TONES[config.tone],
        className,
      )}
    >
      {config.label}
    </span>
  );
}