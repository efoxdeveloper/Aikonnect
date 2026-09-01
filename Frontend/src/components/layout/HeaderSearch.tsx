import { useState } from "react";
import { SearchIcon as Search } from "@animateicons/react/lucide";
import { Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";

export function HeaderSearch() { const [open, setOpen] = useState(false); const searchIcon = useAnimatedIcon(); return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><div onMouseEnter={searchIcon.onMouseEnter} onMouseLeave={searchIcon.onMouseLeave} className="group/search flex h-10 w-[min(320px,34vw)] items-center gap-2 rounded-lg border border-[#e4e8e5] bg-[#f7f8f7] px-3 transition-[border-color,box-shadow] focus-within:border-[var(--brand-accent)] focus-within:ring-2 focus-within:ring-[var(--brand-accent)]/10"><Search ref={searchIcon.ref} size={18} duration={0.7} className="shrink-0 text-[#64726c] transition-colors duration-150 group-focus-within/search:text-[var(--brand)]" /><Input aria-label="Search" placeholder="Search workspace..." onFocus={() => setOpen(true)} className="h-9 border-0 bg-transparent px-0 text-[14px] font-normal shadow-none focus-visible:ring-0" /></div></PopoverTrigger><PopoverContent align="start" className="w-[320px] p-0"><Command><CommandInput placeholder="Search workspace..." /><CommandList><CommandEmpty>No results found.</CommandEmpty><CommandItem onSelect={() => setOpen(false)}><Sparkles className="size-4 text-[var(--brand)]" />Quickly find anything</CommandItem></CommandList></Command></PopoverContent></Popover>; }
