import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { BillingUsage } from "@/pages/BillingUsage";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@paypilot/ntt/checkout", () => ({ openCheckout: vi.fn() }));

const auth = (permissions: string[] = ["billing.read"]): AuthContextValue => ({
  status: "authenticated",
  user: {
    id: "user-1",
    email: "owner@example.com",
    firstName: "Workspace",
    lastName: "Owner",
    phone: "+919876543210",
    emailVerifiedAt: "2026-08-22T00:00:00.000Z",
    memberships: [{
      id: "membership-1",
      workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z" },
      role: { id: "owner-role", name: "Owner", slug: "owner", permissions },
    }],
  },
  accessToken: "access-token",
  login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
});

const usage = {
  plan: { name: "Growth", status: "TRIALING" as const, trialEndsAt: "2026-09-01T00:00:00.000Z", limits: { contacts: 1000, seats: 5, campaignsPerMonth: 10 }, usage: { contacts: 125, seats: 3, campaignsThisMonth: 4 }, features: { apiAccess: true, webhooks: false, advancedReports: true } },
  wallet: { currency: "INR", totalBalance: "125.000000", reservedBalance: "2.500000", availableBalance: "122.500000", lowBalanceThreshold: "10.000000", status: "ACTIVE", balanceMinorUnits: "12500", balance: "125.00", configuredFromBackend: false },
  filters: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-31T23:59:59.999Z" },
  summary: { totalMessages: 42, incomingMessages: 18, outgoingMessages: 24, deliveredMessages: 22, readMessages: 16, failedMessages: 2, engagedContacts: 9, activeConversations: 7, mediaMessages: 3 },
  breakdown: [
    { key: "incoming", label: "Incoming messages", messages: 18, percentage: 43 },
    { key: "inbox", label: "Inbox replies", messages: 12, percentage: 29 },
    { key: "campaign", label: "Campaign messages", messages: 8, percentage: 19 },
    { key: "automation", label: "Automation messages", messages: 4, percentage: 10 },
  ],
  daily: [{ date: "2026-08-21", total: 42, incoming: 18, outgoing: 24, delivered: 22 }],
};

function renderPage(value = auth(["billing.read", "billing.manage"])) {
  return render(<MemoryRouter><AuthContext.Provider value={value}><BillingUsage /></AuthContext.Provider></MemoryRouter>);
}

