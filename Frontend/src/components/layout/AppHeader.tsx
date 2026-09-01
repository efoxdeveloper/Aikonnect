import { LayoutGridIcon as LayoutGrid, MenuIcon as Menu } from "@animateicons/react/lucide";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useSidebar } from "@/hooks/use-sidebar";
import { HeaderActions } from "./HeaderActions";
import { HeaderSearch } from "./HeaderSearch";
import { AppSidebar } from "./AppSidebar";
import { cn } from "@/lib/utils";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";

export function AppHeader() { const { state, isMobile, openMobile, setOpenMobile, toggleSidebar } = useSidebar(); const menuIcon = useAnimatedIcon(); const gridIcon = useAnimatedIcon(); return <header className={cn("fixed left-0 right-0 top-0 z-20 flex h-[var(--header-height)] items-center justify-between border-b border-[var(--header-border)] bg-white px-5 shadow-[0_1px_2px_rgba(16,24,20,0.025)] transition-[left] duration-200 ease-out md:left-[var(--sidebar-collapsed-width)] md:px-7", state === "expanded" && "xl:left-[var(--sidebar-width)]")}><div className="flex min-w-0 items-center gap-3 sm:gap-5">{isMobile ? <Sheet open={openMobile} onOpenChange={setOpenMobile}><SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Open navigation" title="Open navigation" onMouseEnter={menuIcon.onMouseEnter} onMouseLeave={menuIcon.onMouseLeave} className="rounded-full bg-[var(--brand-subtle)] text-[var(--brand)]"><Menu ref={menuIcon.ref} size={20} duration={0.7} /></Button></SheetTrigger><SheetContent className="w-[272px] p-0 [&>button]:text-white/70 [&>button:hover]:bg-white/10 [&>button:hover]:text-white" side="left"><AppSidebar mobile /></SheetContent></Sheet> : <Button variant="ghost" size="icon" aria-label="Toggle sidebar" title="Toggle sidebar" onClick={toggleSidebar} onMouseEnter={gridIcon.onMouseEnter} onMouseLeave={gridIcon.onMouseLeave} className="group/grid rounded-full bg-[var(--brand-subtle)] text-[var(--brand)] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.03)]"><LayoutGrid ref={gridIcon.ref} size={20} duration={0.7} /></Button>}<HeaderSearch /></div><HeaderActions /></header>; }
