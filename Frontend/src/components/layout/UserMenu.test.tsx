import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UserMenu } from "@/components/layout/UserMenu";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

describe("UserMenu", () => {
  it("revokes the session and navigates to login when signing out", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const auth: AuthContextValue = {
      status: "authenticated",
      user: {
        id: "user-1",
        email: "owner@example.com",
        firstName: "Workspace",
        lastName: "Owner",
        emailVerifiedAt: "2026-08-22T00:00:00.000Z",
        memberships: [],
      },
      accessToken: "access-token",
      login: vi.fn(),
      register: vi.fn(),
      verifyEmail: vi.fn(),
      resendVerification: vi.fn(),
      changeEmail: vi.fn(),
      refreshUser: vi.fn(),
      logout,
    };

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={<UserMenu />} />
            <Route path="/login" element={<h1>Sign in</h1>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Open profile menu" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByText("Sign Out"));

    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the active subscription name for the selected workspace", async () => {
    window.localStorage.setItem("interakt.activeWorkspaceId", "workspace-1");
    vi.mocked(apiRequest).mockResolvedValue({ active: { planName: "Growth" } });
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
          workspace: { id: "workspace-1", name: "Workspace", slug: "workspace", country: "IN", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z" },
          role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["billing.read"] },
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

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter><UserMenu /></MemoryRouter>
      </AuthContext.Provider>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Open profile menu" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Active plan · Growth")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/subscriptions", { headers: { authorization: "Bearer access-token" } });
    window.localStorage.removeItem("interakt.activeWorkspaceId");
  });
});