describe("BillingUsage", () => {
  beforeEach(() => vi.mocked(apiRequest).mockImplementation(async (path) => String(path).includes("/wallet/ledger") ? { items: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1, hasNext: false, hasPrevious: false } } : usage));

  it("loads workspace usage with a selected date range", async () => {
    renderPage();

    expect(screen.getByTestId("billing-usage-page")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByTestId("billing-usage-scroll-region")).toHaveClass("overflow-y-auto");
    expect(screen.queryByText("Internal tracking")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add funds" })).toBeInTheDocument();
    expect(await screen.findByText("Total messages")).toBeInTheDocument();
    expect(screen.getByText("₹ 122.50")).toBeInTheDocument();
    expect(screen.getByText("₹ 2.50")).toBeInTheDocument();
    expect(await screen.findByText("Estimated wallet debit")).toBeInTheDocument();
    expect(screen.getByText("Held for pending delivery; released if delivery fails")).toBeInTheDocument();
    expect(screen.queryByText("Engaged contacts")).not.toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByText("Meta billing is separate")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Plan usage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View plans" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Message activity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Usage breakdown" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([path]) => String(path).includes("/workspaces/workspace-1/usage?"))).toBe(true));

    fireEvent.change(screen.getByLabelText("Usage start date"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Usage end date"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply date range" }));
    await waitFor(() => {
      const usageCall = [...vi.mocked(apiRequest).mock.calls].reverse().find((call) => String(call[0]).includes("/workspaces/workspace-1/usage?") && String(call[0]).includes("from=2026-08-01"));
      const requestUrl = String(usageCall?.[0]);
      expect(decodeURIComponent(requestUrl)).toContain("from=2026-08-01T00:00:00.000Z");
      expect(decodeURIComponent(requestUrl)).toContain("to=2026-08-31T23:59:59.999Z");
    });
  });

  it("validates an invalid custom date range before requesting it", async () => {
    renderPage();
    await screen.findByText("Total messages");
    const requestCount = vi.mocked(apiRequest).mock.calls.length;

    fireEvent.change(screen.getByLabelText("Usage start date"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Usage end date"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply date range" }));

    expect(screen.getByRole("alert")).toHaveTextContent("start date must be before");
    expect(vi.mocked(apiRequest).mock.calls).toHaveLength(requestCount);
  });

  it("keeps wallet amounts and balance after values on one line", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => String(path).includes("/wallet/ledger")
      ? { items: [{ id: "entry-1", direction: "CREDIT", amount: "12345.67", closingTotalBalance: "23456.78", transactionType: "RECHARGE", description: "Wallet recharge", createdAt: "2026-10-12T00:00:00.000Z" }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } }
      : usage);
    renderPage();
    await screen.findByRole("cell", { name: "+₹ 12,345.67" });

    expect(screen.getByRole("columnheader", { name: "Amount" })).toHaveClass("whitespace-nowrap");
    expect(screen.getByRole("columnheader", { name: "Balance after" })).toHaveClass("whitespace-nowrap");
    expect(screen.getByRole("cell", { name: "+₹ 12,345.67" })).toHaveClass("whitespace-nowrap");
    expect(screen.getByRole("cell", { name: "₹ 23,456.78" })).toHaveClass("whitespace-nowrap");
  });

  it("does not request usage without billing permission", () => {
    renderPage(auth([]));

    expect(screen.getByRole("heading", { name: "Billing access is restricted" })).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("uses the workspace owner phone returned by the API for checkout", async () => {
    const { openCheckout } = await import("@paypilot/ntt/checkout");
    vi.mocked(apiRequest).mockImplementation(async (path) => String(path).endsWith("/wallet/topups")
      ? { id: "topup-1", status: "INITIATED", customerMobile: "+919876543210", checkout: { type: "SDK_TOKEN", token: "token-1", merchantId: "merchant-1", environment: "UAT", returnUrl: "https://api.example.test/api/v1/payments/ntt/callback" } }
      : String(path).includes("/wallet/ledger") ? { items: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1, hasNext: false, hasPrevious: false } } : usage);
    const value = auth(["billing.read", "billing.manage"]);
    if (value.user) value.user.phone = null;
    renderPage(value);
    await screen.findByText("Total messages");
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    fireEvent.change(screen.getByLabelText("Amount (INR)"), { target: { value: "750.50" } });
    expect(screen.queryByLabelText("Phone with country code")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => expect(openCheckout).toHaveBeenCalledWith({
      checkout: expect.objectContaining({ token: "token-1", merchantId: "merchant-1", environment: "UAT" }),
      customer: { email: "owner@example.com", mobile: "+919876543210" },
    }));
    const call = vi.mocked(apiRequest).mock.calls.find(([path]) => String(path).endsWith("/wallet/topups"));
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ amount: "750.50" });
    expect(JSON.parse(String(call?.[1]?.body))).not.toHaveProperty("mobile");
  });

  it("opens Add funds as a popup and closes it with Cancel", async () => {
    renderPage();
    await screen.findByText("Total messages");
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));

    expect(screen.getByRole("dialog", { name: "Add funds" })).toBeInTheDocument();
    expect(screen.getByLabelText("Amount (INR)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Add funds" })).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith(expect.stringMatching(/\/wallet\/topups$/), expect.anything());
  });

  it("does not offer recharge controls to read-only billing members", async () => {
    renderPage(auth(["billing.read"]));
    await screen.findByText("Total messages");
    expect(screen.queryByRole("button", { name: "Add funds" })).not.toBeInTheDocument();
  });
});
