import React, { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, CalendarDays, CalendarPlus, Clock, Cpu, FileText, Map as MapIcon, PiggyBank, Plus, ShieldCheck, Target, Users, Workflow, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, dayLabel, errorText, isEmail, meetingTime, nis, timeLabel } from "@/sales/lib";
import { createPayment, openWidget, warmUp } from "@/sales/grow";
import { Container, ErrorLine, Field, Loading, Notice, Shell } from "./ui.jsx";

const BENEFITS = [
  { icon: Target, title: "חזון פרויקט ברור", text: "יודעים בדיוק מה בונים ולמה, לפני שכותבים שורת קוד." },
  { icon: ShieldCheck, title: "צמצום סיכונים ואי-ודאות", text: "שאלות פתוחות נסגרות עכשיו, לא באמצע הפיתוח." },
  { icon: Cpu, title: "ארכיטקטורה טכנולוגית מוגדרת", text: "בוחרים טכנולוגיה ומבנה שמתאימים לתהליך שלכם." },
  { icon: PiggyBank, title: "חיסכון בזמן ובתקציב", text: "פחות שינויים בדרך, הערכה מדויקת יותר של העלות." },
];

const PHASES = [
  { title: "פגישת התנעה ויישור קו", items: ["איסוף וניתוח דרישות", "הגדרת יעדי הפרויקט", "זיהוי מדדי הצלחה (KPIs)", "תיאום ציפיות בין בעלי העניין"] },
  { title: "ניתוח והנדסה", items: ["מיפוי תהליכי העבודה", "המרה דיגיטלית נטולת שגיאות", "תכנון ארכיטקטורת המערכת", "גיבוש המלצות לפתרון המיטבי"] },
];

const DELIVERABLES = [
  { icon: FileText, title: "מסמך דרישות מוצר מקיף", text: "דרישות עסקיות וטכנולוגיות מפורטות." },
  { icon: Workflow, title: "תרשימי זרימת תהליכים", text: "המחשה ויזואלית של תהליכי העבודה של המשתמשים." },
  { icon: MapIcon, title: "מפת דרכים טכנולוגית", text: "הערכת לוחות זמנים, משאבים ותקציב לפיתוח." },
];

