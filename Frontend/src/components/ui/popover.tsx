import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
function PopoverContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) { return <PopoverPrimitive.Portal><PopoverPrimitive.Content sideOffset={sideOffset} className={cn("interactive-surface z-50 rounded-lg border border-[var(--border)] bg-white p-4 text-sm shadow-[0_8px_30px_rgba(31,42,55,0.12)] outline-none", className)} {...props} /></PopoverPrimitive.Portal>; }
export { Popover, PopoverTrigger, PopoverContent };
