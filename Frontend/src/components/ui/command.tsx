import * as CommandPrimitive from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Command>) { return <CommandPrimitive.Command className={cn("flex h-full w-full flex-col overflow-hidden rounded-lg bg-white text-[var(--text-primary)]", className)} {...props} />; }
function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.CommandInput>) { return <div className="flex items-center border-b border-[var(--border-soft)] px-3"><Search className="mr-2 size-4 text-[var(--text-muted)]" /><CommandPrimitive.CommandInput className={cn("flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]", className)} {...props} /></div>; }
const CommandList = CommandPrimitive.CommandList;
const CommandEmpty = CommandPrimitive.CommandEmpty;
const CommandGroup = CommandPrimitive.CommandGroup;
const CommandItem = CommandPrimitive.CommandItem;
export { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem };
