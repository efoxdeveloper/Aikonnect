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
    vi.mocked(loadFacebookSdk).mockReset().mockResolvedValue({ init: vi.fn(), login: vi.fn() });
    window.FB = { init: vi.fn(), login: vi.fn() };
  });

  it("opens Meta Embedded Signup directly from the Overview action", async () => {
    const login = vi.fn();
    vi.mocked(loadFacebookSdk).mockResolvedValue({ init: vi.fn(), login });
    window.FB = { init: vi.fn(), login };
    renderWithAuth(<WorkspaceSetupDashboard />, "/dashboard");

    expect(await screen.findByRole("heading", { name: "Welcome, Pawan" })).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Workspace setup progress" })).toHaveAttribute("aria-valuenow", "25");
    const progressHeading = screen.getByRole("heading", { name: "1 of 4 steps complete", level: 2 });
    expect(progressHeading).toHaveClass("!text-white");
    expect(screen.getByText("Connect WhatsApp Business is the next step.")).toHaveClass("!text-white/70");
    expect(screen.getByRole("heading", { name: "Connect WhatsApp Business", level: 2 })).toBeInTheDocument();
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

  it("shows launch actions instead of the onboarding checklist when setup is complete", async () => {
    const completed: WorkspaceSetupData = {
      ...setupData,
      progress: {
        workspaceCreated: true,
        whatsappConnected: true,
        phoneNumberConnected: true,
        testMessageSent: true,
        completedSteps: 4,
        totalSteps: 4,
        percentage: 100,
        completedAt: "2026-08-22T00:05:00.000Z",
      },
      whatsapp: {
        status: "CONNECTED",
        accountCount: 1,
        phoneNumberCount: 1,
        accounts: [{
          id: "account-1",
          metaBusinessId: "business-1",
          metaWabaId: "waba-1",
          displayName: "Acme Business",
          status: "CONNECTED",
          connectedAt: "2026-08-22T00:00:00.000Z",
          lastSyncedAt: "2026-08-22T00:00:00.000Z",
          lastError: null,
          phoneNumbers: [{
            id: "phone-1",
            metaPhoneNumberId: "meta-phone-1",
            displayPhoneNumber: "+919876543210",
            verifiedName: "Acme",
            status: "ACTIVE",
            qualityRating: "GREEN",
            messagingLimit: null,
            isOnBusinessApp: true,
            platformType: "CLOUD_API",
            connectedAt: "2026-08-22T00:00:00.000Z",
            lastSyncedAt: "2026-08-22T00:00:00.000Z",
          }],
        }],
      },
    };
    vi.mocked(apiRequest).mockReset().mockResolvedValue(completed);
    renderWithAuth(<WorkspaceSetupDashboard />, "/dashboard");

    expect(await screen.findByRole("heading", { name: "Your workspace is ready", level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId("setup-complete-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("setup-checklist")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open inbox/ })).toHaveAttribute("href", "/inbox");
    expect(screen.getByRole("link", { name: /Create campaign/ })).toHaveAttribute("href", "/campaigns");
    expect(screen.getByRole("link", { name: /View contacts/ })).toHaveAttribute("href", "/contacts");
    expect(screen.getByRole("link", { name: /Set up automation/ })).toHaveAttribute("href", "/automations");
    expect(screen.getByText("App + Cloud API")).toBeInTheDocument();
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
  });

  it("launches Meta Embedded Signup instead of asking for credentials", async () => {
    const login = vi.fn((callback: (response: FacebookLoginResponse) => void) => callback({ authResponse: { code: "meta-auth-code" } }));
    vi.mocked(loadFacebookSdk).mockResolvedValue({ init: vi.fn(), login });
    window.FB = { init: vi.fn(), login };
    renderWithAuth(<WhatsAppAccountSetup />, "/whatsapp-account");

    expect(await screen.findByRole("heading", { name: "WhatsApp Business account" })).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Connect existing Business App" });
    expect(button).toBeEnabled();
    expect(screen.getByRole("list", { name: "Coexistence setup steps" })).toBeInTheDocument();
    expect(screen.getByText("The QR code appears inside Meta’s secure flow")).toBeInTheDocument();
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

  it("shows test-message and disconnect actions after WhatsApp is connected", async () => {
    const connected = {
      ...setupData,
      progress: { ...setupData.progress, whatsappConnected: true, phoneNumberConnected: true, completedSteps: 3, percentage: 75 },
      whatsapp: {
        status: "CONNECTED" as const, accountCount: 1, phoneNumberCount: 1,
      accounts: [{ id: "account-1", metaBusinessId: "business-1", metaWabaId: "waba-1", displayName: "Acme Business", status: "CONNECTED" as const, connectedAt: "2026-08-22T00:00:00.000Z", lastSyncedAt: "2026-08-22T00:00:00.000Z", lastError: null, phoneNumbers: [{ id: "phone-1", metaPhoneNumberId: "meta-phone-1", displayPhoneNumber: "+919876543210", verifiedName: "Acme", status: "ACTIVE" as const, qualityRating: "GREEN", messagingLimit: null, isOnBusinessApp: true, platformType: "CLOUD_API", connectedAt: "2026-08-22T00:00:00.000Z", lastSyncedAt: "2026-08-22T00:00:00.000Z" }] }],
      },
    };
    vi.mocked(apiRequest).mockReset().mockResolvedValue(connected);
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderWithAuth(<WhatsAppAccountSetup />, "/whatsapp-account");
    expect(await screen.findByText("WhatsApp is connected")).toBeInTheDocument();
    expect(screen.getByText("Coexistence active")).toBeInTheDocument();
    expect(screen.getByText("Phone app")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect existing Business App" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Test recipient phone number"), { target: { value: "+919876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/whatsapp/test-message", expect.objectContaining({ method: "POST", body: JSON.stringify({ to: "+919876543210" }) })));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/whatsapp/connection", expect.objectContaining({ method: "DELETE" })));
  });
});
