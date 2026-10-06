import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { PlanRequestManager } from "@/pages/PlanRequestManager";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn(), ApiError: class ApiError extends Error {} }));

const auth = { status: "authenticated", accessToken: "admin-token", user: { id: "admin-1", email: "admin@example.com", firstName: "Platform", lastName: "Admin", emailVerifiedAt: "2026-10-01T00:00:00.000Z", platformRole: "ADMIN", memberships: [] }, login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn() } as unknown as AuthContextValue;
const request = { id: "request-1", planName: "Growth", billingPeriod: "MONTHLY", currency: "INR", amountMinorUnits: "259900", trialDays: 14, status: "PENDING", customerNote: null, adminNote: null, createdAt: "2026-10-01T00:00:00.000Z", decidedAt: null, subscription: null, workspace: { id: "workspace-1", name: "Acme", slug: "acme" }, requestedBy: { id: "user-1", firstName: "Asha", lastName: "Owner", email: "asha@example.com" }, reviewedBy: null };
const result = { items: [request], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } };

describe("PlanRequestManager", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("lets billing admins approve a pending request and shows that no payment was taken", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (String(path).startsWith("/admin/plan-requests?") && options?.method !== "PATCH") return result;
      if (String(path) === "/admin/plan-requests/request-1") return { status: "APPROVED", subscriptionStatus: "TRIALING" };
      return { items: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1, hasNext: false, hasPrevious: false } };
    });
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AuthContext.Provider value={auth}><PlanRequestManager /></AuthContext.Provider>);

    expect(await screen.findByText(/asha@example.com/)).toBeInTheDocument();
    expect(screen.getByText("Growth")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/admin/plan-requests/request-1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ decision: "APPROVE" }) })));
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining("no payment will be collected"));
    expect(await screen.findByRole("status")).toHaveTextContent("Subscription status: TRIALING");
    expect(confirmation).toHaveBeenCalledTimes(1);
    confirmation.mockRestore();
  });

  it("does not send a manual decision when the admin cancels confirmation", async () => {
    vi.mocked(apiRequest).mockResolvedValue(result);
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AuthContext.Provider value={auth}><PlanRequestManager /></AuthContext.Provider>);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect(apiRequest).toHaveBeenCalledTimes(1);
    confirmation.mockRestore();
  });
});
