import { apiRequest } from "@/lib/api";
import type { AutomationSettings } from "@/types/sequence";

export function automationSettingsService(workspaceId: string, accessToken: string) {
  const path = `/workspaces/${workspaceId}/automation-settings`;
  const headers = { authorization: `Bearer ${accessToken}` };
  return {
    get: () => apiRequest<AutomationSettings>(path, { headers }),
    update: (settings: AutomationSettings) => apiRequest<AutomationSettings>(path, { method: "PATCH", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(settings) }),
  };
}
