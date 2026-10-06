import { LogOut, Menu } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarHeaderBrand } from "@/components/layout/SidebarHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";
import { getActiveNavigationGroup, platformNavigationGroups } from "@/config/navigation";

function PlatformAdminShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isMobile, isRailExpanded, setOpenMobile } = useSidebar();
  const activeGroup = getActiveNavigationGroup(platformNavigationGroups, useLocation().pathname);
  const railWidth = isRailExpanded ? "var(--sidebar-expanded-width)" : "var(--sidebar-collapsed-width)";
  const leftOffset = activeGroup ? `calc(${railWidth} + var(--sidebar-width))` : railWidth;
  const contentRadius = activeGroup ? "rounded-none" : "rounded-2xl";

  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return <div className="h-dvh overflow-hidden bg-[var(--sidebar-rail-background)]">
    <AppSidebar platformOnly />
    <header className="fixed inset-x-0 top-0 z-20 flex h-[var(--header-height)] items-center justify-between bg-[var(--sidebar-rail-background)] px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {isMobile && <button type="button" aria-label="Open navigation" onClick={() => setOpenMobile(true)} className="flex size-9 shrink-0 items-center justify-center rounded-md text-[var(--icon-muted)] hover:bg-white/70"><Menu size={18} aria-hidden="true" /></button>}
        <div className="h-11 w-[184px] shrink-0 sm:-ml-3"><SidebarHeaderBrand /></div>
        {isMobile && <span className="sr-only">Platform administration</span>}
      </div>
      <div className="ml-auto flex items-center gap-4"><span className="hidden text-xs text-[var(--text-muted)] sm:block">{user?.email}</span><button type="button" onClick={() => void signOut()} className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><LogOut size={14} aria-hidden="true" />Sign out</button></div>
    </header>
    <div style={{ "--shell-left-offset": leftOffset } as React.CSSProperties} className={cn("h-full min-w-0 pt-[var(--header-height)] ml-0 md:ml-[var(--shell-left-offset)]", activeGroup && "pr-2 pb-2")}><main className={cn("relative z-10 h-full min-w-0 overflow-y-auto bg-[var(--page-background)]", contentRadius)}><Outlet /></main></div>
  </div>;
}

export function PlatformAdminLayout() {
  return <SidebarProvider><PlatformAdminShell /></SidebarProvider>;
}
