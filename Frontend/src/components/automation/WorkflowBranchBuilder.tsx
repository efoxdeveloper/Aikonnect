import { useState } from "react";
import { GitBranch, Plus, Trash2, Zap } from "lucide-react";
import { ActionCard } from "@/components/automation/ActionCard";
import { ActionSelector } from "@/components/automation/ActionSelector";
import { TriggerSelector } from "@/components/automation/TriggerSelector";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerCloseButton,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { getActionDefinition } from "@/config/automation-actions";
import {
  getTriggerDefinition,
  type AutomationTriggerDefinition,
} from "@/config/automation-triggers";
import { ConditionsBuilder } from "@/components/automation/ConditionsBuilder";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationOperator,
  AutomationTriggerType,
} from "@/types/automation";
import type {
  WorkflowActionStep,
  WorkflowConditionStep,
  WorkflowDecisionStep,
  WorkflowQuestion,
  WorkflowStep,
} from "@/types/workflow";

type Option = { id: string; label: string };
type Editor = "trigger" | "conditions" | "decision" | null;
type BranchDefinition = { key: string; label: string };
type Props = {
  trigger: AutomationTriggerType | null;
  conditions: AutomationCondition[];
  steps: WorkflowStep[];
  definition?: AutomationTriggerDefinition;
  templates: Option[];
  tags: Option[];
  members: Option[];
  customFields: string[];
  onTriggerChange: (value: AutomationTriggerType) => void;
  onConditionsChange: (value: AutomationCondition[]) => void;
  onDecisionAdd: (type: "QUESTION" | "CONDITION") => void;
  onDecisionChange: (value: WorkflowDecisionStep) => void;
  onStepChange: (value: AutomationAction) => void;
  onStepAdd: (branch: string, type: AutomationAction["type"]) => void;
  onStepMove: (id: string, direction: -1 | 1) => void;
  onStepDuplicate: (id: string) => void;
  onStepRemove: (id: string) => void;
};
const operators: AutomationOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "is_empty",
  "is_not_empty",
  "greater_than",
  "less_than",
];
function Connector() {
  return (
    <div aria-hidden="true" className="flex h-7 items-center justify-center">
      <span className="h-full border-l-2 border-dotted border-[#c6cccf]" />
    </div>
  );
}
function optionKey(label: string, index: number) {
  const value = label.trim().toLowerCase();
  return value === "yes" ? "YES" : value === "no" ? "NO" : `OPTION_${index}`;
}
function decisionBranches(decision: WorkflowDecisionStep): BranchDefinition[] {
  return decision.type === "ASK_QUESTION"
    ? decision.config.options.map((label, index) => ({
        key: optionKey(label, index),
        label: label || `Option ${index + 1}`,
      }))
    : [
        { key: "TRUE", label: decision.config.trueLabel || "True" },
        { key: "FALSE", label: decision.config.falseLabel || "False" },
      ];
}
function branchActions(
  steps: WorkflowStep[],
  branch: string,
  decision: WorkflowDecisionStep,
) {
  const aliases =
    decision.type === "ASK_QUESTION" && branch === "YES"
      ? ["YES", "OPTION_0"]
      : decision.type === "ASK_QUESTION" && branch === "NO"
        ? ["NO", "OPTION_1"]
        : [branch];
  return steps.filter(
    (step): step is WorkflowActionStep =>
      step.type !== "ASK_QUESTION" &&
      step.type !== "SET_CONDITION" &&
      aliases.includes(step.branch),
  );
}

