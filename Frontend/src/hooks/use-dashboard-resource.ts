import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

// Key the rendered result as well as the request, so a workspace switch or a
// permission change cannot briefly show the previous workspace's figures.
export function useDashboardResource<T>(path: string | null, token: string | null) {
  const key = path && token ? `${token}:${path}` : null;
  const [result, setResult] = useState<{ key: string; data: T | null; error: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!key || !path || !token) return;
    let active = true;
    void apiRequest<T>(path, { headers: { authorization: `Bearer ${token}` } })
      .then((data) => { if (active) setResult({ key, data, error: false }); })
      .catch(() => { if (active) setResult({ key, data: null, error: true }); });
    return () => { active = false; };
  }, [key, path, token, revision]);
  const current = key && result?.key === key ? result : null;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { data: current?.data ?? null, loading: Boolean(key && !current), error: current?.error ?? false, restricted: !key, refresh };
}
