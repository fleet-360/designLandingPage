import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Link2, Copy, MessageCircle, QrCode, Mail, ArrowRight, Download, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import Loader from "@/components/Loader";
import ShareCard from "@/components/share/ShareCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { fmtDate, signLink } from "@/lib/formUtils";

export default function Share() {
  const id = new URLSearchParams(window.location.search).get("id");
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { if (id) base44.entities.Form.get(id).then(setForm).catch(() => setForm(null)); }, [id]);
  if (!id) return <div className="py-20 text-center text-muted-foreground">לא נבחר טופס — חזרו לרשימה ובחרו טופס לשיתוף.</div>;
  if (form === null) return <div className="py-20 text-center text-muted-foreground">הטופס לא נמצא.</div>;
  if (!form) return <Loader />;

  const doPublish = async (v) => {
    setPublishing(true);
    try {
      const updated = await base44.entities.Form.update(id, { is_published: v, published_date: v ? new Date().toISOString() : form.published_date });
      setForm({ ...form, ...updated });
      toast({ title: v ? "הטופס פורסם" : "הטופס עבר לטיוטה" });
    } catch (e) {
      toast({ title: "שגיאה בפרסום", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const publish = (v) => setConfirm({
    title: v ? "פרסום טופס?" : "העברה לטיוטה?",
    description: v
      ? "האם אתה בטוח שברצונך לפרסם את הטופס? לאחר הפרסום, לקוחות יוכלו לחתום עליו."
      : "האם אתה בטוח שברצונך להעביר את הטופס לטיוטה? לקוחות לא יוכלו לחתום עליו עד לפרסום מחדש.",
    actions: [
      { label: "ביטול", variant: "outline", onClick: () => setConfirm(null) },
      { label: "אישור", variant: "default", onClick: () => { doPublish(v); setConfirm(null); } },
    ],
  });

  const link = signLink(id);
  const text = `שלום, מצורף קישור לחתימה על "${form.title}": ${link}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&color=1c1917&data=${encodeURIComponent(link)}`;
  const copy = () => navigator.clipboard.writeText(link).then(() => toast({ title: "הקישור הועתק" }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />חזרה למסך הטפסים שלי</Link>
      <div className="text-center">
        <h1 className="text-4xl font-semibold">שיתוף עם נמענים</h1>
        <div className="mx-auto mt-4 inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-1 rounded-full border border-border bg-card px-6 py-2 text-xs text-muted-foreground">
          <span>שם הטופס: <b className="text-foreground">{form.title}</b></span>
          <span>סטטוס: <b className="text-foreground">{form.is_published ? "מפורסם" : "טיוטה"}</b></span>
          <span>תאריך פרסום: <b className="text-foreground">{fmtDate(form.published_date)}</b></span>
        </div>
        {!form.is_published && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <p className="text-sm text-destructive">שימו לב: הטופס עדיין לא פורסם — הלקוחות לא יוכלו לחתום עד לפרסומו</p>
            <label className="inline-flex items-center gap-3 rounded-full border border-border bg-card px-5 py-2.5 text-sm shadow-sm">
              <Switch checked={!!form.is_published} onCheckedChange={publish} disabled={publishing} />
              <span>{publishing ? "מפרסם..." : "פרסום הטופס עכשיו"}</span>
            </label>
          </div>
        )}
      </div>

      <h2 className="text-center text-xl font-semibold">כיצד תרצו לשתף את המסמך?</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <ShareCard icon={Link2} title="שיתוף דרך קישור">
          <div className="flex gap-2">
            <Input readOnly value={link} dir="ltr" className="h-9 text-xs" />
            <Button size="icon" variant="outline" onClick={copy} className="h-9 w-9 shrink-0"><Copy className="h-4 w-4" /></Button>
          </div>
        </ShareCard>
        <ShareCard icon={MessageCircle} title="שיתוף דרך וואטסאפ">
          <Button asChild className="w-full rounded-full"><a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">שליחת קישור</a></Button>
        </ShareCard>
        <ShareCard icon={QrCode} title="שיתוף דרך QR CODE">
          <div className="flex flex-col items-center gap-3">
            <img src={qr} alt="QR" className="h-28 w-28 rounded-lg" />
            <Button asChild variant="outline" size="sm" className="gap-2 rounded-full"><a href={qr} download={`${form.title}-qr.png`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />הצגת QR CODE</a></Button>
          </div>
        </ShareCard>
      </div>
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