import React, { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, CalendarDays, CalendarPlus, Check, ChevronRight, Clock, CreditCard, FileText, Gift, Lock, MousePointerClick, Phone, PlaneTakeoff, Plus, Presentation, Ticket, UserRoundCheck, Video, X } from "lucide-react";
import { api, dayLabel, errorText, FIELD_ERRORS, fullNameOk, getWithRetry, isEmail, meetingTime, mobileIL, nis, taxIdIL, timeLabel, cleanText } from "@/sales/lib";
import { createPayment, openWidget, warmUp } from "@/sales/grow";
import { Loading, LoadFailed, Notice, Shell } from "./ui.jsx";
import { DEMO_MOCK, HOLOGRAM_SVG } from "./discoveryArt.js";
import "./discovery.css";
import { isEn, t } from "@/i18n";

// The spec request page ("ספרינט תכנון ומיפוי"), in the boarding-pass design: the sprint is a pass from
// "רעיון" to "דמו עובד", the price before discount is shown as a benefit, the client logos come right after it,
// and a sticky bar keeps the reserve button in view.

// the client logos the site shows (assets/img/clients), trimmed, served from /pay-assets/clients
const CLIENTS = [
  ["idf", t('צה"ל'), 66], ["mod", t("משרד הביטחון"), 66], ["rafael", t("רפאל"), 32], ["mafat", t('מפא"ת'), 64],
  ["tau", t("אוניברסיטת תל אביב"), 54], ["bar-ilan", t("אוניברסיטת בר-אילן"), 48], ["acb", t("התאחדות הקבלנים בוני הארץ"), 54],
  ["pekerman", t("פקרמן הנדסה ואדריכלות"), 29], ["redmark", t("רדמרק אדריכלות וניהול פרויקטים"), 39], ["aspire-home", t("אספייר הום"), 43],
  ["mydesk", "myDESK", 55],
];

const round2 = (n) => Math.round(n * 100) / 100;

// the price as the page shows it: a benefit when sales entered a higher price before discount
function priceOf(d) {
  const deal = d.listPrice > d.price;
  const fullTotal = deal ? round2(d.listPrice * (1 + d.vatRate / 100)) : d.total;
  return { deal, list: d.listPrice, price: d.price, save: deal ? round2(d.listPrice - d.price) : 0, fullTotal, discount: round2(fullTotal - d.total), total: d.total };
}

// nothing left for the client to do on the page: the meeting is set (or sales sets it) and paid (or paid outside it)
const finished = (v) => (v.booked || !v.showBooking) && (v.paid || !v.showPayment);

export default function DiscoveryPage({ token }) {
  const [d, setD] = useState(undefined);
  // view -> schedule (pick a time; it is held for the client) -> pay -> waiting (the invite goes out once the
  // payment is confirmed) -> done. A request paid without a time (marked paid by hand) goes straight to schedule.
  // Sales may take either part off the page: a meeting time they set is shown, and a payment made outside
  // the page is not asked for.
  const [stage, setStage] = useState("view"); // view | schedule | pay | waiting | done
  // d: undefined while loading, null when the link is not active (404), "failed" when the page could not load.
  // A failed reload once the page is up (the payment polling) keeps what is on screen.
  // visit=1: opening the page, which goes in the request's history (not the payment polling's reloads)
  const load = useCallback(async (visit) => {
    try {
      const v = await getWithRetry(`sales/discovery-public?token=${encodeURIComponent(token)}${visit ? "&visit=1" : ""}`);
      setD(v);
      return v;
    } catch (err) {
      setD((cur) => (err.status === 404 ? null : cur && cur !== "failed" ? cur : "failed"));
      return null;
    }
  }, [token]);

  useEffect(() => {
    // coming back from Grow's page after paying is not a new visit
    load(new URLSearchParams(window.location.search).get("paid") !== "1").then((v) => {
      if (!v) return;
      if (finished(v)) setStage("done");
      else if (v.paid && v.showBooking) setStage("schedule");
      // back from Grow's page after paying (e.g. from the Bit app): wait for the payment report
      else if (new URLSearchParams(window.location.search).get("paid") === "1") setStage("waiting");
    });
    warmUp();
  }, [load]);

  useEffect(() => { window.scrollTo(0, 0); }, [stage === "view"]);

  if (d === undefined) return <Shell><Loading /></Shell>;
  if (d === null) return <Shell><Notice title={t("הקישור אינו פעיל")} text={t("ייתכן שההצעה בוטלה או שהקישור הועתק חלקית. נשמח לשלוח קישור חדש.")} /></Shell>;
  if (d === "failed") return <Shell><LoadFailed /></Shell>;

  if (stage === "done") return <Booked d={d} />;
  const back = d.showBooking ? "schedule" : "view";
  const waiting = stage === "waiting" && (
    <WaitForPayment load={load} onBack={() => setStage(back)} onDone={(v) => setStage(finished(v) ? "done" : back)} />
  );
  if (stage !== "view" && d.showBooking) {
    return (
      <Schedule token={token} d={d} paying={stage === "pay"} onBack={() => setStage("view")} onChange={() => setStage("schedule")}
        onHeld={(v) => { setD(v); setStage("pay"); }} onBooked={(v) => { setD(v); setStage(finished(v) ? "done" : "view"); }}
        onPaid={() => setStage("waiting")}>
        {waiting}
      </Schedule>
    );
  }
  const canBook = d.showBooking && !d.booked;
  const canPay = d.showPayment && !d.paid;
  return (
    <>
      <Offer d={d} canBook={canBook} canPay={canPay} onGo={() => setStage(canBook ? "schedule" : "pay")} />
      {stage === "pay" && (
        <Sheet title={t("תשלום מאובטח")} onClose={() => setStage("view")}>
          <PayForm d={d} onPaid={() => setStage("waiting")} />
        </Sheet>
      )}
      {waiting}
    </>
  );
}

