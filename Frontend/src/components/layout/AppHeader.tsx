import { MenuIcon as Menu } from "@animateicons/react/lucide";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/hooks/use-sidebar";
import { HeaderActions } from "./HeaderActions";
import { HeaderSearch } from "./HeaderSearch";
import { SidebarHeaderBrand } from "./SidebarHeader";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";

export function AppHeader() { const { isMobile, openMobile, setOpenMobile } = useSidebar(); const menuIcon = useAnimatedIcon(); return <header role="banner" className="fixed inset-x-0 top-0 z-20 flex h-[var(--header-height)] items-center justify-between border-b border-[var(--header-border)] bg-white px-5 md:px-7"><div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4"><div className="hidden h-full w-[var(--sidebar-collapsed-width)] shrink-0 md:block"><SidebarHeaderBrand /></div>{isMobile && <Button variant="ghost" size="icon" aria-label="Open navigation" title="Open navigation" onClick={() => setOpenMobile(true)} onMouseEnter={menuIcon.onMouseEnter} onMouseLeave={menuIcon.onMouseLeave} className="rounded-full bg-[var(--brand-subtle)] text-[var(--brand)]"><Menu ref={menuIcon.ref} size={20} duration={0.7} /></Button>}<HeaderSearch /></div><HeaderActions /></header>; }
