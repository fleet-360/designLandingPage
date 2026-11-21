import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import ConfirmDialog from "@/components/ConfirmDialog";
import { api, dateTime, errorText, FIELD_ERRORS, isEmail, meetingTime, mobileIL, nis, taxIdIL } from "@/sales/lib";
import { Card, FieldRow, History, Info, LinkBox, LoadError, PageHeader, Pill, Spinner, run, useApi } from "./AdminUi.jsx";

export const discoveryStatus = (x) => {
  if (x.status === "canceled") return ["gray", "בוטל"];
  if (x.meetingStart) return ["green", "נקבעה פגישה"];
  if (x.paidAt) return ["blue", "שולם, ממתין לקביעת מועד"];
  if (x.viewedAt) return ["amber", "נצפה"];
  return ["gray", "נשלח"];
};

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
                    <td className="p-3 tabular-nums">{nis(x.price)}</td>
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
  const [f, setF] = useState({ clientName: "", companyName: "", email: "", phone: "", taxId: "", price: "", note: "", meetingMinutes: "", sendEmail: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const def = data?.settings?.discovery;
  const vat = data?.settings?.vatRate ?? 18;
  const price = Number(f.price || def?.defaultPrice || 0);

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!f.clientName.trim()) return setError("יש להזין את שם הלקוח");
    if (f.email && !isEmail(f.email)) return setError("כתובת האימייל לא תקינה");
    // optional here (the client fills them when paying), but Grow refuses invalid ones
    if (f.phone.trim() && !mobileIL(f.phone)) return setError(FIELD_ERRORS.phone);
    if (f.taxId.trim() && !taxIdIL(f.taxId)) return setError(FIELD_ERRORS.taxId);
    if (f.sendEmail && !f.email) return setError("כדי לשלוח מייל צריך אימייל של הלקוח");
    setBusy(true);
    try {
      const r = await api("sales/discovery", { method: "POST", body: { ...f, price: f.price || undefined, meetingMinutes: f.meetingMinutes || undefined } });
      navigate(`/sales/discovery/${r.item.id}`);
    } catch (err) { setBusy(false); setError(errorText(err)); }
  };

  return (
    <div className="max-w-2xl">
      <Link to="/sales/discovery" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />בקשות איפיון</Link>
      <PageHeader title="בקשת איפיון חדשה" subtitle="הלקוח יקבל קישור לעמוד הספרינט, ישלם ויקבע מועד ביומן" />
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
          <FieldRow label="אורך הפגישה (דקות)"><Input value={f.meetingMinutes} onChange={set("meetingMinutes")} inputMode="numeric" dir="ltr" placeholder={String(def?.meetingMinutes ?? 60)} /></FieldRow>
        </div>
        <FieldRow label="הערה אישית ללקוח" hint="מופיעה בראש העמוד. למשל: מה סיכמנו בשיחה"><Textarea value={f.note} onChange={set("note")} rows={3} /></FieldRow>
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
        <Card title="פרטים" actions={!x.paidAt && x.status !== "canceled" && <Button size="sm" variant="ghost" onClick={() => setEdit({ clientName: x.clientName, companyName: x.companyName || "", email: x.email || "", phone: x.phone || "", taxId: x.taxId || "", price: String(x.price), note: x.note || "" })}>עריכה</Button>}>
          {edit ? (
            <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await act({ action: "update", ...edit }, "נשמר"); setEdit(null); }}>
              {[["clientName", "שם"], ["companyName", "חברה"], ["email", "אימייל"], ["phone", "טלפון"], ["taxId", "ח.פ"], ["price", 'מחיר לפני מע"מ']].map(([k, l]) => (
                <FieldRow key={k} label={l}><Input value={edit[k]} onChange={(e) => setEdit((s) => ({ ...s, [k]: e.target.value }))} dir={["email", "phone", "taxId", "price"].includes(k) ? "ltr" : undefined} /></FieldRow>
              ))}
              <FieldRow label="הערה"><Textarea value={edit.note} onChange={(e) => setEdit((s) => ({ ...s, note: e.target.value }))} rows={3} /></FieldRow>
              <div className="flex gap-2"><Button type="submit" size="sm">שמירה</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEdit(null)}>ביטול</Button></div>
            </form>
          ) : (
            <Info rows={[
              ["אימייל", x.email && <span dir="ltr">{x.email}</span>],
              ["טלפון", x.phone && <span dir="ltr">{x.phone}</span>],
              ["ח.פ", x.taxId],
              ["מחיר", `${nis(x.price)} + מע"מ (${nis(x.total)})`],
              ["אורך פגישה", `${x.meetingMinutes} דקות`],
              ["הערה", x.note],
              ["נוצר", `${dateTime(x.createdAt)} · ${x.createdBy || ""}`],
              ["נצפה", x.viewedAt && dateTime(x.viewedAt)],
            ]} />
          )}
        </Card>

        <Card title="תשלום ופגישה">
          <Info rows={[
            ["תשלום", x.paidAt ? `שולם ${dateTime(x.paidAt)}${x.paidVia === "manual" ? " (סומן ידנית)" : ""}` : "לא שולם"],
            x.paymentRef && ["אסמכתא", <span dir="ltr">{x.paymentRef}</span>],
            ["פגישה", x.meetingStart ? meetingTime(x.meetingStart) : "לא נקבעה"],
            x.meetingStart && ["ביומן", x.bookingStatus === "confirmed" ? "נקבע ביומן developers@" : x.bookingStatus === "invited" ? "נשלח זימון במייל (היומן לא היה זמין)" : x.bookingStatus],
            x.attendees?.length > 0 && ["משתתפים", <span dir="ltr">{x.attendees.join(", ")}</span>],
            x.meetUrl && ["קישור", <a href={x.meetUrl} className="text-primary underline" target="_blank" rel="noreferrer" dir="ltr">{x.meetUrl}</a>],
            x.bookingError && ["שגיאת יומן", <span className="text-destructive">{x.bookingError}</span>],
          ]} />
          {x.status !== "canceled" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {!x.paidAt && <Button size="sm" variant="outline" onClick={() => setConfirm({ title: "לסמן כשולם?", description: "השתמשו בזה כשהתשלום התקבל מחוץ לעמוד (העברה, מזומן). הלקוח יוכל לקבוע מועד.", onConfirm: () => act({ action: "mark_paid" }, "סומן כשולם") })}>סימון כשולם</Button>}
              {!x.paidAt && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ title: "לבטל את הבקשה?", description: "הקישור יפסיק לעבוד.", danger: true, onConfirm: () => act({ action: "cancel" }, "בוטל") })}>ביטול הבקשה</Button>}
            </div>
          )}
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
