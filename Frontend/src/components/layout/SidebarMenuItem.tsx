import { useRef, useState } from "react";
import { ChevronDownIcon as ChevronDown, ChevronRightIcon as ChevronRight } from "@animateicons/react/lucide";
import { Badge, Collapse, ListItem, ListItemButton, ListItemIcon, ListItemText, List, Tooltip } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import type { AnimatedIconHandle, NavigationItem } from "@/config/navigation";
import { useSidebar } from "@/hooks/use-sidebar";

function isItemActive(item: NavigationItem, pathname: string) {
  return Boolean(
    (item.url && (item.url === pathname || pathname.startsWith(`${item.url}/`))) ||
      item.children?.some((child) => child.url === pathname),
  );
}

const buttonSx = {
  minHeight: 44,
  mx: 1.5,
  width: "calc(100% - 24px)",
  borderRadius: 1,
  px: 1.5,
  color: "rgba(255,255,255,.9)",
  fontSize: 14,
  fontWeight: 500,
  textAlign: "left",
  fontFamily: "var(--font-sans)",
  transition: "background-color 180ms ease, color 180ms ease, transform 180ms ease",
  "&:hover": { backgroundColor: "rgba(255,255,255,.09)" },
  "&:active": { transform: "scale(.98)" },
  "&[data-active=true]": { backgroundColor: "rgba(255,255,255,.055)", color: "#fff", fontWeight: 600 },
  "&[data-active=true] .MuiListItemIcon-root": { color: "#6ee7b7" },
  "&:focus-visible": { outline: "2px solid rgba(110,231,183,.7)", outlineOffset: 2 },
};

const childButtonSx = {
  minHeight: 28,
  borderRadius: 1,
  px: 1,
  py: 0,
  color: "rgba(255,255,255,.6)",
  fontSize: 13,
  fontWeight: 400,
  "&:hover": { backgroundColor: "rgba(255,255,255,.07)", color: "#fff" },
  "&[data-active=true]": { color: "#fff", fontWeight: 500 },
};

export function SidebarMenuItem({ item }: { item: NavigationItem }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const location = useLocation();
  const active = isItemActive(item, location.pathname);
  const hasChildren = Boolean(item.children?.length);
  const [open, setOpen] = useState(active);
  const iconRef = useRef<AnimatedIconHandle>(null);
  const handleNavigation = () => { if (isMobile) setOpenMobile(false); };
  const destination = item.url ?? item.children?.[0]?.url ?? "#";
  const icon = <item.icon ref={iconRef} size={20} duration={0.7} />;
  const trailing = state !== "collapsed" && (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {item.badge && <Badge badgeContent={item.badge.text} color={item.badge.variant === "danger" ? "error" : item.badge.variant === "warning" ? "warning" : "success"} sx={{ position: "static", fontFamily: "var(--font-sans)", "& .MuiBadge-badge": { position: "static", transform: "none", minWidth: 21, height: 21, px: .75, fontSize: 11, fontFamily: "var(--font-sans)" } }} />}
      {hasChildren && (open ? <ChevronDown size={16} duration={0.6} /> : <ChevronRight size={16} duration={0.6} />)}
    </span>
  );
  const label = state === "collapsed" ? null : <ListItemText primary={item.title} slotProps={{ primary: { noWrap: true, sx: { fontSize: 14, lineHeight: "20px", fontFamily: "var(--font-sans)" } } }} />;
  const common = {
    "data-active": active ? "true" : undefined,
    onMouseEnter: () => iconRef.current?.startAnimation(),
    onMouseLeave: () => iconRef.current?.stopAnimation(),
    sx: buttonSx,
  } as const;

  if (state === "collapsed") {
    return <ListItem disablePadding sx={{ display: "block" }}>
      <Tooltip title={item.title} placement="right" enterDelay={200}>
        <ListItemButton component={Link} to={destination} onClick={handleNavigation} aria-current={active ? "page" : undefined} {...common} sx={{ ...buttonSx, width: 44, mx: "auto", px: 0, justifyContent: "center" }}>
          <ListItemIcon sx={{ minWidth: 0, color: "inherit", justifyContent: "center" }}>{icon}</ListItemIcon>
        </ListItemButton>
      </Tooltip>
    </ListItem>;
  }

  if (!hasChildren) {
    return <ListItem disablePadding sx={{ display: "block" }}>
      <ListItemButton component={Link} to={destination} onClick={handleNavigation} aria-current={active ? "page" : undefined} {...common}>
        <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>{icon}</ListItemIcon>{label}{trailing}
      </ListItemButton>
    </ListItem>;
  }

  return <ListItem disablePadding sx={{ display: "block" }}>
    <ListItemButton component="button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} {...common}>
      <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>{icon}</ListItemIcon>{label}{trailing}
    </ListItemButton>
    <Collapse in={open} timeout="auto" unmountOnExit>
      <List component="ul" disablePadding sx={{ ml: 4.5, mr: 1.5, py: 0 }}>
        {item.children?.map((child) => {
          const childActive = location.pathname === child.url;
          return <ListItem key={child.title} disablePadding>
            <ListItemButton component={Link} to={child.url ?? "#"} onClick={handleNavigation} aria-current={childActive ? "page" : undefined} data-active={childActive ? "true" : undefined} sx={childButtonSx}>
              <ListItemText primary={child.title} sx={{ my: 0 }} slotProps={{ primary: { noWrap: true, sx: { fontSize: 13, lineHeight: "18px", fontFamily: "var(--font-sans)" } } }} />
            </ListItemButton>
          </ListItem>;
        })}
      </List>
    </Collapse>
  </ListItem>;
}
