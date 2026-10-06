import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HeaderSearch } from "@/components/layout/HeaderSearch";

function CurrentLocation() {
  return <output data-testid="current-location">{useLocation().pathname}</output>;
}

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="*" element={<><HeaderSearch /><CurrentLocation /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HeaderSearch", () => {
  it("filters navigation pages from the navbar input", () => {
    renderSearch();

    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.change(input, { target: { value: "billing" } });

    expect(input).toHaveValue("billing");
    expect(screen.getByRole("option", { name: /Usage & wallet/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Campaigns/ })).not.toBeInTheDocument();
  });

  it("keeps the results open when the search input is clicked", () => {
    renderSearch();

    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.focus(input);
    fireEvent.click(input);

    expect(screen.getByText("Navigate to")).toBeInTheDocument();
  });

  it("navigates to the first matching page when Enter is pressed", () => {
    renderSearch();

    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.change(input, { target: { value: "contacts" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("current-location")).toHaveTextContent("/contacts");
    expect(input).toHaveValue("");
  });

  it("shows an empty state when no page matches", () => {
    renderSearch();

    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "does-not-exist" } });

    expect(screen.getByText("No pages found.")).toBeInTheDocument();
  });
});
