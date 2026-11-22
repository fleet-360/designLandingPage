import React, { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, ChevronDown, Download, FileText, PenLine, Rocket, Truck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import SignaturePad from "@/components/sign/SignaturePad";
import { api, dmy, dateTime, errorText, FIELD_ERRORS, fileToDataUrl, fullNameOk, getWithRetry, isEmail, mobileIL, nis, taxIdIL, cleanText } from "@/sales/lib";
import { Container, ErrorLine, Field, Loading, LoadFailed, METHOD_NAMES, Notice, PriceCard, ScheduleTable, Section, ServiceTimeline, Shell, Stepper } from "./ui.jsx";
import { DealHero, JourneyRoad, PayHow } from "./deal-ui.jsx";
import CardSetup from "./CardSetup.jsx";
import DemoFilm, { ClientsStrip, VideoFilm } from "./DemoFilm.jsx";

export default function DealPage({ token }) {
  const [d, setD] = useState(undefined);
  const [skipCard, setSkipCard] = useState(false);
  const url = `sales/deal-public?token=${encodeURIComponent(token)}`;
  // visit=1: opening the page, which goes in the deal's history (not the card check's reloads)
  const load = useCallback((visit) => getWithRetry(visit ? `${url}&visit=1` : url).then((v) => { setD(v); return v; }), [url]);
  useEffect(() => { load(true).catch((err) => setD(err.status === 404 ? null : "failed")); }, [load]);
  useEffect(() => { window.scrollTo(0, 0); }, [d?.status?.order, d?.status?.agreement, skipCard]);

  if (d === undefined) return <Shell><Loading /></Shell>;
  if (d === null) return <Shell><Notice title="הקישור אינו פעיל" text="ייתכן שההזמנה בוטלה או שהקישור הועתק חלקית. נשמח לשלוח קישור חדש." /></Shell>;
  if (d === "failed") return <Shell><LoadFailed /></Shell>;

  const so = d.order.standingOrder;
  const needsCard = Boolean(so?.enabled);
  const steps = [
    { label: "הזמנת העבודה", done: Boolean(d.approvedAt) },
    { label: "חתימה", done: Boolean(d.signedAt) },
    ...(needsCard ? [{ label: "יצאנו לדרך", done: Boolean(d.subscription?.card) }] : []),
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
  const [c, setC] = useState({ ...d.client, authorizedContact: { name: "", role: "", phone: "", email: "", ...(d.client.authorizedContact || {}) } });
  const [approver, setApprover] = useState(d.client.signerName || "");
  const [accept, setAccept] = useState(false);
  // the client completes what sales did not know: address, tax id, accounting, phone
  const [edit, setEdit] = useState(!d.client.accountingEmail || !d.client.taxId || !d.client.address || !d.client.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bad, setBad] = useState({});
  const set = (k) => (e) => { setC((s) => ({ ...s, [k]: e.target.value })); setBad((b) => ({ ...b, [k]: "" })); };
  const setA = (k) => (e) => { setC((s) => ({ ...s, authorizedContact: { ...s.authorizedContact, [k]: e.target.value } })); setBad((b) => ({ ...b, authorizedEmail: "" })); };

  const approve = async () => {
    setError("");
    if (!c.companyName.trim() && !c.signerName.trim()) { setEdit(true); return setError("יש להזין שם חברה או שם מלא"); }
    // the invoices and the card for the standing order go through Grow, which needs these valid
    const errs = {
      taxId: taxIdIL(c.taxId) ? "" : FIELD_ERRORS.taxId,
      phone: mobileIL(c.phone) ? "" : FIELD_ERRORS.phone,
      signerName: fullNameOk(c.signerName) ? "" : FIELD_ERRORS.fullName,
      accountingEmail: isEmail(c.accountingEmail) ? "" : "יש להזין אימייל של הנהלת החשבונות, לשם יישלחו החשבוניות",
      address: c.address?.trim() ? "" : "יש להזין כתובת. היא מופיעה בהסכם",
      authorizedEmail: !c.authorizedContact.email || isEmail(c.authorizedContact.email) ? "" : FIELD_ERRORS.email,
    };
    setBad(errs);
    if (Object.values(errs).some(Boolean)) { setEdit(true); return setError("יש לתקן את השדות המסומנים בפרטי ההתקשרות"); }
    if (approver.trim().length < 2) return setError("יש להזין את שם המאשר/ת");
    if (!accept) return setError("יש לסמן את תיבת האישור");
    setBusy(true);
    try { await post({ action: "approve", client: { ...c, accountingEmail: cleanText(c.accountingEmail), email: cleanText(c.email), authorizedContact: { ...c.authorizedContact, email: cleanText(c.authorizedContact.email) }, phone: mobileIL(c.phone), taxId: taxIdIL(c.taxId) }, approverName: approver.trim(), accept: true }); } catch (e) { setBusy(false); setError(errorText(e)); }
  };

  return (
    <>
      <DealHero order={o} pitch={d.pitch} />
      {d.film && <FilmBand film={d.film} order={o} />}
      <Container className={`${d.film ? "" : "-mt-4 "}space-y-5 pb-10`}>
        <Section title="מה בונים לכם">
          <ul className="space-y-3">
            {o.project.specName && (
              <li className="flex gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">לפי האפיון המאושר: {o.project.specName}</p>
                  <p className="text-sm text-muted-foreground">{[o.project.specVersion && `גרסה ${o.project.specVersion}`, o.project.specDate && `מיום ${dmy(o.project.specDate)}`].filter(Boolean).join(" · ")}
                    {d.links.spec && <> · <a href={d.links.spec} target="_blank" rel="noreferrer" className="text-primary underline">לצפייה באפיון</a></>}</p>
                  {d.links.spec && <p className="mt-1 text-sm text-muted-foreground">מצורף להסכם כנספח ב'. השעות שבאפיון הן הערכה משוערת בלבד, והמחיר קבוע וסגור.</p>}
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

      </Container>

      <JourneyRoad order={o} note={so(o)} />

      <Container className="space-y-5 py-8 pb-16">
        {/* the price after what is built and the road ahead, right above how it is paid */}
        <PriceCard price={o.price} />
        <Section title="לוח התשלומים">
          <p className="mb-3 text-sm text-muted-foreground">
            {o.payInfo
              ? "כל תשלום בתאריך ובאמצעי התשלום שלו. התאריכים קבועים ואינם תלויים באבני דרך. התשלום הראשון הוא המקדמה, ואיתה מתחילים לעבוד."
              : `מקדמה בתוך 3 ימי עסקים מהאישור, והיתרה בתאריכים קבועים שאינם תלויים באבני דרך.`}
          </p>
          <ScheduleTable schedule={o.schedule} />
          <PayHow order={o} />
        </Section>

        <Section title="פרטי ההתקשרות">
          {!edit ? (
            <div className="space-y-1 text-[15px]">
              <p className="font-semibold">{c.companyName || c.signerName}{c.taxId && <span className="font-normal text-muted-foreground"> · ח.פ <span className="pa-num">{c.taxId}</span></span>}</p>
              {c.address && <p className="text-muted-foreground">{c.address}</p>}
              <p className="text-muted-foreground">חותם/ת: {c.signerName}{c.signerRole && `, ${c.signerRole}`}</p>
              <p className="text-muted-foreground">חשבוניות: <span dir="ltr">{c.accountingEmail}</span></p>
              {c.authorizedContact.name && <p className="text-muted-foreground">שינויים ובקשות פיתוח: {c.authorizedContact.name}{c.authorizedContact.role && `, ${c.authorizedContact.role}`}</p>}
              <button type="button" className="mt-2 text-sm font-semibold text-primary underline" onClick={() => setEdit(true)}>עריכת הפרטים</button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="שם החברה"><Input value={c.companyName} onChange={set("companyName")} className="h-11" /></Field>
              <Field label="ח.פ / ע.מ / ת.ז" required error={bad.taxId}><Input value={c.taxId} onChange={set("taxId")} inputMode="numeric" dir="ltr" className="h-11" /></Field>
              <Field label="כתובת" required error={bad.address}><Input value={c.address} onChange={set("address")} className="h-11" /></Field>
              <Field label="טלפון נייד" required error={bad.phone}><Input value={c.phone} onChange={set("phone")} type="tel" dir="ltr" className="h-11" /></Field>
              <Field label="שם החותם" required error={bad.signerName}><Input value={c.signerName} onChange={set("signerName")} className="h-11" /></Field>
              <Field label="תפקיד החותם"><Input value={c.signerRole} onChange={set("signerRole")} className="h-11" /></Field>
              <Field label="איש קשר בהנהלת החשבונות"><Input value={c.accountingName} onChange={set("accountingName")} className="h-11" /></Field>
              <Field label="אימייל להנהלת החשבונות" required hint="לשם יישלחו החשבוניות" error={bad.accountingEmail}><Input value={c.accountingEmail} onChange={set("accountingEmail")} type="email" dir="ltr" className="h-11" /></Field>
              <div className="sm:col-span-2 pt-2">
                <p className="text-sm font-semibold">איש קשר מוסמך לשינויים ולבקשות פיתוח</p>
                <p className="text-xs text-muted-foreground">מי שמעביר אלינו בקשות לשינויים ולפיתוח ומאשר אותן בשמכם (סעיף 4.2 בהסכם)</p>
              </div>
              <Field label="שם"><Input value={c.authorizedContact.name} onChange={setA("name")} className="h-11" /></Field>
              <Field label="תפקיד"><Input value={c.authorizedContact.role} onChange={setA("role")} className="h-11" /></Field>
              <Field label="טלפון"><Input value={c.authorizedContact.phone} onChange={setA("phone")} type="tel" dir="ltr" className="h-11" /></Field>
              <Field label="אימייל" error={bad.authorizedEmail}><Input value={c.authorizedContact.email} onChange={setA("email")} type="email" dir="ltr" className="h-11" /></Field>
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
              {busy ? "שומר..." : "מאשרים ויוצאים לדרך"}
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
  const [idNumber, setIdNumber] = useState("");
  const [accept, setAccept] = useState(false);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sign = async () => {
    setError("");
    if (name.trim().length < 2) return setError("יש להזין שם מלא");
    if (idNumber.trim() && !taxIdIL(idNumber)) return setError("מספר תעודת הזהות לא תקין. אפשר גם להשאיר ריק");
    if (pad.current.isEmpty()) return setError("יש לחתום בתיבת החתימה");
    if (!accept) return setError("יש לסמן את תיבת האישור");
    setBusy(true);
    try {
      const signature = await fileToDataUrl(await pad.current.toBlob());
      await post({ action: "sign", name: name.trim(), role: role.trim(), idNumber: idNumber.trim() ? taxIdIL(idNumber) : undefined, signature, accept: true });
    } catch (e) { setBusy(false); setError(errorText(e)); }
  };

  const details = appendixA(a) ? "נספח א'" : "פרטי ההזמנה";
  const navLink = "block truncate rounded px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground";
  return (
    <Container wide className="py-6 pb-16">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block" aria-label="תוכן העמוד">
          <div className="sticky top-4 space-y-1 text-sm">
            <p className="mb-2 font-semibold">תוכן</p>
            <button type="button" onClick={() => setReading(true)} className={`${navLink} w-full text-start`}>ההסכם</button>
            <a href="#appendix" className={navLink}>{details}</a>
            <a href="#sign" className="block rounded px-2 py-1 font-semibold text-primary hover:bg-secondary">חתימה</a>
          </div>
        </nav>
        <div className="min-w-0 space-y-5">
          <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
            <p className="font-semibold">הזמנת העבודה אושרה{d.approval?.name && ` על ידי ${d.approval.name}`}.</p>
            <p className="text-sm">נשאר לקרוא ולחתום על הסכם ההתקשרות. {appendixA(a) ? "ההסכם כולל את הזמנת העבודה כנספח א'." : "פרטי ההזמנה שלמטה הם חלק מההסכם."}</p>
          </div>
          {/* the agreement's heading and parties as they were; its sections open in a dialog, like terms to accept */}
          <Section>
            <h1 className="text-center text-2xl font-bold">{a.title}</h1>
            <p className="text-center text-sm text-muted-foreground">{a.subtitle}</p>
            <div className="mt-5 space-y-1 text-[15px]">
              <p><span className="font-semibold">בין: </span>{a.parties.company}</p>
              <p><span className="font-semibold">לבין: </span>{a.parties.client}</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">{a.sections.length} סעיפים</p>
              <button type="button" onClick={() => setReading(true)} className="text-sm font-semibold text-primary underline">קריאת ההסכם המלא</button>
            </div>
          </Section>
          {reading && <AgreementDialog d={d} onClose={() => setReading(false)} />}

          <Appendix d={d} />

          <section id="sign" className="pa-card scroll-mt-4 p-5 sm:p-7">
            <h2 className="flex items-center gap-2 text-lg font-bold"><PenLine className="h-5 w-5 text-primary" />חתימה</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="שם החותם" required><Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" autoComplete="name" /></Field>
              <Field label="תפקיד החותם"><Input value={role} onChange={(e) => setRole(e.target.value)} className="h-11" /></Field>
              <Field label="תעודת זהות"><Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} inputMode="numeric" dir="ltr" className="h-11" /></Field>
            </div>
            <div className="mt-4"><SignaturePad ref={pad} /></div>
            <label className="mt-4 flex items-start gap-3 text-[15px] leading-relaxed">
              <Checkbox checked={accept} onCheckedChange={(v) => setAccept(v === true)} className="mt-1" />
              <span>קראתי את <button type="button" onClick={(e) => { e.preventDefault(); setReading(true); }} className="font-semibold text-primary underline">ההסכם</button> ואת {appendixA(a) ? "נספח א'" : "פרטי ההזמנה"}, אני מסכים/ה לתנאיהם ומוסמך/ת לחתום בשם {d.client.companyName || "הלקוח"}. ידוע לי שחתימה אלקטרונית זו מחייבת כחתימה בכתב יד.</span>
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

// The agreement's text, as it was on the page: recitals and sections, with the contents beside it.
// The order details and the signature stay on the page.
function AgreementDialog({ d, onClose }) {
  const a = d.agreement;
  const [openAll, setOpenAll] = useState(false);
  const go = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* pa: the dialog renders outside the page (a portal), so it takes the page's theme itself */}
      <DialogContent dir="rtl" style={{ minHeight: 0 }} className="pa flex h-[92vh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0">
        <DialogTitle className="sr-only">{a.title}</DialogTitle>
        <DialogDescription className="sr-only">{a.subtitle}</DialogDescription>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            <nav className="hidden pt-8 lg:block" aria-label="תוכן ההסכם">
              <div className="sticky top-8 space-y-1 text-sm">
                <p className="mb-2 font-semibold">תוכן</p>
                {a.sections.map((s) => <button key={s.n} type="button" onClick={() => go(`s${s.n}`)} className="block w-full truncate rounded px-2 py-1 text-start text-muted-foreground hover:bg-secondary hover:text-foreground">{s.n}. {s.title}</button>)}
              </div>
            </nav>
            <Section>
              <h2 className="text-center text-2xl font-bold">{a.title}</h2>
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
          </div>
        </div>
        <div className="border-t border-border bg-white p-3 sm:px-6">
          <Button size="lg" type="button" onClick={onClose} className="h-12 w-full rounded-xl text-base font-bold">חזרה לחתימה</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// up to agreement v2 the order details were Appendix A; from v3 they are part of the agreement itself
const appendixA = (a) => ["v1", "v2"].includes(a.version);

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
        <h2 className="text-xl font-bold">{appendixA(d.agreement) ? "נספח א' – נספח הזמנה" : "פרטי ההזמנה – הזמנה"} מס' <span className="pa-num">{o.number}</span></h2>
        <p className="text-sm text-muted-foreground">פרויקט במחיר קבוע · {o.project.name}{!appendixA(d.agreement) && " · חלק בלתי נפרד מההסכם"}</p>
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
        <p className="mb-3 text-[15px]">מחיר הפרויקט: <span className="pa-num font-semibold">{nis(o.price.amount)}</span> לפני מע"מ{o.price.listAmount > o.price.amount && <> אחרי הנחה של <span className="pa-num">{nis(o.price.discount)}</span> ממחיר של <span className="pa-num">{nis(o.price.listAmount)}</span></>} (<span className="pa-num">{nis(o.price.total)}</span> כולל מע"מ).
          {ap.hourlyRates?.length > 0 && <> תעריפי שעה לשינויים ולחישוב בביטול, לפני מע"מ: {ap.hourlyRates.map((r, i) => <span key={i}>{i > 0 && " · "}{r.role} <span className="pa-num">{nis(r.rate)}</span></span>)}.</>}
          {!ap.hourlyRates && ap.hourlyRate ? <> תעריף שעה לשינויים ולחישוב בביטול: <span className="pa-num">{nis(ap.hourlyRate)}</span> לפני מע"מ.</> : null}
          {o.payInfo ? " כל תשלום בתאריך ובאמצעי התשלום שבטבלה." : <> אמצעי תשלום היתרה: {ap.balanceMethod === "checks" ? "שיקים דחויים" : "העברות בנקאיות"}{ap.bankAccount && ap.balanceMethod !== "checks" ? ` (${ap.bankAccount})` : ""}.</>}</p>
        <ScheduleTable schedule={o.schedule} />
        {o.payInfo && <PayHow order={o} />}
      </div>
      {o.service?.enabled && (
        <div>
          <h3 className="mb-2 font-bold">ה. שירות חודשי</h3>
          <ServiceTimeline rows={o.service.rows} />
          {ap.serviceComponents?.length > 0 && <p className="mt-2 text-sm">רכיבי השירות: {ap.serviceComponents.join(", ")}.</p>}
          {ap.liabilityCapIncluded ? <p className="mt-1 text-sm">תקרת אחריות עד תחילת החיוב החודשי: <span className="pa-num">{nis(ap.liabilityCapIncluded)}</span></p> : null}
        </div>
      )}
      <div><h3 className="mb-2 font-bold">ו. הפעלה ורישיון</h3><Rows rows={ap.operation} /></div>
    </section>
  );
}

function SignedBanner({ d }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">{d.signature?.manual ? "ההסכם נחתם." : <>ההסכם נחתם{d.signature?.at && ` ב-${dateTime(d.signature.at)}`}. עותק חתום נשלח אליכם במייל.</>}</p>
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
        {!d.signature?.manual && <p className="mt-2 text-muted-foreground">עותק חתום של ההסכם נשלח אליכם במייל{d.signature?.at && `, ${dateTime(d.signature.at)}`}.</p>}
        {d.links.signedPdf && <Button asChild variant="outline" className="mt-5"><a href={d.links.signedPdf}><Download className="ms-2 h-4 w-4" />הורדת ההסכם החתום (PDF)</a></Button>}
      </section>
      <Section title="מה עכשיו">
        <ol className="space-y-3 text-[15px]">
          {deposit && (
            <li className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold">1</span>
              <div>
                <p className="font-semibold">תשלום המקדמה: <span className="pa-num">{nis(deposit.total)}</span> {deposit.method ? `ב-${dmy(deposit.date)} · ${METHOD_NAMES[deposit.method]}` : `עד ${dmy(deposit.date)}`}</p>
                <p className="text-sm text-muted-foreground">{d.signature?.manual ? "פרטי התשלום מופיעים באישור ההזמנה." : "הנהלת החשבונות שלכם קיבלה את פרטי התשלום במייל."}</p>
              </div>
            </li>
          )}
          {o.payInfo?.checks && (
            <li className="flex gap-3"><Truck className="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold">להכין את השיקים</p>
                <p className="text-sm text-muted-foreground">
                  {o.schedule.rows.filter((r) => r.method === "check").map((r) => `${dmy(r.date)} · ${nis(r.total)}`).join("  |  ")}.{" "}
                  {o.payInfo.checks.pickupDate ? `שליח יגיע לאסוף אותם ב-${dmy(o.payInfo.checks.pickupDate)}.` : "נתאם איתכם את האיסוף."}
                </p>
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

// the demo playing by itself, the client logos under it, and the line that invites them to join
function FilmBand({ film, order }) {
  return (
    <section className="pb-4 pt-8 sm:pt-10" aria-label="הדמו">
      <Container wide>
        {film.video
          ? <VideoFilm video={film.video} logo={film.logo} title={order.project.name} />
          : <DemoFilm demo={film.demo} logo={film.logo} script={film.script} title={order.project.name} />}
      </Container>
      <ClientsStrip />
      <Container className="pb-6 text-center">
        <p className="text-2xl font-black leading-tight text-[#1c1a4f] sm:text-4xl">הצטרפו ללקוחות שלנו</p>
        <p className="mt-2 text-lg font-bold text-[#2d2a8f] sm:text-2xl">ובואו נהפוך את החלום למציאות</p>
      </Container>
    </section>
  );
}
