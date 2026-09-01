import { apiRequest } from "@/lib/api";
import type { Automation, AutomationAction, AutomationCondition, AutomationLogPage, AutomationPage, AutomationStatus, AutomationTrigger } from "@/types/automation";

export type AutomationPayload = { name: string; description: string | null; trigger: AutomationTrigger; conditions: AutomationCondition[]; actions: AutomationAction[] };
export function automationService(workspaceId: string, accessToken: string) {
  const headers = { authorization: `Bearer ${accessToken}` };
  return {
    list: (params?: { search?: string; status?: AutomationStatus; trigger?: string; page?: number }) => {
      const query = new URLSearchParams({ page: String(params?.page ?? 1), pageSize: "25" });
      if (params?.search) query.set("search", params.search);
      if (params?.status) query.set("status", params.status);
      if (params?.trigger) query.set("trigger", params.trigger);
      return apiRequest<AutomationPage>(`/workspaces/${workspaceId}/automations?${query}`, { headers });
    },
    get: (id: string) => apiRequest<Automation>(`/workspaces/${workspaceId}/automations/${id}`, { headers }),
    create: (payload: AutomationPayload) => apiRequest<Automation>(`/workspaces/${workspaceId}/automations`, { method: "POST", headers, body: JSON.stringify(payload) }),
    update: (id: string, payload: AutomationPayload) => apiRequest<Automation>(`/workspaces/${workspaceId}/automations/${id}`, { method: "PUT", headers, body: JSON.stringify(payload) }),
    remove: (id: string) => apiRequest<void>(`/workspaces/${workspaceId}/automations/${id}`, { method: "DELETE", headers }),
    setStatus: (id: string, status: "ACTIVE" | "PAUSED") => apiRequest<Automation>(`/workspaces/${workspaceId}/automations/${id}/${status === "ACTIVE" ? "activate" : "pause"}`, { method: "POST", headers }),
    logs: (id: string) => apiRequest<AutomationLogPage>(`/workspaces/${workspaceId}/automations/${id}/logs?page=1&pageSize=50`, { headers }),
  };
}
