import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import StatusBadge from "@/collections/StatusBadge";
import { formatDateLong, formatMoney } from "@/collections/format";
import { cn } from "@/lib/utils";

export default function CheckPickupsPanel({
  collections = [],
  onToggleCollected,
  onSchedule,
  onEdit,
  onDelete,
}) {
  const shown = [...collections]
    .filter((c) => c.status !== "cancelled")
    .sort((a, b) => String(a.collection_date).localeCompare(String(b.collection_date)));

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-display text-sm font-bold text-foreground">איסופי צ׳קים</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          מסונכרן
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">אין איסופים מתוכננים</p>
      ) : (
        <ul className="max-h-[26rem] divide-y divide-border/70 overflow-y-auto">
          {shown.map((collection) => (
            <li key={collection.id} className="flex items-start justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{collection.customer_name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{formatDateLong(collection.collection_date)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {collection.check_count} צ׳קים ·{" "}
                  <span className="amount font-semibold text-foreground">{formatMoney(collection.total_amount)}</span>
                </div>
                {(collection.contact_person || collection.address) && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[collection.contact_person, collection.address].filter(Boolean).join(" · ")}
                  </div>
                )}
                {collection.notes && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{collection.notes}</div>
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={collection.status} />
                <div className="flex items-center gap-0.5">
                  {collection.status === "scheduled" && (
                    <button
                      type="button"
                      onClick={() => onToggleCollected?.(collection)}
                      title="סמן כנאסף"
                      aria-label="סמן כנאסף"
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
                        "hover:bg-emerald-50 hover:text-emerald-700",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit?.(collection)}
                    title="עריכה"
                    aria-label="עריכת איסוף"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete?.(collection)}
                    title="מחיקה"
                    aria-label="מחיקת איסוף"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-border p-3">
        <button
          type="button"
          onClick={onSchedule}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          קביעת איסוף צ׳קים
        </button>
      </div>
    </section>
  );
}