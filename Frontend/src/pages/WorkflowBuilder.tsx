import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Clock3,
  Pencil,
  Save,
  Send,
  Share2,
} from "lucide-react";
import { toast } from "react-toastify";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AutomationShell } from "@/components/automation/AutomationShell";
import {
  WorkflowFlowCanvas,
  type WorkflowCanvasNodeKind,
} from "@/components/automation/WorkflowFlowCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { getActionDefinition } from "@/config/automation-actions";
import { getTriggerDefinition } from "@/config/automation-triggers";
import { ApiError, apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { workflowService } from "@/lib/workflow.service";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationStatus,
  AutomationTriggerType,
} from "@/types/automation";
import type {
  Workflow,
  WorkflowActionStep,
  WorkflowConditionStep,
  WorkflowDecisionStep,
  WorkflowEdge,
  WorkflowNodePosition,
  WorkflowQuestion,
  WorkflowStep,
} from "@/types/workflow";

type Option = { id: string; label: string };
type FormState = {
  name: string;
  trigger: AutomationTriggerType | null;
  conditions: AutomationCondition[];
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  status: AutomationStatus;
};
const initialForm: FormState = {
  name: "",
  trigger: null,
  conditions: [],
  steps: [],
  edges: [],
  status: "DRAFT",
};

