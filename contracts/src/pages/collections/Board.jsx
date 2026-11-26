import { History, Plus, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import CheckPickupsPanel from "@/collections/CheckPickupsPanel";
import CollectionDialog from "@/collections/CollectionDialog";
import ConfirmDialog from "@/collections/ConfirmDialog";
import CustomerAccordion from "@/collections/CustomerAccordion";
import CustomerDialog from "@/collections/CustomerDialog";
import PaymentDialog from "@/collections/PaymentDialog";
import { amountWithVat, formatMoney, summarizeCustomer } from "@/collections/format";
import { useAction, useBoard, useCollections, useSync } from "@/collections/queries";
import {
  deleteCollection,
  deleteCustomer,
  deletePayment,
  saveCollection,
  saveCustomer,
  savePayment,
  setCollectionStatus,
  setPaymentStatus,
  syncKaspitNow,
} from "@/collections/api";
import { t } from "@/i18n";

// /contracts/collections: customers and their payment schedules, check pickups, the Kaspit sync.
export default function CustomersPage() {
  const boardQuery = useBoard();
  const collectionsQuery = useCollections();

  const [search, setSearch] = useState("");
  const [customerForm, setCustomerForm] = useState(null);
  const [paymentForm, setPaymentForm] = useState(null);
  const [collectionForm, setCollectionForm] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const saveCustomerAction = useAction(saveCustomer, {
    success: t("הלקוח נשמר"),
    onDone: () => setCustomerForm(null),
  });
  const savePaymentAction = useAction(savePayment, {
    success: t("התשלום נשמר"),
    onDone: () => setPaymentForm(null),
  });
  const deleteCustomerAction = useAction(deleteCustomer, { success: t("הלקוח נמחק") });
  const deletePaymentAction = useAction(deletePayment, { success: t("התשלום נמחק") });
  const setPaymentStatusAction = useAction(setPaymentStatus, { success: t("התשלום סומן כשולם") });
  const setCollectionStatusAction = useAction(setCollectionStatus, { success: t("האיסוף סומן כנאסף") });
  const saveCollectionAction = useAction(saveCollection, {
    success: t("איסוף הצ׳קים נשמר"),
    onDone: () => setCollectionForm(null),
  });
  const deleteCollectionAction = useAction(deleteCollection, { success: t("האיסוף נמחק") });
  const syncQuery = useSync();
  const syncAction = useAction(syncKaspitNow, { success: syncMessage });

  const customers = boardQuery.data || [];
  const collections = collectionsQuery.data || [];

  const filtered = useMemo(() => {
    const term = search.trim();
    if (!term) return customers;
    return customers.filter(
      (customer) => customer.name.includes(term) || (customer.phone || "").includes(term),
    );
  }, [customers, search]);

  const totals = useMemo(() => {
    let open = 0;
    let total = 0;
    let overdue = 0;
    customers.forEach((customer) => {
      const summary = summarizeCustomer(customer);
      open += summary.remaining;
      total += summary.total;
      if (summary.state === "overdue") overdue += 1;
    });
    return { open, total, overdue };
  }, [customers]);

  // paid here and still open in Kaspit: the receipt is still to be issued there
  const receipts = useMemo(
    () =>
      customers.flatMap((customer) =>
        (customer.payments || [])
          .filter((payment) => payment.needs_receipt)
          .map((payment) => ({ ...payment, customer_name: customer.name })),
      ),
    [customers],
  );

  const findCustomer = (payment) => customers.find((customer) => customer.id === payment.customer_id) || null;

  const handleConfirm = () => {
    if (!confirmState) return;
    if (confirmState.kind === "customer") deleteCustomerAction.mutate({ id: confirmState.id });
    else if (confirmState.kind === "collection") deleteCollectionAction.mutate({ id: confirmState.id });
    else deletePaymentAction.mutate({ id: confirmState.id });
    setConfirmState(null);
  };

  return (
    <div className="collections-app pb-20 md:pb-0">
      <SyncBar sync={syncQuery.data} syncing={syncAction.isPending} onSync={() => syncAction.mutate()} />
      {receipts.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">
            {t("{what} אבל עדיין פתוח בכספית. צריך להפיק קבלה:", {
              what: receipts.length === 1 ? t("תשלום אחד שולם") : t("{n} תשלומים שולמו", { n: receipts.length }),
            })}
          </span>{" "}
          {receipts
            .map((payment) => `${payment.customer_name} (${payment.doc_number}, ${formatMoney(amountWithVat(payment))})`)
            .join(" · ")}
        </div>
      )}

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="micro">{t("נותר לגבייה · כולל מע״מ")}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="amount font-display text-[32px] font-extrabold leading-none text-foreground">
              {formatMoney(totals.open)}
            </span>
            <span className="amount text-sm text-muted-foreground">{t("מתוך {amount}", { amount: formatMoney(totals.total) })}</span>
            {totals.overdue > 0 && (
              <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                {t("{n} לקוחות באיחור", { n: totals.overdue })}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("חיפוש לקוח או טלפון")}
              className="h-10 w-full rounded-lg border border-input bg-white pe-3 ps-9 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30 sm:w-64"
            />
          </div>
          <button
            type="button"
            onClick={() => setCustomerForm({ customer: null })}
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            {t("לקוח חדש")}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-sm font-bold text-foreground">{t("לקוחות ולוחות תשלומים")}</h2>
            <span className="text-xs text-muted-foreground">{t("{n} לקוחות", { n: filtered.length })}</span>
          </div>

          {boardQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-14 animate-pulse rounded-md bg-slate-100" />
              ))}
            </div>
          ) : boardQuery.isError ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("לא הצלחנו לטעון את הנתונים. נסו לרענן את העמוד.")}
            </p>
          ) : filtered.length === 0 && customers.length > 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("לא נמצאו לקוחות מתאימים לחיפוש.")}
            </p>
          ) : (
            <CustomerAccordion
              customers={filtered}
              onAddCustomer={() => setCustomerForm({ customer: null })}
              onAddPayment={(customer) => setPaymentForm({ customer, payment: null })}
              onEditPayment={(payment) => setPaymentForm({ customer: findCustomer(payment), payment })}
              onMarkPaid={(payment) => setPaymentStatusAction.mutate({ id: payment.id, status: "paid" })}
              onDeletePayment={(payment) =>
                setConfirmState({ kind: "payment", id: payment.id, label: payment.description || t("התשלום") })
              }
              onEditCustomer={(customer) => setCustomerForm({ customer })}
              onDeleteCustomer={(customer) =>
                setConfirmState({ kind: "customer", id: customer.id, label: customer.name })
              }
            />
          )}
        </section>

        <aside className="lg:sticky lg:top-20">
          <CheckPickupsPanel
            collections={collections}
            onToggleCollected={(collection) =>
              setCollectionStatusAction.mutate({ id: collection.id, status: "collected" })
            }
            onSchedule={() => setCollectionForm({ collection: null })}
            onEdit={(collection) => setCollectionForm({ collection })}
            onDelete={(collection) =>
              setConfirmState({ kind: "collection", id: collection.id, label: collection.customer_name })
            }
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-white/95 p-3 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setCustomerForm({ customer: null })}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          {t("לקוח חדש")}
        </button>
      </div>

      <CustomerDialog
        open={!!customerForm}
        onOpenChange={(open) => !open && setCustomerForm(null)}
        customer={customerForm?.customer}
        onSave={(data) => saveCustomerAction.mutate(data)}
        saving={saveCustomerAction.isPending}
      />

      <PaymentDialog
        open={!!paymentForm}
        onOpenChange={(open) => !open && setPaymentForm(null)}
        customer={paymentForm?.customer}
        payment={paymentForm?.payment}
        onSave={(data) => savePaymentAction.mutate(data)}
        saving={savePaymentAction.isPending}
      />

      <CollectionDialog
        open={!!collectionForm}
        onOpenChange={(open) => !open && setCollectionForm(null)}
        customers={customers}
        collection={collectionForm?.collection}
        onSave={(data) => saveCollectionAction.mutate(data)}
        saving={saveCollectionAction.isPending}
      />

      <ConfirmDialog
        open={!!confirmState}
        onOpenChange={(open) => !open && setConfirmState(null)}
        title={
          confirmState?.kind === "customer"
            ? t("מחיקת לקוח")
            : confirmState?.kind === "collection"
              ? t("מחיקת איסוף צ׳קים")
              : t("מחיקת תשלום")
        }
        description={
          confirmState?.kind === "customer"
            ? t("כל התשלומים ואיסופי הצ׳קים של {name} יימחקו. אפשר לשחזר מההיסטוריה.", { name: confirmState?.label })
            : confirmState?.kind === "collection"
              ? t("האיסוף של {name} יימחק והצ׳קים יחזרו לממתינים. אפשר לשחזר מההיסטוריה.", { name: confirmState?.label })
              : t('התשלום "{name}" יימחק. אפשר לשחזר מההיסטוריה.', { name: confirmState?.label })
        }
        onConfirm={handleConfirm}
      />
    </div>
  );
}
const SYNC_ERRORS = { not_configured: t("פרטי הגישה לכספית לא הוגדרו בשרת"), busy: t("סנכרון אחר רץ כרגע"), sync_failed: t("הסנכרון מכספית נכשל") };

