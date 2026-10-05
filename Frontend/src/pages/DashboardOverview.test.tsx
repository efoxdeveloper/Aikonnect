import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { siWhatsapp, siYoutube } from "simple-icons";
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
    expect(screen.getByRole("heading", { name: /Welcome back, Pawan/ })).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByLabelText("Messages Sent")).getByText("100")).toBeInTheDocument());
    expect(within(screen.getByLabelText("Delivered")).getByText("80")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(screen.getByText("₹700.00")).toBeInTheDocument();
    const walletAction = within(screen.getByLabelText("Wallet Balance")).getByRole("link", { name: "Add" });
    expect(walletAction).toHaveAttribute("href", "/billing");
    expect(walletAction.firstElementChild).toHaveClass("lucide-plus");
    expect(screen.getByText("Efox Technologies")).toBeInTheDocument();
    const accountHealth = within(screen.getByLabelText("WhatsApp Account Health"));
    const healthHeading = accountHealth.getByRole("heading", { name: "WhatsApp Account Health" });
    expect(healthHeading.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(healthHeading.firstElementChild?.querySelector("path")).toHaveAttribute("d", siWhatsapp.path);
    expect(accountHealth.queryByText("Team members")).not.toBeInTheDocument();
    expect(accountHealth.getByText("WABA review")).toBeInTheDocument();
    expect(accountHealth.getByText("Meta account status")).toBeInTheDocument();
    expect(accountHealth.getByText("Business verification")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New Campaign/ })).toHaveAttribute("href", "/campaigns");
    for (const title of ["Inbox Snapshot", "Template Status", "API & Webhook Health"]) expect(screen.queryByLabelText(title)).not.toBeInTheDocument();
    const guide = within(screen.getByLabelText("Setup Guide"));
    expect(guide.getByText("4 / 4")).toBeInTheDocument();
    expect(guide.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
    expect(guide.getAllByText("Complete")).toHaveLength(4);
    expect(guide.getByRole("link", { name: "View connect whatsapp business" })).toHaveAttribute("href", "/whatsapp-account");
    const tutorials = screen.getByLabelText("Watch Tutorials");
    expect(tutorials).toHaveTextContent("Interakt platform demo");
    expect(tutorials.querySelector("h2 svg path")).toHaveAttribute("d", siYoutube.path);
    expect(within(tutorials).getByRole("button", { name: "Watch tutorial" }).querySelector("svg path")).toHaveAttribute("d", siYoutube.path);
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) => /reports\/templates|templates\?|conversations\?|webhooks|api-keys/.test(String(path)))).toBe(false);
    expect(screen.queryByLabelText("Campaign Performance")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Important Information")).toHaveAttribute("data-emphasis", "important");
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) => String(path).includes("reports/campaigns"))).toBe(false);
  });

  it("replaces disconnected account details with a centered connect action that opens the setup choices", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (String(path).endsWith("/setup")) return {
        ...setup,
        progress: { ...setup.progress, whatsappConnected: false, phoneNumberConnected: false, completedSteps: 1, percentage: 25 },
        whatsapp: { status: "DISCONNECTED", accountCount: 0, phoneNumberCount: 0, accounts: [] },
      } as never;
      return responseFor(String(path)) as never;
    });
    renderDashboard();

    const health = within(screen.getByLabelText("WhatsApp Account Health"));
    const connect = await health.findByRole("button", { name: "Connect WhatsApp" });
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
    expect(within(screen.getByLabelText("Quick Actions")).getByRole("button", { name: /New Campaign/ })).toBeDisabled();
    const guide = within(screen.getByLabelText("Setup Guide"));
    expect(guide.queryByRole("link")).not.toBeInTheDocument();
    expect(guide.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(guide.queryByText("Complete")).not.toBeInTheDocument();
  });

  it("shows actual incomplete setup steps without inventing completion", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => String(path).endsWith("/setup") ? { ...setup, progress: { ...setup.progress, phoneNumberConnected: false, testMessageSent: false, completedSteps: 2, percentage: 50 } } as never : responseFor(String(path)) as never);
    renderDashboard();
    const guide = within(screen.getByLabelText("Setup Guide"));
    await waitFor(() => expect(guide.getByText("2 / 4")).toBeInTheDocument());
    expect(guide.getAllByText("Complete")).toHaveLength(2);
    expect(guide.getAllByText("To do")).toHaveLength(2);
    expect(guide.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(guide.getByRole("link", { name: "Open send your first test message" })).toHaveAttribute("href", "/whatsapp-account");
  });

  it("hides WhatsApp setup actions when the member can only read workspace details", async () => {
    renderDashboard(["workspace.read"]);
    const guide = within(screen.getByLabelText("Setup Guide"));
    await waitFor(() => expect(guide.getByText("4 / 4")).toBeInTheDocument());
    expect(guide.getByRole("link", { name: "View create your workspace" })).toHaveAttribute("href", "/settings");
    expect(guide.getAllByRole("link")).toHaveLength(1);
    expect(vi.mocked(apiRequest).mock.calls.map(([path]) => path)).toEqual(["/workspaces/workspace-1/setup"]);
  });

  it("loads the tutorial only after opening it and unmounts playback on close", async () => {
    renderDashboard();
    expect(screen.queryByTitle("Interakt platform demo video")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Watch tutorial" }));
    const dialog = await screen.findByRole("dialog", { name: "WhatsApp workspace walkthrough" });
    expect(within(dialog).getByTitle("Interakt platform demo video")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/59fdY8aGPDE?autoplay=1&rel=0");
    const fallback = within(dialog).getByRole("link", { name: "Watch on YouTube" });
    expect(fallback).toHaveAttribute("href", "https://www.youtube.com/watch?v=59fdY8aGPDE");
    expect(fallback).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close tutorial" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByTitle("Interakt platform demo video")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Watch WhatsApp workspace walkthrough" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByTitle("Interakt platform demo video")).not.toBeInTheDocument());
  });

  it("places Quick Actions under Account Health and keeps tutorials and setup in the other column", () => {
    renderDashboard();
    const health = screen.getByLabelText("WhatsApp Account Health");
    const actions = screen.getByLabelText("Quick Actions");
    const information = screen.getByLabelText("Important Information");
    const tutorials = screen.getByLabelText("Watch Tutorials");
    const guide = screen.getByLabelText("Setup Guide");
    expect(health.parentElement).toBe(actions.parentElement);
    expect(actions.parentElement).toBe(information.parentElement);
    expect(tutorials.parentElement).toBe(guide.parentElement);
    expect(health.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tutorials.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions.compareDocumentPosition(information) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows Meta WhatsApp platform rules as a simple always-visible list", () => {
    renderDashboard();
    const information = within(screen.getByLabelText("Important Information"));
    const rules = information.getByRole("list");
    expect(within(rules).getAllByRole("listitem")).toHaveLength(6);
    expect(rules).toHaveTextContent("Get clear opt-in");
    expect(rules).toHaveTextContent("within 24 hours");
    expect(rules).toHaveTextContent("approved message template");
    expect(rules).toHaveTextContent("Honor opt-out requests");
    expect(information.queryByRole("button")).not.toBeInTheDocument();
    const policyLink = information.getByRole("link", { name: /WhatsApp Business Messaging Policy/ });
    expect(policyLink).toHaveAttribute("href", "https://business.whatsapp.com/policy");
    expect(policyLink).toHaveAttribute("target", "_blank");
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
    const guide = within(screen.getByLabelText("Setup Guide"));
    expect(guide.getByText("Unavailable")).toBeInTheDocument();
    expect(guide.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(guide.queryByText("Complete")).not.toBeInTheDocument();
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
