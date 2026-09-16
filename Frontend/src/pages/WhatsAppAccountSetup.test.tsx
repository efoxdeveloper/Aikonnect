import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { useWhatsAppEmbeddedSignup } from "@/hooks/use-whatsapp-embedded-signup";
import { useWorkspaceSetup } from "@/hooks/use-workspace-setup";
import { WhatsAppAccountSetup } from "@/pages/WhatsAppAccountSetup";

vi.mock("@/hooks/use-workspace-setup", () => ({ useWorkspaceSetup: vi.fn() }));
vi.mock("@/hooks/use-whatsapp-embedded-signup", () => ({ useWhatsAppEmbeddedSignup: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const auth: AuthContextValue = {
  status: "authenticated",
  user: {
    id: "user-1",
    email: "agent@example.com",
    firstName: "Asha",
    lastName: "Agent",
    emailVerifiedAt: "2026-08-22T00:00:00.000Z",
    memberships: [{
      id: "membership-1",
      workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z" },
      role: { id: "owner-role", name: "Owner", slug: "owner", permissions: ["workspace.read"] },
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

const connectedData = {
  workspace: { id: "workspace-1", name: "Acme" },
  progress: { workspaceCreated: true, whatsappConnected: true, phoneNumberConnected: true, testMessageSent: false, completedSteps: 2, totalSteps: 3, percentage: 66, completedAt: null },
  whatsapp: {
    status: "CONNECTED" as const,
    accountCount: 1,
    phoneNumberCount: 1,
    accounts: [{
      id: "account-1", metaBusinessId: null, metaWabaId: null, displayName: "Acme WhatsApp", status: "CONNECTED" as const, connectedAt: null, lastSyncedAt: null, lastError: null, sharedBillingStatus: "ATTACHED", sharedBillingAllocationId: "allocation-1", sharedBillingError: null,
      phoneNumbers: [{ id: "phone-1", metaPhoneNumberId: "meta-phone-1", displayPhoneNumber: "+919876543210", verifiedName: "Acme", status: "ACTIVE" as const, qualityRating: null, messagingLimit: null, isOnBusinessApp: false, platformType: "CLOUD_API", connectedAt: null, lastSyncedAt: null }],
    }],
  },
  team: { memberCount: 1, pendingInvitationCount: 0 },
};

describe("WhatsAppAccountSetup", () => {
  beforeEach(() => {
    vi.mocked(useWorkspaceSetup).mockReturnValue({ data: connectedData, loading: false, error: null, refresh: vi.fn() });
    vi.mocked(useWhatsAppEmbeddedSignup).mockReturnValue({ connecting: false, error: null, start: vi.fn() });
  });

  it("uses the authenticated page frame and concise connected account content", () => {
    render(<AuthContext.Provider value={auth}><MemoryRouter><WhatsAppAccountSetup /></MemoryRouter></AuthContext.Provider>);

    expect(screen.getByTestId("whatsapp-account-page")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByTestId("whatsapp-account-scroll-region")).toHaveClass("overflow-y-auto");
    expect(screen.getByRole("heading", { name: "WhatsApp account" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "WhatsApp is connected" })).toBeInTheDocument();
    expect(screen.getByText(/recipient must message your connected number first/i)).toBeInTheDocument();
    expect(screen.queryByText("Developer configuration")).not.toBeInTheDocument();
  });
});
