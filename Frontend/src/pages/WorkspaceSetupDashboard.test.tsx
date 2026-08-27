import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { WorkspaceSetupDashboard } from "@/pages/WorkspaceSetupDashboard";
import { WhatsAppAccountSetup } from "@/pages/WhatsAppAccountSetup";
import { apiRequest } from "@/lib/api";
import type { WorkspaceSetupData } from "@/types/workspace";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const setupData: WorkspaceSetupData = {
  workspace: { id: "workspace-1", name: "Acme Support" },
  progress: {
    workspaceCreated: true,
    whatsappConnected: false,
    phoneNumberConnected: false,
    teammateInvited: false,
    testMessageSent: false,
    completedSteps: 1,
    totalSteps: 5,
    percentage: 20,
    completedAt: null,
  },
  whatsapp: {
    status: "DISCONNECTED",
    accountCount: 0,
    phoneNumberCount: 0,
    accounts: [],
  },
  team: { memberCount: 1, pendingInvitationCount: 0 },
};

const auth: AuthContextValue = {
  status: "authenticated",
  user: {
    id: "user-1",
    email: "owner@example.com",
    firstName: "Pawan",
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
      role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["workspace.read"] },
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

function renderWithAuth(component: React.ReactNode, route: string) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[route]}>{component}</MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("workspace setup experience", () => {
  beforeEach(() => vi.mocked(apiRequest).mockResolvedValue(setupData));

  it("loads persisted progress and exposes the next available setup action", async () => {
    renderWithAuth(<WorkspaceSetupDashboard />, "/dashboard");

    expect(await screen.findByRole("heading", { name: "Welcome, Pawan" })).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute("href", "/whatsapp-account");
    expect(screen.getByText("Workspace created")).toBeInTheDocument();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/setup",
      { headers: { authorization: "Bearer access-token" } },
    ));
  });

  it("shows the Meta requirements while the real connection is unavailable", async () => {
    renderWithAuth(<WhatsAppAccountSetup />, "/whatsapp-account");

    expect(await screen.findByRole("heading", { name: "WhatsApp Business account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Meta" })).toBeDisabled();
    expect(screen.getByText(/App ID, App Secret, Configuration ID/i)).toBeInTheDocument();
  });
});
