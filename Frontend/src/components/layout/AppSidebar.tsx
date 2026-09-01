import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { navigationGroups } from "@/config/navigation";
import { SidebarHeaderBrand } from "./SidebarHeader";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { SidebarSection } from "./SidebarSection";

export function AppSidebar({ mobile = false }: { mobile?: boolean }) { const content = <><SidebarHeader><SidebarHeaderBrand /><WorkspaceSwitcher /></SidebarHeader><SidebarContent className="pb-5 pt-0">{navigationGroups.map((group) => <SidebarSection key={group.title} group={group} />)}</SidebarContent><SidebarFooter /></>; return mobile ? <div className="flex h-full w-full flex-col bg-[linear-gradient(180deg,#064e3b_0%,#043f32_50%,#052e27_100%)]">{content}</div> : <Sidebar>{content}</Sidebar>; }
