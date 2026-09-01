import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestProgress } from "@/components/layout/RequestProgress";
import { beginRequest, endRequest } from "@/lib/request-events";

describe("RequestProgress", () => {
  afterEach(() => {
    endRequest();
    vi.useRealTimers();
  });

  it("shows only for requests that take longer than the interaction threshold", () => {
    vi.useFakeTimers();
    render(<RequestProgress />);
    const progress = screen.getByTestId("request-progress");

    act(() => beginRequest());
    expect(progress).toHaveClass("scale-x-0", "opacity-0");
    act(() => vi.advanceTimersByTime(160));
    expect(progress).toHaveClass("scale-x-100", "opacity-100");
    act(() => endRequest());
    expect(progress).toHaveClass("scale-x-0", "opacity-0");
  });
});
