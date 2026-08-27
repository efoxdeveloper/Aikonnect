import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";
function ScrollArea({ className, children, ...props }: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) { return <ScrollAreaPrimitive.Root className={cn("relative overflow-hidden", className)} {...props}>{children}<ScrollAreaPrimitive.Scrollbar orientation="vertical" className="flex touch-none select-none p-0.5"><ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-slate-200" /></ScrollAreaPrimitive.Scrollbar><ScrollAreaPrimitive.Corner /></ScrollAreaPrimitive.Root>; }
export { ScrollArea };
