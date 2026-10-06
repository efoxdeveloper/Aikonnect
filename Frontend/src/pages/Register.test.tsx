import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { Register } from "@/pages/Register";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: vi.fn(),
}));

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
  beforeEach(() => vi.mocked(apiRequest).mockReset().mockResolvedValue({ available: true }));

  it("keeps the registration icon and intro copy in one row", () => {
    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter>
          <Register />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const header = screen.getByAltText("Marento").parentElement;
    expect(header).toHaveClass("flex", "items-center", "justify-center");
    expect(header).toContainElement(screen.getByRole("heading", { name: "Create your account" }));
    expect(header).toContainElement(screen.getByText("Tell us who you are to get started."));
    expect(screen.queryByText("Your details", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Company", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: "View plans" })).not.toBeInTheDocument();
  });

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

  it("checks the email while typing and shows when it already exists", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ available: false });
    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter>
          <Register />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "existing@example.com" } });

    await waitFor(() => expect(screen.getByText("Email already exists")).toBeInTheDocument());
    expect(apiRequest).toHaveBeenCalledWith("/auth/email-availability?email=existing%40example.com");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("uses the shared international phone input on the company step", async () => {
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
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/auth/email-availability?email=test%40example.com"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const phone = screen.getByLabelText("Phone number");
    expect(phone).toHaveAttribute("id", "phone");
    expect(phone).toHaveAttribute("type", "tel");
    expect(phone).toBeRequired();
    expect(screen.getByText("+91")).toBeInTheDocument();
    const whatsapp = screen.getByRole("button", { name: "WhatsApp" });
    const instagram = screen.getByRole("button", { name: "Instagram" });
    const both = screen.getByRole("button", { name: "WhatsApp + Instagram" });
    expect(whatsapp).toBeEnabled();
    expect(instagram).toBeDisabled();
    expect(both).toBeDisabled();
    expect(whatsapp).toHaveAttribute("aria-pressed", "true");
    expect(instagram).toHaveAttribute("aria-pressed", "false");
    expect(both).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "Country" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Terms of Service" }).some((link) => link.getAttribute("href") === "#terms")).toBe(true);
    expect(screen.getAllByRole("link", { name: "Privacy Policy" }).some((link) => link.getAttribute("href") === "#privacy")).toBe(true);
  });
});
