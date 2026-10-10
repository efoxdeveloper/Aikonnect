export type SequenceStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export type SequenceVariable = { source: "contact" | "custom" | "constant"; field: string; fallback: string };
export type SequenceStep = { id: string; delayMinutes: number; templateKey: string; templateName?: string; templateVariables: SequenceVariable[] };
export type Sequence = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: SequenceStatus;
  steps: SequenceStep[];
  enrolledCount: number;
  completedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  enrollments?: Array<{ id: string; status: string; currentStep: number; nextRunAt: string; attemptCount: number; lastError: string | null; startedAt: string; completedAt: string | null; contact: { id: string; name: string } }>;
};
export type SequencePayload = Pick<Sequence, "name" | "description" | "steps">;
export type SequencePage = { items: Sequence[]; pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean } };
export type SequenceEligibleContact = { id: string; name: string };

export type AutomationSettings = {
  timezone: string;
  sendWindowStart: string;
  sendWindowEnd: string;
  sendDays: number[];
  retryLimit: number;
};
