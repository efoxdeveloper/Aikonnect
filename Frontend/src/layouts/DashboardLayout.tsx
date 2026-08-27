import { Outlet } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";

export function DashboardLayout() { return <AppShell><main className="h-dvh overflow-hidden bg-[var(--page-background)] pt-[var(--header-height)]"><div className="h-full overflow-y-auto" data-testid="dashboard-page-viewport"><Outlet /></div></main></AppShell>; }
