import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { MemoryRouter } from "react-router-dom";
import { useEffect } from "react";
import { useSidebar } from "@/hooks/use-sidebar";

vi.mock("./AppSidebar", () => ({ AppSidebar: () => <aside data-testid="mock-sidebar" /> }));
vi.mock("./AppHeader", () => ({ AppHeader: () => <header data-testid="mock-header" /> }));
vi.mock("./RequestProgress", () => ({ RequestProgress: () => null }));

function ExpandRailForTest() {
  const { setRailExpanded } = useSidebar();
  useEffect(() => setRailExpanded(true), [setRailExpanded]);
  return null;
}

describe("AppShell", () => {
  it("reserves only the collapsed rail while keeping the content wrapper fluid", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><AppShell><div data-testid="page-content" /></AppShell></MemoryRouter>);

    const content = screen.getByTestId("app-shell-content");
    expect(content).toHaveClass("md:ml-[var(--shell-left-offset)]");
    expect(content.style.getPropertyValue("--shell-left-offset")).toBe("var(--sidebar-collapsed-width)");
    expect(content).not.toHaveClass("w-full");
    expect(content).toContainElement(screen.getByTestId("page-content"));
  });

  it("reserves space for the active module submenu", () => {
    render(<MemoryRouter initialEntries={["/campaigns"]}><AppShell><div data-testid="page-content" /></AppShell></MemoryRouter>);

    expect(screen.getByTestId("app-shell-content").style.getPropertyValue("--shell-left-offset")).toBe("calc(var(--sidebar-collapsed-width) + var(--sidebar-width))");
  });

  it("reserves space for the expanded rail and active module submenu", async () => {
    render(<MemoryRouter initialEntries={["/campaigns"]}><AppShell><ExpandRailForTest /><div data-testid="page-content" /></AppShell></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId("app-shell-content").style.getPropertyValue("--shell-left-offset")).toBe("calc(var(--sidebar-expanded-width) + var(--sidebar-width))"));
  });
});
