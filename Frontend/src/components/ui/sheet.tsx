import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;
function SheetContent({ className, children, side = "left", ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: "top" | "bottom" | "left" | "right" }) { return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[1px]" /><DialogPrimitive.Content className={cn("fixed z-50 bg-white shadow-[0_18px_50px_rgba(4,45,29,.14)] outline-none", side === "left" && "inset-y-0 left-0 w-[288px]", side === "right" && "inset-y-0 right-0 w-[288px]", side === "top" && "inset-x-0 top-0", side === "bottom" && "inset-x-0 bottom-0", className)} {...props}>{children}<DialogPrimitive.Close aria-label="Close navigation" title="Close navigation" className="interakt-button absolute right-4 top-4 flex size-11 items-center justify-center rounded-md p-1 text-[var(--text-muted)] data-[variant=default]:bg-transparent hover:bg-[var(--brand-subtle)] hover:text-[var(--brand)]"><X className="size-4" /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>; }
export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
