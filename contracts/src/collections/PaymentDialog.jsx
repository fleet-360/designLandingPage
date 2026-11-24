import { useState } from "react";
import FormField, { inputClass } from "@/collections/FormField";
import ResponsiveSheet from "@/collections/ResponsiveSheet";
import { Textarea } from "@/components/ui/textarea";
import KaspitDocPicker from "@/collections/KaspitDocPicker";
import { useSync } from "@/collections/queries";
import {
  DOC_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  amountWithVat,
  docTypeLabel,
  formatMoney,
} from "@/collections/format";

export default function PaymentDialog({ open, onOpenChange, customer, payment, onSave, saving }) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={payment ? "עריכת תשלום" : "תשלום חדש"}
      description={customer ? `עבור ${customer.name}` : undefined}
    >
      <PaymentForm
        key={payment?.id || `new-${customer?.id || ""}`}
        customer={customer}
        payment={payment}
        saving={saving}
        onSave={onSave}
        onCancel={() => onOpenChange(false)}
      />
    </ResponsiveSheet>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-white p-3">
      <p className="micro">{title}</p>
      {children}
    </div>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-input accent-slate-900"
      />
      {label}
    </label>
  );
}

function PaymentForm({ customer, payment, onSave, saving, onCancel }) {
  const [form, setForm] = useState({
    description: payment?.description || "",
    milestone: payment?.milestone || "",
    amount: payment?.amount != null ? String(payment.amount) : "",
    vat_included: payment?.vat_included !== false,
    due_date: payment?.due_date || "",
    method: payment?.method || "check",
    status: payment?.status || "pending",
    doc_type: payment?.doc_type || "tax_invoice",
    doc_number: payment?.doc_number || "",
    doc_date: payment?.doc_date || "",
    billing_name: payment?.billing_name || "",
    receipt_number: payment?.receipt_number || "",
    receipt_date: payment?.receipt_date || "",
    check_number: payment?.check_number || "",
    collection_date: payment?.collection_date || "",
    check_received: !!payment?.check_received,
    needs_review: !!payment?.needs_review,
    notes: payment?.notes || "",
    kaspit_document_id: payment?.kaspit_document_id || "",
  });
  // the Kaspit document the form is tied to, as the picker shows it
  const [linked, setLinked] = useState(() =>
    payment?.kaspit_document_id
      ? {
          id: payment.kaspit_document_id,
          number: payment.doc_number,
          type_label: docTypeLabel(payment.doc_type) || "מסמך",
          total: null,
          date: payment.doc_date,
          open: payment.kaspit_open ?? null,
        }
      : null,
  );
  const sync = useSync();
  const kaspitOn = Boolean(sync.data?.configured);

  const pick = (doc) => {
    setLinked(doc);
    setForm((prev) => ({
      ...prev,
      kaspit_document_id: doc.id,
      doc_number: doc.number,
      doc_type: doc.doc_type,
      doc_date: doc.date || prev.doc_date,
      amount: prev.amount || String(doc.total),
      vat_included: prev.amount ? prev.vat_included : true,
      description: prev.description || doc.details || "",
      due_date: prev.due_date || doc.due || "",
    }));
  };
  const unlink = () => {
    setLinked(null);
    setForm((prev) => ({ ...prev, kaspit_document_id: "", doc_number: "", doc_date: "" }));
  };
  const gross = amountWithVat({ amount: form.amount, vat_included: form.vat_included });
  const amountDiffers = linked?.total != null && Number(form.amount) > 0 && Math.abs(gross - linked.total) >= 1;

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const toggle = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));
  const isCheck = form.method === "check";
  const valid = Number(form.amount) > 0;

  const submit = (event) => {
    event.preventDefault();
    if (!valid) return;
    onSave({
      ...(payment?.id ? { id: payment.id } : {}),
      customer_id: customer?.id || payment?.customer_id,
      description: form.description,
      milestone: form.milestone,
      amount: Number(form.amount),
      vat_included: form.vat_included,
      due_date: form.due_date || "",
      method: form.method,
      status: form.status,
      doc_type: form.doc_type,
      doc_number: form.doc_number,
      doc_date: form.doc_date || "",
      billing_name: form.billing_name,
      receipt_number: form.status === "paid" ? form.receipt_number : "",
      receipt_date: form.status === "paid" ? form.receipt_date || "" : "",
      check_number: isCheck ? form.check_number : "",
      collection_date: isCheck ? form.collection_date || "" : "",
      check_received: isCheck ? form.check_received : false,
      needs_review: form.needs_review,
      notes: form.notes,
      kaspit_document_id: form.kaspit_document_id,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Section title="פרטי התשלום">
        <FormField label="תיאור">
          <input value={form.description} onChange={set("description")} className={inputClass} placeholder="עבור מה התשלום" />
        </FormField>
        <FormField label="אבן דרך / תנאי תשלום">
          <input
            value={form.milestone}
            onChange={set("milestone")}
            className={inputClass}
            placeholder="לדוגמה: עם תחילת שלב 3"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="סכום (₪)">
            <input
              value={form.amount}
              onChange={set("amount")}
              className={`${inputClass} amount`}
              inputMode="decimal"
              placeholder="0"
              dir="ltr"
            />
          </FormField>
          <FormField label="תאריך לתשלום">
            <input type="date" value={form.due_date} onChange={set("due_date")} className={inputClass} dir="ltr" />
          </FormField>
        </div>
        <Check label="הסכום כולל מע״מ" checked={form.vat_included} onChange={toggle("vat_included")} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="אופן תשלום">
            <select value={form.method} onChange={set("method")} className={inputClass}>
              {PAYMENT_METHODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="סטטוס">
            <select value={form.status} onChange={set("status")} className={inputClass}>
              {PAYMENT_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </Section>

      <Section title="מסמך">
        {kaspitOn && (
          <KaspitDocPicker customer={customer} payment={payment} linked={linked} onPick={pick} onUnlink={unlink} />
        )}
        {amountDiffers && (
          <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            הסכום במסמך בכספית {formatMoney(linked.total)}, וכאן {formatMoney(gross)} כולל מע״מ.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="סוג מסמך">
            <select value={form.doc_type} onChange={set("doc_type")} className={inputClass} disabled={!!linked}>
              {DOC_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="מספר מסמך">
            <input
              value={form.doc_number}
              onChange={set("doc_number")}
              disabled={!!linked}
              className={inputClass}
              placeholder="01/3039"
              dir="ltr"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="תאריך מסמך">
            <input
              type="date"
              value={form.doc_date}
              onChange={set("doc_date")}
              disabled={!!linked}
              className={inputClass}
              dir="ltr"
            />
          </FormField>
          <FormField label="שם לחשבונית (אם שונה)">
            <input value={form.billing_name} onChange={set("billing_name")} className={inputClass} />
          </FormField>
        </div>
        {form.status === "paid" && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="מספר קבלה">
              <input value={form.receipt_number} onChange={set("receipt_number")} className={inputClass} dir="ltr" />
            </FormField>
            <FormField label="תאריך קבלה">
              <input
                type="date"
                value={form.receipt_date}
                onChange={set("receipt_date")}
                className={inputClass}
                dir="ltr"
              />
            </FormField>
          </div>
        )}
      </Section>

      {isCheck && (
        <Section title="צ׳קים">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="מספר צ׳ק">
              <input value={form.check_number} onChange={set("check_number")} className={inputClass} dir="ltr" />
            </FormField>
            <FormField label="מועד איסוף הצ׳ק">
              <input
                type="date"
                value={form.collection_date}
                onChange={set("collection_date")}
                className={inputClass}
                dir="ltr"
              />
            </FormField>
          </div>
          <Check label="הצ׳קים הגיעו אלינו" checked={form.check_received} onChange={toggle("check_received")} />
          <p className="text-xs text-muted-foreground">מועד האיסוף יופיע אוטומטית בטבלת איסופי הצ׳קים.</p>
        </Section>
      )}

      <Section title="סימונים והערות">
        <Check label="הסכום או הפרטים לאימות" checked={form.needs_review} onChange={toggle("needs_review")} />
        <FormField label="הערות">
          <Textarea
            value={form.notes}
            onChange={set("notes")}
            rows={2}
            className="resize-none rounded-lg border-input bg-white text-sm"
          />
        </FormField>
      </Section>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!valid || saving}
          className="h-10 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "שומר..." : "שמירה"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}