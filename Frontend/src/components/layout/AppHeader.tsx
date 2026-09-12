import { LayoutGridIcon as LayoutGrid, MenuIcon as Menu } from "@animateicons/react/lucide";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/hooks/use-sidebar";
import { HeaderActions } from "./HeaderActions";
import { HeaderSearch } from "./HeaderSearch";
import { SidebarHeaderBrand } from "./SidebarHeader";
import { cn } from "@/lib/utils";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";

export function AppHeader() { const { state, isMobile, openMobile, setOpenMobile, toggleSidebar } = useSidebar(); const menuIcon = useAnimatedIcon(); const gridIcon = useAnimatedIcon(); return <header role="banner" className="fixed inset-x-0 top-0 z-20 flex h-[var(--header-height)] items-center justify-between bg-white px-5 shadow-[0_4px_12px_rgba(16,24,20,0.10)] md:px-7"><div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4"><div className={cn("hidden h-full shrink-0 md:block", state === "expanded" ? "w-[var(--sidebar-collapsed-width)] xl:w-[var(--sidebar-width)]" : "w-[var(--sidebar-collapsed-width)]")}><SidebarHeaderBrand /></div>{isMobile ? <Button variant="ghost" size="icon" aria-label="Open navigation" title="Open navigation" onClick={() => setOpenMobile(true)} onMouseEnter={menuIcon.onMouseEnter} onMouseLeave={menuIcon.onMouseLeave} className="rounded-full bg-[var(--brand-subtle)] text-[var(--brand)]"><Menu ref={menuIcon.ref} size={20} duration={0.7} /></Button> : <Button variant="ghost" size="icon" aria-label="Toggle sidebar" title="Toggle sidebar" onClick={toggleSidebar} onMouseEnter={gridIcon.onMouseEnter} onMouseLeave={gridIcon.onMouseLeave} className="group/grid rounded-full bg-[var(--brand-subtle)] text-[var(--brand)] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.03)]"><LayoutGrid ref={gridIcon.ref} size={20} duration={0.7} /></Button>}<HeaderSearch /></div><HeaderActions /></header>; }
