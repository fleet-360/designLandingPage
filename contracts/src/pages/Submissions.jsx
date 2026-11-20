import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Search, FileSpreadsheet, Share2, Users } from "lucide-react";
import Loader from "@/components/Loader";
import SubmissionRow from "@/components/submissions/SubmissionRow";
import SubmissionCard from "@/components/submissions/SubmissionCard";
import SubmissionDialog from "@/components/submissions/SubmissionDialog";
import { fmtDate } from "@/lib/formUtils";

const FIELD_COL_MIN = 160;

const fieldLabel = (f) => (f.label || "").trim() || "שדה";
const versionFields = (blocks) => (blocks || []).filter((b) => b.type === "field" && b.id);

// בניית עמודות הטבלה מכל גרסאות הטופס: הגרסה הנוכחית ואחריה תמונות המצב של השליחות (מהחדשה לישנה).
// שדה מזוהה לפי ה-id שלו יחד עם התווית שלו — שדה ששמו שונה נחשב שדה חדש ומקבל עמודה משלו.
// שדות שונים עם אותה תווית שמעולם לא הופיעו יחד באותה גרסה (למשל שדה שנמחק ונוצר מחדש) מאוחדים לעמודה אחת.
function collectFieldColumns(form, subs) {
  const columns = [];
  const seen = new Set();
  const versions = [form.blocks || [], ...subs.map((s) => s.form_snapshot?.blocks).filter(Boolean)];
  versions.forEach((blocks) => {
    const fields = versionFields(blocks);
    const versionIds = new Set(fields.map((f) => f.id));
    fields.forEach((f) => {
      const label = fieldLabel(f);
      const key = `${f.id}::${label}`;
      if (seen.has(key)) return;
      seen.add(key);
      const col = columns.find((c) => c.label === label && !c.ids.some((x) => versionIds.has(x)));
      if (col) col.ids.push(f.id);
      else columns.push({ key, label, ids: [f.id] });
    });
  });
  return columns;
}

export default function Submissions() {
  const id = new URLSearchParams(window.location.search).get("id");
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (id) base44.entities.Form.get(id).then(setForm).catch(() => setForm(null)); }, [id]);
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["submissions", id],
    queryFn: () => base44.entities.Submission.filter({ form_id: id }, "-created_date", 1000),
    enabled: !!id,
  });
  if (!id) return <div className="py-20 text-center text-muted-foreground">לא נבחר טופס — חזרו לרשימה ובחרו טופס לצפייה בתוצאות.</div>;
  if (form === null) return <div className="py-20 text-center text-muted-foreground">הטופס לא נמצא.</div>;
  if (!form) return <Loader />;

  const allFields = collectFieldColumns(form, subs);

  // תוויות השדות בגרסה שבה נשלחה כל שליחה (שליחות ישנות ללא תמונת מצב — לפי הטופס הנוכחי)
  const subLabels = new Map(
    subs.map((s) => [s.id, new Map(versionFields(s.form_snapshot?.blocks || form.blocks).map((f) => [f.id, fieldLabel(f)]))])
  );

  // ערך השדה בשליחה — רק אם בגרסה של השליחה השדה הופיע עם אותה תווית כמו העמודה
  const getValue = (sub, col) => {
    const labels = subLabels.get(sub.id);
    for (const fid of col.ids) {
      if (labels?.get(fid) !== col.label) continue;
      const v = sub.field_values?.[fid];
      if (v) return v;
    }
    return "";
  };

  const remove = (s) =>
    base44.entities.Submission.delete(s.id).then(() => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      setForm((prev) => (prev ? { ...prev, submission_count: Math.max(0, (prev.submission_count || 0) - 1) } : prev));
      base44.entities.Form.update(id, { submission_count: Math.max(0, (form?.submission_count || 0) - 1) }).catch(() => {});
    });
  const filtered = subs.filter((s) => {
    const matchesText = !q || allFields.some((f) => (getValue(s, f) || "").toLowerCase().includes(q.toLowerCase()));
    return matchesText;
  });

  // ייצוא לאקסל — כל השדות מכל גרסאות הטופס
  const exportCsv = () => {
    const headers = [...allFields.map((f) => f.label || "שדה"), "סטטוס", "תאריך מילוי"];
    const rows = [headers, ...filtered.map((s) => [...allFields.map((f) => getValue(s, f)), "SIGNED", fmtDate(s.created_date)])];
    const csv = "\uFEFF" + rows.map((r) => r.map((v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${form.title}.csv`;
    a.click();
  };

  // עמודות השדות גמישות אך לא צרות מ-FIELD_COL_MIN; כשאין מספיק מקום הטבלה נגללת אופקית
  const gridTemplateColumns = `${allFields.length ? `repeat(${allFields.length}, minmax(${FIELD_COL_MIN}px, 1fr)) ` : ""}80px 140px 76px`;
  const tableMinWidth = allFields.length * FIELD_COL_MIN + 80 + 140 + 76 + (allFields.length + 2) * 12 + 40;

  return (
    <div className="space-y-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />חזרה למסך הטפסים שלי</Link>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">תוצאות מילוי · {form.title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subs.length} חתימות נקלטו</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש חותם..." className="w-56 rounded-full bg-card pr-9" />
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length} className="gap-2 rounded-full"><FileSpreadsheet className="h-4 w-4" />ייצוא לאקסל</Button>
          <Button asChild className="gap-2 rounded-full"><Link to={`/share?id=${id}`}><Share2 className="h-4 w-4" />שליחת קישור למילוי</Link></Button>
        </div>
      </div>

      {isLoading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-muted-foreground"><Users className="h-5 w-5" /></span>
          <p className="font-medium">עדיין אין חתימות</p>
          <p className="text-sm text-muted-foreground">שתפו את הקישור עם הלקוחות כדי להתחיל לקבל חתימות</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto pb-3 md:block">
            <div style={{ minWidth: tableMinWidth }}>
              <div className="grid items-center gap-3 px-5 pb-2 text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns }}>
                {allFields.map((f) => <span key={f.key} className="truncate" title={f.label}>{f.label}</span>)}
                <span>סטטוס</span>
                <span>תאריך מילוי</span>
                <span />
              </div>
              <div className="space-y-2">{filtered.map((s) => <SubmissionRow key={s.id} sub={s} fields={allFields} gridTemplateColumns={gridTemplateColumns} getValue={getValue} onDelete={remove} onView={(sub) => setSelected(sub)} />)}</div>
            </div>
          </div>
          <div className="space-y-3 md:hidden">{filtered.map((s) => <SubmissionCard key={s.id} sub={s} fields={allFields} getValue={getValue} onDelete={remove} onView={(sub) => setSelected(sub)} />)}</div>
        </>
      )}
      <SubmissionDialog form={form} submission={selected} onClose={() => setSelected(null)} />
    </div>
  );
}