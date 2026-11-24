import { useState } from "react";
import { Check, FileText, Pencil, Trash2 } from "lucide-react";
import InvoiceViewer from "@/collections/InvoiceViewer";
import StatusBadge from "@/collections/StatusBadge";
import { useSync } from "@/collections/queries";
import {
  amountBeforeVat,
  amountWithVat,
  docTypeLabel,
  formatDate,
  formatMoney,
  methodLabel,
  paymentState,
} from "@/collections/format";
import { cn } from "@/lib/utils";

const CHIP_TONES = {
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

function Chip({ tone, children }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", CHIP_TONES[tone])}>
      {children}
    </span>
  );
}

function docLine(payment) {
  const parts = [];
  const type = docTypeLabel(payment.doc_type);
  if (type && payment.doc_number) parts.push(`${type} ${payment.doc_number}`);
  else if (type) parts.push(type);
  else if (payment.doc_number) parts.push(payment.doc_number);
  if (payment.doc_date) parts.push(formatDate(payment.doc_date));
  if (payment.receipt_number) parts.push(`קבלה ${payment.receipt_number}`);
  if (payment.milestone) parts.push(payment.milestone);
  if (payment.billing_name) parts.push(`ע״ש ${payment.billing_name}`);
  return parts.join(" · ");
}

// a payment whose document Kaspit can print: tied to a Kaspit document, or with a document number to look up
export const hasDocument = (payment) => Boolean(payment.kaspit_document_id || payment.doc_number);

export default function PaymentsTable({ payments = [], onMarkPaid, onEdit, onDelete }) {
  const sync = useSync();
  const canView = Boolean(sync.data?.configured);
  const [viewing, setViewing] = useState(null);

  if (!payments.length) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
        אין תשלומים עדיין
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/70 overflow-hidden rounded-md border border-border bg-white">
      <div className="hidden items-center gap-3 bg-slate-50/80 px-4 py-2 text-xs font-semibold text-muted-foreground sm:flex">
        <span className="w-16 shrink-0">תאריך</span>
        <span className="min-w-0 flex-1">תיאור ומסמך</span>
        <span className="w-28 shrink-0">סכום</span>
        <span className="w-28 shrink-0">אמצעי תשלום</span>
        <span className="w-20 shrink-0">סטטוס</span>
        <span className="ms-auto w-[144px] shrink-0 text-left">פעולות</span>
      </div>

      {payments.map((payment) => (
        <div
          key={payment.id}
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap",
            payment.status === "cancelled" && "opacity-50",
          )}
        >
          <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatDate(payment.due_date)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-foreground">{payment.description || "תשלום"}</span>
              {payment.needs_review && <Chip tone="amber">לאימות</Chip>}
              {payment.source === "kaspit" && <Chip tone="blue">מכספית</Chip>}
              {payment.source === "deal" && <Chip tone="blue">מהסכם חתום</Chip>}
              {payment.needs_receipt && <Chip tone="amber">להפיק קבלה בכספית</Chip>}
              {payment.kaspit_open === true && !payment.needs_receipt && payment.source !== "kaspit" && (
                <Chip tone="blue">פתוח בכספית</Chip>
              )}
              {payment.method === "check" && payment.check_received && <Chip tone="green">צ׳קים ביד</Chip>}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {docLine(payment)}
              <span className="sm:hidden"> · {methodLabel(payment.method)}</span>
            </div>
          </div>

          <div className="w-28 shrink-0">
            <div className="amount text-sm font-semibold text-foreground">{formatMoney(amountWithVat(payment))}</div>
            <div className="text-[11px] leading-tight text-muted-foreground">
              כולל מע״מ · {formatMoney(amountBeforeVat(payment))} לפני
            </div>
          </div>

          <div className="hidden w-28 shrink-0 text-xs text-muted-foreground sm:block">
            {methodLabel(payment.method)}
            {payment.method === "check" && payment.check_number ? ` · ${payment.check_number}` : ""}
          </div>

          <div className="w-20 shrink-0">
            <StatusBadge status={paymentState(payment)} />
          </div>

          <div className="ms-auto flex shrink-0 items-center gap-1">
            {canView && hasDocument(payment) && (
              <button
                type="button"
                onClick={() => setViewing(payment)}
                title="צפייה במסמך מכספית"
                aria-label="צפייה במסמך מכספית"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sky-50 hover:text-sky-700"
              >
                <FileText className="h-4 w-4" />
              </button>
            )}
            {payment.status !== "paid" && (
              <button
                type="button"
                onClick={() => onMarkPaid?.(payment)}
                title="סמן כשולם"
                aria-label="סמן כשולם"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-emerald-50 hover:text-emerald-700"
              >
                <Check className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit?.(payment)}
              title="עריכה"
              aria-label="עריכת תשלום"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(payment)}
              title="מחיקה"
              aria-label="מחיקת תשלום"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      <InvoiceViewer payment={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}