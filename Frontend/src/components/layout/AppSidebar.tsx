import { useContext, useMemo } from "react";
import { Badge, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Tooltip, Typography } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import { SettingsIcon as Settings, ShieldCheck } from "@animateicons/react/lucide";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { navigationGroups, platformNavigationGroups, getActiveNavigationGroup, isNavigationItemActive, type NavigationGroup, type NavigationItem } from "@/config/navigation";
import { AuthContext } from "@/contexts/AuthContext";
import { getActiveMembership } from "@/lib/workspace";
import { useInboxUnreadCount } from "@/hooks/use-inbox-unread-count";
import { useSidebar } from "@/hooks/use-sidebar";
import { SidebarFooter } from "./SidebarFooter";

function withInboxBadge(groups: NavigationGroup[], unreadCount: number) {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => item.title === "Inbox"
      ? { ...item, badge: unreadCount > 0 ? { text: unreadCount > 99 ? "99+" : String(unreadCount), variant: "danger" as const } : undefined }
      : item),
  }));
}

function RailLink({ item, active, expanded, tooltipTitle, onClick }: { item: NavigationItem; active: boolean; expanded: boolean; tooltipTitle?: string; onClick?: () => void }) {
  const Icon = item.icon;
  const target = item.url ?? item.children?.[0]?.url ?? "/dashboard";
  return <Tooltip title={expanded ? "" : tooltipTitle ?? item.title} placement="right" arrow>
    <ListItemButton
      component={Link}
      to={target}
      aria-label={item.title}
      onClick={onClick}
      data-testid={`sidebar-rail-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      aria-current={active ? "page" : undefined}
      selected={active}
      sx={{ width: expanded ? "100%" : 40, height: 40, minHeight: 40, flex: "0 0 40px", justifyContent: expanded ? "flex-start" : "center", gap: 1.25, borderRadius: "10px", px: expanded ? 1.25 : 0, color: "var(--text-secondary)", "&.Mui-selected": { color: "var(--brand)", backgroundColor: "var(--brand-soft)" }, "&.Mui-selected:hover": { backgroundColor: "var(--brand-soft)" }, "&:hover": { color: "var(--text-primary)", backgroundColor: "var(--surface-subtle)" } }}
    >
      <ListItemIcon sx={{ minWidth: 0, color: "inherit" }}>
        <Badge data-testid={item.title === "Inbox" ? "inbox-badge" : undefined} badgeContent={item.badge?.text} color="error" overlap="circular" sx={{ "& .MuiBadge-badge": { fontSize: 9, minWidth: 15, height: 15, px: 0.5 } }}><Icon size={19} aria-hidden="true" /></Badge>
      </ListItemIcon>
      {expanded && <ListItemText primary={<Typography noWrap sx={{ fontSize: 14, fontWeight: active ? 500 : 400 }}>{item.title}</Typography>} />}
    </ListItemButton>
  </Tooltip>;
}

function ContextMenu({ group, pathname, railWidth }: { group: NavigationGroup; pathname: string; railWidth: string }) {
  const moduleTitle = group.title ?? "Navigation";
  return <Drawer data-testid="sidebar-context-menu" aria-label={`${moduleTitle} menu`} variant="permanent" slotProps={{ paper: { style: { borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: "var(--border)", borderRadius: "16px 0 0 16px" } } }} sx={{ width: "var(--sidebar-width)", flexShrink: 0, "& .MuiDrawer-paper": { position: "fixed", left: railWidth, bottom: 8, top: "calc(var(--header-height) + var(--notification-strip-height, 0px))", width: "var(--sidebar-width)", height: "auto", boxSizing: "border-box", overflow: "hidden", borderRight: "1px solid var(--border)", borderRadius: "16px 0 0 16px", backgroundColor: "#fafafa", backgroundImage: "none", boxShadow: "none", zIndex: 9 } }}>
    <Box sx={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column", fontFamily: "var(--font-sans)" }}>
      <Box sx={{ borderBottom: "1px solid var(--border)", px: 2, py: 1.25 }}>
        <Box sx={{ overflow: "hidden", color: "var(--text-primary)", fontSize: 14, fontWeight: 600, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{moduleTitle}</Box>
      </Box>
      <List aria-label={`${moduleTitle} navigation`} disablePadding sx={{ minHeight: 0, flex: 1, overflowY: "auto", px: 1, py: 0.75 }}>
        {group.items.map((item) => {
          const Icon = item.icon;
          const active = isNavigationItemActive(item, pathname);
          return <ListItemButton key={item.title} component={Link} to={item.url ?? "#"} selected={active} aria-current={active ? "page" : undefined} sx={{ minHeight: 36, mb: 0.125, gap: 1, borderRadius: "8px", px: 1.25, color: "var(--text-secondary)", "&.Mui-selected": { color: "var(--brand)", backgroundColor: "var(--brand-soft)", fontWeight: 500 }, "&.Mui-selected:hover": { backgroundColor: "var(--brand-soft)" }, "&:hover": { color: "var(--text-primary)", backgroundColor: "var(--surface-subtle)" } }}>
            <ListItemIcon sx={{ minWidth: 0, color: item.iconColor ?? "inherit" }}><Icon size={17} aria-hidden="true" /></ListItemIcon>
            <ListItemText primary={<Typography noWrap sx={{ fontSize: 14, fontWeight: active ? 500 : 400 }}>{item.title}</Typography>} />
            {item.badge && <Badge color="error" badgeContent={item.badge.text} sx={{ mr: 1 }} />}
          </ListItemButton>;
        })}
      </List>
    </Box>
  </Drawer>;
}

function MobileNavigation({ groups, pathname, onNavigate }: { groups: NavigationGroup[]; pathname: string; onNavigate: () => void }) {
  return <List data-testid="sidebar-navigation" aria-label="Main navigation" disablePadding sx={{ minHeight: 0, flex: 1, overflowY: "auto", px: 1.5, py: 1.5, fontFamily: "var(--font-sans)" }}>
    {groups.map((group, index) => <section key={group.title ?? `primary-${index}`} className="mb-4 last:mb-0">
      {group.title && <h2 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--text-muted)]">{group.title}</h2>}
      {group.items.map((item) => {
        const Icon = item.icon;
        const active = isNavigationItemActive(item, pathname);
        const target = item.url ?? item.children?.[0]?.url ?? "/dashboard";
        return <ListItemButton key={item.title} component={Link} to={target} onClick={onNavigate} selected={active} aria-current={active ? "page" : undefined} sx={{ minHeight: 40, mb: 0.25, gap: 1, borderRadius: "8px", px: 1.25, color: "var(--text-secondary)", "&.Mui-selected": { color: "var(--brand)", backgroundColor: "var(--brand-soft)", fontWeight: 500 }, "&:hover": { backgroundColor: "var(--surface-subtle)" } }}>
          <ListItemIcon sx={{ minWidth: 0, color: item.iconColor ?? "inherit" }}><Icon size={17} aria-hidden="true" /></ListItemIcon><ListItemText primary={<Typography noWrap sx={{ fontSize: 14 }}>{item.title}</Typography>} />
          {item.badge && <Badge data-testid="inbox-badge" color="error" badgeContent={item.badge.text} sx={{ mr: 1 }} />}
        </ListItemButton>;
      })}
    </section>)}
  </List>;
}

export function AppSidebar({ platformOnly = false }: { platformOnly?: boolean }) {
  const { isMobile, isRailExpanded, setRailExpanded, openMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation().pathname;
  const auth = useContext(AuthContext);
  const membership = getActiveMembership(auth?.user ?? null);
  const canReadInbox = membership?.role.permissions.includes("inbox.read") ?? false;
  const canManageAssignmentRules = membership?.role.permissions.includes("conversations.assign") ?? false;
  const { unreadCount } = useInboxUnreadCount({ workspaceId: membership?.workspace.id, accessToken: auth?.accessToken, enabled: canReadInbox });
  const platformRole = auth?.user?.platformRole;
  const canAccessPlatformAdmin = Boolean(platformRole && platformRole !== "NONE");
  const visiblePlatformRole = platformRole && platformRole !== "NONE" ? platformRole : undefined;
  const groups = useMemo(() => {
    const source = platformOnly ? platformNavigationGroups.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.platformRoles || Boolean(visiblePlatformRole && item.platformRoles.includes(visiblePlatformRole))),
    })) : navigationGroups.map((group) => ({ ...group, items: group.items.filter((item) => !item.requiredPermission || (item.requiredPermission === "conversations.assign" && canManageAssignmentRules)) }));
    const visible = withInboxBadge(source, unreadCount).filter((group) => group.items.length > 0);
    return !platformOnly && canAccessPlatformAdmin ? [...visible, { title: "Platform", items: [{ title: "Admin console", url: "/admin", icon: ShieldCheck }] }] : visible;
  }, [canAccessPlatformAdmin, canManageAssignmentRules, platformOnly, unreadCount, visiblePlatformRole]);
  const activeGroup = getActiveNavigationGroup(groups, pathname);
  const railItems: Array<{ item: NavigationItem; active: boolean; tooltipTitle?: string }> = groups.flatMap((group) => {
    if (!group.title) return group.items.map((item) => ({ item, active: isNavigationItemActive(item, pathname) }));
    const firstItem = group.items[0];
    const item = group.title === "Settings" ? { ...firstItem, title: "Settings", url: "/account-settings", icon: Settings } : firstItem;
    return [{ item, active: activeGroup === group, tooltipTitle: group.title }];
  });
  const railWidth = isRailExpanded ? "var(--sidebar-expanded-width)" : "var(--sidebar-collapsed-width)";

  if (isMobile) return <Drawer data-testid="app-sidebar" data-state="mobile" variant="temporary" open={openMobile} onClose={() => setOpenMobile(false)} ModalProps={{ keepMounted: true }} slotProps={{ paper: { style: { borderRight: "0px solid transparent" } } }} sx={{ "& .MuiDrawer-paper": { width: "min(288px, calc(100vw - 48px))", boxSizing: "border-box", top: "calc(var(--header-height) + var(--notification-strip-height, 0px))", height: "calc(100% - var(--header-height) - var(--notification-strip-height, 0px))", overflow: "hidden", borderRight: "0 !important", backgroundColor: "white", backgroundImage: "none", boxShadow: "none" } }}>
    <Box sx={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column", fontFamily: "var(--font-sans)" }}>
      <MobileNavigation groups={groups} pathname={pathname} onNavigate={() => setOpenMobile(false)} />
      <SidebarFooter expanded showProfile={Boolean(auth?.user)} />
    </Box>
  </Drawer>;

  return <>
    <Drawer data-testid="app-sidebar" data-state={isRailExpanded ? "rail-expanded" : "rail"} aria-label="Primary navigation" variant="permanent" slotProps={{ paper: { style: { borderRight: "0px solid transparent" } } }} sx={{ width: railWidth, flexShrink: 0, "& .MuiDrawer-paper": { position: "fixed", left: 0, bottom: 0, top: "calc(var(--header-height) + var(--notification-strip-height, 0px))", width: railWidth, height: "auto", boxSizing: "border-box", display: "flex", alignItems: isRailExpanded ? "stretch" : "center", overflow: "hidden", borderRight: "0 !important", backgroundColor: "var(--sidebar-rail-background)", backgroundImage: "none", boxShadow: "none", px: 0.5, py: 1, zIndex: 10, transition: "width 180ms ease-out" } }}>
      <List aria-label="Application modules" disablePadding sx={{ display: "flex", width: isRailExpanded ? "100%" : "auto", minHeight: 0, flex: 1, flexDirection: "column", alignItems: isRailExpanded ? "stretch" : "center", gap: 0.25, overflowY: "auto" }}>
        {railItems.map(({ item, active, tooltipTitle }) => <RailLink key={item.title} item={item} active={active} expanded={isRailExpanded} tooltipTitle={tooltipTitle} />)}
      </List>
      <SidebarFooter expanded={isRailExpanded} showProfile={Boolean(auth?.user)} />
      <Tooltip title={isRailExpanded ? "Collapse sidebar" : "Expand sidebar"} placement="right" arrow>
        <IconButton data-testid="sidebar-expand-toggle" aria-label={isRailExpanded ? "Collapse sidebar" : "Expand sidebar"} onClick={() => setRailExpanded(!isRailExpanded)} size="small" sx={{ width: 40, height: 40, color: "var(--text-secondary)", borderRadius: "10px", "&:hover": { color: "var(--text-primary)", backgroundColor: "var(--surface-subtle)" } }}>
          {isRailExpanded ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
        </IconButton>
      </Tooltip>
    </Drawer>
    {activeGroup && <>
      <Box data-testid="sidebar-content-shell" aria-hidden="true" sx={{ position: "fixed", left: railWidth, right: 0, bottom: 0, top: "calc(var(--header-height) + var(--notification-strip-height, 0px))", backgroundColor: "var(--sidebar-rail-background)", zIndex: 0, pointerEvents: "none" }} />
      <Box data-testid="sidebar-content-backdrop" aria-hidden="true" sx={{ position: "fixed", left: railWidth, right: 8, bottom: 8, top: "calc(var(--header-height) + var(--notification-strip-height, 0px))", borderRadius: "16px", backgroundColor: "var(--page-background)", zIndex: 1, pointerEvents: "none" }} />
      <ContextMenu group={activeGroup} pathname={pathname} railWidth={railWidth} />
    </>}
  </>;
}
