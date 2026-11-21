import React, { useEffect, useState } from "react";
import { CheckCircle2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, fileToDataUrl } from "@/sales/lib";
import { Card, FieldRow, LoadError, PageHeader, Spinner, run, useApi } from "./AdminUi.jsx";

const DAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

// deep set by path; keeps arrays as arrays ("hourlyRates.0.rate")
const setIn = (obj, path, v) => {
  const [k, ...rest] = path.split(".");
  const val = rest.length ? setIn(obj?.[k] || {}, rest.join("."), v) : v;
  return Array.isArray(obj) ? Object.assign([...obj], { [k]: val }) : { ...obj, [k]: val };
};

export default function SalesSettings() {
  const { data, error, reload } = useApi("sales/settings");
  const [s, setS] = useState(null);
  const [sigPreview, setSigPreview] = useState(null);
  const [cal, setCal] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data && !s) setS(data.settings); }, [data, s]);
  if (error) return <LoadError error={error} reload={reload} />;
  if (!s) return <Spinner />;

  const v = (path) => path.split(".").reduce((o, k) => o?.[k], s) ?? "";
  const bind = (path, num) => ({ value: v(path), onChange: (e) => setS((x) => setIn(x, path, num && e.target.value !== "" ? Number(e.target.value) : e.target.value)) });

  const save = async () => {
    setBusy(true);
    let clean = setIn(s, "service.includes", (s.service?.includes || []).map((y) => y.trim()).filter(Boolean));
    clean = setIn(clean, "hourlyRates", (s.hourlyRates || []).map((r) => ({ role: String(r.role || "").trim(), rate: Number(r.rate) })).filter((r) => r.role && r.rate > 0));
    const r = await run(() => api("sales/settings", { method: "PUT", body: { settings: clean } }), "ההגדרות נשמרו");
    if (r) setS(r.settings);
    setBusy(false);
  };
  const uploadSignature = async (file) => {
    if (!file) return;
    const url = await fileToDataUrl(file);
    const r = await run(() => api("sales/upload", { method: "POST", body: { name: "company-signature.png", data_url: url } }), "החתימה הועלתה. שמרו את ההגדרות.");
    if (r) { setS((x) => setIn(x, "signer.signatureFileId", r.fileId)); setSigPreview(url); }
  };
  const checkCalendar = async () => {
    setCal("checking");
    const r = await api("sales/settings?check=1").catch(() => null);
    setCal(r?.calendar || { connected: false, error: "no_response" });
  };

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="הגדרות מכירות" subtitle="הפרטים שמופיעים בהזמנות, בהסכמים ובמיילים ללקוחות">
        <Button onClick={save} disabled={busy}>{busy ? "שומר..." : "שמירה"}</Button>
      </PageHeader>

      <Card title="החברה">
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label="שם"><Input {...bind("company.name")} /></FieldRow>
          <FieldRow label="ח.פ"><Input {...bind("company.taxId")} dir="ltr" /></FieldRow>
          <FieldRow label="כתובת"><Input {...bind("company.address")} /></FieldRow>
          <FieldRow label="טלפון"><Input {...bind("company.phone")} dir="ltr" /></FieldRow>
          <FieldRow label="אימייל המשרד" hint="מקבל עותק של כל אירוע: תשלום, חתימה, פגישה"><Input {...bind("officeEmail")} dir="ltr" /></FieldRow>
          <FieldRow label="אתר"><Input {...bind("company.website")} dir="ltr" /></FieldRow>
        </div>
      </Card>

      <Card title="חותם מטעם החברה">
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label="שם"><Input {...bind("signer.name")} /></FieldRow>
          <FieldRow label="תפקיד"><Input {...bind("signer.role")} /></FieldRow>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary">
            <Upload className="h-4 w-4" />{s.signer?.signatureFileId ? "החלפת תמונת החתימה" : "העלאת תמונת חתימה (PNG שקוף)"}
            <input type="file" accept="image/png" className="hidden" onChange={(e) => uploadSignature(e.target.files?.[0])} />
          </label>
          {sigPreview ? <img src={sigPreview} alt="החתימה" className="h-12 rounded border border-border bg-white px-2" /> : s.signer?.signatureFileId && <span className="text-sm text-emerald-700">חתימה שמורה</span>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">החתימה מוטבעת בהסכם החתום שנשלח ללקוח.</p>
      </Card>

      <Card title="תשלומים">
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldRow label='מע"מ %'><Input {...bind("vatRate", true)} dir="ltr" /></FieldRow>
          <FieldRow label="מקדמה ברירת מחדל %"><Input {...bind("depositPercent", true)} dir="ltr" /></FieldRow>
          <FieldRow label="ימים לאיסוף שיקים"><Input {...bind("checks.pickupDays", true)} dir="ltr" /></FieldRow>
          <FieldRow label="שם המוטב"><Input {...bind("bank.beneficiary")} /></FieldRow>
          <FieldRow label="בנק"><Input {...bind("bank.bank")} /></FieldRow>
          <FieldRow label="סניף"><Input {...bind("bank.branch")} dir="ltr" /></FieldRow>
          <FieldRow label="מספר חשבון"><Input {...bind("bank.account")} dir="ltr" /></FieldRow>
          <FieldRow label="שיקים לפקודת"><Input {...bind("checks.payee")} /></FieldRow>
        </div>
        <p className="mt-3 text-sm font-medium">איש קשר להנהלת חשבונות (מופיע במייל ללקוח)</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Input {...bind("accountingContact.name")} placeholder="שם" />
          <Input {...bind("accountingContact.phone")} placeholder="טלפון" dir="ltr" />
          <Input {...bind("accountingContact.email")} placeholder="אימייל" dir="ltr" />
        </div>
      </Card>

      <Card title="איש קשר מטעמנו (נספח א' בכל עסקה)">
        <div className="grid gap-3 sm:grid-cols-4">
          <Input {...bind("companyContact.name")} placeholder="שם" />
          <Input {...bind("companyContact.role")} placeholder="תפקיד" />
          <Input {...bind("companyContact.phone")} placeholder="טלפון" dir="ltr" />
          <Input {...bind("companyContact.email")} placeholder="אימייל" dir="ltr" />
        </div>
      </Card>

      <Card title='תעריפי שעה (לפני מע"מ)'>
        <p className="mb-2 text-sm text-muted-foreground">ברירת המחדל לכל עסקה חדשה. איש המכירות יכול לשנות בעסקה.</p>
        <div className="space-y-2">
          {(s.hourlyRates || []).map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input {...bind(`hourlyRates.${i}.role`)} placeholder="תפקיד" className="w-40" />
              <Input {...bind(`hourlyRates.${i}.rate`)} placeholder="₪ לשעה" inputMode="decimal" dir="ltr" className="w-28" />
              <Button type="button" size="sm" variant="ghost" onClick={() => setS((x) => setIn(x, "hourlyRates", x.hourlyRates.filter((_, j) => j !== i)))}>הסרה</Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setS((x) => setIn(x, "hourlyRates", [...(x.hourlyRates || []), { role: "", rate: "" }]))}>הוספת תפקיד</Button>
        </div>
      </Card>

      <Card title="בקשת איפיון">
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label="כותרת"><Input {...bind("discovery.title")} /></FieldRow>
          <FieldRow label='מחיר ברירת מחדל (לפני מע"מ)'><Input {...bind("discovery.defaultPrice", true)} dir="ltr" /></FieldRow>
          <FieldRow label="מחיר לפני הנחה, ברירת מחדל" hint="מופיע מחוק ליד המחיר. ריק = בלי"><Input {...bind("discovery.defaultListPrice", true)} dir="ltr" /></FieldRow>
          <FieldRow label="אורך פגישה (דקות)"><Input {...bind("discovery.meetingMinutes", true)} dir="ltr" /></FieldRow>
          <FieldRow label="ראש צוות אחראי" hint="ברירת מחדל לבקשה חדשה; מופיע במייל הסיכום">
            <div className="flex gap-2"><Input {...bind("discovery.contacts.lead.name")} aria-label="שם" /><Input {...bind("discovery.contacts.lead.phone")} dir="ltr" aria-label="טלפון" className="w-36" /></div>
          </FieldRow>
          <FieldRow label="איש מכירות">
            <div className="flex gap-2"><Input {...bind("discovery.contacts.sales.name")} aria-label="שם" /><Input {...bind("discovery.contacts.sales.phone")} dir="ltr" aria-label="טלפון" className="w-36" /></div>
          </FieldRow>
          <FieldRow label="מנהלת משרד">
            <div className="flex gap-2"><Input {...bind("discovery.contacts.office.name")} aria-label="שם" placeholder="שם (לא חובה)" /><Input {...bind("discovery.contacts.office.phone")} dir="ltr" aria-label="טלפון" className="w-36" /></div>
          </FieldRow>
        </div>
      </Card>

      <Card title="יומן לקביעת פגישות" actions={<Button size="sm" variant="outline" onClick={checkCalendar} disabled={cal === "checking"}>{cal === "checking" ? "בודק..." : "בדיקת חיבור ליומן"}</Button>}>
        {cal && cal !== "checking" && (
          <p className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${cal.connected ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {cal.connected ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {cal.connected ? `היומן ${cal.user || ""} מחובר${cal.via === "google" ? " ישירות לגוגל" : cal.via === "toro" ? " דרך טורו" : ""}: המועדים מסוננים לפי היומן והפגישות נכנסות אליו עם זימון.` : `היומן לא מחובר (${cal.error}). הפגישות נקבעות לפי שעות הפעילות בלבד, והזימון נשלח במייל כקובץ יומן.`}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldRow label="יומן"><Input {...bind("calendar.user")} dir="ltr" /></FieldRow>
          <FieldRow label="משעה"><Input {...bind("calendar.from")} type="time" /></FieldRow>
          <FieldRow label="עד שעה"><Input {...bind("calendar.to")} type="time" /></FieldRow>
          <FieldRow label="ימים קדימה"><Input {...bind("calendar.daysAhead", true)} dir="ltr" /></FieldRow>
          <FieldRow label="התראה מינימלית (שעות)"><Input {...bind("calendar.minNoticeHours", true)} dir="ltr" /></FieldRow>
          <FieldRow label="כמה מועדים להציע"><Input {...bind("calendar.slotsToOffer", true)} dir="ltr" /></FieldRow>
          <FieldRow label="מרווח בין פגישות (דקות)"><Input {...bind("calendar.bufferMinutes", true)} dir="ltr" /></FieldRow>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const on = (s.calendar?.days || []).includes(i);
            return <button key={i} type="button" onClick={() => setS((x) => setIn(x, "calendar.days", on ? x.calendar.days.filter((y) => y !== i) : [...x.calendar.days, i].sort()))}
              className={`h-9 w-9 rounded-full text-sm ${on ? "bg-primary text-primary-foreground" : "bg-secondary"}`} aria-pressed={on}>{d}</button>;
          })}
        </div>
      </Card>

      <Card title="אפשרויות לשירות החודשי">
        <FieldRow label="שורה לכל רכיב" hint="בכל עסקה איש המכירות מסמן מתוך הרשימה מה כלול">
          <textarea value={(s.service?.includes || []).join("\n")} onChange={(e) => setS((x) => setIn(x, "service.includes", e.target.value.split("\n")))} rows={5}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
        </FieldRow>
      </Card>

      <div className="flex justify-end"><Button onClick={save} disabled={busy}>{busy ? "שומר..." : "שמירה"}</Button></div>
    </div>
  );
}
