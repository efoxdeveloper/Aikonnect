import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ForgotPassword } from "@/pages/ForgotPassword";

describe("ForgotPassword", () => {
  it("keeps the recovery flow inside the shared auth shell", () => {
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);

    expect(screen.getByTestId("auth-shell")).toBeInTheDocument();
    const email = screen.getByLabelText("Work email");
    expect(email).toBeRequired();
    fireEvent.change(email, { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send recovery link" }));

    expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(screen.getByText(/owner@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to login" })).toHaveAttribute("href", "/login");
  });
});
