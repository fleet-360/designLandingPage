import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText } from "lucide-react";
import FormRow from "@/components/forms/FormRow";
import FormCard from "@/components/forms/FormCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import Loader from "@/components/Loader";
import { defaultForm } from "@/lib/formUtils";

export default function Home() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const { data: forms = [], isLoading } = useQuery({ queryKey: ["forms"], queryFn: () => base44.entities.Form.filter({ created_by_id: user.id }, "-created_date") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["forms"] });

  const create = async () => {
    setCreating(true);
    const f = await base44.entities.Form.create(defaultForm());
    refresh();
    navigate(`/editor?id=${f.id}`);
  };
  const publish = (f, v) =>
    base44.entities.Form.update(f.id, { is_published: v, published_date: v ? new Date().toISOString() : f.published_date }).then(refresh);
  const duplicate = (f) =>
    base44.entities.Form.create({ title: `${f.title} - עותק`, blocks: f.blocks, is_published: false, submission_count: 0 }).then(refresh);
  const remove = (f) => base44.entities.Form.delete(f.id).then(refresh);

  // אישור לפני מחיקה או שינוי סטטוס פרסום
  const confirmPublish = (f, v) => setConfirm({
    title: v ? "פרסום טופס?" : "העברה לטיוטה?",
    description: v
      ? `האם אתה בטוח שברצונך לפרסם את „${f.title}"?`
      : `האם אתה בטוח שברצונך להעביר את „${f.title}" לטיוטה?`,
    actions: [
      { label: "ביטול", variant: "outline", onClick: () => setConfirm(null) },
      { label: "אישור", variant: "default", onClick: () => { publish(f, v); setConfirm(null); } },
    ],
  });
  const confirmDelete = (f) => setConfirm({
    title: "מחיקת טופס?",
    description: `האם אתה בטוח שברצונך למחוק את „${f.title}"? פעולה זו אינה הפיכה וכל החתימות שנאספו יימחקו גם הן.`,
    actions: [
      { label: "ביטול", variant: "outline", onClick: () => setConfirm(null) },
      { label: "מחיקה", variant: "destructive", onClick: () => { remove(f); setConfirm(null); } },
    ],
  });

  const published = forms.filter((f) => f.is_published).length;
  const tabs = [["all", "הכל", forms.length], ["published", "פורסם", published], ["draft", "טיוטה", forms.length - published]];
  const filtered = forms.filter(
    (f) => (tab === "all" || (tab === "published") === !!f.is_published) && (f.title || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">הטפסים שלי</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">צרו טפסים, שתפו עם לקוחות וקבלו חתימות דיגיטליות</p>
        </div>
        <Button onClick={create} disabled={creating} className="gap-2 rounded-full px-5 shadow-sm">
          <Plus className="h-4 w-4" /> יצירת טופס חדש
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-full bg-secondary p-1">
          {tabs.map(([k, l, n]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-full px-4 py-1.5 text-sm transition-all ${tab === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {l} <span className="text-muted-foreground">({n})</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש טופס בשם..." className="rounded-full bg-card pr-9" />
        </div>
      </div>

      {isLoading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-muted-foreground"><FileText className="h-5 w-5" /></span>
          <p className="font-medium">אין טפסים להצגה</p>
          <p className="text-sm text-muted-foreground">התחילו ביצירת טופס חדש</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto pb-2 xl:block">
            <div className="grid grid-cols-[1fr_110px_160px_160px_80px_220px] gap-3 px-5 pb-2 text-xs font-medium text-muted-foreground">
              <span>שם הטופס</span><span>מפורסם</span><span>תאריך יצירה</span><span>תאריך פרסום</span><span>חתימות</span><span />
            </div>
            <div className="space-y-2">
              {filtered.map((f) => (
                <FormRow key={f.id} form={f} count={f.submission_count || 0} onPublish={confirmPublish} onDuplicate={duplicate} onDelete={confirmDelete} />
              ))}
            </div>
          </div>
          <div className="space-y-3 xl:hidden">
            {filtered.map((f) => (
              <FormCard key={f.id} form={f} count={f.submission_count || 0} onPublish={confirmPublish} onDuplicate={duplicate} onDelete={confirmDelete} />
            ))}
          </div>
        </>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || ""}
        description={confirm?.description || ""}
        actions={confirm?.actions || []}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}