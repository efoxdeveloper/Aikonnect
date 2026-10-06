import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { BillingSubscriptions } from "@/pages/BillingSubscriptions";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const auth = (permissions: string[] = ["billing.read"]): AuthContextValue => ({
  status: "authenticated",
  user: { id: "user-1", email: "owner@example.com", firstName: "Workspace", lastName: "Owner", emailVerifiedAt: "2026-08-22T00:00:00.000Z", memberships: [{ id: "membership-1", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z" }, role: { id: "owner-role", name: "Owner", slug: "owner", permissions } }] },
  accessToken: "access-token", login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
});

const active = { id: "subscription-2", planName: "Growth", status: "TRIALING" as const, billingPeriod: "MONTHLY" as const, currency: "INR", amountMinorUnits: "259900", startedAt: "2026-10-01T00:00:00.000Z", trialEndsAt: "2026-10-15T00:00:00.000Z", currentPeriodEndsAt: "2026-11-01T00:00:00.000Z", cancelAtPeriodEnd: false, canceledAt: null, endedAt: null, createdAt: "2026-10-01T00:00:00.000Z" };
const previous = { ...active, id: "subscription-1", planName: "Starter", status: "CANCELED" as const, amountMinorUnits: "99900", startedAt: "2026-08-01T00:00:00.000Z", trialEndsAt: null, currentPeriodEndsAt: null, endedAt: "2026-09-01T00:00:00.000Z", createdAt: "2026-08-01T00:00:00.000Z" };

function renderPage(value = auth()) {
  return render(<MemoryRouter><AuthContext.Provider value={value}><BillingSubscriptions /></AuthContext.Provider></MemoryRouter>);
}

describe("BillingSubscriptions", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("shows the active subscription and the full workspace history", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ active, items: [active, previous] });
    renderPage();

    expect(screen.queryByRole("navigation", { name: "Billing navigation" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Active subscription" })).toBeInTheDocument();
    expect(screen.getAllByText("Growth")).toHaveLength(2);
    expect(screen.getAllByText("Trialing")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "All subscriptions" })).toBeInTheDocument();
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Canceled")).toBeInTheDocument();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/subscriptions", { headers: { authorization: "Bearer access-token" } }));
  });

  it("shows an explicit empty state when no subscription has been activated", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ active: null, items: [] });
    renderPage();
    expect(await screen.findByRole("heading", { name: "No active subscription" })).toBeInTheDocument();
    expect(screen.getByText("No subscription history for this workspace yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Explore plans|View plans/ })[0]).toHaveAttribute("href", "/billing/plans");
  });

  it("does not request subscription data without billing permission", () => {
    renderPage(auth([]));
    expect(screen.getByRole("heading", { name: "Billing access is restricted" })).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("shows a retryable error without presenting an empty history as a successful result", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Billing service is unavailable."));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Billing service is unavailable.");
    expect(screen.getByText("Subscription history is unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("No subscription history for this workspace yet.")).not.toBeInTheDocument();
  });
});
