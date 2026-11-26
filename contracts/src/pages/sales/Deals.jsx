import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { api, dateTime, dmy, errorText, FIELD_ERRORS, fileToDataUrl, isEmail, mobileIL, nis, taxIdIL } from "@/sales/lib";
import { Card, FieldRow, History, Info, LinkBox, LoadError, MailCopies, PageHeader, Pill, Spinner, blankCopies, copiesOf, run, selfCc, useApi } from "./AdminUi.jsx";
import { Confirm, PitchFields, pitchBody, pitchFrom } from "./Discovery.jsx";
import { t } from "@/i18n";
import SpecPagePicker from "./SpecPagePicker.jsx";
import DealFilm from "./DealFilm.jsx";

const todayIL = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
const MAX_UPLOAD = 3 * 1024 * 1024;

// the signed contract (PDF or a photo) -> { fileId, name }, or null when it was not uploaded
async function uploadContract(file) {
  if (!file) return null;
  if (file.size > MAX_UPLOAD) { toast({ title: errorText({ code: "file_too_large" }), variant: "destructive" }); return null; }
  const r = await run(async () => api("sales/upload", { method: "POST", body: { name: file.name, data_url: await fileToDataUrl(file) } }), t("החוזה הועלה"));
  return r ? { fileId: r.fileId, name: file.name } : null;
}

function ContractUpload({ file, onFile, label = t("העלאת החוזה החתום") }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary">
      <Upload className="h-4 w-4" />{busy ? t("מעלה...") : file ? t("{name} · החלפה", { name: file.name }) : label}
      <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" disabled={busy}
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; setBusy(true); const r = await uploadContract(f); setBusy(false); if (r) onFile(r); }} />
    </label>
  );
}

// signed outside the link: when, the signed contract, and the order confirmation to send at the end
function ManualClose({ m, setM }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FieldRow label={t("תאריך החתימה")} hint={t("לוח התשלומים מחושב מהתאריך הזה")}><Input type="date" value={m.signedOn} max={todayIL()} onChange={(e) => setM({ ...m, signedOn: e.target.value })} /></FieldRow>
      <FieldRow label={t("החוזה החתום")} hint={t("PDF או תמונה, עד 3MB. אפשר להעלות גם אחר כך")}>
        <div><ContractUpload file={m.file} onFile={(file) => setM({ ...m, file, attachContract: true })} /></div>
      </FieldRow>
    </div>
  );
}

function OrderMailOptions({ m, setM, hasFile }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm"><Switch checked={m.sendOrderMail} onCheckedChange={(v) => setM({ ...m, sendOrderMail: v })} />{t("לשלוח ללקוח אישור הזמנה במייל")}</label>
      {m.sendOrderMail && (
        <label className={`flex items-center gap-2 text-sm ${hasFile ? "" : "text-muted-foreground"}`}>
          <Switch checked={hasFile && m.attachContract} disabled={!hasFile} onCheckedChange={(v) => setM({ ...m, attachContract: v })} />{t("לצרף את החוזה החתום")}{!hasFile && t(" (לא הועלה)")}
        </label>
      )}
    </div>
  );
}
// ---- the payment schedule: every payment with its date, amount (before VAT) and method ----
const METHODS = [["transfer", t("העברה בנקאית")], ["check", t("שיק")], ["card", t("כרטיס אשראי")]];
const methodName = (m) => METHODS.find(([k]) => k === m)?.[1] || "";
const agorot = (v) => Math.round(Number(v || 0) * 100);
const isoAddDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isoAddMonths = (iso, k) => {
  const [y, m, day] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + k, Math.min(day, last), 12)).toISOString().slice(0, 10);
};
// three working days from today, skipping Friday and Saturday (holidays are the salesperson's call)
const soonWorkday = () => { let d = todayIL(); let n = 3; while (n > 0) { d = isoAddDays(d, 1); const w = new Date(`${d}T12:00:00Z`).getUTCDay(); if (w !== 5 && w !== 6) n--; } return d; };
const firstOfNextMonth = () => { const t = todayIL(); return isoAddMonths(`${t.slice(0, 8)}01`, 1); };
// the same split of VAT as the server (api/_lib/sales-calc.js): proportional, remainder on the last
function withVatRows(amounts, price, vatRate) {
  const before = amounts.map(agorot);
  const vatA = Math.round((agorot(price) * Number(vatRate || 0)) / 100);
  const sum = before.reduce((a, b) => a + b, 0);
  const vats = before.map((b) => (sum ? Math.floor((vatA * b) / sum) : 0));
  if (vats.length) vats[vats.length - 1] += vatA - vats.reduce((a, b) => a + b, 0);
  return before.map((b, i) => (b + vats[i]) / 100);
}
const blankSplit = (price = {}) => ({
  depositUnit: "percent", depositPercent: price.depositPercent ?? 30, depositAmount: "", depositDate: soonWorkday(), depositMethod: "transfer",
  count: price.installments ?? 3, firstDate: firstOfNextMonth(), method: price.balanceMethod === "checks" ? "check" : "transfer",
});
// the deposit in agorot: a share of the price (whole shekels) or the amount sales typed, never above the price
const splitDeposit = (total, s) => Math.min(total, s.depositUnit === "amount"
  ? Math.max(0, agorot(s.depositAmount))
  : Math.round((total * Number(s.depositPercent || 0)) / 10000) * 100);
// deposit + equal monthly payments in whole shekels, the remainder on the last one
function splitPayments(amount, s) {
  const total = agorot(amount);
  const deposit = splitDeposit(total, s);
  const n = Math.max(0, Math.min(35, Math.trunc(Number(s.count) || 0)));
  const rest = total - deposit;
  const each = n ? Math.floor(rest / n / 100) * 100 : 0;
  const rows = [{ date: s.depositDate, amount: (n ? deposit : total) / 100, method: s.depositMethod }];
  for (let i = 0; i < n; i++) rows.push({ date: isoAddMonths(s.firstDate, i), amount: (i === n - 1 ? rest - each * (n - 1) : each) / 100, method: s.method });
  return rows;
}

