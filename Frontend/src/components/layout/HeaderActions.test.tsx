import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { WalletBalance } from "./HeaderActions";

const { subscribeToWalletEventsMock } = vi.hoisted(() => ({ subscribeToWalletEventsMock: vi.fn((_options: { url: string; accessToken: string; onUpdate: () => void }) => vi.fn()) }));
vi.mock("@/lib/api", () => ({ apiRequest: vi.fn(), getApiUrl: (path: string) => `http://localhost:5006/api/v1${path}` }));
vi.mock("@/lib/wallet-events", () => ({ subscribeToWalletEvents: subscribeToWalletEventsMock }));

function auth(permissions: string[] = ["billing.read"]) {
  return {
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
        role: { id: "role-1", name: "Billing", slug: "billing", permissions },
      }],
    },
  } as AuthContextValue;
}

describe("WalletBalance", () => {
  beforeEach(() => { vi.mocked(apiRequest).mockReset(); subscribeToWalletEventsMock.mockReset().mockReturnValue(vi.fn()); });

  it("loads and shows the active workspace wallet amount in the navbar", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ currency: "INR", balance: "125.00" });

    render(<AuthContext.Provider value={auth()}><MemoryRouter><WalletBalance /></MemoryRouter></AuthContext.Provider>);

    await waitFor(() => expect(screen.getByTestId("navbar-wallet")).toHaveTextContent("₹ 125.00"));
    expect(screen.getByTestId("navbar-wallet")).toHaveClass("rounded-md", "shadow-none");
    expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/wallet/", expect.objectContaining({ headers: { authorization: "Bearer access-token" } }));
  });

  it("does not request or expose the balance without billing permission", () => {
    render(<AuthContext.Provider value={auth(["inbox.read"])}><MemoryRouter><WalletBalance /></MemoryRouter></AuthContext.Provider>);

    expect(screen.queryByTestId("navbar-wallet")).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("shows spendable balance and refreshes it when the wallet SSE stream reports a reservation", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ currency: "INR", balance: "125.00", availableBalance: "125.00", reservedBalance: "0.00" })
      .mockResolvedValueOnce({ currency: "INR", balance: "125.00", availableBalance: "121.75", reservedBalance: "3.25" });

    render(<AuthContext.Provider value={auth()}><MemoryRouter><WalletBalance /></MemoryRouter></AuthContext.Provider>);
    const wallet = await screen.findByTestId("navbar-wallet");
    await waitFor(() => expect(wallet).toHaveTextContent("₹ 125.00"));
    expect(subscribeToWalletEventsMock).toHaveBeenCalledWith({
      url: "http://localhost:5006/api/v1/workspaces/workspace-1/wallet/events",
      accessToken: "access-token",
      onUpdate: expect.any(Function),
    });
    const onUpdate = subscribeToWalletEventsMock.mock.calls[0][0].onUpdate;
    onUpdate();
    await waitFor(() => expect(wallet).toHaveTextContent("₹ 121.75"));
    expect(wallet).toHaveTextContent("Held ₹ 3.25");
    expect(wallet).toHaveAttribute("aria-label", "Available wallet balance ₹ 121.75; ₹ 3.25 held for pending messages");
  });
});
