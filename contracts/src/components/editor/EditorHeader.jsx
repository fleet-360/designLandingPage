import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, Save, Share2, Users, Eye, Trash2 } from "lucide-react";

export default function EditorHeader({ form, onTitle, onSave, onPublish, onDelete, saving, dirty, onNavigate }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={() => onNavigate("/")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
          <ArrowRight className="h-4 w-4" />
        </button>
        <Input
          value={form.title}
          onChange={(e) => onTitle(e.target.value)}
          className="h-auto min-w-0 border-0 bg-transparent px-0 font-heading text-2xl font-semibold shadow-none focus-visible:ring-0 sm:text-3xl"
        />
        {dirty && <span className="hidden shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 sm:inline">לא נשמר</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <label className="col-span-2 flex items-center justify-between gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm sm:col-span-1 sm:justify-start">
          <Switch checked={!!form.is_published} onCheckedChange={onPublish} />
          {form.is_published ? "מפורסם" : "טיוטה"}
        </label>
        <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => onNavigate(`/sign?id=${form.id}&preview=1`)}><Eye className="h-4 w-4" />תצוגה</Button>
        <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => onNavigate(`/submissions?id=${form.id}`)}><Users className="h-4 w-4" />תוצאות</Button>
        <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => onNavigate(`/share?id=${form.id}`)}><Share2 className="h-4 w-4" />שיתוף</Button>
        <Button size="sm" onClick={() => onSave()} disabled={saving} className="col-span-2 gap-2 rounded-full px-4 sm:col-span-1">
          <Save className="h-4 w-4" />{saving ? "שומר..." : dirty ? "שמור *" : "שמירה"}
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete} className="col-span-2 gap-2 rounded-full px-4 sm:col-span-1">
          <Trash2 className="h-4 w-4" />מחיקה
        </Button>
      </div>
    </div>
  );
}