export default function DiscoveryPage({ token }) {
  const [d, setD] = useState(undefined);
  const [stage, setStage] = useState("view"); // view | pay | waiting | schedule | done
  const load = useCallback(async () => {
    try {
      const v = await api(`sales/discovery-public?token=${encodeURIComponent(token)}`);
      setD(v);
      return v;
    } catch {
      setD(null);
      return null;
    }
  }, [token]);

  useEffect(() => {
    load().then((v) => {
      if (!v) return;
      if (v.booked) setStage("done");
      else if (v.paid) setStage("schedule");
    });
    warmUp();
  }, [load]);

  if (d === undefined) return <Shell><Loading /></Shell>;
  if (d === null) return <Shell><Notice title="הקישור אינו פעיל" text="ייתכן שההצעה בוטלה או שהקישור הועתק חלקית. נשמח לשלוח קישור חדש." /></Shell>;

  if (stage === "schedule") return <Schedule token={token} d={d} onBooked={(v) => { setD(v); setStage("done"); }} />;
  if (stage === "done") return <Booked d={d} />;

  return (
    <Shell company={d.company}>
      <header className="pa-hero">
        <Container className="pb-14 pt-10 sm:pb-20 sm:pt-16">
          <p className="text-sm font-medium text-white/80">הוכן עבור {d.companyName || d.clientName}</p>
          <h1 className="mt-2 text-4xl font-extrabold leading-tight sm:text-5xl">{d.title}</h1>
          <p className="mt-3 text-lg font-semibold text-white/95">ניתוח, מיפוי טכנולוגי וארכיטקטורת פתרון.</p>
          <p className="mt-1 text-white/80">המרת דרישות עסקיות למפת דרכים ברורה ויישימה לפיתוח.</p>
          {d.note && <p className="mt-6 max-w-xl rounded-xl bg-white/10 p-4 text-[15px] leading-relaxed text-white/95">{d.note}</p>}
        </Container>
      </header>

      <Container className="-mt-8 space-y-6 pb-36 sm:-mt-10">
        <section className="pa-card p-6 sm:p-8">
          <h2 className="text-2xl font-bold">למה להתחיל בספרינט גילוי?</h2>
          <p className="mt-2 text-muted-foreground">ספרינט הגילוי יוצר בסיס ברור לפיתוח, תוך צמצום סיכונים וחיסכון בזמן ובמשאבים.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#2d2390] text-white"><Icon className="h-5 w-5" /></span>
                <div><h3 className="font-bold">{title}</h3><p className="text-sm text-muted-foreground">{text}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 px-1 text-2xl font-bold">איך זה עובד</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {PHASES.map((p, i) => (
              <div key={p.title} className="pa-card overflow-hidden">
                <div className="flex items-center gap-3 bg-gradient-to-l from-[#2d2390] to-[#3b46b8] px-5 py-3 text-white">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15 font-bold">{i + 1}</span>
                  <h3 className="text-lg font-bold">{p.title}</h3>
                </div>
                <ul className="space-y-2 p-5">
                  {p.items.map((it) => <li key={it} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="pa-card p-6 sm:p-8">
          <h2 className="text-2xl font-bold">מה תקבלו בסוף</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {DELIVERABLES.map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-foreground"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-3 font-bold">{title}</h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl bg-gradient-to-l from-[#4a3fc4] to-[#2d2390] p-6 text-white sm:p-8">
          <p className="text-sm font-medium text-white/80">חבילת פתרון</p>
          <p className="mt-1 text-4xl font-extrabold"><span className="pa-num">{nis(d.price)}</span> <span className="text-lg font-semibold text-white/85">+ מע"מ</span></p>
          <p className="mt-1 text-sm text-white/80"><span className="pa-num">{nis(d.total)}</span> כולל מע"מ</p>
          <p className="mt-4 max-w-lg text-white/95">כולל את כל תהליכי הניתוח, התיעוד והכנת מפת הדרכים לפרויקט. הופכים את הרעיון לתוכנית פעולה שאפשר לבצע.</p>
        </section>

        <section className="pa-card p-6 sm:p-8">
          <h2 className="text-xl font-bold">שלושה צעדים להתחלה</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, t: "תשלום מאובטח", s: "כאן בעמוד, בכרטיס אשראי. חשבונית מס קבלה תישלח במייל." },
              { icon: CalendarDays, t: "בוחרים מועד", s: "מיד אחרי התשלום מופיעים המועדים הפנויים ביומן שלנו." },
              { icon: Users, t: "נפגשים", s: `פגישת פתיחה של ${d.meetingMinutes} דקות. אפשר לצרף אנשי מקצוע מהצוות שלכם.` },
            ].map(({ icon: Icon, t, s }, i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary font-bold">{i + 1}</span>
                <div><h3 className="flex items-center gap-1.5 font-bold"><Icon className="h-4 w-4 text-primary" />{t}</h3><p className="text-sm text-muted-foreground">{s}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <p className="py-4 text-center text-sm text-muted-foreground">הופכים רעיון לתוכנית פעולה ברורה. · {d.company.name}</p>
      </Container>

      <div className="pa-dock">
        <Container>
          <Button size="lg" className="h-14 w-full rounded-2xl text-base font-bold shadow-lg" onClick={() => setStage("pay")}>
            <CalendarCheck className="ms-2 h-5 w-5" />
            שלם עכשיו וקבע תאריך לאיפיון
          </Button>
        </Container>
      </div>

      {stage === "pay" && <PaySheet d={d} onClose={() => setStage("view")} onPaid={async () => { setStage("waiting"); }} />}
      {stage === "waiting" && <WaitForPayment load={load} onPaid={() => setStage("schedule")} onBack={() => setStage("view")} />}
    </Shell>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl sm:p-7">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          {onClose && <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-secondary" aria-label="סגירה"><X className="h-5 w-5" /></button>}
        </div>
        {children}
      </div>
    </div>
  );
}

function PaySheet({ d, onClose, onPaid }) {
  const p = d.payment;
  const [f, setF] = useState({ fullName: p.fullName, email: p.email, phone: p.phone, taxId: p.taxId });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const pay = async (e) => {
    e.preventDefault();
    setError("");
    if (f.fullName.trim().split(/\s+/).length < 2) return setError("יש להזין שם מלא (שם פרטי ומשפחה)");
    if (!isEmail(f.email)) return setError("יש להזין אימייל תקין לקבלת החשבונית");
    if (!/^0\d{8,9}$/.test(f.phone.replace(/[^\d]/g, "").replace(/^972/, "0"))) return setError("יש להזין מספר טלפון נייד תקין");
    setBusy(true);
    try {
      const proc = await createPayment({ ...p, ...f, sum: p.sum });
      if (proc.authCode) {
        const opened = await openWidget(proc.authCode, {
          onSuccess: () => onPaid(),
          onFailure: () => { setBusy(false); setError("התשלום לא אושר. בדקו את פרטי הכרטיס ונסו שוב."); },
          onClose: () => setBusy(false),
        });
        if (!opened) { setBusy(false); setError("לא הצלחנו לפתוח את חלון התשלום. רעננו את הדף ונסו שוב."); }
      } else if (proc.url) {
        window.location.href = proc.url;
      } else {
        throw new Error("no_checkout");
      }
    } catch {
      setBusy(false);
      setError("לא הצלחנו להתחיל את התשלום. נסו שוב בעוד רגע.");
    }
  };

  return (
    <Sheet title="תשלום מאובטח" onClose={busy ? null : onClose}>
      <form onSubmit={pay} className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
          <span className="font-medium">{d.title}</span>
          <span className="font-bold pa-num">{nis(p.sum)}</span>
        </div>
        <Field label="שם מלא" required><Input value={f.fullName} onChange={set("fullName")} autoComplete="name" className="h-12" /></Field>
        <Field label="אימייל (לחשבונית)" required><Input value={f.email} onChange={set("email")} type="email" dir="ltr" autoComplete="email" className="h-12" /></Field>
        <Field label="טלפון נייד" required><Input value={f.phone} onChange={set("phone")} type="tel" dir="ltr" autoComplete="tel" className="h-12" /></Field>
        <Field label="ח.פ / ע.מ" hint="לחשבונית על שם החברה"><Input value={f.taxId} onChange={set("taxId")} inputMode="numeric" dir="ltr" className="h-12" /></Field>
        <ErrorLine error={error} />
        <Button type="submit" size="lg" disabled={busy} className="h-12 w-full rounded-xl text-base font-bold">{busy ? "פותח את חלון התשלום..." : `לתשלום ${nis(p.sum)}`}</Button>
        <p className="text-center text-xs text-muted-foreground">הסליקה מתבצעת בחלון מאובטח של Grow. פרטי הכרטיס לא נשמרים אצלנו.</p>
      </form>
    </Sheet>
  );
}

// Grow confirms the payment to us through Toro a moment after the widget closes
function WaitForPayment({ load, onPaid, onBack }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    let stop = false;
    const started = Date.now();
    (async function poll() {
      while (!stop) {
        const v = await load();
        if (v?.paid) return onPaid();
        if (Date.now() - started > 45000) setLate(true);
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
    return () => { stop = true; };
  }, [load, onPaid]);
  return (
    <Sheet title="התשלום התקבל, רגע אחד">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-primary/25 border-t-primary" />
        <p>מאשרים את התשלום מול חברת הסליקה ופותחים את היומן.</p>
        {late && <p className="text-sm text-muted-foreground">זה לוקח יותר מהרגיל. אפשר להשאיר את העמוד פתוח, או לחזור לאותו קישור מאוחר יותר: אחרי האישור תוכלו לקבוע מועד מכאן.</p>}
        {late && <Button variant="outline" onClick={onBack}>חזרה לעמוד</Button>}
      </div>
    </Sheet>
  );
}

function Schedule({ token, d, onBooked }) {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState("");
  const [pick, setPick] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const top = useRef(null);

  const loadSlots = useCallback(() => {
    setSlots(null);
    api(`sales/discovery-public?token=${encodeURIComponent(token)}&slots=1`).then((r) => setSlots(r.slots)).catch((e) => { setSlots([]); setError(errorText(e)); });
  }, [token]);
  useEffect(loadSlots, [loadSlots]);

  const addAttendee = () => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    if (!isEmail(e)) return setError("כתובת האימייל של המשתתף לא תקינה");
    setError("");
    if (!attendees.includes(e)) setAttendees((a) => [...a, e]);
    setEmail("");
  };

  const book = async () => {
    setError("");
    const pending = email.trim();
    if (pending && !isEmail(pending)) return setError("כתובת האימייל של המשתתף לא תקינה");
    const list = pending && !attendees.includes(pending.toLowerCase()) ? [...attendees, pending.toLowerCase()] : attendees;
    if (!d.email && !list.length) return setError("יש להזין אימייל לקבלת הזימון");
    setBusy(true);
    try {
      const v = await api(`sales/discovery-public?token=${encodeURIComponent(token)}`, { method: "POST", body: { action: "book", start: pick.start, attendees: list } });
      onBooked(v);
    } catch (e) {
      setBusy(false);
      setError(errorText(e));
      if (e.code === "slot_taken") { setPick(null); loadSlots(); top.current?.scrollIntoView({ behavior: "smooth" }); }
    }
  };

  const days = [];
  for (const s of slots || []) {
    const key = dayLabel(s.start);
    const day = days.find((x) => x.key === key) || (days.push({ key, slots: [] }), days[days.length - 1]);
    day.slots.push(s);
  }

  return (
    <Shell company={d.company}>
      <Container className="space-y-5 py-8 pb-32">
        <div ref={top} className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
          <p className="font-bold">התשלום התקבל, תודה.</p>
          <p className="text-sm">חשבונית מס קבלה נשלחה למייל. עכשיו נקבע את פגישת הפתיחה.</p>
        </div>
        <section className="pa-card p-5 sm:p-7">
          <h1 className="text-2xl font-bold">בחרו מועד לפגישת הפתיחה</h1>
          <p className="mt-1 text-muted-foreground">פגישה של {d.meetingMinutes} דקות. המועדים לפי שעון ישראל.</p>
          {slots === null ? <div className="py-10"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary/25 border-t-primary" /></div>
            : slots.length === 0 ? <p className="mt-6 text-muted-foreground">כרגע אין מועדים פנויים בשבועיים הקרובים. נחזור אליכם לתאם, או התקשרו אלינו: <span className="pa-num">{d.company.phone}</span></p>
              : (
                <div className="mt-5 space-y-4">
                  {days.map((day) => (
                    <div key={day.key}>
                      <p className="mb-2 text-sm font-semibold text-muted-foreground">{day.key}</p>
                      <div className="flex flex-wrap gap-2">
                        {day.slots.map((s) => {
                          const on = pick?.start === s.start;
                          return (
                            <button key={s.start} type="button" onClick={() => setPick(s)} aria-pressed={on}
                              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[15px] font-semibold transition ${on ? "border-primary bg-primary text-white" : "border-border bg-white hover:border-primary/60"}`}>
                              <Clock className="h-4 w-4" />{timeLabel(s.start)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </section>

        {pick && (
          <section className="pa-card p-5 sm:p-7">
            <h2 className="text-lg font-bold">מי עוד מצטרף?</h2>
            <p className="text-sm text-muted-foreground">{d.email ? <>הזימון יישלח אל <span dir="ltr">{d.email}</span>. אפשר להוסיף אנשי מקצוע מהצוות.</> : "הוסיפו את האימייל שלכם, ואם תרצו גם של אנשי מקצוע מהצוות. הזימון יישלח לכולם."}</p>
            <div className="mt-3 flex gap-2">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttendee(); } }} type="email" dir="ltr" placeholder="name@company.co.il" className="h-11" aria-label="אימייל של משתתף נוסף" />
              <Button type="button" variant="outline" className="h-11" onClick={addAttendee}><Plus className="ms-1 h-4 w-4" />הוספה</Button>
            </div>
            {attendees.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {attendees.map((a) => (
                  <li key={a} className="flex items-center gap-1 rounded-full bg-secondary py-1 pe-1 ps-3 text-sm" dir="ltr">
                    {a}<button type="button" onClick={() => setAttendees((x) => x.filter((y) => y !== a))} className="rounded-full p-1 hover:bg-white" aria-label={`הסרת ${a}`}><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <ErrorLine error={error} />
      </Container>
      <div className="pa-dock">
        <Container>
          <Button size="lg" disabled={!pick || busy} onClick={book} className="h-14 w-full rounded-2xl text-base font-bold shadow-lg">
            {busy ? "קובע את הפגישה..." : pick ? `קביעת הפגישה · ${shortDay(pick.start)} · ${timeLabel(pick.start)}` : "בחרו מועד"}
          </Button>
        </Container>
      </div>
    </Shell>
  );
}

const shortDay = (iso) => new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short", day: "numeric", month: "numeric" });

function Booked({ d }) {
  const m = d.meeting;
  const gcal = m ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${d.title} · Pro Algorithm`)}&dates=${new Date(m.start).toISOString().replace(/[-:]|\.\d{3}/g, "")}/${new Date(m.end).toISOString().replace(/[-:]|\.\d{3}/g, "")}${m.meetUrl ? `&location=${encodeURIComponent(m.meetUrl)}` : ""}` : null;
  return (
    <Shell company={d.company}>
      <Container className="py-12">
        <section className="pa-card p-6 text-center sm:p-10">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CalendarCheck className="h-7 w-7" /></span>
          <h1 className="mt-4 text-2xl font-bold">הפגישה נקבעה</h1>
          {m && <p className="mt-2 text-lg font-semibold">{meetingTime(m.start)}</p>}
          <p className="mt-2 text-muted-foreground">{m?.invited === "confirmed" ? "זימון ליומן נשלח אליכם ולמשתתפים." : "שלחנו אליכם אישור במייל עם זימון ליומן."}</p>
          {m?.meetUrl && <p className="mt-3"><a href={m.meetUrl} className="font-semibold text-primary underline" target="_blank" rel="noreferrer">קישור לפגישה</a></p>}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {gcal && <Button asChild variant="outline"><a href={gcal} target="_blank" rel="noreferrer"><CalendarPlus className="ms-1 h-4 w-4" />הוספה ל-Google Calendar</a></Button>}
          </div>
          <p className="mt-8 text-sm text-muted-foreground">כדאי להגיע עם דוגמאות לתהליך העבודה היום ועם אנשי המקצוע שמכירים אותו.</p>
        </section>
      </Container>
    </Shell>
  );
}
