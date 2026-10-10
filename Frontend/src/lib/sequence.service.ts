import { apiRequest } from "@/lib/api";
import type { Sequence, SequenceEligibleContact, SequencePage, SequencePayload, SequenceStatus } from "@/types/sequence";

export function sequenceService(workspaceId: string, accessToken: string) {
  const headers = { authorization: `Bearer ${accessToken}` };
  const root = `/workspaces/${workspaceId}/sequences`;
  return {
    list: (params?: { search?: string; status?: SequenceStatus }) => {
      const query = new URLSearchParams({ page: "1", pageSize: "100" });
      if (params?.search) query.set("search", params.search);
      if (params?.status) query.set("status", params.status);
      return apiRequest<SequencePage>(`${root}?${query}`, { headers });
    },
    get: (id: string) => apiRequest<Sequence>(`${root}/${id}`, { headers }),
    create: (payload: SequencePayload) => apiRequest<Sequence>(root, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(payload) }),
    update: (id: string, payload: SequencePayload) => apiRequest<Sequence>(`${root}/${id}`, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(payload) }),
    remove: (id: string) => apiRequest<void>(`${root}/${id}`, { method: "DELETE", headers }),
    setStatus: (id: string, status: "ACTIVE" | "PAUSED") => apiRequest<Sequence>(`${root}/${id}/${status === "ACTIVE" ? "activate" : "pause"}`, { method: "POST", headers }),
    enroll: (id: string, contactIds: string[]) => apiRequest<{ enrolled: number; skipped: number }>(`${root}/${id}/enrollments`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ contactIds }) }),
    eligibleContacts: (search = "") => apiRequest<{ items: SequenceEligibleContact[] }>(`${root}/eligible-contacts?search=${encodeURIComponent(search)}`, { headers }),
  };
}
