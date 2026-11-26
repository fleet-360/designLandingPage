import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import Loader from "@/components/Loader";
import EditorHeader from "@/components/editor/EditorHeader";
import BlockPalette from "@/components/editor/BlockPalette";
import BlockItem from "@/components/editor/BlockItem";
import BlockSettings from "@/components/editor/BlockSettings";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { newBlock, ensureBlockStyle, cleanBlocksForSave } from "@/lib/formUtils";
import { t } from "@/i18n";

const formSig = (f) => JSON.stringify({ title: f?.title, blocks: f?.blocks });

export default function FormEditor() {
  const id = new URLSearchParams(window.location.search).get("id");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [savedForm, setSavedForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState(null); // האלמנט שכפתורי השליטה שלו מוצגים
  const [settingsId, setSettingsId] = useState(null); // האלמנט שפאנל ההגדרות שלו פתוח
  const [dialog, setDialog] = useState(null);
  const isMobile = useIsMobile();

  const dirty = form && savedForm ? formSig(form) !== formSig(savedForm) : false;

  useEffect(() => {
    if (id) base44.entities.Form.get(id).then((f) => { setForm(f); setSavedForm(f); }).catch(() => setForm(null));
  }, [id]);

  // אזהרת beforeunload כשיש שינויים שלא נשמרו
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // לחיצה מחוץ לאלמנט הפעיל מסתירה את כפתורי השליטה שלו
  useEffect(() => {
    if (!activeId) return;
    const handler = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-block-item]") || t.closest("[data-block-settings]")) return;
      setActiveId(null);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [activeId]);

  if (!id) return <div className="py-20 text-center text-muted-foreground">{t("לא נבחר טופס — חזרו לרשימה ובחרו טופס לעריכה.")}</div>;
  if (form === null) return <div className="py-20 text-center text-muted-foreground">{t("הטופס לא נמצא.")}</div>;
  if (!form) return <Loader />;

  const blocks = (form.blocks || []).map(ensureBlockStyle);
  const setBlocks = (fn) => setForm((f) => ({ ...f, blocks: fn(f.blocks || []).map(ensureBlockStyle) }));
  const move = (i, d) =>
    setBlocks((b) => { const t = i + d; if (t < 0 || t >= b.length) return b; const n = [...b]; [n[i], n[t]] = [n[t], n[i]]; return n; });
  const onDragEnd = (res) => {
    if (!res.destination || res.destination.index === res.source.index) return;
    setBlocks((b) => {
      const n = [...b];
      const [moved] = n.splice(res.source.index, 1);
      n.splice(res.destination.index, 0, moved);
      return n;
    });
  };

  const updateBlock = (i, patch) => setBlocks((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const selectedIdx = blocks.findIndex((b) => b.id === settingsId);
  const selectedBlock = selectedIdx >= 0 ? blocks[selectedIdx] : null;

  const doSave = async (extra = {}) => {
    setSaving(true);
    // ניקוי אפשרויות רשימה ריקות לפני שמירה
    const blocksToSave = cleanBlocksForSave(form.blocks);
    const data = { title: form.title, blocks: blocksToSave, is_published: form.is_published, published_date: form.published_date, ...extra };
    await base44.entities.Form.update(id, data);
    const updated = { ...form, blocks: blocksToSave, ...extra };
    setForm(updated);
    setSavedForm(updated);
    qc.invalidateQueries({ queryKey: ["forms"] });
    setSaving(false);
    toast({ title: extra.is_published ? t("הטופס פורסם ומוכן לשיתוף") : t("הטופס נשמר") });
  };

  const save = () => doSave();
  const publish = (v) => doSave({ is_published: v, published_date: v ? new Date().toISOString() : form.published_date });

  // שמירה על יציאה מהטופס
  const guardNavigate = (path) => {
    if (!dirty) { navigate(path); return; }
    setDialog({ type: "unsaved", path });
  };

  // שינוי סטטוס פרסום/טיוטה
  const handlePublishToggle = (v) => {
    if (v && dirty) {
      setDialog({ type: "publish-unsaved", publishValue: v });
    } else {
      setDialog({ type: "publish-confirm", publishValue: v });
    }
  };

  const handleDelete = () => setDialog({ type: "delete" });

  const doDelete = async () => {
    await base44.entities.Form.delete(id);
    qc.invalidateQueries({ queryKey: ["forms"] });
    navigate("/");
  };

  const closeDialog = () => setDialog(null);

  const dialogConfig = () => {
    if (!dialog) return null;
    if (dialog.type === "unsaved") {
      return {
        title: t("שינויים שלא נשמרו"),
        description: t("יש שינויים בטופס שטרם נשמרו. מה ברצונך לעשות?"),
        actions: [
          { label: t("ביטול"), variant: "outline", onClick: closeDialog },
          { label: t("לא לשמור"), variant: "ghost", onClick: () => { const p = dialog.path; closeDialog(); navigate(p); } },
          { label: t("שמור והמשך"), variant: "default", onClick: async () => { await doSave(); const p = dialog.path; closeDialog(); navigate(p); } },
        ],
      };
    }
    if (dialog.type === "publish-confirm") {
      return {
        title: dialog.publishValue ? t("פרסום טופס?") : t("העברה לטיוטה?"),
        description: dialog.publishValue
          ? t("האם אתה בטוח שברצונך לפרסם את הטופס? לאחר הפרסום, לקוחות יוכלו לחתום עליו.")
          : t("האם אתה בטוח שברצונך להעביר את הטופס לטיוטה? לקוחות לא יוכלו לחתום עליו עד לפרסום מחדש."),
        actions: [
          { label: t("ביטול"), variant: "outline", onClick: closeDialog },
          { label: t("אישור"), variant: "default", onClick: async () => { const v = dialog.publishValue; closeDialog(); await publish(v); } },
        ],
      };
    }
    if (dialog.type === "publish-unsaved") {
      return {
        title: t("פרסום טופס?"),
        description: t("יש שינויים שלא נשמרו. מה ברצונך לעשות?"),
        actions: [
          { label: t("ביטול"), variant: "outline", onClick: closeDialog },
          { label: t("שמור בלבד"), variant: "secondary", onClick: async () => { closeDialog(); await doSave(); } },
          { label: t("שמור ופרסם"), variant: "default", onClick: async () => { const v = dialog.publishValue; closeDialog(); await publish(v); } },
        ],
      };
    }
    if (dialog.type === "delete") {
      return {
        title: t("מחיקת טופס?"),
        description: t("האם אתה בטוח שברצונך למחוק את הטופס? פעולה זו אינה הפיכה וכל החתימות שנאספו יימחקו גם הן."),
        actions: [
          { label: t("ביטול"), variant: "outline", onClick: closeDialog },
          { label: t("מחיקה"), variant: "destructive", onClick: async () => { closeDialog(); await doDelete(); } },
        ],
      };
    }
    return null;
  };

  const cfg = dialogConfig();

  return (
    <div className="space-y-8">
      <EditorHeader form={form} onTitle={(title) => setForm((f) => ({ ...f, title }))} onSave={save} onPublish={handlePublishToggle} onDelete={handleDelete} saving={saving} dirty={dirty} onNavigate={guardNavigate} />
      <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <BlockPalette onAdd={(type) => setBlocks((b) => [...b, newBlock(type)])} />
        </aside>
        <section className="paper mx-auto w-full max-w-3xl rounded-2xl bg-card px-6 py-10 sm:px-12 sm:py-14">
          {blocks.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground">{t("המסמך ריק — הוסיפו אלמנטים מהתפריט")}</p>}
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="blocks">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                  {blocks.map((b, i) => (
                    <Draggable draggableId={b.id} index={i} key={b.id}>
                      {(prov) => (
                        <div ref={prov.innerRef} {...prov.draggableProps}>
                          <BlockItem
                            block={b}
                            first={i === 0}
                            last={i === blocks.length - 1}
                            isActive={activeId === b.id || settingsId === b.id}
                            onActivate={() => setActiveId(b.id)}
                            onSelect={() => { setActiveId(b.id); if (!isMobile) setSettingsId(b.id); }}
                            onChange={(p) => updateBlock(i, p)}
                            onRemove={() => setBlocks((arr) => arr.filter((_, j) => j !== i))}
                            onMove={(d) => move(i, d)}
                            onOpenSettings={() => { setActiveId(b.id); setSettingsId(b.id); }}
                            dragHandleProps={prov.dragHandleProps}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </section>
      </div>
      {selectedBlock && (
        <BlockSettings
          block={selectedBlock}
          blocks={blocks}
          onChange={(p) => updateBlock(selectedIdx, p)}
          onClose={() => setSettingsId(null)}
        />
      )}
      <ConfirmDialog
        open={!!dialog}
        title={cfg?.title || ""}
        description={cfg?.description || ""}
        actions={cfg?.actions || []}
        onClose={closeDialog}
      />
    </div>
  );
}