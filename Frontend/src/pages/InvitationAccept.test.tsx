import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { InvitationAccept } from "@/pages/InvitationAccept";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn(), ApiError: class ApiError extends Error {} }));

function context(status: "authenticated" | "unauthenticated", verified = true): AuthContextValue {
  return {
    status,
    user: status === "authenticated" ? { id: "user-1", email: "member@example.com", firstName: "Team", lastName: "Member", emailVerifiedAt: verified ? "2026-08-22T00:00:00.000Z" : null, memberships: [] } : null,
    accessToken: status === "authenticated" ? "access-token" : null,
    login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn().mockResolvedValue(undefined), logout: vi.fn(),
  };
}

describe("InvitationAccept", () => {
  it("offers sign in or registration when the invitee is logged out", () => {
    render(<AuthContext.Provider value={context("unauthenticated")}><MemoryRouter initialEntries={["/invitations/accept?token=invite-token"]}><InvitationAccept /></MemoryRouter></AuthContext.Provider>);
    expect(screen.getByTestId("auth-shell")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in to accept/i })).toHaveAttribute("href", "/login?invitation=invite-token");
    expect(screen.getByRole("link", { name: /create an account/i })).toHaveAttribute("href", "/register?invitation=invite-token");
  });

  it("accepts the invitation for a verified signed-in user", async () => {
    vi.mocked(apiRequest).mockResolvedValue({});
    const auth = context("authenticated");
    render(<AuthContext.Provider value={auth}><MemoryRouter initialEntries={["/invitations/accept?token=invite-token"]}><InvitationAccept /></MemoryRouter></AuthContext.Provider>);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/invitations/accept", expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "invite-token" }) })));
    expect(await screen.findByRole("heading", { name: "Invitation accepted" })).toBeInTheDocument();
    expect(auth.refreshUser).toHaveBeenCalledOnce();
  });
});
