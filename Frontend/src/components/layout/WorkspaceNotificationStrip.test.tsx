import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { WorkspaceNotificationStrip } from "./WorkspaceNotificationStrip";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const auth: AuthContextValue = {
  status: "authenticated",
  accessToken: "access-token",
  user: {
    id: "user-1",
    email: "owner@example.com",
    firstName: "Workspace",
    lastName: "Owner",
    emailVerifiedAt: "2026-08-22T00:00:00.000Z",
    memberships: [{
      id: "membership-1",
      workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: null },
      role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["billing.read", "workspace.read"] },
    }],
  },
  login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

function renderStrip() {
  return render(<AuthContext.Provider value={auth}><MemoryRouter><WorkspaceNotificationStrip /></MemoryRouter></AuthContext.Provider>);
}

const connectedSetup = {
  whatsapp: {
    status: "CONNECTED",
    accounts: [{ status: "CONNECTED", phoneNumbers: [{ status: "ACTIVE" }] }],
  },
} as never;

describe("WorkspaceNotificationStrip", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("shows the low-balance strip when available funds reach the threshold", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => String(path).endsWith("/setup") ? connectedSetup : { currency: "INR", availableBalance: "0.00", lowBalanceThreshold: "10.00" } as never);
    renderStrip();

    expect(await screen.findByRole("status")).toHaveTextContent("Low Balance");
    expect(screen.getByRole("link", { name: "View Billing" })).toHaveAttribute("href", "/billing");
    expect(screen.getByRole("link", { name: "Add Funds" })).toHaveAttribute("href", "/billing");
    expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/wallet/", { headers: { authorization: "Bearer access-token" } });
    expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/setup", { headers: { authorization: "Bearer access-token" } });
  });

  it("hides the low-balance strip until a WhatsApp number is connected", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => String(path).endsWith("/setup")
      ? { whatsapp: { status: "DISCONNECTED", accounts: [] } } as never
      : { currency: "INR", availableBalance: "0.00", lowBalanceThreshold: "10.00" } as never);
    renderStrip();

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/setup", { headers: { authorization: "Bearer access-token" } }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not render when the balance is above the threshold", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => String(path).endsWith("/setup") ? connectedSetup : { currency: "INR", availableBalance: "120.00", lowBalanceThreshold: "10.00" } as never);
    renderStrip();

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith("/workspaces/workspace-1/setup", expect.anything());
  });
});
