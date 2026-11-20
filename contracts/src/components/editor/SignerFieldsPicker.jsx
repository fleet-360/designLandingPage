import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { SIGNER_FIELDS } from "@/lib/formUtils";

export default function SignerFieldsPicker({ value = [], onChange }) {
  const toggle = (k, v) => onChange(v ? [...value, k] : value.filter((x) => x !== k));
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <p className="text-sm font-medium">פרטי הלקוח לאיסוף</p>
      <p className="mb-3 text-xs text-muted-foreground">שדות שהלקוח ימלא לפני החתימה</p>
      <div className="space-y-2.5">
        {Object.entries(SIGNER_FIELDS).map(([k, label]) => (
          <label key={k} className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox checked={value.includes(k)} onCheckedChange={(v) => toggle(k, !!v)} />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}