import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateBuilder } from "@/pages/TemplateBuilder";
import { Templates } from "@/pages/Templates";
import { apiRequest } from "@/lib/api";

const templateRows = vi.hoisted(() => [
  { id: "template-1", name: "boost_conversion", key: "boost_conversion", status: "APPROVED", category: "Marketing", language: "English (en)", templateType: "standard", body: "Boost your conversions", footer: null, createdBy: "Keshav Sharma", createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" },
  { id: "template-2", name: "DPS Carousel", key: "dps_carousel", status: "DRAFT", category: "Marketing", language: "English (en)", templateType: "carousel", body: "Product carousel", footer: null, createdBy: "Keshav Sharma", createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" },
  { id: "template-3", name: "Rejected OTP", key: "rejected_otp", status: "REJECTED", category: "Marketing", language: "English (en)", templateType: "standard", body: "Your OTP is 6128", footer: null, createdBy: "Keshav Sharma", createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z", metaRejectionReason: "AI preflight: Category mismatch and hardcoded OTP in body.\nbody: Replace the hardcoded OTP with {{1}}." },
]);
const libraryRows = vi.hoisted(() => [{ id: "library-1", name: "order_delivery_update", language: "en_US", category: "UTILITY", topic: "ORDER_MANAGEMENT", industry: "E_COMMERCE", usecase: "DELIVERY_UPDATE", body: "Good news! Your order {{1}} is on its way.", parameters: null, buttons: [{ type: "URL", text: "Track order" }], components: [] }]);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ accessToken: "test-token", user: { memberships: [{ workspace: { id: "workspace-1" } }] } }) }));
vi.mock("@/lib/api", () => ({ ApiError: class ApiError extends Error {}, apiRequest: vi.fn().mockImplementation(async (path: string) => path.includes("/templates/library") ? { items: libraryRows, paging: {} } : { items: templateRows, pagination: { page: 1, pageSize: 25, total: 3, totalPages: 1 } }) }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/templates"]}>
      <LocationProbe />
      <Routes>
        <Route path="/templates" element={<Templates />} />
        <Route path="/createtemplate" element={<TemplateBuilder />} />
        <Route path="/campaigns" element={<div>Campaigns</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}{location.search}</span>;
}

describe("Templates", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renders the library view with its three tabs", async () => {
    renderPage();

    expect(screen.getByTestId("templates-page")).toHaveClass(
      "h-full",
      "overflow-hidden",
    );
    expect(screen.getByRole("heading", { name: "Templates" })).toBeInTheDocument();
    expect(screen.queryByText("Meta is the source of truth for submitted WhatsApp templates.")).not.toBeInTheDocument();
    expect(screen.getByTestId("templates-filter-toolbar")).toContainElement(screen.getByRole("button", { name: "Sync from Meta" }));
    expect(screen.getByRole("button", { name: "Sync from Meta" })).toHaveClass("ml-auto");
    expect(screen.getByRole("button", { name: "New Template" })).toHaveClass(
      "bg-[var(--brand)]",
    );
    expect(screen.getByRole("tab", { name: "My Templates" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => expect(screen.getByTestId("templates-table-panel")).toBeInTheDocument());
    expect(screen.getAllByText("boost_conversion")).toHaveLength(2);
  });

  it("shows the active table, filters templates, and supports the create route", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "Active" }));
    await waitFor(() => expect(screen.getByTestId("templates-table-scroll-region")).toHaveClass(
      "min-h-0",
      "overflow-auto",
    ));
    expect(screen.getAllByText("boost_conversion")).toHaveLength(2);
    expect(screen.getByTestId("template-row-actions-boost_conversion")).toHaveClass(
      "opacity-0",
      "group-hover:opacity-100",
    );
    await waitFor(() => expect(screen.getByText("DPS Carousel")).toBeInTheDocument());

    fireEvent.change(screen.getByRole("textbox", { name: "Search templates" }), {
      target: { value: "DPS" },
    });
    await waitFor(() => expect(screen.getByText("DPS Carousel")).toBeInTheDocument());
    expect(screen.queryByText("boost_conversion")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New Template" }));
    expect(screen.getByRole("heading", { name: "Create template" })).toBeInTheDocument();
  });

  it("opens template details and shows the rejection reason", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Rejected OTP")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Rejected OTP"));

    expect(screen.getByRole("dialog", { name: "Rejected OTP" })).toBeInTheDocument();
    expect(screen.getByTestId("template-rejection-reason")).toHaveTextContent("Category mismatch and hardcoded OTP in body.");
    expect(screen.getByTestId("template-rejection-reason")).toHaveTextContent("Replace the hardcoded OTP with {{1}}.");
    expect(screen.getByRole("button", { name: "Close template details" })).toBeInTheDocument();
  });

  it("opens campaign creation with an approved template selected", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText("boost_conversion").length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByText("boost_conversion")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Use in campaign" }));

    expect(screen.getByText("Campaigns")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/campaigns?templateKey=boost_conversion");
  });

  it("syncs the workspace library from Meta", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Sync from Meta" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/templates/sync",
      { method: "POST", headers: { authorization: "Bearer test-token" } },
    ));
  });

  it("searches the Meta template library and adds a selected template to the WABA", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Meta Template Library" }));

    expect(await screen.findByText("Order Delivery Update")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter Meta templates by topic" }), { target: { value: "IDENTITY_VERIFICATION" } });
    await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([path]) => typeof path === "string" && path.includes("topic=IDENTITY_VERIFICATION"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /Order Delivery Update/ }));
    expect(screen.getByRole("dialog", { name: "Order Delivery Update" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Button URL"), { target: { value: "https://shop.example/track" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to my templates" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/templates/library/add",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"libraryTemplateName":"order_delivery_update"') }),
    ));
  });

  it("shows the Meta sync diagnostic when no templates are returned", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("templates-table-panel")).toBeInTheDocument());
    vi.mocked(apiRequest).mockResolvedValueOnce({ imported: 0, wabaId: "waba-1", debug: { tokenSource: "system_user", pages: 1, remoteCount: 0, importedCount: 0, categories: {} } });

    fireEvent.click(screen.getByRole("button", { name: "Sync from Meta" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(
      "Meta returned 0 templates. WABA waba-1; token: system_user; pages: 1.",
    ));
  });

  it("shows an empty state for deleted templates", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Deleted" }));
    await waitFor(() => expect(screen.getByText("No templates found.")).toBeInTheDocument());
  });

  it("requires confirmation before deleting a template", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Active" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete boost_conversion" })).toBeInTheDocument());
    vi.mocked(apiRequest).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Delete boost_conversion" }));
    const confirmation = screen.getByRole("alertdialog", { name: "Delete this template?" });
    expect(confirmation).toBeInTheDocument();
    expect(vi.mocked(apiRequest)).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog", { name: "Delete this template?" })).not.toBeInTheDocument();
    expect(vi.mocked(apiRequest)).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete boost_conversion" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete template" }));
    await waitFor(() => expect(vi.mocked(apiRequest)).toHaveBeenCalledWith(
      "/workspaces/workspace-1/templates/template-1",
      expect.objectContaining({ method: "DELETE" }),
    ));
  });
});
