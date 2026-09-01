import { useState } from "react";
import { Filter, Zap } from "lucide-react";
import { ActionCard } from "@/components/automation/ActionCard";
import { ActionSelector } from "@/components/automation/ActionSelector";
import { ConditionsBuilder } from "@/components/automation/ConditionsBuilder";
import { TriggerSelector } from "@/components/automation/TriggerSelector";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerCloseButton, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { getActionDefinition } from "@/config/automation-actions";
import { getTriggerDefinition, type AutomationTriggerDefinition } from "@/config/automation-triggers";
import type { AutomationAction, AutomationCondition, AutomationTriggerType } from "@/types/automation";

type Option = { id: string; label: string };
type Editor = "trigger" | "conditions" | { actionId: string } | null;

type AutomationRuleBuilderProps = {
  trigger: AutomationTriggerType | null;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  definition?: AutomationTriggerDefinition;
  templates: Option[];
  tags: Option[];
  members: Option[];
  customFields: string[];
  onTriggerChange: (value: AutomationTriggerType) => void;
  onConditionsChange: (value: AutomationCondition[]) => void;
  onActionChange: (value: AutomationAction) => void;
  onActionAdd: (value: AutomationAction["type"]) => void;
  onActionMove: (index: number, direction: -1 | 1) => void;
  onActionDuplicate: (index: number) => void;
  onActionRemove: (id: string) => void;
};

function actionSummary(action: AutomationAction, templates: Option[], tags: Option[], members: Option[]) {
  const config = action.config;
  if (action.type === "SEND_MESSAGE") return String(config.message ?? "Message not configured").trim() || "Message not configured";
  if (action.type === "ADD_INTERNAL_NOTE") return String(config.message ?? "Internal note not configured").trim() || "Internal note not configured";
  if (action.type === "SEND_TEMPLATE") return templates.find((item) => item.id === config.templateId)?.label ?? (config.templateId ? "Selected WhatsApp template" : "Template not selected");
  if (action.type === "WAIT") return `Wait ${config.amount ?? 1} ${config.unit ?? "hours"}`;
  if (action.type === "ADD_TAG" || action.type === "REMOVE_TAG") return tags.find((item) => item.id === config.tagId)?.label ?? "Select a tag";
  if (action.type === "ASSIGN_AGENT") return members.find((item) => item.id === config.memberId)?.label ?? "Select an agent";
  if (action.type === "ASSIGN_TEAM") return String(config.teamName ?? "Select a team").trim() || "Select a team";
  if (action.type === "UPDATE_CUSTOM_FIELD") return String(config.field ?? "Select a custom field").trim() || "Select a custom field";
  return getActionDefinition(action.type)?.description ?? "Configure this action";
}

function Connector() { return <div aria-hidden="true" className="flex h-8 items-center justify-center"><span className="h-full border-l-2 border-dotted border-[#c6cccf]" /></div>; }

