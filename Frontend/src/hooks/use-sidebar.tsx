import * as React from "react";

type SidebarContext = { state: "expanded" | "collapsed"; isRailExpanded: boolean; setRailExpanded: (expanded: boolean) => void; openMobile: boolean; isMobile: boolean; setOpenMobile: (open: boolean) => void; setSidebarHovered: (hovered: boolean) => void; toggleSidebar: () => void; };
const SidebarContext = React.createContext<SidebarContext | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = React.useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = React.useState(false);
  const [isRailExpanded, setRailExpanded] = React.useState(false);
  const [openMobile, setOpenMobile] = React.useState(false);
  React.useEffect(() => { const mobile = window.matchMedia("(max-width: 767px)"); const update = () => setIsMobile(mobile.matches); update(); mobile.addEventListener("change", update); return () => mobile.removeEventListener("change", update); }, []);
  const toggleSidebar = React.useCallback(() => setOpenMobile((open) => !open), []);
  const state = isMobile || isSidebarHovered || isRailExpanded ? "expanded" : "collapsed";
  return <SidebarContext.Provider value={{ state, isRailExpanded, setRailExpanded, openMobile, setOpenMobile, setSidebarHovered: setIsSidebarHovered, isMobile, toggleSidebar }}>{children}</SidebarContext.Provider>;
}
export function useSidebar() { const context = React.useContext(SidebarContext); if (!context) throw new Error("useSidebar must be used inside SidebarProvider"); return context; }
