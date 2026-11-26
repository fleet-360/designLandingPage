import React, { useEffect, useState } from "react";
import { CheckCircle2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, fileToDataUrl } from "@/sales/lib";
import { t } from "@/i18n";
import { Card, FieldRow, LoadError, PageHeader, Spinner, run, useApi } from "./AdminUi.jsx";

const DAYS = [t("א'"), t("ב'"), t("ג'"), t("ד'"), t("ה'"), t("ו'"), t("ש'")];

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
    clean = setIn(clean, "calendar.invitees", (s.calendar?.invitees || []).map((y) => y.trim().toLowerCase()).filter(Boolean));
    clean = setIn(clean, "calendar.availability", (s.calendar?.availability || []).map((y) => y.trim().toLowerCase()).filter(Boolean));
    clean = setIn(clean, "hourlyRates", (s.hourlyRates || []).map((r) => ({ role: String(r.role || "").trim(), rate: Number(r.rate) })).filter((r) => r.role && r.rate > 0));
    const r = await run(() => api("sales/settings", { method: "PUT", body: { settings: clean } }), t("ההגדרות נשמרו"));
    if (r) setS(r.settings);
    setBusy(false);
  };
  const uploadSignature = async (file) => {
    if (!file) return;
    const url = await fileToDataUrl(file);
    const r = await run(() => api("sales/upload", { method: "POST", body: { name: "company-signature.png", data_url: url } }), t("החתימה הועלתה. שמרו את ההגדרות."));
    if (r) { setS((x) => setIn(x, "signer.signatureFileId", r.fileId)); setSigPreview(url); }
  };
  const checkCalendar = async () => {
    setCal("checking");
    const r = await api("sales/settings?check=1").catch(() => null);
    setCal(r?.calendar || { connected: false, error: "no_response" });
  };

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title={t("הגדרות מכירות")} subtitle={t("הפרטים שמופיעים בהזמנות, בהסכמים ובמיילים ללקוחות")}>
        <Button onClick={save} disabled={busy}>{busy ? t("שומר...") : t("שמירה")}</Button>
      </PageHeader>

      <Card title={t("החברה")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label={t("שם")}><Input {...bind("company.name")} /></FieldRow>
          <FieldRow label={t("ח.פ")}><Input {...bind("company.taxId")} dir="ltr" /></FieldRow>
          <FieldRow label={t("כתובת")}><Input {...bind("company.address")} /></FieldRow>
          <FieldRow label={t("טלפון")}><Input {...bind("company.phone")} dir="ltr" /></FieldRow>
          <FieldRow label={t("אימייל המשרד")} hint={t("מקבל עותק של כל אירוע: תשלום, חתימה, פגישה")}><Input {...bind("officeEmail")} dir="ltr" /></FieldRow>
          <FieldRow label={t("אתר")}><Input {...bind("company.website")} dir="ltr" /></FieldRow>
        </div>
      </Card>

      <Card title={t("חותם מטעם החברה")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label={t("שם")}><Input {...bind("signer.name")} /></FieldRow>
          <FieldRow label={t("תפקיד")}><Input {...bind("signer.role")} /></FieldRow>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary">
            <Upload className="h-4 w-4" />{s.signer?.signatureFileId ? t("החלפת תמונת החתימה") : t("העלאת תמונת חתימה (PNG שקוף)")}
            <input type="file" accept="image/png" className="hidden" onChange={(e) => uploadSignature(e.target.files?.[0])} />
          </label>
          {sigPreview ? <img src={sigPreview} alt={t("החתימה")} className="h-12 rounded border border-border bg-white px-2" /> : s.signer?.signatureFileId && <span className="text-sm text-emerald-700">{t("חתימה שמורה")}</span>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("החתימה מוטבעת בהסכם החתום שנשלח ללקוח.")}</p>
      </Card>

      <Card title={t("תשלומים")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldRow label={t('מע"מ %')}><Input {...bind("vatRate", true)} dir="ltr" /></FieldRow>
          <FieldRow label={t("מקדמה ברירת מחדל %")}><Input {...bind("depositPercent", true)} dir="ltr" /></FieldRow>
          <FieldRow label={t("ימים לאיסוף שיקים")}><Input {...bind("checks.pickupDays", true)} dir="ltr" /></FieldRow>
          <FieldRow label={t("שם המוטב")}><Input {...bind("bank.beneficiary")} /></FieldRow>
          <FieldRow label={t("בנק")}><Input {...bind("bank.bank")} /></FieldRow>
          <FieldRow label={t("סניף")}><Input {...bind("bank.branch")} dir="ltr" /></FieldRow>
          <FieldRow label={t("מספר חשבון")}><Input {...bind("bank.account")} dir="ltr" /></FieldRow>
          <FieldRow label={t("שיקים לפקודת")}><Input {...bind("checks.payee")} /></FieldRow>
        </div>
        <p className="mt-3 text-sm font-medium">{t("איש קשר להנהלת חשבונות (מופיע במייל ללקוח)")}</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Input {...bind("accountingContact.name")} placeholder={t("שם")} />
          <Input {...bind("accountingContact.phone")} placeholder={t("טלפון")} dir="ltr" />
          <Input {...bind("accountingContact.email")} placeholder={t("אימייל")} dir="ltr" />
        </div>
      </Card>

      <Card title={t("איש קשר מטעמנו (בפרטי ההזמנה בכל עסקה)")}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Input {...bind("companyContact.name")} placeholder={t("שם")} />
          <Input {...bind("companyContact.role")} placeholder={t("תפקיד")} />
          <Input {...bind("companyContact.phone")} placeholder={t("טלפון")} dir="ltr" />
          <Input {...bind("companyContact.email")} placeholder={t("אימייל")} dir="ltr" />
        </div>
      </Card>

      <Card title={t('תעריפי שעה (לפני מע"מ)')}>
        <p className="mb-2 text-sm text-muted-foreground">{t("ברירת המחדל לכל עסקה חדשה. איש המכירות יכול לשנות בעסקה.")}</p>
        <div className="space-y-2">
          {(s.hourlyRates || []).map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input {...bind(`hourlyRates.${i}.role`)} placeholder={t("תפקיד")} className="w-40" />
              <Input {...bind(`hourlyRates.${i}.rate`)} placeholder={t("₪ לשעה")} inputMode="decimal" dir="ltr" className="w-28" />
              <Button type="button" size="sm" variant="ghost" onClick={() => setS((x) => setIn(x, "hourlyRates", x.hourlyRates.filter((_, j) => j !== i)))}>{t("הסרה")}</Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setS((x) => setIn(x, "hourlyRates", [...(x.hourlyRates || []), { role: "", rate: "" }]))}>{t("הוספת תפקיד")}</Button>
        </div>
      </Card>

      <Card title={t("בקשת איפיון")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label={t("כותרת")}><Input {...bind("discovery.title")} /></FieldRow>
          <FieldRow label={t('מחיר ברירת מחדל (לפני מע"מ)')}><Input {...bind("discovery.defaultPrice", true)} dir="ltr" /></FieldRow>
          <FieldRow label={t("מחיר לפני הנחה, ברירת מחדל")} hint={t("מופיע מחוק ליד המחיר. ריק = בלי")}><Input {...bind("discovery.defaultListPrice", true)} dir="ltr" /></FieldRow>
          <FieldRow label={t("אורך פגישה (דקות)")}><Input {...bind("discovery.meetingMinutes", true)} dir="ltr" /></FieldRow>
          <FieldRow label={t("ראש צוות אחראי")} hint={t("ברירת מחדל לבקשה חדשה; מופיע במייל הסיכום")}>
            <div className="flex gap-2"><Input {...bind("discovery.contacts.lead.name")} aria-label={t("שם")} /><Input {...bind("discovery.contacts.lead.phone")} dir="ltr" aria-label={t("טלפון")} className="w-36" /></div>
          </FieldRow>
          <FieldRow label={t("איש מכירות")}>
            <div className="flex gap-2"><Input {...bind("discovery.contacts.sales.name")} aria-label={t("שם")} /><Input {...bind("discovery.contacts.sales.phone")} dir="ltr" aria-label={t("טלפון")} className="w-36" /></div>
          </FieldRow>
          <FieldRow label={t("מנהלת משרד")}>
            <div className="flex gap-2"><Input {...bind("discovery.contacts.office.name")} aria-label={t("שם")} placeholder={t("שם (לא חובה)")} /><Input {...bind("discovery.contacts.office.phone")} dir="ltr" aria-label={t("טלפון")} className="w-36" /></div>
          </FieldRow>
        </div>
      </Card>

      <Card title={t("יומן לקביעת פגישות")} actions={<Button size="sm" variant="outline" onClick={checkCalendar} disabled={cal === "checking"}>{cal === "checking" ? t("בודק...") : t("בדיקת חיבור ליומן")}</Button>}>
        {cal && cal !== "checking" && (
          <p className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${cal.connected ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {cal.connected ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {cal.connected ? t("היומן מחובר{via}: המועדים מסוננים לפי {list}, והפגישות נכנסות ל-{user} עם זימון.", { via: cal.via === "google" ? ` ${t("ישירות לגוגל")}` : cal.via === "toro" ? ` ${t("דרך טורו")}` : "", list: (cal.availability || [cal.user]).join(", "), user: cal.user || "" }) : t("היומן לא מחובר ({error}). הפגישות נקבעות לפי שעות הפעילות בלבד, והזימון נשלח במייל כקובץ יומן.", { error: cal.error })}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldRow label={t("יומן שקובע את הפגישות")}><Input {...bind("calendar.user")} dir="ltr" /></FieldRow>
          <FieldRow label={t("משעה")}><Input {...bind("calendar.from")} type="time" /></FieldRow>
          <FieldRow label={t("עד שעה")}><Input {...bind("calendar.to")} type="time" /></FieldRow>
          <FieldRow label={t("ימים קדימה")}><Input {...bind("calendar.daysAhead", true)} dir="ltr" /></FieldRow>
          <FieldRow label={t("התראה מינימלית (שעות)")}><Input {...bind("calendar.minNoticeHours", true)} dir="ltr" /></FieldRow>
          <FieldRow label={t("כמה מועדים להציע")}><Input {...bind("calendar.slotsToOffer", true)} dir="ltr" /></FieldRow>
          <FieldRow label={t("מרווח בין פגישות (דקות)")}><Input {...bind("calendar.bufferMinutes", true)} dir="ltr" /></FieldRow>
        </div>
        <div className="mt-3">
          <FieldRow label={t("בדיקת זמינות מול")} hint={t("כתובת בכל שורה. מועד שתפוס באחד היומנים האלה לא יוצע ללקוח. ריק = היומן שקובע את הפגישות")}>
            <textarea value={(s.calendar?.availability || []).join("\n")} onChange={(e) => setS((x) => setIn(x, "calendar.availability", e.target.value.split("\n")))} rows={2} dir="ltr"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
          </FieldRow>
        </div>
        <div className="mt-3">
          <FieldRow label={t("מוזמנים מטעמנו")} hint={t("כתובת בכל שורה. מקבלים זימון לכל פגישת איפיון, יחד עם הלקוח, המשתתפים שהוסיף והיומן עצמו")}>
            <textarea value={(s.calendar?.invitees || []).join("\n")} onChange={(e) => setS((x) => setIn(x, "calendar.invitees", e.target.value.split("\n")))} rows={3} dir="ltr"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
          </FieldRow>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const on = (s.calendar?.days || []).includes(i);
            return <button key={i} type="button" onClick={() => setS((x) => setIn(x, "calendar.days", on ? x.calendar.days.filter((y) => y !== i) : [...x.calendar.days, i].sort()))}
              className={`h-9 w-9 rounded-full text-sm ${on ? "bg-primary text-primary-foreground" : "bg-secondary"}`} aria-pressed={on}>{d}</button>;
          })}
        </div>
      </Card>

      <Card title={t("אפשרויות לשירות החודשי")}>
        <FieldRow label={t("שורה לכל רכיב")} hint={t("בכל עסקה איש המכירות מסמן מתוך הרשימה מה כלול")}>
          <textarea value={(s.service?.includes || []).join("\n")} onChange={(e) => setS((x) => setIn(x, "service.includes", e.target.value.split("\n")))} rows={5}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
        </FieldRow>
      </Card>

      <div className="flex justify-end"><Button onClick={save} disabled={busy}>{busy ? t("שומר...") : t("שמירה")}</Button></div>
    </div>
  );
}
