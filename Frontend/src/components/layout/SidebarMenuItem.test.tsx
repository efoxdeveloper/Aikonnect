import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { House } from "@animateicons/react/lucide";
import { SidebarMenuItem } from "@/components/layout/SidebarMenuItem";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import type { NavigationItem } from "@/config/navigation";
import { navigationGroups } from "@/config/navigation";

const item: NavigationItem = { title: "Dashboard", url: "/dashboard", icon: House };
const nestedItem: NavigationItem = { title: "Reports", icon: House, children: [{ title: "Overview", url: "/reports", icon: House }] };

function MobileState() {
  const { openMobile, setOpenMobile } = useSidebar();
  return <><button type="button" onClick={() => setOpenMobile(true)}>Open mobile navigation</button><output data-testid="mobile-state">{String(openMobile)}</output></>;
}

describe("SidebarMenuItem", () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024, writable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth, writable: true });
  });

  it("marks the current route immediately and exposes the page relationship", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><SidebarMenuItem item={item} /></SidebarProvider></MemoryRouter>);

    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveAttribute("data-active", "true");
  });

  it("closes mobile navigation after an SPA link is selected", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375, writable: true });
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><MobileState /><SidebarMenuItem item={item} /></SidebarProvider></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Open mobile navigation" }));
    expect(screen.getByTestId("mobile-state")).toHaveTextContent("true");
    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(screen.getByTestId("mobile-state")).toHaveTextContent("false");
  });

  it("renders Dashboard as a direct link to the Overview screen", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
    const dashboard = navigationGroups[0].items[0];
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><SidebarMenuItem item={dashboard} /></SidebarProvider></MemoryRouter>);

    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("href", "/dashboard");
    expect(link).not.toHaveAttribute("aria-expanded");
    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
  });

  it("uses the application Inter font variable for sidebar labels", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><SidebarMenuItem item={item} /></SidebarProvider></MemoryRouter>);

    expect(screen.getByText("Dashboard")).toHaveStyle({ fontFamily: "var(--font-sans)" });
  });

  it("keeps submenu rows compact without a vertical rail", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
    render(<MemoryRouter initialEntries={["/reports"]}><SidebarProvider><SidebarMenuItem item={nestedItem} /></SidebarProvider></MemoryRouter>);

    const child = screen.getByRole("link", { name: "Overview" });
    expect(child).toHaveStyle({ minHeight: "28px" });
    expect(child).not.toHaveStyle({ boxShadow: "inset 3px 0 0 #34d399" });
    expect(child.closest("ul")).not.toHaveStyle({ borderLeft: "1px solid rgba(255,255,255,.1)" });
  });
});
