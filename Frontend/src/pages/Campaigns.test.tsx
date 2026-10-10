import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { siWhatsapp } from "simple-icons";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { Campaigns } from "@/pages/Campaigns";
import { CampaignDetails } from "@/pages/CampaignDetails";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: vi.fn(),
  getApiUrl: (path: string) => `http://localhost:5006/api/v1${path}`,
}));
const { subscribeToCampaignEventsMock } = vi.hoisted(() => ({ subscribeToCampaignEventsMock: vi.fn((_options: { url: string; accessToken: string; onUpdate: () => void }) => vi.fn()) }));
vi.mock("@/lib/campaign-events", () => ({ subscribeToCampaignEvents: subscribeToCampaignEventsMock }));

const templateResponse = {
  items: [
      {
        id: "template-approved",
        name: "August product launch",
        key: "august_product_launch",
        status: "APPROVED",
        category: "Marketing",
        language: "English (en)",
        body: "Hi {{1}}, your offer code is {{2}}.",
      },
      {
        id: "template-pending",
        name: "Pending launch template",
        key: "pending_launch_template",
        status: "PENDING",
        category: "Marketing",
        language: "English (en)",
      },
    ],
};

let mockCampaigns: Array<Record<string, unknown>> = [];
let mockCanCoverEstimate = true;

function mockApi() {
  vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
    if (path.endsWith("/campaigns/estimate")) return {
      recipientCount: 12, excludedCount: 3, currency: "INR", estimatedWalletCost: "6.00", estimatedMetaCost: "4.20",
      availableBalance: mockCanCoverEstimate ? "400.00" : "5.00", projectedBalance: mockCanCoverEstimate ? "394.00" : "-1.00", canCoverEstimate: mockCanCoverEstimate,
      pricingBasis: "Final charges depend on successful message delivery.",
      countries: [{ countryCode: "IN", countryName: "India", recipients: 12, estimatedWalletCost: "6.00", estimatedMetaCost: "4.20" }],
    };
    if (path.includes("/contacts/segments")) return { items: [{ id: "segment-1", name: "VIP customers" }] };
    if (path.includes("/templates")) return templateResponse;
    if (path.includes("/duplicate")) {
      const sourceId = path.split("/campaigns/")[1]?.split("/")[0];
      const source = mockCampaigns.find((item) => item.id === sourceId);
      const duplicate = { ...source, id: "campaign-copy", name: `${String(source?.name ?? "Campaign")} (Copy)`, status: "DRAFT", attempted: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, setLiveAt: null };
      mockCampaigns = [duplicate, ...mockCampaigns];
      return duplicate;
    }
    if (path.includes("/control")) {
      const id = path.split("/campaigns/")[1]?.split("/")[0];
      const body = options.body ? JSON.parse(String(options.body)) as { action?: string } : {};
      const campaign = mockCampaigns.find((item) => item.id === id);
      if (campaign) campaign.status = body.action === "pause" ? "PAUSED" : body.action === "cancel" ? "CANCELLED" : "RUNNING";
      return campaign;
    }
    if (path.includes("/campaigns/") && !path.endsWith("/campaigns")) {
      const id = path.split("/campaigns/")[1]?.split("?")[0];
      const campaign = mockCampaigns.find((item) => item.id === id);
      return { ...campaign, recipients: Array.isArray(campaign?.recipients) ? campaign.recipients : [] };
    }
    if (path.endsWith("/campaigns") || path.includes("/campaigns?")) {
      if (options.method === "POST") {
        const body = options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {};
        const created = { id: "campaign-new", name: body.name, kind: body.kind, category: body.category, templateKey: body.templateKey, audienceLabel: body.audienceLabel, status: body.launchMode === "schedule" ? "SCHEDULED" : body.launchMode === "send" ? "RUNNING" : "DRAFT", recipientCount: body.audienceType === "contacts" ? (Array.isArray(body.contactIds) ? body.contactIds.length : 0) : 0, attempted: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, createdBy: "Workspace Owner", createdById: "owner", setLiveAt: null, updatedAt: "2026-08-25T10:00:00.000Z" };
        mockCampaigns = [created, ...mockCampaigns];
        return created;
      }
      const url = new URL(path, "http://localhost");
      const statuses = (url.searchParams.get("status") ?? "").split(",").filter(Boolean);
      const items = mockCampaigns.filter((item) =>
        (!url.searchParams.get("kind") || item.kind === url.searchParams.get("kind")) &&
        (!statuses.length || statuses.includes(String(item.status))) &&
        (!url.searchParams.get("search") || String(item.name).toLowerCase().includes(String(url.searchParams.get("search")).toLowerCase())) &&
        (url.searchParams.get("hasSetLive") !== "true" || Boolean(item.setLiveAt)) &&
        (url.searchParams.get("hasSetLive") !== "false" || !item.setLiveAt),
      );
      return { items, pagination: { page: 1, pageSize: 100, total: items.length, totalPages: 1, hasNext: false, hasPrevious: false } };
    }
    return {};
  });
}

