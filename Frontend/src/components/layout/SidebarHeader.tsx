import { MessageSquareMore } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";

export function BrandLogo() { return <div className="relative flex size-9 shrink-0 items-center justify-center text-white transition-transform duration-150 group-hover:scale-[1.04]"><MessageSquareMore className="size-[34px]" strokeWidth={2.2} /><span className="absolute right-0 top-0 size-2 rounded-full bg-[#34d399] ring-2 ring-[var(--sidebar-deep)]" /></div>; }
export function SidebarHeaderBrand() { const { state } = useSidebar(); return <div className={cn("group flex h-[68px] items-center gap-2.5 border-b border-white/10 px-4", state === "collapsed" && "justify-center px-0")}><BrandLogo /><div className={cn("overflow-hidden whitespace-nowrap text-[24px] font-semibold leading-none tracking-[-0.035em] text-white transition-[width,opacity] duration-150", state === "collapsed" && "w-0 opacity-0")}><span>INTER</span><span className="text-[#6ee7b7]">AKT</span></div></div>; }
