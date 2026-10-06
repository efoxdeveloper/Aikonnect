import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { PublicPricing } from "@/pages/PublicPricing";
import { BillingShell } from "@/components/billing/BillingShell";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn(), ApiError: class ApiError extends Error {} }));

const plans = [
  { id: "plan-1", name: "Starter", slug: "starter", description: "Draft plan. Set subscription pricing before activation.", currency: "INR", monthlyPriceMinorUnits: "99900", annualPriceMinorUnits: "0", trialDays: 0, maxSeats: 2, maxContacts: 2000, maxCampaignsPerMonth: 5, maxAutomations: 3, maxWorkflows: 1, maxPipelines: 1, apiAccess: false, webhooks: false, advancedReports: false },
  { id: "plan-2", name: "Growth", slug: "growth", description: null, currency: "INR", monthlyPriceMinorUnits: "259900", annualPriceMinorUnits: "2599000", trialDays: 14, maxSeats: 5, maxContacts: 10000, maxCampaignsPerMonth: 30, maxAutomations: 20, maxWorkflows: 10, maxPipelines: 3, apiAccess: true, webhooks: true, advancedReports: true },
];
const workspaceAuth = { status: "authenticated", accessToken: "access-token", user: { id: "user-1", email: "owner@example.com", firstName: "Workspace", lastName: "Owner", emailVerifiedAt: "2026-08-22T00:00:00.000Z", memberships: [{ id: "membership-1", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z" }, role: { id: "owner-role", name: "Owner", slug: "owner", permissions: ["billing.read", "billing.manage"] } }] }, login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn() } as unknown as AuthContextValue;

describe("PublicPricing", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("shows database plan prices, caps, trial, and only offers the annual view when priced", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: plans });
    render(<MemoryRouter><PublicPricing /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Simple pricing for better customer conversations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Starter" }).closest("article")?.textContent).toContain("₹999/month");
    expect(screen.getByRole("heading", { name: "Growth" }).closest("article")?.textContent).toContain("₹2,599/month");
    expect(screen.getByText("14-day trial")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Draft plan. Set subscription pricing before activation.");
    expect(screen.getByRole("link", { name: "Choose Starter" })).toHaveAttribute("href", "/register?plan=starter&billing=monthly");
    expect(screen.getByRole("link", { name: "Choose Growth" })).toHaveAttribute("href", "/register?plan=growth&billing=monthly");

    fireEvent.click(screen.getByRole("button", { name: /annual/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Growth" }).closest("article")?.textContent).toContain("₹25,990/year"));
    expect(screen.queryByRole("heading", { name: "Starter" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose Growth" })).toHaveAttribute("href", "/register?plan=growth&billing=annual");
  });

  it("shows a useful empty state when there are no customer-visible plans", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [] });
    render(<MemoryRouter><PublicPricing /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Plans are being prepared" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
  });

  it("embeds plans in the billing shell with a bounded internal scroll region", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => String(path) === "/plans" ? { items: plans } : { id: "request-1", status: "PENDING" });
    render(<MemoryRouter><AuthContext.Provider value={workspaceAuth}><BillingShell><PublicPricing embedded /></BillingShell></AuthContext.Provider></MemoryRouter>);

    const page = await screen.findByTestId("billing-plans-page");
    expect(page).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByRole("heading", { name: "Plans & pricing" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Available plans" })).toHaveClass("overflow-y-auto");
    expect(screen.queryByRole("navigation", { name: "Billing navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Marento home" })).not.toBeInTheDocument();
    const requestGrowth = screen.getByRole("button", { name: "Request Growth plan" });
    expect(requestGrowth).toBeEnabled();
    fireEvent.click(requestGrowth);
    expect(await screen.findByRole("status")).toHaveTextContent("Growth request submitted at ₹2,599 / month");
    expect(screen.getByRole("status")).toHaveTextContent("An admin must review it. Approval does not collect payment.");
    expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/subscriptions/requests", expect.objectContaining({ method: "POST", body: JSON.stringify({ planId: "plan-2", billingPeriod: "MONTHLY" }) }));
  });
});
