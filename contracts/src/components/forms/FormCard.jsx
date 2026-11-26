import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, Eye, Pencil, Users, Share2, Copy, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { fmtDate } from "@/lib/formUtils";
import { t } from "@/i18n";

function Action({ to, onClick, icon: Icon, title, danger }) {
  const cls = `grid h-9 w-9 place-items-center rounded-lg transition-colors ${
    danger ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  }`;
  if (to) return <Link to={to} title={title} className={cls}><Icon className="h-4 w-4" /></Link>;
  return <button type="button" onClick={onClick} title={title} className={cls}><Icon className="h-4 w-4" /></button>;
}

export default function FormCard({ form, count, onPublish, onDuplicate, onDelete }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/70 bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <Link to={`/editor?id=${form.id}`} className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
            <FileText className="h-4 w-4" />
          </span>
          <span className="truncate font-medium">{form.title}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Switch checked={!!form.is_published} onCheckedChange={(v) => onPublish(form, v)} />
          <span className="text-xs text-muted-foreground">{form.is_published ? t("פורסם") : t("טיוטה")}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{t("נוצר:")} {fmtDate(form.created_date)}</span>
        {form.published_date && <span>{t("פורסם:")} {fmtDate(form.published_date)}</span>}
        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t("{n} חתימות", { n: count })}</span>
      </div>
      <div className="mt-3 flex items-center gap-1 border-t border-border/50 pt-3">
        <Action to={`/sign?id=${form.id}&preview=1`} icon={Eye} title={t("תצוגה מקדימה")} />
        <Action to={`/editor?id=${form.id}`} icon={Pencil} title={t("עריכה")} />
        <Action to={`/submissions?id=${form.id}`} icon={Users} title={t("תוצאות מילוי")} />
        <Action to={`/share?id=${form.id}`} icon={Share2} title={t("שיתוף")} />
        <Action onClick={() => onDuplicate(form)} icon={Copy} title={t("שכפול")} />
        <Action onClick={() => onDelete(form)} icon={Trash2} title={t("מחיקה")} danger />
      </div>
    </motion.div>
  );
}