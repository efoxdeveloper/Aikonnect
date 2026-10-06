import { Outlet, useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceNotificationStrip } from "@/components/layout/WorkspaceNotificationStrip";
import { getActiveNavigationGroup, navigationGroups } from "@/config/navigation";

function DashboardLayoutContent() {
  const hasSecondarySidebar = Boolean(getActiveNavigationGroup(navigationGroups, useLocation().pathname));
  const contentRadius = hasSecondarySidebar ? "rounded-none relative z-10" : "rounded-2xl";
  const mainBackground = hasSecondarySidebar ? "bg-transparent pr-2 pb-2" : "bg-[var(--sidebar-rail-background)]";

  return <main className={`flex h-dvh min-h-0 min-w-0 w-full flex-col overflow-hidden pt-[var(--header-height)] ${mainBackground}`}>
    <WorkspaceNotificationStrip reserveSpace className="fixed inset-x-0 z-[2000]" style={{ top: "var(--header-height)" }} />
    <div className={`min-h-0 min-w-0 flex-1 overflow-y-auto ${contentRadius} bg-[var(--page-background)]`} data-testid="dashboard-page-viewport"><Outlet /></div>
  </main>;
}

export function DashboardLayout() {
  return <AppShell><DashboardLayoutContent /></AppShell>;
}
