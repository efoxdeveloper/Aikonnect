import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarVersion } from "./AppSidebar";

vi.mock("@/hooks/use-inbox-unread-count", () => ({ useInboxUnreadCount: vi.fn(() => ({ unreadCount: 0, loading: false, refresh: vi.fn() })) }));
import { useInboxUnreadCount } from "@/hooks/use-inbox-unread-count";

describe("SidebarVersion", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
  });

  it("shows the build identifier in the sidebar footer", () => {
    render(<SidebarProvider><SidebarVersion /></SidebarProvider>);

    const version = screen.getByTestId("app-version");
    expect(version).toHaveTextContent(/^Version \d+\.\d+\.\d+$/);
    expect(version).toHaveAttribute("title", expect.stringMatching(/^Application version \d+\.\d+\.\d+ · build /));
  });

  it("does not render the workspace switcher", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(document.querySelector("[data-sidebar-workspace]")).not.toBeInTheDocument();
  });

  it("keeps the navigation separated from the brand header", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(screen.getByTestId("sidebar-navigation")).toHaveStyle({ paddingTop: "16px" });
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

  it("does not render a separate sidebar brand area", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(screen.queryByTestId("sidebar-brand-header")).not.toBeInTheDocument();
  });
});
