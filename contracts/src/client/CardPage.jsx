import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api, dmy, getWithRetry, nis } from "@/sales/lib";
import { t } from "@/i18n";
import { Container, Loading, LoadFailed, Notice, Section, Shell } from "./ui.jsx";
import CardSetup from "./CardSetup.jsx";

// /card/<token>: a standing order's card page (new card, or replacing one)
export default function CardPage({ token }) {
  const [s, setS] = useState(undefined);
  const [replace, setReplace] = useState(false);
  const url = `billing/card-link?token=${encodeURIComponent(token)}`;
  const load = useCallback(() => getWithRetry(url).then((v) => { setS(v); return v; }), [url]);
  useEffect(() => { load().catch((err) => setS(err.status === 404 ? null : "failed")); }, [load]);

  if (s === undefined) return <Shell><Loading /></Shell>;
  if (s === null) return <Shell><Notice title={t("הקישור אינו פעיל")} text={t("ייתכן שהוראת הקבע הסתיימה או בוטלה. לשאלות אפשר לפנות אלינו.")} /></Shell>;
  if (s === "failed") return <Shell><LoadFailed /></Shell>;

  const periods = (s.schedule || []).map((p, i) => ({
    label: p.months ? t("{n} חודשים", { n: p.months }) : i ? t("בהמשך") : t("חודשי"),
    amount: Math.round(Number(p.amount) * (1 + s.vatRate / 100) * 100) / 100,
  }));

  return (
    <Shell company={s.company}>
      <Container className="space-y-5 py-8">
        <div>
          <p className="text-sm text-muted-foreground">{s.customer.company || s.customer.name}</p>
          <h1 className="text-2xl font-bold">{s.description}</h1>
        </div>
        {periods.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {periods.map((p, i) => (
              <span key={i} className="rounded-full bg-secondary px-3 py-1.5 text-sm"><span className="pa-num font-semibold">{nis(p.amount)}</span> {t('לחודש כולל מע"מ')}{periods.length > 1 && ` · ${p.label}`}</span>
            ))}
          </div>
        )}
        {s.card && !replace ? (
          <Section>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold">{t("כרטיס שמור")}{s.card.suffix && <> {t("המסתיים ב-")}<span className="pa-num">{s.card.suffix}</span></>}{s.card.exp && <> · {t("תוקף")} <span className="pa-num">{s.card.exp}</span></>}</p>
                {s.firstCharge && <p className="text-sm text-muted-foreground">{t("החיוב הבא:")} <span className="pa-num">{nis(s.firstCharge.amount)}</span> {t("ב-{date}", { date: dmy(s.firstCharge.date) })}</p>}
                {s.status === "paused" && <p className="text-sm text-muted-foreground">{t("הוראת הקבע מושהית כרגע.")}</p>}
                <button type="button" onClick={() => setReplace(true)} className="mt-3 text-sm font-semibold text-primary underline">{t("החלפת כרטיס")}</button>
              </div>
            </div>
          </Section>
        ) : (
          <Section title={s.card ? t("החלפת כרטיס") : t("הזנת כרטיס להוראת קבע")}>
            <CardSetup
              firstCharge={s.firstCharge}
              startKnown={Boolean(s.firstCharge)}
              includes={s.includes}
              open={() => api(url, { method: "POST", body: {} })}
              check={async () => {
                const v = await api(url);
                return Boolean(v.card && (!replace || v.cardSetAt !== s.cardSetAt));
              }}
              onDone={() => { setReplace(false); load(); }}
            />
          </Section>
        )}
      </Container>
    </Shell>
  );
}
