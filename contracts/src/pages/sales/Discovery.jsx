import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import ConfirmDialog from "@/components/ConfirmDialog";
import { api, dateTime, errorText, FIELD_ERRORS, isEmail, meetingTime, mobileIL, nis, taxIdIL } from "@/sales/lib";
import { Card, FieldRow, History, Info, LinkBox, LoadError, PageHeader, Pill, Spinner, run, useApi } from "./AdminUi.jsx";

export const discoveryStatus = (x) => {
  if (x.status === "canceled") return ["gray", "בוטל"];
  if (x.heldUntil && !x.paidAt) return new Date(x.heldUntil) > new Date() ? ["amber", "בחר מועד, ממתין לתשלום"] : ["amber", "בחר מועד ולא שילם"];
  // a meeting with no payment yet happens only when the payment is handled outside the page
  if (x.meetingStart && !x.heldUntil) return x.paidAt ? ["green", "נקבעה פגישה"] : ["amber", "נקבעה פגישה, טרם שולם"];
  if (x.paidAt) return x.showBooking ? ["blue", "שולם, ממתין לקביעת מועד"] : ["blue", "שולם, ממתין להזנת מועד"];
  if (x.viewedAt) return ["amber", "נצפה"];
  return ["gray", "נשלח"];
};

export const PAY_METHODS = [["transfer", "העברה בנקאית"], ["bit", "ביט / פייבוקס"], ["card", "כרטיס אשראי (מחוץ לעמוד)"], ["check", "שיק"], ["cash", "מזומן"], ["other", "אחר"]];
export const payMethodLabel = (k) => Object.fromEntries(PAY_METHODS)[k] || k;
const todayIL = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
// ISO -> ["YYYY-MM-DD", "HH:MM"] in Israel time
const israelParts = (iso) => (iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).slice(0, 16).split(" ") : ["", ""]);
const SELECT = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

// What the client's page offers (both by default). What is switched off is typed in here instead.
export const manualFrom = (x) => {
  const [meetingDate, meetingTime] = x?.manualMeeting ? israelParts(x.meetingStart) : ["", ""];
  return {
    showBooking: x ? x.showBooking : true, showPayment: x ? x.showPayment : true,
    meetingDate, meetingTime, meetingMinutes: x?.manualMeeting ? String(x.meetingMinutes) : "",
    paymentMethod: x?.paymentMethod || "transfer", paymentStatus: x?.paidAt ? "paid" : "pending",
    paidOn: x?.paidAt ? israelParts(x.paidAt)[0] : todayIL(), paymentNote: x?.paymentNote || "",
  };
};
export const manualError = (m) => {
  if (!m.showBooking && (!m.meetingDate || !m.meetingTime)) return "יש להזין תאריך ושעה לפגישה";
  if (!m.showPayment && !m.paymentMethod) return "יש לבחור אמצעי תשלום";
  return "";
};
export const manualBody = (m) => ({
  showBooking: m.showBooking, showPayment: m.showPayment,
  ...(!m.showBooking && { meetingStart: `${m.meetingDate}T${m.meetingTime}`, meetingMinutes: m.meetingMinutes || undefined }),
  ...(!m.showPayment && { paymentMethod: m.paymentMethod, paymentStatus: m.paymentStatus, paidOn: m.paymentStatus === "paid" ? m.paidOn : undefined }),
  paymentNote: m.paymentNote,
});

