import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, Eye, Pencil, Users, Share2, Copy, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { fmtDate } from "@/lib/formUtils";

function Action({ to, onClick, icon: Icon, title, danger }) {
  const cls = `grid h-8 w-8 place-items-center rounded-lg transition-colors ${
    danger ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  }`;
  if (to) return <Link to={to} title={title} className={cls}><Icon className="h-4 w-4" /></Link>;
  return <button type="button" onClick={onClick} title={title} className={cls}><Icon className="h-4 w-4" /></button>;
}

export default function FormRow({ form, count, onPublish, onDuplicate, onDelete }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-[1fr_110px_160px_160px_80px_220px] items-center gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4 transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(28,25,23,0.15)]"
    >
      <Link to={`/editor?id=${form.id}`} className="flex items-center gap-3 truncate">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
          <FileText className="h-4 w-4" />
        </span>
        <span className="truncate font-medium">{form.title}</span>
      </Link>
      <div className="flex items-center gap-2">
        <Switch checked={!!form.is_published} onCheckedChange={(v) => onPublish(form, v)} />
        <span className="text-xs text-muted-foreground">{form.is_published ? "פורסם" : "טיוטה"}</span>
      </div>
      <span className="text-sm text-muted-foreground">{fmtDate(form.created_date)}</span>
      <span className="text-sm text-muted-foreground">{fmtDate(form.published_date)}</span>
      <span className="flex items-center gap-1.5 text-sm"><Users className="h-3.5 w-3.5 text-muted-foreground" />{count}</span>
      <div className="flex items-center justify-end gap-1">
        <Action to={`/sign?id=${form.id}&preview=1`} icon={Eye} title="תצוגה מקדימה" />
        <Action to={`/editor?id=${form.id}`} icon={Pencil} title="עריכה" />
        <Action to={`/submissions?id=${form.id}`} icon={Users} title="תוצאות מילוי" />
        <Action to={`/share?id=${form.id}`} icon={Share2} title="שיתוף" />
        <Action onClick={() => onDuplicate(form)} icon={Copy} title="שכפול" />
        <Action onClick={() => onDelete(form)} icon={Trash2} title="מחיקה" danger />
      </div>
    </motion.div>
  );
}