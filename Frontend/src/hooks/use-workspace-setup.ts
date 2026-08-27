import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { WorkspaceSetupData } from "@/types/workspace";

export function useWorkspaceSetup(workspaceId: string | undefined, accessToken: string | null, refreshKey?: string | null) {
  const [data, setData] = useState<WorkspaceSetupData | null>(null);
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
      const result = await apiRequest<WorkspaceSetupData>(`/workspaces/${workspaceId}/setup`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      setData(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load workspace setup.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  return { data, loading, error, refresh: load };
}
