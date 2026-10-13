import { MenuIcon as Menu } from "@animateicons/react/lucide";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/hooks/use-sidebar";
import { HeaderActions } from "./HeaderActions";
import { SidebarHeaderBrand } from "./SidebarHeader";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { SetupGuideButton } from "./SetupGuideButton";
import { TrialExpiredStrip } from "./TrialExpiredStrip";

const API_DOCUMENTATION_URL = "https://documenter.getpostman.com/view/58653027/2sBYHNW3LA";

export function AppHeader() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const menuIcon = useAnimatedIcon();

  return (
    <header role="banner" className="fixed inset-x-0 top-0 z-20 flex h-[var(--header-height)] items-center justify-between bg-[var(--sidebar-rail-background)] px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {isMobile && <Button variant="ghost" size="icon" aria-label="Open navigation" title="Open navigation" onClick={() => setOpenMobile(true)} onMouseEnter={menuIcon.onMouseEnter} onMouseLeave={menuIcon.onMouseLeave} className="size-9 shrink-0 rounded-md text-[var(--icon-muted)] hover:bg-white/70"><Menu ref={menuIcon.ref} size={20} duration={0.7} /></Button>}
        <div data-testid="navbar-brand" className="h-11 w-[184px] shrink-0 sm:ml-0"><SidebarHeaderBrand /></div>
      </div>
      <div data-testid="navbar-trial-slot" className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:flex" style={{ width: "min(380px, calc(100vw - 560px))" }}>
        <div className="pointer-events-auto w-full"><TrialExpiredStrip className="w-full" /></div>
      </div>
      <div data-testid="header-utility-actions" className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <a href={API_DOCUMENTATION_URL} target="_blank" rel="noreferrer" aria-label="API Docs" title="API Docs" className="group inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-xs font-medium text-[#1769aa] underline decoration-[#b8d5eb] decoration-1 underline-offset-4 transition-colors hover:text-[#12558a] hover:decoration-[#12558a]"><span>API Docs</span><ArrowUpRight size={13} aria-hidden="true" className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></a>
        <SetupGuideButton />
        <WorkspaceSwitcher />
        <HeaderActions />
      </div>
    </header>
  );
}
