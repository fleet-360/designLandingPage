import { ArrowRight, History } from "lucide-react";
import { Link } from "react-router-dom";
import HistoryRow from "@/collections/HistoryRow";
import { useAction, useActivity } from "@/collections/queries";
import { restoreActivity } from "@/collections/api";
import { t } from "@/i18n";

// /contracts/collections/history: every change in collections, who made it, and undo
export default function HistoryPage() {
  const activityQuery = useActivity();
  const restore = useAction(restoreActivity, { success: t("הפעולה שוחזרה") });
  const rows = activityQuery.data || [];

  return (
    <div className="collections-app">
      <Link to="/collections" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-3.5 w-3.5 ltr:-scale-x-100" />
        {t("חזרה ללקוחות")}
      </Link>
      <div className="mb-4">
        <h1 className="font-display text-lg font-bold text-foreground">{t("היסטוריית פעולות")}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("כל יצירה, עדכון ומחיקה — מי ביצע ומתי. אפשר לשחזר רשומה שנמחקה או להחזיר מצב קודם.")}
        </p>
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-white">
        {activityQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-12 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <History className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("עדיין אין פעולות במערכת")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {rows.map((log) => (
              <HistoryRow
                key={log.id}
                log={log}
                onRestore={(entry) => restore.mutate({ id: entry.id })}
                restoring={restore.isPending}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}