/** buildalgo.co.il demo chrome: slim site strip (back to the gallery + contact), first-visit hint, analytics events. */
import { useEffect, useState } from 'react';
import { useStore, type Project } from '../store';
import './demo.css';

const SLUG = 'kitchens';
const HINT_KEY = 'pa-demo-kitchens-hint-v1';

type Fn = (...args: unknown[]) => void;
function track(event: string, params: Record<string, unknown> = {}) {
  try { (window as unknown as { gtag?: Fn }).gtag?.('event', event, { demo: SLUG, ...params }); } catch { /* blocked */ }
}

const unitCount = (p: Project) => p.runs.reduce((n, r) => n + r.units.length, 0);

function hintSeen(): boolean {
  try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
}

export function DemoChrome() {
  const [hint, setHint] = useState(() => !hintSeen());

  const closeHint = () => {
    setHint(false);
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode */ }
  };

  useEffect(() => {
    if (!hint) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeHint(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hint]);

  // key actions -> GA4 (each once per visit), same event names as the other demos on the site
  useEffect(() => {
    track('demo_start');
    const done = new Set<string>();
    const once = (action: string) => { if (!done.has(action)) { done.add(action); track('demo_action', { action }); } };
    const onPrint = () => once('print_pdf');
    window.addEventListener('beforeprint', onPrint);
    const unsub = useStore.subscribe((s, prev) => {
      if (s.view !== prev.view) {
        once(`view_${s.view}`);
        if (s.view === 'presentation' && !done.has('complete')) {
          done.add('complete');
          track('demo_complete');
          try { (window as unknown as { fbq?: Fn }).fbq?.('trackCustom', 'DemoComplete', { demo: SLUG }); } catch { /* blocked */ }
        }
      }
      if (s.project !== prev.project) {
        const a = unitCount(s.project), b = unitCount(prev.project);
        if (a > b) once('add_unit');
        else if (a < b) once('remove_unit');
        if (JSON.stringify(s.project.finishes) !== JSON.stringify(prev.project.finishes)) once('change_finish');
      }
    });
    return () => { unsub(); window.removeEventListener('beforeprint', onPrint); };
  }, []);

  return (
    <>
      <div className="demo-bar no-print">
        <a className="demo-back" href="/catalog/"><span aria-hidden="true">→</span> כל הדוגמאות</a>
        <span className="demo-title">סטודיו מטבחים · דמו אינטראקטיבי</span>
        <button type="button" className="demo-help" onClick={() => setHint(true)} aria-label="מה אפשר לנסות כאן" title="מה אפשר לנסות כאן">?</button>
        <a className="demo-cta" href={`/Contact?from=demo-${SLUG}`} onClick={() => track('demo_cta', { place: 'top' })}>דברו איתנו על מערכת כזו</a>
      </div>
      {hint && (
        <div className="demo-hint no-print" onClick={closeHint}>
          <div className="demo-hint-card" role="dialog" aria-modal="true" aria-labelledby="demo-hint-title" onClick={(e) => e.stopPropagation()}>
            <div className="demo-hint-tag">דמו אינטראקטיבי</div>
            <h2 id="demo-hint-title">סטודיו מטבחים על קטלוג יצרן אמיתי</h2>
            <p>מתכננים מטבח מתוך אלפי יחידות אמיתיות, והתוכנית, התלת־ממד, החזיתות והמצגת ללקוח מתעדכנים יחד. נסו:</p>
            <ol>
              <li><b>הוסיפו יחידה מהקטלוג.</b> היא נכנסת לקיר שמופיע תחת "מוסיף אל".</li>
              <li><b>גררו יחידה בתוכנית</b> כדי להזיז אותה. העיגול והריבוע שעל היחידה מסובבים ומשנים גודל.</li>
              <li><b>עברו לתלת־ממד</b>, סובבו את החדר ופתחו דלתות ומגירות עם הסליידר.</li>
              <li><b>פתחו את המצגת ללקוח.</b> כל העמודים נבנים לבד ומוכנים להדפסה כ־PDF.</li>
            </ol>
            <button type="button" className="demo-hint-go" onClick={closeHint} autoFocus>להתחיל</button>
            <div className="demo-hint-note">השינויים נשמרים בדפדפן שלכם. "איפוס" מחזיר למטבח הדוגמה.</div>
          </div>
        </div>
      )}
    </>
  );
}
