import { MessageSquareMore } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";

export function BrandLogo() { return <div className="relative flex size-9 shrink-0 items-center justify-center text-[var(--brand)] transition-transform duration-150 group-hover:scale-[1.04]"><MessageSquareMore className="size-[34px]" strokeWidth={2.2} /><span className="absolute right-0 top-0 size-2 rounded-full bg-[#34d399] ring-2 ring-white" /></div>; }
export function SidebarHeaderBrand() { const { state } = useSidebar(); return <div data-testid="sidebar-brand-header" className={cn("group flex h-full items-center gap-2.5 bg-white px-4", state === "collapsed" && "justify-center px-0")}><BrandLogo /><div className={cn("overflow-hidden whitespace-nowrap text-[24px] font-semibold leading-none tracking-[-0.035em] text-[var(--text-primary)] transition-[width,opacity] duration-150", state === "collapsed" && "w-0 opacity-0")}><span>INTER</span><span className="text-[var(--brand)]">AKT</span></div></div>; }
