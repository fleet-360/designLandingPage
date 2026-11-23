import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "מחיקה", onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="collections-app max-w-sm">
        <AlertDialogHeader className="text-right">
          <AlertDialogTitle className="font-display text-lg font-bold">{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
          >
            {confirmLabel}
          </AlertDialogAction>
          <AlertDialogCancel className="mt-0">ביטול</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}