import * as React from "react";

type SidebarContext = { state: "expanded" | "collapsed"; openMobile: boolean; isMobile: boolean; setOpenMobile: (open: boolean) => void; toggleSidebar: () => void; };
const SidebarContext = React.createContext<SidebarContext | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(() => typeof window !== "undefined" && window.localStorage.getItem("interakt-sidebar") === "collapsed");
  const [isCompact, setIsCompact] = React.useState(false);
  const [openMobile, setOpenMobile] = React.useState(false);
  React.useEffect(() => { const mobile = window.matchMedia("(max-width: 767px)"); const compact = window.matchMedia("(max-width: 1199px)"); const update = () => { setIsMobile(mobile.matches); setIsCompact(compact.matches && !mobile.matches); }; update(); mobile.addEventListener("change", update); compact.addEventListener("change", update); return () => { mobile.removeEventListener("change", update); compact.removeEventListener("change", update); }; }, []);
  const toggleSidebar = React.useCallback(() => isMobile ? setOpenMobile((open) => !open) : setCollapsed((open) => { const next = !open; window.localStorage.setItem("interakt-sidebar", next ? "collapsed" : "expanded"); return next; }), [isMobile]);
  React.useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") { event.preventDefault(); toggleSidebar(); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [toggleSidebar]);
  return <SidebarContext.Provider value={{ state: collapsed || isCompact ? "collapsed" : "expanded", openMobile, setOpenMobile, isMobile, toggleSidebar }}>{children}</SidebarContext.Provider>;
}
export function useSidebar() { const context = React.useContext(SidebarContext); if (!context) throw new Error("useSidebar must be used inside SidebarProvider"); return context; }
