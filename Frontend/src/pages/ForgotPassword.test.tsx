import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

describe("ForgotPassword", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({ message: "Recovery link prepared" });
  });

  it("requests a recovery link and keeps the flow inside the shared auth shell", async () => {
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);

    expect(screen.getByTestId("auth-shell")).toBeInTheDocument();
    const email = screen.getByLabelText("Work email");
    expect(email).toBeRequired();
    fireEvent.change(email, { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send recovery link" }));

    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(screen.getByText(/owner@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to login" })).toHaveAttribute("href", "/login");
    expect(apiRequest).toHaveBeenCalledWith("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "owner@example.com" }),
    });
  });

  it("shows the API error and stays on the form when delivery fails", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Network unavailable"));
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send recovery link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to send the recovery link");
    expect(screen.getByRole("heading", { name: "Forgot your password?" })).toBeInTheDocument();
  });
});
