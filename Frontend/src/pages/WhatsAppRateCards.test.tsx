import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api";
import { WhatsAppRateCards } from "@/pages/WhatsAppRateCards";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn(), ApiError: class ApiError extends Error {} }));

const row = { id: "rate-1", countryCode: "IN", countryName: "India", currency: "INR", category: "UTILITY", pricingType: "REGULAR", metaRate: "0.115000", platformFee: "0.035000", customerRate: "0.150000", volumeTierFrom: null, volumeTierTo: null, effectiveFrom: "2026-07-01", effectiveTo: null, status: "ACTIVE", source: "MANUAL", notes: null } as const;
const list = (status = "ACTIVE") => ({ items: [{ ...row, status }], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } });

describe("WhatsApp rate cards", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset().mockResolvedValue(list()));

  it("loads exact-price rows and can deactivate a rate without deleting history", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(list()).mockResolvedValueOnce({}).mockResolvedValueOnce(list("INACTIVE"));
    render(<MemoryRouter><WhatsAppRateCards /></MemoryRouter>);
    expect(await screen.findByText("0.150000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/admin/whatsapp-rate-cards/rate-1/status", expect.objectContaining({ method: "PATCH" })));
    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });
});
