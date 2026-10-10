import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { AutomationSettings } from "@/pages/AutomationSettings";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const settings = { timezone: "Asia/Kolkata", sendWindowStart: "09:00", sendWindowEnd: "18:00", sendDays: [1, 2, 3, 4, 5], retryLimit: 3 };
const auth: AuthContextValue = {
  status: "authenticated", accessToken: "token",
  user: { id: "user-1", email: "owner@example.com", firstName: "Workspace", lastName: "Owner", emailVerifiedAt: "2026-01-01T00:00:00Z", memberships: [{ id: "member-1", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-01-01T00:00:00Z" }, role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["automations.read", "automations.manage"] } }] },
  login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

function renderPage(value = auth) { return render(<AuthContext.Provider value={value}><MemoryRouter><AutomationSettings /></MemoryRouter></AuthContext.Provider>); }

describe("AutomationSettings", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiRequest).mockResolvedValue(settings as never); });
  afterEach(() => vi.restoreAllMocks());

  it("loads workspace settings and saves the selected hours, timezone, days and retry limit", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Automation Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace timezone")).toHaveValue("Asia/Kolkata");
    fireEvent.change(screen.getByLabelText("Workspace timezone"), { target: { value: "Europe/London" } });
    fireEvent.change(screen.getByLabelText("Additional sequence retry attempts"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Sun" }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/automation-settings", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ ...settings, timezone: "Europe/London", sendDays: [0, 1, 2, 3, 4, 5], retryLimit: 5 }) })));
  });

  it("keeps settings read-only for members without manage permission", async () => {
    const readOnly = { ...auth, user: auth.user && { ...auth.user, memberships: [{ ...auth.user.memberships[0], role: { ...auth.user.memberships[0].role, permissions: ["automations.read"] } }] } };
    renderPage(readOnly);
    expect(await screen.findByLabelText("Workspace timezone")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save settings" })).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
