import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { WhatsAppStatusData } from "@/types/workspace";

export function useWhatsAppStatus(workspaceId: string | undefined, accessToken: string | null, refreshKey?: string | null) {
  const [data, setData] = useState<WhatsAppStatusData | null>(null);
  const [loading, setLoading] = useState(Boolean(workspaceId && accessToken));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId || !accessToken) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<WhatsAppStatusData>(`/workspaces/${workspaceId}/whatsapp/status`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      setData(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load Meta account status.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId]);

  const refresh = useCallback(async () => {
    if (!workspaceId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<WhatsAppStatusData>(`/workspaces/${workspaceId}/whatsapp/status/refresh`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      setData(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to refresh Meta account status.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  return { data, loading, error, refresh };
}
