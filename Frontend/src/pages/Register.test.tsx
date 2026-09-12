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
    expect(screen.getByRole("button", { name: "Sign up with Google" })).toBeInTheDocument();
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

  it("uses the shared international phone input on the company step", () => {
    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter>
          <Register />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "User" } });
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const phone = screen.getByLabelText("Phone number");
    expect(phone).toHaveAttribute("id", "phone");
    expect(phone).toHaveAttribute("type", "tel");
    expect(phone).toBeRequired();
    expect(screen.getByText("+91")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Industry" })).toBeInTheDocument();
  });
});
