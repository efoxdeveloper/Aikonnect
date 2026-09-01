import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
function TooltipContent({ className, sideOffset = 5, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) { return <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={sideOffset} className={cn("z-50 overflow-hidden rounded-md bg-[var(--green-950)] px-3 py-1.5 text-xs text-white shadow-[0_4px_12px_rgba(4,45,29,.18)]", className)} {...props} /></TooltipPrimitive.Portal>; }
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
