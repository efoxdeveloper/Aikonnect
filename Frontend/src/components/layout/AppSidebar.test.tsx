import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarVersion } from "./AppSidebar";

describe("SidebarVersion", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
  });

  it("shows the build identifier in the sidebar footer", () => {
    render(<SidebarProvider><SidebarVersion /></SidebarProvider>);

    const version = screen.getByTestId("app-version");
    expect(version).toHaveTextContent(/^Version \d+\.\d+\.\d+$/);
    expect(version).toHaveAttribute("title", expect.stringMatching(/^Application version \d+\.\d+\.\d+ · build /));
  });

  it("does not render the workspace switcher", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(document.querySelector("[data-sidebar-workspace]")).not.toBeInTheDocument();
  });

  it("keeps the navigation separated from the brand header", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(screen.getByTestId("sidebar-navigation")).toHaveStyle({ paddingTop: "16px" });
  });

  it("does not render a separate sidebar brand area", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

    expect(screen.queryByTestId("sidebar-brand-header")).not.toBeInTheDocument();
  });
});