function Page({ children, bar = false }) {
  useRubik();
  return (
    <Shell header={false}>
      <div className={`dv${bar ? " has-bar" : ""}`} dir={isEn ? "ltr" : "rtl"}>{children}</div>
    </Shell>
  );
}

function TopBar({ company }) {
  return (
    <div className="top">
      <div className="wrap">
        <img src="/pay-assets/all-dark-logo.png" alt="Pro Algorithm" />
        {company?.phone && <a href={`tel:${company.phone}`}><Phone className="h-4 w-4" aria-hidden="true" /><span className="t2">{t("לשאלות:")}</span> <span className="num">{company.phone}</span></a>}
      </div>
    </div>
  );
}

const Num = ({ children }) => <span className="num">{children}</span>;
// a translated line with a number in it: "{n}" in the text is where the number goes
const tNum = (he, n) => { const [a, b = ""] = t(he).split("{n}"); return <>{a}<Num>{n}</Num>{b}</>; };

// a plane flying left: the pass reads right to left, from "רעיון" to "דמו עובד"
const PlaneLeft = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="ltr:-scale-x-100">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" transform="rotate(-90 12 12)" />
  </svg>
);

// Rubik, loaded once for this page (the other client pages keep the app's font)
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap";
function useRubik() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = FONT_HREF;
    document.head.appendChild(l);
  }, []);
}

// The ticket price's width in em at Rubik 900 with -1px tracking (measured: a digit 0.69em,
// a comma or dot 0.29em, the "₪ " prefix 1.26em), plus 4% slack, so the CSS can size it to the stub.
function priceEm(text) {
  let em = 0;
  for (const ch of text) em += /\d/.test(ch) ? 0.69 : ch === "," || ch === "." ? 0.29 : 0.63;
  return +(em * 1.04).toFixed(3);
}

function Barcode() {
  // a fixed decorative pattern
  const bars = [2, 2, 1, 2, 3, 1, 2, 1, 1, 1, 1, 3, 1, 1, 2, 1, 3, 3, 1, 2, 3, 3, 3, 2, 2, 3, 1, 2, 1, 3];
  let x = 0;
  return (
    <svg className="barcode" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((w, i) => { const r = <rect key={i} x={x} y="0" width={w} height="30" fill="#3A2418" />; x += w + 1 + (i % 3); return r; })}
    </svg>
  );
}

