import * as CommandPrimitive from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Command>) { return <CommandPrimitive.Command className={cn("flex h-full w-full flex-col overflow-hidden rounded-lg bg-white text-[var(--text-primary)]", className)} {...props} />; }
function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.CommandInput>) { return <div className="flex items-center border-b border-[var(--border-soft)] px-3"><Search className="mr-2 size-4 text-[var(--text-muted)]" /><CommandPrimitive.CommandInput className={cn("flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]", className)} {...props} /></div>; }
function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.CommandList>) { return <CommandPrimitive.CommandList className={cn("max-h-64 overflow-y-auto p-1.5", className)} {...props} />; }
function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.CommandEmpty>) { return <CommandPrimitive.CommandEmpty className={cn("px-3 py-6 text-center text-xs text-[var(--text-muted)]", className)} {...props} />; }
const CommandGroup = CommandPrimitive.CommandGroup;
function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.CommandItem>) { return <CommandPrimitive.CommandItem className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-[var(--brand-soft)] data-[selected=true]:text-[var(--brand)]", className)} {...props} />; }
export { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem };
