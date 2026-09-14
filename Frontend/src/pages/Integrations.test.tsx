import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Integrations } from "@/pages/Integrations";

describe("Integrations", () => {
  it("renders the connected tools and branded coming-soon platforms", () => {
    render(<MemoryRouter><Integrations /></MemoryRouter>);

    expect(screen.getByTestId("integrations-page")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByTestId("integrations-scroll-region")).toHaveClass("overflow-y-auto");
    expect(screen.getByRole("heading", { name: "Integrations" })).toBeInTheDocument();
    expect(screen.getByText("WhatsApp Business")).toBeInTheDocument();
    expect(screen.getByText("API & Webhooks")).toBeInTheDocument();
    expect(screen.getByText("Shopify")).toBeInTheDocument();
    expect(screen.getByText("WooCommerce")).toBeInTheDocument();
    expect(screen.getAllByText("Coming soon")).toHaveLength(18);
  });
});
