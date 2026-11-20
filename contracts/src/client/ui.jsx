import React from "react";
import { Check, Loader2 } from "lucide-react";
import { dmy, nis } from "@/sales/lib";

export function Shell({ children, wide = false, header = true, company }) {
  return (
    <div className="pa" dir="rtl">
      {header && (
        <header className="pa-noprint border-b border-border/70 bg-white/90 backdrop-blur">
          <div className={`mx-auto flex h-14 items-center justify-between px-4 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
            <img src="/pay-assets/all-dark-logo.png" alt="Pro Algorithm" className="h-5 w-auto" />
            {company?.phone && <a href={`tel:${company.phone}`} className="text-sm text-muted-foreground hover:text-foreground pa-num">{company.phone}</a>}
          </div>
        </header>
      )}
      {children}
    </div>
  );
}

export const Container = ({ children, className = "", wide = false }) => (
  <div className={`mx-auto px-4 ${wide ? "max-w-5xl" : "max-w-3xl"} ${className}`}>{children}</div>
);

export function Loading() {
  return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
}

export function Notice({ title, text, children }) {
  return (
    <Container className="py-20 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      {text && <p className="mx-auto mt-3 max-w-md text-muted-foreground">{text}</p>}
      {children}
    </Container>
  );
}

export function Section({ title, children, className = "" }) {
  return (
    <section className={`pa-card p-5 sm:p-7 ${className}`}>
      {title && <h2 className="mb-3 text-lg font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export function ErrorLine({ error }) {
  if (!error) return null;
  return <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>;
}

export function Stepper({ steps, current }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="שלבים">
      {steps.map((s, i) => {
        const done = s.done;
        const active = i === current;
        return (
          <li key={s.label} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-emerald-600 text-white" : active ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`truncate text-xs sm:text-sm ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
            {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

export function PriceCard({ price }) {
  return (
    <div className="rounded-2xl bg-gradient-to-l from-[#2d2390] to-[#3b46b8] p-5 text-white sm:p-6">
      <p className="text-sm text-white/75">מחיר הפרויקט</p>
      <p className="mt-1 text-3xl font-extrabold sm:text-4xl"><span className="pa-num">{nis(price.amount)}</span> <span className="text-base font-medium text-white/80">+ מע"מ</span></p>
      <p className="mt-1 text-sm text-white/80"><span className="pa-num">{nis(price.total)}</span> כולל מע"מ ({price.vatRate}%)</p>
      <p className="mt-3 text-sm text-white/85">המחיר קבוע וסגור לתכולה שבאפיון המאושר.</p>
    </div>
  );
}

export function ScheduleTable({ schedule, depositPercent }) {
  const label = (r) => (r.kind === "deposit" ? `מקדמה ${depositPercent}%` : `תשלום ${r.n - 1}`);
  return (
    <div>
      {/* phone: stacked cards */}
      <ul className="space-y-2 sm:hidden">
        {schedule.rows.map((r) => (
          <li key={r.n} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{label(r)}</span>
              <span className="font-bold pa-num">{nis(r.total)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
              <span>{r.kind === "deposit" ? `עד ${dmy(r.date)}` : dmy(r.date)}</span>
              <span><span className="pa-num">{nis(r.before)}</span> + מע"מ</span>
            </div>
            {r.dateNote && <p className="mt-1 text-xs text-muted-foreground">{r.dateNote}</p>}
          </li>
        ))}
        <li className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 font-bold">
          <span>סה"כ</span><span className="pa-num">{nis(schedule.totals.total)}</span>
        </li>
      </ul>
      {/* wider: table */}
      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 text-start font-medium">#</th>
            <th className="py-2 text-start font-medium">מועד</th>
            <th className="py-2 text-start font-medium">לפני מע"מ</th>
            <th className="py-2 text-start font-medium">כולל מע"מ</th>
          </tr>
        </thead>
        <tbody>
          {schedule.rows.map((r) => (
            <tr key={r.n} className="border-b border-border/70">
              <td className="py-2.5">{label(r)}</td>
              <td className="py-2.5">{r.kind === "deposit" ? `עד ${dmy(r.date)}` : dmy(r.date)}{r.dateNote && <div className="text-xs text-muted-foreground">{r.dateNote}</div>}</td>
              <td className="py-2.5 pa-num">{nis(r.before)}</td>
              <td className="py-2.5 font-semibold pa-num">{nis(r.total)}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="py-2.5" colSpan={2}>סה"כ</td>
            <td className="py-2.5 pa-num">{nis(schedule.totals.before)}</td>
            <td className="py-2.5 pa-num">{nis(schedule.totals.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ServiceTimeline({ rows }) {
  if (!rows?.length) return null;
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {rows.map((r, i) => (
        <li key={i} className={`rounded-xl border p-3 ${r.price ? "border-border" : "border-emerald-200 bg-emerald-50"}`}>
          <p className="text-xs text-muted-foreground">{r.when}</p>
          <p className="mt-1 font-semibold">{r.price ? <span className="pa-num">{nis(r.price)}</span> : "ללא עלות"}</p>
          <p className="text-xs text-muted-foreground">{r.price ? `לחודש + מע"מ (${nis(r.priceWithVat)})` : r.label}</p>
        </li>
      ))}
    </ol>
  );
}

export const Field = ({ label, children, hint, required }) => (
  <label className="block space-y-1.5">
    <span className="text-sm font-medium">{label}{required && <span className="text-destructive"> *</span>}</span>
    {children}
    {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
  </label>
);
