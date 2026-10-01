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
      role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["billing.read"] },
    }],
  },
  login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

function renderStrip() {
  return render(<AuthContext.Provider value={auth}><MemoryRouter><WorkspaceNotificationStrip /></MemoryRouter></AuthContext.Provider>);
}

describe("WorkspaceNotificationStrip", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("shows the low-balance strip when available funds reach the threshold", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ currency: "INR", availableBalance: "0.00", lowBalanceThreshold: "10.00" });
    renderStrip();

    expect(await screen.findByRole("status")).toHaveTextContent("Low Balance");
    expect(screen.getByRole("link", { name: "View Billing" })).toHaveAttribute("href", "/billing");
    expect(screen.getByRole("link", { name: "Add Funds" })).toHaveAttribute("href", "/billing");
    expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/wallet/", { headers: { authorization: "Bearer access-token" } });
  });

  it("does not render when the balance is above the threshold", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ currency: "INR", availableBalance: "120.00", lowBalanceThreshold: "10.00" });
    renderStrip();

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
