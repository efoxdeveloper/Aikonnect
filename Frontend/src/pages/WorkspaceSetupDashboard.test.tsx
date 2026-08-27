import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { WorkspaceSetupDashboard } from "@/pages/WorkspaceSetupDashboard";
import { WhatsAppAccountSetup } from "@/pages/WhatsAppAccountSetup";
import { apiRequest } from "@/lib/api";
import { loadFacebookSdk } from "@/lib/meta-embedded-signup";
import type { WorkspaceSetupData } from "@/types/workspace";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/meta-embedded-signup", () => ({ loadFacebookSdk: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const setupData: WorkspaceSetupData = {
  workspace: { id: "workspace-1", name: "Acme Support" },
  progress: {
    workspaceCreated: true,
    whatsappConnected: false,
    phoneNumberConnected: false,
    testMessageSent: false,
    completedSteps: 1,
    totalSteps: 4,
    percentage: 25,
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
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset().mockResolvedValue(setupData);
    vi.mocked(loadFacebookSdk).mockReset();
  });

  it("opens Meta Embedded Signup directly from the Overview action", async () => {
    const login = vi.fn();
    vi.mocked(loadFacebookSdk).mockResolvedValue({ init: vi.fn(), login });
    renderWithAuth(<WorkspaceSetupDashboard />, "/dashboard");

    expect(await screen.findByRole("heading", { name: "Welcome, Pawan" })).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    const connectButton = screen.getByRole("button", { name: "Connect" });
    expect(connectButton).toBeEnabled();
    fireEvent.click(connectButton);
    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(screen.getByText("Workspace created")).toBeInTheDocument();
    expect(screen.queryByText("Invite your team")).not.toBeInTheDocument();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/setup",
      { headers: { authorization: "Bearer access-token" } },
    ));
  });

  it("launches Meta Embedded Signup instead of asking for credentials", async () => {
    const login = vi.fn((callback: (response: FacebookLoginResponse) => void) => callback({ authResponse: { code: "meta-auth-code" } }));
    vi.mocked(loadFacebookSdk).mockResolvedValue({ init: vi.fn(), login });
    renderWithAuth(<WhatsAppAccountSetup />, "/whatsapp-account");

    expect(await screen.findByRole("heading", { name: "WhatsApp Business account" })).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Continue with Meta" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(login).toHaveBeenCalled());
    window.dispatchEvent(new MessageEvent("message", {
      origin: "https://www.facebook.com",
      data: JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { business_id: "business-1", waba_id: "waba-1", phone_number_id: "phone-1" } }),
    }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/whatsapp/embedded-signup",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "meta-auth-code", wabaId: "waba-1", phoneNumberId: "phone-1", businessId: "business-1" }) }),
    ));
  });
});
