import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";
import { WorkspaceOnboarding } from "@/components/workspace/WorkspaceOnboarding";
import { RequestProgress } from "./RequestProgress";

function AppShellContent({ children }: { children: React.ReactNode }) { const { state } = useSidebar(); return <><AppSidebar /><AppHeader /><RequestProgress /><div className={cn("transition-[margin-left] duration-200 ease-out", state === "expanded" ? "md:ml-[var(--sidebar-collapsed-width)] xl:ml-[var(--sidebar-width)]" : "md:ml-[var(--sidebar-collapsed-width)]")}>{children}</div><WorkspaceOnboarding /></>; }
export function AppShell({ children }: { children: React.ReactNode }) { return <SidebarProvider><AppShellContent>{children}</AppShellContent></SidebarProvider>; }
