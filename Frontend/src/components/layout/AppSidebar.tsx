import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { navigationGroups } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { SidebarHeaderBrand } from "./SidebarHeader";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { SidebarSection } from "./SidebarSection";

const appVersion = import.meta.env.VITE_APP_VERSION ?? "0.1.0";
const appBuild = import.meta.env.VITE_APP_BUILD ?? "local";

export function SidebarVersion() {
  const { state } = useSidebar();
  return <div aria-label={`Application version ${appVersion}`} title={`Application version ${appVersion} · build ${appBuild}`} data-testid="app-version" className={cn("border-t border-white/10 px-4 py-3 text-[10px] font-medium tracking-[0.04em] text-white/45 transition-[padding,opacity] duration-150", state === "collapsed" && "px-0 text-center")}>{state === "collapsed" ? "v" : `Version ${appVersion}`}</div>;
}

export function AppSidebar({ mobile = false }: { mobile?: boolean }) { const content = <><SidebarHeader><SidebarHeaderBrand /><WorkspaceSwitcher /></SidebarHeader><SidebarContent className="pb-5 pt-0">{navigationGroups.map((group) => <SidebarSection key={group.title} group={group} />)}</SidebarContent><SidebarFooter><SidebarVersion /></SidebarFooter></>; return mobile ? <div className="flex h-full w-full flex-col bg-[linear-gradient(180deg,#064e3b_0%,#043f32_50%,#052e27_100%)]">{content}</div> : <Sidebar>{content}</Sidebar>; }
