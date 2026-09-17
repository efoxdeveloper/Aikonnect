import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WhatsAppConnectionGuide } from "./WhatsAppConnectionGuide";

describe("WhatsApp connection guide", () => {
  it("shows a loading state and prevents duplicate launches", () => {
    const onNext = vi.fn();
    render(
      <WhatsAppConnectionGuide
        choice="new-number"
        onChoiceChange={vi.fn()}
        onClose={vi.fn()}
        onNext={onNext}
        loading
      />,
    );

    const proceed = screen.getByRole("button", { name: "Proceed with New Number" });
    expect(proceed).toHaveTextContent("Opening Meta");
    expect(proceed).toBeDisabled();
    expect(proceed).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Proceed with WA Business App Number" })).toBeDisabled();
    fireEvent.click(proceed);
    expect(onNext).not.toHaveBeenCalled();
  });
});
