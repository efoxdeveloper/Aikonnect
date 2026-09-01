import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { Campaigns } from "@/pages/Campaigns";
import { CampaignDetails } from "@/pages/CampaignDetails";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: vi.fn().mockResolvedValue({
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
  }),
}));

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
  });

  it("renders the central campaign workspace with bounded scrolling", () => {
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
    expect(screen.getByText("No campaigns yet")).toBeInTheDocument();
  });

  it("opens campaign details when a campaign row is selected", async () => {
    window.localStorage.setItem(
      "interakt-campaigns-v1:workspace-1",
      JSON.stringify([
        {
          id: "campaign-1",
          name: "DPS Carousel_campaign_31 retarget",
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
        },
      ]),
    );
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
    expect(screen.getByText(/DPS - R2 - Read Excluded/)).toBeInTheDocument();
    expect(screen.getByText("DPS Carousel")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("button-tracking-table")).getByRole("cell", {
        name: "Discover why leading schools choose EduFox",
      }),
    ).toBeInTheDocument();
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
    const stored = JSON.parse(
      window.localStorage.getItem("interakt-campaigns-v1:workspace-1") ?? "[]",
    ) as Array<{ audience: string }>;
    expect(stored).toHaveLength(1);
    expect(stored[0].audience).toBe("Saved audience segment");

    fireEvent.click(screen.getByRole("button", { name: "Status filter" }));
    fireEvent.click(screen.getByRole("option", { name: "Completed" }));
    fireEvent.click(screen.getByRole("option", { name: "Draft" }));
    expect(
      screen.getByRole("button", { name: "Status filter" }),
    ).toHaveTextContent("Status (2)");
    fireEvent.click(screen.getByRole("option", { name: "Draft" }));
    expect(
      screen.getByText("No campaigns match your filters"),
    ).toBeInTheDocument();
  });

  it("does not offer campaign actions to a read-only workspace role", () => {
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
    expect(screen.getByText("No campaigns yet")).toBeInTheDocument();
  });

  it("offers a report download and duplicates an existing campaign", async () => {
    window.localStorage.setItem(
      "interakt-campaigns-v1:workspace-1",
      JSON.stringify([
        {
          id: "campaign-1",
          name: "Welcome series",
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
      ]),
    );
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
    const stored = JSON.parse(
      window.localStorage.getItem("interakt-campaigns-v1:workspace-1") ?? "[]",
    ) as Array<{ name: string; status: string }>;
    expect(stored[0]).toMatchObject({
      name: "Welcome series (Copy)",
      status: "DRAFT",
    });
  });
});
