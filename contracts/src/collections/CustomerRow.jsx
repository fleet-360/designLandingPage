import { CalendarClock, ChevronDown, Phone, Plus, Settings2, StickyNote, Trash2 } from "lucide-react";
import PaymentsTable from "@/collections/PaymentsTable";
import StatusBadge from "@/collections/StatusBadge";
import { formatDate, formatMoney, summarizeCustomer } from "@/collections/format";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export default function CustomerRow({
  customer,
  open,
  onToggle,
  onAddPayment,
  onEditPayment,
  onMarkPaid,
  onDeletePayment,
  onEditCustomer,
  onDeleteCustomer,
}) {
  const summary = summarizeCustomer(customer);
  const receipts = (customer.payments || []).filter((payment) => payment.needs_receipt).length;

  return (
    <div className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle?.(customer.id)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-3.5 text-start transition-colors sm:px-4",
          open ? "bg-slate-50" : "hover:bg-slate-50/70",
        )}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />

        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-semibold text-foreground">{customer.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {customer.phone ? (
              <span className="flex items-center gap-1 tabular-nums">
                <Phone className="h-3 w-3" />
                {customer.phone}
              </span>
            ) : (
              <span>{t("{n} תשלומים פתוחים", { n: summary.openCount })}</span>
            )}
            {customer.phone && summary.openCount > 0 ? <span>· {t("{n} פתוחים", { n: summary.openCount })}</span> : null}
            {receipts > 0 && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                {receipts === 1 ? t("קבלה להפקה") : t("{n} קבלות להפקה", { n: receipts })}
              </span>
            )}
          </div>
          {customer.notes && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
              <StickyNote className="h-3 w-3 shrink-0" />
              <span className="truncate">{customer.notes}</span>
            </div>
          )}
        </div>

        <div className="hidden w-32 shrink-0 text-end sm:block">
          <div className="text-xs text-muted-foreground">{t("נותר לגבייה")}</div>
          <div className="amount mt-0.5 font-display text-sm font-extrabold text-foreground">
            {formatMoney(summary.remaining)}
          </div>
          <div className="amount text-[11px] text-muted-foreground">{t("מתוך {amount}", { amount: formatMoney(summary.total) })}</div>
        </div>

        <div className="hidden w-24 shrink-0 text-end md:block">
          <div className="text-xs text-muted-foreground">{t("תשלום הבא")}</div>
          <div className="mt-0.5 text-sm tabular-nums text-foreground">{formatDate(summary.nextDate)}</div>
        </div>

        <div className="shrink-0">
          <StatusBadge status={summary.state} />
        </div>

        <div className="hidden w-[104px] shrink-0 justify-end md:flex">
          {summary.pickupDate ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
              <CalendarClock className="h-3.5 w-3.5" />
              {formatDate(summary.pickupDate)}
            </span>
          ) : null}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/70 bg-slate-50/60 px-3 pb-4 pt-3 sm:px-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="micro">{t("לוח תשלומים")}</h4>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onDeleteCustomer?.(customer)}
                title={t("מחיקת לקוח")}
                aria-label={t("מחיקת לקוח")}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onEditCustomer?.(customer)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" />
                {t("פרטי לקוח")}
              </button>
              <button
                type="button"
                onClick={() => onAddPayment?.(customer)}
                className="flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("תשלום")}
              </button>
            </div>
          </div>

          {(customer.internal_owner || customer.project_stages || customer.notes) && (
            <div className="mb-3 rounded-md border border-border bg-white px-3 py-2">
              {customer.internal_owner && (
                <p className="text-xs text-muted-foreground">
                  {t("אחראי פנימי:")} <span className="font-semibold text-foreground">{customer.internal_owner}</span>
                </p>
              )}
              {customer.project_stages && (
                <p className="mt-1 whitespace-pre-line text-xs leading-5 text-foreground">{customer.project_stages}</p>
              )}
              {customer.notes && (
                <div className="mt-1 flex gap-1.5 whitespace-pre-line text-xs leading-5 text-foreground">
                  <StickyNote className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>{customer.notes}</span>
                </div>
              )}
            </div>
          )}

          <PaymentsTable
            payments={customer.payments || []}
            onMarkPaid={onMarkPaid}
            onEdit={onEditPayment}
            onDelete={onDeletePayment}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {t("נותר לגבייה:")}{" "}
              <span className="amount font-semibold text-foreground">{formatMoney(summary.remaining)}</span>
              {" "}{t("מתוך")} <span className="amount font-semibold text-foreground">{formatMoney(summary.total)}</span>
              {" "}{t("(כולל מע״מ)")}
            </span>
            <span>
              {t("תשלום הבא:")} <span className="font-semibold text-foreground">{formatDate(summary.nextDate)}</span>
            </span>
            {summary.blockedTotal > 0 && (
              <span>
                {t("מתוכם לא לגבות כרגע:")}{" "}
                <span className="amount font-semibold text-foreground">{formatMoney(summary.blockedTotal)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}