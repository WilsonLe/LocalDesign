import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ComponentProps } from "react";
import { cn } from "cn";
export const Dialog = DialogPrimitive.Root;
export const DialogDescription = DialogPrimitive.Description;
export const dialogOverlayStyles =
  "fixed inset-0 z-50 bg-black/40 backdrop-blur-xs";
export const dialogContentStyles =
  "fixed left-1/2 top-1/2 z-60 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2.5rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-xl outline-none";
export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-tight font-semibold", className)}
      {...props}
    />
  );
}
export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex items-center justify-between gap-4", className)}
      {...props}
    />
  );
}
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}
export function DialogContent({
  children,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={dialogOverlayStyles}
        data-slot="dialog-overlay"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(dialogContentStyles, className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}
