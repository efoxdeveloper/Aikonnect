import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { VerifyEmail } from "@/pages/VerifyEmail";

function renderPage(value: AuthContextValue, route = "/verify-email") {
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[route]}>
        <VerifyEmail />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function context(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    user: {
      id: "user-1",
      email: "owner@example.com",
      firstName: "Workspace",
      lastName: "Owner",
      emailVerifiedAt: null,
      memberships: [],
    },
    accessToken: "access-token",
    login: vi.fn(),
    register: vi.fn(),
    verifyEmail: vi.fn().mockResolvedValue(undefined),
    resendVerification: vi.fn().mockResolvedValue({ emailSent: true }),
    changeEmail: vi.fn().mockResolvedValue({ email: "corrected@example.com", emailSent: true }),
    refreshUser: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

describe("VerifyEmail", () => {
  it("consumes a verification token and shows the success state", async () => {
    const verifyEmail = vi.fn().mockResolvedValue(undefined);
    renderPage(context({ verifyEmail }), "/verify-email?token=secure-verification-token");

    await waitFor(() => expect(verifyEmail).toHaveBeenCalledWith("secure-verification-token"));
    expect(await screen.findByRole("heading", { name: "Email verified" })).toBeInTheDocument();
  });

  it("shows the signed-in user's email and resend control while waiting", () => {
    renderPage(context());
    expect(screen.getByTestId("auth-shell")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend verification email/i })).toBeInTheDocument();
  });

  it("changes an incorrect email after confirming the account password", async () => {
    const changeEmail = vi.fn().mockResolvedValue({
      email: "corrected@example.com",
      emailSent: true,
    });
    renderPage(context({ changeEmail }));

    fireEvent.click(screen.getByRole("button", { name: /entered the wrong email/i }));
    fireEvent.change(screen.getByLabelText("New email address"), {
      target: { value: "corrected@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "Password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update email and resend" }));

    await waitFor(() =>
      expect(changeEmail).toHaveBeenCalledWith("corrected@example.com", "Password123"),
    );
    expect(await screen.findByText(/verification link has been sent to corrected@example.com/i)).toBeInTheDocument();
  });
});
