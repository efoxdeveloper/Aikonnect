import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";

vi.mock("@/hooks/use-inbox-unread-count", () => ({ useInboxUnreadCount: vi.fn(() => ({ unreadCount: 0, loading: false, refresh: vi.fn() })) }));
import { useInboxUnreadCount } from "@/hooks/use-inbox-unread-count";

function OpenMobileNavigation() {
  const { setOpenMobile } = useSidebar();
  useEffect(() => setOpenMobile(true), [setOpenMobile]);
  return null;
}

describe("AppSidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
  });

  it("keeps the rail icon-only on hover and shows only the active module in its side menu", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    const sidebar = screen.getByTestId("app-sidebar");
    expect(sidebar).toHaveAttribute("data-state", "rail");
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByText("Campaigns")).not.toBeInTheDocument();
    fireEvent.mouseEnter(sidebar);
    expect(screen.queryByText("Campaigns")).not.toBeInTheDocument();
    expect(sidebar).toHaveAttribute("data-state", "rail");
    fireEvent.mouseLeave(sidebar);
    expect(sidebar).toHaveAttribute("data-state", "rail");
  });

  it("shows the group name in the Marketing rail tooltip", async () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    const marketing = screen.getByTestId("sidebar-rail-campaigns");
    expect(marketing).toHaveAttribute("href", "/campaigns");
    fireEvent.mouseEnter(marketing);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Marketing");
  });

  it("expands from the bottom toggle to show only the main module links", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute("data-state", "rail-expanded");
    expect(screen.queryByTestId("app-version")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Campaigns" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contacts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/account-settings");
    expect(screen.queryByText("Templates")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute("data-state", "rail");
    expect(screen.queryByText("Contacts")).not.toBeInTheDocument();
  });

  it("keeps notifications and the account menu in the sidebar footer", () => {
    const auth = {
      status: "authenticated",
      accessToken: "access-token",
      user: {
        id: "user-1",
        email: "pawan@example.com",
        firstName: "Pawan",
        lastName: "Patel",
        emailVerifiedAt: "2026-08-22T00:00:00.000Z",
        memberships: [],
      },
      login: vi.fn(),
      register: vi.fn(),
      verifyEmail: vi.fn(),
      resendVerification: vi.fn(),
      changeEmail: vi.fn(),
      refreshUser: vi.fn(),
      logout: vi.fn(),
    } as AuthContextValue;

    render(<AuthContext.Provider value={auth}><MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter></AuthContext.Provider>);

    const footer = screen.getByTestId("sidebar-account-footer");
    expect(footer).toContainElement(screen.getByRole("button", { name: "Notifications" }));
    expect(footer).toContainElement(screen.getByRole("button", { name: "Open profile menu" }));

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByTestId("sidebar-notifications")).toHaveTextContent("Notifications");
    expect(screen.getByRole("button", { name: "Open profile menu" })).toHaveTextContent("Pawan Patel");
    expect(screen.getByRole("button", { name: "Open profile menu" })).toHaveTextContent("pawan@example.com");
  });

  it("shows a concise submenu containing only links for the active module", () => {
    render(<MemoryRouter initialEntries={["/campaigns"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    const menu = screen.getByTestId("sidebar-context-menu");
    expect(menu).toHaveTextContent("Marketing");
    expect(menu).toHaveTextContent("Campaigns");
    expect(menu).toHaveTextContent("Templates");
    expect(menu).toHaveTextContent("Automation");
    const secondaryNavigation = within(menu).getByRole("list", { name: "Marketing navigation" });
    expect(within(secondaryNavigation).getByRole("link", { name: "Campaigns" })).toHaveStyle({ minHeight: "36px" });
    expect(menu).not.toHaveTextContent("Contacts");
    const sidebarPaper = menu.querySelector(".MuiDrawer-paper");
    expect((sidebarPaper as HTMLElement).style.borderRadius).toBe("16px 0 0 16px");
    expect((sidebarPaper as HTMLElement).style.borderRightWidth).toBe("1px");
    expect(getComputedStyle(sidebarPaper as HTMLElement).left).toBe("var(--sidebar-collapsed-width)");
    expect(getComputedStyle(sidebarPaper as HTMLElement).width).toBe("var(--sidebar-width)");
    expect(getComputedStyle(sidebarPaper as HTMLElement).backgroundColor).toBe("rgb(250, 250, 250)");
    expect(screen.getByTestId("sidebar-content-shell")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-content-backdrop")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("shows automation destinations in the existing Marketing secondary sidebar", () => {
    render(<MemoryRouter initialEntries={["/automations"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    const menu = screen.getByTestId("sidebar-context-menu");
    const navigation = within(menu).getByRole("list", { name: "Marketing navigation" });
    expect(within(navigation).getByRole("link", { name: "Automation" })).toHaveAttribute("href", "/automations");
    expect(within(navigation).getByRole("link", { name: "Automation" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Workflows" })).toHaveAttribute("href", "/workflows");
    expect(within(navigation).getByRole("link", { name: "Sequences" })).toHaveAttribute("href", "/sequences");
  });

  it("uses Settings and a gear icon for the settings module entry", () => {
    render(<MemoryRouter initialEntries={["/team-members"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    const settings = screen.getByRole("link", { name: "Settings" });
    expect(settings).toHaveAttribute("href", "/account-settings");
    expect(settings).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("sidebar-context-menu")).toHaveTextContent("Account Settings");
    expect(screen.getByTestId("sidebar-context-menu")).toHaveTextContent("WhatsApp Account");
  });

  it("shows billing pages directly in the Settings secondary sidebar", () => {
    render(<MemoryRouter initialEntries={["/billing/subscriptions"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    const settingsNavigation = screen.getByRole("list", { name: "Settings navigation" });
    expect(within(settingsNavigation).getByRole("link", { name: "Usage & wallet" })).toHaveAttribute("href", "/billing");
    const subscriptions = within(settingsNavigation).getByRole("link", { name: "Subscriptions" });
    expect(subscriptions).toHaveAttribute("aria-current", "page");
    expect(subscriptions.querySelector("svg")).toHaveClass("lucide-crown");
    expect(subscriptions.querySelector(".MuiListItemIcon-root")).toHaveStyle({ color: "#eab308" });
    expect(within(settingsNavigation).getByRole("link", { name: "Plans & pricing" })).toHaveAttribute("href", "/billing/plans");
    expect(screen.queryByRole("navigation", { name: "Billing navigation" })).not.toBeInTheDocument();
  });

  it("uses a readable grouped drawer on narrow viewports", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375, writable: true });
    render(<MemoryRouter initialEntries={["/campaigns"]}><SidebarProvider><OpenMobileNavigation /><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(screen.getByTestId("app-sidebar")).toHaveAttribute("data-state", "mobile");
    expect(screen.getByRole("link", { name: "Templates" })).toBeInTheDocument();
    expect(screen.getByText("Sales & CRM")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Application modules" })).not.toBeInTheDocument();
  });

  it("does not render the workspace switcher", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(document.querySelector("[data-sidebar-workspace]")).not.toBeInTheDocument();
  });

  it("keeps the navigation separated from the brand header", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(screen.getByRole("list", { name: "Application modules" })).toBeInTheDocument();
  });

  it("renders the active workspace Inbox unread count", () => {
    vi.mocked(useInboxUnreadCount).mockReturnValue({ unreadCount: 7, loading: false, refresh: vi.fn() });
    const auth = {
      status: "authenticated",
      accessToken: "access-token",
      user: {
        id: "user-1",
        email: "owner@example.com",
        firstName: "Workspace",
        lastName: "Owner",
        emailVerifiedAt: "2026-08-22T00:00:00.000Z",
        memberships: [{
          id: "membership-1",
          workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: null },
          role: { id: "role-1", name: "Agent", slug: "agent", permissions: ["inbox.read"] },
        }],
      },
    } as AuthContextValue;

    render(<AuthContext.Provider value={auth}><MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter></AuthContext.Provider>);

    expect(screen.getByTestId("inbox-badge")).toHaveTextContent("7");
  });

  it("keeps branding in the navbar instead of duplicating it in the rail", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(screen.queryByTestId("sidebar-logo")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-brand-header")).not.toBeInTheDocument();
  });

  it("shows only the platform links allowed for the signed-in platform role", () => {
    const auth = {
      status: "authenticated",
      accessToken: "access-token",
      user: {
        id: "platform-1",
        email: "support@example.com",
        firstName: "Platform",
        lastName: "Support",
        emailVerifiedAt: "2026-08-22T00:00:00.000Z",
        platformRole: "SUPPORT",
        memberships: [],
      },
      login: vi.fn(),
      register: vi.fn(),
      verifyEmail: vi.fn(),
      resendVerification: vi.fn(),
      changeEmail: vi.fn(),
      refreshUser: vi.fn(),
      logout: vi.fn(),
    } as AuthContextValue;

    render(<AuthContext.Provider value={auth}><MemoryRouter initialEntries={["/admin/workspaces"]}><SidebarProvider><AppSidebar platformOnly /></SidebarProvider></MemoryRouter></AuthContext.Provider>);

    expect(screen.getByTestId("sidebar-context-menu")).toHaveTextContent("Workspaces");
    expect(screen.getByTestId("sidebar-context-menu")).toHaveTextContent("Users");
    expect(screen.getByTestId("sidebar-context-menu")).toHaveTextContent("WhatsApp connections");
    expect(screen.queryByText("Billing & subscriptions")).not.toBeInTheDocument();
    expect(screen.queryByText("Platform admins")).not.toBeInTheDocument();
    expect(screen.queryByText("Audit log")).not.toBeInTheDocument();
  });
});
