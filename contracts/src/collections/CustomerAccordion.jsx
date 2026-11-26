import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import CustomerRow from "@/collections/CustomerRow";
import PaymentsTable from "@/collections/PaymentsTable";
import StatusBadge from "@/collections/StatusBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatMoney, summarizeCustomer } from "@/collections/format";
import { t } from "@/i18n";

export default function CustomerAccordion({
  customers = [],
  onAddPayment,
  onEditPayment,
  onMarkPaid,
  onDeletePayment,
  onEditCustomer,
  onDeleteCustomer,
  onAddCustomer,
}) {
  const isMobile = useIsMobile();
  const [openId, setOpenId] = useState(null);
  const [sheetId, setSheetId] = useState(null);

  const sheetCustomer = useMemo(() => customers.find((c) => c.id === sheetId) || null, [customers, sheetId]);

  if (!customers.length) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="font-display text-base font-semibold text-foreground">{t("אין לקוחות עדיין")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("הוסיפו לקוח ראשון כדי להתחיל לנהל גבייה.")}</p>
        <button
          type="button"
          onClick={onAddCustomer}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          {t("לקוח חדש")}
        </button>
      </div>
    );
  }

  if (isMobile) {
    const summary = sheetCustomer ? summarizeCustomer(sheetCustomer) : null;
    return (
      <>
        <div className="divide-y divide-border/70">
          {customers.map((customer) => {
            const s = summarizeCustomer(customer);
            return (
              <button
                key={customer.id}
                type="button"
                onClick={() => setSheetId(customer.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors active:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[15px] font-semibold text-foreground">{customer.name}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.openCount ? t("{n} תשלומים פתוחים", { n: s.openCount }) : t("אין תשלומים פתוחים")}
                  </div>
                  {customer.notes && (
                    <div className="mt-0.5 truncate text-xs text-amber-700">{customer.notes}</div>
                  )}
                </div>
                <div className="text-end">
                  <div className="amount font-display text-sm font-extrabold text-foreground">
                    {formatMoney(s.remaining)}
                  </div>
                  <div className="amount text-[11px] text-muted-foreground">{t("מתוך {amount}", { amount: formatMoney(s.total) })}</div>
                  <div className="mt-1 flex justify-end">
                    <StatusBadge status={s.state} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <Drawer open={!!sheetCustomer} onOpenChange={(v) => !v && setSheetId(null)}>
          <DrawerContent className="collections-app max-h-[88vh]">
            <DrawerHeader className="border-b border-border pb-3 text-start">
              <DrawerTitle className="font-display text-lg font-bold">{sheetCustomer?.name}</DrawerTitle>
              <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {t("נותר לגבייה:")}{" "}
                  <span className="amount font-semibold text-foreground">{formatMoney(summary?.remaining || 0)}</span>
                  {" "}{t("מתוך")}{" "}
                  <span className="amount font-semibold text-foreground">{formatMoney(summary?.total || 0)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onEditCustomer?.(sheetCustomer)}
                  className="text-xs font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  {t("פרטי לקוח")}
                </button>
              </div>
            </DrawerHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {sheetCustomer?.notes && (
                <div className="mb-3 whitespace-pre-line rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs leading-5 text-foreground">
                  <span className="micro mb-0.5 block text-amber-700">{t("הערות")}</span>
                  {sheetCustomer.notes}
                </div>
              )}
              <PaymentsTable
                payments={sheetCustomer?.payments || []}
                onMarkPaid={onMarkPaid}
                onEdit={onEditPayment}
                onDelete={onDeletePayment}
              />
            </div>

            <div className="border-t border-border p-4">
              <button
                type="button"
                onClick={() => {
                  onAddPayment?.(sheetCustomer);
                  setSheetId(null);
                }}
                className="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                {t("הוספת תשלום")}
              </button>
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <div>
      {customers.map((customer) => (
        <CustomerRow
          key={customer.id}
          customer={customer}
          open={openId === customer.id}
          onToggle={(id) => setOpenId((prev) => (prev === id ? null : id))}
          onAddPayment={onAddPayment}
          onEditPayment={onEditPayment}
          onMarkPaid={onMarkPaid}
          onDeletePayment={onDeletePayment}
          onEditCustomer={onEditCustomer}
          onDeleteCustomer={onDeleteCustomer}
        />
      ))}
    </div>
  );
}