export function QuestionEditor({
  question,
  onChange,
}: {
  question: WorkflowQuestion;
  onChange: (value: WorkflowQuestion) => void;
}) {
  const update = (patch: Partial<WorkflowQuestion["config"]>) =>
    onChange({ ...question, config: { ...question.config, ...patch } });
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium">Question</label>
        <textarea
          aria-label="Workflow question"
          value={question.config.question}
          onChange={(event) => update({ question: event.target.value })}
          placeholder="What can we help you with?"
          className="min-h-24 w-full rounded-md border border-[var(--border)] p-3 text-sm outline-none focus:border-[var(--brand)]"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium">
          Response type
        </label>
        <select
          aria-label="Question response type"
          value={question.config.mode}
          onChange={(event) => {
            const mode = event.target
              .value as WorkflowQuestion["config"]["mode"];
            update({
              mode,
              options:
                mode !== "TEXT" && question.config.options.length < 2
                  ? ["Yes", "No"]
                  : question.config.options,
            });
          }}
          className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2.5 text-xs"
        >
          <option value="BUTTONS">Buttons (up to 3)</option>
          <option value="LIST">List (up to 10)</option>
          <option value="TEXT">Free text</option>
        </select>
      </div>
      {question.config.mode !== "TEXT" && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium">Answer options</label>
            <span className="text-[11px] text-[var(--text-muted)]">
              {question.config.mode === "LIST" ? "Up to 10" : "Up to 3"}
            </span>
          </div>
          <div className="space-y-2">
            {question.config.options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={`Answer option ${index + 1}`}
                  value={option}
                  maxLength={80}
                  onChange={(event) => {
                    const options = [...question.config.options];
                    options[index] = event.target.value;
                    update({ options });
                  }}
                  className="h-9 text-xs"
                />
                {question.config.options.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Remove answer option ${index + 1}`}
                    onClick={() =>
                      update({
                        options: question.config.options.filter(
                          (_, optionIndex) => optionIndex !== index,
                        ),
                      })
                    }
                    className="flex size-9 shrink-0 items-center justify-center rounded-md text-[var(--danger)] hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {question.config.options.length <
            (question.config.mode === "LIST" ? 10 : 3) && (
            <button
              type="button"
              onClick={() =>
                update({ options: [...question.config.options, ""] })
              }
              className="mt-2 text-xs font-medium text-[var(--brand)] hover:underline"
            >
              <Plus size={13} className="mr-1 inline" />
              Add option
            </button>
          )}
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-xs font-medium">
          Save response as
        </label>
        <Input
          aria-label="Workflow response variable"
          value={question.config.variable}
          onChange={(event) => update({ variable: event.target.value })}
          placeholder="customer_response"
          className="h-9 text-xs"
        />
      </div>
    </div>
  );
}
export function ConditionEditor({
  condition,
  onChange,
}: {
  condition: WorkflowConditionStep;
  onChange: (value: WorkflowConditionStep) => void;
}) {
  const update = (patch: Partial<WorkflowConditionStep["config"]>) =>
    onChange({ ...condition, config: { ...condition.config, ...patch } });
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium">
          Value to evaluate
        </label>
        <Input
          aria-label="Decision field"
          value={condition.config.field}
          onChange={(event) => update({ field: event.target.value })}
          placeholder="contact.custom.lead_score or answer"
          className="h-9 text-xs"
        />
        <div className="mt-1 text-[11px] text-[var(--text-muted)]">
          Use a saved answer, contact field, or message field.
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium">Operator</label>
        <select
          aria-label="Decision operator"
          value={condition.config.operator}
          onChange={(event) =>
            update({ operator: event.target.value as AutomationOperator })
          }
          className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2.5 text-xs"
        >
          {operators.map((operator) => (
            <option key={operator} value={operator}>
              {operator.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium">Compare with</label>
        <Input
          aria-label="Decision value"
          value={String(condition.config.value ?? "")}
          onChange={(event) => update({ value: event.target.value })}
          placeholder="e.g. 100 or VIP"
          className="h-9 text-xs"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium">
            True path name
          </label>
          <Input
            aria-label="True path name"
            value={condition.config.trueLabel}
            onChange={(event) => update({ trueLabel: event.target.value })}
            className="h-9 text-xs"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium">
            False path name
          </label>
          <Input
            aria-label="False path name"
            value={condition.config.falseLabel}
            onChange={(event) => update({ falseLabel: event.target.value })}
            className="h-9 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
function Branch({
  branch,
  decision,
  steps,
  templates,
  tags,
  members,
  customFields,
  onStepChange,
  onStepAdd,
  onStepMove,
  onStepDuplicate,
  onStepRemove,
}: {
  branch: BranchDefinition;
  decision: WorkflowDecisionStep;
  steps: WorkflowStep[];
  templates: Option[];
  tags: Option[];
  members: Option[];
  customFields: string[];
  onStepChange: (value: AutomationAction) => void;
  onStepAdd: (type: AutomationAction["type"]) => void;
  onStepMove: (id: string, direction: -1 | 1) => void;
  onStepDuplicate: (id: string) => void;
  onStepRemove: (id: string) => void;
}) {
  const actions = branchActions(steps, branch.key, decision);
  return (
    <section
      data-testid={`workflow-${branch.key.toLowerCase()}-branch`}
      className="rounded-md border border-[var(--border)] bg-white p-3 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-4"
    >
      <header className="flex items-center gap-2 border-b border-[var(--border-soft)] pb-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-[#edf2f8] text-xs font-bold text-[#1769aa]">
          {branch.key === "TRUE"
            ? "✓"
            : branch.key === "FALSE"
              ? "×"
              : branch.label.slice(0, 1).toUpperCase()}
        </span>
        <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
          If {branch.label}
        </h3>
      </header>
      <div className="space-y-3 pt-3">
        {actions.map((step, index) => (
          <ActionCard
            key={step.id}
            action={step}
            index={index}
            total={actions.length}
            templates={templates}
            tags={tags}
            members={members}
            customFields={customFields}
            onChange={onStepChange}
            onMove={(direction) => onStepMove(step.id, direction)}
            onDuplicate={() => onStepDuplicate(step.id)}
            onRemove={() => onStepRemove(step.id)}
          />
        ))}
        <ActionSelector
          onChange={onStepAdd}
          excludeTypes={["START_WORKFLOW"]}
        />
      </div>
    </section>
  );
}

export function WorkflowBranchBuilder({
  trigger,
  conditions,
  steps,
  definition,
  templates,
  tags,
  members,
  customFields,
  onTriggerChange,
  onConditionsChange,
  onDecisionAdd,
  onDecisionChange,
  onStepChange,
  onStepAdd,
  onStepMove,
  onStepDuplicate,
  onStepRemove,
}: Props) {
  const [editor, setEditor] = useState<Editor>(null);
  const decision = steps.find(
    (step): step is WorkflowDecisionStep =>
      step.type === "ASK_QUESTION" || step.type === "SET_CONDITION",
  );
  const triggerDefinition =
    definition ?? getTriggerDefinition(trigger ?? undefined);
  const branches = decision ? decisionBranches(decision) : [];
  return (
    <div
      data-testid="workflow-branch-builder"
      className="flex min-h-0 flex-1 overflow-hidden bg-[#f7f8fb]"
    >
      <aside
        data-testid="workflow-node-palette"
        className="hidden w-[260px] shrink-0 overflow-y-auto border-r border-[#e3e6ee] bg-white px-5 py-4 lg:block"
      >
        <div className="mb-4 flex items-center gap-2 border-b border-[var(--border-soft)] pb-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#e8f6ec] text-[#188644]">
            ◉
          </span>
          <span className="text-sm font-semibold">Chatbot nodes</span>
        </div>
        <div className="mb-4 grid grid-cols-4 gap-1 border-b border-[var(--border-soft)] pb-4 text-center text-[16px]">
          <span>◉</span>
          <span>◎</span>
          <span>◈</span>
          <span>♪</span>
        </div>
        <div className="space-y-3">
          <div className="rounded-md bg-[#ef5b6c] p-3 text-white">
            <div className="text-sm font-semibold">Send a message</div>
            <div className="mt-1 text-[11px] leading-4">
              With no response required from visitor
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDecisionAdd("QUESTION")}
            className="w-full rounded-md bg-[#ff982f] p-3 text-left text-white"
          >
            <div className="text-sm font-semibold">Ask a question</div>
            <div className="mt-1 text-[11px] leading-4">
              Ask question and store user input in variable
            </div>
          </button>
          <button
            type="button"
            onClick={() => onDecisionAdd("CONDITION")}
            className="w-full rounded-md bg-[#6b7edb] p-3 text-left text-white"
          >
            <div className="text-sm font-semibold">Set a condition</div>
            <div className="mt-1 text-[11px] leading-4">
              Send message(s) based on logical condition(s)
            </div>
          </button>
        </div>
        <div className="mt-6 border-t border-[var(--border-soft)] pt-4">
          <div className="mb-3 text-sm font-semibold">Operations</div>
          <div className="grid grid-cols-2 gap-4 text-center text-[11px] text-[var(--text-secondary)]">
            <span>
              ⚙<br />
              AI Assist
            </span>
            <span>
              ♟<br />
              Subscribe
            </span>
            <span>
              ◩<br />
              Unsubscribe
            </span>
            <span>
              ◆<br />
              Update Attribute
            </span>
          </div>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[radial-gradient(#cbd3d6_1px,transparent_1px)] [background-size:32px_32px]">
        <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto max-w-[560px]">
            <article
              data-testid="workflow-entry-card"
              className="rounded-md border border-[#e7ebed] bg-white px-4 py-3 shadow-[0_3px_12px_rgba(30,40,55,.07)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#e8f6ec] text-[#188644]">
                  {triggerDefinition ? (
                    <triggerDefinition.icon size={17} />
                  ) : (
                    <Zap size={17} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-[var(--text-secondary)]">
                    Entry trigger
                  </div>
                  <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {triggerDefinition?.label ?? "Select an entry trigger"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditor("trigger")}
                    className="mt-1 text-xs font-medium text-[#1769aa] hover:underline"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </article>
            <Connector />
            <article
              data-testid="workflow-filter-card"
              className="rounded-md border border-[#e7ebed] bg-white px-4 py-3 shadow-[0_3px_12px_rgba(30,40,55,.07)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#f2edff] text-[#7652b5]">
                  <GitBranch size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-[var(--text-secondary)]">
                    Start filter
                  </div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    {conditions.length
                      ? `${conditions.length} condition${conditions.length === 1 ? "" : "s"} must be met`
                      : "Every matching contact"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditor("conditions")}
                    className="mt-1 text-xs font-medium text-[#1769aa] hover:underline"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </article>
          </div>
          <Connector />
          {!decision ? (
            <section
              data-testid="workflow-add-decision"
              className="mx-auto max-w-[560px] rounded-md border border-dashed border-[var(--brand)]/40 bg-white p-7 text-center"
            >
              <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                <GitBranch size={21} />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                Choose how this workflow decides
              </h2>
              <div className="mx-auto mt-1 max-w-[380px] text-xs leading-5 text-[var(--text-secondary)]">
                Ask the customer, or evaluate a saved value and route the
                conversation to the right path.
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  onClick={() => onDecisionAdd("QUESTION")}
                  className="h-9 text-xs"
                >
                  <Plus size={15} /> Ask a question
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onDecisionAdd("CONDITION")}
                  className="h-9 text-xs"
                >
                  <GitBranch size={15} /> Set a condition
                </Button>
              </div>
            </section>
          ) : (
            <>
              <article
                data-testid="workflow-decision-card"
                className="mx-auto max-w-[560px] rounded-md border border-[#e7ebed] bg-white px-4 py-3 shadow-[0_3px_12px_rgba(30,40,55,.07)]"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#fff7e8] text-[#bd7615]">
                    {decision.type === "ASK_QUESTION" ? "?" : "if"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[var(--text-secondary)]">
                      {decision.type === "ASK_QUESTION"
                        ? "Ask a question"
                        : "Set a condition"}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                      {decision.type === "ASK_QUESTION"
                        ? decision.config.question || "Question not configured"
                        : decision.config.field || "Condition not configured"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {branches.map((branch) => (
                        <span
                          key={branch.key}
                          className="rounded bg-[#edf2f8] px-2 py-1 text-[11px] font-medium text-[#1769aa]"
                        >
                          {branch.label}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditor("decision")}
                      className="mt-2 text-xs font-medium text-[#1769aa] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </article>
              <Connector />
              <div
                className={`grid gap-4 ${branches.length > 2 ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"}`}
              >
                {branches.map((branch) => (
                  <Branch
                    key={branch.key}
                    branch={branch}
                    decision={decision}
                    steps={steps}
                    templates={templates}
                    tags={tags}
                    members={members}
                    customFields={customFields}
                    onStepChange={onStepChange}
                    onStepAdd={(type) => onStepAdd(branch.key, type)}
                    onStepMove={onStepMove}
                    onStepDuplicate={onStepDuplicate}
                    onStepRemove={onStepRemove}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      <TriggerSelector
        value={trigger}
        open={editor === "trigger"}
        hideTrigger
        onOpenChange={(open) => {
          if (!open && editor === "trigger") setEditor(null);
        }}
        onChange={(value) => {
          onTriggerChange(value);
          setEditor(null);
        }}
      />
      <Drawer
        open={editor === "conditions"}
        onOpenChange={(open) => {
          if (!open && editor === "conditions") setEditor(null);
        }}
        direction="right"
      >
        <DrawerContent className="h-full max-h-screen">
          <DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] pr-14">
            <DrawerTitle>Start filters</DrawerTitle>
            <DrawerDescription>
              Choose the conditions required before a contact enters this
              workflow.
            </DrawerDescription>
            <DrawerCloseButton />
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <ConditionsBuilder
              conditions={conditions}
              definition={triggerDefinition}
              onChange={onConditionsChange}
            />
          </div>
          <DrawerFooter className="flex-none border-t border-[var(--border-soft)] p-4">
            <DrawerClose asChild>
              <Button type="button" className="h-9 text-xs">
                Done
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      {decision && (
        <Drawer
          open={editor === "decision"}
          onOpenChange={(open) => {
            if (!open && editor === "decision") setEditor(null);
          }}
          direction="right"
        >
          <DrawerContent className="h-full max-h-screen">
            <DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] pr-14">
              <DrawerTitle>
                {decision.type === "ASK_QUESTION"
                  ? "Ask a question"
                  : "Set a condition"}
              </DrawerTitle>
              <DrawerDescription>
                Configure how this workflow chooses its next path.
              </DrawerDescription>
              <DrawerCloseButton />
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {decision.type === "ASK_QUESTION" ? (
                <QuestionEditor
                  question={decision}
                  onChange={onDecisionChange}
                />
              ) : (
                <ConditionEditor
                  condition={decision}
                  onChange={onDecisionChange}
                />
              )}
            </div>
            <DrawerFooter className="flex-none border-t border-[var(--border-soft)] p-4">
              <DrawerClose asChild>
                <Button type="button" className="h-9 text-xs">
                  Done
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
