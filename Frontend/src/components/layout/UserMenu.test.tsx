import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UserMenu } from "@/components/layout/UserMenu";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";

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
});
