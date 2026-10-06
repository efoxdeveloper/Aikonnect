import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/layout/AppHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const auth: AuthContextValue = {
  status: "authenticated",
  user: {
    id: "user-1",
    email: "owner@example.com",
    firstName: "Workspace",
    lastName: "Owner",
    emailVerifiedAt: "2026-08-22T00:00:00.000Z",
    memberships: [{
      id: "membership-1",
      workspace: {
        id: "workspace-1",
        name: "Acme Support",
        slug: "acme-support",
        country: "India",
        timezone: "Asia/Kolkata",
        onboardingCompletedAt: "2026-08-22T00:00:00.000Z",
      },
      role: { id: "role-1", name: "Owner", slug: "owner", permissions: [] },
    }],
  },
  accessToken: "access-token",
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  changeEmail: vi.fn(),
  refreshUser: vi.fn(),
  logout: vi.fn(),
};

describe("AppHeader", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(apiRequest).mockReset();
  });

  it("keeps only compact utility controls in the navbar", () => {
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <SidebarProvider>
            <AppHeader />
          </SidebarProvider>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const workspaceButton = screen.getByRole("button", { name: "Switch workspace: Acme Support" });
    expect(workspaceButton).toHaveAttribute("data-navbar-workspace");
    expect(workspaceButton).toHaveClass("rounded-md");
    expect(screen.getByText("Acme Support")).toBeInTheDocument();
    expect(screen.getByTestId("header-utility-actions")).toContainElement(workspaceButton);
    expect(screen.queryByTestId("header-search")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Marento" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Marento" })).toHaveAttribute("src", "/marento-logo-1.webp");
    expect(screen.getByRole("img", { name: "Marento" })).toHaveClass("h-11", "w-[184px]");
    expect(screen.getByTestId("sidebar-brand-header")).toBeInTheDocument();
    expect(screen.getByTestId("navbar-brand")).toHaveClass("sm:ml-0");
    expect(document.querySelector("[data-sidebar-workspace]")).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveClass("bg-[var(--sidebar-rail-background)]");
  });

  it("keeps workspace controls grouped on the right", () => {
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <SidebarProvider>
            <AppHeader />
          </SidebarProvider>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const actions = screen.getByTestId("header-utility-actions");
    expect(actions).toContainElement(screen.getByRole("button", { name: "Switch workspace: Acme Support" }));
    expect(screen.getByTestId("navbar-brand")).toHaveClass("sm:ml-0");
    expect(screen.getByRole("banner")).toHaveClass("h-[var(--header-height)]");
  });

  it("shows the yellow trial-ended pill in the navbar center", async () => {
    const trialAuth: AuthContextValue = {
      ...auth,
      user: auth.user && {
        ...auth.user,
        memberships: [{ ...auth.user.memberships[0], role: { ...auth.user.memberships[0].role, permissions: ["workspace.read"] } }],
      },
    };
    vi.mocked(apiRequest).mockResolvedValue({ status: "EXPIRED", planName: "Growth", trialEndsAt: "2026-09-01T00:00:00.000Z" });

    render(<AuthContext.Provider value={trialAuth}><MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppHeader /></SidebarProvider></MemoryRouter></AuthContext.Provider>);

    const notice = await screen.findByTestId("trial-expired-navbar-notice");
    expect(screen.getByTestId("navbar-trial-slot")).toContainElement(notice);
    expect(notice).toHaveClass("rounded-full", "border-[#c8b400]", "bg-gradient-to-b", "font-bold", "text-black");
    const plansLink = screen.getByRole("link", { name: "View plans" });
    expect(plansLink).toHaveAttribute("href", "/billing/plans");
    expect(plansLink).toHaveClass("ml-auto", "border-l", "font-bold", "text-black");
  });

  it("opens the video setup guide before the workspace selector", () => {
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <SidebarProvider>
            <AppHeader />
          </SidebarProvider>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const actions = screen.getByTestId("header-utility-actions");
    const guideButton = screen.getByRole("button", { name: "Open setup guide" });
    const workspaceButton = screen.getByRole("button", { name: "Switch workspace: Acme Support" });
    expect(actions).toContainElement(guideButton);
    expect(guideButton.compareDocumentPosition(workspaceButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(guideButton.querySelector("svg path")).toBeInTheDocument();

    fireEvent.click(guideButton);
    expect(screen.getByRole("dialog", { name: "Workspace setup guide" })).toBeInTheDocument();
    expect(screen.getByTitle("Interakt workspace setup video")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/59fdY8aGPDE?autoplay=1&rel=0");
  });
});
