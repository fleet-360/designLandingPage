import { useState } from "react";
import FormField, { inputClass } from "@/collections/FormField";
import ResponsiveSheet from "@/collections/ResponsiveSheet";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/collections/format";

export default function CollectionDialog({ open, onOpenChange, customers = [], collection, onSave, saving }) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={collection ? "עריכת איסוף צ׳קים" : "קביעת איסוף צ׳קים"}
      description={
        collection
          ? "עדכנו סכום, איש קשר, כתובת או הערות"
          : "אם תשאירו סכום ומספר צ׳קים ריקים — הם ייקבעו מהצ׳קים הממתינים של הלקוח"
      }
    >
      <CollectionForm
        key={collection?.id || (open ? "open" : "closed")}
        customers={customers}
        collection={collection}
        saving={saving}
        onSave={onSave}
        onCancel={() => onOpenChange(false)}
      />
    </ResponsiveSheet>
  );
}

function CollectionForm({ customers, collection, onSave, saving, onCancel }) {
  const [form, setForm] = useState({
    customer_id: collection?.customer_id || customers[0]?.id || "",
    collection_date: collection?.collection_date || todayISO(),
    check_count: collection?.check_count != null ? String(collection.check_count) : "",
    total_amount: collection?.total_amount != null ? String(collection.total_amount) : "",
    contact_person: collection?.contact_person || "",
    address: collection?.address || "",
    notes: collection?.notes || "",
  });

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const valid = form.customer_id && form.collection_date;

  const submit = (event) => {
    event.preventDefault();
    if (!valid) return;
    onSave({
      ...(collection?.id ? { id: collection.id } : {}),
      customer_id: form.customer_id,
      collection_date: form.collection_date,
      check_count: form.check_count === "" ? undefined : Number(form.check_count),
      total_amount: form.total_amount === "" ? undefined : Number(form.total_amount),
      contact_person: form.contact_person,
      address: form.address,
      notes: form.notes,
    });
  };

  if (!customers.length) {
    return <p className="py-4 text-center text-sm text-muted-foreground">הוסיפו לקוח לפני קביעת איסוף.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="לקוח">
          <select
            value={form.customer_id}
            onChange={set("customer_id")}
            className={inputClass}
            disabled={!!collection}
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="מועד איסוף">
          <input
            type="date"
            value={form.collection_date}
            onChange={set("collection_date")}
            className={inputClass}
            dir="ltr"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="מספר צ׳קים">
          <input
            value={form.check_count}
            onChange={set("check_count")}
            className={`${inputClass} amount`}
            inputMode="numeric"
            placeholder="אוטומטי"
            dir="ltr"
          />
        </FormField>
        <FormField label="סכום (₪)">
          <input
            value={form.total_amount}
            onChange={set("total_amount")}
            className={`${inputClass} amount`}
            inputMode="decimal"
            placeholder="אוטומטי"
            dir="ltr"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="איש קשר לאיסוף">
          <input value={form.contact_person} onChange={set("contact_person")} className={inputClass} />
        </FormField>
        <FormField label="כתובת לאיסוף">
          <input value={form.address} onChange={set("address")} className={inputClass} />
        </FormField>
      </div>

      <FormField label="הערות">
        <Textarea
          value={form.notes}
          onChange={set("notes")}
          rows={2}
          className="resize-none rounded-lg border-input bg-white text-sm"
        />
      </FormField>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!valid || saving}
          className="h-10 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "שומר..." : collection ? "שמירה" : "קביעת איסוף"}
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