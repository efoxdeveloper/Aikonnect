import { useEffect, useState } from "react";
import { ChevronDownIcon as ChevronDown, ChevronRightIcon as ChevronRight } from "@animateicons/react/lucide";
import { Box, Collapse, List, ListItem, ListItemButton, Typography } from "@mui/material";
import { useLocation } from "react-router-dom";
import type { NavigationGroup, NavigationItem } from "@/config/navigation";
import { useSidebar } from "@/hooks/use-sidebar";
import { SidebarMenuItem } from "./SidebarMenuItem";

function isItemActive(item: NavigationItem, pathname: string) {
  return Boolean(
    (item.url && (item.url === pathname || pathname.startsWith(`${item.url}/`))) ||
      item.children?.some((child) => child.url === pathname),
  );
}

export function SidebarSection({ group, open: controlledOpen, onToggle }: { group: NavigationGroup; open?: boolean; onToggle?: () => void }) {
  const { state } = useSidebar();
  const pathname = useLocation().pathname;
  const active = group.items.some((item) => isItemActive(item, pathname));
  const [internalOpen, setInternalOpen] = useState(active);
  const open = controlledOpen ?? internalOpen;

  useEffect(() => {
    if (controlledOpen === undefined && active) setInternalOpen(true);
  }, [active, controlledOpen]);

  const toggle = () => {
    if (onToggle) onToggle();
    else setInternalOpen((value) => !value);
  };

  return <Box component="section" sx={{ width: "100%", minWidth: 0, px: 1.5 }}>
    {state === "collapsed" ? null : <ListItem disablePadding sx={{ display: "block", mt: 1.5, mb: 0.5 }}>
      <ListItemButton
        component="button"
        type="button"
        aria-expanded={open}
        aria-controls={`sidebar-section-${group.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
        onClick={toggle}
        sx={{ minHeight: 40, width: "100%", borderRadius: 1, borderBottom: "1px solid rgba(255,255,255,.14)", px: 1.25, color: "rgba(255,255,255,.72)", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, letterSpacing: "-.005em", lineHeight: "20px", textTransform: "none", justifyContent: "space-between", "&:hover": { backgroundColor: "rgba(255,255,255,.07)", color: "#fff", borderBottomColor: "rgba(255,255,255,.24)" } }}
      >
        <Typography component="span" sx={{ color: "inherit", fontFamily: "inherit", fontSize: "inherit", fontWeight: "inherit", letterSpacing: "inherit", lineHeight: 1 }}>{group.title}</Typography>
        {open ? <ChevronDown size={15} duration={0.6} /> : <ChevronRight size={15} duration={0.6} />}
      </ListItemButton>
    </ListItem>}
    <Collapse in={state === "collapsed" || open} timeout="auto" unmountOnExit>
      <List id={`sidebar-section-${group.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} disablePadding sx={{ display: "flex", width: "100%", minWidth: 0, flexDirection: "column", gap: "1px" }}>
        {group.items.map((item) => <SidebarMenuItem key={item.title} item={item} />)}
      </List>
    </Collapse>
  </Box>;
}
