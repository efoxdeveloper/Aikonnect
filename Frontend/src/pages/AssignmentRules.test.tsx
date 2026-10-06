import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { AssignmentRules } from "@/pages/AssignmentRules";

vi.mock("@/lib/api", () => ({ ApiError: class ApiError extends Error {}, apiRequest: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const memberId = "00000000-0000-4000-8000-000000000001";
const rule = { id: "rule-1", workspaceId: "workspace-1", name: "VIP rotation", priority: 0, enabled: true, contactTagId: null, phoneNumberId: null, strategy: "ROUND_ROBIN" as const, memberIds: [memberId], roundRobinCursor: 0, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
const auth: AuthContextValue = {
  status: "authenticated", accessToken: "test-token", user: { id: "user-1", email: "owner@example.com", firstName: "Workspace", lastName: "Owner", emailVerifiedAt: null, memberships: [{ id: "membership-1", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: null }, role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["conversations.assign"] } }] },
  login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

function renderPage() { return render(<AuthContext.Provider value={auth}><MemoryRouter><AssignmentRules /></MemoryRouter></AuthContext.Provider>); }

describe("AssignmentRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (path.endsWith("/options")) return { members: [{ id: memberId, name: "Ravi Agent", email: "ravi@example.com" }], tags: [{ id: "tag-1", name: "VIP" }], phoneNumbers: [{ id: "phone-1", name: "+91 98765 43210" }] } as never;
      if (options?.method === "POST") return { ...rule, id: "rule-2", name: "New incoming leads" } as never;
      if (options?.method === "PUT" && path.endsWith("/rule-1")) {
        const payload = JSON.parse(String(options.body));
        return { ...rule, ...payload } as never;
      }
      if (options?.method === "DELETE") return undefined as never;
      if (path.endsWith("/assignment-rules")) return { items: [rule] } as never;
      return { items: [rule] } as never;
    });
  });

  it("creates an ordered rule and supports editing, pausing, and deleting it", async () => {
    renderPage();
    expect(await screen.findByText("VIP rotation")).toBeInTheDocument();
    expect(screen.getByText("Round robin")).toBeInTheDocument();
    expect(screen.getByTestId("assignment-rules-page")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByTestId("assignment-rules-panel")).toHaveClass("min-h-0", "overflow-hidden");
    expect(screen.getByTestId("assignment-rules-scroll-region")).toHaveClass("min-h-0", "overflow-auto");

    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));
    const createDialog = screen.getByRole("dialog", { name: "Create assignment rule" });
    expect(createDialog).toHaveClass("overflow-hidden", "max-w-xl");
    expect(screen.getByTestId("assignment-rule-form-scroll-region")).toHaveClass("min-h-0", "overflow-y-auto");
    fireEvent.change(within(createDialog).getByLabelText("Rule name"), { target: { value: "New incoming leads" } });
    fireEvent.click(within(createDialog).getByRole("checkbox", { name: /Ravi Agent/ }));
    fireEvent.click(within(createDialog).getByRole("button", { name: "Create rule" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/assignment-rules", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("New incoming leads")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit VIP rotation" }));
    const editDialog = screen.getByRole("dialog", { name: "Edit assignment rule" });
    fireEvent.change(within(editDialog).getByLabelText("Rule name"), { target: { value: "Priority VIP" } });
    fireEvent.click(within(editDialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/assignment-rules/rule-1", expect.objectContaining({ method: "PUT" })));
    expect(await screen.findByText("Priority VIP")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Toggle Priority VIP" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/assignment-rules/rule-1", expect.objectContaining({ method: "PUT" })));

    fireEvent.click(screen.getByRole("button", { name: "Delete Priority VIP" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete rule" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/assignment-rules/rule-1", expect.objectContaining({ method: "DELETE" })));
  });

  it("does not expose rule management without assignment permission", () => {
    const restricted = { ...auth, user: { ...auth.user!, memberships: [{ ...auth.user!.memberships[0]!, role: { ...auth.user!.memberships[0]!.role, permissions: ["inbox.read"] } }] } };
    render(<AuthContext.Provider value={restricted}><MemoryRouter><AssignmentRules /></MemoryRouter></AuthContext.Provider>);
    expect(screen.getByText("Assignment rule access is restricted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create rule" })).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
