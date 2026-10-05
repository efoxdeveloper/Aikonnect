import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { navigationGroups } from "@/config/navigation";
import { SidebarSection } from "./SidebarSection";

function ExpandedState({ children }: { children: ReactNode }) {
  const { setSidebarHovered } = useSidebar();
  useEffect(() => setSidebarHovered(true), [setSidebarHovered]);
  return children;
}

describe("SidebarSection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
  });

  it("opens the active section automatically", () => {
    render(<MemoryRouter initialEntries={["/campaigns"]}><SidebarProvider><ExpandedState><SidebarSection group={navigationGroups[1]} /></ExpandedState></SidebarProvider></MemoryRouter>);

    expect(screen.getByRole("link", { name: "Campaigns" })).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /Marketing/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveStyle({ borderBottom: "1px solid rgba(255,255,255,.1)" });
    expect(trigger.querySelector("svg")).toBeInTheDocument();
  });

  it("renders the primary Dashboard and Inbox items without a parent heading", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><ExpandedState><SidebarSection group={navigationGroups[0]} /></ExpandedState></SidebarProvider></MemoryRouter>);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Main/ })).not.toBeInTheDocument();
  });

  it("allows an inactive section to reveal its submenu", async () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><ExpandedState><SidebarSection group={navigationGroups[1]} /></ExpandedState></SidebarProvider></MemoryRouter>);

    const trigger = screen.getByRole("button", { name: /Marketing/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(screen.queryByRole("link", { name: "Campaigns" })).not.toBeInTheDocument());
    fireEvent.click(trigger);
    expect(screen.getByRole("link", { name: "Campaigns" })).toBeInTheDocument();
  });

  it("supports one-open-at-a-time accordion behavior", () => {
    function Accordion() {
      const [open, setOpen] = useState("Marketing");
      return <>
        <SidebarSection group={navigationGroups[1]} open={open === "Marketing"} onToggle={() => setOpen(open === "Marketing" ? "" : "Marketing")} />
        <SidebarSection group={navigationGroups[2]} open={open === "Sales & CRM"} onToggle={() => setOpen(open === "Sales & CRM" ? "" : "Sales & CRM")} />
      </>;
    }

    render(<MemoryRouter initialEntries={["/dashboard"]}><SidebarProvider><ExpandedState><Accordion /></ExpandedState></SidebarProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Sales & CRM/ }));
    expect(screen.getByRole("button", { name: /Marketing/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Sales & CRM/ })).toHaveAttribute("aria-expanded", "true");
  });
});
