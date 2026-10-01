import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationStrip } from "./NotificationStrip";

describe("NotificationStrip", () => {
  it("renders a critical strip with its actions and dismiss control", () => {
    const onDismiss = vi.fn();
    render(
      <NotificationStrip
        tone="danger"
        title="Subscription Expired"
        message="Your subscription plan has expired."
        actions={<button type="button">Renew Plan</button>}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Subscription Expired");
    expect(screen.getByRole("button", { name: "Renew Plan" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("supports reusable warning content without actions", () => {
    render(<NotificationStrip tone="warning" title="Low Balance" message="Please add funds to continue." />);

    expect(screen.getByRole("status")).toHaveTextContent("Low Balance");
    expect(screen.getByRole("status")).toHaveTextContent("Please add funds to continue.");
  });
});
