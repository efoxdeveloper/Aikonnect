import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateBuilder } from "@/pages/TemplateBuilder";
import { Templates } from "@/pages/Templates";
import { apiRequest } from "@/lib/api";

const templateRows = vi.hoisted(() => [
  { id: "template-1", name: "boost_conversion", key: "boost_conversion", status: "APPROVED", category: "Marketing", language: "English (en)", templateType: "standard", body: "Boost your conversions", footer: null, createdBy: "Keshav Sharma", createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" },
  { id: "template-2", name: "DPS Carousel", key: "dps_carousel", status: "DRAFT", category: "Marketing", language: "English (en)", templateType: "carousel", body: "Product carousel", footer: null, createdBy: "Keshav Sharma", createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" },
]);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ accessToken: "test-token", user: { memberships: [{ workspace: { id: "workspace-1" } }] } }) }));
vi.mock("@/lib/api", () => ({ ApiError: class ApiError extends Error {}, apiRequest: vi.fn().mockResolvedValue({ items: templateRows, pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1 } }) }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/templates"]}>
      <Routes>
        <Route path="/templates" element={<Templates />} />
        <Route path="/createtemplate" element={<TemplateBuilder />} />
      </Routes>
    </MemoryRouter>,
  );
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
    expect(screen.getByRole("button", { name: "New Template" })).toHaveClass(
      "bg-[var(--brand)]",
    );
    expect(screen.getByRole("tab", { name: "Template Library" })).toHaveAttribute(
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

  it("syncs the workspace library from Meta", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Sync from Meta" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/templates/sync",
      { method: "POST", headers: { authorization: "Bearer test-token" } },
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
