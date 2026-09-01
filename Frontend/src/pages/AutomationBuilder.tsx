import { useEffect, useState } from "react";
import { ArrowLeft, Save, Send } from "lucide-react";
import { toast } from "react-toastify";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AutomationRuleBuilder } from "@/components/automation/AutomationRuleBuilder";
import { AutomationShell } from "@/components/automation/AutomationShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { getActionDefinition } from "@/config/automation-actions";
import { ApiError, apiRequest } from "@/lib/api";
import { automationService, type AutomationPayload } from "@/lib/automation.service";
import { getActiveMembership } from "@/lib/workspace";
import type { Automation, AutomationAction, AutomationCondition, AutomationStatus, AutomationTriggerType } from "@/types/automation";

type Option = { id: string; label: string };
type FormState = { name: string; trigger: AutomationTriggerType | null; conditions: AutomationCondition[]; actions: AutomationAction[]; status: AutomationStatus };
const initialForm: FormState = { name: "", trigger: null, conditions: [], actions: [], status: "DRAFT" };

function actionConfig(type: AutomationAction["type"]): Record<string, unknown> {
  if (type === "WAIT") return { amount: 1, unit: "hours" };
  if (type === "SEND_MESSAGE" || type === "ADD_INTERNAL_NOTE") return { message: "" };
  return {};
}

function fromAutomation(value: Automation): FormState {
  return { name: value.name, trigger: value.trigger?.type ?? null, conditions: value.conditions ?? [], actions: value.actions ?? [], status: value.status };
}

function friendlyError(error: unknown, fallback: string) { return error instanceof ApiError ? error.message : fallback; }

