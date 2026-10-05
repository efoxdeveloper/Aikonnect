import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { RequestProgress } from "./RequestProgress";

function AppShellContent({ children }: { children: React.ReactNode }) { return <><AppSidebar /><AppHeader /><RequestProgress /><div data-testid="app-shell-content" className="h-full min-h-0 min-w-0 md:ml-[var(--sidebar-collapsed-width)]">{children}</div></>; }
export function AppShell({ children }: { children: React.ReactNode }) { return <SidebarProvider><AppShellContent>{children}</AppShellContent></SidebarProvider>; }
