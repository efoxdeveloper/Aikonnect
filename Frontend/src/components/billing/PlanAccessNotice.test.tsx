import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PlanAccessNotice } from "@/components/billing/PlanAccessNotice";

describe("PlanAccessNotice", () => {
  it("shows the server's blocked-action reason and a link to pricing", () => {
    render(<MemoryRouter><PlanAccessNotice /></MemoryRouter>);
    act(() => window.dispatchEvent(new CustomEvent("marento:plan-access-blocked", { detail: { code: "TRIAL_EXPIRED", message: "Your free trial has ended." } })));

    expect(screen.getByRole("alert")).toHaveTextContent("Your free trial has ended.");
    expect(screen.getByRole("link", { name: "View plans and pricing" })).toHaveAttribute("href", "/billing/plans");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss plan restriction notice" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
