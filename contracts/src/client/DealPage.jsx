import React, { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, ChevronDown, Download, FileText, PenLine, Rocket, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import SignaturePad from "@/components/sign/SignaturePad";
import { api, dmy, dateTime, errorText, fileToDataUrl, isEmail, nis } from "@/sales/lib";
import { Container, ErrorLine, Field, Loading, Notice, PriceCard, ScheduleTable, Section, ServiceTimeline, Shell, Stepper } from "./ui.jsx";
import CardSetup from "./CardSetup.jsx";

export default function DealPage({ token }) {
  const [d, setD] = useState(undefined);
  const [skipCard, setSkipCard] = useState(false);
  const url = `sales/deal-public?token=${encodeURIComponent(token)}`;
  const load = useCallback(() => api(url).then((v) => { setD(v); return v; }), [url]);
  useEffect(() => { load().catch(() => setD(null)); }, [load]);
  useEffect(() => { window.scrollTo(0, 0); }, [d?.status?.order, d?.status?.agreement, skipCard]);

  if (d === undefined) return <Shell><Loading /></Shell>;
  if (d === null) return <Shell><Notice title="הקישור אינו פעיל" text="ייתכן שההזמנה בוטלה או שהקישור הועתק חלקית. נשמח לשלוח קישור חדש." /></Shell>;

  const so = d.order.standingOrder;
  const needsCard = Boolean(so?.enabled);
  const steps = [
    { label: "הזמנת העבודה", done: Boolean(d.approvedAt) },
    { label: "חתימה", done: Boolean(d.signedAt) },
    ...(needsCard ? [{ label: "הוראת קבע", done: Boolean(d.subscription?.card) }] : []),
  ];
  const current = !d.approvedAt ? 0 : !d.signedAt ? 1 : needsCard && d.subscription && !d.subscription.card && d.subscription.status !== "canceled" && !skipCard ? 2 : 3;
  const post = async (body) => { const v = await api(url, { method: "POST", body }); setD(v); return v; };

  return (
    <Shell company={d.company} wide={current === 1}>
      <div className="border-b border-border/70 bg-white/70 pa-noprint">
        <Container wide={current === 1} className="py-3"><Stepper steps={steps} current={current} /></Container>
      </div>
      {current === 0 && <OrderStep d={d} post={post} />}
      {current === 1 && <AgreementStep d={d} post={post} />}
      {current === 2 && (
        <Container className="py-8">
          <SignedBanner d={d} />
          <Section title="הוראת קבע לשירות החודשי" className="mt-5">
            <CardSetup
              firstCharge={d.subscription.firstCharge}
              startKnown={d.subscription.startKnown}
              includes={d.order.service.includes}
              open={() => api(url, { method: "POST", body: { action: "card" } })}
              check={async () => Boolean((await load()).subscription?.card)}
              onSkip={() => setSkipCard(true)}
            />
          </Section>
        </Container>
      )}
      {current === 3 && <Done d={d} />}
    </Shell>
  );
}

function OrderStep({ d, post }) {
  const o = d.order;
  const [c, setC] = useState({ ...d.client });
  const [approver, setApprover] = useState(d.client.signerName || "");
  const [accept, setAccept] = useState(false);
  const [edit, setEdit] = useState(!d.client.accountingEmail || !d.client.taxId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setC((s) => ({ ...s, [k]: e.target.value }));

  const approve = async () => {
    setError("");
    if (!c.companyName.trim() && !c.signerName.trim()) { setEdit(true); return setError("יש להזין שם חברה או שם מלא"); }
    if (!isEmail(c.accountingEmail)) { setEdit(true); return setError("יש להזין אימייל של הנהלת החשבונות, לשם יישלחו החשבוניות"); }
    if (approver.trim().length < 2) return setError("יש להזין את שם המאשר/ת");
    if (!accept) return setError("יש לסמן את תיבת האישור");
    setBusy(true);
    try { await post({ action: "approve", client: c, approverName: approver.trim(), accept: true }); } catch (e) { setBusy(false); setError(errorText(e)); }
  };

  return (
    <>
      <header className="pa-hero">
        <Container className="py-10 sm:py-14">
          <p className="text-sm font-medium text-white/80">הזמנת עבודה מס' <span className="pa-num">{o.number}</span> · {o.client.companyName || o.client.signerName}</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">{o.project.name}</h1>
          {o.project.summary && <p className="mt-3 max-w-2xl whitespace-pre-line text-[17px] leading-relaxed text-white/90">{o.project.summary}</p>}
        </Container>
      </header>
      <Container className="space-y-5 py-6 pb-16">
        <PriceCard price={o.price} />

        <Section title="מה בונים">
          <ul className="space-y-3">
            {o.project.specName && (
              <li className="flex gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">לפי האפיון המאושר: {o.project.specName}</p>
                  <p className="text-sm text-muted-foreground">{[o.project.specVersion && `גרסה ${o.project.specVersion}`, o.project.specDate && `מיום ${dmy(o.project.specDate)}`].filter(Boolean).join(" · ")}
                    {d.links.spec && <> · <a href={d.links.spec} target="_blank" rel="noreferrer" className="text-primary underline">לצפייה באפיון</a></>}</p>
                </div>
              </li>
            )}
            <li className="flex gap-3"><Rocket className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold">{o.project.targetWeeks ? `יעד פיתוח משוער: ${o.project.targetWeeks} שבועות` : "מתחילים מיד עם קבלת המקדמה"}</p>
                <p className="text-sm text-muted-foreground">העבודה מתחילה עם קבלת המקדמה והחומרים שסוכמו. המערכת נמסרת לשימוש שוטף אחרי בדיקות הקבלה.</p>
              </div>
            </li>
            {o.project.kickoffNeeds && (
              <li className="flex gap-3"><Wrench className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div><p className="font-semibold">מה נצטרך מכם לפתיחה</p><p className="whitespace-pre-line text-sm text-muted-foreground">{o.project.kickoffNeeds}</p></div>
              </li>
            )}
          </ul>
        </Section>

        <Section title="לוח התשלומים">
          <p className="mb-3 text-sm text-muted-foreground">
            מקדמה של {o.price.depositPercent}% בתוך 3 ימי עסקים מהאישור, והיתרה בתאריכים קבועים שאינם תלויים באבני דרך.
            {" "}אמצעי תשלום היתרה: {o.balanceMethod === "checks" ? "שיקים דחויים" : "העברה בנקאית"}.
          </p>
          <ScheduleTable schedule={o.schedule} depositPercent={o.price.depositPercent} />
        </Section>

        {o.service?.enabled && (
          <Section title="שירות ותחזוקה אחרי העלייה לאוויר">
            <ServiceTimeline rows={o.service.rows} />
            {o.service.includes?.length > 0 && <p className="mt-3 text-sm text-muted-foreground">כולל: {o.service.includes.join(" · ")}</p>}
            {so(o) && <p className="mt-2 text-sm">{so(o)}</p>}
          </Section>
        )}

        <Section title="פרטי ההתקשרות">
          {!edit ? (
            <div className="space-y-1 text-[15px]">
              <p className="font-semibold">{c.companyName || c.signerName}{c.taxId && <span className="font-normal text-muted-foreground"> · ח.פ <span className="pa-num">{c.taxId}</span></span>}</p>
              {c.address && <p className="text-muted-foreground">{c.address}</p>}
              <p className="text-muted-foreground">חותם/ת: {c.signerName}{c.signerRole && `, ${c.signerRole}`}</p>
              <p className="text-muted-foreground">חשבוניות: <span dir="ltr">{c.accountingEmail}</span></p>
              <button type="button" className="mt-2 text-sm font-semibold text-primary underline" onClick={() => setEdit(true)}>עריכת הפרטים</button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="שם החברה"><Input value={c.companyName} onChange={set("companyName")} className="h-11" /></Field>
              <Field label="ח.פ / ע.מ"><Input value={c.taxId} onChange={set("taxId")} inputMode="numeric" dir="ltr" className="h-11" /></Field>
              <Field label="כתובת"><Input value={c.address} onChange={set("address")} className="h-11" /></Field>
              <Field label="טלפון"><Input value={c.phone} onChange={set("phone")} type="tel" dir="ltr" className="h-11" /></Field>
              <Field label="שם מורשה החתימה"><Input value={c.signerName} onChange={set("signerName")} className="h-11" /></Field>
              <Field label="תפקיד"><Input value={c.signerRole} onChange={set("signerRole")} className="h-11" /></Field>
              <Field label="איש קשר בהנהלת החשבונות"><Input value={c.accountingName} onChange={set("accountingName")} className="h-11" /></Field>
              <Field label="אימייל להנהלת החשבונות" required hint="לשם יישלחו החשבוניות"><Input value={c.accountingEmail} onChange={set("accountingEmail")} type="email" dir="ltr" className="h-11" /></Field>
            </div>
          )}
        </Section>

        <Section>
          <div className="space-y-4">
            <Field label="שם המאשר/ת" required><Input value={approver} onChange={(e) => setApprover(e.target.value)} className="h-11" autoComplete="name" /></Field>
            <label className="flex items-start gap-3 text-[15px] leading-relaxed">
              <Checkbox checked={accept} onCheckedChange={(v) => setAccept(v === true)} className="mt-1" />
              <span>אני מאשר/ת את הזמנת העבודה, המחיר ולוח התשלומים, ומוסמך/ת לעשות זאת בשם הלקוח.</span>
            </label>
            <ErrorLine error={error} />
            <Button size="lg" disabled={busy} onClick={approve} className="h-12 w-full rounded-xl text-base font-bold">
              {busy ? "שומר..." : "אישור והמשך להסכם"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">בשלב הבא: קריאה וחתימה על הסכם ההתקשרות.</p>
          </div>
        </Section>
      </Container>
    </>
  );
}

function so(o) {
  const s = o.standingOrder;
  if (!s?.enabled) return "";
  return s.startDate
    ? `התשלום החודשי בהוראת קבע בכרטיס אשראי, החל מ-${dmy(s.startDate)}. את הכרטיס מזינים אחרי החתימה.`
    : "התשלום החודשי בהוראת קבע בכרטיס אשראי, בתום החודשים הכלולים. את הכרטיס מזינים אחרי החתימה.";
}

function AgreementStep({ d, post }) {
  const a = d.agreement;
  const pad = useRef(null);
  const [name, setName] = useState(d.approval?.name || d.client.signerName || "");
  const [role, setRole] = useState(d.client.signerRole || "");
  const [accept, setAccept] = useState(false);
  const [openAll, setOpenAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sign = async () => {
    setError("");
    if (name.trim().length < 2) return setError("יש להזין שם מלא");
    if (pad.current.isEmpty()) return setError("יש לחתום בתיבת החתימה");
    if (!accept) return setError("יש לסמן את תיבת האישור");
    setBusy(true);
    try {
      const signature = await fileToDataUrl(await pad.current.toBlob());
      await post({ action: "sign", name: name.trim(), role: role.trim(), signature, accept: true });
    } catch (e) { setBusy(false); setError(errorText(e)); }
  };

  return (
    <Container wide className="py-6 pb-16">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block" aria-label="תוכן ההסכם">
          <div className="sticky top-4 space-y-1 text-sm">
            <p className="mb-2 font-semibold">תוכן</p>
            {a.sections.map((s) => <a key={s.n} href={`#s${s.n}`} onClick={() => setOpenAll(true)} className="block truncate rounded px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground">{s.n}. {s.title}</a>)}
            <a href="#appendix" className="block rounded px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground">נספח א'</a>
            <a href="#sign" className="block rounded px-2 py-1 font-semibold text-primary hover:bg-secondary">חתימה</a>
          </div>
        </nav>
        <div className="min-w-0 space-y-5">
          <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
            <p className="font-semibold">הזמנת העבודה אושרה{d.approval?.name && ` על ידי ${d.approval.name}`}.</p>
            <p className="text-sm">נשאר לקרוא ולחתום על הסכם ההתקשרות. ההסכם כולל את הזמנת העבודה כנספח א'.</p>
          </div>
          <Section>
            <h1 className="text-center text-2xl font-bold">{a.title}</h1>
            <p className="text-center text-sm text-muted-foreground">{a.subtitle}</p>
            <div className="mt-5 space-y-1 text-[15px]">
              <p><span className="font-semibold">בין: </span>{a.parties.company}</p>
              <p><span className="font-semibold">לבין: </span>{a.parties.client}</p>
            </div>
            <div className="pa-legal mt-4 text-[15px]">{a.recitals.map((r) => <p key={r}>{r}</p>)}</div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setOpenAll((v) => !v)} className="text-sm font-semibold text-primary underline">{openAll ? "סגירת כל הסעיפים" : "פתיחת כל הסעיפים"}</button>
            </div>
            <div className="mt-2 divide-y divide-border">
              {a.sections.map((s) => <Clauses key={`${s.n}-${openAll}`} s={s} open={openAll} />)}
            </div>
          </Section>

          <Appendix d={d} />

          <section id="sign" className="pa-card scroll-mt-4 p-5 sm:p-7">
            <h2 className="flex items-center gap-2 text-lg font-bold"><PenLine className="h-5 w-5 text-primary" />חתימה</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="שם מלא" required><Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" autoComplete="name" /></Field>
              <Field label="תפקיד"><Input value={role} onChange={(e) => setRole(e.target.value)} className="h-11" /></Field>
            </div>
            <div className="mt-4"><SignaturePad ref={pad} /></div>
            <label className="mt-4 flex items-start gap-3 text-[15px] leading-relaxed">
              <Checkbox checked={accept} onCheckedChange={(v) => setAccept(v === true)} className="mt-1" />
              <span>קראתי את ההסכם ואת נספח א', אני מסכים/ה לתנאיהם ומוסמך/ת לחתום בשם {d.client.companyName || "הלקוח"}. ידוע לי שחתימה אלקטרונית זו מחייבת כחתימה בכתב יד.</span>
            </label>
            <div className="mt-4 space-y-3">
              <ErrorLine error={error} />
              <Button size="lg" disabled={busy} onClick={sign} className="h-12 w-full rounded-xl text-base font-bold">{busy ? "חותם ושומר את המסמך..." : "חתימה על ההסכם"}</Button>
              <p className="text-center text-xs text-muted-foreground">אחרי החתימה יישלח אליכם עותק חתום בפורמט PDF.</p>
            </div>
          </section>
        </div>
      </div>
    </Container>
  );
}

function Clauses({ s, open }) {
  return (
    <details id={`s${s.n}`} open={open || undefined} className="group scroll-mt-4 py-1">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-2.5 font-bold">
        <span>{s.n}. {s.title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="pa-legal pb-3 text-[15px]">
        {s.clauses.map((cl) => (
          <div key={cl.n}>
            <p><span className="clause-n">{cl.n}</span>{cl.text}</p>
            {cl.sub?.map((x) => <p key={x.n} className="ps-6"><span className="clause-n">({x.n})</span>{x.text}</p>)}
          </div>
        ))}
      </div>
    </details>
  );
}

const Rows = ({ rows }) => (
  <dl className="divide-y divide-border rounded-xl border border-border text-[15px]">
    {rows.map(([k, v]) => (
      <div key={k} className="grid gap-1 p-3 sm:grid-cols-[220px_1fr] sm:gap-3">
        <dt className="text-muted-foreground">{k}</dt><dd className="whitespace-pre-line">{v}</dd>
      </div>
    ))}
  </dl>
);

function Appendix({ d }) {
  const ap = d.agreement.appendix;
  const o = d.order;
  return (
    <section id="appendix" className="pa-card scroll-mt-4 space-y-5 p-5 sm:p-7">
      <div>
        <h2 className="text-xl font-bold">נספח א' – נספח הזמנה מס' <span className="pa-num">{o.number}</span></h2>
        <p className="text-sm text-muted-foreground">פרויקט במחיר קבוע · {o.project.name}</p>
      </div>
      <div><h3 className="mb-2 font-bold">א. אנשי קשר</h3><Rows rows={ap.contacts} /></div>
      <div><h3 className="mb-2 font-bold">ב. תכולה</h3><Rows rows={ap.scope} /></div>
      {ap.stages?.length > 0 && (
        <div>
          <h3 className="mb-2 font-bold">ג. שלבים ובדיקות קבלה</h3>
          <ol className="space-y-2">
            {ap.stages.map((s, i) => (
              <li key={i} className="rounded-xl border border-border p-3 text-[15px]">
                <p className="font-semibold">{String(i + 1).padStart(2, "0")} · {s.deliverable || s.name}</p>
                {s.testFiles && <p className="text-sm"><span className="text-muted-foreground">קובצי בדיקה: </span>{s.testFiles}</p>}
                {s.criteria && <p className="text-sm"><span className="text-muted-foreground">קריטריונים: </span>{s.criteria}</p>}
                {s.target && <p className="text-sm"><span className="text-muted-foreground">יעד משוער: </span>{s.target}</p>}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-sm">תקופת בדיקה: {ap.testPeriodDays} ימי עסקים.</p>
        </div>
      )}
      <div>
        <h3 className="mb-2 font-bold">ד. מחיר ותשלום</h3>
        <p className="mb-3 text-[15px]">מחיר הפרויקט: <span className="pa-num font-semibold">{nis(o.price.amount)}</span> לפני מע"מ (<span className="pa-num">{nis(o.price.total)}</span> כולל מע"מ).
          {ap.hourlyRate ? <> תעריף שעה לשינויים ולחישוב בביטול: <span className="pa-num">{nis(ap.hourlyRate)}</span> לפני מע"מ.</> : null}
          {" "}אמצעי תשלום היתרה: {ap.balanceMethod === "checks" ? "שיקים דחויים" : "העברות בנקאיות"}{ap.bankAccount && ap.balanceMethod !== "checks" ? ` (${ap.bankAccount})` : ""}.</p>
        <ScheduleTable schedule={o.schedule} depositPercent={o.price.depositPercent} />
      </div>
      {o.service?.enabled && (
        <div>
          <h3 className="mb-2 font-bold">ה. שירות חודשי</h3>
          <ServiceTimeline rows={o.service.rows} />
          {ap.serviceComponents?.length > 0 && <p className="mt-2 text-sm">רכיבי השירות: {ap.serviceComponents.join(", ")}{ap.backupFrequency && ` (גיבויים: ${ap.backupFrequency})`}.</p>}
          {ap.hostingDependent && <p className="mt-1 text-sm">תלוי באירוח או ברישיון חיצוני: {ap.hostingDependent}</p>}
          {ap.liabilityCapIncluded ? <p className="mt-1 text-sm">תקרת אחריות בחודשים הכלולים: <span className="pa-num">{nis(ap.liabilityCapIncluded)}</span></p> : null}
        </div>
      )}
      {ap.thirdParty?.length > 0 && (
        <div>
          <h3 className="mb-2 font-bold">ו. עלויות צד שלישי</h3>
          <Rows rows={ap.thirdParty.map((t) => [t.component, [t.payer === "company" ? "החברה, בחיוב הלקוח" : "הלקוח ישירות", t.nature, t.approval].filter(Boolean).join(" · ")])} />
        </div>
      )}
      <div><h3 className="mb-2 font-bold">ז. הפעלה, רישיונות ומידע</h3><Rows rows={ap.operation} /></div>
    </section>
  );
}

function SignedBanner({ d }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">ההסכם נחתם{d.signature?.at && ` ב-${dateTime(d.signature.at)}`}. עותק חתום נשלח אליכם במייל.</p>
        {d.links.signedPdf && <a href={d.links.signedPdf} className="text-sm font-semibold underline">הורדת ההסכם החתום</a>}
      </div>
    </div>
  );
}

function Done({ d }) {
  const o = d.order;
  const deposit = o.schedule.rows.find((r) => r.kind === "deposit");
  return (
    <Container className="space-y-5 py-10">
      <section className="pa-card p-6 text-center sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-7 w-7" /></span>
        <h1 className="mt-4 text-2xl font-bold">ההסכם נחתם. מתחילים.</h1>
        <p className="mt-2 text-muted-foreground">עותק חתום של ההסכם נשלח אליכם במייל{d.signature?.at && `, ${dateTime(d.signature.at)}`}.</p>
        {d.links.signedPdf && <Button asChild variant="outline" className="mt-5"><a href={d.links.signedPdf}><Download className="ms-2 h-4 w-4" />הורדת ההסכם החתום (PDF)</a></Button>}
      </section>
      <Section title="מה עכשיו">
        <ol className="space-y-3 text-[15px]">
          {deposit && (
            <li className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold">1</span>
              <div>
                <p className="font-semibold">תשלום המקדמה: <span className="pa-num">{nis(deposit.total)}</span> עד {dmy(deposit.date)}</p>
                <p className="text-sm text-muted-foreground">הנהלת החשבונות שלכם קיבלה את פרטי התשלום במייל.</p>
              </div>
            </li>
          )}
          <li className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold">{deposit ? 2 : 1}</span>
            <div><p className="font-semibold">פגישת פתיחה</p><p className="text-sm text-muted-foreground">ניצור קשר לתיאום פגישת הפתיחה ולקבלת החומרים והגישות.</p></div>
          </li>
          {o.standingOrder?.enabled && (
            <li className="flex gap-3"><CalendarClock className="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold">הוראת קבע לשירות החודשי</p>
                <p className="text-sm text-muted-foreground">{d.subscription?.card ? `נשמר כרטיס${d.subscription.card.suffix ? ` המסתיים ב-${d.subscription.card.suffix}` : ""}. החיוב הראשון ${d.subscription.startKnown && d.subscription.firstCharge ? `ב-${dmy(d.subscription.firstCharge.date)}` : "בתום החודשים הכלולים"}.` : "עדיין לא הוזן כרטיס. אפשר לחזור לקישור הזה בכל עת, או להשתמש בקישור שבמייל."}</p>
              </div>
            </li>
          )}
        </ol>
      </Section>
    </Container>
  );
}
