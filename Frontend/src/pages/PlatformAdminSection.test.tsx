import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformAdminSection } from "@/pages/PlatformAdminSection";
import { apiRequest } from "@/lib/api";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn(), ApiError: class ApiError extends Error {} }));

describe("platform admin sections", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset().mockResolvedValue({
      items: [{
        id: "workspace-1",
        name: "Lotus Cafe",
        slug: "lotus-cafe",
        companyName: "Lotus Cafe",
        industry: "Hospitality",
        country: "India",
        timezone: "Asia/Kolkata",
        createdAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
        onboardingCompletedAt: null,
        status: "ONBOARDING",
        owner: { id: "owner-1", email: "owner@example.com", firstName: "Lotus", lastName: "Owner", status: "ACTIVE" },
        setupProgress: null,
        _count: { memberships: 2, contacts: 10, messages: 20, conversations: 5, templates: 3, whatsappBusinessAccounts: 1, webhookEndpoints: 1 },
      }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
    });
  });

  function NavigationHarness() {
    const navigate = useNavigate();
    return <><button type="button" onClick={() => navigate("/admin/users")}>Open users</button><Routes><Route path="/admin/*" element={<PlatformAdminSection />} /></Routes></>;
  }

  it("loads workspace operational details from the admin API", async () => {
    render(<MemoryRouter initialEntries={["/admin/workspaces"]}><PlatformAdminSection /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Workspaces" })).toBeInTheDocument();
    expect(screen.getByText("Lotus Cafe")).toBeInTheDocument();
    expect(screen.getByText("lotus-cafe · Lotus Cafe")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/admin/workspaces?page=1&pageSize=25");
  });

  it("loads the next page from the server when pagination is available", async () => {
    vi.mocked(apiRequest).mockReset()
      .mockResolvedValueOnce({
        items: [{ id: "workspace-1", name: "Lotus Cafe", slug: "lotus-cafe", companyName: "Lotus Cafe", industry: null, country: "India", timezone: "Asia/Kolkata", createdAt: "2026-09-18T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z", onboardingCompletedAt: null, status: "ONBOARDING", owner: { email: "owner@example.com", firstName: "Lotus", lastName: "Owner", status: "ACTIVE" }, setupProgress: null, _count: { memberships: 2, contacts: 10, messages: 20, conversations: 5, templates: 3, whatsappBusinessAccounts: 1, webhookEndpoints: 1 } }],
        pagination: { page: 1, pageSize: 25, total: 26, totalPages: 2, hasNext: true, hasPrevious: false },
      })
      .mockResolvedValueOnce({
        items: [{ id: "workspace-2", name: "Second Cafe", slug: "second-cafe", companyName: "Second Cafe", industry: null, country: "India", timezone: "Asia/Kolkata", createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z", onboardingCompletedAt: null, status: "ACTIVE", owner: { email: "second@example.com", firstName: "Second", lastName: "Owner", status: "ACTIVE" }, setupProgress: null, _count: { memberships: 1, contacts: 4, messages: 8, conversations: 2, templates: 1, whatsappBusinessAccounts: 1, webhookEndpoints: 0 } }],
        pagination: { page: 2, pageSize: 25, total: 26, totalPages: 2, hasNext: false, hasPrevious: true },
      });

    render(<MemoryRouter initialEntries={["/admin/workspaces"]}><PlatformAdminSection /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Next" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith("/admin/workspaces?page=2&pageSize=25"));
    expect(await screen.findByText("Second Cafe")).toBeInTheDocument();
  });

  it("does not render stale section data during sidebar navigation", async () => {
    vi.mocked(apiRequest).mockReset()
      .mockResolvedValueOnce({ subscriptions: { configured: false, message: "Not configured" }, wallet: { currency: "INR", balance: "0.00" }, sharedWhatsAppBilling: { totalAccounts: 0, allocatedAccounts: 0, unallocatedAccounts: 0, statuses: {} }, workspaceCount: 1 })
      .mockResolvedValueOnce({
        items: [{ id: "user-1", email: "owner@example.com", firstName: "Lotus", lastName: "Owner", phone: null, status: "ACTIVE", platformRole: "NONE", signupSource: "Google signup", emailVerifiedAt: "2026-09-18T00:00:00.000Z", lastLoginAt: null, createdAt: "2026-09-18T00:00:00.000Z", memberships: [], _count: { memberships: 0, sessions: 1 } }],
        pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
        summary: { total: 1, active: 1, verified: 1, googleSignups: 1 },
      });

    render(<MemoryRouter initialEntries={["/admin/billing"]}><NavigationHarness /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Billing & subscriptions" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open users" }));

    expect(await screen.findByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(await screen.findByText("Lotus Owner")).toBeInTheDocument();
    expect(screen.getByText("Total users")).toBeInTheDocument();
    expect(screen.getByText("Google signups")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "S.No" })).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Email verified")).toBeInTheDocument();
    expect(screen.getByText("Google signup")).toBeInTheDocument();
  });

  it("allows a billing platform role to submit a manual wallet adjustment", async () => {
    const billingData = { subscriptions: { configured: false, message: "Not configured" }, wallet: { currency: "INR", balance: "0.00" }, wallets: [{ tenantId: "00000000-0000-4000-8000-000000000001", tenantName: "Lotus Cafe", tenantSlug: "lotus-cafe", workspaceCount: 1, currency: "INR", balance: "0.00" }], sharedWhatsAppBilling: { totalAccounts: 0, allocatedAccounts: 0, unallocatedAccounts: 0, statuses: {} }, workspaceCount: 1 };
    vi.mocked(apiRequest).mockReset().mockResolvedValueOnce(billingData).mockResolvedValueOnce({}).mockResolvedValueOnce(billingData);
    const auth = { status: "authenticated", accessToken: "token", user: { id: "admin-1", email: "billing@example.com", firstName: "Billing", lastName: "Admin", emailVerifiedAt: "2026-09-18T00:00:00.000Z", platformRole: "BILLING", memberships: [] }, login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn() } as unknown as AuthContextValue;

    render(<AuthContext.Provider value={auth}><MemoryRouter initialEntries={["/admin/billing"]}><PlatformAdminSection /></MemoryRouter></AuthContext.Provider>);
    expect(await screen.findByRole("heading", { name: "Billing & subscriptions" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tenant"), { target: { value: "00000000-0000-4000-8000-000000000001" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "125.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save adjustment" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/admin/billing/wallet-adjustments", expect.objectContaining({ method: "POST", body: expect.stringContaining('"tenantId":"00000000-0000-4000-8000-000000000001"') })));
    expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => String(options?.body).includes('"amountMinorUnits":"12550"'))).toBe(true);
    expect(await screen.findByRole("status")).toHaveTextContent("Credited INR 125.50");
  });
});
