import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button interaction contract", () => {
  it("provides tactile press feedback without changing its layout", () => {
    render(<Button>Save changes</Button>);
    const button = screen.getByRole("button", { name: "Save changes" });

    expect(button).toHaveClass("h-10", "rounded-md", "active:scale-[.98]");
    fireEvent.pointerDown(button, { button: 0 });
    expect(button).toHaveAttribute("data-pressed", "true");
    fireEvent.pointerUp(button, { button: 0 });
    expect(button).not.toHaveAttribute("data-pressed");
  });

  it("exposes a visible keyboard focus contract and does not press when disabled", () => {
    render(<Button disabled>Save changes</Button>);
    const button = screen.getByRole("button", { name: "Save changes" });

    expect(button).toHaveClass("focus-visible:ring-2", "focus-visible:ring-offset-2");
    fireEvent.pointerDown(button, { button: 0 });
    expect(button).not.toHaveAttribute("data-pressed");
  });
});