function syncMessage(r) {
  if (!r?.ok) return SYNC_ERRORS[r?.skipped || r?.error] || t("הסנכרון מכספית נכשל");
  const s = r.stats || {};
  const parts = [];
  if (s.added) parts.push(t("{n} מסמכים חדשים", { n: s.added }));
  if (s.attached) parts.push(t("{n} שויכו לתשלומים קיימים", { n: s.attached }));
  if (s.closed) parts.push(t("{n} סומנו כשולמו", { n: s.closed }));
  return parts.length ? t("סונכרן מכספית: {parts}", { parts: parts.join(", ") }) : t("סונכרן מכספית: אין שינויים");
}

function ago(iso) {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return t("עכשיו");
  if (min < 60) return t("לפני {n} דק׳", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("לפני {n} שע׳", { n: h });
  return new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Where the Kaspit sync stands, the "sync now" button and the way to the change log
function SyncBar({ sync, syncing, onSync }) {
  const last = sync?.lastSync;
  let text = t("טוען…");
  if (sync && !sync.configured) text = t("סנכרון כספית ממתין לפרטי גישה בשרת");
  else if (sync && !last) text = t("עוד לא בוצע סנכרון מכספית");
  else if (last) {
    text = last.ok
      ? t("סונכרן מכספית {ago} · {n} מסמכים פתוחים", { ago: ago(last.finished_at || last.started_at), n: last.stats?.open ?? 0 })
      : t("הסנכרון האחרון מכספית נכשל {ago}", { ago: ago(last.started_at) });
  }
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
      <span className={last && !last.ok ? "text-red-700" : ""}>{text}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSync}
          disabled={syncing || (sync && !sync.configured)}
          className="flex items-center gap-1 font-semibold text-foreground hover:underline disabled:opacity-50 disabled:hover:no-underline"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? t("מסנכרן…") : t("סנכרן עכשיו")}
        </button>
        <Link to="/collections/history" className="flex items-center gap-1 font-semibold text-foreground hover:underline">
          <History className="h-3.5 w-3.5" />
          {t("היסטוריית פעולות")}
        </Link>
      </div>
    </div>
  );
}
