import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileX, RefreshCw } from "lucide-react";
import Loader from "@/components/Loader";
import SignBlock from "@/components/sign/SignBlock";
import { formVersion, isBlockVisible } from "@/lib/formUtils";

export default function Sign() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const preview = params.get("preview") === "1";
  const [form, setForm] = useState(undefined);
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
  const [notice, setNotice] = useState("");
  const padRefs = useRef({}); // לוח חתימה לכל בלוק חתימה, לפי מזהה הבלוק
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => { base44.entities.Form.get(id).then(setForm).catch(() => setForm(null)); }, [id]);

  // טעינת הגרסה העדכנית (האחרונה שנשמרה) של הטופס. ערכים שכבר מולאו נשמרים לשדות שעדיין קיימים.
  // מחזיר true אם הטופס השתנה.
  const reloadLatest = async () => {
    const latest = await base44.entities.Form.get(id);
    const current = formRef.current;
    if (!latest || !current || formVersion(latest) === formVersion(current)) return false;
    setForm(latest);
    const ids = new Set((latest.blocks || []).map((b) => b.id));
    setValues((v) => Object.fromEntries(Object.entries(v).filter(([k]) => ids.has(k))));
    setMissingFields([]);
    setNotice("הטופס עודכן בזמן שהיה פתוח — מוצגת כעת הגרסה העדכנית ביותר. אנא עברו עליו לפני השליחה.");
    return true;
  };

  // כשחוזרים ללשונית — בדיקה אם נשמרה גרסה חדשה של הטופס
  useEffect(() => {
    if (preview) return;
    const onVisible = () => { if (document.visibilityState === "visible" && !done) reloadLatest().catch(() => {}); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [id, preview, done]);

  if (form === undefined) return <Loader />;
  if (!form || (!form.is_published && !preview))
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <FileX className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">הטופס אינו זמין</h1>
        <p className="text-sm text-muted-foreground">הטופס לא פורסם או שהקישור אינו תקין</p>
      </div>
    );

  const blocks = form.blocks || [];

  const submit = async (skipVersionCheck = false) => {
    setError("");
    const missing = blocks.filter((b) => b.type === "field" && b.required && !(values[b.id] || "").trim());
    if (missing.length > 0) {
      setMissingFields(missing.map((b) => b.id));
      const labels = missing.map((b) => `${b.label || "שדה"}`).join(", ");
      return setError(`יש למלא את ${missing.length} שדות החובה הבאים: ${labels}.`);
    }
    // כל בלוק חתימה מוצג מקבל חתימה משלו — בלוקים מוסתרים (תנאי / PDF בלבד) אינם נדרשים
    const sigBlocks = blocks.filter((b) => b.type === "signature" && b.display !== "pdf" && isBlockVisible(b, values));
    const unsigned = sigBlocks.filter((b) => !padRefs.current[b.id] || padRefs.current[b.id].isEmpty());
    if (unsigned.length > 0) {
      setMissingFields(unsigned.map((b) => b.id));
      return setError(unsigned.length > 1 ? `יש לחתום ב-${unsigned.length} שדות החתימה המסומנים` : "יש לחתום לפני השליחה");
    }
    setMissingFields([]);
    setBusy(true);
    try {
      const uploaded = await Promise.all(sigBlocks.map(async (b) => {
        const blob = await padRefs.current[b.id].toBlob();
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: new File([blob], `signature-${b.id}.png`, { type: "image/png" }) });
        return [b.id, file_uri];
      }));
      const signatures = Object.fromEntries(uploaded);
      // form_version — השרת מוודא שזו הגרסה העדכנית, כך שתמונת המצב שנשמרת עם החתימה
      // היא בדיוק הטופס שהוצג לחותם
      const res = await base44.functions.invoke("submitSignature", { form_id: id, field_values: values, signatures, form_version: skipVersionCheck ? undefined : formVersion(form) });
      if (res.data?.error) throw new Error(res.data.error);
      setDone(true);
    } catch (e) {
      const code = e?.response?.data?.error || e?.data?.error || e?.message || "";
      if (code === "form_changed" && !skipVersionCheck) {
        const changed = await reloadLatest().catch(() => null);
        if (changed === false) return submit(true); // הטופס המוצג הוא כבר העדכני ביותר
        setBusy(false);
        if (changed === null) setError("הטופס עודכן — טענו מחדש את העמוד ונסו שוב");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const msg =
        code === "too_many_submissions" ? "נשלחו יותר מדי חתימות לטופס זה, נסו שוב מאוחר יותר"
        : code === "form_not_published" ? "הטופס אינו זמין יותר"
        : "שגיאה בשליחת החתימה, נסו שוב";
      setError(msg);
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="paper max-w-md rounded-3xl bg-card p-10 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-3xl font-semibold">המסמך נחתם בהצלחה</h1>
          <p className="mt-2 text-sm text-muted-foreground">החתימה נקלטה במערכת בהצלחה.</p>
        </motion.div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      {preview && (
        <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between rounded-full bg-accent px-4 py-2 text-xs text-accent-foreground">
          <span>תצוגה מקדימה — כך הלקוח יראה את הטופס</span>
          <Link to={`/editor?id=${id}`} className="font-medium underline">חזרה לעריכה</Link>
        </div>
      )}
      {notice && (
        <div className="mx-auto mb-4 flex max-w-3xl items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} className="text-xs font-medium underline">הבנתי</button>
        </div>
      )}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="paper mx-auto max-w-3xl rounded-2xl bg-card px-6 py-10 sm:px-12 sm:py-14">
        <div className="space-y-6">
          {blocks.map((b) => (
            <SignBlock
              key={b.id}
              block={b}
              value={values[b.id]}
              onChange={(v) => {
                setValues((s) => ({ ...s, [b.id]: v }));
                if ((v || "").trim()) setMissingFields((m) => m.filter((mid) => mid !== b.id));
              }}
              padRef={(el) => { if (el) padRefs.current[b.id] = el; else delete padRefs.current[b.id]; }}
              allValues={values}
              invalid={missingFields.includes(b.id)}
            />
          ))}
        </div>
        {!preview && (
          <div className="mt-10 flex flex-col items-center gap-3">
            {error && <p className="text-center text-sm text-destructive">{error}</p>}
            <Button onClick={() => submit()} disabled={busy} size="lg" className="rounded-full px-10">{busy ? "שולח..." : "אישור וחתימה"}</Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}