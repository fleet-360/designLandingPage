import React, { useEffect, useRef, useState } from "react";
import { CreditCard, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dmy, errorText, nis } from "@/sales/lib";
import { openWidget, warmUp } from "@/sales/grow";
import { ErrorLine } from "./ui.jsx";

// Saving a card for the standing order. Grow keeps the card; we only get a token back (through
// Toro), so after the widget closes we wait until the server shows the card as saved.
// open(): asks the server to open Grow's card page -> { authCode, url }
// check(): reloads and returns true once the card is saved
export default function CardSetup({ firstCharge, startKnown, includes, open, check, onDone, onSkip }) {
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const stop = useRef(false);

  useEffect(() => { warmUp(); return () => { stop.current = true; }; }, []);

  const wait = async () => {
    setWaiting(true);
    const started = Date.now();
    while (!stop.current && Date.now() - started < 60000) {
      if (await check().catch(() => false)) { setWaiting(false); return onDone?.(); }
      await new Promise((r) => setTimeout(r, 2500));
    }
    setWaiting(false);
    setBusy(false);
    setError("לא קיבלנו עדיין אישור על שמירת הכרטיס. אם הזנתם את הפרטים, רעננו את הדף בעוד דקה.");
  };

  const start = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await open();
      if (r.authCode) {
        const ok = await openWidget(r.authCode, {
          onSuccess: () => wait(),
          onFailure: () => { setBusy(false); setError("הכרטיס לא אושר. בדקו את הפרטים ונסו שוב."); },
          onClose: () => setBusy(false),
        });
        if (!ok) { setBusy(false); setError("לא הצלחנו לפתוח את חלון התשלום המאובטח. רעננו את הדף ונסו שוב."); }
      } else if (r.url) {
        window.location.href = r.url;
      } else {
        throw new Error("no_page");
      }
    } catch (e) {
      setBusy(false);
      // Grow's own reason when it refused to open the card page (for example a phone number it does not accept)
      setError(e?.data?.reason ? `דף הכרטיס לא נפתח: ${e.data.reason}` : errorText(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-secondary p-4">
        {firstCharge ? (
          <>
            <p className="text-sm text-muted-foreground">החיוב הראשון</p>
            <p className="text-xl font-bold"><span className="pa-num">{nis(firstCharge.amount)}</span> <span className="text-sm font-medium text-muted-foreground">כולל מע"מ</span></p>
            <p className="text-sm">{startKnown ? `ב-${dmy(firstCharge.date)}` : "בסיום החודשים הכלולים במחיר הפרויקט. נעדכן אתכם במייל לפני החיוב הראשון."}</p>
          </>
        ) : (
          <p className="text-sm">החיוב מתחיל רק בתום החודשים הכלולים במחיר הפרויקט. נעדכן אתכם במייל לפני החיוב הראשון.</p>
        )}
      </div>
      {includes?.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">השירות החודשי כולל</p>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {includes.map((x) => <li key={x} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{x}</li>)}
          </ul>
        </div>
      )}
      <ul className="space-y-1 text-sm text-muted-foreground">
        <li>· אין חיוב היום. הכרטיס נשמר אצל חברת הסליקה לחיובים החודשיים בלבד.</li>
        <li>· חשבונית מס קבלה נשלחת במייל אחרי כל חיוב.</li>
        <li>· אפשר להחליף כרטיס בכל עת דרך הקישור שבמייל.</li>
      </ul>
      <ErrorLine error={error} />
      <Button size="lg" onClick={start} disabled={busy} className="h-12 w-full rounded-xl text-base font-bold">
        {waiting ? "שומרים את הכרטיס..." : busy ? "פותח חלון מאובטח..." : <><CreditCard className="ms-2 h-5 w-5" />הזנת כרטיס אשראי</>}
      </Button>
      <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" />הזנת הכרטיס מתבצעת בחלון מאובטח של Grow. פרטי הכרטיס לא עוברים דרכנו.</p>
      {onSkip && !busy && <button type="button" onClick={onSkip} className="mx-auto block text-sm text-muted-foreground underline">אעשה את זה מאוחר יותר</button>}
    </div>
  );
}