function PaymentsEditor({ price, vatRate, payments, setPayments, pickupDate, setPickupDate, legacy }) {
  const [split, setSplit] = useState(() => blankSplit(legacy));
  const rows = payments || [];
  const totals = withVatRows(rows.map((p) => p.amount), price, vatRate);
  const target = agorot(price);
  const sum = rows.reduce((a, p) => a + agorot(p.amount), 0);
  const diff = target - sum;
  const today = todayIL();
  const set = (i, k, val) => setPayments(rows.map((p, j) => (j === i ? { ...p, [k]: val } : p)));
  const hasChecks = rows.some((p) => p.method === "check");
  const sel = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-secondary/60 p-3">
        <p className="mb-2 text-sm font-medium">{t("חלוקה מהירה")}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          <span>{t("מקדמה")}</span>
          {split.depositUnit === "amount"
            ? <Input value={split.depositAmount} onChange={(e) => setSplit({ ...split, depositAmount: e.target.value })} inputMode="decimal" dir="ltr" placeholder="₪" className="h-8 w-24" aria-label={t('סכום המקדמה לפני מע"מ')} />
            : <Input value={split.depositPercent} onChange={(e) => setSplit({ ...split, depositPercent: e.target.value })} inputMode="numeric" dir="ltr" className="h-8 w-16" aria-label={t("אחוז מקדמה")} />}
          <select value={split.depositUnit} className="h-8 rounded-md border border-input bg-transparent px-1.5" aria-label={t("מקדמה באחוזים או בסכום")}
            onChange={(e) => {
              const unit = e.target.value;
              // switching keeps the same deposit: 30% of 50,000 becomes 15,000 and back
              const total = agorot(price);
              if (unit === "amount") setSplit({ ...split, depositUnit: unit, depositAmount: split.depositAmount || (total ? splitDeposit(total, split) / 100 : "") });
              else setSplit({ ...split, depositUnit: unit, depositPercent: total && Number(split.depositAmount) > 0 ? Math.round((agorot(split.depositAmount) / total) * 1000) / 10 : split.depositPercent });
            }}>
            <option value="percent">%</option><option value="amount">{t('₪ לפני מע"מ')}</option>
          </select>
          <span>{t("ב-")}</span><Input type="date" value={split.depositDate} onChange={(e) => setSplit({ ...split, depositDate: e.target.value })} className="h-8 w-40" aria-label={t("תאריך המקדמה")} />
          <select value={split.depositMethod} onChange={(e) => setSplit({ ...split, depositMethod: e.target.value })} className="h-8 rounded-md border border-input bg-transparent px-2" aria-label={t("אמצעי תשלום המקדמה")}>
            {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span>{t("ואז")}</span>
          <Input value={split.count} onChange={(e) => setSplit({ ...split, count: e.target.value })} inputMode="numeric" dir="ltr" className="h-8 w-14" aria-label={t("מספר תשלומים")} />
          <span>{t("תשלומים חודשיים מ-")}</span><Input type="date" value={split.firstDate} onChange={(e) => setSplit({ ...split, firstDate: e.target.value })} className="h-8 w-40" aria-label={t("תאריך התשלום הראשון")} />
          <select value={split.method} onChange={(e) => setSplit({ ...split, method: e.target.value })} className="h-8 rounded-md border border-input bg-transparent px-2" aria-label={t("אמצעי תשלום היתרה")}>
            {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Button type="button" size="sm" variant="outline" disabled={!(target > 0) || !split.depositDate || (Number(split.count) > 0 && !split.firstDate) || (split.depositUnit === "amount" && !(Number(split.depositAmount) > 0))}
            onClick={() => setPayments(splitPayments(price, split))}>{rows.length ? t("חלוקה מחדש") : t("מילוי הטבלה")}</Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("ממלא את הטבלה למטה. אחר כך אפשר לשנות כל תשלום בנפרד.")}
          {split.depositUnit === "amount" && agorot(split.depositAmount) > target && target > 0 && <span className="text-amber-700">{t(" המקדמה גבוהה מהמחיר, ותוגבל למחיר.")}</span>}
        </p>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="hidden grid-cols-[72px_150px_1fr_1fr_150px_36px] gap-2 px-1 text-xs text-muted-foreground sm:grid">
            <span /> <span>{t("תאריך")}</span><span>{t('סכום לפני מע"מ')}</span><span>{t('כולל מע"מ')}</span><span>{t("אמצעי תשלום")}</span><span />
          </div>
          {rows.map((p, i) => {
            const late = p.date && p.date < today;
            const order = i > 0 && p.date && rows[i - 1].date && p.date < rows[i - 1].date;
            // the last payment takes whatever is left, so the table adds up to the price
            const fill = i === rows.length - 1 && target > 0 && diff !== 0 && agorot(p.amount) + diff > 0 ? (agorot(p.amount) + diff) / 100 : null;
            return (
              <div key={i}>
                <div className="grid grid-cols-2 items-center gap-2 rounded-xl border border-border p-2 sm:grid-cols-[72px_150px_1fr_1fr_150px_36px] sm:border-0 sm:p-0 sm:px-1">
                  <span className="text-sm font-medium">{i === 0 ? t("מקדמה") : t("תשלום {n}", { n: i })}</span>
                  <Input type="date" value={p.date} onChange={(e) => set(i, "date", e.target.value)} aria-label={t("תאריך")} className="h-9" />
                  <div className="flex items-center gap-1.5">
                    <Input value={p.amount} onChange={(e) => set(i, "amount", e.target.value)} inputMode="decimal" dir="ltr" placeholder="₪" aria-label={t('סכום לפני מע"מ')} className="h-9 min-w-0" />
                    {fill !== null && (
                      <Button type="button" size="sm" variant="outline" className="h-9 shrink-0 px-2.5" title={t('היתרה: {amount} לפני מע"מ', { amount: nis(fill) })} onClick={() => set(i, "amount", fill)}>{t("השלם")}</Button>
                    )}
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground" dir="ltr">{Number(p.amount) > 0 ? nis(totals[i]) : ""}</span>
                  <select value={p.method} onChange={(e) => set(i, "method", e.target.value)} className={sel} aria-label={t("אמצעי תשלום")}>
                    <option value="">{t("אמצעי תשלום...")}</option>
                    {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setPayments(rows.filter((_, j) => j !== i))} aria-label={t("הסרת התשלום")}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {(late || order) && <p className="px-1 pt-0.5 text-xs text-amber-700">{late ? t("התאריך כבר עבר") : t("התאריך מוקדם מהתשלום הקודם")}</p>}
              </div>
            );
          })}
          <Button type="button" size="sm" variant="outline" onClick={() => setPayments([...rows, {
            date: rows.length && rows[rows.length - 1].date ? isoAddMonths(rows[rows.length - 1].date, 1) : soonWorkday(),
            amount: diff > 0 ? diff / 100 : "", method: rows[rows.length - 1]?.method || "transfer",
          }])}><Plus className="ms-1 h-4 w-4" />{t("תשלום")}</Button>
        </div>
      )}

      {rows.length > 0 && target > 0 && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm ${diff === 0 ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`} role="status">
          <span>
            {diff === 0 ? "✓ " : ""}{t('סה"כ')} <span className="tabular-nums font-semibold">{nis(sum / 100)}</span> {t("מתוך")} <span className="tabular-nums">{nis(target / 100)}</span> {t('לפני מע"מ')}
            {diff > 0 && <> · {t("חסרים")} <span className="tabular-nums font-semibold">{nis(diff / 100)}</span></>}
            {diff < 0 && <> · {t("עודף של")} <span className="tabular-nums font-semibold">{nis(-diff / 100)}</span></>}
            {diff === 0 && <> · <span className="tabular-nums">{nis(totals.reduce((a, b) => a + b, 0))}</span> {t('כולל מע"מ')}</>}
          </span>
          {diff !== 0 && agorot(rows[rows.length - 1].amount) + diff > 0 && <span className="text-xs">{t('"השלם" בתשלום האחרון ממלא בו את היתרה')}</span>}
        </div>
      )}

      {hasChecks && (
        <FieldRow label={t("איסוף השיקים על ידי שליח")} hint={t("הלקוח יראה את התאריך ואת הסכומים המדויקים, כדי שיכין את השיקים מראש. אפשר להשאיר ריק ולתאם בהמשך")}>
          <Input type="date" value={pickupDate || ""} onChange={(e) => setPickupDate(e.target.value)} className="max-w-48" />
        </FieldRow>
      )}
    </div>
  );
}

// ---- the price, with an optional discount. `amount` is always the price the client pays (before VAT);
// with a discount, `listAmount` is the price before it. Sales types the original price and either the
// discount (₪ or %) or the price after it, and the third is worked out.
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const trimNum = (n) => String(round2(n));
function discountText(list, amount, unit) {
  const l = Number(list); const a = Number(amount);
  if (!(l > 0) || !(a > 0) || a >= l) return "";
  return unit === "percent" ? trimNum((1 - a / l) * 100) : trimNum(l - a);
}
function PriceFields({ price, setPrice }) {
  const [on, setOn] = useState(() => Number(price.listAmount) > 0);
  const [unit, setUnit] = useState("amount");
  const [disc, setDisc] = useState(() => discountText(price.listAmount, price.amount, "amount"));
  const afterDiscount = (list, d, u) => {
    const l = Number(list); const x = Number(d);
    if (!(l > 0) || d === "" || !(x >= 0)) return null;
    return round2(u === "percent" ? l * (1 - Math.min(100, x) / 100) : Math.max(0, l - x));
  };
  const setList = (list) => {
    const a = afterDiscount(list, disc, unit);
    setPrice({ ...price, listAmount: list, ...(a !== null && { amount: a }) });
  };
  const setDiscount = (d) => {
    setDisc(d);
    const a = afterDiscount(price.listAmount, d, unit);
    if (a !== null) setPrice({ ...price, amount: a });
  };
  const setAmount = (amount) => { setPrice({ ...price, amount }); setDisc(discountText(price.listAmount, amount, unit)); };
  const toggle = (v) => {
    setOn(v);
    if (v) { setPrice({ ...price, listAmount: price.amount || "" }); setDisc(""); setUnit("amount"); }
    else setPrice({ ...price, listAmount: "" });
  };
  const l = Number(price.listAmount); const a = Number(price.amount);
  const off = on && l > 0 && a > 0 && a < l;
  return (
    <div className="space-y-3 sm:col-span-3">
      <label className="flex items-center gap-2 text-sm"><Switch checked={on} onCheckedChange={toggle} />{t("הנחה")}</label>
      {!on ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldRow label={t('מחיר לפני מע"מ *')}><Input value={price.amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" /></FieldRow>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <FieldRow label={t('מחיר מקורי לפני מע"מ')}><Input value={price.listAmount} onChange={(e) => setList(e.target.value)} inputMode="decimal" dir="ltr" /></FieldRow>
            <FieldRow label={t("הנחה")}>
              <div className="flex gap-1.5">
                <Input value={disc} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" dir="ltr" className="min-w-0" aria-label={t("הנחה")} />
                <select value={unit} className="h-10 rounded-md border border-input bg-transparent px-2 text-sm" aria-label={t("הנחה בסכום או באחוזים")}
                  onChange={(e) => { setUnit(e.target.value); setDisc(discountText(price.listAmount, price.amount, e.target.value)); }}>
                  <option value="amount">₪</option><option value="percent">%</option>
                </select>
              </div>
            </FieldRow>
            <FieldRow label={t('מחיר אחרי הנחה, לפני מע"מ *')}><Input value={price.amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" /></FieldRow>
          </div>
          <p className={`text-xs ${off || !(l > 0) ? "text-muted-foreground" : "text-amber-700"}`}>
            {off ? t("הנחה של {amount} ({pct}%). הלקוח יראה את המחיר המקורי מחוק ואת ההנחה.", { amount: nis(round2(l - a)), pct: trimNum((1 - a / l) * 100) })
              : l > 0 && a >= l ? t("המחיר אחרי ההנחה לא נמוך מהמחיר המקורי, ולכן לא תוצג הנחה.") : t("מזינים את המחיר המקורי, ואז את ההנחה או את המחיר אחריה.")}
          </p>
        </>
      )}
    </div>
  );
}

const blankManual = () => ({ on: false, signedOn: todayIL(), file: null, sendOrderMail: true, attachContract: true });
const manualPayload = (m) => ({ signedOn: m.signedOn, fileId: m.file?.fileId || undefined, sendOrderMail: m.sendOrderMail, attachContract: Boolean(m.file) && m.attachContract });

export function dealStatus(x) {
  if (x.status.canceled) return ["gray", t("בוטלה")];
  if (x.status.project === "delivered") return ["green", t("נמסר")];
  if (x.status.project === "started") return ["green", t("בפיתוח")];
  if (x.signedAt) return x.status.card === "pending" ? ["blue", t("נחתם, ממתין לכרטיס")] : ["green", t("נחתם")];
  if (x.approvedAt) return ["blue", t("ההזמנה אושרה, ממתין לחתימה")];
  if (x.viewedAt) return ["amber", t("נצפה")];
  return ["gray", t("נשלח")];
}

export function DealsList() {
  const { data, error, reload } = useApi("sales/deals");
  const [q, setQ] = useState("");
  if (error) return <LoadError error={error} reload={reload} />;
  if (!data) return <Spinner />;
  const items = data.items.filter((x) => !q || `${x.number} ${x.client.companyName} ${x.client.signerName} ${x.data.project.name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title={t("עסקאות")} subtitle={t("הזמנת עבודה, הסכם לחתימה והוראת קבע לשירות החודשי")}>
        <Button asChild><Link to="/sales/deals/new"><Plus className="ms-1 h-4 w-4" />{t("עסקה חדשה")}</Link></Button>
      </PageHeader>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("חיפוש לפי מספר, לקוח או פרויקט")} className="mb-4 max-w-sm" />
      {items.length === 0 ? <p className="py-16 text-center text-muted-foreground">{data.items.length ? t("לא נמצאו תוצאות") : t("עדיין אין עסקאות.")}</p> : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">#</th><th className="p-3 text-start font-medium">{t("לקוח ופרויקט")}</th>
              <th className="p-3 text-start font-medium">{t("מחיר")}</th><th className="p-3 text-start font-medium">{t("סטטוס")}</th>
              <th className="p-3 text-start font-medium">{t("מקדמה")}</th><th className="p-3 text-start font-medium">{t("נוצר")}</th><th className="p-3"><span className="sr-only">{t("פעולות")}</span></th>
            </tr></thead>
            <tbody>
              {items.map((x) => {
                const [tone, label] = dealStatus(x);
                return (
                  <tr key={x.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/50">
                    <td className="p-3 tabular-nums">{x.number}</td>
                    <td className="p-3"><Link to={`/sales/deals/${x.id}`} className="font-medium hover:underline">{x.client.companyName || x.client.signerName}</Link><div className="text-xs text-muted-foreground">{x.data.project.name}</div></td>
                    <td className="p-3 tabular-nums">{nis(x.data.price.amount)}</td>
                    <td className="p-3"><Pill tone={tone}>{label}</Pill></td>
                    <td className="p-3">{x.status.deposit === "paid" ? <Pill tone="green">{t("שולמה")}</Pill> : x.signedAt ? <Pill tone="amber">{t("ממתינה")}</Pill> : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground tabular-nums">{dateTime(x.createdAt)}</td>
                    <td className="p-3 text-end"><Button asChild variant="outline" size="sm"><Link to={`/sales/deals/${x.id}`}>{t("הצג")}</Link></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const emptyContact = { name: "", role: "", phone: "", email: "" };
const blankDeal = (s) => ({
  client: {
    companyName: "", taxId: "", address: "", signerName: "", signerRole: "", email: "", phone: "", accountingName: "", accountingEmail: "",
    authorizedContact: { ...emptyContact },
  },
  data: {
    project: { name: "", summary: "", specName: "", specVersion: "", specDate: "", specFileId: null, specPages: null, specPageCount: null, targetWeeks: "", kickoffNeeds: "" },
    price: { amount: "", vatRate: s?.vatRate ?? 18, depositPercent: s?.depositPercent ?? 30, installments: 3, installmentDay: 1, balanceMethod: "transfer", payments: [], checksPickupDate: "" },
    service: { enabled: true, periods: [{ months: 12, price: "" }, { months: null, price: "" }] },
    standingOrder: { enabled: true, startDate: "", dayOfMonth: 1 },
    appendix: {
      notIncluded: "", exclusivity: "", stages: [], testPeriodDays: 14,
      hourlyRates: (s?.hourlyRates || []).map((r) => ({ ...r })),
      serviceComponents: [...(s?.service?.includes || [])], liabilityCapIncluded: "", usersCount: "",
    },
  },
});

// deep set by path "data.price.amount"
const setIn = (obj, path, v) => {
  const [k, ...rest] = path.split(".");
  if (!rest.length) return Array.isArray(obj) ? Object.assign([...obj], { [k]: v }) : { ...obj, [k]: v };
  return Array.isArray(obj) ? Object.assign([...obj], { [k]: setIn(obj[k], rest.join("."), v) }) : { ...obj, [k]: setIn(obj[k], rest.join("."), v) };
};

export function DealForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const settings = useApi("sales/settings");
  const existing = useApi(id ? `sales/deals?id=${id}` : null);
  const [f, setF] = useState(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [copies, setCopies] = useState(blankCopies);
  const [manual, setManual] = useState(blankManual);
  const [paymentNote, setPaymentNote] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [specFile, setSpecFile] = useState(null); // a spec PDF waiting for its pages to be picked
  const [confirm, setConfirm] = useState(null);
  const [filmDraft, setFilmDraft] = useState(null); // the demo film made in this form, before the deal exists
  const [pitch, setPitch] = useState(() => pitchFrom(null));   // a new deal's key lines (an existing deal edits them on its page)

  useEffect(() => {
    if (f) return;
    if (id && existing.data && settings.data) {
      // deals made before this form keep their data; the fields it now edits get their defaults
      const { client, data } = existing.data.item;
      const st = settings.data?.settings;
      setF({
        client: { ...client, authorizedContact: { ...emptyContact, ...(client.authorizedContact || data.appendix?.authorizedContact || {}) } },
        data: {
          ...data,
          // deals made before payments were set one by one: the salesperson fills the table (quick split)
          price: { ...data.price, payments: data.price.payments || [], checksPickupDate: data.price.checksPickupDate || "" },
          appendix: {
            ...data.appendix,
            stages: data.appendix?.stages || [],
            hourlyRates: data.appendix?.hourlyRates || (data.appendix?.hourlyRate ? [{ role: "", rate: data.appendix.hourlyRate }] : (st?.hourlyRates || []).map((r) => ({ ...r }))),
            serviceComponents: data.appendix?.serviceComponents?.length ? data.appendix.serviceComponents : [...(st?.service?.includes || [])],
          },
        },
      });
    }
    else if (!id && settings.data) setF(blankDeal(settings.data.settings));
  }, [id, existing.data, settings.data, f]);

  // live preview of the schedule
  const key = useMemo(() => (f ? JSON.stringify(f) : ""), [f]);
  useEffect(() => {
    if (!f || !(Number(f.data.price.amount) > 0) || !f.data.project.name) { setPreview(null); return; }
    const t = setTimeout(() => {
      api("sales/deals?preview=1", { method: "POST", body: f }).then((r) => setPreview(r.order)).catch((e) => setPreview({ error: errorText(e) }));
    }, 400);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (settings.error) return <LoadError error={settings.error} reload={settings.reload} />;
  if (!f) return <Spinner />;
  const v = (path) => path.split(".").reduce((o, k) => o?.[k], f) ?? "";
  const bind = (path, extra = {}) => ({ value: v(path), onChange: (e) => setF((s) => setIn(s, path, e.target.value)), ...extra });
  const ap = f.data.appendix;

  // the spec: sales picks its pages (SpecPagePicker), and only those are uploaded as Appendix B
  const specPicked = (file, r) => {
    setSpecFile(null);
    setF((s) => ["specFileId", "specPages", "specPageCount"].reduce((x, k) => setIn(x, `data.project.${k}`, r[k]),
      setIn(s, "data.project.specName", s.data.project.specName || file.name.replace(/\.pdf$/i, ""))));
    toast({ title: t("העמודים צורפו להסכם") });
  };
  const sp = f.data.project;

  const save = async () => {
    setError("");
    if (!f.data.project.name.trim()) return setError(t("יש להזין שם לפרויקט"));
    if (!(Number(f.data.price.amount) > 0)) return setError(t("יש להזין מחיר"));
    if (!f.client.companyName.trim() && !f.client.signerName.trim()) return setError(t("יש להזין שם חברה או שם החותם"));
    // a deal signed outside the link needs the email only for the order confirmation
    if ((!manual.on || manual.sendOrderMail || f.client.email.trim()) && !isEmail(f.client.email)) return setError(t("יש להזין אימייל תקין של הלקוח"));
    // the client can still correct them on the page, but Grow (invoices, card) refuses invalid ones
    if (f.client.phone.trim() && !mobileIL(f.client.phone)) return setError(t("טלפון הלקוח: {e}", { e: FIELD_ERRORS.phone }));
    if (f.client.taxId.trim() && !taxIdIL(f.client.taxId)) return setError(t("ח.פ הלקוח: {e}", { e: FIELD_ERRORS.taxId }));
    if (f.client.authorizedContact?.email && !isEmail(f.client.authorizedContact.email)) return setError(t("איש הקשר המוסמך: {e}", { e: FIELD_ERRORS.email }));
    const pays = f.data.price.payments;
    if (!pays.length) return setError(t("יש להזין את לוח התשלומים (אפשר בחלוקה המהירה)"));
    if (pays.some((p) => !p.date)) return setError(t("יש להזין תאריך לכל תשלום"));
    if (pays.some((p) => !(Number(p.amount) > 0))) return setError(t("יש להזין סכום לכל תשלום"));
    if (pays.some((p) => !p.method)) return setError(t("יש לבחור אמצעי תשלום לכל תשלום, כולל המקדמה"));
    const gap = agorot(f.data.price.amount) - pays.reduce((a, p) => a + agorot(p.amount), 0);
    if (gap) return setError(t('סכום התשלומים לא שווה למחיר: {diff} {amount} לפני מע"מ', { diff: gap > 0 ? t("חסרים") : t("עודף של"), amount: nis(Math.abs(gap) / 100) }));
    if (f.data.service.enabled && !f.data.standingOrder.startDate) return setError(t("יש לבחור את תאריך החיוב הראשון של השירות החודשי"));
    const cp = !id && !manual.on && sendEmail ? copiesOf(copies) : { cc: [] };
    if (cp.error) return setError(cp.error);
    setBusy(true);
    try {
      if (id) {
        await api(`sales/deals?id=${id}`, { method: "PATCH", body: { action: "update", ...f } });
        navigate(`/sales/deals/${id}`);
      } else {
        const r = await api("sales/deals", { method: "POST", body: { ...f, sendEmail, cc: cp.cc, paymentNote, pitch: pitchBody(pitch), ...(filmDraft && { filmDraft }), ...(manual.on && { signMode: "manual", ...manualPayload(manual) }) } });
        navigate(`/sales/deals/${r.item.id}`);
      }
    } catch (e) { setBusy(false); setError(errorText(e)); }
  };

  const list = (path, item) => ({
    add: () => setF((s) => setIn(s, path, [...v(path), item])),
    remove: (i) => setF((s) => setIn(s, path, v(path).filter((_, j) => j !== i))),
  });
  const stages = list("data.appendix.stages", { name: "", deliverable: "", testFiles: "", criteria: "", target: "" });
  const rates = list("data.appendix.hourlyRates", { role: "", rate: "" });
  const periods = list("data.service.periods", { months: null, price: "" });

  return (
    <div>
      <Link to={id ? `/sales/deals/${id}` : "/sales/deals"} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4 ltr:-scale-x-100" />{id ? t("חזרה לעסקה") : t("עסקאות")}</Link>
      <PageHeader title={id ? t("עריכת עסקה {n}", { n: existing.data?.item.number || "" }) : t("עסקה חדשה")}
        subtitle={manual.on ? t("הלקוח כבר חתם: מזינים את פרטי ההזמנה, מעלים את החוזה החתום ושולחים לו אישור הזמנה") : t("הלקוח יקבל קישור: סיכום ההזמנה, ההסכם לחתימה, ואז כרטיס להוראת קבע")} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {!id && (
            <Card title={t("איך נסגרת העסקה")}>
              <label className="flex items-center gap-3 text-sm font-medium">
                <Switch checked={!manual.on} onCheckedChange={(v) => setManual((m) => ({ ...m, on: !v }))} />{t("הלקוח מאשר את ההזמנה וחותם על ההסכם דרך הקישור")}
              </label>
              {manual.on && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">{t("תהליך מקוצר: ההזמנה נשמרת כמאושרת וחתומה, בלי פרטי ההזמנה שבהסכם ובלי מסך החתימה. אם יש הוראת קבע, הלקוח יגדיר כרטיס דרך הקישור שבאישור ההזמנה.")}</p>
                  <ManualClose m={manual} setM={setManual} />
                </div>
              )}
            </Card>
          )}
          <Card title={t("הלקוח")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label={t("שם החברה")}><Input {...bind("client.companyName")} /></FieldRow>
              <FieldRow label={t("ח.פ / ע.מ")} hint={t("אפשר להשאיר ריק. הלקוח ימלא באישור")}><Input {...bind("client.taxId")} dir="ltr" /></FieldRow>
              <FieldRow label={t("אימייל (לשם יישלח הקישור) *")}><Input {...bind("client.email")} type="email" dir="ltr" /></FieldRow>
              <FieldRow label={t("טלפון נייד")} hint={t("אפשר להשאיר ריק. הלקוח ימלא באישור")}><Input {...bind("client.phone")} dir="ltr" /></FieldRow>
              <FieldRow label={t("שם החותם")} hint={t("הלקוח יראה ויוכל לשנות לפני החתימה")}><Input {...bind("client.signerName")} /></FieldRow>
              <FieldRow label={t("תפקיד החותם")}><Input {...bind("client.signerRole")} /></FieldRow>
              <FieldRow label={t("אימייל הנהלת חשבונות")} hint={t("אפשר להשאיר ריק. הלקוח ימלא באישור")}><Input {...bind("client.accountingEmail")} type="email" dir="ltr" /></FieldRow>
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium">{t("איש קשר מוסמך לשינויים ולבקשות פיתוח")}</p>
              <p className="mb-2 text-xs text-muted-foreground">{t("מי שמעביר אלינו שינויים ובקשות פיתוח ומאשר אותם בשם הלקוח. אפשר להשאיר ריק, הלקוח ימלא באישור.")}</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Input {...bind("client.authorizedContact.name")} placeholder={t("שם")} />
                <Input {...bind("client.authorizedContact.role")} placeholder={t("תפקיד")} />
                <Input {...bind("client.authorizedContact.phone")} placeholder={t("טלפון")} dir="ltr" />
                <Input {...bind("client.authorizedContact.email")} placeholder={t("אימייל")} dir="ltr" />
              </div>
            </div>
          </Card>

          {!id && !manual.on && (
            <Card title={t("משפטי מפתח בראש העמוד של הלקוח")}>
              <p className="mb-3 text-sm text-muted-foreground">{t("מופיעים בראש הזמנת העבודה ובמייל ההזמנה, במקום תיאור הפרויקט. אפשר להשאיר ריק.")}</p>
              <PitchFields p={pitch} onChange={setPitch} stage="deal" />
            </Card>
          )}
          <Card title={t("הפרויקט")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label={t("שם הפרויקט *")} className="sm:col-span-2"><Input {...bind("data.project.name")} /></FieldRow>
              <FieldRow label={t("מה מפתחים (בשתי-שלוש שורות)")} className="sm:col-span-2" hint={t("מופיע בראש העמוד של הלקוח")}><Textarea {...bind("data.project.summary")} rows={3} /></FieldRow>
              <div className="sm:col-span-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary">
                  <Upload className="h-4 w-4" />{sp.specFileId ? t("האפיון מצורף{name} · החלפה", { name: sp.specName ? ` (${sp.specName})` : "" }) : t("צירוף קובץ האפיון (PDF)")}
                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) setSpecFile(x); }} />
                </label>
                {sp.specFileId && (
                  <p className="mt-1 text-sm">
                    {sp.specPages?.length
                      ? t("נספח ב' בהסכם: {pages} {list}{of}.", { pages: sp.specPages.length === 1 ? t("עמוד") : t("עמודים"), list: sp.specPages.join(", "), of: sp.specPageCount ? t(" מתוך {n}", { n: sp.specPageCount }) : "" })
                      : t("נספח ב' בהסכם: כל הקובץ שצורף.")}
                    {id && <> <a href={`/api/sales/deal-file?id=${id}&kind=spec`} target="_blank" rel="noreferrer" className="text-primary underline">{t("תצוגה כפי שהלקוח יראה")}</a></>}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{t("קובץ ה-PDF של האפיון מ-Canva. אחרי הבחירה בוחרים אילו עמודים ממנו מצורפים להסכם כנספח ב'. כדי לשנות את העמודים, מצרפים את הקובץ שוב.")}</p>
                {specFile && <SpecPagePicker file={specFile} onClose={() => setSpecFile(null)} onSave={(r) => specPicked(specFile, r)} />}
              </div>
              <FieldRow label={t("יעד פיתוח משוער (שבועות)")}><Input {...bind("data.project.targetWeeks")} inputMode="numeric" dir="ltr" /></FieldRow>
              <FieldRow label={t("מה נצטרך מהלקוח לפתיחה")} className="sm:col-span-2"><Textarea {...bind("data.project.kickoffNeeds")} rows={2} /></FieldRow>
            </div>
          </Card>

          {!manual.on && (id
            ? <DealFilm id={id} project={sp.name} />
            : <DealFilm draft={filmDraft} onDraft={setFilmDraft} project={sp.name} summary={sp.summary} />)}
          <Card title={t("מחיר ותשלומים")}>
            <div className="grid gap-3 sm:grid-cols-3">
              <PriceFields price={f.data.price} setPrice={(p) => setF((s) => setIn(s, "data.price", p))} />
              <FieldRow label={t('מע"מ %')}><Input {...bind("data.price.vatRate")} inputMode="decimal" dir="ltr" /></FieldRow>
              <div className="sm:col-span-3">
                <p className="text-sm font-medium">{t("לוח התשלומים *")}</p>
                <p className="mb-3 text-xs text-muted-foreground">{t("כל תשלום עם התאריך המדויק, הסכום ואמצעי התשלום. הראשון הוא המקדמה. הלקוח רואה את הטבלה כמו שהיא.")}</p>
                <PaymentsEditor price={f.data.price.amount} vatRate={f.data.price.vatRate} legacy={f.data.price}
                  payments={f.data.price.payments} setPayments={(p) => setF((s) => setIn(s, "data.price.payments", p))}
                  pickupDate={f.data.price.checksPickupDate} setPickupDate={(d) => setF((s) => setIn(s, "data.price.checksPickupDate", d))} />
              </div>
              {!id && (
                <FieldRow label={t("איך הלקוח משלם או שילם (פנימי)")} className="sm:col-span-3" hint={t("למשל: המקדמה הועברה ב-12/11, השירות החודשי בהעברה. אפשר לעדכן בהמשך במסך העסקה")}>
                  <Textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} rows={2} />
                </FieldRow>
              )}
            </div>
          </Card>

          <Card title={t("שירות חודשי והוראת קבע")} actions={<label className="flex items-center gap-2 text-sm"><Switch checked={f.data.service.enabled} onCheckedChange={(x) => setF((s) => setIn(s, "data.service.enabled", x))} />{t("שירות חודשי")}</label>}>
            {f.data.service.enabled ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('תקופות בתשלום (לפני מע"מ)')}</p>
                  {f.data.service.periods.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={p.months ?? ""} onChange={(e) => setF((s) => setIn(s, `data.service.periods.${i}.months`, e.target.value ? Number(e.target.value) : null))} placeholder={t("ללא הגבלה")} inputMode="numeric" dir="ltr" className="w-28" aria-label={t("חודשים")} />
                      <span className="text-sm text-muted-foreground">{t("חודשים ב-")}</span>
                      <Input value={p.price} onChange={(e) => setF((s) => setIn(s, `data.service.periods.${i}.price`, e.target.value))} placeholder={t("₪ לחודש")} inputMode="decimal" dir="ltr" className="w-32" aria-label={t("מחיר לחודש")} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => periods.remove(i)} aria-label={t("הסרה")}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" onClick={periods.add}><Plus className="ms-1 h-4 w-4" />{t("תקופה")}</Button>
                  <p className="text-xs text-muted-foreground">{t("תקופה בלי מספר חודשים נמשכת עד שמפסיקים. התקופה האחרונה היא בדרך כלל כזו.")}</p>
                </div>
                <FieldRow label={t("תאריך החיוב הראשון *")} hint={f.data.standingOrder.startDate ? t("עד אז השירות כלול במחיר הפרויקט. החיובים הבאים ב-{day} בכל חודש. התאריך נכתב בהסכם.", { day: Number(f.data.standingOrder.startDate.slice(8, 10)) }) : t("עד התאריך הזה השירות כלול במחיר הפרויקט. התאריך נכתב בהסכם.")}>
                  <Input {...bind("data.standingOrder.startDate")} type="date" className="max-w-48" />
                </FieldRow>
                <FieldRow label={t("מה השירות החודשי כולל")}>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {(settings.data?.settings?.service?.includes || []).map((x) => {
                      const on = ap.serviceComponents.includes(x);
                      return (
                        <label key={x} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={on} onChange={() => setF((s) => setIn(s, "data.appendix.serviceComponents", on ? ap.serviceComponents.filter((y) => y !== x) : [...ap.serviceComponents, x]))} />{x}
                        </label>
                      );
                    })}
                  </div>
                </FieldRow>
                <label className="flex items-center gap-2 text-sm"><Switch checked={f.data.standingOrder.enabled} onCheckedChange={(x) => setF((s) => setIn(s, "data.standingOrder.enabled", x))} />{t("גבייה בהוראת קבע בכרטיס אשראי (הלקוח מגדיר כרטיס דרך הקישור)")}</label>
                {!f.data.standingOrder.enabled && <p className="text-xs text-muted-foreground">{id ? t("בלי הוראת קבע בכרטיס. את אופן התשלום על השירות רושמים במסך העסקה.") : t("בלי הוראת קבע בכרטיס. כתבו למעלה, באופן התשלום, איך ישולם השירות החודשי.")}</p>}
              </div>
            ) : <p className="text-sm text-muted-foreground">{t("ללא שירות חודשי.")}</p>}
          </Card>

          {!manual.on && <Card title={t("פרטי ההזמנה בהסכם")}>
            <div className="space-y-5">
              <FieldRow label={t("לא כלול")} hint={t("מה לא כלול בפרויקט, מעבר למה שלא מופיע באפיון")}><Textarea {...bind("data.appendix.notIncluded")} rows={2} /></FieldRow>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch checked={Boolean(ap.exclusivity)} onCheckedChange={(x) => {
                    if (!x) return setF((s) => setIn(s, "data.appendix.exclusivity", ""));
                    setConfirm({
                      title: t("לתת ללקוח בלעדיות?"),
                      description: t("ברירת המחדל בהסכם היא ללא בלעדיות: אנחנו רשאים לעבוד גם עם מתחרים של הלקוח. בלעדיות מגבילה אותנו. להמשיך רק אם זה סוכם במפורש."),
                      onConfirm: () => setF((s) => setIn(s, "data.appendix.exclusivity", "בלעדי")),
                    });
                  }} />{t("בלעדיות ללקוח")}
                </label>
                {ap.exclusivity ? (
                  <FieldRow label={t("מה בדיוק הבלעדיות")} className="mt-2" hint={t("למשל: לא נפתח מערכת דומה למתחרה ישיר באזור X במשך שנה")}><Textarea {...bind("data.appendix.exclusivity")} rows={2} /></FieldRow>
                ) : <p className="mt-1 text-xs text-muted-foreground">{t("ללא בלעדיות (ברירת המחדל)")}</p>}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("מה ייחשב כהשלמה מוצלחת של הפיתוח")}</p>
                <p className="text-xs text-muted-foreground">{t("לכל שלב: מה נמסר, על מה בודקים ומה צריך לצאת. לפי זה הלקוח מאשר שהעבודה הושלמה. אפשר להשאיר ריק, ואז הבדיקה היא מול האפיון.")}</p>
                {ap.stages.map((s, i) => (
                  <div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
                    <Input {...bind(`data.appendix.stages.${i}.deliverable`)} placeholder={t("מה נמסר (למשל: הפקת גיליון בודד)")} />
                    <Input {...bind(`data.appendix.stages.${i}.target`)} placeholder={t("מתי בערך (למשל: שבוע 3)")} />
                    <Input {...bind(`data.appendix.stages.${i}.testFiles`)} placeholder={t("על אילו קבצים בודקים")} />
                    <div className="flex gap-2"><Input {...bind(`data.appendix.stages.${i}.criteria`)} placeholder={t("מה צריך לצאת כדי שזה ייחשב תקין")} /><Button type="button" size="icon" variant="ghost" onClick={() => stages.remove(i)} aria-label={t("הסרת שלב")}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={stages.add}><Plus className="ms-1 h-4 w-4" />{t("שלב")}</Button>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('תעריפי שעה (לפני מע"מ)')}</p>
                <p className="text-xs text-muted-foreground">{t("לתמחור שינויים ולחישוב אם הלקוח מבטל באמצע. ברירת המחדל מההגדרות.")}</p>
                {ap.hourlyRates.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input {...bind(`data.appendix.hourlyRates.${i}.role`)} placeholder={t("תפקיד")} className="w-40" />
                    <Input {...bind(`data.appendix.hourlyRates.${i}.rate`)} placeholder={t("₪ לשעה")} inputMode="decimal" dir="ltr" className="w-28" />
                    <Button type="button" size="icon" variant="ghost" onClick={() => rates.remove(i)} aria-label={t("הסרה")}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={rates.add}><Plus className="ms-1 h-4 w-4" />{t("תפקיד")}</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label={t("מספר משתמשים / תחנות")} hint={t("ריק: ללא הגבלה")}><Input {...bind("data.appendix.usersCount")} /></FieldRow>
              </div>
            </div>
          </Card>}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card title={t("תצוגה מקדימה")}>
            {!preview || preview.error ? <p className="text-sm text-muted-foreground">{preview?.error || t("הזינו שם פרויקט ומחיר כדי לראות את לוח התשלומים.")}</p> : (
              <div className="space-y-3 text-sm">
                {preview.price.listAmount && <p className="text-xs text-muted-foreground"><s className="tabular-nums">{nis(preview.price.listAmount)}</s> · {t("הנחה של")} <span className="tabular-nums">{nis(preview.price.discount)}</span> ({preview.price.discountPercent}%)</p>}
                <p className="font-semibold">{nis(preview.price.amount)} + {t('מע"מ')} = {nis(preview.price.total)}</p>
                <table className="w-full">
                  <tbody>
                    {preview.schedule.rows.map((r) => (
                      <tr key={r.n} className="border-b border-border/60">
                        <td className="py-1.5">{r.kind === "deposit" ? t("מקדמה {p}%", { p: preview.price.depositPercent }) : t("תשלום {n}", { n: r.n - 1 })}</td>
                        <td className="py-1.5 text-xs text-muted-foreground">{r.kind === "deposit" && !r.method ? t("עד {date}", { date: dmy(r.date) }) : dmy(r.date)}{r.method && <span className="block">{methodName(r.method)}</span>}</td>
                        <td className="py-1.5 text-end tabular-nums">{nis(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.schedule.rows.some((r) => r.dateNote && r.method === "transfer") && <p className="text-xs text-amber-700">{t("העברה בתאריך שאינו יום עסקים בנקאי צריכה להגיע ביום העסקים שלפניו.")}</p>}
                {preview.service.rows?.length > 0 && (
                  <div className="space-y-1 border-t border-border pt-3">
                    {preview.service.rows.map((r, i) => <p key={i} className="flex justify-between"><span className="text-muted-foreground">{r.when}</span><span className="tabular-nums">{r.price ? t("{amount} לחודש", { amount: nis(r.priceWithVat) }) : t("ללא עלות")}</span></p>)}
                  </div>
                )}
              </div>
            )}
          </Card>
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            {!id && !manual.on && <label className="flex items-center gap-2 text-sm"><Switch checked={sendEmail} onCheckedChange={setSendEmail} />{t("לשלוח ללקוח מייל עם הקישור")}</label>}
            {!id && !manual.on && sendEmail && <MailCopies c={copies} onChange={setCopies} />}
            {!id && manual.on && <OrderMailOptions m={manual} setM={setManual} hasFile={Boolean(manual.file)} />}
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={busy} onClick={save}>{busy ? t("שומר...") : id ? t("שמירת השינויים") : manual.on ? t("שמירת העסקה החתומה") : t("יצירת העסקה")}</Button>
          </div>
        </aside>
      </div>
      {confirm && <Confirm {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

export function DealDetail() {
  const { id } = useParams();
  const { data, error, reload } = useApi(`sales/deals?id=${id}`);
  const [confirm, setConfirm] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [closing, setClosing] = useState(null);     // the manual close form
  const [attach, setAttach] = useState(true);       // the order confirmation: with the signed contract
  const [note, setNote] = useState(null);           // editing the payment note
  if (error) return <LoadError error={error} reload={reload} />;
  if (!data) return <Spinner />;
  const x = data.item;
  const o = data.order;
  const sub = data.subscription;
  const [tone, label] = dealStatus(x);
  const act = (body, ok) => run(() => api(`sales/deals?id=${id}`, { method: "PATCH", body }), ok).then(reload);
  const file = (kind) => `/api/sales/deal-file?id=${id}&kind=${kind}`;

  return (
    <div className="max-w-5xl space-y-5">
      <Link to="/sales/deals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4 ltr:-scale-x-100" />{t("עסקאות")}</Link>
      <PageHeader title={`${x.client.companyName || x.client.signerName} · ${x.data.project.name}`} subtitle={t("עסקה מס' {n}", { n: x.number })}>
        <Pill tone={tone}>{label}</Pill>
        {x.signMode === "manual" && <Pill>{t("נחתם מחוץ לקישור")}</Pill>}
        {!x.approvedAt && !x.status.canceled && <Button size="sm" variant="outline" asChild><Link to={`/sales/deals/${id}/edit`}>{t("עריכה")}</Link></Button>}
      </PageHeader>

      <Card title={t("הקישור ללקוח")} actions={!x.status.canceled && <Button size="sm" variant="outline" onClick={() => act({ action: "send_email", cc: selfCc() }, t("המייל נשלח לתור"))}>{t("שליחה במייל")}</Button>}>
        <LinkBox url={x.url} phone={x.client.phone} message={t("היי {name}, מצורף הקישור להזמנת העבודה ולהסכם של {project}:", { name: x.client.signerName || "", project: x.data.project.name })} />
      </Card>

      {!x.status.canceled && <DealFilm id={id} project={x.data.project.name} />}
      {!x.status.canceled && x.signMode !== "manual" && <DealPitch id={id} item={x} onSaved={reload} />}

      <div className="grid gap-5 md:grid-cols-2">
        <Card title={t("מצב")}>
          <Info rows={[
            [t("נצפה"), x.viewedAt && dateTime(x.viewedAt)],
            [t("הזמנה אושרה"), x.approvedAt && dateTime(x.approvedAt)],
            [t("הסכם נחתם"), x.signedAt && (x.signMode === "manual" ? t("{date} (מחוץ לקישור)", { date: dmy(x.signedOn) }) : dateTime(x.signedAt))],
            [t("מקדמה"), x.status.deposit === "paid" ? t("שולמה") : t("ממתינה")],
            [t("הוראת קבע"), { not_required: t("לא נדרשת"), pending: t("ממתינה לכרטיס"), set: t("כרטיס נשמר"), failed: t("נכשלה") }[x.status.card]],
            [t("פרויקט"), { not_started: t("לא התחיל"), started: t("התחיל {date}", { date: dmy(x.projectStartedOn) }), delivered: t("נמסר") }[x.status.project]],
            x.snapshotHash && [t("גיבוב"), <code className="text-[11px]" dir="ltr">{x.snapshotHash.slice(0, 24)}…</code>],
          ]} />
          <div className="mt-4 flex flex-wrap gap-2">
            {x.hasSignedPdf && <Button size="sm" asChild><a href={file("signed")}>{t("הורדת ההסכם החתום")}</a></Button>}
            {x.signMode === "manual" && (
              <ContractUpload file={null} label={x.hasSignedPdf ? t("החלפת קובץ החוזה") : t("העלאת החוזה החתום")}
                onFile={(f) => act({ action: "signed_file", fileId: f.fileId }, t("החוזה נשמר"))} />
            )}
            {!x.signedAt && !x.status.canceled && !closing && <Button size="sm" variant="outline" onClick={() => setClosing({ ...blankManual(), on: true })}>{t("הלקוח חתם מחוץ לקישור")}</Button>}
            {x.data.project.specFileId && <Button size="sm" variant="outline" asChild><a href={file("spec")} target="_blank" rel="noreferrer">{t("האפיון")}</a></Button>}
            {x.signedAt && x.status.deposit !== "paid" && <Button size="sm" variant="outline" onClick={() => setConfirm({ title: t("לסמן שהמקדמה שולמה?"), onConfirm: () => act({ action: "mark_deposit_paid" }, t("סומן")) })}>{t("המקדמה שולמה")}</Button>}
            {x.signedAt && x.status.project === "started" && <Button size="sm" variant="outline" onClick={() => setConfirm({ title: t("לסמן שהמערכת נמסרה?"), onConfirm: () => act({ action: "mark_delivered" }, t("סומן")) })}>{t("המערכת נמסרה")}</Button>}
            {!x.signedAt && !x.status.canceled && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ title: t("לבטל את העסקה?"), description: t("הקישור יפסיק לעבוד."), danger: true, onConfirm: () => act({ action: "cancel" }, t("בוטלה")) })}>{t("ביטול")}</Button>}
          </div>
          {closing && (
            <form className="mt-4 space-y-3 rounded-xl border border-border p-3" onSubmit={async (e) => {
              e.preventDefault();
              const r = await run(() => api(`sales/deals?id=${id}`, { method: "PATCH", body: { action: "close_manual", ...manualPayload(closing) } }), closing.sendOrderMail ? t("נשמר, אישור ההזמנה נשלח") : t("נשמר"));
              if (r) { setClosing(null); reload(); }
            }}>
              <p className="text-sm font-medium">{t("סגירה ידנית: הלקוח חתם מחוץ לקישור")}</p>
              <p className="text-xs text-muted-foreground">{x.approvedAt ? t("ההזמנה כבר אושרה בקישור, ולוח התשלומים שאושר נשאר.") : t("ההזמנה תסומן כמאושרת ולוח התשלומים יחושב מתאריך החתימה.")} {t("הקישור ללקוח ימשיך לעבוד{card}.", { card: x.data.standingOrder?.enabled ? t(" להגדרת כרטיס להוראת הקבע") : "" })}</p>
              <ManualClose m={closing} setM={setClosing} />
              <OrderMailOptions m={closing} setM={setClosing} hasFile={Boolean(closing.file)} />
              <div className="flex gap-2"><Button type="submit" size="sm">{t("סימון כנחתם")}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setClosing(null)}>{t("ביטול")}</Button></div>
            </form>
          )}
          {x.signedAt && x.status.project === "not_started" && (
            <div className="mt-4 rounded-xl bg-secondary/60 p-3">
              <p className="text-sm font-medium">{t("תחילת עבודה")}</p>
              <p className="mb-2 text-xs text-muted-foreground">{sub && !sub.startDate ? t("קובע גם את מועד החיוב הראשון בהוראת הקבע (תחילת העבודה + החודשים הכלולים), ומודיע ללקוח.") : t("מסמן שהפרויקט התחיל.")}</p>
              <div className="flex gap-2">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="max-w-44" />
                <Button size="sm" onClick={() => act({ action: "mark_project_started", date: startDate || undefined }, t("נשמר"))}>{t("הפרויקט התחיל")}</Button>
              </div>
            </div>
          )}
        </Card>

        <Card title={t("הלקוח")}>
          <Info rows={[
            [t("חברה"), x.client.companyName], [t("ח.פ"), x.client.taxId], [t("כתובת"), x.client.address],
            [t("חותם"), [x.client.signerName, x.client.signerRole, x.signerIdNumber && t("ת.ז {id}", { id: x.signerIdNumber })].filter(Boolean).join(", ")],
            [t("אימייל"), x.client.email && <span dir="ltr">{x.client.email}</span>], [t("טלפון"), x.client.phone && <span dir="ltr">{x.client.phone}</span>],
            [t("הנהלת חשבונות"), x.client.accountingEmail && <span dir="ltr">{x.client.accountingEmail}</span>],
          ]} />
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title={t("איך הלקוח משלם")} actions={note === null && <Button size="sm" variant="ghost" onClick={() => setNote(x.paymentNote || "")}>{t("עריכה")}</Button>}>
          {note === null ? <p className="whitespace-pre-line text-sm">{x.paymentNote || <span className="text-muted-foreground">{t("לא נרשם. כאן רושמים תשלום שסוכם מחוץ לקישור, למשל מקדמה שהועברה או שירות חודשי בהעברה.")}</span>}</p> : (
            <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api(`sales/deals?id=${id}`, { method: "PATCH", body: { action: "payment_note", note } }), t("נשמר")); if (r) { setNote(null); reload(); } }}>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus />
              <div className="flex gap-2"><Button type="submit" size="sm">{t("שמירה")}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setNote(null)}>{t("ביטול")}</Button></div>
            </form>
          )}
        </Card>
        {x.signMode === "manual" && (
          <Card title={t("אישור הזמנה ללקוח")}>
            <p className="mb-3 text-sm text-muted-foreground">{t("ההזמנה, לוח התשלומים ואופן התשלום{card}. נשלח אל", { card: sub?.status === "pending_card" ? t(", עם קישור להגדרת כרטיס להוראת הקבע") : "" })} <span dir="ltr">{x.client.email || "—"}</span>{x.client.accountingEmail ? t(" ובהעתק להנהלת החשבונות") : ""}.</p>
            <label className={`mb-3 flex items-center gap-2 text-sm ${x.hasSignedPdf ? "" : "text-muted-foreground"}`}>
              <Switch checked={x.hasSignedPdf && attach} disabled={!x.hasSignedPdf} onCheckedChange={setAttach} />{t("לצרף את החוזה החתום")}{!x.hasSignedPdf && t(" (לא הועלה)")}
            </label>
            <Button size="sm" disabled={!x.client.email} onClick={() => act({ action: "send_order", attachContract: x.hasSignedPdf && attach }, t("אישור ההזמנה נשלח לתור"))}>{t("שליחת אישור הזמנה במייל")}</Button>
          </Card>
        )}
      </div>

      <Card title={t("לוח תשלומים") + (x.approvedAt ? t(" (כפי שאושר)") : t(" (מחושב מהיום)"))}>
        <table className="w-full text-sm">
          <tbody>
            {o.schedule.rows.map((r) => (
              <tr key={r.n} className="border-b border-border/60">
                <td className="py-2">{r.kind === "deposit" ? t("מקדמה {p}%", { p: o.price.depositPercent }) : t("תשלום {n}", { n: r.n - 1 })}</td>
                <td className="py-2">{dmy(r.date)}{r.dateNote && <span className="block text-xs text-muted-foreground sm:ms-2 sm:inline">{r.dateNote}</span>}</td>
                <td className="py-2 text-muted-foreground">{methodName(r.method)}</td>
                <td className="hidden whitespace-nowrap py-2 tabular-nums sm:table-cell">{nis(r.before)}</td>
                <td className="whitespace-nowrap py-2 text-end font-medium tabular-nums">{nis(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {o.payInfo?.checks?.pickupDate && <p className="mt-3 text-sm">{t("איסוף השיקים על ידי שליח:")} <span className="tabular-nums">{dmy(o.payInfo.checks.pickupDate)}</span></p>}
      </Card>

      {sub && (
        <Card title={t("הוראת קבע")} actions={<Button size="sm" variant="outline" asChild><Link to={`/sales/billing/${sub.id}`}>{t("ניהול")}</Link></Button>}>
          <Info rows={[
            [t("סטטוס"), subStatus(sub)[1]],
            [t("כרטיס"), sub.card ? `${sub.card.brand || ""} ${sub.card.suffix ? `****${sub.card.suffix}` : ""}` : t("לא הוזן")],
            [t("חיוב הבא"), sub.nextChargeDate ? `${dmy(sub.nextChargeDate)} · ${nis(sub.nextAmount)}` : t("ייקבע בתחילת העבודה")],
          ]} />
        </Card>
      )}

      <Card title={t("היסטוריה")}><History events={data.events} mails={data.mails} /></Card>
      {confirm && <Confirm {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

export const subStatus = (s) => ({
  pending_card: ["amber", t("ממתין לכרטיס")], active: ["green", t("פעיל")], paused: ["gray", t("מושהה")],
  failed: ["red", t("חיוב נכשל")], canceled: ["gray", t("בוטל")], ended: ["gray", t("הסתיים")],
}[s.status] || ["gray", s.status]);

// the key lines at the top of the client's page and in the order email: edited at any time, even after the
// client approved, since they are not part of the order
function DealPitch({ id, item, onSaved }) {
  const [p, setP] = useState(() => pitchFrom(item));
  const [busy, setBusy] = useState(false);
  const saved = JSON.stringify(pitchBody(pitchFrom(item)));
  const dirty = JSON.stringify(pitchBody(p)) !== saved;
  const save = async () => {
    setBusy(true);
    const r = await run(() => api(`sales/deals?id=${id}`, { method: "PATCH", body: { action: "pitch", pitch: pitchBody(p) } }), t("נשמר"));
    setBusy(false);
    if (r) onSaved();
  };
  return (
    <Card title={t("משפטי מפתח בראש העמוד של הלקוח")} actions={dirty && <Button size="sm" onClick={save} disabled={busy}>{busy ? t("שומר...") : t("שמירה")}</Button>}>
      <p className="mb-3 text-sm text-muted-foreground">{t("מופיעים בראש הזמנת העבודה ובמייל ההזמנה, במקום תיאור הפרויקט. אפשר לשנות בכל שלב.")}</p>
      <PitchFields p={p} onChange={setP} stage="deal" />
    </Card>
  );
}
