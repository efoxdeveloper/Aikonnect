import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";

export function BrandLogo() { return <img src="/logo.png" alt="Marento" className="h-10 w-[220px] shrink-0 object-contain object-left transition-transform duration-150 group-hover:scale-[1.02]" />; }
export function SidebarHeaderBrand() { const { state } = useSidebar(); return <div data-testid="sidebar-brand-header" aria-label="Marento" className={cn("group flex h-full items-center gap-2.5 overflow-hidden bg-white px-4", state === "collapsed" && "justify-center px-0")}><img src="/logo.png" alt="Marento" className={cn("h-10 w-[220px] shrink-0 object-contain object-left transition-[width,height] duration-150", state === "collapsed" && "h-9 w-9 object-cover object-left")} /></div>; }
