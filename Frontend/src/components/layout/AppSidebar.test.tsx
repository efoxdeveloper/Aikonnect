import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
});
