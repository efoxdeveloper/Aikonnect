import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "react-toastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { Automations } from "@/pages/Automations";
import { AutomationBuilder } from "@/pages/AutomationBuilder";

vi.mock("@/lib/api", () => ({ ApiError: class ApiError extends Error {}, apiRequest: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const permissions = ["automations.read", "automations.manage"];
const auth: AuthContextValue = {
  status: "authenticated", accessToken: "access-token", user: { id: "user-1", email: "owner@example.com", firstName: "Workspace", lastName: "Owner", emailVerifiedAt: null, memberships: [{ id: "membership-1", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: null }, role: { id: "role-1", name: "Owner", slug: "owner", permissions } }] },
  login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};
const automation = { id: "automation-1", workspaceId: "workspace-1", name: "Demo Lead Automation", description: "Handle demo requests", status: "ACTIVE", trigger: { type: "MESSAGE_RECEIVED", config: {} }, conditions: [], actions: [{ id: "action-1", type: "SEND_MESSAGE", order: 1, config: { message: "Hello" } }], runCount: 1245, lastRunAt: null, createdAt: "2026-08-29T08:00:00.000Z", updatedAt: "2026-08-29T08:00:00.000Z", createdBy: { id: "user-1", firstName: "Workspace", lastName: "Owner" } } as const;

function renderRoutes(initialEntry: string) { return render(<AuthContext.Provider value={auth}><MemoryRouter initialEntries={[initialEntry]}><Routes><Route path="/automations" element={<Automations />} /><Route path="/automations/create" element={<AutomationBuilder />} /></Routes></MemoryRouter></AuthContext.Provider>); }

describe("Automation module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (options?.method === "POST") return { ...automation, status: path.includes("/activate") ? "ACTIVE" : "DRAFT" } as never;
      if (path.includes("/automations?") || path.endsWith("/automations")) return { items: [automation], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } } as never;
      if (path.includes("/contacts/tags")) return [] as never;
      if (path.includes("/members")) return [] as never;
      if (path.includes("/custom-fields")) return [] as never;
      if (path.includes("/templates")) return { items: [] } as never;
      return automation as never;
    });
  });

  it("renders the split Automation navigation and persisted automation list", async () => {
    renderRoutes("/automations");
    expect(screen.getByTestId("automation-shell")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Automation navigation" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /Workflows/ })).toHaveLength(2);
    expect(await screen.findByText("Demo Lead Automation")).toBeInTheDocument();
    expect(screen.queryByText("Automatically respond to customers and perform actions when specific events occur.")).not.toBeInTheDocument();
    expect(screen.getByText("New WhatsApp message received")).toBeInTheDocument();
    expect(screen.getByText("Send WhatsApp message")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Toggle Demo Lead Automation" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("1,245")).toBeInTheDocument();
    expect(screen.getByTestId("automations-table-scroll-region")).toHaveClass("min-h-0", "overflow-auto");
  });

  it("renders the vertical When, Filter and Then rule builder", async () => {
    renderRoutes("/automations/create");
    expect(await screen.findByTestId("automation-rule-builder")).toHaveClass("min-h-0", "overflow-y-auto");
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path === "/workspaces/workspace-1/templates?status=active&page=1&pageSize=100")).toBe(true);
    expect(screen.queryByTestId("automation-flow-canvas")).not.toBeInTheDocument();
    expect(screen.getByTestId("automation-builder")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByTestId("automation-when-card")).toBeInTheDocument();
    expect(screen.getByTestId("automation-filter-card")).toBeInTheDocument();
    expect(screen.getByTestId("automation-no-actions")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(await screen.findByRole("heading", { name: "Select a trigger" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    expect(await screen.findByRole("heading", { name: "Filters" })).toBeInTheDocument();
  });

  it("adds a Then card from the action picker", async () => {
    renderRoutes("/automations/create");
    fireEvent.click(screen.getByRole("button", { name: "Add action" }));
    fireEvent.click(await screen.findByRole("button", { name: /Send WhatsApp message/ }));

    expect(await screen.findByTestId(/automation-then-card-/)).toBeInTheDocument();
    expect(screen.queryByTestId("automation-no-actions")).not.toBeInTheDocument();
  });

  it("uses the global success toast after publishing", async () => {
    renderRoutes("/automations/create");
    fireEvent.change(screen.getByLabelText("Automation Name"), { target: { value: "Demo Lead Automation" } });

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /New WhatsApp message received/ }));

    fireEvent.click(screen.getByRole("button", { name: "Add action" }));
    fireEvent.click(await screen.findByRole("button", { name: /Close conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Automation published."));
    expect(await screen.findByTestId("automations-page")).toBeInTheDocument();
    expect(screen.queryByText("Automation published.")).not.toBeInTheDocument();
  });

  it("marks the automation name input invalid when it is required", async () => {
    renderRoutes("/automations/create");
    const nameInput = screen.getByLabelText("Automation Name");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(nameInput).toHaveAttribute("aria-invalid", "true"));
    expect(nameInput).toHaveClass("border-red-500", "focus:border-red-500");
    fireEvent.change(nameInput, { target: { value: "Welcome automation" } });
    expect(nameInput).toHaveAttribute("aria-invalid", "false");
  });
});
