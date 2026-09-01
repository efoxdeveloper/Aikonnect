import type {
  AutomationAction,
  AutomationCondition,
  AutomationOperator,
  AutomationStatus,
  AutomationTrigger,
  AutomationTriggerType,
} from "@/types/automation";

export type WorkflowBranch = string;
export type WorkflowNodePosition = { x: number; y: number };
export type WorkflowQuestion = {
  id: string;
  type: "ASK_QUESTION";
  order: number;
  branch: WorkflowBranch;
  position?: WorkflowNodePosition;
  config: {
    mode: "BUTTONS" | "LIST" | "TEXT";
    question: string;
    options: string[];
    variable: string;
  };
};
export type WorkflowConditionStep = {
  id: string;
  type: "SET_CONDITION";
  order: number;
  branch: WorkflowBranch;
  position?: WorkflowNodePosition;
  config: {
    field: string;
    operator: AutomationOperator;
    value?: unknown;
    trueLabel: string;
    falseLabel: string;
  };
};
export type WorkflowDecisionStep = WorkflowQuestion | WorkflowConditionStep;
export type WorkflowActionStep = AutomationAction & {
  branch: WorkflowBranch;
  position?: WorkflowNodePosition;
};
export type WorkflowStep = WorkflowDecisionStep | WorkflowActionStep;
export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  condition: string;
};

export type Workflow = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  runCount: number;
  enrolledCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; firstName: string; lastName: string } | null;
};

export type WorkflowPage = {
  items: Workflow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
};
export type WorkflowPayload = {
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
};
export type WorkflowTriggerType = AutomationTriggerType;
