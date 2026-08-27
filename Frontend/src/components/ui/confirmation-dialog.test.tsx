import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

describe("ConfirmationDialog", () => {
  it("runs the confirmed action and closes after it succeeds", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<ConfirmationDialog open onOpenChange={onOpenChange} title="Delete item?" description="This item will be removed." confirmLabel="Delete" tone="danger" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("cancels without invoking the confirmed action", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<ConfirmationDialog open onOpenChange={onOpenChange} title="Delete item?" description="This item will be removed." onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open when the confirmed action fails", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Request failed"));
    const onOpenChange = vi.fn();
    render(<ConfirmationDialog open onOpenChange={onOpenChange} title="Delete item?" description="This item will be removed." confirmLabel="Delete" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("alertdialog", { name: "Delete item?" })).toBeInTheDocument();
  });
});