function Offer({ d, canBook, canPay, onGo }) {
  const p = priceOf(d);
  const who = [d.clientName, d.companyName].filter(Boolean).join(", ");
  const go = canBook ? t("שריינו את הדמו שלכם") : tNum("לתשלום {n}", nis(d.total));
  const goNote = canBook ? (canPay ? t("קודם בוחרים מועד, התשלום בסוף") : t("בוחרים מועד והזימון יוצא מיד")) : t("תשלום מאובטח בכרטיס אשראי");
  // the client's route: the sprint's stops, from today to the meeting where the demo is handed over
  // the client's route: the sprint's stops, from today to the meeting where the demo is handed over
  const stops = [
    { b: t("אתם כאן"), s: t("היום"), here: true },
    canBook ? { b: t("בחירת מועד"), s: t("מהיומן שלנו") } : d.meeting && { b: t("המועד נקבע"), s: shortDay(d.meeting.start) },
    { b: t("שיחת הכנה"), s: t("יום לפני, עם ראש הצוות") },
    { b: t("פגישה עם מומחה"), s: t("{n} דקות", { n: d.meetingMinutes }) },
    { b: t("פיתוח מערכת הדמו"), s: t("על בסיס הפגישה") },
    { b: t("מסמך אפיון מלא"), s: t("למערכת המלאה") },
    { b: t("פגישת הגשת הדמו"), s: t("הסבר על הדמו והמשך הפיתוח") },
  ].filter(Boolean);
  const steps = [
    canBook ? { icon: CalendarDays, b: t("בוחרים מועד"), s: t("מתוך המועדים הפנויים ביומן שלנו, לפי שעון ישראל.") }
      : d.meeting && { icon: CalendarDays, b: t("המועד נקבע"), s: meetingTime(d.meeting.start) },
    canPay && { icon: CreditCard, b: t("משלמים"), s: canBook ? t("בסוף, בכרטיס אשראי בחלון מאובטח. המועד שמור לכם בזמן התשלום.") : t("בכרטיס אשראי בחלון מאובטח. חשבונית מס קבלה נשלחת במייל.") },
    { icon: Video, b: t("נפגשים"), s: canBook && canPay ? t("הזימון וקישור ל-Meet יוצאים רק אחרי שהתשלום מאושר.") : t("פגישה של {n} דקות עם מומחה תוכנה. אפשר לצרף אנשי מקצוע מהצוות.", { n: d.meetingMinutes }) },
  ].filter(Boolean);
  const bar = canBook || canPay;

  return (
    <Page bar={bar}>
      <TopBar company={d.company} />
      <header className="hero">
        <div className="wrap h">
          <div>
            <p className="for"><Ticket className="h-4 w-4" aria-hidden="true" />{d.title} · {t("הוכן עבור {who}", { who })}</p>
            <h1 className="hd">{t("רואים את המערכת לפני שמפתחים אותה")}</h1>
            {d.pitch ? (
              // the key lines sales chose for this client (written with Claude from the client's problem)
              <>
                {d.pitch.headline && <p className="sub pitch-h">{d.pitch.headline}</p>}
                {d.pitch.lines?.length > 0 && (
                  <ul className="pitch">
                    {d.pitch.lines.map((l) => <li key={l}><Check className="h-5 w-5" aria-hidden="true" />{l}</li>)}
                  </ul>
                )}
              </>
            ) : <p className="sub">{t("יושבים עם מומחה תוכנה, משרטטים יחד את המסכים והתהליכים, ומקבלים דמו עובד של המערכת שלכם.")}</p>}
            {d.note && <div className="note">{d.note}{d.contacts?.sales?.name && <small>{t("{name}, איש המכירות שלכם", { name: d.contacts.sales.name })}</small>}</div>}
            {bar && <div className="cta"><button type="button" className="btn" onClick={onGo}><PlaneTakeoff className="h-5 w-5" aria-hidden="true" />{go}</button><span>{goNote}</span></div>}
          </div>
          <div>
            <div className="ticket">
              <div className="tmain">
                <div className="trow"><img src="/pay-assets/all-dark-logo.png" alt="" /><span>{t("כרטיס עלייה לפרויקט")}</span></div>
                <div className="route">
                  <div className="pt"><small>{t("מוצא")}</small><b>{t("רעיון")}</b></div>
                  <div className="mid"><span /><PlaneLeft /><span /></div>
                  <div className="pt"><small>{t("יעד")}</small><b>{t("דמו עובד")}</b></div>
                </div>
                <div className="fields">
                  <div className="f"><small>{t("על שם")}</small><b>{d.clientName}</b></div>
                  {d.companyName && <div className="f"><small>{t("חברה")}</small><b>{d.companyName}</b></div>}
                  <div className="f"><small>{t("עם")}</small><b>{t("מומחה תוכנה")}</b></div>
                  <div className="f"><small>{t("שער")}</small><b>Google Meet</b></div>
                  <div className="f"><small>{t("משך")}</small><b>{t("{n} דקות", { n: d.meetingMinutes })}</b></div>
                  <div className="f"><small>{t("מועד")}</small>{d.meeting ? <b>{shortDay(d.meeting.start)} · {timeLabel(d.meeting.start)}</b> : <span className="slotpill"><CalendarPlus className="h-4 w-4" aria-hidden="true" />{t("בחרו מועד")}</span>}</div>
                </div>
              </div>
              <div className="stub">
                <span className="notch t" /><span className="notch b" />
                <div className="sbody">
                  {p.deal ? (
                    <>
                      <span className="dealb"><Gift className="h-5 w-5" aria-hidden="true" />{t("הטבה")}</span>
                      <div className="full">{t("מחיר מלא")} <s className="num">{nis(p.list)}</s></div>
                      <div className="yours">{t("ההטבה שלכם")}</div>
                    </>
                  ) : <div className="yours">{t("המחיר")}</div>}
                  <div className="p999 num" style={{ "--em": priceEm(nis(p.price)) }}>{nis(p.price)}</div>
                  <div className="vat">{t('+ מע"מ')}</div>
                  {p.deal && <div className="svb">{tNum("חוסכים {n}", nis(p.save))}</div>}
                </div>
                <Barcode />
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="benefit" aria-label={p.deal ? t("ההטבה") : t("המחיר")}>
        <div className="wrap">
          <div className="big hd">{p.deal ? t("הטבה") : t("המחיר")}</div>
          <div className="mid">
            {p.deal && <>{t("מחיר מלא")} <s className="num">{nis(p.list)}</s><br />{t("ההטבה שלכם")}</>}
            <b className="num">{nis(p.price)} <span style={{ fontSize: 22 }}>{t('+ מע"מ')}</span></b>
          </div>
          {p.deal ? <div className="circle">{t("חוסכים")}<b className="num">{nis(p.save)}</b></div> : <div />}
          <div className="all"><span>{t("פגישה עם מומחה תוכנה, דמו עובד ומסמך אפיון מלא.")}</span><span>{tNum("כל זה ב-{n} בלבד", nis(p.price))}</span></div>
        </div>
      </section>

      <Clients />

      <section className="sec">
        <div className="wrap">
          <h2 className="h2 hd">{t("מסלול הטיסה שלכם")}</h2>
          <p className="lead">{t("מהיום ועד פגישת הגשת הדמו, ומשם להמשך הפיתוח.")}</p>
          <RouteMap stops={stops} />
          <ol className="rlist">
            {stops.map((x) => <li key={x.b} className={`rl${x.here ? " here" : ""}`}><b>{x.b}</b><small>{x.s}</small></li>)}
          </ol>
          <ol className="steps3" style={steps.length === 2 ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } : undefined}>
            {steps.map(({ icon: Icon, b, s }) => (
              <li key={b} className="s3"><Icon className="h-6 w-6" aria-hidden="true" /><div><b>{b}</b><span>{s}</span></div></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <h2 className="h2 hd">{t("מה תקבלו")}</h2>
          <p className="lead">{t("הבנה חזותית של איך המערכת תיראה, עוד לפני שמתחילים לפתח.")}</p>
          <div className="get">
            <div className="cp main">
              <span className="tg"><MousePointerClick className="h-4 w-4" aria-hidden="true" />{t("הכי חשוב")}</span>
              <h3>{t("דמו עובד של המערכת")}</h3>
              <p>{t("לוחצים, רואים ומבינים איך המערכת שלכם תעבוד, עוד לפני שמתחילים לפתח.")}</p>
              <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: DEMO_MOCK }} />
            </div>
            <div className="cp"><UserRoundCheck className="ic h-8 w-8" aria-hidden="true" /><h3>{t("פגישת איפיון עם מומחה תוכנה")}</h3><p>{t("עוברים יחד על התהליך שלכם ומחליטים מה המערכת צריכה לעשות. אפשר לצרף אנשי מקצוע מהצוות.")}</p></div>
            <div className="cp"><FileText className="ic h-8 w-8" aria-hidden="true" /><h3>{t("מסמך אפיון מלא למערכת מלאה")}</h3><p>{t("כל מה שהמערכת המלאה צריכה לעשות: מסכים, תהליכים, משתמשים ונתונים. מסמך שאפשר לפתח לפיו.")}</p></div>
            <div className="cp"><Presentation className="ic h-8 w-8" aria-hidden="true" /><h3>{t("פגישת הגשת הדמו")}</h3><p>{t("מציגים לכם את הדמו, מסבירים איך הוא עובד ומה הפתרון שאנחנו ממליצים עליו להמשך הפיתוח.")}</p></div>
          </div>
          <div className="allin"><span>{t("פגישה עם מומחה, דמו עובד, מסמך אפיון מלא ופגישת הגשה.")}</span><b>{tNum("כל זה ב-{n} בלבד", nis(p.price))} <small>{t('+ מע"מ')}</small></b></div>
        </div>
      </section>

      <section className="holo">
        <div className="wrap">
          <h2 className="hd">{t("מהתהליך של היום, לדמו שלוחצים עליו")}</h2>
          <p className="l">{t("הבנה חזותית של איך המערכת תיראה, עוד לפני שמתחילים לפתח.")}</p>
          <div className="iso" role="img" aria-label={t("התהליך של היום הופך לשרטוטים ולדמו עובד")} dangerouslySetInnerHTML={{ __html: HOLOGRAM_SVG }} />
          <div className="hcap">
            <div><b>{t("התהליך היום")}</b><span>{t("קבצים, טפסים ודוחות שאתם עובדים איתם")}</span></div>
            <div><b>{t("שרטוטים")}</b><span>{t("המסכים והדרך שבה העבודה עוברת ביניהם")}</span></div>
            <div><b>{t("דמו עובד")}</b><span>{t("לוחצים, רואים ומבינים")}</span></div>
          </div>
        </div>
      </section>

      <section className="final">
        <div className="wrap">
          <h2 className="hd">{tNum("כל זה ב-{n} בלבד", nis(p.price))}</h2>
          <p>{t('+ מע"מ')}{p.deal && <> · {t("מחיר מלא")} <s className="num">{nis(p.list)}</s> · {tNum("חוסכים {n}", nis(p.save))}</>}</p>
        </div>
      </section>
      <p className="foot">{d.company.name}{d.company.phone && <> · <Num>{d.company.phone}</Num></>} · pro-algo.com</p>

      {bar && (
        <div className="sbar">
          <div className="wrap">
            {p.deal && <span className="db"><Gift className="h-5 w-5" aria-hidden="true" />{t("הטבה")}</span>}
            <div className="pr">{p.deal && <s className="num">{nis(p.list)}</s>}<b className="num">{nis(p.price)}</b><em>{t('+ מע"מ')}</em></div>
            {p.deal && <span className="sv">{tNum("חוסכים {n}", nis(p.save))}</span>}
            <span className="perf" />
            <div className="go">
              <button type="button" className="btn" onClick={onGo}><PlaneTakeoff className="h-6 w-6" aria-hidden="true" />{go}</button>
              <small>{goNote}</small>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

// The route drawn as a dotted flight path through the stops (right to left), in a 1120x320 frame.
// The stops sit on a gentle wave; their labels alternate below and above the line so they never meet.
const RW = 1120, RH = 320;
function RouteMap({ stops }) {
  const n = stops.length;
  const pts = stops.map((_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return [1070 - t * 1020, 170 + 52 * Math.sin(t * Math.PI * 1.7 + 0.35)];
  });
  // a smooth line through the points (Catmull-Rom as cubic Bezier segments)
  let path = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] || pts[i], pts[i], pts[i + 1], pts[i + 2] || pts[i + 1]];
    path += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  const [a, b] = [pts[0], pts[1] || pts[0]];
  const plane = [a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45];
  const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return (
    <div className="rmap" aria-hidden="true">
      <svg viewBox={`0 0 ${RW} ${RH}`} preserveAspectRatio="none" className="ltr:-scale-x-100">
        <path d={path} fill="none" stroke="#6A4330" strokeWidth="4" strokeDasharray="2 12" strokeLinecap="round" />
        <g transform={`translate(${plane[0]},${plane[1]}) rotate(${angle})`}>
          <path d="M-14 0 L14 0 M2 -10 L8 0 L2 10 M-12 -5 L-9 0 L-12 5" stroke="#E0432F" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {pts.map(([x, y], i) => (i === 0
          ? <g key={i}><circle cx={x} cy={y} r="17" fill="#E0432F" opacity=".22" /><circle cx={x} cy={y} r="10" fill="#E0432F" /></g>
          : i === n - 1
            ? <g key={i}><circle cx={x} cy={y} r="21" fill="#6A4330" /><circle cx={x} cy={y} r="8" fill="#F4ECD6" /></g>
            : <circle key={i} cx={x} cy={y} r="10" fill="#F4ECD6" stroke="#6A4330" strokeWidth="5" />))}
      </svg>
      {stops.map((st, i) => {
        const [x, y] = pts[i];
        const below = i % 2 === 0;
        return (
          <div key={st.b} className={`rlab${st.here ? " here" : ""}`}
            style={{ insetInlineStart: `${((RW - x) / RW) * 100}%`, transform: isEn ? "translateX(-50%)" : "translateX(50%)", top: `${((below ? y + 30 : y - 74) / RH) * 100}%` }}>
            <b>{st.b}</b><small>{st.s}</small>
          </div>
        );
      })}
    </div>
  );
}

function Clients() {
  return (
    <section className="clients" aria-labelledby="clients-h">
      <div className="wrap">
        <h2 id="clients-h" className="hd">{t("בין לקוחותינו")}</h2>
        <p>{t("ארגונים שבוחרים לעבוד איתנו")}</p>
        <ul className="cgrid">
          {CLIENTS.map(([key, name, h]) => (
            <li key={key}><img src={`/pay-assets/clients/${key}.png`} alt={name} style={{ height: h }} loading="lazy" decoding="async" /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dv max-h-[92vh] w-full overflow-y-auto rounded-t-3xl sm:max-w-lg sm:rounded-3xl" style={{ minHeight: 0, background: "var(--tk)" }} dir={isEn ? "ltr" : "rtl"}>
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="text-xl font-black">{title}</h2>
          {onClose && <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/5" aria-label={t("סגירה")}><X className="h-5 w-5" /></button>}
        </div>
        {children}
      </div>
    </div>
  );
}

// the receipt: full price, the benefit and what is paid, all VAT included
function Receipt({ d }) {
  const p = priceOf(d);
  return (
    <div className="rc">
      {p.deal ? (
        <>
          <div className="rl2"><span>{t('{title}, מחיר מלא כולל מע"מ', { title: d.title })}</span><s className="num">{nis(p.fullTotal)}</s></div>
          <div className="rl2 disc"><span>{t("הטבה")}</span><b className="num">−{nis(p.discount)}</b></div>
        </>
      ) : <div className="rl2"><span>{d.title}</span><span className="num">{nis(d.price)} {t('+ מע"מ')}</span></div>}
      <div className="rl2 tot"><span>{t('לתשלום, כולל מע"מ')}</span><b className="num">{nis(d.total)}</b></div>
    </div>
  );
}

function PayForm({ d, onPaid }) {
  const p = d.payment;
  const [cur, setF] = useState({ fullName: p.fullName, email: p.email, phone: p.phone, taxId: p.taxId });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bad, setBad] = useState({});
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setBad((b) => ({ ...b, [k]: "" })); };

  const pay = async (e) => {
    e.preventDefault();
    setError("");
    // read the fields as they are now: browser autofill (iOS especially) can fill them without telling React
    const form = new FormData(e.currentTarget);
    const f = Object.fromEntries(["fullName", "email", "phone", "taxId"].map((k) => [k, cleanText(form.get(k) ?? cur[k])]));
    setF(f);
    // Grow refuses these without saying why, so they are checked here first
    const phone = mobileIL(f.phone);
    const taxId = taxIdIL(f.taxId);
    const errs = {
      fullName: fullNameOk(f.fullName) ? "" : FIELD_ERRORS.fullName,
      email: isEmail(f.email) ? "" : FIELD_ERRORS.email,
      phone: phone ? "" : FIELD_ERRORS.phone,
      taxId: taxId ? "" : FIELD_ERRORS.taxId,
    };
    setBad(errs);
    if (Object.values(errs).some(Boolean)) return setError(t("יש לתקן את השדות המסומנים"));
    setBusy(true);
    try {
      const here = `${window.location.origin}${window.location.pathname}`;
      const proc = await createPayment({ ...p, ...f, phone, taxId, sum: p.sum, successUrl: `${here}?paid=1`, cancelUrl: here });
      if (proc.authCode) {
        const opened = await openWidget(proc.authCode, {
          onSuccess: () => onPaid(),
          onFailure: () => { setBusy(false); setError(t("התשלום לא אושר. בדקו את פרטי הכרטיס ונסו שוב.")); },
          onClose: () => setBusy(false),
        });
        if (!opened) { setBusy(false); setError(t("לא הצלחנו לפתוח את חלון התשלום. רעננו את הדף ונסו שוב.")); }
      } else if (proc.url) {
        window.location.href = proc.url;
      } else {
        throw new Error("no_checkout");
      }
    } catch (err) {
      setBusy(false);
      // Grow's own explanation when there is one (it answers in Hebrew)
      const why = String(err?.message || "").replace(/^Grow:\s*/, "");
      setError(/[֐-׿]/.test(why) ? t("התשלום לא נפתח: {why}", { why }) : t("לא הצלחנו להתחיל את התשלום. בדקו את הפרטים ונסו שוב בעוד רגע."));
    }
  };

  const field = (k, label, props, hint) => (
    <label className="block">
      <span className="lbl">{label}</span>
      <input className="inp" name={k} value={cur[k]} onChange={set(k)} aria-invalid={Boolean(bad[k])} {...props} />
      {bad[k] ? <span className="ferr">{bad[k]}</span> : hint && <span className="hint">{hint}</span>}
    </label>
  );

  return (
    <>
      <Receipt d={d} />
      <form onSubmit={pay} className="frm" noValidate>
        {field("fullName", t("שם הלקוח לחשבונית"), { autoComplete: "organization" }, t("שם החברה, או שם פרטי ושם משפחה"))}
        {field("email", t("אימייל לחשבונית"), { type: "email", dir: "ltr", autoComplete: "email" })}
        <div className="grid grid-cols-2 gap-2.5">
          {field("phone", t("טלפון נייד"), { type: "tel", dir: "ltr", autoComplete: "tel" })}
          {field("taxId", t("ח.פ / ע.מ / ת.ז"), { inputMode: "numeric", dir: "ltr" })}
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className="btn" disabled={busy} style={{ width: "100%", marginTop: 16, fontSize: 20 }}>
          <Lock className="h-5 w-5" aria-hidden="true" />{busy ? t("פותח את חלון התשלום...") : tNum("לתשלום {n}", nis(p.sum))}
        </button>
        <p className="fine">
          {d.hold && <>{t("הזימון ליומן נשלח מיד אחרי אישור התשלום.")} </>}
          {t("הסליקה בחלון מאובטח של Grow. פרטי הכרטיס לא נשמרים אצלנו.")}
        </p>
      </form>
    </>
  );
}

// Grow confirms the payment to us through Toro a moment after the widget closes; the held time is then
// booked and the invites go out. When the time was taken meanwhile, the client picks another one.
function WaitForPayment({ load, onDone, onBack }) {
  const [late, setLate] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    let stop = false;
    const started = Date.now();
    (async function poll() {
      while (!stop) {
        const v = await load();
        if (v?.paid && !v.bookingPending) return done.current(v);
        if (Date.now() - started > 45000) setLate(true);
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
    return () => { stop = true; };
  }, [load]);
  return (
    <Sheet title={t("התשלום התקבל, רגע אחד")}>
      <div className="space-y-3 px-6 pb-7 text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#E0432F]/25 border-t-[#E0432F]" />
        <p>{t("מאשרים את התשלום מול חברת הסליקה ושולחים את הזימון ליומן.")}</p>
        {late && <p className="text-sm" style={{ color: "var(--tk-muted)" }}>{t("זה לוקח יותר מהרגיל. אפשר להשאיר את העמוד פתוח, או לחזור לאותו קישור מאוחר יותר. אחרי האישור הזימון יישלח אליכם במייל.")}</p>}
        {late && <button type="button" className="ghost" onClick={onBack}>{t("חזרה לעמוד")}</button>}
      </div>
    </Sheet>
  );
}

function Schedule({ token, d, paying, onBack, onChange, onHeld, onBooked, onPaid, children }) {
  // the free days: a couple of suggested times each, and every free time under "more times"
  const [slots, setSlots] = useState(null);
  const [shownDays, setShownDays] = useState(0);
  const [moreTimes, setMoreTimes] = useState({});   // day -> showing every free time
  const [error, setError] = useState("");
  // coming back from the payment window: the held time stays picked
  const [pick, setPick] = useState(d.hold ? { start: d.hold.start, end: d.hold.end } : null);
  const [attendees, setAttendees] = useState(d.hold?.attendees || []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const panel = useRef(null);
  const top = useRef(null);
  const go = useRef(null);
  // the button under the times is off screen on a phone (and below the fold on a laptop): once a time is
  // picked, a bar with the same button comes up from the bottom until the real one scrolls into view
  const [goSeen, setGoSeen] = useState(true);
  const payNext = d.showPayment && !d.paid;

  const loadSlots = useCallback(() => {
    setSlots(null);
    setMoreTimes({});
    api(`sales/discovery-public?token=${encodeURIComponent(token)}&slots=1`).then((r) => {
      const days = r.days || groupDays(r.slots);
      setSlots(days);
      setShownDays(Math.max(1, new Set(r.slots.map((s) => dayLabel(s.start))).size));
    }).catch((e) => { setSlots([]); setError(errorText(e)); });
  }, [token]);
  useEffect(loadSlots, [loadSlots]);
  // on a phone the payment form is below the times: bring it into view once the time is held
  useEffect(() => { if (paying) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [paying]);
  useEffect(() => {
    const el = go.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => setGoSeen(e.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [paying]);
  // an error shows in the panel: bring it into view when the bottom bar was used
  const fail = (msg) => { setError(msg); panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const addAttendee = () => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    if (!isEmail(e)) return setError(t("כתובת האימייל של המשתתף לא תקינה"));
    setError("");
    if (!attendees.includes(e)) setAttendees((a) => [...a, e]);
    setEmail("");
  };

  const book = async () => {
    setError("");
    const pending = email.trim();
    if (pending && !isEmail(pending)) return fail(t("כתובת האימייל של המשתתף לא תקינה"));
    const list = pending && !attendees.includes(pending.toLowerCase()) ? [...attendees, pending.toLowerCase()] : attendees;
    if (!d.email && !list.length) return fail(t("יש להזין אימייל לקבלת הזימון"));
    setBusy(true);
    try {
      const v = await api(`sales/discovery-public?token=${encodeURIComponent(token)}`, { method: "POST", body: { action: "hold", start: pick.start, attendees: list } });
      setBusy(false);
      setAttendees(list);
      setEmail("");
      if (v.booked) onBooked(v); else onHeld(v);
    } catch (e) {
      setBusy(false);
      if (e.code === "slot_taken") { setError(errorText(e)); setPick(null); loadSlots(); top.current?.scrollIntoView({ behavior: "smooth" }); }
      else fail(errorText(e));
    }
  };

  const choose = (s) => { setPick(s); if (paying) onChange(); };
  const days = (slots || []).slice(0, shownDays);
  const step = Math.max(2, Math.min(4, shownDays));
  const action = busy ? t("רגע...") : !pick ? t("בחרו מועד") : <>{payNext ? t("המשך לתשלום") : t("קביעת הפגישה")} · {shortDay(pick.start)} · <Num>{timeLabel(pick.start)}</Num></>;
  const stepsDone = d.paid ? ["done", "done", "here"] : paying ? ["done", "here", ""] : ["here", "", ""];

  return (
    <Page>
      <TopBar company={d.company} />
      <header className="hero sh">
        <div className="wrap h">
          <button type="button" className="back" onClick={onBack}><ChevronRight className="h-4 w-4 ltr:-scale-x-100" aria-hidden="true" />{t("לפרטי הספרינט")}</button>
          <p className="for"><Ticket className="h-4 w-4" aria-hidden="true" />{d.title} · {[d.clientName, d.companyName].filter(Boolean).join(", ")}</p>
          <h1 className="hd">{d.paid ? t("התשלום התקבל. נשאר לבחור מועד") : payNext ? t("בוחרים מועד, התשלום בסוף") : t("בוחרים מועד לפגישה")}</h1>
          {payNext || d.paid ? (
            <div className="mini" aria-hidden="true">
              <div className={`n ${stepsDone[0]}`}><i />{t("מועד")}</div><span className="ln" />
              <div className={`n ${stepsDone[1]}`}><i />{t("תשלום")}</div><span className="ln" />
              <div className={`n ${stepsDone[2]}`}><i />{t("זימון ליומן")}</div>
            </div>
          ) : null}
        </div>
      </header>

      <div className="wrap sch">
        <div className="brd" ref={top}>
          <div className="bh"><b><PlaneTakeoff className="h-5 w-5" aria-hidden="true" />{t("מועדים פנויים")}</b><span>{t("{n} דקות · שעון ישראל", { n: d.meetingMinutes })}</span></div>
          {slots === null ? <div className="empty"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#E0432F]/25 border-t-[#E0432F]" /></div>
            : slots.length === 0 ? <p className="empty">{t("כרגע אין מועדים פנויים בשבועיים הקרובים. נחזור אליכם לתאם, או התקשרו אלינו:")} <Num>{d.company.phone}</Num></p>
              : (
                <>
                  {days.map((day) => {
                    const open = moreTimes[day.day];
                    const shown = open ? day.all : day.suggested;
                    return (
                      <div key={day.day} className="dr">
                        <div><b>{weekday(day.all[0].start)}</b><small className="num">{dm(day.all[0].start)}</small></div>
                        <div className="ts">
                          {shown.map((s) => {
                            const on = pick?.start === s.start;
                            return (
                              <button key={s.start} type="button" className={`tm${on ? " on" : ""}`} onClick={() => choose(s)} aria-pressed={on}>
                                {on ? <CalendarCheck className="h-4 w-4" aria-hidden="true" /> : <Clock className="h-4 w-4" aria-hidden="true" />}<Num>{timeLabel(s.start)}</Num>
                              </button>
                            );
                          })}
                          {day.all.length > day.suggested.length && (
                            <button type="button" className="lnk" style={{ minHeight: 44 }} onClick={() => setMoreTimes((m) => ({ ...m, [day.day]: !open }))} aria-expanded={Boolean(open)}>
                              {open ? t("פחות שעות") : t("שעות נוספות")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {shownDays < slots.length && (
                    <div className="dr" style={{ gridTemplateColumns: "1fr" }}>
                      <button type="button" className="ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => setShownDays((n) => n + step)}>
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />{t("תאריכים נוספים")}
                      </button>
                    </div>
                  )}
                </>
              )}
          <div className="att">
            <b>{t("מי עוד מצטרף?")}</b>
            <p>{d.email ? <>{t("הזימון יישלח אל")} <span dir="ltr">{d.email}</span> {t("ולכל מי שתוסיפו.")}</> : t("הוסיפו את האימייל שלכם, ואם תרצו גם של אנשי מקצוע מהצוות. הזימון יישלח לכולם.")}</p>
            <div className="addrow">
              <input className="inp" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttendee(); } }} type="email" dir="ltr" placeholder="name@company.co.il" aria-label={t("אימייל של משתתף נוסף")} />
              <button type="button" className="ghost" onClick={addAttendee}><Plus className="h-4 w-4" aria-hidden="true" />{t("הוספה")}</button>
            </div>
            {attendees.length > 0 && (
              <ul className="chips">
                {attendees.map((a) => (
                  <li key={a} className="chip">{a}<button type="button" onClick={() => setAttendees((x) => x.filter((y) => y !== a))} aria-label={t("הסרת {a}", { a })}><X className="h-3.5 w-3.5" /></button></li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="pay" ref={panel}>
          <div className="ph">
            <small>{pick ? t("המועד שבחרתם") : t("המועד")}</small>
            <b>{pick ? <>{dayLabel(pick.start)} · <Num>{timeLabel(pick.start)}</Num></> : t("עוד לא נבחר")}</b>
            {paying && d.hold && (
              <span className="hold"><Clock className="h-4 w-4" aria-hidden="true" />{tNum("שמור לכם עד {n}", timeLabel(d.hold.until))} · <button type="button" className="lnk" onClick={onChange}>{t("שינוי")}</button></span>
            )}
          </div>
          {paying && d.payment ? <PayForm d={d} onPaid={onPaid} /> : (
            <>
              {payNext && <Receipt d={d} />}
              <div className="frm">
                {error && <p className="err" role="alert">{error}</p>}
                <button ref={go} type="button" className="btn" disabled={!pick || busy} onClick={book} style={{ width: "100%", marginTop: 4, fontSize: 19 }}>{action}</button>
                <p className="fine">{payNext ? t("המועד נשמר לכם לחצי שעה בזמן התשלום. הזימון ליומן יוצא רק אחרי אישור התשלום.") : t("הזימון ליומן נשלח מיד אחרי הבחירה.")}</p>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="foot">{d.company.name}{d.company.phone && <> · <Num>{d.company.phone}</Num></>}</p>
      {pick && !paying && <div className="pdock-space" aria-hidden="true" />}
      <div className={`pdock${pick && !paying && !goSeen ? " up" : ""}`} aria-hidden={!(pick && !paying && !goSeen)}>
        <div className="wrap">
          <div className="pk"><small>{t("המועד שבחרתם")}</small><b>{pick && <>{dayLabel(pick.start)} · <Num>{timeLabel(pick.start)}</Num></>}</b></div>
          <button type="button" className="btn" disabled={!pick || busy} onClick={book} tabIndex={pick && !paying && !goSeen ? 0 : -1}>
            {payNext ? <CreditCard className="h-5 w-5" aria-hidden="true" /> : <CalendarCheck className="h-5 w-5" aria-hidden="true" />}
            {busy ? t("רגע...") : payNext ? t("המשך לתשלום") : t("קביעת הפגישה")}
          </button>
        </div>
      </div>
      {children}
    </Page>
  );
}

// an older API answer (slots only) as days
function groupDays(slots = []) {
  const days = [];
  for (const s of slots) {
    const key = dayLabel(s.start);
    const day = days.find((x) => x.day === key) || (days.push({ day: key, suggested: [], all: [] }), days[days.length - 1]);
    day.suggested.push(s);
    day.all.push(s);
  }
  return days;
}

const TZ = { timeZone: "Asia/Jerusalem" };
const shortDay = (iso) => new Date(iso).toLocaleDateString("he-IL", { ...TZ, weekday: "short", day: "numeric", month: "numeric" });
const weekday = (iso) => new Date(iso).toLocaleDateString("he-IL", { ...TZ, weekday: "long" });
const dm = (iso) => new Date(iso).toLocaleDateString("he-IL", { ...TZ, day: "numeric", month: "numeric" });

function Booked({ d }) {
  const m = d.meeting;
  const gcal = m ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${d.title} · Pro Algorithm`)}&dates=${new Date(m.start).toISOString().replace(/[-:]|\.\d{3}/g, "")}/${new Date(m.end).toISOString().replace(/[-:]|\.\d{3}/g, "")}${m.meetUrl ? `&location=${encodeURIComponent(m.meetUrl)}` : ""}` : null;
  const team = [[t("ראש צוות אחראי"), d.contacts?.lead], [t("איש מכירות אחראי"), d.contacts?.sales], [t("מנהלת משרד"), d.contacts?.office]].filter(([, p]) => p?.name || p?.phone);
  return (
    <Page>
      <TopBar company={d.company} />
      <header className="hero sh">
        <div className="wrap h">
          <p className="for"><Ticket className="h-4 w-4" aria-hidden="true" />{d.title} · {[d.clientName, d.companyName].filter(Boolean).join(", ")}</p>
          <h1 className="hd">{m ? t("הפגישה נקבעה") : t("התשלום התקבל")}</h1>
          {m && <p className="sub" style={{ marginTop: 12, fontWeight: 800 }}>{meetingTime(m.start)} · {t("{n} דקות", { n: d.meetingMinutes })}</p>}
        </div>
      </header>
      <div className="wrap" style={{ paddingBottom: 60 }}>
        <section className="done-card">
          <p>{!m ? t("ניצור איתכם קשר לתיאום מועד הפגישה.") : m.invited === "manual" ? t("זה המועד שתיאמנו איתכם. אפשר להוסיף אותו ליומן.") : m.invited === "confirmed" ? t("זימון ליומן נשלח אליכם ולמשתתפים.") : t("שלחנו אליכם אישור במייל עם זימון ליומן.")}</p>
          {(m?.meetUrl || gcal) && (
            <div className="mt-4 flex flex-wrap gap-3">
              {m?.meetUrl && <a className="btn" href={m.meetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 17, padding: "12px 22px" }}><Video className="h-5 w-5" aria-hidden="true" />{t("קישור לפגישה")}</a>}
              {gcal && <a className="ghost" href={gcal} target="_blank" rel="noreferrer"><CalendarPlus className="h-4 w-4" aria-hidden="true" />{t("הוספה ל-Google Calendar")}</a>}
            </div>
          )}
          <h2 className="hd" style={{ fontSize: 24, marginTop: 28 }}>{t("עד הפגישה")}</h2>
          <ol className="prep">
            <li><span className="k">1</span><div><b>{t("שיחה יום לפני")}</b><p>{d.contacts?.lead?.name
              ? t("יום לפני הפגישה, {name}, ראש הצוות שלכם, יתקשר אליכם לשיחה קצרה. נחדד יחד את הפרטים ונוודא שהמטרה של האיפיון מוגדרת.", { name: d.contacts.lead.name })
              : t("יום לפני הפגישה ראש הצוות שלכם יתקשר אליכם לשיחה קצרה. נחדד יחד את הפרטים ונוודא שהמטרה של האיפיון מוגדרת.")}</p></div></li>
            <li><span className="k">2</span><div><b>{t("דוגמאות מהעבודה היום")}</b><p>{t("קבצים, טפסים, צילומי מסך או דוחות שאתם עובדים איתם.")}</p></div></li>
            <li><span className="k">3</span><div><b>{t("מטרה אחת ממוקדת")}</b><p>{t("הדבר שהכי חשוב לכם שהמערכת תפתור.")}</p></div></li>
          </ol>
          {team.length > 0 && (
            <>
              <h2 className="hd" style={{ fontSize: 20, marginTop: 20 }}>{t("הצוות שלכם")}</h2>
              <div className="team">
                {team.map(([role, p]) => (
                  <div key={role}><small>{role}</small>{p.name && <b>{p.name}</b>}{p.phone && <a href={`tel:${p.phone}`} className="num">{p.phone}</a>}</div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </Page>
  );
}