export function ManualFields({ m, onChange, minutesHint, locked = {} }) {
  const set = (k) => (e) => onChange({ ...m, [k]: e.target.value });
  const paid = m.paymentStatus === "paid";
  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl bg-secondary/60 p-3">
        <label className="flex items-center gap-3 text-sm font-medium">
          <Switch checked={m.showBooking} disabled={locked.booking} onCheckedChange={(v) => onChange({ ...m, showBooking: v })} />הלקוח קובע את הפגישה ביומן דרך הקישור
        </label>
        {locked.booking && <p className="text-xs text-muted-foreground">הפגישה נקבעה דרך הקישור ונמצאת ביומן, ולכן אי אפשר להעביר אותה להזנה ידנית.</p>}
        {!m.showBooking && (
          <div className="grid gap-3 sm:grid-cols-3">
            <FieldRow label="תאריך הפגישה *"><Input type="date" value={m.meetingDate} onChange={set("meetingDate")} /></FieldRow>
            <FieldRow label="שעה *" hint="שעון ישראל"><Input type="time" step={300} value={m.meetingTime} onChange={set("meetingTime")} dir="ltr" /></FieldRow>
            <FieldRow label="אורך (דקות)"><Input value={m.meetingMinutes} onChange={set("meetingMinutes")} inputMode="numeric" dir="ltr" placeholder={minutesHint} /></FieldRow>
            <p className="text-xs text-muted-foreground sm:col-span-3">לא נשלח זימון ליומן. המועד נשמר בבקשה, מוצג ללקוח בעמוד, ושאר הלקוחות לא יוכלו לקבוע בשעה הזו דרך הקישור.</p>
          </div>
        )}
      </div>
      <div className="space-y-3 rounded-xl bg-secondary/60 p-3">
        <label className="flex items-center gap-3 text-sm font-medium">
          <Switch checked={m.showPayment} disabled={locked.payment} onCheckedChange={(v) => onChange({ ...m, showPayment: v })} />הלקוח משלם בכרטיס אשראי דרך הקישור
        </label>
        {locked.payment && <p className="text-xs text-muted-foreground">התשלום התקבל דרך הקישור.</p>}
        {!m.showPayment && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldRow label="איך משלם *">
              <select value={m.paymentMethod} onChange={set("paymentMethod")} className={SELECT}>{PAY_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </FieldRow>
            <FieldRow label="מצב התשלום">
              <select value={m.paymentStatus} onChange={set("paymentStatus")} className={SELECT}><option value="pending">עוד לא שילם</option><option value="paid">שולם</option></select>
            </FieldRow>
            {paid && <FieldRow label="תאריך התשלום"><Input type="date" value={m.paidOn} max={todayIL()} onChange={set("paidOn")} /></FieldRow>}
            <FieldRow label="פרטים" className={paid ? "" : "sm:col-span-2"} hint={paid ? "למשל: אסמכתא, מי העביר" : "למשל: ישלם בהעברה עד ה-1 לחודש"}>
              <Input value={m.paymentNote} onChange={set("paymentNote")} />
            </FieldRow>
            <p className="text-xs text-muted-foreground sm:col-span-2">{paid ? "בשמירה נשלח למשרד מייל על התשלום. תשלום מחוץ לעמוד לא מפיק חשבונית אוטומטית." : "כשהתשלום יגיע, חוזרים לכאן ומסמנים \"שולם\"."}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// The key lines at the top of the client's page. Sales types what the client wants solved, Claude offers
// headlines and supporting lines (sales/pitch), and sales picks and edits them. Typing them by hand works too.
export const pitchFrom = (x) => ({ problem: x?.pitch?.problem || "", headline: x?.pitch?.headline || "", lines: x?.pitch?.lines || [], options: [] });
export const pitchBody = (p) => {
  const lines = p.lines.map((l) => l.trim()).filter(Boolean);
  return p.headline.trim() || lines.length ? { problem: p.problem.trim(), headline: p.headline.trim(), lines } : null;
};

export function PitchFields({ p, onChange }) {
  const { data: status } = useApi("sales/pitch");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const off = status && !status.configured;
  const write = async () => {
    if (p.problem.trim().length < 3) return setError("כתבו בכמה מילים מה הלקוח רוצה לפתור");
    setError("");
    setBusy(true);
    try {
      const r = await api("sales/pitch", { method: "POST", body: { problem: p.problem } });
      onChange({ ...p, options: r.headlines, headline: r.headlines[0] || "", lines: r.lines });
    } catch (err) { setError(errorText(err)); }
    setBusy(false);
  };
  const setLine = (i, v) => onChange({ ...p, lines: p.lines.map((l, j) => (j === i ? v : l)) });
  const shown = Boolean(p.headline) || p.lines.length > 0;
  return (
    <div className="space-y-3 rounded-xl bg-secondary/60 p-3">
      <FieldRow label="מה הלקוח רוצה לפתור" hint={off ? "כתיבה אוטומטית לא מוגדרת בשרת (ANTHROPIC_API_KEY). אפשר לכתוב את המשפטים ידנית." : "בכמה מילים. ממנו נכתבים משפטי הפתיחה בראש העמוד של הלקוח"}>
        <div className="flex gap-2">
          <Input value={p.problem} onChange={(e) => onChange({ ...p, problem: e.target.value })} maxLength={500}
            placeholder="למשל: להוציא כתבי כמויות של ברזל"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!off && !busy) write(); } }} />
          <Button type="button" variant={shown ? "outline" : "default"} onClick={write} disabled={busy || off} className="shrink-0">
            {shown ? <RefreshCw className={`ms-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} /> : <Sparkles className={`ms-1 h-4 w-4 ${busy ? "animate-pulse" : ""}`} />}
            {busy ? "כותב..." : shown ? "כתיבה מחדש" : "כתיבת משפטים"}
          </Button>
        </div>
      </FieldRow>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {p.options.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">בחרו כותרת</p>
          {p.options.map((o) => (
            <button key={o} type="button" onClick={() => onChange({ ...p, headline: o })}
              className={`block w-full rounded-lg border px-3 py-2 text-start text-sm transition-colors ${p.headline === o ? "border-primary bg-background font-medium" : "border-transparent bg-background/60 hover:border-border"}`}>
              {o}
            </button>
          ))}
        </div>
      )}
      {(shown || off) && (
        <div className="space-y-2">
          <FieldRow label="כותרת" hint="השורה הבולטת בראש העמוד"><Input value={p.headline} onChange={(e) => onChange({ ...p, headline: e.target.value })} maxLength={200} /></FieldRow>
          <p className="text-sm font-medium">משפטים מתחת לכותרת</p>
          {p.lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input value={l} onChange={(e) => setLine(i, e.target.value)} maxLength={240} aria-label={`משפט ${i + 1}`} />
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange({ ...p, lines: p.lines.filter((_, j) => j !== i) })} aria-label={`הסרת משפט ${i + 1}`}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {p.lines.length < 4 && <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...p, lines: [...p.lines, ""] })}><Plus className="ms-1 h-4 w-4" />משפט</Button>}
            {shown && <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange({ ...p, headline: "", lines: [], options: [] })}>בלי משפטים (פתיחה רגילה)</Button>}
          </div>
        </div>
      )}
    </div>
  );
}

export function DiscoveryList() {
  const { data, error, reload } = useApi("sales/discovery");
  const [q, setQ] = useState("");
  if (error) return <LoadError error={error} reload={reload} />;
  if (!data) return <Spinner />;
  const items = data.items.filter((x) => !q || `${x.clientName} ${x.companyName || ""} ${x.email || ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="בקשות איפיון" subtitle="קישור אישי ללקוח: עמוד הספרינט, תשלום וקביעת פגישה ביומן">
        <Button asChild><Link to="/sales/discovery/new"><Plus className="ms-1 h-4 w-4" />בקשה חדשה</Link></Button>
      </PageHeader>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, חברה או אימייל" className="mb-4 max-w-sm" />
      {items.length === 0 ? <p className="py-16 text-center text-muted-foreground">{data.items.length ? "לא נמצאו תוצאות" : "עדיין אין בקשות. צרו את הראשונה."}</p> : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">לקוח</th><th className="p-3 text-start font-medium">מחיר</th>
              <th className="p-3 text-start font-medium">סטטוס</th><th className="p-3 text-start font-medium">פגישה</th><th className="p-3 text-start font-medium">נוצר</th><th className="p-3"><span className="sr-only">פעולות</span></th>
            </tr></thead>
            <tbody>
              {items.map((x) => {
                const [tone, label] = discoveryStatus(x);
                return (
                  <tr key={x.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/50">
                    <td className="p-3"><Link to={`/sales/discovery/${x.id}`} className="font-medium hover:underline">{x.clientName}</Link>{x.companyName && <div className="text-xs text-muted-foreground">{x.companyName}</div>}</td>
                    <td className="p-3 tabular-nums">{x.listPrice && <s className="me-1.5 text-xs text-muted-foreground">{nis(x.listPrice)}</s>}{nis(x.price)}</td>
                    <td className="p-3"><Pill tone={tone}>{label}</Pill></td>
                    <td className="p-3 text-xs">{x.meetingStart ? meetingTime(x.meetingStart) : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground tabular-nums">{dateTime(x.createdAt)}</td>
                    <td className="p-3 text-end"><Button asChild variant="outline" size="sm"><Link to={`/sales/discovery/${x.id}`}>הצג</Link></Button></td>
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

export function DiscoveryNew() {
  const navigate = useNavigate();
  const { data } = useApi("sales/settings");
  const [f, setF] = useState({ clientName: "", companyName: "", email: "", phone: "", taxId: "", price: "", listPrice: null, note: "", meetingMinutes: "", sendEmail: true, contacts: null });
  const [manual, setManual] = useState(() => manualFrom(null));
  const [pitch, setPitch] = useState(() => pitchFrom(null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const def = data?.settings?.discovery;
  const vat = data?.settings?.vatRate ?? 18;
  const price = Number(f.price || def?.defaultPrice || 0);
  // filled with the default from the settings; emptied = sent without a price before discount
  const listPrice = f.listPrice ?? (def?.defaultListPrice ? String(def.defaultListPrice) : "");
  // the responsible people, filled from the settings
  const contacts = f.contacts ?? {
    salesName: def?.contacts?.sales?.name || "", salesPhone: def?.contacts?.sales?.phone || "",
    leadName: def?.contacts?.lead?.name || "", leadPhone: def?.contacts?.lead?.phone || "",
    officeName: def?.contacts?.office?.name || "", officePhone: def?.contacts?.office?.phone || "",
  };
  const setContact = (k) => (e) => setF((s) => ({ ...s, contacts: { ...contacts, [k]: e.target.value } }));

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!f.clientName.trim()) return setError("יש להזין את שם הלקוח");
    if (f.email && !isEmail(f.email)) return setError("כתובת האימייל לא תקינה");
    // optional here (the client fills them when paying), but Grow refuses invalid ones
    if (f.phone.trim() && !mobileIL(f.phone)) return setError(FIELD_ERRORS.phone);
    if (f.taxId.trim() && !taxIdIL(f.taxId)) return setError(FIELD_ERRORS.taxId);
    if (f.sendEmail && !f.email) return setError("כדי לשלוח מייל צריך אימייל של הלקוח");
    if (listPrice.trim() && !(Number(listPrice) > price)) return setError("המחיר לפני הנחה צריך להיות גבוה מהמחיר");
    if (manualError(manual)) return setError(manualError(manual));
    setBusy(true);
    try {
      const r = await api("sales/discovery", { method: "POST", body: { ...f, contacts: undefined, ...contacts, price: f.price || undefined, listPrice: listPrice.trim(), meetingMinutes: f.meetingMinutes || undefined, pitch: pitchBody(pitch), ...manualBody(manual) } });
      navigate(`/sales/discovery/${r.item.id}`);
    } catch (err) { setBusy(false); setError(errorText(err)); }
  };

  return (
    <div className="max-w-2xl">
      <Link to="/sales/discovery" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />בקשות איפיון</Link>
      <PageHeader title="בקשת איפיון חדשה" subtitle="הלקוח יקבל קישור לעמוד הספרינט. פגישה או תשלום שסוכמו מחוץ לקישור מזינים כאן" />
      <form onSubmit={save} className="space-y-5 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="שם הלקוח *"><Input value={f.clientName} onChange={set("clientName")} /></FieldRow>
          <FieldRow label="חברה"><Input value={f.companyName} onChange={set("companyName")} /></FieldRow>
          <FieldRow label="אימייל"><Input value={f.email} onChange={set("email")} type="email" dir="ltr" /></FieldRow>
          <FieldRow label="טלפון"><Input value={f.phone} onChange={set("phone")} type="tel" dir="ltr" /></FieldRow>
          <FieldRow label="ח.פ / ע.מ" hint="לחשבונית; הלקוח יכול לשנות בתשלום"><Input value={f.taxId} onChange={set("taxId")} dir="ltr" /></FieldRow>
          <FieldRow label='מחיר לפני מע"מ' hint={`${nis(Math.round(price * (1 + vat / 100) * 100) / 100)} כולל מע"מ`}>
            <Input value={f.price} onChange={set("price")} inputMode="decimal" dir="ltr" placeholder={String(def?.defaultPrice ?? "")} />
          </FieldRow>
          <FieldRow label="מחיר לפני הנחה" hint="יופיע מחוק ליד המחיר, במייל ובעמוד. ריק = בלי">
            <Input value={listPrice} onChange={set("listPrice")} inputMode="decimal" dir="ltr" />
          </FieldRow>
          <FieldRow label="אורך הפגישה (דקות)"><Input value={f.meetingMinutes} onChange={set("meetingMinutes")} inputMode="numeric" dir="ltr" placeholder={String(def?.meetingMinutes ?? 60)} /></FieldRow>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="ראש צוות אחראי" hint="מופיע במייל הסיכום אחרי קביעת הפגישה">
            <div className="flex gap-2"><Input value={contacts.leadName} onChange={setContact("leadName")} aria-label="שם ראש הצוות" /><Input value={contacts.leadPhone} onChange={setContact("leadPhone")} type="tel" dir="ltr" aria-label="טלפון ראש הצוות" className="w-36" /></div>
          </FieldRow>
          <FieldRow label="איש מכירות">
            <div className="flex gap-2"><Input value={contacts.salesName} onChange={setContact("salesName")} aria-label="שם איש המכירות" /><Input value={contacts.salesPhone} onChange={setContact("salesPhone")} type="tel" dir="ltr" aria-label="טלפון איש המכירות" className="w-36" /></div>
          </FieldRow>
          <FieldRow label="מנהלת משרד">
            <div className="flex gap-2"><Input value={contacts.officeName} onChange={setContact("officeName")} aria-label="שם מנהלת המשרד" placeholder="שם (לא חובה)" /><Input value={contacts.officePhone} onChange={setContact("officePhone")} type="tel" dir="ltr" aria-label="טלפון מנהלת המשרד" className="w-36" /></div>
          </FieldRow>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">משפטי מפתח בראש העמוד</p>
          <PitchFields p={pitch} onChange={setPitch} />
        </div>
        <FieldRow label="הערה אישית ללקוח" hint="מופיעה בראש העמוד. למשל: מה סיכמנו בשיחה"><Textarea value={f.note} onChange={set("note")} rows={3} /></FieldRow>
        <div className="space-y-2">
          <p className="text-sm font-medium">מה הלקוח עושה בקישור</p>
          <ManualFields m={manual} onChange={setManual} minutesHint={String(f.meetingMinutes || def?.meetingMinutes || 60)} />
        </div>
        <label className="flex items-center gap-3 text-sm"><Switch checked={f.sendEmail} onCheckedChange={(v) => setF((s) => ({ ...s, sendEmail: v }))} />לשלוח ללקוח מייל עם הקישור</label>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "יוצר..." : "יצירת קישור"}</Button>
      </form>
    </div>
  );
}

export function DiscoveryDetail() {
  const { id } = useParams();
  const { data, error, reload } = useApi(`sales/discovery?id=${id}`);
  const [confirm, setConfirm] = useState(null);
  const [edit, setEdit] = useState(null);
  const [manual, setManual] = useState(null);
  const [manualErr, setManualErr] = useState("");
  if (error) return <LoadError error={error} reload={reload} />;
  if (!data) return <Spinner />;
  const x = data.item;
  const [tone, label] = discoveryStatus(x);
  const act = (body, ok) => run(() => api(`sales/discovery?id=${id}`, { method: "PATCH", body }), ok).then(reload);

  return (
    <div className="max-w-4xl space-y-5">
      <Link to="/sales/discovery" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />בקשות איפיון</Link>
      <PageHeader title={x.clientName} subtitle={x.companyName}>
        <Pill tone={tone}>{label}</Pill>
      </PageHeader>

      <Card title="הקישור ללקוח" actions={x.status !== "canceled" && x.email && <Button size="sm" variant="outline" onClick={() => act({ action: "send_email" }, "המייל נשלח לתור")}>שליחה במייל</Button>}>
        <LinkBox url={x.url} phone={x.phone} message={`היי ${x.clientName}, זה הקישור לספרינט התכנון והמיפוי. אפשר לשלם ולקבוע מועד ישירות מהעמוד:`} />
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="פרטים" actions={!x.paidAt && x.status !== "canceled" && <Button size="sm" variant="ghost" onClick={() => setEdit({ clientName: x.clientName, companyName: x.companyName || "", email: x.email || "", phone: x.phone || "", taxId: x.taxId || "", price: String(x.price), listPrice: x.listPrice ? String(x.listPrice) : "", leadName: x.contacts?.lead?.name || "", leadPhone: x.contacts?.lead?.phone || "", salesName: x.contacts?.sales?.name || "", salesPhone: x.contacts?.sales?.phone || "", officeName: x.contacts?.office?.name || "", officePhone: x.contacts?.office?.phone || "", note: x.note || "", pitch: pitchFrom(x) })}>עריכה</Button>}>
          {edit ? (
            <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await act({ action: "update", ...edit, pitch: pitchBody(edit.pitch) }, "נשמר"); setEdit(null); }}>
              {[["clientName", "שם"], ["companyName", "חברה"], ["email", "אימייל"], ["phone", "טלפון"], ["taxId", "ח.פ"], ["price", 'מחיר לפני מע"מ'], ["listPrice", "מחיר לפני הנחה (ריק = בלי)"], ["leadName", "ראש צוות אחראי"], ["leadPhone", "טלפון ראש הצוות"], ["salesName", "איש מכירות"], ["salesPhone", "טלפון איש המכירות"], ["officeName", "מנהלת משרד"], ["officePhone", "טלפון מנהלת המשרד"]].map(([k, l]) => (
                <FieldRow key={k} label={l}><Input value={edit[k]} onChange={(e) => setEdit((s) => ({ ...s, [k]: e.target.value }))} dir={["email", "phone", "taxId", "price", "listPrice", "leadPhone", "salesPhone", "officePhone"].includes(k) ? "ltr" : undefined} /></FieldRow>
              ))}
              <div className="space-y-2"><p className="text-sm font-medium">משפטי מפתח בראש העמוד</p><PitchFields p={edit.pitch} onChange={(v) => setEdit((s) => ({ ...s, pitch: v }))} /></div>
              <FieldRow label="הערה"><Textarea value={edit.note} onChange={(e) => setEdit((s) => ({ ...s, note: e.target.value }))} rows={3} /></FieldRow>
              <div className="flex gap-2"><Button type="submit" size="sm">שמירה</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEdit(null)}>ביטול</Button></div>
            </form>
          ) : (
            <Info rows={[
              ["אימייל", x.email && <span dir="ltr">{x.email}</span>],
              ["טלפון", x.phone && <span dir="ltr">{x.phone}</span>],
              ["ח.פ", x.taxId],
              ["מחיר", `${nis(x.price)} + מע"מ (${nis(x.total)})`],
              x.listPrice && ["לפני הנחה", <s className="text-muted-foreground">{nis(x.listPrice)}</s>],
              ["אורך פגישה", `${x.meetingMinutes} דקות`],
              ["ראש צוות", x.contacts?.lead?.name && `${x.contacts.lead.name}${x.contacts.lead.phone ? ` · ${x.contacts.lead.phone}` : ""}`],
              ["איש מכירות", x.contacts?.sales?.name && `${x.contacts.sales.name}${x.contacts.sales.phone ? ` · ${x.contacts.sales.phone}` : ""}`],
              ["מנהלת משרד", (x.contacts?.office?.name || x.contacts?.office?.phone) && [x.contacts.office.name, x.contacts.office.phone].filter(Boolean).join(" · ")],
              x.pitch && ["כותרת בעמוד", x.pitch.headline],
              x.pitch?.lines?.length > 0 && ["משפטים", <ul className="list-disc space-y-0.5 ps-4">{x.pitch.lines.map((l) => <li key={l}>{l}</li>)}</ul>],
              ["הערה", x.note],
              ["נוצר", `${dateTime(x.createdAt)} · ${x.createdBy || ""}`],
              ["נצפה", x.viewedAt && dateTime(x.viewedAt)],
            ]} />
          )}
        </Card>

        <Card title="תשלום ופגישה" actions={x.status !== "canceled" && !manual && <Button size="sm" variant="ghost" onClick={() => { setManualErr(""); setManual(manualFrom(x)); }}>עדכון ידני</Button>}>
          {manual ? (
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault();
              if (manualError(manual)) return setManualErr(manualError(manual));
              const r = await run(() => api(`sales/discovery?id=${id}`, { method: "PATCH", body: { action: "manual", ...manualBody(manual) } }), "נשמר");
              if (r) { setManual(null); reload(); }
            }}>
              <ManualFields m={manual} onChange={setManual} minutesHint={String(x.meetingMinutes)}
                locked={{ booking: Boolean(x.meetingStart && !x.manualMeeting && !x.heldUntil), payment: x.paidVia === "grow" }} />
              {manualErr && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{manualErr}</p>}
              <div className="flex gap-2"><Button type="submit" size="sm">שמירה</Button><Button type="button" size="sm" variant="ghost" onClick={() => setManual(null)}>ביטול</Button></div>
            </form>
          ) : (<>
          <Info rows={[
            ["תשלום", x.paidAt ? `שולם ${dateTime(x.paidAt)}${x.paidVia === "manual" ? ` (${x.paymentMethod ? payMethodLabel(x.paymentMethod) : "סומן ידנית"})` : ""}`
              : !x.showPayment ? `טרם שולם · ${payMethodLabel(x.paymentMethod)}` : "לא שולם"],
            x.paymentNote && ["פרטי תשלום", x.paymentNote],
            x.paymentRef && ["אסמכתא", <span dir="ltr">{x.paymentRef}</span>],
            ["פגישה", x.meetingStart ? `${meetingTime(x.meetingStart)}${x.heldUntil ? " (נבחר, ממתין לתשלום)" : ""}` : x.showBooking ? "לא נקבעה" : "לא הוזן מועד"],
            x.meetingStart && !x.heldUntil && ["ביומן", x.bookingStatus === "manual" ? "הוזן ידנית, בלי זימון" : x.bookingStatus === "confirmed" ? "נקבע ביומן developers@" : x.bookingStatus === "invited" ? "נשלח זימון במייל (היומן לא היה זמין)" : x.bookingStatus],
            x.attendees?.length > 0 && ["משתתפים", <span dir="ltr">{x.attendees.join(", ")}</span>],
            x.meetUrl && ["קישור", <a href={x.meetUrl} className="text-primary underline" target="_blank" rel="noreferrer" dir="ltr">{x.meetUrl}</a>],
            x.bookingError && ["שגיאת יומן", <span className="text-destructive">{x.bookingError}</span>],
          ]} />
          {x.status !== "canceled" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {!x.paidAt && x.showPayment && <Button size="sm" variant="outline" onClick={() => setConfirm({ title: "לסמן כשולם?", description: x.heldUntil ? `השתמשו בזה כשהתשלום התקבל מחוץ לעמוד (העברה, מזומן). המועד שהלקוח בחר (${meetingTime(x.meetingStart)}) ייקבע ביומן והזימון יישלח.` : "השתמשו בזה כשהתשלום התקבל מחוץ לעמוד (העברה, מזומן). הלקוח יוכל לקבוע מועד.", onConfirm: () => act({ action: "mark_paid" }, "סומן כשולם") })}>סימון כשולם</Button>}
              {!x.paidAt && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ title: "לבטל את הבקשה?", description: "הקישור יפסיק לעבוד.", danger: true, onConfirm: () => act({ action: "cancel" }, "בוטל") })}>ביטול הבקשה</Button>}
            </div>
          )}
          </>)}
        </Card>
      </div>

      <Card title="היסטוריה"><History events={data.events} mails={data.mails} /></Card>
      {confirm && <Confirm {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

// ConfirmDialog from the contracts app
export function Confirm({ title, description, onConfirm, onClose, danger }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={title}
      description={description}
      actions={[
        { label: "ביטול", variant: "outline", onClick: onClose },
        { label: busy ? "רגע..." : "אישור", variant: danger ? "destructive" : "default", onClick: async () => { if (busy) return; setBusy(true); await onConfirm(); onClose(); } },
      ]}
    />
  );
}
