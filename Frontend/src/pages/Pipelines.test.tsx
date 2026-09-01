import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Pipelines } from "@/pages/Pipelines";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const auth: AuthContextValue = {
  status: "authenticated", user: { id: "user-1", email: "owner@example.com", firstName: "Pawan", lastName: "Owner", emailVerifiedAt: null, memberships: [{ id: "membership-1", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: null }, role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["contacts.read", "contacts.update"] } }] }, accessToken: "access-token", login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

describe("Pipelines", () => {
  it("renders contacts as cards in their sales stages", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce([{ id: "field-1", key: "lead_status", label: "Sales Status", type: "SELECT", options: ["New Lead", "Qualification"], required: false, position: 0, archivedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" }])
      .mockResolvedValueOnce({ items: [{ id: "contact-1", name: "Mohit", phone: "+918477892115", hasPhone: true, whatsappId: null, hasWhatsappId: false, profileName: null, email: null, source: "Manual", status: "New Lead", userId: null, accountOwnerId: null, accountOwner: null, dealValue: null, whatsappOpted: true, whatsappOptInSource: null, whatsappOptedInAt: null, whatsappOptOutSource: null, whatsappOptedOutAt: null, marketingBlocked: false, marketingBlockedAt: null, marketingBlockSource: null, marketingBlockReason: null, marketingEligible: true, tags: [], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", customAttributes: { company: "Acme" } }], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } });

    render(<AuthContext.Provider value={auth}><MemoryRouter><Pipelines /></MemoryRouter></AuthContext.Provider>);

    expect(await screen.findByRole("heading", { name: "Sales Pipelines" })).toBeInTheDocument();
    expect(screen.getByText("New Lead")).toBeInTheDocument();
    expect(screen.getByLabelText("Mohit lead card")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-kanban-scroll-region")).toHaveClass("min-h-0", "overflow-auto");
    expect(screen.getAllByRole("button", { name: "Add Contact" })).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Add Contact" })[0]);
    expect((await screen.findAllByText("Create contact")).length).toBeGreaterThan(0);
  });

  it("sorts pipeline cards by closure deadline and contact name", async () => {
    const makeContact = (id: string, name: string, createdAt: string, closureDeadline: string) => ({ id, name, phone: null, hasPhone: false, whatsappId: null, hasWhatsappId: false, profileName: null, email: null, source: "Manual", status: "New Lead", userId: null, accountOwnerId: null, accountOwner: null, dealValue: null, whatsappOpted: true, whatsappOptInSource: null, whatsappOptedInAt: null, whatsappOptOutSource: null, whatsappOptedOutAt: null, marketingBlocked: false, marketingBlockedAt: null, marketingBlockSource: null, marketingBlockReason: null, marketingEligible: true, tags: [], createdAt, updatedAt: createdAt, customAttributes: { closure_deadline: closureDeadline } });
    vi.mocked(apiRequest)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ items: [makeContact("contact-1", "Zara", "2026-08-02T00:00:00.000Z", "2026-09-10T00:00:00.000Z"), makeContact("contact-2", "Amir", "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z")], pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1, hasNext: false, hasPrevious: false } });

    render(<AuthContext.Provider value={auth}><MemoryRouter><Pipelines /></MemoryRouter></AuthContext.Provider>);

    expect(await screen.findByRole("combobox", { name: "Sort contacts by" })).toHaveTextContent("Contact Creation Date");
    fireEvent.click(screen.getByRole("combobox", { name: "Sort contacts by" }));
    fireEvent.click(await screen.findByRole("option", { name: "Closure Deadline" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Sort direction" }));
    fireEvent.click(await screen.findByRole("option", { name: "Ascending" }));
    expect(screen.getAllByLabelText(/lead card/).map((card) => card.getAttribute("aria-label"))).toEqual(["Amir lead card", "Zara lead card"]);

    fireEvent.click(screen.getByRole("combobox", { name: "Sort contacts by" }));
    fireEvent.click(await screen.findByRole("option", { name: "Contact Name" }));
    expect(screen.getAllByLabelText(/lead card/).map((card) => card.getAttribute("aria-label"))).toEqual(["Amir lead card", "Zara lead card"]);
  });
});
