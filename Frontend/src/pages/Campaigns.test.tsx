import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { Campaigns } from "@/pages/Campaigns";
import { CampaignDetails } from "@/pages/CampaignDetails";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: vi.fn(),
}));

const templateResponse = {
  items: [
      {
        id: "template-approved",
        name: "August product launch",
        key: "august_product_launch",
        status: "APPROVED",
        category: "Marketing",
        language: "English (en)",
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

function mockApi() {
  vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
    if (path.includes("/templates")) return templateResponse;
    if (path.includes("/duplicate")) {
      const sourceId = path.split("/campaigns/")[1]?.split("/")[0];
      const source = mockCampaigns.find((item) => item.id === sourceId);
      const duplicate = { ...source, id: "campaign-copy", name: `${String(source?.name ?? "Campaign")} (Copy)`, status: "DRAFT", attempted: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, setLiveAt: null };
      mockCampaigns = [duplicate, ...mockCampaigns];
      return duplicate;
    }
    if (path.includes("/campaigns/") && !path.endsWith("/campaigns")) {
      const id = path.split("/campaigns/")[1]?.split("?")[0];
      return { ...mockCampaigns.find((item) => item.id === id), recipients: [] };
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
    mockApi();
  });

  it("renders the central campaign workspace with bounded scrolling", async () => {
    renderPage();
    expect(screen.getByTestId("campaign-page")).toHaveClass(
      "h-full",
      "overflow-hidden",
    );
    expect(screen.getByTestId("campaign-page-header")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Campaigns" }),
    ).toBeInTheDocument();
    const createButton = screen.getAllByRole("button", {
      name: "Create WhatsApp Campaign",
    })[0];
    expect(createButton).toBeEnabled();
    expect(createButton).toHaveClass("bg-[var(--brand)]");
    expect(screen.getByTestId("campaign-table-scroll-region")).toHaveClass(
      "min-h-0",
      "overflow-auto",
    );
    expect(screen.getByTestId("campaign-table-panel").querySelector("table")).toHaveClass("campaign-data-table");
    expect(await screen.findByText("No campaigns yet")).toBeInTheDocument();
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
    expect(screen.getByText(/Total Campaign Cost:/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Statistics" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Limited by Meta")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Detail" })).toBeInTheDocument();
    expect(screen.getByText(/All opted-in contacts/)).toBeInTheDocument();
    expect(screen.getByText("DPS Carousel")).toBeInTheDocument();
    expect(within(screen.getByTestId("button-tracking-table")).getByRole("cell", { name: "Learn more" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Upgrade Plan" }),
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("heading", { name: "Choose Template" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("WhatsApp template")).toHaveValue(
        "august_product_launch",
      ),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/templates?status=all&page=1&pageSize=100",
      { headers: { authorization: "Bearer access-token" } },
    );
    expect(
      screen.getByRole("option", {
        name: /August product launch.*approved/i,
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("option", {
        name: /Pending launch template.*pending/i,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("heading", { name: "Map Template Variables" }),
    ).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

    expect(
      await screen.findByText("August product launch"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("campaign-table-panel")).getByText("Marketing"),
    ).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/campaigns",
      expect.objectContaining({ method: "POST" }),
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
});
