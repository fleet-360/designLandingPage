import { cn } from "@/lib/utils";

export default function FormField({ label, children, className }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30";