function stepConfig(type: AutomationAction["type"]): Record<string, unknown> {
  if (type === "WAIT") return { amount: 1, unit: "hours" };
  if (type === "SEND_MESSAGE" || type === "ADD_INTERNAL_NOTE")
    return { message: "" };
  return {};
}
function isDecision(step: WorkflowStep): step is WorkflowDecisionStep {
  return step.type === "ASK_QUESTION" || step.type === "SET_CONDITION";
}
function isQuestion(step: WorkflowStep): step is WorkflowQuestion {
  return step.type === "ASK_QUESTION";
}
function isAction(step: WorkflowStep): step is WorkflowActionStep {
  return !isDecision(step);
}
function optionKey(label: string, index: number) {
  const value = label.trim().toLowerCase();
  return value === "yes" ? "YES" : value === "no" ? "NO" : `OPTION_${index}`;
}
function decisionBranches(decision: WorkflowDecisionStep) {
  return decision.type === "ASK_QUESTION"
    ? decision.config.mode === "TEXT"
      ? ["NEXT"]
      : decision.config.options.map((label, index) => optionKey(label, index))
    : ["TRUE", "FALSE"];
}
function nodeOutputs(step: WorkflowStep) {
  return isDecision(step) ? decisionBranches(step) : ["NEXT"];
}
function buildLegacyEdges(steps: WorkflowStep[]): WorkflowEdge[] {
  const decision = steps.find(isDecision);
  const actions = steps.filter(isAction);
  const edges: WorkflowEdge[] = [];
  if (decision) {
    edges.push({
      id: `edge-trigger-${decision.id}`,
      source: "trigger",
      target: decision.id,
      condition: "NEXT",
    });
    for (const branch of decisionBranches(decision)) {
      const branchSteps = actions
        .filter(
          (step) =>
            step.branch === branch ||
            (branch === "YES" && step.branch === "OPTION_0") ||
            (branch === "NO" && step.branch === "OPTION_1"),
        )
        .sort((left, right) => left.order - right.order);
      branchSteps.forEach((step, index) =>
        edges.push({
          id: `edge-${branch.toLowerCase()}-${step.id}`,
          source: index ? branchSteps[index - 1].id : decision.id,
          target: step.id,
          condition: index ? "NEXT" : branch,
        }),
      );
    }
    return edges;
  }
  actions
    .sort((left, right) => left.order - right.order)
    .forEach((step, index, list) =>
      edges.push({
        id: `edge-main-${step.id}`,
        source: index ? list[index - 1].id : "trigger",
        target: step.id,
        condition: "NEXT",
      }),
    );
  return edges;
}
function normalizeSteps(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.map((step) =>
    isDecision(step) ? step : { ...step, branch: step.branch ?? "MAIN" },
  );
}
function fromWorkflow(value: Workflow): FormState {
  const steps = normalizeSteps(value.steps ?? []);
  return {
    name: value.name,
    trigger: value.trigger?.type ?? null,
    conditions: value.conditions ?? [],
    steps,
    edges: value.edges?.length ? value.edges : buildLegacyEdges(steps),
    status: value.status,
  };
}
function friendlyError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function WorkflowBuilder() {
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { workflowId } = useParams<{ workflowId: string }>();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canManage =
    membership?.role.permissions.includes("automations.manage") ?? false;
  const [form, setForm] = useState<FormState>(initialForm);
  const [templates, setTemplates] = useState<Option[]>([]);
  const [tags, setTags] = useState<Option[]>([]);
  const [members, setMembers] = useState<Option[]>([]);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(workflowId));
  const [saving, setSaving] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const definition = useMemo(
    () => getTriggerDefinition(form.trigger ?? undefined),
    [form.trigger],
  );

  useEffect(() => {
    if (workflowId) return;
    const duplicate = (location.state as { duplicate?: Workflow } | null)
      ?.duplicate;
    if (duplicate) setForm(fromWorkflow({ ...duplicate, status: "DRAFT" }));
  }, [location.state, workflowId]);

  useEffect(() => {
    if (!workspaceId || !accessToken) return;
    let active = true;
    const headers = { authorization: `Bearer ${accessToken}` };
    void Promise.all([
      apiRequest<Array<{ id: string; name: string }>>(
        `/workspaces/${workspaceId}/contacts/tags`,
        { headers },
      ),
      apiRequest<
        Array<{
          id: string;
          user: { firstName: string; lastName: string };
          status: string;
        }>
      >(`/workspaces/${workspaceId}/members`, { headers }),
      apiRequest<Array<{ id: string; label: string }>>(
        `/workspaces/${workspaceId}/contacts/custom-fields`,
        { headers },
      ).catch(() => []),
      apiRequest<{
        items: Array<{ id: string; name: string; key: string; status: string }>;
      }>(
        `/workspaces/${workspaceId}/templates?status=active&page=1&pageSize=100`,
        { headers },
      ).catch(() => ({ items: [] })),
    ])
      .then(([tagRows, memberRows, fieldRows, templateRows]) => {
        if (!active) return;
        setTags(tagRows.map((item) => ({ id: item.id, label: item.name })));
        setMembers(
          memberRows
            .filter((item) => item.status === "ACTIVE")
            .map((item) => ({
              id: item.id,
              label: `${item.user.firstName} ${item.user.lastName}`.trim(),
            })),
        );
        setCustomFields(fieldRows.map((item) => item.label));
        setTemplates(
          templateRows.items
            .filter((item) => item.status === "APPROVED")
            .map((item) => ({ id: item.id, label: item.name || item.key })),
        );
      })
      .catch(() => undefined);
    if (workflowId)
      void workflowService(workspaceId, accessToken)
        .get(workflowId)
        .then((item) => {
          if (active) setForm(fromWorkflow(item));
        })
        .catch((caught) => {
          if (active)
            toast.error(friendlyError(caught, "Workflow could not be loaded."));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [accessToken, location.state, workflowId, workspaceId]);

  const payload = () => ({
    name: form.name.trim(),
    description: null,
    trigger: { type: form.trigger as AutomationTriggerType, config: {} },
    conditions: form.conditions,
    steps: form.steps.map((step, index) => ({ ...step, order: index + 1 })),
    edges: form.edges,
  });
  const validate = () => {
    if (!form.name.trim()) return "Workflow name is required.";
    if (!form.trigger) return "Select an entry trigger before saving.";
    if (!form.steps.length) return "Add at least one chatbot node.";
    for (const step of form.steps) {
      if (isQuestion(step)) {
        if (!step.config.question.trim())
          return "Configure every workflow question.";
        if (
          step.config.mode !== "TEXT" &&
          step.config.options.filter((option) => option.trim()).length < 2
        )
          return "Button and list questions need at least two answer options.";
        continue;
      }
      if (step.type === "SET_CONDITION") {
        if (!step.config.field.trim())
          return "Configure every condition field.";
        continue;
      }
      const config = step.config;
      if (
        (step.type === "SEND_MESSAGE" || step.type === "ADD_INTERNAL_NOTE") &&
        !String(config.message ?? "").trim()
      )
        return `Configure the ${getActionDefinition(step.type)?.label ?? step.type} step.`;
      if (step.type === "SEND_TEMPLATE" && !config.templateId)
        return "Select a template for the Send WhatsApp Template step.";
      if (
        (step.type === "ADD_TAG" || step.type === "REMOVE_TAG") &&
        !config.tagId
      )
        return "Select a tag for this step.";
      if (step.type === "ASSIGN_AGENT" && !config.memberId)
        return "Select an agent for this step.";
      if (step.type === "ASSIGN_TEAM" && !String(config.teamName ?? "").trim())
        return "Enter a team for this step.";
      if (
        step.type === "WAIT" &&
        (!Number(config.amount) || Number(config.amount) < 1)
      )
        return "Wait time must be at least one.";
    }
    const root = form.edges.find((edge) => edge.source === "trigger");
    if (!root) return "Connect the starting step to a chatbot node.";
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return false;
      if (visited.has(id)) return true;
      visiting.add(id);
      for (const edge of form.edges.filter((item) => item.source === id)) {
        if (!visit(edge.target)) return false;
      }
      visiting.delete(id);
      visited.add(id);
      return true;
    };
    if (!visit(root.target))
      return "Workflow connections cannot contain a cycle.";
    if (visited.size !== form.steps.length)
      return "Connect every chatbot node to the starting flow.";
    return null;
  };
  const save = async (publish: boolean) => {
    if (!workspaceId || !accessToken || !canManage) return;
    const validation = publish
      ? validate()
      : !form.name.trim()
        ? "Workflow name is required."
        : !form.trigger
          ? "Select an entry trigger before saving."
          : null;
    if (validation) {
      toast.error(validation);
      return;
    }
    setSaving(true);
    try {
      const service = workflowService(workspaceId, accessToken);
      const saved = workflowId
        ? await service.update(workflowId, payload())
        : await service.create(payload());
      if (publish) await service.setStatus(saved.id, "ACTIVE");
      toast.success(publish ? "Workflow published." : "Workflow draft saved.");
      navigate("/workflows", { replace: true });
    } catch (caught) {
      toast.error(friendlyError(caught, "Workflow could not be saved."));
    } finally {
      setSaving(false);
    }
  };
  const addNode = (
    kind: WorkflowCanvasNodeKind,
    position: WorkflowNodePosition,
    autoConnect: boolean,
  ) =>
    setForm((current) => {
      const suffix = `${Date.now()}_${current.steps.length}`;
      const source = !autoConnect
        ? undefined
        : !current.edges.some((edge) => edge.source === "trigger")
          ? { id: "trigger", condition: "NEXT" }
          : [...current.steps]
              .sort((left, right) => right.order - left.order)
              .flatMap((step) =>
                nodeOutputs(step).map((condition) => ({
                  id: step.id,
                  condition,
                })),
              )
              .find(
                (candidate) =>
                  !current.edges.some(
                    (edge) =>
                      edge.source === candidate.id &&
                      edge.condition === candidate.condition,
                  ),
              );
      const branch = source?.condition ?? "MAIN";
      const order = current.steps.length + 1;
      const node: WorkflowStep =
        kind === "QUESTION"
          ? {
              id: `question_${suffix}`,
              type: "ASK_QUESTION",
              order,
              branch,
              position,
              config: {
                mode: "BUTTONS",
                question: "",
                options: ["Yes", "No"],
                variable: `answer_${order}`,
              },
            }
          : kind === "CONDITION"
            ? {
                id: `condition_${suffix}`,
                type: "SET_CONDITION",
                order,
                branch,
                position,
                config: {
                  field: "",
                  operator: "equals",
                  value: "",
                  trueLabel: "True",
                  falseLabel: "False",
                },
              }
            : {
                id: `step_${suffix}`,
                type: kind,
                branch,
                order,
                position,
                config: stepConfig(kind),
              };
      const edge = source
        ? {
            id: `edge_${source.id}_${source.condition}_${node.id}`,
            source: source.id,
            target: node.id,
            condition: source.condition,
          }
        : null;
      return {
        ...current,
        steps: [...current.steps, node],
        edges: edge ? [...current.edges, edge] : current.edges,
      };
    });
  const updateDecision = (next: WorkflowDecisionStep) =>
    setForm((current) => {
      const allowed = new Set(decisionBranches(next));
      return {
        ...current,
        steps: current.steps.map((step) => (step.id === next.id ? next : step)),
        edges: current.edges.filter(
          (edge) => edge.source !== next.id || allowed.has(edge.condition),
        ),
      };
    });
  const updateStep = (next: AutomationAction) =>
    setForm((current) => ({
      ...current,
      steps: current.steps.map((item) =>
        item.id === next.id && isAction(item)
          ? {
              ...next,
              branch: item.branch ?? "MAIN",
              position: item.position,
            }
          : item,
      ),
    }));
  const connectEdge = (next: WorkflowEdge) =>
    setForm((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === next.target && isAction(step)
          ? { ...step, branch: next.condition }
          : step,
      ),
      edges: [
        ...current.edges.filter(
          (edge) =>
            edge.target !== next.target &&
            !(edge.source === next.source && edge.condition === next.condition),
        ),
        next,
      ],
    }));
  const removeEdges = (ids: string[]) =>
    setForm((current) => ({
      ...current,
      edges: current.edges.filter((edge) => !ids.includes(edge.id)),
    }));
  const moveNode = (id: string, position: WorkflowNodePosition) =>
    setForm((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === id ? { ...step, position } : step,
      ),
    }));
  const moveStep = (id: string, direction: -1 | 1) =>
    setForm((current) => {
      const steps = [...current.steps].sort(
        (left, right) => left.order - right.order,
      );
      const index = steps.findIndex((step) => step.id === id);
      const swap = index + direction;
      if (index < 0 || swap < 0 || swap >= steps.length) return current;
      [steps[index], steps[swap]] = [steps[swap]!, steps[index]!];
      return {
        ...current,
        steps: steps.map((step, stepIndex) => ({
          ...step,
          order: stepIndex + 1,
        })),
      };
    });
  const duplicateStep = (id: string) =>
    setForm((current) => {
      const source = current.steps.find((step) => step.id === id);
      if (!source || !isAction(source)) return current;
      const copy = {
        ...source,
        id: `step_${Date.now()}_copy`,
        config: { ...source.config },
        order: current.steps.length + 1,
        position: {
          x: (source.position?.x ?? 420) + 40,
          y: (source.position?.y ?? 220) + 40,
        },
      };
      return { ...current, steps: [...current.steps, copy] };
    });
  const removeStep = (id: string) =>
    setForm((current) => ({
      ...current,
      steps: current.steps.filter((step) => step.id !== id),
      edges: current.edges.filter(
        (edge) => edge.source !== id && edge.target !== id,
      ),
    }));

  if (!canManage)
    return (
      <AutomationShell>
        <div className="flex h-full items-center justify-center p-6">
          <section className="max-w-md rounded-md border border-[var(--border)] bg-white p-8 text-center">
            <h1 className="text-lg font-semibold">
              Workflow access is restricted
            </h1>
            <div className="mt-2 text-sm text-[var(--text-secondary)]">
              You do not have permission to manage workflows in this workspace.
            </div>
          </section>
        </div>
      </AutomationShell>
    );
  if (loading)
    return (
      <AutomationShell>
        <div className="p-8 text-sm text-[var(--text-secondary)]">
          Loading workflow...
        </div>
      </AutomationShell>
    );
  return (
    <AutomationShell>
      <div
        data-testid="workflow-builder"
        className="flex h-full min-h-0 flex-col overflow-hidden"
      >
        <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] bg-white px-4 py-2 sm:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              aria-label="Back to workflows"
              onClick={() => navigate("/workflows")}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
            >
              <ArrowLeft size={17} />
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <label htmlFor="workflow-name" className="sr-only">
                Workflow Name
              </label>
              <Input
                id="workflow-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Workflow name"
                maxLength={160}
                className="h-9 min-w-0 max-w-[300px] border-0 bg-white px-1 text-sm font-medium shadow-none focus:border-0 focus:bg-white focus:ring-0"
              />
              <Pencil size={14} className="shrink-0 text-[var(--text-muted)]" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
            <button
              type="button"
              aria-pressed={showPerformance}
              onClick={() => setShowPerformance((value) => !value)}
              className="flex h-9 items-center gap-2 rounded-md px-2.5 text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]"
            >
              <span
                className={`relative h-4 w-7 rounded-full transition ${showPerformance ? "bg-[var(--brand)]" : "bg-[#aeb5b7]"}`}
              >
                <span
                  className={`absolute top-0.5 size-3 rounded-full bg-white transition ${showPerformance ? "left-3.5" : "left-0.5"}`}
                />
              </span>
              Show performance
            </button>
            <span className="mx-1 hidden h-5 border-l border-[var(--border)] sm:block" />
            <span className="hidden text-[var(--text-secondary)] md:inline">
              Free chatbot testing
            </span>
            <span className="rounded-full bg-[#edf8dd] px-2 py-1 text-[11px] font-medium text-[#719c39]">
              New
            </span>
            <button
              type="button"
              aria-label="Schedule workflow"
              className="hidden size-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] sm:flex"
            >
              <Clock3 size={15} />
            </button>
            <button
              type="button"
              aria-label="More workflow options"
              className="hidden size-9 items-center justify-center rounded-md border border-l-0 border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] sm:flex"
            >
              <ChevronDown size={15} />
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void save(false)}
              disabled={saving}
              className="h-9 text-xs"
            >
              <Save size={14} /> Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void save(true)}
              disabled={saving}
              className="h-9 text-xs"
            >
              <Send size={14} /> Publish
            </Button>
            <button
              type="button"
              aria-label="Share workflow"
              className="hidden size-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] lg:flex"
            >
              <Share2 size={15} />
            </button>
          </div>
        </header>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <WorkflowFlowCanvas
            trigger={form.trigger}
            conditions={form.conditions}
            steps={form.steps}
            edges={form.edges}
            definition={definition}
            templates={templates}
            tags={tags}
            members={members}
            customFields={customFields}
            onTriggerChange={(trigger) =>
              setForm((current) => ({ ...current, trigger, conditions: [] }))
            }
            onConditionsChange={(conditions) =>
              setForm((current) => ({ ...current, conditions }))
            }
            onNodeAdd={addNode}
            onDecisionChange={updateDecision}
            onStepChange={updateStep}
            onEdgeConnect={connectEdge}
            onEdgesRemove={removeEdges}
            onNodeMove={moveNode}
            onStepMove={moveStep}
            onStepDuplicate={duplicateStep}
            onStepRemove={removeStep}
          />
        </div>
      </div>
    </AutomationShell>
  );
}
