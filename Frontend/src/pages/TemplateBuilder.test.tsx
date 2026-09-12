import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateBuilder } from "@/pages/TemplateBuilder";
import { toast } from "react-toastify";
import { apiRequest } from "@/lib/api";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "test-token",
    user: { memberships: [{ workspace: { id: "workspace-1" } }] },
  }),
}));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: vi.fn().mockResolvedValue({}),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <TemplateBuilder />
    </MemoryRouter>,
  );
}

describe("TemplateBuilder", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps the editor bounded and validates required fields", () => {
    renderPage();

    expect(screen.getByTestId("template-page")).toHaveClass(
      "h-full",
      "overflow-hidden",
    );
    expect(screen.getByTestId("template-editor-scroll-region")).toHaveClass(
      "min-h-0",
      "lg:overflow-y-auto",
    );
    expect(screen.getByTestId("template-preview-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to draft" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-enhancement")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Catalog/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("template-type-grid")).toHaveClass(
      "sm:grid-cols-3",
    );
    expect(screen.queryByText("Start with a format that fits your message.")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose the template category and language.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Standard/ }));
    expect(screen.getByRole("radio", { name: "None" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Text" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Image" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Video" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Doc" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Image" }));
    expect(screen.getByLabelText("Upload image")).toHaveAttribute(
      "accept",
      "image/*",
    );
    fireEvent.click(screen.getByRole("button", { name: /Carousel/ }));
    expect(screen.getByText("Carousel cards")).toBeInTheDocument();
    expect(screen.getByText("Edit card content")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload image for card 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add another card" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Footer")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Card content"), {
      target: { value: "New product card" },
    });
    expect(screen.getByTestId("template-preview-carousel")).toHaveTextContent(
      "New product card",
    );
    fireEvent.click(screen.getByRole("button", { name: /Limited time offers/ }));
    expect(screen.getByText("Promotional time frame")).toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText(
        "Highlight your brand here, use images or videos, to stand out",
      ),
      { target: { value: "Weekend sale" } },
    );
    fireEvent.change(screen.getByLabelText("Offer text"), {
      target: { value: "Buy 3 get 1" },
    });
    fireEvent.change(screen.getByLabelText(/Offer expiry/), {
      target: { value: "2026-08-30T18:00" },
    });
    expect(screen.getByTestId("template-live-preview")).toHaveTextContent(
      "Weekend sale",
    );
    expect(screen.getByTestId("template-live-preview")).toHaveTextContent(
      "Buy 3 get 1",
    );
    expect(screen.getByTestId("template-live-preview")).toHaveTextContent(
      "Expires 2026-08-30 18:00",
    );
    expect(screen.getByLabelText("Offer text")).toBeInTheDocument();
    expect(screen.getByLabelText(/Offer expiry/)).toBeInTheDocument();
    expect(screen.getByLabelText("Enter coupon code to copy")).toBeInTheDocument();
    expect(screen.getByLabelText("Static")).toHaveValue("");
    expect(screen.getByText("Let users know how and what they will be able to redeem below")).toBeInTheDocument();
    expect(screen.getByTestId("template-phone-preview")).toHaveClass(
      "max-w-[240px]",
    );
    expect(screen.getByTestId("template-preview-message")).toHaveClass(
      "mr-auto",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    expect(screen.getByText("Template name is required.")).toBeInTheDocument();
    expect(screen.getByLabelText("Template Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Language")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("Template Name"), {
      target: { value: "Summer offer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    expect(screen.getByText("Select a template language.")).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toHaveClass("border-[var(--danger)]");
    expect(screen.getByLabelText("Language")).toHaveAttribute("aria-invalid", "true");
  });

  it("updates the live preview, adds variables, and manages buttons", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Template Name"), {
      target: { value: "Summer offer" },
    });
    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "English" },
    });
    fireEvent.change(screen.getByPlaceholderText("Template Message..."), {
      target: { value: "Hi {{name}}, your offer is ready." },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Highlight your brand here, use images or videos, to stand out",
      ),
      {
      target: { value: "A special offer for you" },
      },
    );

    const preview = screen.getByTestId("template-live-preview");
    expect(preview).toHaveTextContent("A special offer for you");
    expect(preview).toHaveTextContent("Hi {{name}}, your offer is ready.");
    expect(preview).not.toHaveTextContent("Powered by wati.io");

    fireEvent.click(screen.getByRole("button", { name: "Add Variable" }));
    expect(screen.getByPlaceholderText("Template Message...")).toHaveValue(
      "Hi {{name}}, your offer is ready. {{1}}",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Add button" })[0]);
    expect(screen.getByText("1/7")).toBeInTheDocument();
    expect(preview).toHaveTextContent("Visit Website");
    fireEvent.click(screen.getByRole("button", { name: /Added/ }));
    expect(preview).not.toHaveTextContent("Visit Website");

    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument());
    expect(screen.queryByText("Template details are ready to submit.")).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Template submitted for review.");
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/templates",
      expect.objectContaining({ body: expect.stringContaining('"saveAs":"submit"') }),
    );
  });

  it("does not send unsupported editor formats to Meta", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Template Name"), { target: { value: "Media template" } });
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "en_US" } });
    fireEvent.change(screen.getByPlaceholderText("Template Message..."), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("radio", { name: "Image" }));
    vi.mocked(apiRequest).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Save template" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Media headers require a Meta media handle");
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
