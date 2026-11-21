import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { api, dateTime, dmy, errorText, FIELD_ERRORS, fileToDataUrl, isEmail, mobileIL, nis, taxIdIL } from "@/sales/lib";
import { Card, FieldRow, History, Info, LinkBox, LoadError, PageHeader, Pill, Spinner, run, useApi } from "./AdminUi.jsx";
import { Confirm } from "./Discovery.jsx";

export function dealStatus(x) {
  if (x.status.canceled) return ["gray", "בוטלה"];
  if (x.status.project === "delivered") return ["green", "נמסר"];
  if (x.status.project === "started") return ["green", "בפיתוח"];
  if (x.signedAt) return x.status.card === "pending" ? ["blue", "נחתם, ממתין לכרטיס"] : ["green", "נחתם"];
  if (x.approvedAt) return ["blue", "ההזמנה אושרה, ממתין לחתימה"];
  if (x.viewedAt) return ["amber", "נצפה"];
  return ["gray", "נשלח"];
}

export function DealsList() {
  const { data, error, reload } = useApi("sales/deals");
  const [q, setQ] = useState("");
  if (error) return <LoadError error={error} reload={reload} />;
  if (!data) return <Spinner />;
  const items = data.items.filter((x) => !q || `${x.number} ${x.client.companyName} ${x.client.signerName} ${x.data.project.name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="עסקאות" subtitle="הזמנת עבודה, הסכם לחתימה והוראת קבע לשירות החודשי">
        <Button asChild><Link to="/sales/deals/new"><Plus className="ms-1 h-4 w-4" />עסקה חדשה</Link></Button>
      </PageHeader>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי מספר, לקוח או פרויקט" className="mb-4 max-w-sm" />
      {items.length === 0 ? <p className="py-16 text-center text-muted-foreground">{data.items.length ? "לא נמצאו תוצאות" : "עדיין אין עסקאות."}</p> : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">#</th><th className="p-3 text-start font-medium">לקוח ופרויקט</th>
              <th className="p-3 text-start font-medium">מחיר</th><th className="p-3 text-start font-medium">סטטוס</th>
              <th className="p-3 text-start font-medium">מקדמה</th><th className="p-3 text-start font-medium">נוצר</th>
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
                    <td className="p-3">{x.status.deposit === "paid" ? <Pill tone="green">שולמה</Pill> : x.signedAt ? <Pill tone="amber">ממתינה</Pill> : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground tabular-nums">{dateTime(x.createdAt)}</td>
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
    project: { name: "", summary: "", specName: "", specVersion: "", specDate: "", specFileId: null, targetWeeks: "", kickoffNeeds: "" },
    price: { amount: "", vatRate: s?.vatRate ?? 18, depositPercent: s?.depositPercent ?? 30, installments: 3, installmentDay: 1, balanceMethod: "transfer" },
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
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);

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

  const upload = async (file) => {
    if (!file) return;
    const r = await run(async () => api("sales/upload", { method: "POST", body: { name: file.name, data_url: await fileToDataUrl(file) } }), "האפיון הועלה");
    if (r) setF((s) => setIn(setIn(s, "data.project.specFileId", r.fileId), "data.project.specName", s.data.project.specName || file.name.replace(/\.pdf$/i, "")));
  };

  const save = async () => {
    setError("");
    if (!f.data.project.name.trim()) return setError("יש להזין שם לפרויקט");
    if (!(Number(f.data.price.amount) > 0)) return setError("יש להזין מחיר");
    if (!f.client.companyName.trim() && !f.client.signerName.trim()) return setError("יש להזין שם חברה או שם החותם");
    if (!isEmail(f.client.email)) return setError("יש להזין אימייל תקין של הלקוח");
    // the client can still correct them on the page, but Grow (invoices, card) refuses invalid ones
    if (f.client.phone.trim() && !mobileIL(f.client.phone)) return setError(`טלפון הלקוח: ${FIELD_ERRORS.phone}`);
    if (f.client.taxId.trim() && !taxIdIL(f.client.taxId)) return setError(`ח.פ הלקוח: ${FIELD_ERRORS.taxId}`);
    if (f.client.authorizedContact?.email && !isEmail(f.client.authorizedContact.email)) return setError(`איש הקשר המוסמך: ${FIELD_ERRORS.email}`);
    if (f.data.service.enabled && !f.data.standingOrder.startDate) return setError("יש לבחור את תאריך החיוב הראשון של השירות החודשי");
    setBusy(true);
    try {
      if (id) {
        await api(`sales/deals?id=${id}`, { method: "PATCH", body: { action: "update", ...f } });
        navigate(`/sales/deals/${id}`);
      } else {
        const r = await api("sales/deals", { method: "POST", body: { ...f, sendEmail } });
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
      <Link to={id ? `/sales/deals/${id}` : "/sales/deals"} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />{id ? "חזרה לעסקה" : "עסקאות"}</Link>
      <PageHeader title={id ? `עריכת עסקה ${existing.data?.item.number || ""}` : "עסקה חדשה"} subtitle="הלקוח יקבל קישור: סיכום ההזמנה, ההסכם לחתימה, ואז כרטיס להוראת קבע" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card title="הלקוח">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="שם החברה"><Input {...bind("client.companyName")} /></FieldRow>
              <FieldRow label="ח.פ / ע.מ" hint="אפשר להשאיר ריק. הלקוח ימלא באישור"><Input {...bind("client.taxId")} dir="ltr" /></FieldRow>
              <FieldRow label="אימייל (לשם יישלח הקישור) *"><Input {...bind("client.email")} type="email" dir="ltr" /></FieldRow>
              <FieldRow label="טלפון נייד" hint="אפשר להשאיר ריק. הלקוח ימלא באישור"><Input {...bind("client.phone")} dir="ltr" /></FieldRow>
              <FieldRow label="שם החותם" hint="הלקוח יראה ויוכל לשנות לפני החתימה"><Input {...bind("client.signerName")} /></FieldRow>
              <FieldRow label="תפקיד החותם"><Input {...bind("client.signerRole")} /></FieldRow>
              <FieldRow label="אימייל הנהלת חשבונות" hint="אפשר להשאיר ריק. הלקוח ימלא באישור"><Input {...bind("client.accountingEmail")} type="email" dir="ltr" /></FieldRow>
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium">איש קשר מוסמך לשינויים ולבקשות פיתוח</p>
              <p className="mb-2 text-xs text-muted-foreground">מי שמעביר אלינו שינויים ובקשות פיתוח ומאשר אותם בשם הלקוח. אפשר להשאיר ריק, הלקוח ימלא באישור.</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Input {...bind("client.authorizedContact.name")} placeholder="שם" />
                <Input {...bind("client.authorizedContact.role")} placeholder="תפקיד" />
                <Input {...bind("client.authorizedContact.phone")} placeholder="טלפון" dir="ltr" />
                <Input {...bind("client.authorizedContact.email")} placeholder="אימייל" dir="ltr" />
              </div>
            </div>
          </Card>

          <Card title="הפרויקט">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="שם הפרויקט *" className="sm:col-span-2"><Input {...bind("data.project.name")} /></FieldRow>
              <FieldRow label="מה מפתחים (בשתי-שלוש שורות)" className="sm:col-span-2" hint="מופיע בראש העמוד של הלקוח"><Textarea {...bind("data.project.summary")} rows={3} /></FieldRow>
              <div className="sm:col-span-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary">
                  <Upload className="h-4 w-4" />{f.data.project.specFileId ? `האפיון מצורף${f.data.project.specName ? ` (${f.data.project.specName})` : ""} · החלפה` : "צירוף קובץ האפיון (PDF)"}
                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
                </label>
                <p className="mt-1 text-xs text-muted-foreground">קובץ ה-PDF של האפיון מ-Canva. זה המסמך שמגדיר את התכולה בהסכם.</p>
              </div>
              <FieldRow label="יעד פיתוח משוער (שבועות)"><Input {...bind("data.project.targetWeeks")} inputMode="numeric" dir="ltr" /></FieldRow>
              <FieldRow label="מה נצטרך מהלקוח לפתיחה" className="sm:col-span-2"><Textarea {...bind("data.project.kickoffNeeds")} rows={2} /></FieldRow>
            </div>
          </Card>
          <Card title="מחיר ותשלומים">
            <div className="grid gap-3 sm:grid-cols-3">
              <FieldRow label='מחיר לפני מע"מ *'><Input {...bind("data.price.amount")} inputMode="decimal" dir="ltr" /></FieldRow>
              <FieldRow label="מקדמה %"><Input {...bind("data.price.depositPercent")} inputMode="numeric" dir="ltr" /></FieldRow>
              <FieldRow label='מע"מ %'><Input {...bind("data.price.vatRate")} inputMode="decimal" dir="ltr" /></FieldRow>
              <FieldRow label="מספר תשלומי יתרה"><Input {...bind("data.price.installments")} inputMode="numeric" dir="ltr" /></FieldRow>
              <FieldRow label="יום בחודש לתשלום"><Input {...bind("data.price.installmentDay")} inputMode="numeric" dir="ltr" /></FieldRow>
              <FieldRow label="אמצעי תשלום היתרה">
                <select {...bind("data.price.balanceMethod")} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                  <option value="transfer">העברה בנקאית</option><option value="checks">שיקים דחויים</option>
                </select>
              </FieldRow>
            </div>
          </Card>

          <Card title="שירות חודשי והוראת קבע" actions={<label className="flex items-center gap-2 text-sm"><Switch checked={f.data.service.enabled} onCheckedChange={(x) => setF((s) => setIn(s, "data.service.enabled", x))} />שירות חודשי</label>}>
            {f.data.service.enabled ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">תקופות בתשלום (לפני מע"מ)</p>
                  {f.data.service.periods.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={p.months ?? ""} onChange={(e) => setF((s) => setIn(s, `data.service.periods.${i}.months`, e.target.value ? Number(e.target.value) : null))} placeholder="ללא הגבלה" inputMode="numeric" dir="ltr" className="w-28" aria-label="חודשים" />
                      <span className="text-sm text-muted-foreground">חודשים ב-</span>
                      <Input value={p.price} onChange={(e) => setF((s) => setIn(s, `data.service.periods.${i}.price`, e.target.value))} placeholder="₪ לחודש" inputMode="decimal" dir="ltr" className="w-32" aria-label="מחיר לחודש" />
                      <Button type="button" size="icon" variant="ghost" onClick={() => periods.remove(i)} aria-label="הסרה"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" onClick={periods.add}><Plus className="ms-1 h-4 w-4" />תקופה</Button>
                  <p className="text-xs text-muted-foreground">תקופה בלי מספר חודשים נמשכת עד שמפסיקים. התקופה האחרונה היא בדרך כלל כזו.</p>
                </div>
                <FieldRow label="תאריך החיוב הראשון *" hint={f.data.standingOrder.startDate ? `עד אז השירות כלול במחיר הפרויקט. החיובים הבאים ב-${Number(f.data.standingOrder.startDate.slice(8, 10))} בכל חודש. התאריך נכתב בהסכם.` : "עד התאריך הזה השירות כלול במחיר הפרויקט. התאריך נכתב בהסכם."}>
                  <Input {...bind("data.standingOrder.startDate")} type="date" className="max-w-48" />
                </FieldRow>
                <FieldRow label="מה השירות החודשי כולל">
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
                <label className="flex items-center gap-2 text-sm"><Switch checked={f.data.standingOrder.enabled} onCheckedChange={(x) => setF((s) => setIn(s, "data.standingOrder.enabled", x))} />גבייה בהוראת קבע בכרטיס אשראי</label>
              </div>
            ) : <p className="text-sm text-muted-foreground">ללא שירות חודשי.</p>}
          </Card>

          <Card title="נספח א'">
            <div className="space-y-5">
              <FieldRow label="לא כלול" hint="מה לא כלול בפרויקט, מעבר למה שלא מופיע באפיון"><Textarea {...bind("data.appendix.notIncluded")} rows={2} /></FieldRow>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch checked={Boolean(ap.exclusivity)} onCheckedChange={(x) => {
                    if (!x) return setF((s) => setIn(s, "data.appendix.exclusivity", ""));
                    setConfirm({
                      title: "לתת ללקוח בלעדיות?",
                      description: "ברירת המחדל בהסכם היא ללא בלעדיות: אנחנו רשאים לעבוד גם עם מתחרים של הלקוח. בלעדיות מגבילה אותנו. להמשיך רק אם זה סוכם במפורש.",
                      onConfirm: () => setF((s) => setIn(s, "data.appendix.exclusivity", "בלעדי")),
                    });
                  }} />בלעדיות ללקוח
                </label>
                {ap.exclusivity ? (
                  <FieldRow label="מה בדיוק הבלעדיות" className="mt-2" hint="למשל: לא נפתח מערכת דומה למתחרה ישיר באזור X במשך שנה"><Textarea {...bind("data.appendix.exclusivity")} rows={2} /></FieldRow>
                ) : <p className="mt-1 text-xs text-muted-foreground">ללא בלעדיות (ברירת המחדל)</p>}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">מה ייחשב כהשלמה מוצלחת של הפיתוח</p>
                <p className="text-xs text-muted-foreground">לכל שלב: מה נמסר, על מה בודקים ומה צריך לצאת. לפי זה הלקוח מאשר שהעבודה הושלמה. אפשר להשאיר ריק, ואז הבדיקה היא מול האפיון.</p>
                {ap.stages.map((s, i) => (
                  <div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
                    <Input {...bind(`data.appendix.stages.${i}.deliverable`)} placeholder="מה נמסר (למשל: הפקת גיליון בודד)" />
                    <Input {...bind(`data.appendix.stages.${i}.target`)} placeholder="מתי בערך (למשל: שבוע 3)" />
                    <Input {...bind(`data.appendix.stages.${i}.testFiles`)} placeholder="על אילו קבצים בודקים" />
                    <div className="flex gap-2"><Input {...bind(`data.appendix.stages.${i}.criteria`)} placeholder="מה צריך לצאת כדי שזה ייחשב תקין" /><Button type="button" size="icon" variant="ghost" onClick={() => stages.remove(i)} aria-label="הסרת שלב"><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={stages.add}><Plus className="ms-1 h-4 w-4" />שלב</Button>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">תעריפי שעה (לפני מע"מ)</p>
                <p className="text-xs text-muted-foreground">לתמחור שינויים ולחישוב אם הלקוח מבטל באמצע. ברירת המחדל מההגדרות.</p>
                {ap.hourlyRates.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input {...bind(`data.appendix.hourlyRates.${i}.role`)} placeholder="תפקיד" className="w-40" />
                    <Input {...bind(`data.appendix.hourlyRates.${i}.rate`)} placeholder="₪ לשעה" inputMode="decimal" dir="ltr" className="w-28" />
                    <Button type="button" size="icon" variant="ghost" onClick={() => rates.remove(i)} aria-label="הסרה"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={rates.add}><Plus className="ms-1 h-4 w-4" />תפקיד</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="מספר משתמשים / תחנות" hint="ריק: ללא הגבלה"><Input {...bind("data.appendix.usersCount")} /></FieldRow>
                {f.data.service.enabled && <FieldRow label="תקרת אחריות עד תחילת החיוב החודשי (₪)" hint="סעיף 12.3"><Input {...bind("data.appendix.liabilityCapIncluded")} inputMode="decimal" dir="ltr" /></FieldRow>}
              </div>
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card title="תצוגה מקדימה">
            {!preview || preview.error ? <p className="text-sm text-muted-foreground">{preview?.error || "הזינו שם פרויקט ומחיר כדי לראות את לוח התשלומים."}</p> : (
              <div className="space-y-3 text-sm">
                <p className="font-semibold">{nis(preview.price.amount)} + מע"מ = {nis(preview.price.total)}</p>
                <table className="w-full">
                  <tbody>
                    {preview.schedule.rows.map((r) => (
                      <tr key={r.n} className="border-b border-border/60">
                        <td className="py-1.5">{r.kind === "deposit" ? `מקדמה ${preview.price.depositPercent}%` : `תשלום ${r.n - 1}`}</td>
                        <td className="py-1.5 text-xs text-muted-foreground">{r.kind === "deposit" ? `עד ${dmy(r.date)}` : dmy(r.date)}</td>
                        <td className="py-1.5 text-end tabular-nums">{nis(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground">התאריכים מחושבים מהיום. בפועל הם נקבעים ביום שהלקוח מאשר את ההזמנה (ימי עסקים, בלי שישי-שבת וחגים).</p>
                {preview.service.rows?.length > 0 && (
                  <div className="space-y-1 border-t border-border pt-3">
                    {preview.service.rows.map((r, i) => <p key={i} className="flex justify-between"><span className="text-muted-foreground">{r.when}</span><span className="tabular-nums">{r.price ? `${nis(r.priceWithVat)} לחודש` : "ללא עלות"}</span></p>)}
                  </div>
                )}
              </div>
            )}
          </Card>
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            {!id && <label className="flex items-center gap-2 text-sm"><Switch checked={sendEmail} onCheckedChange={setSendEmail} />לשלוח ללקוח מייל עם הקישור</label>}
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={busy} onClick={save}>{busy ? "שומר..." : id ? "שמירת השינויים" : "יצירת העסקה"}</Button>
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
      <Link to="/sales/deals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />עסקאות</Link>
      <PageHeader title={`${x.client.companyName || x.client.signerName} · ${x.data.project.name}`} subtitle={`עסקה מס' ${x.number}`}>
        <Pill tone={tone}>{label}</Pill>
        {!x.approvedAt && !x.status.canceled && <Button size="sm" variant="outline" asChild><Link to={`/sales/deals/${id}/edit`}>עריכה</Link></Button>}
      </PageHeader>

      <Card title="הקישור ללקוח" actions={!x.status.canceled && <Button size="sm" variant="outline" onClick={() => act({ action: "send_email" }, "המייל נשלח לתור")}>שליחה במייל</Button>}>
        <LinkBox url={x.url} phone={x.client.phone} message={`היי ${x.client.signerName || ""}, מצורף הקישור להזמנת העבודה ולהסכם של ${x.data.project.name}:`} />
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="מצב">
          <Info rows={[
            ["נצפה", x.viewedAt && dateTime(x.viewedAt)],
            ["הזמנה אושרה", x.approvedAt && dateTime(x.approvedAt)],
            ["הסכם נחתם", x.signedAt && dateTime(x.signedAt)],
            ["מקדמה", x.status.deposit === "paid" ? "שולמה" : "ממתינה"],
            ["הוראת קבע", { not_required: "לא נדרשת", pending: "ממתינה לכרטיס", set: "כרטיס נשמר", failed: "נכשלה" }[x.status.card]],
            ["פרויקט", { not_started: "לא התחיל", started: `התחיל ${dmy(x.projectStartedOn)}`, delivered: "נמסר" }[x.status.project]],
            x.snapshotHash && ["גיבוב", <code className="text-[11px]" dir="ltr">{x.snapshotHash.slice(0, 24)}…</code>],
          ]} />
          <div className="mt-4 flex flex-wrap gap-2">
            {x.hasSignedPdf && <Button size="sm" asChild><a href={file("signed")}>הורדת ההסכם החתום</a></Button>}
            {x.data.project.specFileId && <Button size="sm" variant="outline" asChild><a href={file("spec")} target="_blank" rel="noreferrer">האפיון</a></Button>}
            {x.signedAt && x.status.deposit !== "paid" && <Button size="sm" variant="outline" onClick={() => setConfirm({ title: "לסמן שהמקדמה שולמה?", onConfirm: () => act({ action: "mark_deposit_paid" }, "סומן") })}>המקדמה שולמה</Button>}
            {x.signedAt && x.status.project === "started" && <Button size="sm" variant="outline" onClick={() => setConfirm({ title: "לסמן שהמערכת נמסרה?", onConfirm: () => act({ action: "mark_delivered" }, "סומן") })}>המערכת נמסרה</Button>}
            {!x.signedAt && !x.status.canceled && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ title: "לבטל את העסקה?", description: "הקישור יפסיק לעבוד.", danger: true, onConfirm: () => act({ action: "cancel" }, "בוטלה") })}>ביטול</Button>}
          </div>
          {x.signedAt && x.status.project === "not_started" && (
            <div className="mt-4 rounded-xl bg-secondary/60 p-3">
              <p className="text-sm font-medium">תחילת עבודה</p>
              <p className="mb-2 text-xs text-muted-foreground">{sub && !sub.startDate ? "קובע גם את מועד החיוב הראשון בהוראת הקבע (תחילת העבודה + החודשים הכלולים), ומודיע ללקוח." : "מסמן שהפרויקט התחיל."}</p>
              <div className="flex gap-2">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="max-w-44" />
                <Button size="sm" onClick={() => act({ action: "mark_project_started", date: startDate || undefined }, "נשמר")}>הפרויקט התחיל</Button>
              </div>
            </div>
          )}
        </Card>

        <Card title="הלקוח">
          <Info rows={[
            ["חברה", x.client.companyName], ["ח.פ", x.client.taxId], ["כתובת", x.client.address],
            ["חותם", [x.client.signerName, x.client.signerRole].filter(Boolean).join(", ")],
            ["אימייל", x.client.email && <span dir="ltr">{x.client.email}</span>], ["טלפון", x.client.phone && <span dir="ltr">{x.client.phone}</span>],
            ["הנהלת חשבונות", x.client.accountingEmail && <span dir="ltr">{x.client.accountingEmail}</span>],
          ]} />
        </Card>
      </div>

      <Card title={`לוח תשלומים${x.approvedAt ? " (כפי שאושר)" : " (מחושב מהיום)"}`}>
        <table className="w-full text-sm">
          <tbody>
            {o.schedule.rows.map((r) => (
              <tr key={r.n} className="border-b border-border/60">
                <td className="py-2">{r.kind === "deposit" ? `מקדמה ${o.price.depositPercent}%` : `תשלום ${r.n - 1}`}</td>
                <td className="py-2">{dmy(r.date)}{r.dateNote && <span className="block text-xs text-muted-foreground sm:ms-2 sm:inline">{r.dateNote}</span>}</td>
                <td className="hidden whitespace-nowrap py-2 tabular-nums sm:table-cell">{nis(r.before)}</td>
                <td className="whitespace-nowrap py-2 text-end font-medium tabular-nums">{nis(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {sub && (
        <Card title="הוראת קבע" actions={<Button size="sm" variant="outline" asChild><Link to={`/sales/billing/${sub.id}`}>ניהול</Link></Button>}>
          <Info rows={[
            ["סטטוס", subStatus(sub)[1]],
            ["כרטיס", sub.card ? `${sub.card.brand || ""} ${sub.card.suffix ? `****${sub.card.suffix}` : ""}` : "לא הוזן"],
            ["חיוב הבא", sub.nextChargeDate ? `${dmy(sub.nextChargeDate)} · ${nis(sub.nextAmount)}` : "ייקבע בתחילת העבודה"],
          ]} />
        </Card>
      )}

      <Card title="היסטוריה"><History events={data.events} mails={data.mails} /></Card>
      {confirm && <Confirm {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

export const subStatus = (s) => ({
  pending_card: ["amber", "ממתין לכרטיס"], active: ["green", "פעיל"], paused: ["gray", "מושהה"],
  failed: ["red", "חיוב נכשל"], canceled: ["gray", "בוטל"], ended: ["gray", "הסתיים"],
}[s.status] || ["gray", s.status]);
