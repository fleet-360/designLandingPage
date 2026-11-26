import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff } from "lucide-react";
import { t } from "@/i18n";

export default function PasswordInput({ id, value, onChange, placeholder, autoComplete, autoFocus, className = "h-12" }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`${className} ps-10 pe-10`}
        required
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
        aria-label={show ? t("הסתר סיסמה") : t("הצג סיסמה")}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}