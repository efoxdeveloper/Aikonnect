import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";
import { WorkspaceOnboarding } from "@/components/workspace/WorkspaceOnboarding";

function AppShellContent({ children }: { children: React.ReactNode }) { const { state } = useSidebar(); return <><AppSidebar /><AppHeader /><div className={cn("transition-[margin-left] duration-150 ease-out md:ml-[var(--sidebar-collapsed-width)]", state === "expanded" && "xl:ml-[var(--sidebar-width)]")}>{children}</div><WorkspaceOnboarding /></>; }
export function AppShell({ children }: { children: React.ReactNode }) { return <SidebarProvider><AppShellContent>{children}</AppShellContent></SidebarProvider>; }
