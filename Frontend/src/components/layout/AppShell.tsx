import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { RequestProgress } from "./RequestProgress";
import { useLocation } from "react-router-dom";
import { getActiveNavigationGroup, navigationGroups } from "@/config/navigation";
import { useSidebar } from "@/hooks/use-sidebar";

function AppShellContent({ children }: { children: React.ReactNode }) {
  const activeGroup = getActiveNavigationGroup(navigationGroups, useLocation().pathname);
  const { isRailExpanded } = useSidebar();
  const railWidth = isRailExpanded ? "var(--sidebar-expanded-width)" : "var(--sidebar-collapsed-width)";
  const leftOffset = activeGroup ? `calc(${railWidth} + var(--sidebar-width))` : railWidth;
  return <><AppSidebar /><AppHeader /><RequestProgress /><div data-testid="app-shell-content" style={{ "--shell-left-offset": leftOffset } as React.CSSProperties} className={`h-full min-h-0 min-w-0 ml-0 md:ml-[var(--shell-left-offset)] ${activeGroup ? "bg-[var(--sidebar-rail-background)]" : ""}`}>{children}</div></>;
}
export function AppShell({ children }: { children: React.ReactNode }) { return <SidebarProvider><AppShellContent>{children}</AppShellContent></SidebarProvider>; }
