import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSettings } from "@/pages/WorkspaceSettings";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const workspace = {
  id: "workspace-1", name: "Acme Support", slug: "acme-support", companyName: "Acme Ltd", companyWebsite: "https://acme.example", companyLocation: "Delhi", annualRevenue: "under-50-lakh", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z", ownerId: "owner", createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z", _count: { memberships: 2, roles: 4, invitations: 1 },
};

const auth = (permissions = ["workspace.read", "workspace.update"]): AuthContextValue => ({
  status: "authenticated", user: { id: "owner", email: "owner@example.com", firstName: "Workspace", lastName: "Owner", emailVerifiedAt: "2026-08-22T00:00:00.000Z", memberships: [{ id: "membership-1", workspace: { id: "workspace-1", name: "Acme Support", slug: "acme-support", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z" }, role: { id: "owner-role", name: "Owner", slug: "owner", permissions } }] },
  accessToken: "access-token", login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn().mockResolvedValue(undefined), logout: vi.fn(),
});

describe("WorkspaceSettings", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("loads workspace details and saves edits for an administrator", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(workspace).mockResolvedValueOnce({ ...workspace, name: "Updated Support" });
    render(<AuthContext.Provider value={auth()}><MemoryRouter><WorkspaceSettings /></MemoryRouter></AuthContext.Provider>);
    expect(await screen.findByDisplayValue("Acme Support")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Updated Support" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith("/workspaces/workspace-1", expect.objectContaining({ method: "PATCH", body: expect.stringContaining("Updated Support") })));
    expect(await screen.findByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("renders read-only access without a save action when permission is missing", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(workspace);
    render(<AuthContext.Provider value={auth(["workspace.read"])}><MemoryRouter><WorkspaceSettings /></MemoryRouter></AuthContext.Provider>);
    expect(await screen.findByText(/only workspace administrators can edit/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Workspace name")).toBeDisabled();
  });
});
