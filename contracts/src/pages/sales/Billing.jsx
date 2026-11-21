import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { api, dateTime, dmy, errorText, FIELD_ERRORS, isEmail, mobileIL, nis, taxIdIL } from "@/sales/lib";
import { Card, FieldRow, History, Info, LinkBox, LoadError, PageHeader, Pill, Spinner, run, useApi } from "./AdminUi.jsx";
import { Confirm } from "./Discovery.jsx";
import { subStatus } from "./Deals.jsx";

const scheduleText = (s, vat) => (s || []).map((p) => `${nis(Math.round(p.amount * (1 + vat / 100) * 100) / 100)}${p.months ? ` × ${p.months} ח'` : " לחודש"}`).join(" ← ");

export function BillingList() {
  const { data, error, reload } = useApi("billing/subscriptions");
  const [filter, setFilter] = useState("live");
  if (error) return <LoadError error={error} reload={reload} />;
  if (!data) return <Spinner />;
  const live = (s) => !["canceled", "ended"].includes(s.status);
  const items = data.items.filter((s) => (filter === "live" ? live(s) : filter === "attention" ? ["failed", "pending_card"].includes(s.status) : true));
  const monthly = data.items.filter((s) => s.status === "active").reduce((a, s) => a + (s.nextAmount || 0), 0);
  return (
    <>
      <PageHeader title="הוראות קבע" subtitle="חיוב חודשי אוטומטי בכרטיס, עם חשבונית שנשלחת ללקוח אחרי כל חיוב">
        <Button asChild><Link to="/sales/billing/new"><Plus className="ms-1 h-4 w-4" />הוראת קבע חדשה</Link></Button>
      </PageHeader>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="נגבה החודש" value={nis(data.month.paid)} sub={`${data.month.charges} חיובים`} />
        <Stat label="פעילות" value={data.items.filter((s) => s.status === "active").length} sub={`${nis(Math.round(monthly * 100) / 100)} בחיוב הבא`} />
        <Stat label="דורשות טיפול" value={data.items.filter((s) => ["failed", "pending_card"].includes(s.status)).length} sub="חיוב נכשל או ממתין לכרטיס" />
      </div>
      <div className="mb-4 flex gap-1 text-sm">
        {[["live", "פעילות"], ["attention", "דורשות טיפול"], ["all", "הכול"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 ${filter === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{l}</button>
        ))}
      </div>
      {items.length === 0 ? <p className="py-16 text-center text-muted-foreground">אין הוראות קבע להצגה.</p> : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">לקוח</th><th className="p-3 text-start font-medium">סכום</th>
              <th className="p-3 text-start font-medium">חיוב הבא</th><th className="p-3 text-start font-medium">כרטיס</th><th className="p-3 text-start font-medium">סטטוס</th>
            </tr></thead>
            <tbody>
              {items.map((s) => {
                const [tone, label] = subStatus(s);
                return (
                  <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/50">
                    <td className="p-3"><Link to={`/sales/billing/${s.id}`} className="font-medium hover:underline">{s.customer.company || s.customer.name}</Link><div className="text-xs text-muted-foreground">{s.description}</div></td>
                    <td className="p-3 tabular-nums">{s.nextAmount != null ? nis(s.nextAmount) : "—"}</td>
                    <td className="p-3 tabular-nums">{s.status === "failed" && s.retryOn ? `ניסיון חוזר ${dmy(s.retryOn)}` : s.nextChargeDate ? dmy(s.nextChargeDate) : "טרם נקבע"}</td>
                    <td className="p-3 tabular-nums">{s.card?.suffix ? `****${s.card.suffix}` : "—"}</td>
                    <td className="p-3"><Pill tone={tone}>{label}</Pill></td>
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

const Stat = ({ label, value, sub }) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
  </div>
);

function ScheduleEditor({ value, onChange }) {
  return (
    <div className="space-y-2">
      {value.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={p.months ?? ""} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, months: e.target.value ? Number(e.target.value) : null } : x)))} placeholder="ללא הגבלה" inputMode="numeric" dir="ltr" className="w-28" aria-label="חודשים" />
          <span className="text-sm text-muted-foreground">חודשים ב-</span>
          <Input value={p.amount} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder='₪ לפני מע"מ' inputMode="decimal" dir="ltr" className="w-32" aria-label="סכום לחודש" />
          {value.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="הסרה"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { months: null, amount: "" }])}><Plus className="ms-1 h-4 w-4" />תקופה</Button>
    </div>
  );
}

export function BillingNew() {
  const navigate = useNavigate();
  const [c, setC] = useState({ name: "", company: "", taxId: "", email: "", phone: "", accountingEmail: "" });
  const [f, setF] = useState({ description: "שירות חודשי", startDate: "", dayOfMonth: 1, sendLink: true });
  const [schedule, setSchedule] = useState([{ months: null, amount: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cs = (k) => ({ value: c[k], onChange: (e) => setC((s) => ({ ...s, [k]: e.target.value })) });
  const fs = (k) => ({ value: f[k], onChange: (e) => setF((s) => ({ ...s, [k]: e.target.value })) });

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!c.name && !c.company) return setError("יש להזין שם לקוח");
    if (!isEmail(c.email)) return setError("יש להזין אימייל תקין של הלקוח");
    // Grow's card page needs a valid mobile; the invoice a valid tax id
    if (!mobileIL(c.phone)) return setError(FIELD_ERRORS.phone);
    if (c.taxId.trim() && !taxIdIL(c.taxId)) return setError(FIELD_ERRORS.taxId);
    setBusy(true);
    try {
      const r = await api("billing/subscriptions", { method: "POST", body: { customer: c, ...f, schedule } });
      navigate(`/sales/billing/${r.item.id}`);
    } catch (err) { setBusy(false); setError(errorText(err)); }
  };

  return (
    <div className="max-w-2xl">
      <Link to="/sales/billing" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />הוראות קבע</Link>
      <PageHeader title="הוראת קבע חדשה" subtitle="ללקוח שאינו מעסקה. הלקוח מזין כרטיס דרך קישור שנשלח אליו" />
      <form onSubmit={save} className="space-y-5 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label="שם הלקוח"><Input {...cs("name")} /></FieldRow>
          <FieldRow label="חברה"><Input {...cs("company")} /></FieldRow>
          <FieldRow label="ח.פ / ע.מ"><Input {...cs("taxId")} dir="ltr" /></FieldRow>
          <FieldRow label="טלפון"><Input {...cs("phone")} dir="ltr" /></FieldRow>
          <FieldRow label="אימייל *"><Input {...cs("email")} type="email" dir="ltr" /></FieldRow>
          <FieldRow label="אימייל לחשבוניות" hint="ריק: לאימייל של הלקוח"><Input {...cs("accountingEmail")} type="email" dir="ltr" /></FieldRow>
        </div>
        <FieldRow label="תיאור (מופיע בחשבונית)"><Input {...fs("description")} /></FieldRow>
        <div><p className="mb-2 text-sm font-medium">סכום חודשי לפי תקופות</p><ScheduleEditor value={schedule} onChange={setSchedule} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label="תאריך החיוב הראשון" hint="ריק: ייקבע מאוחר יותר"><Input {...fs("startDate")} type="date" /></FieldRow>
          <FieldRow label="יום החיוב בחודש"><Input {...fs("dayOfMonth")} inputMode="numeric" dir="ltr" /></FieldRow>
        </div>
        <label className="flex items-center gap-3 text-sm"><Switch checked={f.sendLink} onCheckedChange={(v) => setF((s) => ({ ...s, sendLink: v }))} />לשלוח ללקוח קישור להזנת כרטיס</label>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "יוצר..." : "יצירה"}</Button>
      </form>
    </div>
  );
}

const CHARGE = { paid: ["green", "שולם"], failed: ["red", "נכשל"], processing: ["amber", "בתהליך"] };

export function BillingDetail() {
  const { id } = useParams();
  const { data, error, reload } = useApi(`billing/subscriptions?id=${id}`);
  const [confirm, setConfirm] = useState(null);
  const [edit, setEdit] = useState(null);
  if (error) return <LoadError error={error} reload={reload} />;
  if (!data) return <Spinner />;
  const s = data.item;
  const [tone, label] = subStatus(s);
  const act = (body, ok) => run(() => api(`billing/subscriptions?id=${id}`, { method: "PATCH", body }), ok).then((r) => { reload(); return r; });
  const live = !["canceled", "ended"].includes(s.status);

  return (
    <div className="max-w-5xl space-y-5">
      <Link to="/sales/billing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />הוראות קבע</Link>
      <PageHeader title={s.customer.company || s.customer.name} subtitle={s.description}>
        <Pill tone={tone}>{label}</Pill>
      </PageHeader>

      {live && (
        <div className="flex flex-wrap gap-2">
          {s.card && <Button size="sm" onClick={() => setConfirm({ title: `לחייב עכשיו ${nis(s.nextAmount)}?`, description: "החיוב יבוצע מיד בכרטיס השמור, והחשבונית תישלח ללקוח.", onConfirm: async () => { const r = await act({ action: "charge_now" }); if (r?.run && !r.run.ok) toast({ title: "שרת החיובים לא ענה. החיוב יתבצע בריצה היומית הקרובה.", variant: "destructive" }); else if (r) toast({ title: "בקשת החיוב נשלחה" }); } })}>חיוב עכשיו</Button>}
          {["active", "pending_card", "failed"].includes(s.status) && <Button size="sm" variant="outline" onClick={() => setConfirm({ title: "להשהות את הוראת הקבע?", description: "לא יבוצעו חיובים עד החידוש.", onConfirm: () => act({ action: "pause" }, "הושהתה") })}>השהיה</Button>}
          {["paused", "failed"].includes(s.status) && <Button size="sm" variant="outline" onClick={() => setConfirm({ title: "לחדש את הוראת הקבע?", description: s.status === "failed" ? "החיוב יתבצע שוב בריצה הקרובה." : "אם מועד החיוב עבר, החיוב יתבצע בריצה הקרובה.", onConfirm: () => act({ action: "resume" }, "חודשה") })}>חידוש</Button>}
          <Button size="sm" variant="outline" onClick={() => act({ action: "send_card_link" }, "הקישור נשלח לתור")}>{s.card ? "שליחת קישור להחלפת כרטיס" : "שליחת קישור להזנת כרטיס"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit({ schedule: s.schedule.map((p) => ({ ...p })), nextChargeDate: s.nextChargeDate || "", dayOfMonth: s.dayOfMonth, description: s.description, notes: s.notes || "" })}>עריכה</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ title: "לבטל את הוראת הקבע?", description: "לא יבוצעו חיובים נוספים. אי אפשר לחדש הוראת קבע שבוטלה.", danger: true, onConfirm: () => act({ action: "cancel" }, "בוטלה") })}>ביטול</Button>
        </div>
      )}

      {edit && (
        <Card title="עריכה">
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const r = await act({ action: "update", ...edit, nextChargeDate: edit.nextChargeDate || null }, "נשמר"); if (r) setEdit(null); }}>
            <FieldRow label="תיאור"><Input value={edit.description} onChange={(e) => setEdit((x) => ({ ...x, description: e.target.value }))} /></FieldRow>
            <div><p className="mb-2 text-sm font-medium">סכום לפי תקופות (לפני מע"מ, נספר מהחיוב הראשון)</p><ScheduleEditor value={edit.schedule} onChange={(v) => setEdit((x) => ({ ...x, schedule: v }))} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="מועד החיוב הבא"><Input type="date" value={edit.nextChargeDate} onChange={(e) => setEdit((x) => ({ ...x, nextChargeDate: e.target.value }))} /></FieldRow>
              <FieldRow label="יום החיוב בחודש"><Input value={edit.dayOfMonth} onChange={(e) => setEdit((x) => ({ ...x, dayOfMonth: e.target.value }))} dir="ltr" /></FieldRow>
            </div>
            <FieldRow label="הערות פנימיות"><Textarea value={edit.notes} onChange={(e) => setEdit((x) => ({ ...x, notes: e.target.value }))} rows={2} /></FieldRow>
            <div className="flex gap-2"><Button type="submit" size="sm">שמירה</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEdit(null)}>ביטול</Button></div>
          </form>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="פרטים">
          <Info rows={[
            ["סכומים", scheduleText(s.schedule, s.vatRate) + ' (כולל מע"מ)'],
            ["חיוב הבא", s.nextChargeDate ? `${dmy(s.nextChargeDate)} · ${nis(s.nextAmount)}` : "טרם נקבע"],
            s.status === "failed" && ["ניסיונות שנכשלו", s.failedAttempts],
            s.retryOn && ["ניסיון חוזר", dmy(s.retryOn)],
            ["חיובים שבוצעו", s.chargesDone],
            ["כרטיס", s.card ? `${s.card.brand || ""} ****${s.card.suffix || ""}${s.card.exp ? ` · ${s.card.exp}` : ""}` : "לא הוזן"],
            s.cardSetAt && ["הכרטיס נשמר", dateTime(s.cardSetAt)],
            data.deal && ["עסקה", <Link to={`/sales/deals/${data.deal.id}`} className="text-primary underline">#{data.deal.number} · {data.deal.project}</Link>],
            s.notes && ["הערות", s.notes],
          ]} />
        </Card>
        <Card title="הלקוח">
          <Info rows={[
            ["שם", s.customer.name], ["חברה", s.customer.company], ["ח.פ", s.customer.taxId],
            ["אימייל", <span dir="ltr">{s.customer.email}</span>], ["חשבוניות", s.customer.accountingEmail && <span dir="ltr">{s.customer.accountingEmail}</span>],
            ["טלפון", s.customer.phone && <span dir="ltr">{s.customer.phone}</span>],
          ]} />
          {live && <div className="mt-4"><p className="mb-1 text-xs text-muted-foreground">קישור הכרטיס ללקוח</p><LinkBox url={s.cardLink} phone={s.customer.phone} message="היי, זה הקישור להזנת אמצעי התשלום לשירות החודשי:" /></div>}
        </Card>
      </div>

      <Card title="חיובים וחשבוניות">
        {data.charges.length === 0 ? <p className="text-sm text-muted-foreground">עדיין לא בוצעו חיובים.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-border text-muted-foreground">
                <th className="py-2 text-start font-medium">מועד</th><th className="py-2 text-start font-medium">סכום</th><th className="py-2 text-start font-medium">סטטוס</th>
                <th className="py-2 text-start font-medium">אסמכתא</th><th className="py-2 text-start font-medium">חשבונית</th>
              </tr></thead>
              <tbody>
                {data.charges.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className="py-2 tabular-nums">{dmy(c.dueDate)}{c.attempt > 1 && <span className="ms-1 text-xs text-muted-foreground">ניסיון {c.attempt}</span>}{c.manual && <span className="ms-1 text-xs text-muted-foreground">ידני</span>}</td>
                    <td className="py-2 tabular-nums">{nis(c.amount)}</td>
                    <td className="py-2"><Pill tone={CHARGE[c.status]?.[0]}>{CHARGE[c.status]?.[1] || c.status}</Pill>{c.error && <div className="text-xs text-destructive">{c.error}</div>}
                      {c.status === "processing" && Date.now() - new Date(c.createdAt) > 30 * 60000 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          שרת החיובים לא דיווח על התוצאה. בדקו ב-Grow:{" "}
                          <button type="button" className="text-primary underline" onClick={() => setConfirm({ title: "לסמן את החיוב כנגבה?", description: "רק אם החיוב מופיע ב-Grow. הוראת הקבע תעבור לחודש הבא. חשבונית לא תופק אוטומטית.", onConfirm: () => act({ action: "settle_charge", chargeId: c.id, outcome: "paid" }, "סומן כנגבה") })}>נגבה</button>
                          {" · "}
                          <button type="button" className="text-primary underline" onClick={() => setConfirm({ title: "לסמן שהחיוב לא בוצע?", description: "החיוב ינוסה שוב בריצה היומית הקרובה.", onConfirm: () => act({ action: "settle_charge", chargeId: c.id, outcome: "not_charged" }, "שוחרר לחיוב חוזר") })}>לא נגבה</button>
                        </div>
                      )}</td>
                    <td className="py-2 text-xs tabular-nums" dir="ltr">{c.asmachta || c.transactionId || "—"}</td>
                    <td className="py-2">{c.hasInvoice ? <a href={`/api/billing/invoice?charge=${c.id}`} className="text-primary underline">{c.invoiceNumber || "הורדה"}</a> : c.invoiceError ? <span className="text-xs text-destructive">{c.invoiceError}</span> : c.invoiceNumber || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="היסטוריה"><History events={data.events} mails={data.mails} /></Card>
      {confirm && <Confirm {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
