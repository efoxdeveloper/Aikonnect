import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { Register } from "@/pages/Register";

const authValue: AuthContextValue = {
  status: "unauthenticated",
  user: null,
  accessToken: null,
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  changeEmail: vi.fn(),
  refreshUser: vi.fn(),
  logout: vi.fn(),
};

describe("registration password visibility", () => {
  it("toggles password and confirmation visibility independently", () => {
    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter>
          <Register />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("auth-shell")).toBeInTheDocument();
    const password = screen.getByLabelText("Password");
    const confirmation = screen.getByLabelText("Confirm password");
    expect(password).toHaveAttribute("type", "password");
    expect(confirmation).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(confirmation).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show confirm password" }));
    expect(confirmation).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide confirm password" })).toBeInTheDocument();
  });
});
