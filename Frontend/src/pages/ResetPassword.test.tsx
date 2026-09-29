import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPassword } from "@/pages/ResetPassword";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

describe("ResetPassword", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({ message: "Password reset successfully" });
  });

  it("updates the password with the token from the recovery link", async () => {
    const token = "secure-reset-token-123456789012345678901234567890";
    const initialEntry = `/reset-password?token=${token}`;
    render(<MemoryRouter initialEntries={[initialEntry]}><ResetPassword /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "NewPassword123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "NewPassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("heading", { name: "Password updated" })).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword: "NewPassword123" }),
    });
  });

  it("validates mismatched passwords before calling the API", async () => {
    render(<MemoryRouter initialEntries={["/reset-password?token=secure-reset-token-123456789012345678901234567890"]}><ResetPassword /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "NewPassword123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "DifferentPassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing reset token", () => {
    render(<MemoryRouter initialEntries={["/reset-password"]}><ResetPassword /></MemoryRouter>);

    expect(screen.getByRole("alert")).toHaveTextContent("missing or invalid");
    expect(screen.getByRole("button", { name: "Update password" })).toBeDisabled();
  });
});
