import { SidebarGroup, SidebarGroupLabel, SidebarMenu } from "@/components/ui/sidebar";
import type { NavigationGroup } from "@/config/navigation";
import { SidebarMenuItem } from "./SidebarMenuItem";

export function SidebarSection({ group }: { group: NavigationGroup }) { return <SidebarGroup><SidebarGroupLabel>{group.title}</SidebarGroupLabel><SidebarMenu>{group.items.map((item) => <SidebarMenuItem key={item.title} item={item} />)}</SidebarMenu></SidebarGroup>; }
