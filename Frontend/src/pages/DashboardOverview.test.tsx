import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { siWhatsapp } from "simple-icons";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { DashboardOverview, dashboardDateRange } from "@/pages/DashboardOverview";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const setup = {
  workspace: { id: "workspace-1", name: "Acme Support" },
  progress: { workspaceCreated: true, whatsappConnected: true, phoneNumberConnected: true, testMessageSent: true, completedSteps: 4, totalSteps: 4, percentage: 100, completedAt: null },
  whatsapp: { status: "CONNECTED", accountCount: 1, phoneNumberCount: 1, accounts: [{ id: "account-1", metaBusinessId: "business-1", metaWabaId: "waba-1", displayName: "Efox Technologies", status: "CONNECTED", connectedAt: null, lastSyncedAt: null, lastError: null, phoneNumbers: [{ id: "phone-1", metaPhoneNumberId: "phone-1", displayPhoneNumber: "+91 91197 48130", verifiedName: "Efox", status: "ACTIVE", qualityRating: "GREEN", messagingLimit: null, isOnBusinessApp: false, platformType: "CLOUD_API", connectedAt: null, lastSyncedAt: null }] }] },
  team: { memberCount: 3, pendingInvitationCount: 0 },
};

const ownerPermissions = ["workspace.read", "whatsapp.read", "whatsapp.manage", "billing.read", "reports.read", "inbox.read", "workspace.update", "campaigns.read", "campaigns.create", "templates.manage", "templates.read", "conversations.reply", "contacts.read", "contacts.create"];
function auth(permissions = ownerPermissions): AuthContextValue {
  return {
    status: "authenticated", accessToken: "access-token",
    user: { id: "user-1", email: "owner@example.com", firstName: "Pawan", lastName: "Owner", emailVerifiedAt: null, memberships: [{ id: "membership-1", workspace: { id: "workspace-1", name: "Acme Support", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z" }, role: { id: "role-1", name: "Owner", slug: "owner", permissions } }] },
  } as AuthContextValue;
}

function renderDashboard(permissions?: string[]) {
  return render(<AuthContext.Provider value={auth(permissions)}><MemoryRouter initialEntries={["/dashboard"]}><DashboardOverview /></MemoryRouter></AuthContext.Provider>);
}

function responseFor(path: string) {
  if (path.endsWith("/setup")) return setup;
  if (path.endsWith("/whatsapp/status")) return { wabaId: "waba-1", name: "Efox Technologies", status: "ACTIVE", accountReviewStatus: "APPROVED", businessVerificationStatus: "VERIFIED", checkedAt: null };
  if (path.includes("/usage?")) return { summary: { outgoingMessages: 100, deliveredMessages: 80, readMessages: 50, failedMessages: 2 }, daily: [{ date: "2026-10-01", outgoing: 40, delivered: 30 }, { date: "2026-10-02", outgoing: 60, delivered: 50 }] };
  if (path.endsWith("/wallet/welcome-bonus")) return null;
  if (path.endsWith("/wallet")) return { currency: "INR", balance: "842.50", availableBalance: "700.00", status: "ACTIVE" };
  throw new Error(`Unexpected request ${path}`);
}

describe("DashboardOverview", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(apiRequest).mockImplementation(async (path) => responseFor(String(path)) as never);
  });

  it("renders the full-width workspace overview using the matching live resources", async () => {
    renderDashboard();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Acme Support")).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByLabelText("Messages Sent")).getByText("100")).toBeInTheDocument());
    expect(within(screen.getByLabelText("Delivered")).getByText("80")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(screen.getByText("₹700.00")).toBeInTheDocument();
    const walletAction = within(screen.getByLabelText("Wallet Balance")).getByRole("link", { name: "Add" });
    expect(walletAction).toHaveAttribute("href", "/billing");
    expect(walletAction.firstElementChild).toHaveClass("lucide-plus");
    expect(screen.getByText("Efox Technologies")).toBeInTheDocument();
    const accountHealth = within(screen.getByRole("region", { name: "WhatsApp account" }));
    const healthHeading = accountHealth.getByRole("heading", { name: "WhatsApp account" });
    expect(healthHeading.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(healthHeading.firstElementChild?.querySelector("path")).toHaveAttribute("d", siWhatsapp.path);
    expect(accountHealth.queryByText("Team members")).not.toBeInTheDocument();
    expect(accountHealth.getByText("WABA review")).toBeInTheDocument();
    expect(accountHealth.getByText("Meta account status")).toBeInTheDocument();
    expect(accountHealth.getByText("Business verification")).toBeInTheDocument();
    expect(accountHealth.queryByRole("button", { name: "About the WhatsApp connection bonus" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Message activity for 2 days" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New Campaign/ })).toHaveAttribute("href", "/campaigns");
    expect(screen.queryByLabelText("Watch Tutorials")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Important Information")).not.toBeInTheDocument();
    for (const title of ["Inbox Snapshot", "Template Status", "API & Webhook Health"]) expect(screen.queryByLabelText(title)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Finish workspace setup")).not.toBeInTheDocument();
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) => /reports\/templates|templates\?|conversations\?|webhooks|api-keys/.test(String(path)))).toBe(false);
    expect(screen.queryByLabelText("Campaign Performance")).not.toBeInTheDocument();
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) => String(path).includes("reports/campaigns"))).toBe(false);
  });

  it("celebrates a pending WhatsApp connection bonus once and marks it as seen when dismissed", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (String(path).endsWith("/wallet/welcome-bonus")) return { amount: "400.00", currency: "INR", granted: true, pending: true, source: "whatsapp_number_connection" } as never;
      if (String(path).endsWith("/welcome-bonus/celebrated")) return { marked: true } as never;
      return responseFor(String(path)) as never;
    });
    renderDashboard();

    const dialog = await screen.findByRole("dialog", { name: "Congratulations, Pawan!" });
    expect(within(dialog).getByText("₹400")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-bonus-confetti").querySelectorAll("i")).toHaveLength(88);
    fireEvent.click(within(dialog).getByRole("button", { name: "Explore your dashboard" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/wallet/welcome-bonus/celebrated", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Congratulations, Pawan!" })).not.toBeInTheDocument());
  });

  it("replaces disconnected account details with a centered connect action that opens the setup choices", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (String(path).endsWith("/setup")) return {
        ...setup,
        progress: { ...setup.progress, whatsappConnected: false, phoneNumberConnected: false, completedSteps: 1, percentage: 25 },
        whatsapp: { status: "DISCONNECTED", accountCount: 0, phoneNumberCount: 0, accounts: [] },
      } as never;
      if (String(path).endsWith("/wallet/welcome-bonus")) return { amount: "400.00", currency: "INR", granted: true, pending: false, source: "new_workspace_signup" } as never;
      return responseFor(String(path)) as never;
    });
    renderDashboard();

    const health = within(screen.getByRole("region", { name: "WhatsApp account" }));
    const connect = await health.findByRole("button", { name: "Connect WhatsApp" });
    expect(screen.queryByRole("region", { name: "Message activity" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "WhatsApp account" }).parentElement?.className).toMatch(/primaryGridSingle/);
    expect(health.getByText("Rs. 400")).toBeInTheDocument();
    expect(health.getByText("Free")).toBeInTheDocument();
    expect(health.queryByText("Connect WhatsApp", { selector: "span" })).not.toBeInTheDocument();
    const bonusPill = health.getByRole("button", { name: "About the WhatsApp connection bonus" });
    const bonusPlus = screen.getByTestId("connection-bonus-plus");
    expect(bonusPill.compareDocumentPosition(bonusPlus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bonusPlus.compareDocumentPosition(connect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.focus(health.getByRole("button", { name: "About the WhatsApp connection bonus" }));
    expect(await screen.findByText("Your welcome credit has already been added to the wallet.")).toBeInTheDocument();
    expect(connect.parentElement?.className).toContain("healthDisconnected");
    expect(health.queryByText("Business name")).not.toBeInTheDocument();
    expect(health.queryByText("WABA review")).not.toBeInTheDocument();

    fireEvent.click(connect);
    const choices = await screen.findByRole("dialog", { name: "2 Ways to Setup WhatsApp API Number" });
    expect(within(choices).getByRole("button", { name: "WA Business App Number" })).toBeInTheDocument();
    expect(within(choices).getByRole("button", { name: "New Number" })).toBeInTheDocument();
  });

  it("uses actual selected dates for all period reports and validates a custom range", async () => {
    renderDashboard();
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "30 Days" }));
    const expectedFrom = dashboardDateRange("30d").from;
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining(`/usage?from=${encodeURIComponent(expectedFrom)}`), expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-04" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("on or before");
  });

  it("does not request private workspace data or expose actions without permission", async () => {
    renderDashboard([]);
    expect(await screen.findAllByText("Access restricted")).not.toHaveLength(0);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /New Campaign/ })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "View Inbox" })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Quick actions")).getByRole("button", { name: /New Campaign/ })).toBeDisabled();
    expect(screen.queryByLabelText("Finish workspace setup")).not.toBeInTheDocument();
  });

  it("shows actual incomplete setup steps without inventing completion", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => String(path).endsWith("/setup") ? { ...setup, progress: { ...setup.progress, phoneNumberConnected: false, testMessageSent: false, completedSteps: 2, percentage: 50 } } as never : responseFor(String(path)) as never);
    renderDashboard();
    const guide = within(await screen.findByRole("region", { name: "Finish workspace setup" }));
    await waitFor(() => expect(guide.getByText("2 / 4")).toBeInTheDocument());
    expect(guide.queryByText("Complete")).not.toBeInTheDocument();
    expect(guide.getAllByText("To do")).toHaveLength(2);
    expect(guide.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(guide.getByRole("link", { name: "Open send your first test message" })).toHaveAttribute("href", "/whatsapp-account");
  });

  it("hides WhatsApp setup actions when the member can only read workspace details", async () => {
    renderDashboard(["workspace.read"]);
    expect(screen.queryByLabelText("Finish workspace setup")).not.toBeInTheDocument();
    expect(vi.mocked(apiRequest).mock.calls.map(([path]) => path)).toEqual(["/workspaces/workspace-1/setup", "/workspaces/workspace-1/wallet/welcome-bonus"]);
  });

  it("prioritizes the activity chart and account status before quick actions", async () => {
    renderDashboard();
    const chart = await screen.findByRole("region", { name: "Message activity" });
    const health = screen.getByRole("region", { name: "WhatsApp account" });
    const actions = screen.getByRole("region", { name: "Quick actions" });
    expect(chart.parentElement).toBe(health.parentElement);
    expect(chart.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(health.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the page in its viewport frame and gives scrolling to the dashboard content region", () => {
    renderDashboard();
    const page = screen.getByTestId("dashboard-overview");
    const scrollRegion = screen.getByTestId("dashboard-overview-scroll");
    expect(page).toHaveClass("h-full", "min-h-0", "overflow-hidden");
    expect(scrollRegion.parentElement).toBe(page);
    expect(scrollRegion.className).toBeTruthy();
  });

  it("shows an unavailable state when an authorized data request fails", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("network error"));
    renderDashboard();
    await waitFor(() => expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0));
    expect(screen.getByLabelText("Messages Sent")).toHaveTextContent("—");
    expect(within(screen.getByRole("region", { name: "WhatsApp account" })).getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Finish workspace setup")).not.toBeInTheDocument();
  });
});

describe("dashboard date ranges", () => {
  it("includes the whole current day for the today preset", () => {
    const now = new Date(2026, 9, 5, 11, 30);
    const range = dashboardDateRange("today", now);
    const start = new Date(range.from);
    expect(start.getFullYear()).toBe(now.getFullYear());
    expect(start.getMonth()).toBe(now.getMonth());
    expect(start.getDate()).toBe(now.getDate());
    expect(start.getHours()).toBe(0);
    expect(new Date(range.to).getTime()).toBe(now.getTime());
  });

});
