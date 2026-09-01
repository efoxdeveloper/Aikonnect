import { apiRequest } from "@/lib/api";
import type { AutomationStatus } from "@/types/automation";
import type { Workflow, WorkflowPage, WorkflowPayload } from "@/types/workflow";

export function workflowService(workspaceId: string, accessToken: string) {
  const headers = { authorization: `Bearer ${accessToken}` };
  return {
    list: (params?: { search?: string; status?: AutomationStatus; page?: number }) => {
      const query = new URLSearchParams({ page: String(params?.page ?? 1), pageSize: "25" });
      if (params?.search) query.set("search", params.search);
      if (params?.status) query.set("status", params.status);
      return apiRequest<WorkflowPage>(`/workspaces/${workspaceId}/workflows?${query}`, { headers });
    },
    get: (id: string) => apiRequest<Workflow>(`/workspaces/${workspaceId}/workflows/${id}`, { headers }),
    create: (payload: WorkflowPayload) => apiRequest<Workflow>(`/workspaces/${workspaceId}/workflows`, { method: "POST", headers, body: JSON.stringify(payload) }),
    update: (id: string, payload: WorkflowPayload) => apiRequest<Workflow>(`/workspaces/${workspaceId}/workflows/${id}`, { method: "PUT", headers, body: JSON.stringify(payload) }),
    remove: (id: string) => apiRequest<void>(`/workspaces/${workspaceId}/workflows/${id}`, { method: "DELETE", headers }),
    setStatus: (id: string, status: "ACTIVE" | "PAUSED") => apiRequest<Workflow>(`/workspaces/${workspaceId}/workflows/${id}/${status === "ACTIVE" ? "activate" : "pause"}`, { method: "POST", headers }),
  };
}
