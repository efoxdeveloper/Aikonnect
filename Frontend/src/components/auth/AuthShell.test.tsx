import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthShell } from "@/components/auth/AuthShell";
import { authTextFieldSx } from "@/components/auth/auth-text-field";

describe("AuthShell", () => {
  it("keeps the auth page viewport-bound and scrolls only the form region", () => {
    render(<AuthShell><h1>Account access</h1></AuthShell>);

    expect(screen.getByTestId("auth-shell")).toHaveClass("h-dvh", "overflow-hidden");
    expect(screen.getByTestId("auth-shell")).toHaveClass("bg-zinc-100");
    expect(screen.getByTestId("auth-form-scroll-region")).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
  });

  it("uses the generated product artwork only in the responsive visual panel", () => {
    const { container } = render(<AuthShell><h1>Account access</h1></AuthShell>);

    const preview = screen.getByRole("complementary", { name: "Interakt product preview" });
    expect(preview).toHaveClass("hidden", "lg:order-1", "lg:flex");
    expect(preview).toHaveClass("lg:rounded-xl");
    expect(screen.getByRole("region", { name: "Account access" })).toHaveClass("lg:order-2");
    expect(screen.getByRole("region", { name: "Account access" })).toHaveClass("lg:rounded-xl");
    expect(container.querySelector("[data-testid=auth-shell] > div")).toHaveClass("lg:gap-1.5", "lg:p-1.5");
    expect(preview.querySelector("img")).toHaveAttribute("src", "/images/auth-side-visual-1.png");
    expect(container.querySelector('img[src="/images/auth-side-visual-1.png"]')).toHaveAttribute("alt", "");
    expect(screen.getByRole("button", { name: "Show product preview 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /Show product preview/ })).toHaveLength(3);
    expect(screen.getByText("Customer operations, simplified")).toBeInTheDocument();
    expect(screen.getByRole("blockquote")).toHaveTextContent("Keep every customer conversation moving with one clear, shared inbox.");
    expect(screen.getByTestId("auth-shell").querySelector(".auth-copy")).toHaveAttribute("aria-live", "polite");
  });

  it("keeps auth fields vertically centered with the shared rounded field treatment", () => {
    const inputStyles = authTextFieldSx as Record<string, Record<string, unknown>>;
    const outlinedInput = inputStyles["& .MuiOutlinedInput-root"];
    const input = inputStyles["& .MuiInputBase-input"];

    expect(outlinedInput.borderRadius).toBe("8px");
    expect(input.lineHeight).toBe("20px");
    expect(input.boxSizing).toBe("border-box");
  });
});
