import { useState } from "react";
import FormField, { inputClass } from "@/collections/FormField";
import ResponsiveSheet from "@/collections/ResponsiveSheet";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";

export default function CustomerDialog({ open, onOpenChange, customer, onSave, saving }) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? t("פרטי לקוח") : t("לקוח חדש")}
      description={customer ? undefined : t("הוסיפו לקוח כדי להתחיל לנהל את לוח התשלומים שלו")}
    >
      <CustomerForm
        key={customer?.id || "new"}
        customer={customer}
        saving={saving}
        onSave={onSave}
        onCancel={() => onOpenChange(false)}
      />
    </ResponsiveSheet>
  );
}

function CustomerForm({ customer, onSave, saving, onCancel }) {
  const [form, setForm] = useState({
    name: customer?.name || "",
    contact_person: customer?.contact_person || "",
    phone: customer?.phone || "",
    tax_id: customer?.tax_id || "",
    email: customer?.email || "",
    internal_owner: customer?.internal_owner || "",
    project_stages: customer?.project_stages || "",
    notes: customer?.notes || "",
  });

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSave(customer?.id ? { id: customer.id, ...form } : form);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <FormField label={t("שם לקוח")}>
        <input value={form.name} onChange={set("name")} className={inputClass} placeholder={t("לדוגמה: מסעדת הגן")} autoFocus />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("איש קשר")}>
          <input value={form.contact_person} onChange={set("contact_person")} className={inputClass} />
        </FormField>
        <FormField label={t("טלפון")}>
          <input value={form.phone} onChange={set("phone")} className={inputClass} inputMode="tel" dir="ltr" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("ח.פ / ע.מ")}>
          <input value={form.tax_id} onChange={set("tax_id")} className={inputClass} inputMode="numeric" dir="ltr" placeholder={t("לשיוך מסמכים מכספית")} />
        </FormField>
        <FormField label={t("אימייל")}>
          <input value={form.email} onChange={set("email")} className={inputClass} type="email" dir="ltr" />
        </FormField>
      </div>
      <FormField label={t("אחראי פנימי")}>
        <input value={form.internal_owner} onChange={set("internal_owner")} className={inputClass} placeholder={t("מי מטפל בגבייה")} />
      </FormField>
      <FormField label={t("שלבי הפרויקט")}>
        <Textarea
          value={form.project_stages}
          onChange={set("project_stages")}
          rows={5}
          placeholder={"01 ...\n02 ..."}
          className="resize-none rounded-lg border-input bg-white text-sm"
        />
      </FormField>
      <FormField label={t("הערות")}>
        <Textarea
          value={form.notes}
          onChange={set("notes")}
          rows={3}
          className="resize-none rounded-lg border-input bg-white text-sm"
        />
      </FormField>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!form.name.trim() || saving}
          className="h-10 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? t("שומר...") : t("שמירה")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50"
        >
          {t("ביטול")}
        </button>
      </div>
    </form>
  );
}