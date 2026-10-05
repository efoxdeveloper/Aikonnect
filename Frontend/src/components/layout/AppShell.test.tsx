import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("./AppSidebar", () => ({ AppSidebar: () => <aside data-testid="mock-sidebar" /> }));
vi.mock("./AppHeader", () => ({ AppHeader: () => <header data-testid="mock-header" /> }));
vi.mock("./RequestProgress", () => ({ RequestProgress: () => null }));

describe("AppShell", () => {
  it("reserves only the collapsed rail while keeping the content wrapper fluid", () => {
    render(<AppShell><div data-testid="page-content" /></AppShell>);

    const content = screen.getByTestId("app-shell-content");
    expect(content).toHaveClass("md:ml-[var(--sidebar-collapsed-width)]");
    expect(content).not.toHaveClass("w-full");
    expect(content).toContainElement(screen.getByTestId("page-content"));
  });
});
