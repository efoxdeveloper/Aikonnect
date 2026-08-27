import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { TeamMembers } from "@/pages/TeamMembers";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const members = [
  { id: "owner-membership", status: "ACTIVE", joinedAt: "2026-08-22T00:00:00.000Z", user: { id: "owner", email: "owner@example.com", firstName: "Workspace", lastName: "Owner", phone: null, emailVerifiedAt: "2026-08-22T00:00:00.000Z", status: "ACTIVE" }, role: { id: "owner-role", name: "Owner", slug: "owner" } },
  { id: "agent-membership", status: "ACTIVE", joinedAt: "2026-08-22T00:00:00.000Z", user: { id: "agent", email: "agent@example.com", firstName: "Support", lastName: "Agent", phone: null, emailVerifiedAt: "2026-08-22T00:00:00.000Z", status: "ACTIVE" }, role: { id: "agent-role", name: "Agent", slug: "agent" } },
];
const roles = [{ id: "owner-role", name: "Owner", slug: "owner" }, { id: "admin-role", name: "Admin", slug: "admin" }, { id: "agent-role", name: "Agent", slug: "agent" }];

const auth: AuthContextValue = {
  status: "authenticated",
  user: { id: "owner", email: "owner@example.com", firstName: "Workspace", lastName: "Owner", emailVerifiedAt: "2026-08-22T00:00:00.000Z", memberships: [{ id: "owner-membership", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z" }, role: { id: "owner-role", name: "Owner", slug: "owner", permissions: ["members.read", "members.invite", "members.manage", "members.remove", "roles.manage"] } }] },
  accessToken: "access-token", login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

function renderPage() { render(<AuthContext.Provider value={auth}><MemoryRouter><TeamMembers /></MemoryRouter></AuthContext.Provider>); }

describe("TeamMembers", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.endsWith("/members") && !options?.method) return members;
      if (path.endsWith("/roles") && !options?.method) return roles;
      if (path.endsWith("/invitations") && !options?.method) return [];
      return { id: "updated" };
    });
  });

  it("loads members and sends an invitation with the selected role", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Team members" })).toBeInTheDocument();
    expect(screen.getByText("Support Agent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Invite member" }));
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "new@example.com" } });
    const sendButton = await screen.findByRole("button", { name: "Send invitation" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/invitations",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "new@example.com", roleId: "admin-role" }) }),
    ));
  });

  it("suspends a non-owner member through the protected status endpoint", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/members/agent-membership/status",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "SUSPENDED" }) }),
    ));
  });

  it("does not expose member actions to a read-only member", async () => {
    const readOnlyAuth = { ...auth, user: auth.user && { ...auth.user, memberships: [{ ...auth.user.memberships[0], role: { ...auth.user.memberships[0].role, permissions: ["members.read"] } }] } };
    render(<AuthContext.Provider value={readOnlyAuth}><MemoryRouter><TeamMembers /></MemoryRouter></AuthContext.Provider>);
    expect(await screen.findByRole("heading", { name: "Team members" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });
});
