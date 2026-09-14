import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { BillingUsage } from "@/pages/BillingUsage";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const auth = (permissions: string[] = ["billing.read"]): AuthContextValue => ({
  status: "authenticated",
  user: {
    id: "user-1",
    email: "owner@example.com",
    firstName: "Workspace",
    lastName: "Owner",
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

function renderPage(value = auth()) {
  return render(<AuthContext.Provider value={value}><BillingUsage /></AuthContext.Provider>);
}

describe("BillingUsage", () => {
  beforeEach(() => vi.mocked(apiRequest).mockResolvedValue(usage));

  it("loads workspace usage with a selected date range", async () => {
    renderPage();

    expect(screen.getByTestId("billing-usage-page")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByTestId("billing-usage-scroll-region")).toHaveClass("overflow-y-auto");
    expect(await screen.findByText("Total messages")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Meta billing is separate")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith(expect.stringContaining("/workspaces/workspace-1/usage?"), { headers: { authorization: "Bearer access-token" } }));

    fireEvent.change(screen.getByLabelText("Usage start date"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Usage end date"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply date range" }));
    await waitFor(() => {
      const requestUrl = String(vi.mocked(apiRequest).mock.lastCall?.[0]);
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

  it("does not request usage without billing permission", () => {
    renderPage(auth([]));

    expect(screen.getByRole("heading", { name: "Billing access is restricted" })).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
