import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { Login } from "@/pages/Login";

function authValue(login = vi.fn().mockResolvedValue(undefined)): AuthContextValue {
  return {
    status: "unauthenticated",
    user: null,
    accessToken: null,
    login,
    register: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    changeEmail: vi.fn(),
    refreshUser: vi.fn(),
    logout: vi.fn(),
  };
}

describe("Login", () => {
  it("keeps the existing credential flow inside the redesigned auth shell", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthContext.Provider value={authValue(login)}>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<h1>Dashboard</h1>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("auth-shell")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login with Google" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("owner@example.com", "Password123"));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("keeps password visibility keyboard-accessible", () => {
    render(<AuthContext.Provider value={authValue()}><MemoryRouter><Login /></MemoryRouter></AuthContext.Provider>);
    const password = screen.getByLabelText("Password");

    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });

  it("explains when Google needs an existing password account to be linked", () => {
    render(
      <AuthContext.Provider value={authValue()}>
        <MemoryRouter initialEntries={["/login?google_error=GOOGLE_ACCOUNT_LINK_REQUIRED"]}>
          <Login />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Log in with your password instead");
  });

  it("keeps the sign-in button emerald while submitting", () => {
    const login = vi.fn(() => new Promise<void>(() => undefined));
    render(<AuthContext.Provider value={authValue(login)}><MemoryRouter><Login /></MemoryRouter></AuthContext.Provider>);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    const submitButton = screen.getByRole("button", { name: "Signing in…" });
    expect(submitButton).toHaveAttribute("aria-busy", "true");
    expect(submitButton).toHaveAttribute("data-loading", "true");
  });
});
