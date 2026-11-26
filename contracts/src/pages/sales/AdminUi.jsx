import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { api, copyText, dateTime, errorText, isEmail, whatsappLink } from "@/sales/lib";
import { t } from "@/i18n";

// Loads an admin API path; reload() after an action
export function useApi(path) {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState(null);
  const reload = useCallback(() => {
    if (!path) return Promise.resolve();
    return api(path).then((v) => { setData(v); setError(null); return v; }).catch((e) => {
      if (e.code === "signed_out" || e.status === 401) window.location.href = `${import.meta.env.BASE_URL}login`;
      setError(e);
    });
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload, setData };
}

// Runs an action with a toast for success or failure; returns the response or null
export async function run(fn, ok) {
  try {
    const r = await fn();
    if (ok) toast({ title: ok });
    return r;
  } catch (e) {
    toast({ title: errorText(e), variant: "destructive" });
    return null;
  }
}

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
);

export const Spinner = () => <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

export const LoadError = ({ error, reload }) => (
  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
    <p>{errorText(error)}</p>
    <Button variant="outline" className="mt-3" onClick={reload}>{t("נסו שוב")}</Button>
  </div>
);

const TONES = {
  gray: "bg-secondary text-muted-foreground",
  blue: "bg-sky-100 text-sky-800",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};
export const Pill = ({ tone = "gray", children }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
);

export const Card = ({ title, actions, children, className = "" }) => (
  <section className={`rounded-2xl border border-border bg-card p-5 ${className}`}>
    {(title || actions) && (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {title && <h2 className="text-base font-semibold">{title}</h2>}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

export const Info = ({ rows }) => (
  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
    {rows.filter(Boolean).map(([k, v]) => (
      <React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v || "—"}</dd></React.Fragment>
    ))}
  </dl>
);

export function LinkBox({ url, phone, message }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="w-full min-w-0 truncate sm:w-auto sm:flex-1 rounded-lg bg-secondary px-3 py-2 text-xs" dir="ltr">{url}</code>
      <Button size="sm" variant="outline" onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}>
        {copied ? <Check className="ms-1 h-4 w-4" /> : <Copy className="ms-1 h-4 w-4" />}{copied ? t("הועתק") : t("העתקה")}
      </Button>
      {phone && <Button size="sm" variant="outline" asChild><a href={whatsappLink(phone, `${message}\n${url}`)} target="_blank" rel="noreferrer"><MessageCircle className="ms-1 h-4 w-4" />{t("וואטסאפ")}</a></Button>}
      <Button size="sm" variant="ghost" asChild><a href={url} target="_blank" rel="noreferrer">{t("פתיחה")}</a></Button>
    </div>
  );
}

const EVENT_LABELS = {
  created: t("נוצר"), updated: t("עודכן"), viewed: t("הלקוח פתח את הקישור"), visit: t("הלקוח נכנס שוב לקישור"), paid: t("שולם"), canceled: t("בוטל"), booked: t("נקבעה פגישה"),
  calendar_failed: t("היומן לא זמין, נשלח זימון במייל"), charged: t("חיוב הצליח"), ended: t("הסתיים"), email_sent: t("נשלח מייל"), approved: t("הלקוח אישר את הזמנת העבודה"), reopened: t("ההזמנה נפתחה לעריכה, האישור בוטל"),
  signed: t("ההסכם נחתם"), deposit_paid: t("המקדמה סומנה כשולמה"), project_started: t("הפרויקט התחיל"), delivered: t("המערכת נמסרה"),
  card_set: t("נשמר כרטיס"), card_page_opened: t("הלקוח פתח את דף הכרטיס"), card_page_failed: t("פתיחת דף הכרטיס נכשלה"),
  start_date_set: t("נקבע מועד החיוב הראשון"), charge_paid: t("חיוב הצליח"), charge_failed: t("חיוב נכשל"), pause: t("הושהה"), resume: t("חודש"),
  cancel: t("בוטל"), update: t("עודכן"), charge_now: t("חיוב יזום"), charge_requested: t("נשלחה בקשת חיוב"), invoice_failed: t("הפקת החשבונית נכשלה"),
  reminder_sent: t("נשלחה תזכורת"), underpaid: t("התקבל תשלום נמוך מהמחיר"), charge_settled: t("חיוב סומן ידנית"),
  held: t("הלקוח בחר מועד"), hold_lost: t("המועד שנבחר נתפס"), manual: t("פגישה או תשלום עודכנו ידנית"),
  signed_manual: t("סומן כנחתם מחוץ לקישור"), signed_file: t("קובץ החוזה החתום עודכן"), payment_note: t("אופן התשלום עודכן"),
};
// the device a visit came from, by its user agent
const device = (ua) => (!ua ? "" : /iPad|Tablet/i.test(ua) ? t("מטאבלט") : /Mobi|Android|iPhone/i.test(ua) ? t("מהטלפון") : t("מהמחשב"));
const MAIL_STATUS = { sent: ["green", t("נשלח")], queued: ["amber", t("בתור")], fetched: ["amber", t("בשליחה")], failed: ["red", t("נכשל")] };

