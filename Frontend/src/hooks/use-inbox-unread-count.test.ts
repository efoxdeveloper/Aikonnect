import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api";
import {
  INBOX_UNREAD_COUNT_CHANGED_EVENT,
  useInboxUnreadCount,
} from "./use-inbox-unread-count";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

describe("useInboxUnreadCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiRequest).mockResolvedValue({ unreadCount: 4 });
  });

  it("loads the total unread messages for the active workspace", async () => {
    const { result } = renderHook(() => useInboxUnreadCount({
      workspaceId: "workspace-1",
      accessToken: "access-token",
    }));

    await waitFor(() => expect(result.current.unreadCount).toBe(4));
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/conversations/unread-count",
      { headers: { authorization: "Bearer access-token" } },
    );
  });

  it("refreshes immediately when Inbox broadcasts an unread change", async () => {
    const { result } = renderHook(() => useInboxUnreadCount({
      workspaceId: "workspace-1",
      accessToken: "access-token",
    }));
    await waitFor(() => expect(result.current.unreadCount).toBe(4));
    vi.mocked(apiRequest).mockResolvedValueOnce({ unreadCount: 2 });

    act(() => window.dispatchEvent(new Event(INBOX_UNREAD_COUNT_CHANGED_EVENT)));

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it("resets the count when Inbox access is unavailable", async () => {
    const { result, rerender } = renderHook(
      (enabled: boolean) => useInboxUnreadCount({ workspaceId: "workspace-1", accessToken: "access-token", enabled }),
      { initialProps: true },
    );
    await waitFor(() => expect(result.current.unreadCount).toBe(4));

    rerender(false);

    expect(result.current.unreadCount).toBe(0);
  });

  it("keeps the last known count when a background request fails", async () => {
    const { result } = renderHook(() => useInboxUnreadCount({
      workspaceId: "workspace-1",
      accessToken: "access-token",
    }));
    await waitFor(() => expect(result.current.unreadCount).toBe(4));
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("network"));

    act(() => window.dispatchEvent(new Event(INBOX_UNREAD_COUNT_CHANGED_EVENT)));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(result.current.unreadCount).toBe(4);
  });
});
