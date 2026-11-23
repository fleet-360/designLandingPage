import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

export default function ResponsiveSheet({ open, onOpenChange, title, description, children }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="collections-app max-h-[90vh]">
          <DrawerHeader className="border-b border-border pb-3 text-right">
            <DrawerTitle className="font-display text-lg font-bold text-foreground">{title}</DrawerTitle>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="collections-app max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle className="font-display text-lg font-bold text-foreground">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div>{children}</div>
      </DialogContent>
    </Dialog>
  );
}