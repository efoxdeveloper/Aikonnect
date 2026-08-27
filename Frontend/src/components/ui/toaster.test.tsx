import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TOAST_DURATION_MS, Toaster } from "@/components/ui/toaster";

vi.mock("react-toastify", () => ({
  ToastContainer: ({ autoClose, className, hideProgressBar }: { autoClose: number; className: string; hideProgressBar: boolean }) => (
    <div className={className} data-testid="toast-container" data-auto-close={autoClose} data-hide-progress={hideProgressBar} />
  ),
}));

describe("Toaster", () => {
  it("shows the built-in countdown progress bar and dismisses automatically", () => {
    render(<Toaster />);
    const container = screen.getByTestId("toast-container");
    expect(container).toHaveAttribute("data-auto-close", String(TOAST_DURATION_MS));
    expect(container).toHaveAttribute("data-hide-progress", "false");
    expect(container).toHaveClass("interakt-toast-container");
  });
});
