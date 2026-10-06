import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { TrialExpiredStrip } from "@/components/layout/TrialExpiredStrip";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const auth: AuthContextValue = {
  status: "authenticated",
  user: {
    id: "user-1", email: "owner@example.com", firstName: "Workspace", lastName: "Owner", emailVerifiedAt: "2026-08-22T00:00:00.000Z",
    memberships: [{ id: "member-1", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: null }, role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["workspace.read"] } }],
  },
  accessToken: "access-token", login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

function renderStrip(initialEntry = "/dashboard") {
  return render(<AuthContext.Provider value={auth}><MemoryRouter initialEntries={[initialEntry]}><TrialExpiredStrip /></MemoryRouter></AuthContext.Provider>);
}

describe("TrialExpiredStrip", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("keeps the read-only warning visible with a pricing link after trial expiry", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ status: "EXPIRED", planName: "Growth", trialEndsAt: "2026-09-01T00:00:00.000Z" });
    renderStrip();

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Trial ended");
    expect(notice).toHaveClass("rounded-full", "border-[#c8b400]", "bg-gradient-to-b", "font-bold", "text-black");
    const plansLink = screen.getByRole("link", { name: "View plans" });
    expect(plansLink).toHaveAttribute("href", "/billing/plans");
    expect(plansLink).toHaveClass("ml-auto", "border-l", "font-bold", "text-black");
    expect(plansLink).not.toHaveClass("rounded-full", "bg-[#f2dc00]");
    expect(screen.queryByTestId("trial-expired-reserved-space")).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/plan-status", { headers: { authorization: "Bearer access-token" } });
  });

  it("does not show the read-only warning for an active trial", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ status: "TRIALING", planName: "Growth", trialEndsAt: "2026-11-01T00:00:00.000Z" });
    renderStrip();

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trial-expired-navbar-notice")).not.toBeInTheDocument();
  });

  it("does not show the trial notice on account entry pages", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ status: "EXPIRED", planName: "Growth", trialEndsAt: "2026-09-01T00:00:00.000Z" });
    renderStrip("/login");

    await waitFor(() => expect(apiRequest).not.toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View plans" })).not.toBeInTheDocument();
  });
});
