import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { sequenceService } from "@/lib/sequence.service";
import { Sequences } from "@/pages/Sequences";

vi.mock("@/lib/sequence.service", () => ({ sequenceService: vi.fn() }));

const auth: AuthContextValue = {
  status: "authenticated", accessToken: "token",
  user: { id: "user-1", email: "owner@example.com", firstName: "Workspace", lastName: "Owner", emailVerifiedAt: "2026-01-01T00:00:00Z", memberships: [{ id: "member-1", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-01-01T00:00:00Z" }, role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["automations.read", "automations.manage", "campaigns.send"] } }] },
  login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

describe("Sequences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sequenceService).mockReturnValue({
      list: vi.fn().mockResolvedValue({ items: [{ id: "sequence-1", workspaceId: "workspace-1", name: "New lead follow-up", description: null, status: "ACTIVE", steps: [{ id: "step-1", delayMinutes: 0, templateKey: "welcome", templateVariables: [] }], enrolledCount: 12, completedCount: 8, failedCount: 1, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" }], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } }),
    } as never);
  });

  it("loads sequence status and enrollment counts for the workspace", async () => {
    render(<AuthContext.Provider value={auth}><MemoryRouter><Sequences /></MemoryRouter></AuthContext.Provider>);
    expect(await screen.findByText("New lead follow-up")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });
});
