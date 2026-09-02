import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest, downloadApiFile } from "@/lib/api";
import { Reports } from "@/pages/Reports";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: vi.fn(),
  downloadApiFile: vi.fn(),
}));

const reportResponse = {
  report: "overview",
  filters: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-31T23:59:59.999Z" },
  summary: { totalContacts: 12, conversations: 4, messages: 18 },
  rows: [],
  pagination: { total: 0 },
  trends: [{ date: "2026-08-21", value: 8, secondary: 10 }],
};

const contactsResponse = {
  report: "contacts",
  filters: reportResponse.filters,
  summary: { contacts: 1, optedIn: 1, optedOutOrBlocked: 0, totalDealValue: 5000 },
  rows: [{ id: "contact-1", contact: "Asha Sharma", phone: "+919876543210", source: "Import", stage: "NEW", dealValue: 5000, whatsappOpted: true, createdAt: "2026-08-21T10:00:00.000Z" }],
  pagination: { total: 1 },
};

const auth: AuthContextValue = {
  status: "authenticated",
  user: {
    id: "owner",
    email: "owner@example.com",
    firstName: "Workspace",
    lastName: "Owner",
    emailVerifiedAt: "2026-08-22T00:00:00.000Z",
    memberships: [{ id: "membership-1", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z" }, role: { id: "owner-role", name: "Owner", slug: "owner", permissions: ["reports.read", "reports.export"] } }],
  },
  accessToken: "access-token",
  login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

function renderPage(value = auth) {
  return render(<AuthContext.Provider value={value}><MemoryRouter initialEntries={["/reports"]}><Reports /></MemoryRouter></AuthContext.Provider>);
}

describe("Reports", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockImplementation(async (path) => path.includes("/contacts?") ? contactsResponse : reportResponse);
    vi.mocked(downloadApiFile).mockResolvedValue(new Blob(["report,campaigns\n"]));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:report");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  it("loads backend summary data with bounded filters and table scrolling", async () => {
    renderPage();
    expect(screen.getByTestId("reports-page")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByTestId("reports-filter-toolbar")).toBeInTheDocument();
    expect(screen.getByLabelText("Search report")).toBeInTheDocument();
    expect(await screen.findByText("Total contacts")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByTitle("2026-08-21: 8 messages")).toBeInTheDocument();
  });

  it("sends search and filters to the backend for the selected report", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Contacts" }));
    await screen.findByText("Asha Sharma");
    fireEvent.change(screen.getByLabelText("Search report"), { target: { value: "Asha" } });
    fireEvent.change(screen.getByLabelText("Filter by source"), { target: { value: "Import" } });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining("/workspaces/workspace-1/reports/contacts?"), expect.objectContaining({ headers: { authorization: "Bearer access-token" } })));
    const requestPaths = vi.mocked(apiRequest).mock.calls.map(([path]) => String(path));
    expect(requestPaths.some((path) => path.includes("search=Asha") && path.includes("source=Import"))).toBe(true);
    expect(screen.getByTestId("report-table-scroll-region")).toHaveClass("min-h-0", "overflow-auto");
  });

  it("exports the currently filtered report through the backend", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Search report"), { target: { value: "monthly" } });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(downloadApiFile).toHaveBeenCalledWith(expect.stringContaining("/workspaces/workspace-1/reports/overview/export?"), "access-token"));
    expect(downloadApiFile).toHaveBeenCalledWith(expect.stringContaining("search=monthly"), "access-token");
  });

  it("enforces the reports read permission in the UI", () => {
    const readOnlyAuth = { ...auth, user: auth.user && { ...auth.user, memberships: [{ ...auth.user.memberships[0], role: { ...auth.user.memberships[0].role, permissions: [] } }] } };
    renderPage(readOnlyAuth);
    expect(screen.getByRole("heading", { name: "Reports access is restricted" })).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