export function AutomationBuilder() {
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { automationId } = useParams<{ automationId: string }>();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canManage = membership?.role.permissions.includes("automations.manage") ?? false;
  const [form, setForm] = useState<FormState>(initialForm);
  const [templates, setTemplates] = useState<Option[]>([]);
  const [tags, setTags] = useState<Option[]>([]);
  const [members, setMembers] = useState<Option[]>([]);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(automationId));
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    if (automationId) return;
    const duplicate = (location.state as { duplicate?: Automation } | null)?.duplicate;
    if (duplicate) setForm(fromAutomation({ ...duplicate, status: "DRAFT" }));
  }, [automationId, location.state]);

  useEffect(() => {
    if (!workspaceId || !accessToken) return;
    let active = true;
    const headers = { authorization: `Bearer ${accessToken}` };
    void Promise.all([
      apiRequest<Array<{ id: string; name: string }>>(`/workspaces/${workspaceId}/contacts/tags`, { headers }),
      apiRequest<Array<{ id: string; user: { firstName: string; lastName: string }; status: string }>>(`/workspaces/${workspaceId}/members`, { headers }),
      apiRequest<Array<{ id: string; label: string }>>(`/workspaces/${workspaceId}/contacts/custom-fields`, { headers }).catch(() => []),
      apiRequest<{ items: Array<{ id: string; name: string; key: string; status: string }> }>(`/workspaces/${workspaceId}/templates?status=active&page=1&pageSize=100`, { headers }).catch(() => ({ items: [] })),
    ]).then(([tagRows, memberRows, fieldRows, templateRows]) => {
      if (!active) return;
      setTags(tagRows.map((item) => ({ id: item.id, label: item.name })));
      setMembers(memberRows.filter((item) => item.status === "ACTIVE").map((item) => ({ id: item.id, label: `${item.user.firstName} ${item.user.lastName}`.trim() })));
      setCustomFields(fieldRows.map((item) => item.label));
      setTemplates(templateRows.items.filter((item) => item.status === "APPROVED").map((item) => ({ id: item.id, label: item.name || item.key })));
    }).catch(() => undefined);
    if (automationId) {
      void automationService(workspaceId, accessToken).get(automationId).then((item) => { if (active) setForm(fromAutomation(item)); }).catch((caught) => { if (active) toast.error(friendlyError(caught, "Automation could not be loaded.")); }).finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [accessToken, automationId, location.state, workspaceId]);

  const payload = (): AutomationPayload => ({ name: form.name.trim(), description: null, trigger: { type: form.trigger as AutomationTriggerType, config: {} }, conditions: form.conditions, actions: form.actions.map((action, index) => ({ ...action, order: index + 1 })) });

  const validate = () => {
    if (!form.name.trim()) return "Automation name is required.";
    if (!form.trigger) return "Select a trigger before saving.";
    if (!form.actions.length) return "Add at least one action before publishing.";
    for (const action of form.actions) {
      const config = action.config;
      if ((action.type === "SEND_MESSAGE" || action.type === "ADD_INTERNAL_NOTE") && !String(config.message ?? "").trim()) return `Please configure the ${getActionDefinition(action.type)?.label ?? action.type} action.`;
      if (action.type === "SEND_TEMPLATE" && !config.templateId) return "Please select a template for the Send WhatsApp Template action.";
      if ((action.type === "ADD_TAG" || action.type === "REMOVE_TAG") && !config.tagId) return "Please select a tag for this action.";
      if (action.type === "ASSIGN_AGENT" && !config.memberId) return "Please select an agent for the Assign Agent action.";
      if (action.type === "ASSIGN_TEAM" && !String(config.teamName ?? "").trim()) return "Please enter a team for the Assign Team action.";
      if (action.type === "WAIT" && (!Number(config.amount) || Number(config.amount) < 1)) return "Wait time must be at least one.";
      if (["START_WORKFLOW", "START_SEQUENCE", "STOP_SEQUENCE"].includes(action.type) && !String(config.reference ?? "").trim()) return `Please enter a ${action.type === "START_WORKFLOW" ? "workflow" : "sequence"} for this action.`;
    }
    return null;
  };

  const save = async (publish: boolean) => {
    if (!workspaceId || !accessToken || !canManage) return;
    const validation = publish ? validate() : (!form.name.trim() ? "Automation name is required." : !form.trigger ? "Select a trigger before saving." : null);
    if (validation) { setNameError(!form.name.trim()); toast.error(validation); return; }
    setNameError(false);
    setSaving(true);
    try {
      const service = automationService(workspaceId, accessToken);
      const saved = automationId ? await service.update(automationId, payload()) : await service.create(payload());
      const final = publish ? await service.setStatus(saved.id, "ACTIVE") : saved;
      setForm(fromAutomation(final)); toast.success(publish ? "Automation published." : "Draft saved.");
      navigate("/automations", { replace: true });
    } catch (caught) { toast.error(friendlyError(caught, "Automation could not be saved.")); }
    finally { setSaving(false); }
  };

  const addAction = (type: AutomationAction["type"]) => setForm((current) => ({ ...current, actions: [...current.actions, { id: `action_${Date.now()}_${current.actions.length}`, type, order: current.actions.length + 1, config: actionConfig(type) }] }));
  const updateAction = (next: AutomationAction) => setForm((current) => ({ ...current, actions: current.actions.map((item) => item.id === next.id ? next : item) }));
  const moveAction = (index: number, direction: -1 | 1) => setForm((current) => { const next = [...current.actions]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return { ...current, actions: next.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })) }; });
  const duplicateAction = (index: number) => setForm((current) => { const action = current.actions[index]; if (!action) return current; const next = [...current.actions]; next.splice(index + 1, 0, { ...action, id: `action_${Date.now()}_copy`, config: { ...action.config } }); return { ...current, actions: next.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })) }; });

  if (!canManage) return <AutomationShell><div className="flex h-full items-center justify-center p-6"><section className="max-w-md rounded-md border border-[var(--border)] bg-white p-8 text-center"><h1 className="text-lg font-semibold">Automation access is restricted</h1><div className="mt-2 text-sm text-[var(--text-secondary)]">You do not have permission to manage automations in this workspace.</div></section></div></AutomationShell>;
  if (loading) return <AutomationShell><div className="p-8 text-sm text-[var(--text-secondary)]">Loading automation...</div></AutomationShell>;
  return <AutomationShell><div data-testid="automation-builder" className="flex h-full min-h-0 flex-col overflow-hidden">
    <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] bg-white px-5 py-3 sm:px-8"><div className="flex min-w-0 flex-1 items-center gap-3"><button type="button" aria-label="Back to automations" onClick={() => navigate("/automations")} className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><ArrowLeft size={17} /></button><div className="flex min-w-0 flex-1 items-center"><label htmlFor="automation-name" className="sr-only">Automation Name</label><Input id="automation-name" value={form.name} onChange={(event) => { setNameError(false); setForm((current) => ({ ...current, name: event.target.value })); }} placeholder="Automation name" maxLength={160} aria-invalid={nameError} className={`h-9 min-w-0 max-w-[380px] flex-1 bg-white px-3 text-sm font-medium shadow-none focus:bg-white focus:ring-0 ${nameError ? "border-red-500 focus:border-red-500" : "border-[var(--border)] focus:border-[var(--brand)]"}`} /></div></div><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void save(false)} disabled={saving} className="h-9 text-xs"><Save size={14} /> Save Draft</Button><Button type="button" size="sm" onClick={() => void save(true)} disabled={saving} className="h-9 text-xs"><Send size={14} /> Publish</Button></div></header>
    <AutomationRuleBuilder trigger={form.trigger} conditions={form.conditions} actions={form.actions} templates={templates} tags={tags} members={members} customFields={customFields} onTriggerChange={(trigger) => setForm((current) => ({ ...current, trigger, conditions: [] }))} onConditionsChange={(conditions) => setForm((current) => ({ ...current, conditions }))} onActionChange={updateAction} onActionAdd={addAction} onActionMove={moveAction} onActionDuplicate={duplicateAction} onActionRemove={(id) => setForm((current) => ({ ...current, actions: current.actions.filter((item) => item.id !== id).map((item, index) => ({ ...item, order: index + 1 })) }))} />
    </div>
  </AutomationShell>;
}
