import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { WalletBalance } from "./HeaderActions";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

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
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("loads and shows the active workspace wallet amount in the navbar", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ currency: "INR", balance: "125.00" });

    render(<AuthContext.Provider value={auth()}><MemoryRouter><WalletBalance /></MemoryRouter></AuthContext.Provider>);

    await waitFor(() => expect(screen.getByTestId("navbar-wallet")).toHaveTextContent("₹ 125.00"));
    expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/wallet/", expect.objectContaining({ headers: { authorization: "Bearer access-token" } }));
  });

  it("does not request or expose the balance without billing permission", () => {
    render(<AuthContext.Provider value={auth(["inbox.read"])}><MemoryRouter><WalletBalance /></MemoryRouter></AuthContext.Provider>);

    expect(screen.queryByTestId("navbar-wallet")).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
