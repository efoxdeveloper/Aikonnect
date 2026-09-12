import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/layout/AppHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";

vi.mock("@/components/layout/HeaderSearch", () => ({
  HeaderSearch: () => <div data-testid="header-search" />,
}));

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
  it("places the compact workspace switcher in the navbar", () => {
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <SidebarProvider>
            <AppHeader />
          </SidebarProvider>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("button", { name: "Switch workspace: Acme Support" })).toHaveAttribute("data-navbar-workspace");
    expect(screen.getByText("Acme Support")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-brand-header")).toBeInTheDocument();
    expect(document.querySelector("[data-sidebar-workspace]")).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveClass("shadow-[0_4px_12px_rgba(16,24,20,0.10)]");
    expect(screen.getByRole("banner")).not.toHaveClass("border-b");
  });
});