function RuleCard({ icon, tone, eyebrow, title, detail, onEdit, testId }: { icon: React.ReactNode; tone: string; eyebrow: string; title: React.ReactNode; detail?: string; onEdit: () => void; testId: string }) {
  return <article data-testid={testId} className="rounded-md border border-[#e7ebed] bg-white px-3 py-3 shadow-[0_3px_12px_rgba(30,40,55,.07)] sm:px-4"><div className="flex items-start gap-3"><div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ${tone}`}>{icon}</div><div className="min-w-0 flex-1"><div className="text-xs text-[var(--text-secondary)]">{eyebrow}</div><div className="mt-0.5 text-[14px] font-semibold leading-5 text-[var(--text-primary)]">{title}</div>{detail && <div className="mt-1 truncate text-xs text-[var(--text-secondary)]">{detail}</div>}<button type="button" onClick={onEdit} className="mt-1.5 text-xs font-medium text-[#1769aa] hover:underline">Edit</button></div></div></article>;
}

export function AutomationRuleBuilder({ trigger, conditions, actions, definition, templates, tags, members, customFields, onTriggerChange, onConditionsChange, onActionChange, onActionAdd, onActionMove, onActionDuplicate, onActionRemove }: AutomationRuleBuilderProps) {
  const [editor, setEditor] = useState<Editor>(null);
  const selectedAction = editor && typeof editor === "object" ? actions.find((action) => action.id === editor.actionId) : undefined;
  const triggerDefinition = definition ?? getTriggerDefinition(trigger ?? undefined);

  return <div data-testid="automation-rule-builder" className="min-h-0 flex-1 overflow-y-auto bg-[var(--page-background)]"><div className="mx-auto w-full max-w-[560px] px-4 py-6 sm:px-6 sm:py-8">
    <RuleCard testId="automation-when-card" tone="bg-[#e8f6ec] text-[#188644]" icon={triggerDefinition ? <triggerDefinition.icon size={17} /> : <Zap size={17} />} eyebrow="When" title={triggerDefinition?.label ?? "Select a trigger"} onEdit={() => setEditor("trigger")} />
    <Connector />
    <RuleCard testId="automation-filter-card" tone="bg-[#fff0f1] text-[#e45162]" icon={<Filter size={17} />} eyebrow="Filter" title={conditions.length ? <>Continue rule only if <span className="font-normal text-[var(--text-secondary)]">all</span> <span className="rounded bg-[#edf2f8] px-1.5 py-0.5 text-[#1769aa]">{conditions.length} condition{conditions.length === 1 ? "" : "s"}</span> are met</> : "Continue rule for every occurrence"} onEdit={() => setEditor("conditions")} />
    {actions.length ? <>{actions.map((action, index) => { const ActionIcon = getActionDefinition(action.type)?.icon; return <span key={action.id}><Connector /><RuleCard testId={`automation-then-card-${action.id}`} tone="bg-[#fff0f1] text-[#e45162]" icon={ActionIcon ? <ActionIcon size={17} /> : <span className="text-xs font-bold">{index + 1}</span>} eyebrow="Then" title={getActionDefinition(action.type)?.label ?? action.type} detail={actionSummary(action, templates, tags, members)} onEdit={() => setEditor({ actionId: action.id })} /></span>; })}</> : <><Connector /><section data-testid="automation-no-actions" className="rounded-md border border-dashed border-[#cfd7da] bg-white px-5 py-6 text-center"><div className="text-sm font-medium text-[var(--text-primary)]">Add an action</div><div className="mt-1 text-xs text-[var(--text-secondary)]">Choose what should happen when this rule matches.</div></section></>}
    <div className="mt-4"><ActionSelector onChange={onActionAdd} /></div>
  </div>

  <TriggerSelector value={trigger} open={editor === "trigger"} hideTrigger onOpenChange={(open) => { if (!open && editor === "trigger") setEditor(null); }} onChange={(value) => { onTriggerChange(value); setEditor(null); }} />
  <Drawer open={editor === "conditions"} onOpenChange={(open) => { if (!open && editor === "conditions") setEditor(null); }} direction="right"><DrawerContent className="h-full max-h-screen"><DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] pr-14"><DrawerTitle>Filters</DrawerTitle><DrawerDescription>Choose the conditions that must be met for this rule to run.</DrawerDescription><DrawerCloseButton /></DrawerHeader><div className="min-h-0 flex-1 overflow-y-auto p-4"><ConditionsBuilder conditions={conditions} definition={triggerDefinition} onChange={onConditionsChange} /></div><DrawerFooter className="flex-none border-t border-[var(--border-soft)] p-4"><DrawerClose asChild><Button type="button" className="h-9 text-xs">Done</Button></DrawerClose></DrawerFooter></DrawerContent></Drawer>
  {selectedAction && <Drawer open={Boolean(selectedAction)} onOpenChange={(open) => { if (!open) setEditor(null); }} direction="right"><DrawerContent className="h-full max-h-screen"><DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] pr-14"><DrawerTitle>{getActionDefinition(selectedAction.type)?.label ?? "Configure action"}</DrawerTitle><DrawerCloseButton /></DrawerHeader><div className="min-h-0 flex-1 overflow-y-auto p-4"><ActionCard action={selectedAction} index={actions.findIndex((action) => action.id === selectedAction.id)} total={actions.length} templates={templates} tags={tags} members={members} customFields={customFields} onChange={onActionChange} onMove={(direction) => onActionMove(actions.findIndex((action) => action.id === selectedAction.id), direction)} onDuplicate={() => onActionDuplicate(actions.findIndex((action) => action.id === selectedAction.id))} onRemove={() => { onActionRemove(selectedAction.id); setEditor(null); }} /></div><DrawerFooter className="flex-none border-t border-[var(--border-soft)] p-4"><DrawerClose asChild><Button type="button" className="h-9 text-xs">Done</Button></DrawerClose></DrawerFooter></DrawerContent></Drawer>}
  </div>;
}
