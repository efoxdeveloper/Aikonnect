import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceOnboarding } from "@/components/workspace/WorkspaceOnboarding";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const workspace = {
  id: "workspace-1",
  name: "Acme Support",
  slug: "acme-support",
  country: "India",
  timezone: "Asia/Kolkata",
  onboardingCompletedAt: null,
};

function authValue(completed = false, role = "owner"): AuthContextValue {
  return {
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
          ...workspace,
          onboardingCompletedAt: completed ? "2026-08-22T00:00:00.000Z" : null,
        },
        role: {
          id: "role-1",
          name: role === "owner" ? "Owner" : "Admin",
          slug: role,
          permissions: ["workspace.update"],
        },
      }],
    },
    accessToken: "access-token",
    login: vi.fn(),
    register: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    changeEmail: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
  };
}

function renderOnboarding(auth = authValue()) {
  render(
    <AuthContext.Provider value={auth}>
      <WorkspaceOnboarding />
    </AuthContext.Provider>,
  );
  return auth;
}

describe("WorkspaceOnboarding", () => {
  beforeEach(() => vi.mocked(apiRequest).mockResolvedValue(undefined));

  it("shows a blocking setup dialog for an owner with an unfinished first workspace", () => {
    renderOnboarding();

    expect(screen.getByRole("dialog", { name: "Create your workspace" })).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace name")).toHaveValue("Acme Support");
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("defaults a new workspace to India and Asia/Kolkata", () => {
    const auth = authValue();
    if (!auth.user) throw new Error("Expected an authenticated test user");
    auth.user.memberships[0].workspace.country = null;
    auth.user.memberships[0].workspace.timezone = null;
    renderOnboarding(auth);

    expect(screen.getByRole("combobox", { name: "Country" })).toHaveTextContent("India");
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveTextContent("Asia/Kolkata");
  });

  it("completes the existing signup workspace without creating a duplicate", async () => {
    const auth = renderOnboarding();
    fireEvent.change(screen.getByLabelText("Workspace name"), {
      target: { value: "Acme Customer Care" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/onboarding/complete",
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer access-token" },
        body: JSON.stringify({
          name: "Acme Customer Care",
          country: "India",
          timezone: "Asia/Kolkata",
        }),
      }),
    ));
    expect(auth.refreshUser).toHaveBeenCalledOnce();
  });

  it("does not show onboarding after completion or to a non-owner member", () => {
    const { rerender } = render(
      <AuthContext.Provider value={authValue(true)}>
        <WorkspaceOnboarding />
      </AuthContext.Provider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <AuthContext.Provider value={authValue(false, "admin")}>
        <WorkspaceOnboarding />
      </AuthContext.Provider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
