import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DashboardLayout } from "@/layouts/DashboardLayout";

vi.mock("@/components/layout/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/layout/TrialExpiredStrip", () => ({ TrialExpiredStrip: () => null }));
vi.mock("@/components/layout/WorkspaceNotificationStrip", () => ({ WorkspaceNotificationStrip: () => null }));

describe("DashboardLayout", () => {
  it("presents routed content in the rounded white surface below the compact header", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<div>Dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("dashboard-page-viewport")).toHaveClass("rounded-2xl", "bg-[var(--page-background)]");
    expect(screen.getByRole("main")).toHaveClass("bg-[var(--sidebar-rail-background)]", "pt-[var(--header-height)]");
    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
  });

  it("keeps the main surface square when the route has a secondary sidebar", () => {
    render(
      <MemoryRouter initialEntries={["/campaigns"]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/campaigns" element={<div>Campaign content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("main")).toHaveClass("bg-transparent", "pr-2", "pb-2");
    expect(screen.getByTestId("dashboard-page-viewport")).toHaveClass("rounded-none", "relative", "z-10");
    expect(screen.getByText("Campaign content")).toBeInTheDocument();
  });
});
