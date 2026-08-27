import { useState, type MouseEvent } from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void | Promise<void>;
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  pendingLabel = "Working...",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
}: ConfirmationDialogProps) {
  const [pending, setPending] = useState(false);
  const confirm = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The calling feature owns error feedback; rejection keeps this dialog open.
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(nextOpen) => { if (!pending) onOpenChange(nextOpen); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[120] bg-slate-950/45" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[121] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_24px_70px_rgba(15,23,42,.24)] outline-none">
          <div className="flex items-start gap-3 px-5 py-5 sm:px-6">
            <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", tone === "danger" ? "bg-red-50 text-[var(--danger)]" : "bg-[var(--brand-soft)] text-[var(--brand)]")}><AlertTriangle size={20} aria-hidden="true" /></div>
            <div className="min-w-0 pt-0.5"><AlertDialogPrimitive.Title className="text-sm font-semibold text-[var(--text-primary)]">{title}</AlertDialogPrimitive.Title><AlertDialogPrimitive.Description className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">{description}</AlertDialogPrimitive.Description></div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[#fbfcfd] px-5 py-4 sm:px-6">
            <AlertDialogPrimitive.Cancel asChild><button type="button" disabled={pending} className="h-9 rounded-md border border-[var(--border)] bg-white px-4 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] disabled:opacity-50">{cancelLabel}</button></AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild><button type="button" disabled={pending} onClick={(event) => void confirm(event)} className={cn("h-9 rounded-md px-4 text-xs font-medium text-white disabled:cursor-wait disabled:opacity-60", tone === "danger" ? "bg-[var(--danger)] hover:bg-red-700" : "bg-[var(--brand)] hover:bg-[var(--brand-hover)]")}>{pending ? pendingLabel : confirmLabel}</button></AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
