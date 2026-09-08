import { useEffect, useState } from "react";
import { Box, Drawer } from "@mui/material";
import { useLocation } from "react-router-dom";
import { useSidebar } from "@/hooks/use-sidebar";
import { navigationGroups, type NavigationItem } from "@/config/navigation";
import { SidebarHeaderBrand } from "./SidebarHeader";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { SidebarSection } from "./SidebarSection";

const sidebarBackground = "linear-gradient(180deg,#064e3b 0%,#043f32 50%,#052e27 100%)";

const appVersion = import.meta.env.VITE_APP_VERSION ?? "0.1.0";
const appBuild = import.meta.env.VITE_APP_BUILD ?? "local";

function isItemActive(item: NavigationItem, pathname: string) {
  return Boolean(
    (item.url && (item.url === pathname || pathname.startsWith(`${item.url}/`))) ||
      item.children?.some((child) => child.url === pathname),
  );
}

export function SidebarVersion() {
  const { state } = useSidebar();
  return <Box aria-label={`Application version ${appVersion}`} title={`Application version ${appVersion} · build ${appBuild}`} data-testid="app-version" sx={{ px: 2, py: 1.5, color: "rgba(255,255,255,.45)", fontSize: 11, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", fontFamily: "var(--font-sans)" }}>
    {state === "collapsed" ? "v" : `Version ${appVersion}`}
  </Box>;
}

export function AppSidebar() {
  const { state, isMobile, openMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation().pathname;
  const activeSection = navigationGroups.find((group) => group.items.some((item) => isItemActive(item, pathname)))?.title;
  const [openSection, setOpenSection] = useState<string | null>(activeSection ?? navigationGroups[0]?.title ?? null);
  const width = isMobile ? "var(--sidebar-width)" : state === "collapsed" ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)";

  useEffect(() => {
    if (activeSection) setOpenSection(activeSection);
  }, [activeSection]);

  return <Drawer
    variant={isMobile ? "temporary" : "permanent"}
    open={isMobile ? openMobile : true}
    onClose={() => setOpenMobile(false)}
    ModalProps={{ keepMounted: true }}
    sx={{
      width,
      flexShrink: 0,
      "& .MuiDrawer-paper": {
        width,
        boxSizing: "border-box",
        overflow: "hidden",
        borderRight: "1px solid rgba(255,255,255,.1)",
        backgroundImage: sidebarBackground,
        color: "#fff",
        transition: "width 150ms ease-out",
      },
    }}
  >
    <Box sx={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column", fontFamily: "var(--font-sans)" }}>
      <Box sx={{ flexShrink: 0 }}><SidebarHeaderBrand /><WorkspaceSwitcher /></Box>
      <Box sx={{ minHeight: 0, flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,.2) transparent", pb: 2 }}>
        {navigationGroups.map((group) => <SidebarSection key={group.title} group={group} open={openSection === group.title} onToggle={() => setOpenSection((current) => current === group.title ? null : group.title)} />)}
      </Box>
      <Box sx={{ flexShrink: 0 }}><SidebarVersion /></Box>
    </Box>
  </Drawer>;
}
