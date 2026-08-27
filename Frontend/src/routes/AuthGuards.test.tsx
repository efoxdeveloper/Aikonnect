import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue, type AuthStatus } from "@/contexts/AuthContext";
import { getSafeRedirectPath, ProtectedRoute, PublicOnlyRoute } from "@/routes/AuthGuards";

function authValue(status: AuthStatus, verified = true): AuthContextValue {
  return {
    status,
    user: status === "authenticated"
      ? { id: "user-1", email: "user@example.com", firstName: "Test", lastName: "User", emailVerifiedAt: verified ? "2026-08-22T00:00:00.000Z" : null, memberships: [] }
      : null,
    accessToken: status === "authenticated" ? "access-token" : null,
    login: vi.fn(),
    register: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    changeEmail: vi.fn(),
    refreshUser: vi.fn(),
    logout: vi.fn(),
  };
}

function renderProtected(status: AuthStatus, verified = true) {
  render(
    <AuthContext.Provider value={authValue(status, verified)}>
      <MemoryRouter initialEntries={["/dashboard?tab=activity"]}>
        <Routes>
          <Route path="/login" element={<h1>Sign in</h1>} />
          <Route path="/verify-email" element={<h1>Verify email</h1>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<h1>Dashboard</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ProtectedRoute", () => {
  it("waits for the initial session check before rendering protected content", () => {
    renderProtected("loading");
    const loader = screen.getByRole("status", { name: "Checking your session" });
    expect(loader).toHaveClass("h-12", "w-24", "text-[var(--brand)]");
    expect(loader.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
    expect(loader.closest("main")).toHaveClass("h-dvh", "bg-white");
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("smoothly fades the session wave over the protected app before removing it", () => {
    vi.useFakeTimers();
    try {
      const routeTree = (status: AuthStatus) => (
        <AuthContext.Provider value={authValue(status)}>
          <MemoryRouter initialEntries={["/dashboard"]}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<h1>Dashboard</h1>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      );
      const view = render(routeTree("loading"));
      const loader = screen.getByRole("status", { name: "Checking your session" });

      view.rerender(routeTree("authenticated"));

      expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
      const exitingLoader = screen.getByRole("status", { name: "Checking your session" });
      expect(exitingLoader.closest("main")).toHaveClass("opacity-0", "duration-300");
      expect(exitingLoader).toHaveClass("scale-90", "opacity-0", "blur-[1px]");
      act(() => vi.advanceTimersByTime(280));
      expect(screen.queryByRole("status", { name: "Checking your session" })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("redirects unauthenticated visitors to sign in", () => {
    renderProtected("unauthenticated");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("renders protected routes for an authenticated session", () => {
    renderProtected("authenticated");
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("redirects authenticated but unverified users to email verification", () => {
    renderProtected("authenticated", false);
    expect(screen.getByRole("heading", { name: "Verify email" })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });
});

describe("PublicOnlyRoute", () => {
  it("redirects authenticated visitors away from the login page", () => {
    render(
      <AuthContext.Provider value={authValue("authenticated")}>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<h1>Sign in</h1>} />
            </Route>
            <Route path="/dashboard" element={<h1>Dashboard</h1>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});

describe("getSafeRedirectPath", () => {
  it("restores the protected destination after login", () => {
    expect(getSafeRedirectPath({ from: { pathname: "/reports", search: "?period=month" } })).toBe(
      "/reports?period=month",
    );
  });

  it("falls back to the dashboard for invalid redirect state", () => {
    expect(getSafeRedirectPath({ from: { pathname: "https://malicious.example" } })).toBe("/dashboard");
    expect(getSafeRedirectPath({ from: { pathname: "//malicious.example" } })).toBe("/dashboard");
  });
});
