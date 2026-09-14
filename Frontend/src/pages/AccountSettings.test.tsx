import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { AccountSettings } from "@/pages/AccountSettings";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const auth: AuthContextValue = {
  status: "authenticated",
  user: {
    id: "user-1",
    email: "agent@example.com",
    firstName: "Asha",
    lastName: "Agent",
    emailVerifiedAt: "2026-08-22T00:00:00.000Z",
    memberships: [],
  },
  accessToken: "access-token",
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  changeEmail: vi.fn(),
  refreshUser: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
};

function renderPage() {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <AccountSettings />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("AccountSettings", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("uses the authenticated page frame and themed settings cards", () => {
    renderPage();

    expect(screen.getByTestId("account-settings-page")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByTestId("account-settings-scroll-region")).toHaveClass("overflow-y-auto");
    expect(screen.getByRole("heading", { name: "Account settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Personal information" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Email address" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Password" })).toBeInTheDocument();
  });

  it("updates the email through the authenticated API flow", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ email: "new@example.com", emailSent: true });
    renderPage();

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Current password", { selector: "#email-password" }), { target: { value: "current-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update email" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/auth/email", expect.objectContaining({
      method: "PATCH",
      headers: { authorization: "Bearer access-token" },
      body: JSON.stringify({ email: "new@example.com", password: "current-password" }),
    })));
    expect(auth.refreshUser).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(/verification link was sent/i);
  });

  it("blocks a password change when confirmation does not match", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Current password", { selector: "#current-password" }), { target: { value: "current-password" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
