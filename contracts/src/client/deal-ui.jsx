import React from "react";
import { Banknote, Check, Code2, CreditCard, HeartHandshake, Headset, LifeBuoy, MapPin, Rocket, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { dmy, nis } from "@/sales/lib";
import { t } from "@/i18n";
import { Container } from "./ui.jsx";

// The deal page's selling parts: the hero, the road from the spec to the monthly service, and how to pay.
// Mint, cream, coffee and tomato, like the spec request page (discovery.css).

const INK = "#3A2418";

// soft wavy lines in the background of the cream bands
function Waves({ className = "", stroke = "#E3D6B8" }) {
  const lines = Array.from({ length: 9 }, (_, i) => {
    const y = 30 + i * 70;
    return `M -50 ${y} C 250 ${y - 40}, 450 ${y + 40}, 750 ${y} S 1250 ${y - 30}, 1450 ${y}`;
  });
  return (
    <svg className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} viewBox="0 0 1400 640" preserveAspectRatio="none" aria-hidden="true">
      {lines.map((d) => <path key={d} d={d} fill="none" stroke={stroke} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

export function DealHero({ order, pitch }) {
  const o = order;
  const included = o.service?.enabled ? o.service.rows?.find((r) => !r.price) : null;
  const facts = [
    t("מחיר קבוע לכל מה שבאפיון"),
    o.project.targetWeeks ? t("כ-{n} שבועות פיתוח", { n: o.project.targetWeeks }) : null,
    included ? t("ליווי ותחזוקה כלולים {when}", { when: included.when }) : null,
  ].filter(Boolean);
  return (
    <header className="pa-mint relative overflow-hidden">
      <Waves stroke="#86C9B0" />
      <Container className="relative py-10 sm:py-16">
        <p className="flex items-center gap-1.5 text-sm font-medium text-[#4F3324]">
          <MapPin className="h-4 w-4" />{t("הזמנת עבודה מס'")} <span className="pa-num">{o.number}</span> · {t("הוכנה עבור {name}", { name: o.client.companyName || o.client.signerName })}
        </p>
        <h1 className="mt-4 text-[44px] font-black leading-[1.02] sm:text-7xl" style={{ color: INK }}>
          {t("מוכנים לעשות")}<br />{t("היסטוריה?")}
        </h1>
        <p className="mt-6 text-xl font-extrabold text-[#C2311E] sm:text-2xl">{o.project.name}</p>
        {pitch ? (
          // the key lines sales chose for this client (written with Claude from the client's problem)
          <div className="mt-3 max-w-2xl">
            {pitch.headline && <p className="text-[22px] font-extrabold leading-snug sm:text-2xl" style={{ color: INK }}>{pitch.headline}</p>}
            {pitch.lines.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {pitch.lines.map((l) => <li key={l} className="flex gap-2.5 text-[17px] leading-relaxed text-[#4F3324]"><Check className="mt-1 h-5 w-5 shrink-0 text-[#E0432F]" aria-hidden="true" />{l}</li>)}
              </ul>
            )}
          </div>
        ) : o.project.summary && <p className="mt-2 max-w-2xl whitespace-pre-line text-[17px] leading-relaxed text-[#4F3324]">{o.project.summary}</p>}
        <ul className="mt-6 flex flex-wrap gap-2">
          {facts.map((f) => (
            <li key={f} className="flex items-center gap-1.5 rounded-full border border-[#DCCFB0] bg-white/70 px-3 py-1.5 text-sm font-medium" style={{ color: INK }}>
              <Check className="h-4 w-4 text-[#6A4330]" />{f}
            </li>
          ))}
        </ul>
      </Container>
    </header>
  );
}

// ---- the road ----

// the stops from the spec to the service, from what the order holds. A road map only: what happens and
// when, no prices (they are in the price card and the payment schedule below)
function roadStops(o) {
  const stops = [
    { t: t("איפיון"), s: t("הושלם"), state: "done" },
    { t: t("דמו"), s: t("הושלם"), state: "done" },
    { t: t("אתם כאן"), s: t("אישור וחתימה"), state: "here" },
    { t: t("פיתוח"), s: o.project.targetWeeks ? t("כ-{n} שבועות", { n: o.project.targetWeeks }) : t("מתחיל עם המקדמה"), icon: Code2 },
    { t: t("עולים לאוויר"), s: t("החיסכון מתחיל"), s2: t("נהנים מהערך בחברה"), state: "value", icon: TrendingUp },
  ];
  if (o.service?.enabled) {
    let paid = 0;
    for (const r of o.service.rows || []) {
      if (!r.price) stops.push({ t: t("ליווי צמוד"), s: t("אחרי העלייה לאוויר"), s2: r.when, icon: Headset });
      else {
        stops.push({
          t: paid === 0 ? t("תמיכה ותחזוקה") : t("תמיכה שוטפת"),
          s: paid === 0 ? t("צוות שמכיר את המערכת שלכם") : t("ממשיכים לשפר ולתחזק"),
          s2: r.when,
          icon: paid === 0 ? LifeBuoy : HeartHandshake,
        });
        paid++;
      }
    }
  } else {
    stops.push({ t: t("המערכת אצלכם"), s: t("בשימוש יומיומי"), icon: Rocket });
  }
  return stops;
}

// a smooth line through the points (Catmull-Rom as cubic Béziers)
function smooth(pts) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function Node({ stop }) {
  const Icon = stop.icon;
  if (stop.state === "done") {
    return <span className="grid h-10 w-10 place-items-center rounded-full border-[5px] border-[#6A4330] bg-[#6A4330] text-white shadow-sm"><Check className="h-4 w-4" strokeWidth={3} /></span>;
  }
  if (stop.state === "here") {
    return (
      <span className="relative grid h-10 w-10 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#E0432F]/30" />
        <span className="relative h-10 w-10 rounded-full border-[6px] border-[#E0432F] bg-white shadow-sm" />
      </span>
    );
  }
  if (stop.state === "value") {
    return <span className="grid h-10 w-10 place-items-center rounded-full border-[5px] border-emerald-600 bg-emerald-500 text-white shadow-sm">{Icon && <Icon className="h-4 w-4" strokeWidth={2.5} />}</span>;
  }
  return <span className="grid h-10 w-10 place-items-center rounded-full border-[5px] border-[#6A4330] bg-white text-[#6A4330] shadow-sm">{Icon && <Icon className="h-4 w-4" strokeWidth={2.5} />}</span>;
}

function Label({ stop, className = "", style }) {
  const here = stop.state === "here";
  return (
    <div className={className} style={style}>
      <p className={`text-[15px] font-extrabold leading-tight ${here ? "text-[#E0432F]" : ""}`} style={here ? undefined : { color: INK }}>{stop.t}</p>
      <p className={`mt-0.5 text-[13px] leading-snug ${stop.state === "value" ? "font-semibold text-emerald-700" : stop.s.includes("₪") ? "font-bold text-[#6A4330]" : "text-[#6A4330]"}`}>{stop.s}</p>
      {stop.s2 && <p className="text-[12px] leading-snug text-[#6A4330]">{stop.s2}</p>}
      {stop.drop && <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-700"><TrendingDown className="h-3 w-3" />{t("המחיר יורד")}</p>}
    </div>
  );
}

// wide screens: the road runs from the start side (right in Hebrew, left in English) over a gentle wave,
// labels above the low stops and below the high ones
function RoadWide({ stops }) {
  const H = 360;
  const n = stops.length;
  const pad = 5;                                     // % from each side
  const step = (100 - 2 * pad) / (n - 1);
  const pts = stops.map((_, i) => {
    const x = 100 - pad - i * step;
    const y = H * 0.5 + H * 0.2 * Math.sin((i / (n - 1)) * Math.PI * 1.6 + 0.5);
    return [x, y];
  });
  const mid = H * 0.5;
  return (
    <div className="relative hidden md:block" style={{ height: H }}>
      <svg className="absolute inset-0 h-full w-full ltr:-scale-x-100" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={smooth(pts.map(([x, y]) => [x, y]))} fill="none" stroke="#6A4330" strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {stops.map((s, i) => {
        const [x, y] = pts[i];
        const above = y >= mid;
        return (
          <React.Fragment key={s.t + i}>
            <div className="absolute -translate-y-1/2 translate-x-1/2 ltr:-translate-x-1/2" style={{ insetInlineStart: `${100 - x}%`, top: y }}><Node stop={s} /></div>
            <Label stop={s} className="absolute translate-x-1/2 text-center ltr:-translate-x-1/2" style={{
              insetInlineStart: `${100 - x}%`, width: `${Math.min(step * 0.98, 16)}%`, minWidth: 92,
              ...(above ? { bottom: H - y + 28 } : { top: y + 28 }),
            }} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

// phones: the road runs down the start side, labels beside it
function RoadTall({ stops }) {
  const R = 92;                                      // px per stop
  const H = stops.length * R;
  const pts = stops.map((_, i) => [86 + 6 * Math.sin(i * 1.1 + 0.4), R / 2 + i * R]);
  return (
    <div className="relative md:hidden" style={{ height: H }}>
      <svg className="absolute inset-0 h-full w-full ltr:-scale-x-100" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={smooth(pts)} fill="none" stroke="#6A4330" strokeWidth="7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {stops.map((s, i) => {
        const [x, y] = pts[i];
        return (
          <React.Fragment key={s.t + i}>
            <div className="absolute -translate-y-1/2 translate-x-1/2 ltr:-translate-x-1/2" style={{ insetInlineStart: `${100 - x}%`, top: y }}><Node stop={s} /></div>
            <Label stop={s} className="absolute -translate-y-1/2" style={{ insetInlineStart: "30%", insetInlineEnd: 0, top: y }} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function JourneyRoad({ order, note }) {
  const stops = roadStops(order);
  const includes = order.service?.enabled ? order.service.includes || [] : [];
  return (
    <section className="pa-cream relative overflow-hidden py-10 sm:py-14">
      <Waves />
      <div className="relative mx-auto max-w-5xl px-4">
        <h2 className="text-3xl font-black sm:text-4xl" style={{ color: INK }}>{t("הדרך מכאן")}</h2>
        <p className="mt-2 max-w-2xl text-[17px] text-[#4F3324]">
          {t("האיפיון והדמו כבר מאחורינו. עכשיו מפתחים, עולים לאוויר, ואנחנו נשארים איתכם גם אחרי: צוות שמכיר את המערכת שלכם עונה, מתקן ומשפר.")}
        </p>
        <div className="mt-8"><RoadWide stops={stops} /><RoadTall stops={stops} /></div>
        {includes.length > 0 && (
          <div className="mt-6 rounded-2xl border border-[#E3D6B8] bg-white/80 p-4">
            <p className="flex items-center gap-2 text-sm font-bold" style={{ color: INK }}><Headset className="h-4 w-4 text-[#6A4330]" />{t("מה כולל השירות החודשי")}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {includes.map((x) => <li key={x} className="rounded-full bg-[#F4ECD6] px-2.5 py-1 text-[13px]" style={{ color: INK }}>{x}</li>)}
            </ul>
            {note && <p className="mt-3 text-sm text-[#4F3324]">{note}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

// ---- how to pay ----

export function PayHow({ order }) {
  const p = order.payInfo;
  if (!p) {
    // orders frozen before each payment had its own method
    return <p className="mt-3 text-sm text-muted-foreground">{t("אמצעי תשלום היתרה:")} {order.balanceMethod === "checks" ? t("שיקים דחויים") : t("העברה בנקאית")}.</p>;
  }
  const checks = order.schedule.rows.filter((r) => r.method === "check");
  const b = p.transfer;
  return (
    <div className="mt-4 space-y-3">
      {p.checks && checks.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <p className="text-[15px] font-bold text-amber-950">{t("חשוב: נא להכין את השיקים מראש")}</p>
          <p className="mt-1 text-sm text-amber-950/90">
            {checks.length === 1 ? t("שיק אחד") : t("{n} שיקים", { n: checks.length })} {t("לפקודת {payee}. כל שיק על הסכום", { payee: p.checks.payee })} <strong>{t('כולל מע"מ')}</strong> {t("ובתאריך שלו:")}
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {checks.map((r) => (
              <li key={r.n} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span className="pa-num text-muted-foreground">{dmy(r.date)}</span>
                <span className="pa-num font-bold">{nis(r.total)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 text-sm font-medium text-amber-950">
            <Truck className="mt-0.5 h-4 w-4 shrink-0" />
            {p.checks.pickupDate
              ? <span>{t("שליח מטעמנו יגיע לאסוף את השיקים ב-")}<span className="pa-num">{dmy(p.checks.pickupDate)}</span>{t(". כדאי שיהיו מוכנים עד אז.")}</span>
              : <span>{t("שליח מטעמנו יאסוף את השיקים. נתאם איתכם מועד בתוך {days} ימי עסקים מהחתימה.", { days: p.checks.pickupDays })}</span>}
          </p>
        </div>
      )}
      {b && (
        <div className="flex gap-3 rounded-2xl border border-border p-4 text-sm">
          <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-bold">{t("העברה בנקאית")}</p>
            <p className="text-muted-foreground">{t("מוטב:")} {b.beneficiary}{b.bank && ` · ${t("בנק {bank}", { bank: b.bank })}`}{b.branch && ` · ${t("סניף {branch}", { branch: b.branch })}`}{b.account && <> · {t("חשבון")} <span className="pa-num">{b.account}</span></>}</p>
            <p className="text-muted-foreground">{t("אסמכתה: הזמנה מס'")} <span className="pa-num">{order.number}</span>{t(". הסכום צריך להגיע עד התאריך שבטבלה.")}</p>
          </div>
        </div>
      )}
      {p.card && (
        <div className="flex gap-3 rounded-2xl border border-border p-4 text-sm">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div><p className="font-bold">{t("כרטיס אשראי")}</p><p className="text-muted-foreground">{t("לקראת מועד התשלום נשלח אליכם קישור מאובטח לתשלום בכרטיס.")}</p></div>
        </div>
      )}
    </div>
  );
}
