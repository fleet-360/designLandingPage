import React from "react";
import { Input } from "@/components/ui/input";
import { SIGNER_FIELDS } from "@/lib/formUtils";
import { t, isEn } from "@/i18n";

export default function SignerFields({ fields = [], value, onChange }) {
  if (fields.length === 0) return null;
  return (
    <div className="rounded-xl bg-secondary/60 p-5">
      <p className="mb-4 text-sm font-medium">{t("פרטי החותם")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((k) => (
          <div key={k} className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{SIGNER_FIELDS[k]} <span className="text-destructive">*</span></label>
            <Input
              value={value[k] || ""}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              type={k === "email" ? "email" : k === "phone" ? "tel" : "text"}
              dir={k === "email" || k === "phone" ? "ltr" : isEn ? "ltr" : "rtl"}
              className="bg-white"
            />
          </div>
        ))}
      </div>
    </div>
  );
}