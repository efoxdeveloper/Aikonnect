import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";

vi.mock("@/components/layout/UserMenu", () => ({
  UserMenu: () => <button type="button" aria-label="Open profile menu">Profile</button>,
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

describe("HeaderActions", () => {
  it("keeps only notifications and the profile menu", () => {
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <HeaderActions />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const workspace = screen.getByRole("button", { name: "Switch workspace: Acme Support" });
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open profile menu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Meta Connection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Billing / Usage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle theme" })).not.toBeInTheDocument();
    expect(workspace).toHaveAttribute("data-navbar-workspace");
    expect(workspace.compareDocumentPosition(screen.getByRole("button", { name: "Notifications" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
