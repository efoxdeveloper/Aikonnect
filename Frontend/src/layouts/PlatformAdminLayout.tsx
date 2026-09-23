import { LogOut, Menu, ShieldCheck } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarHeaderBrand } from "@/components/layout/SidebarHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

function PlatformAdminShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();

  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return <div className="h-dvh overflow-hidden bg-[var(--page-background)]">
    <AppSidebar platformOnly />
    <header className="fixed inset-x-0 top-0 z-20 flex h-[var(--header-height)] items-center justify-between border-b border-[var(--border-soft)] bg-white px-5 md:px-7">
      <div className={cn("hidden h-full shrink-0 md:block", state === "expanded" ? "w-[var(--sidebar-collapsed-width)] xl:w-[var(--sidebar-width)]" : "w-[var(--sidebar-collapsed-width)]")}><SidebarHeaderBrand /></div>
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] md:hidden"><button type="button" aria-label="Open navigation" onClick={() => setOpenMobile(true)} className="flex size-9 items-center justify-center rounded-full bg-[var(--brand-subtle)] text-[var(--brand)]"><Menu size={18} aria-hidden="true" /></button><ShieldCheck size={17} className="text-[var(--brand)]" aria-hidden="true" />Platform administration</div>
      <div className="ml-auto flex items-center gap-4"><span className="hidden text-xs text-[var(--text-muted)] sm:block">{user?.email}</span><button type="button" onClick={() => void signOut()} className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><LogOut size={14} aria-hidden="true" />Sign out</button></div>
    </header>
    <div className={cn("h-full pt-[var(--header-height)] transition-[margin-left] duration-200 ease-out", state === "expanded" ? "md:ml-[var(--sidebar-collapsed-width)] xl:ml-[var(--sidebar-width)]" : "md:ml-[var(--sidebar-collapsed-width)]")}><main className="h-full overflow-y-auto"><Outlet /></main></div>
  </div>;
}

export function PlatformAdminLayout() {
  return <SidebarProvider><PlatformAdminShell /></SidebarProvider>;
}
