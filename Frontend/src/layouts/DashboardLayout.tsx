import { Outlet } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceNotificationStrip } from "@/components/layout/WorkspaceNotificationStrip";

function DashboardLayoutContent() { return <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--page-background)] pt-[var(--header-height)]"><WorkspaceNotificationStrip reserveSpace className="fixed inset-x-0 top-[var(--header-height)] z-[2000]" /><div className="min-h-0 flex-1 overflow-y-auto" data-testid="dashboard-page-viewport"><Outlet /></div></main>; }

export function DashboardLayout() {
  return <AppShell><DashboardLayoutContent /></AppShell>;
}
