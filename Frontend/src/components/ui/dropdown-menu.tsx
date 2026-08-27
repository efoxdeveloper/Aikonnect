import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
function DropdownMenu({ modal = false, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) { return <DropdownMenuPrimitive.Root modal={modal} {...props} />; }
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) { return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content sideOffset={sideOffset} className={cn("interactive-surface z-50 min-w-[190px] overflow-hidden rounded-lg border border-[var(--border)] bg-white p-1.5 text-[var(--text-primary)] shadow-[0_8px_30px_rgba(31,42,55,0.12)]", className)} {...props} /></DropdownMenuPrimitive.Portal>; }
function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) { return <DropdownMenuPrimitive.Item className={cn("relative flex cursor-default select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-[background-color,color,transform] duration-150 focus:translate-x-0.5 focus:bg-[var(--brand-soft)] focus:text-[var(--brand)]", className)} {...props} />; }
function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) { return <DropdownMenuPrimitive.Label className={cn("px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)]", className)} {...props} />; }
function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) { return <DropdownMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-[var(--border-soft)]", className)} {...props} />; }
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup, DropdownMenuPortal };