export function History({ events = [], mails = [] }) {
  const items = [
    ...events.filter((e) => e.type !== "email_sent").map((e) => ({ at: e.at, text: [EVENT_LABELS[e.type] || e.type, e.type === "visit" && device(e.detail?.userAgent)].filter(Boolean).join(" "), detail: e.detail })),   // emails are listed from the outbox below
    ...mails.map((m) => ({ at: m.at, text: t("מייל: {subject}", { subject: m.subject }), sub: (m.to || []).join(", "), mail: m })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("אין עדיין פעילות.")}</p>;
  return (
    <ol className="space-y-2.5 text-sm">
      {items.map((x, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-28 shrink-0 text-xs text-muted-foreground tabular-nums">{dateTime(x.at)}</span>
          <div className="min-w-0">
            <span>{x.text}</span>
            {x.mail && <span className="ms-2"><Pill tone={MAIL_STATUS[x.mail.status]?.[0]}>{MAIL_STATUS[x.mail.status]?.[1] || x.mail.status}</Pill></span>}
            {x.sub && <div className="truncate text-xs text-muted-foreground" dir="ltr">{x.sub}</div>}
            {x.mail?.error && <div className="text-xs text-destructive">{x.mail.error}</div>}
            {x.detail?.error && <div className="text-xs text-destructive">{String(x.detail.error)}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export const FieldRow = ({ label, hint, children, className = "" }) => (
  <label className={`block space-y-1 ${className}`}>
    <span className="text-sm font-medium">{label}</span>
    {children}
    {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
  </label>
);

// Who else gets the email with the link: more addresses, and a copy to the sender. The site has one
// shared admin login, so "me" is the address this browser remembers.
// ponytail: per-browser address; read it from the session once each salesperson has their own login
const ME_KEY = "sales.myEmail";
const storedMe = () => { try { return localStorage.getItem(ME_KEY) || ""; } catch { return ""; } };
export const blankCopies = () => ({ extra: "", self: true, me: storedMe() });

// -> { cc } or { error }
export function copiesOf(c) {
  const extra = c.extra.split(/[\s,;]+/).filter(Boolean);
  const bad = extra.find((e) => !isEmail(e));
  if (bad) return { error: t("כתובת אימייל לא תקינה: {email}", { email: bad }) };
  if (!c.self) return { cc: extra };
  const me = c.me.trim();
  if (!isEmail(me)) return { error: t("כדי לשלוח עותק אליך צריך את האימייל שלך") };
  try { localStorage.setItem(ME_KEY, me); } catch { /* private window: asked again next time */ }
  return { cc: [...extra, me] };
}

// the "send by email" buttons: a copy to the sender when this browser knows the address
export const selfCc = () => (isEmail(storedMe()) ? [storedMe()] : []);

export function MailCopies({ c, onChange }) {
  const set = (k) => (v) => onChange({ ...c, [k]: v });
  return (
    <div className="space-y-2">
      <FieldRow label={t("מיילים נוספים")} hint={t("אפשר כמה, מופרדים בפסיק. יקבלו את אותו המייל")}>
        <Input value={c.extra} onChange={(e) => set("extra")(e.target.value)} dir="ltr" placeholder="name@company.com, ..." />
      </FieldRow>
      <label className="flex items-center gap-3 text-sm"><Switch checked={c.self} onCheckedChange={set("self")} />{t("שלח לעצמי")}</label>
      {c.self && <Input value={c.me} onChange={(e) => set("me")(e.target.value)} type="email" dir="ltr" placeholder={t("האימייל שלך, למשל sharon@pro-algo.com")} aria-label={t("האימייל שלך")} />}
    </div>
  );
}
