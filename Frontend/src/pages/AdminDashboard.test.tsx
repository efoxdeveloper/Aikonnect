import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { AdminDashboard } from "@/pages/AdminDashboard";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn(), ApiError: class ApiError extends Error {} }));

const auth: AuthContextValue = {
  status: "authenticated",
  user: {
    id: "platform-user",
    email: "admin@example.com",
    firstName: "Platform",
    lastName: "Admin",
    emailVerifiedAt: "2026-09-18T00:00:00.000Z",
    platformRole: "ADMIN",
    memberships: [],
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

describe("admin dashboard", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset().mockResolvedValue({
      users: { active: 4, suspended: 1 },
      workspaces: 3,
      connectedWhatsAppAccounts: 2,
      activeSessions: 5,
    });
  });

  it("loads aggregate platform metrics for an authenticated platform admin", async () => {
    render(<AuthContext.Provider value={auth}><MemoryRouter><AdminDashboard /></MemoryRouter></AuthContext.Provider>);

    expect(await screen.findByRole("heading", { name: "Admin overview" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Connected WhatsApp accounts")).toBeInTheDocument());
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("Platform administration")).not.toBeInTheDocument();
    expect(screen.queryByText("Read-only platform health and account totals.")).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/admin/overview", { headers: { authorization: "Bearer access-token" } });
  });
});
