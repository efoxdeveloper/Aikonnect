import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

export const INBOX_UNREAD_COUNT_CHANGED_EVENT = "interakt:inbox-unread-count-changed";

type InboxUnreadCountOptions = {
  workspaceId?: string;
  accessToken?: string | null;
  enabled?: boolean;
};

type InboxUnreadCountResponse = { unreadCount: number };

export function notifyInboxUnreadCountChanged(): void {
  window.dispatchEvent(new Event(INBOX_UNREAD_COUNT_CHANGED_EVENT));
}

export function useInboxUnreadCount({ workspaceId, accessToken, enabled = true }: InboxUnreadCountOptions) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !workspaceId || !accessToken) return;
    setLoading(true);
    try {
      const result = await apiRequest<InboxUnreadCountResponse>(
        "/workspaces/" + workspaceId + "/conversations/unread-count",
        { headers: { authorization: "Bearer " + accessToken } },
      );
      setUnreadCount(Math.max(0, result.unreadCount));
    } catch {
      // Keep the last known count when a background refresh fails.
    } finally {
      setLoading(false);
    }
  }, [accessToken, enabled, workspaceId]);

  useEffect(() => {
    if (!enabled || !workspaceId || !accessToken) {
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    const handleInboxChange = () => void refresh();
    window.addEventListener(INBOX_UNREAD_COUNT_CHANGED_EVENT, handleInboxChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(INBOX_UNREAD_COUNT_CHANGED_EVENT, handleInboxChange);
    };
  }, [accessToken, enabled, refresh, workspaceId]);

  return { unreadCount, loading, refresh };
}