const permissions = [
  "campaigns.read",
  "campaigns.create",
  "campaigns.send",
  "campaigns.delete",
];
const auth: AuthContextValue = {
  status: "authenticated",
  user: {
    id: "owner",
    email: "owner@example.com",
    firstName: "Workspace",
    lastName: "Owner",
    emailVerifiedAt: "2026-08-22T00:00:00.000Z",
    memberships: [
      {
        id: "membership-1",
        workspace: {
          id: "workspace-1",
          name: "Acme",
          slug: "acme",
          country: "India",
          timezone: "Asia/Kolkata",
          onboardingCompletedAt: "2026-08-22T00:00:00.000Z",
        },
        role: { id: "owner-role", name: "Owner", slug: "owner", permissions },
      },
    ],
  },
  accessToken: "access-token",
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  changeEmail: vi.fn(),
  refreshUser: vi.fn(),
  logout: vi.fn(),
};

function renderPage(initialEntry = "/campaigns") {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Campaigns />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function renderCampaignRoutes(initialEntry = "/campaigns") {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/:campaignId" element={<CampaignDetails />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("Campaigns", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockCampaigns = [];
    mockCanCoverEstimate = true;
    mockApi();
    subscribeToCampaignEventsMock.mockReset().mockReturnValue(vi.fn());
  });

  it("renders the central campaign workspace with bounded scrolling", async () => {
    renderPage();
    expect(screen.getByTestId("campaign-page")).toHaveClass(
      "h-full",
      "overflow-hidden",
      "bg-[var(--page-background)]",
    );
    expect(screen.getByTestId("campaign-page-header")).not.toHaveClass("border-b");
    const campaignTabs = screen.getByRole("tablist", { name: "Campaign type" });
    expect(campaignTabs).toHaveClass("rounded-md", "bg-white", "overflow-hidden", "divide-x", "divide-[var(--border-soft)]");
    expect(screen.getByRole("tab", { name: "One Time Campaigns" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "One Time Campaigns" })).toHaveClass("bg-[var(--brand-soft)]");
    expect(screen.getByRole("button", { name: "Status filter" })).toHaveClass("border-[var(--border)]", "bg-white");
    expect(screen.getByRole("button", { name: "Category filter" })).toHaveClass("border-[var(--border)]", "bg-white");
    expect(
      screen.getByRole("heading", { name: "Campaigns" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Notifications limit")).not.toBeInTheDocument();
    const createButton = screen.getAllByRole("button", {
      name: "Create WhatsApp Campaign",
    })[0];
    expect(createButton).toBeEnabled();
    expect(createButton).toHaveClass("bg-[var(--brand)]");
    expect(createButton.querySelector("svg path")).toHaveAttribute("d", siWhatsapp.path);
    expect(screen.getByTestId("campaign-table-scroll-region")).toHaveClass(
      "min-h-0",
      "overflow-auto",
    );
    expect(screen.getByRole("table", { name: "Campaign performance" })).toHaveClass("campaign-data-table");
    const campaignHeader = screen.getByRole("columnheader", { name: "Campaign" });
    expect(campaignHeader).toHaveClass("h-[46px]");
    expect(within(campaignHeader).getByRole("heading", { name: "Campaign" })).toHaveClass("font-bold", "uppercase");
    expect(screen.getByRole("columnheader", { name: "Delivered" })).toHaveClass("text-right");
    expect(screen.queryByRole("columnheader", { name: "Channel" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Campaign performance" }).querySelector("thead")).toHaveClass("bg-[var(--sidebar-rail-background)]");
    expect(await screen.findByText("No campaigns yet")).toBeInTheDocument();
  });

  it("shows campaign names without a secondary template label", async () => {
    mockCampaigns = [
      {
        id: "campaign-template-label",
        name: "Welcome campaign",
        kind: "one_time",
        template: "hello_work",
        status: "COMPLETED",
      },
    ];
    renderPage();

    const campaignName = await screen.findByText("Welcome campaign");
    expect(campaignName).toHaveClass("group-hover:text-blue-600", "group-hover:underline");
    expect(campaignName.closest("tr")).toHaveClass("h-12");
    expect(screen.queryByText("hello_work")).not.toBeInTheDocument();
  });

  it("opens campaign details when a campaign row is selected", async () => {
    mockCampaigns = [
        {
          id: "campaign-1",
          name: "DPS Carousel_campaign_31 retarget",
          kind: "one_time",
          template: "dps_carousel",
          audience: "All opted-in contacts",
          recipientCount: 31,
          status: "COMPLETED",
          attempted: 31,
          sent: 4,
          deliveredRate: 100,
          readRate: 50,
          updatedAt: "2025-11-24T15:46:53+05:30",
          setLiveAt: "2025-11-21T15:46:53+05:30",
          templateName: "DPS Carousel",
          templateBody: "Backend campaign body",
          buttonTracking: [{ name: "Learn more", type: "URL", clicks: 2, clickPercentage: 50, users: 2 }],
          totalCost: null,
          recipients: [
            { id: "recipient-attempted", contactId: "contact-attempted", phoneE164: "+919000000001", status: "ATTEMPTED", attemptCount: 1, contact: { id: "contact-attempted", name: "Attempted User" } },
            { id: "recipient-sent", contactId: "contact-sent", phoneE164: "+919000000002", status: "SENT", attemptCount: 1, sentAt: "2025-11-21T16:00:00+05:30", contact: { id: "contact-sent", name: "Sent User" } },
            { id: "recipient-delivered", contactId: "contact-delivered", phoneE164: "+919000000003", status: "DELIVERED", attemptCount: 1, contact: { id: "contact-delivered", name: "Delivered User" } },
            { id: "recipient-read", contactId: "contact-read", phoneE164: "+919000000004", status: "READ", attemptCount: 1, contact: { id: "contact-read", name: "Read User" } },
            { id: "recipient-replied", contactId: "contact-replied", phoneE164: "+919000000005", status: "REPLIED", attemptCount: 1, contact: { id: "contact-replied", name: "Replied User" } },
            { id: "recipient-failed", contactId: "contact-failed", phoneE164: "+919000000006", status: "FAILED", attemptCount: 3, failureReason: "Meta rejected the request while sending the WhatsApp message: (#131008) Required parameter is missing", contact: { id: "contact-failed", name: "Failed User" } },
          ],
        },
      ];
    renderCampaignRoutes();
    fireEvent.click(
      await screen.findByText("DPS Carousel_campaign_31 retarget"),
    );
    expect(
      await screen.findByRole("heading", {
        name: "DPS Carousel_campaign_31 retarget",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("campaign-details-header")).toHaveClass(
      "h-[var(--header-height)]",
    );
    expect(screen.getByText("WhatsApp").previousElementSibling?.querySelector("path")).toHaveAttribute("d", siWhatsapp.path);
    expect(screen.getByText("Total Campaign Cost: ₹ 0.00")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Statistics" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View user list for Attempted" })).toHaveClass("text-blue-600");
    expect(screen.getByRole("button", { name: "Know your data" })).toHaveClass("text-blue-600", "border-blue-600");
    expect(screen.getByText("Delivered, Read, Replied can keep getting updated in the future")).toHaveClass("bg-purple-50", "text-purple-700");
    const metricIcon = (label: string) => screen.getByText(label).closest("div")?.querySelector("svg");
    expect(metricIcon("Attempted")).toHaveClass("lucide-list-checks", "text-sky-600");
    expect(metricIcon("Sent")).toHaveClass("lucide-send", "text-blue-600");
    expect(metricIcon("Delivered")).toHaveClass("lucide-check-check", "text-emerald-600");
    expect(metricIcon("Read")).toHaveClass("lucide-eye", "text-violet-600");
    expect(metricIcon("Replied")).toHaveClass("lucide-message-circle", "text-cyan-600");
    expect(metricIcon("Other Failures")).toHaveClass("lucide-triangle-alert", "text-rose-600");
    fireEvent.click(screen.getByRole("button", { name: "Know your data" }));
    const dataGuide = await screen.findByRole("dialog", { name: "Campaign data guide" });
    expect(dataGuide).toHaveTextContent("Messages marked as sent");
    expect(dataGuide).toHaveTextContent("The stages overlap");
    fireEvent.click(within(dataGuide).getByRole("button", { name: "Close campaign data guide" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Campaign data guide" })).not.toBeInTheDocument());
    expect(screen.queryByText("Limited by Meta")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Detail" })).toBeInTheDocument();
    expect(screen.getByText(/All opted-in contacts/)).toBeInTheDocument();
    expect(screen.getByText("DPS Carousel")).toBeInTheDocument();
    const detailRow = screen.getByText("Notification type").closest("div");
    expect(detailRow).toHaveClass("py-3", "md:grid-cols-[220px_minmax(0,1fr)]");
    expect(screen.getByText("Notification type").closest("dt")?.querySelector("svg")).toHaveClass("lucide-bell");
    expect(screen.getByText("Audience").closest("dt")?.querySelector("svg")).toHaveClass("lucide-users");
    expect(screen.getByText("Message").closest("dt")?.querySelector("svg")).toHaveClass("lucide-message-square-text");
    expect(screen.getByText("Schedule").closest("dt")?.querySelector("svg")).toHaveClass("lucide-calendar-clock");
    expect(screen.getByText("Backend campaign body").closest("div.rounded")).toHaveClass("py-3");
    expect(within(screen.getByTestId("button-tracking-table")).getByRole("cell", { name: "Learn more" })).toBeInTheDocument();
    const createObjectURL = vi.fn((_blob: Blob) => "blob:campaign-details-report");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    fireEvent.click(screen.getByRole("button", { name: "Download Report" }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    const reportBlob = createObjectURL.mock.lastCall?.[0] as Blob;
    const reportCsv = await reportBlob.text();
    expect(reportCsv).toContain("Other Failures");
    expect(reportCsv).toContain("Total Campaign Cost");
    expect(reportCsv).toContain("DPS Carousel");
    expect(reportCsv).toContain("31");
    expect(reportCsv).toContain("Recipient Name");
    expect(reportCsv).toContain("Attempted User");
    expect(reportCsv).toContain("+919000000001");
    expect(reportCsv).toContain("Meta rejected the request while sending the WhatsApp message: (#131008) Required parameter is missing");
    fireEvent.click(screen.getByRole("button", { name: "See Template Preview" }));
    const templatePreview = await screen.findByRole("dialog", { name: "Template preview" });
    expect(templatePreview).toHaveTextContent("DPS Carousel");
    expect(within(templatePreview).getByTestId("campaign-template-preview-message")).toHaveTextContent("Backend campaign body");
    fireEvent.click(within(templatePreview).getByRole("button", { name: "Close template preview" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Template preview" })).not.toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Upgrade Plan" }),
    ).not.toBeInTheDocument();

    const recipientCards = [
      ["Attempted", "Attempted User"],
      ["Sent", "Sent User"],
      ["Delivered", "Delivered User"],
      ["Read", "Read User"],
      ["Replied", "Replied User"],
      ["Other Failures", "Failed User"],
    ] as const;
    for (const [label, userName] of recipientCards) {
      fireEvent.click(screen.getByRole("button", { name: `View user list for ${label}` }));
      const recipientDrawer = await screen.findByRole("dialog", { name: `${label} recipients` });
      expect(recipientDrawer).toHaveAttribute("data-vaul-drawer-direction", "right");
      expect(screen.getByTestId("campaign-recipient-list")).toHaveTextContent(userName);
      if (label === "Other Failures") {
        expect(recipientDrawer).toHaveTextContent("Meta WhatsApp API · #131008");
        expect(recipientDrawer).toHaveTextContent("Meta rejected the request while sending the WhatsApp message: (#131008) Required parameter is missing");
      }
      fireEvent.click(screen.getByRole("button", { name: "Close recipient list" }));
      await waitFor(() => expect(screen.queryByRole("heading", { name: `${label} recipients` })).not.toBeInTheDocument());
    }
  });

  it("updates the campaign recipient list from SSE while the campaign is running", async () => {
    mockCampaigns = [{
      id: "campaign-live",
      name: "Live updates",
      kind: "one_time",
      template: "hello_work",
      audience: "All opted-in contacts",
      recipientCount: 1,
      status: "RUNNING",
      attempted: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      replied: 0,
      failed: 0,
      updatedAt: "2026-10-09T10:00:00.000Z",
      recipients: [],
    }];
    renderCampaignRoutes("/campaigns/campaign-live");
    expect(await screen.findByRole("heading", { name: "Live updates" })).toBeInTheDocument();
    expect(subscribeToCampaignEventsMock).toHaveBeenCalledWith({
      url: "http://localhost:5006/api/v1/workspaces/workspace-1/campaigns/campaign-live/events",
      accessToken: "access-token",
      onUpdate: expect.any(Function),
    });
    fireEvent.click(screen.getByRole("button", { name: "View user list for Sent" }));
    expect(await screen.findByText("No sent recipients yet.")).toBeInTheDocument();

    mockCampaigns = [{ ...mockCampaigns[0], attempted: 1, sent: 1, recipients: [
      { id: "recipient-live", contactId: "contact-live", phoneE164: "+919000000001", status: "SENT", attemptCount: 1, contact: { id: "contact-live", name: "Live Recipient" } },
    ] }];
    subscribeToCampaignEventsMock.mock.calls[0][0].onUpdate();

    expect(await screen.findByText("Live Recipient")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-recipient-list")).toHaveTextContent("Sent");
    expect(screen.getByRole("heading", { name: "Sent recipients" })).toBeInTheDocument();
  });

  it("opens the create flow with selected contacts from Contact Hub", async () => {
    renderPage("/campaigns?contactIds=contact-1,contact-2");
    expect(
      await screen.findByRole("heading", { name: "Create WhatsApp Campaign" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Audience")).toHaveValue("contacts");
    expect(
      screen.getByRole("option", { name: "Contact List — selected (2)" }),
    ).toBeInTheDocument();
  });

  it("opens the create flow with a selected approved template", async () => {
    renderPage("/campaigns?templateKey=august_product_launch");

    expect(
      await screen.findByRole("heading", { name: "Create WhatsApp Campaign" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /WhatsApp template/ })).toHaveTextContent("August product launch"));
    const preview = screen.getByRole("region", { name: "WhatsApp message preview" });
    expect(preview).not.toHaveTextContent("Tuesday");
    expect(within(preview).getByTestId("campaign-template-preview-message")).toHaveClass("w-fit", "max-w-[90%]");
    expect(within(preview).getByTestId("campaign-template-preview-message")).toHaveTextContent("Sample 1, your offer code is Sample 2.");
    expect(within(preview).getByText(/Variable values are examples/)).toBeInTheDocument();
  });

  it("validates and saves a campaign draft, then filters it by status", async () => {
    renderPage();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Create WhatsApp Campaign" })[0],
    );
    expect(
      screen.queryByText(
        "Configure your WhatsApp broadcast before saving or setting it live.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveClass(
      "data-[vaul-drawer-direction=right]:!max-w-[620px]",
    );
    expect(screen.getByTestId("campaign-drawer-body")).toHaveClass("!select-text");
    expect(
      screen.getByRole("heading", { name: "Choose Template" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /WhatsApp template/ })).toHaveTextContent(
        "August product launch",
      ),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/templates?status=all&page=1&pageSize=100",
      { headers: { authorization: "Bearer access-token" } },
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/segments?page=1&pageSize=50",
      { headers: { authorization: "Bearer access-token" } },
    );
    const templateSelect = screen.getByRole("combobox", { name: /WhatsApp template/ });
    expect(within(templateSelect).getByTestId("selected-template-category")).toHaveTextContent("Marketing · English (en)");
    fireEvent.click(templateSelect);
    const approvedOption = await screen.findByRole("option", { name: /August product launch.*Marketing · English \(en\)/i });
    expect(approvedOption).toBeEnabled();
    expect(within(approvedOption).getByText("August product launch")).toHaveClass("font-medium");
    expect(within(approvedOption).getByText("Marketing · English (en)")).toHaveClass("font-normal", "text-xs");
    expect(screen.getByRole("option", { name: /Pending launch template.*Marketing · English \(en\)/i })).toBeDisabled();
    expect(
      screen.getByRole("heading", { name: /Map Template Variables/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("(2 required)")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Template variable source 1"), {
      target: { value: "contact" },
    });
    fireEvent.change(screen.getByLabelText("Template variable field 1"), {
      target: { value: "name" },
    });
    fireEvent.change(screen.getByLabelText("Template variable source 2"), {
      target: { value: "constant" },
    });
    fireEvent.change(screen.getByLabelText("Template variable field 2"), {
      target: { value: "SAVE20" },
    });
    expect(
      screen.getByRole("heading", { name: "Schedule" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Retry Failed Messages")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Campaign name is required.",
    );

    fireEvent.change(screen.getByLabelText("Campaign name"), {
      target: { value: "August product launch" },
    });
    fireEvent.change(screen.getByLabelText("Audience"), {
      target: { value: "segment" },
    });
    fireEvent.change(screen.getByLabelText("Choose segment"), {
      target: { value: "segment-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

    expect(
      await screen.findByText("August product launch"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("campaign-table-panel")).getByText("Marketing"),
    ).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/campaigns",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"templateVariables":[{"source":"contact","field":"name","fallback":""},{"source":"constant","field":"SAVE20","fallback":""}]'),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Status filter" }));
    fireEvent.click(screen.getByRole("option", { name: "Completed" }));
    fireEvent.click(screen.getByRole("option", { name: "Draft" }));
    expect(
      screen.getByRole("button", { name: "Status filter" }),
    ).toHaveTextContent("Status (2)");
    fireEvent.click(screen.getByRole("option", { name: "Draft" }));
    expect(
      await screen.findByText("No campaigns match your filters"),
    ).toBeInTheDocument();
  });

  it("shows the server cost estimate and waits for confirmation before launching", async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Create WhatsApp Campaign" })[0]);
    await waitFor(() => expect(screen.getByRole("combobox", { name: /WhatsApp template/ })).toHaveTextContent("August product launch"));
    fireEvent.change(screen.getByLabelText("Campaign name"), { target: { value: "Launch review" } });
    fireEvent.change(screen.getByLabelText("Template variable source 1"), { target: { value: "constant" } });
    fireEvent.change(screen.getByLabelText("Template variable field 1"), { target: { value: "Hi" } });
    fireEvent.change(screen.getByLabelText("Template variable source 2"), { target: { value: "constant" } });
    fireEvent.change(screen.getByLabelText("Template variable field 2"), { target: { value: "SAVE" } });
    fireEvent.click(screen.getByRole("button", { name: "Review cost" }));
    expect(await screen.findByRole("heading", { name: "Review campaign" })).toBeInTheDocument();
    expect(screen.getAllByText("INR 6.00")).toHaveLength(2);
    expect(screen.getByText("INR 400.00")).toBeInTheDocument();
    expect(screen.getByText("INR 394.00")).toBeInTheDocument();
    expect(screen.getByText(/assumes 100% delivery to eligible recipients/i)).toBeInTheDocument();
    expect(screen.getByText(/charged only for messages successfully delivered/i)).toBeInTheDocument();
    expect(screen.getByText(/3 contacts excluded/)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/campaigns/estimate", expect.objectContaining({ method: "POST" }));
    expect(apiRequest).not.toHaveBeenCalledWith("/workspaces/workspace-1/campaigns", expect.objectContaining({ method: "POST", body: expect.stringContaining('"launchMode":"send"') }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/campaigns", expect.objectContaining({ method: "POST", body: expect.stringContaining('"launchMode":"send"') })));
  });

  it("opens the native date and time picker from the schedule calendar button", async () => {
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, "showPicker", { configurable: true, value: showPicker });
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Create WhatsApp Campaign" })[0]);
    fireEvent.change(screen.getByRole("combobox", { name: "Schedule" }), { target: { value: "schedule" } });
    fireEvent.click(screen.getByRole("button", { name: "Open schedule calendar" }));
    expect(showPicker).toHaveBeenCalledOnce();
  });

  it("blocks campaign confirmation when the wallet cannot cover the estimate", async () => {
    mockCanCoverEstimate = false;
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Create WhatsApp Campaign" })[0]);
    await waitFor(() => expect(screen.getByRole("combobox", { name: /WhatsApp template/ })).toHaveTextContent("August product launch"));
    fireEvent.change(screen.getByLabelText("Campaign name"), { target: { value: "Insufficient balance" } });
    fireEvent.change(screen.getByLabelText("Template variable source 1"), { target: { value: "constant" } });
    fireEvent.change(screen.getByLabelText("Template variable field 1"), { target: { value: "Hi" } });
    fireEvent.change(screen.getByLabelText("Template variable source 2"), { target: { value: "constant" } });
    fireEvent.change(screen.getByLabelText("Template variable field 2"), { target: { value: "SAVE" } });
    fireEvent.click(screen.getByRole("button", { name: "Review cost" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Available wallet funds don’t cover this campaign’s estimated cost");
    expect(screen.getByRole("button", { name: "Confirm and send" })).toBeDisabled();
    expect(apiRequest).not.toHaveBeenCalledWith("/workspaces/workspace-1/campaigns", expect.objectContaining({ method: "POST", body: expect.stringContaining('"launchMode":"send"') }));
  });

  it("does not offer campaign actions to a read-only workspace role", async () => {
    const readOnlyAuth = {
      ...auth,
      user: auth.user && {
        ...auth.user,
        memberships: [
          {
            ...auth.user.memberships[0],
            role: {
              ...auth.user.memberships[0].role,
              permissions: ["campaigns.read"],
            },
          },
        ],
      },
    };
    render(
      <AuthContext.Provider value={readOnlyAuth}>
        <MemoryRouter>
          <Campaigns />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(
      screen.getByRole("heading", { name: "Campaigns" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create campaign" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("No campaigns yet")).toBeInTheDocument();
  });

  it("offers a report download and duplicates an existing campaign", async () => {
    mockCampaigns = [
        {
          id: "campaign-1",
          name: "Welcome series",
          kind: "one_time",
          template: "product_update",
          audience: "All opted-in contacts",
          recipientCount: null,
          status: "DRAFT",
          totalCost: 91.37,
          scheduledAt: null,
          sent: 0,
          delivered: 0,
          read: 0,
          failed: 0,
          updatedAt: "2026-08-25T10:00:00.000Z",
        },
      ];
    const createObjectURL = vi.fn(() => "blob:campaign-report");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    renderPage();
    expect(await screen.findByText("Welcome series")).toBeInTheDocument();
    expect(within(screen.getByTestId("campaign-table-panel")).getByText("₹ 91.37")).toBeInTheDocument();
    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: "Campaign actions for Welcome series",
      }),
      { button: 0, ctrlKey: false },
    );
    expect(
      screen.getByRole("menuitem", { name: "Download report" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Duplicate campaign" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Delete/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Download report" }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    const reportBlob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    expect(await reportBlob.text()).toContain('"Total Campaign Cost (INR)"');
    expect(await reportBlob.text()).toContain('"91.37"');
    expect(revokeObjectURL).toHaveBeenCalledOnce();

    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: "Campaign actions for Welcome series",
      }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Duplicate campaign" }),
    );
    expect(
      await screen.findByText("Welcome series (Copy)"),
    ).toBeInTheDocument();
    expect(mockCampaigns[0]).toMatchObject({
      name: "Welcome series (Copy)",
      status: "DRAFT",
    });
  });

  it("pauses a running campaign and offers resume and cancel controls", async () => {
    mockCampaigns = [{ id: "campaign-live", name: "Live launch", kind: "one_time", template: "product_update", audience: "Opted-in contacts", recipientCount: 12, status: "RUNNING", sent: 3, delivered: 1, read: 0, failed: 0, updatedAt: "2026-10-09T10:00:00.000Z" }];
    renderPage();
    await screen.findByText("Live launch");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Campaign actions for Live launch" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("menuitem", { name: "Pause campaign" }));
    await waitFor(() => expect(mockCampaigns[0]?.status).toBe("PAUSED"));
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining("/campaign-live/control"), expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "pause" }) }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Campaign actions for Live launch" }), { button: 0, ctrlKey: false });
    expect(screen.getByRole("menuitem", { name: "Resume campaign" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Cancel campaign" })).toBeInTheDocument();
    const browserConfirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel campaign" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Cancel this campaign?");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Messages already being sent may still complete.");
    expect(browserConfirm).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalledWith(expect.stringContaining("/control"), expect.objectContaining({ body: JSON.stringify({ action: "cancel" }) }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel campaign" }));
    await waitFor(() => expect(mockCampaigns[0]?.status).toBe("CANCELLED"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("omits creator filters when a campaign has no valid creator ID", async () => {
    mockCampaigns = [{ id: "campaign-legacy", name: "Legacy campaign", kind: "one_time", template: "product_update", audience: "Opted-in contacts", status: "DRAFT", createdBy: "Workspace Owner", createdById: null, updatedAt: "2026-10-09T10:00:00.000Z" }];
    renderPage();
    await screen.findByText("Legacy campaign");
    fireEvent.click(screen.getByRole("button", { name: "Created by filter" }));
    expect(screen.queryByRole("option", { name: "Workspace Owner" })).not.toBeInTheDocument();
  });
});
