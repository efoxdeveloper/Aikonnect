import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Plus, Shuffle, Trash2, UsersRound, X } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";

type Strategy = "AGENT" | "ROUND_ROBIN";
type AssignmentRule = { id: string; name: string; priority: number; enabled: boolean; contactTagId: string | null; phoneNumberId: string | null; strategy: Strategy; memberIds: string[]; roundRobinCursor: number; createdAt: string; updatedAt: string };
type Option = { id: string; name: string; email?: string };
type RuleOptions = { members: Option[]; tags: Option[]; phoneNumbers: Option[] };
type RuleForm = { name: string; contactTagId: string; phoneNumberId: string; strategy: Strategy; memberIds: string[] };
const emptyForm: RuleForm = { name: "", contactTagId: "", phoneNumberId: "", strategy: "ROUND_ROBIN", memberIds: [] };
function friendlyError(error: unknown) { return error instanceof ApiError ? error.message : "Assignment rules could not be loaded."; }

export function AssignmentRules() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canManage = membership?.role.permissions.includes("conversations.assign") ?? false;
  const headers = useMemo(() => ({ authorization: `Bearer ${accessToken ?? ""}` }), [accessToken]);
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [options, setOptions] = useState<RuleOptions>({ members: [], tags: [], phoneNumbers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentRule | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssignmentRule | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId || !accessToken || !canManage) { setLoading(false); return; }
    setError("");
    try {
      const [ruleResult, optionResult] = await Promise.all([
        apiRequest<{ items: AssignmentRule[] }>(`/workspaces/${workspaceId}/assignment-rules`, { headers }),
        apiRequest<RuleOptions>(`/workspaces/${workspaceId}/assignment-rules/options`, { headers }),
      ]);
      setRules(ruleResult.items);
      setOptions(optionResult);
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setLoading(false); }
  }, [accessToken, canManage, headers, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormOpen(true); };
  const openEdit = (rule: AssignmentRule) => { setEditing(rule); setForm({ name: rule.name, contactTagId: rule.contactTagId ?? "", phoneNumberId: rule.phoneNumberId ?? "", strategy: rule.strategy, memberIds: rule.memberIds }); setFormOpen(true); };
  const toggleMember = (id: string) => setForm((current) => ({ ...current, memberIds: current.strategy === "AGENT" ? [id] : current.memberIds.includes(id) ? current.memberIds.filter((memberId) => memberId !== id) : [...current.memberIds, id] }));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !accessToken) return;
    if (!form.name.trim()) { toast.error("Enter a rule name."); return; }
    if (!form.memberIds.length) { toast.error("Choose at least one agent."); return; }
    if (form.strategy === "AGENT" && form.memberIds.length !== 1) { toast.error("Choose one agent for direct assignment."); return; }
    const payload = { name: form.name.trim(), enabled: editing?.enabled ?? true, contactTagId: form.contactTagId || null, phoneNumberId: form.phoneNumberId || null, strategy: form.strategy, memberIds: form.memberIds };
    setSaving(true);
    try {
      const saved = await apiRequest<AssignmentRule>(`/workspaces/${workspaceId}/assignment-rules${editing ? `/${editing.id}` : ""}`, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(payload) });
      if (editing) setRules((current) => current.map((item) => item.id === saved.id ? saved : item));
      else setRules((current) => [...current, saved].sort((a, b) => a.priority - b.priority));
      setFormOpen(false);
      toast.success(editing ? "Assignment rule updated." : "Assignment rule created.");
    } catch (caught) { toast.error(friendlyError(caught)); }
    finally { setSaving(false); }
  };

  const toggleRule = async (rule: AssignmentRule) => {
    if (!workspaceId || !accessToken) return;
    const payload = { name: rule.name, enabled: !rule.enabled, contactTagId: rule.contactTagId, phoneNumberId: rule.phoneNumberId, strategy: rule.strategy, memberIds: rule.memberIds };
    try {
      const updated = await apiRequest<AssignmentRule>(`/workspaces/${workspaceId}/assignment-rules/${rule.id}`, { method: "PUT", headers, body: JSON.stringify(payload) });
      setRules((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success(updated.enabled ? "Assignment rule enabled." : "Assignment rule paused.");
    } catch (caught) { toast.error(friendlyError(caught)); }
  };

  const remove = async () => {
    if (!workspaceId || !accessToken || !deleteTarget) return;
    try {
      await apiRequest<void>(`/workspaces/${workspaceId}/assignment-rules/${deleteTarget.id}`, { method: "DELETE", headers });
      setRules((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Assignment rule deleted.");
    } catch (caught) { toast.error(friendlyError(caught)); throw caught; }
  };

  const move = async (index: number, offset: -1 | 1) => {
    if (!workspaceId || !accessToken || reordering) return;
    const target = index + offset;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRules(next);
    setReordering(true);
    try {
      const result = await apiRequest<{ items: AssignmentRule[] }>(`/workspaces/${workspaceId}/assignment-rules/reorder`, { method: "PUT", headers, body: JSON.stringify({ ruleIds: next.map(({ id }) => id) }) });
      setRules(result.items);
    } catch (caught) { setRules(rules); toast.error(friendlyError(caught)); }
    finally { setReordering(false); }
  };

  const memberNames = (ids: string[]) => ids.map((id) => options.members.find((member) => member.id === id)?.name ?? "Unavailable agent").join(", ");
  const tagName = (id: string | null) => id ? options.tags.find((tag) => tag.id === id)?.name ?? "Deleted tag" : "Any contact";
  const phoneName = (id: string | null) => id ? options.phoneNumbers.find((phone) => phone.id === id)?.name ?? "Disconnected number" : "Any WhatsApp number";

  if (!canManage) return <div data-testid="assignment-rules-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]"><header className="flex h-[52px] flex-none items-center border-b border-[var(--border-soft)] bg-white px-5 sm:px-8"><h1 className="text-[19px] font-medium leading-6 text-[var(--text-primary)]">Assignment Rules</h1></header><div className="flex flex-1 items-center justify-center p-6"><section className="max-w-md rounded-lg border border-[var(--border)] bg-white p-7 text-center"><UsersRound className="mx-auto text-[var(--brand)]" size={28} /><h2 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">Assignment rule access is restricted</h2><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Your workspace role does not allow managing conversation assignments.</p></section></div></div>;

  return <div data-testid="assignment-rules-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]">
    <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] bg-white px-5 py-3 sm:px-8"><h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">Assignment Rules</h1><Button type="button" onClick={openCreate} className="h-9 text-xs"><Plus size={15} /> Create rule</Button></header>
    <main className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-4 overflow-hidden px-5 py-4 sm:px-8">
      <section className="flex flex-none items-start gap-3 rounded-lg border border-[var(--border)] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(30,40,55,.035)]"><div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><Shuffle size={16} /></div><div><h2 className="text-xs font-semibold text-[var(--text-primary)]">Automatic routing for new WhatsApp conversations</h2><p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">Rules run from top to bottom when an incoming message arrives. The first matching rule assigns an active inbox agent; already assigned conversations keep their owner.</p></div></section>
      <section data-testid="assignment-rules-panel" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_3px_12px_rgba(30,40,55,.045)]">
        <div className="flex flex-none items-center justify-between border-b border-[var(--border-soft)] px-4 py-3"><div><h2 className="text-xs font-semibold text-[var(--text-primary)]">Routing rules</h2><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">Move rules to change their priority.</p></div><span className="text-[10px] text-[var(--text-muted)]">{rules.length} rule{rules.length === 1 ? "" : "s"}</span></div>
        <div data-testid="assignment-rules-scroll-region" className="min-h-0 flex-1 overflow-auto">
          {loading ? <div role="status" className="p-8 text-center text-xs text-[var(--text-secondary)]">Loading assignment rules…</div> : error ? <div role="alert" className="m-4 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">{error} <button type="button" onClick={() => { setLoading(true); void load(); }} className="ml-1 font-semibold underline">Retry</button></div> : rules.length ? <table className="w-full min-w-[850px] border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-[#f7f8fa] text-[10px] font-semibold uppercase tracking-[.035em] text-[var(--text-secondary)]"><tr className="border-b border-[var(--border)]"><th className="w-16 px-4 py-3 text-center">Order</th><th className="px-4 py-3">Rule</th><th className="px-4 py-3">Contact match</th><th className="px-4 py-3">Assignment</th><th className="w-24 px-4 py-3">Status</th><th className="w-28 px-4 py-3 text-right">Actions</th></tr></thead><tbody>{rules.map((rule, index) => <tr key={rule.id} className="border-b border-[var(--border-soft)] hover:bg-[var(--brand-soft)]/20"><td className="px-2 py-2 text-center"><div className="inline-flex flex-col"><button type="button" aria-label={`Move ${rule.name} up`} disabled={index === 0 || reordering} onClick={() => void move(index, -1)} className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white hover:text-[var(--brand)] disabled:opacity-25"><ArrowUp size={13} /></button><span className="text-[10px] font-medium text-[var(--text-muted)]">{index + 1}</span><button type="button" aria-label={`Move ${rule.name} down`} disabled={index === rules.length - 1 || reordering} onClick={() => void move(index, 1)} className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-white hover:text-[var(--brand)] disabled:opacity-25"><ArrowDown size={13} /></button></div></td><td className="px-4 py-3"><button type="button" onClick={() => openEdit(rule)} className="text-left font-semibold text-[#1769aa] underline-offset-2 hover:underline">{rule.name}</button><div className="mt-0.5 text-[10px] text-[var(--text-muted)]">Incoming WhatsApp message</div></td><td className="px-4 py-3"><div className="text-[var(--text-secondary)]">{tagName(rule.contactTagId)}</div><div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{phoneName(rule.phoneNumberId)}</div></td><td className="px-4 py-3"><div className="font-medium text-[var(--text-primary)]">{rule.strategy === "AGENT" ? "Assign agent" : "Round robin"}</div><div className="mt-0.5 max-w-[260px] truncate text-[10px] text-[var(--text-muted)]" title={memberNames(rule.memberIds)}>{memberNames(rule.memberIds)}</div></td><td className="px-4 py-3"><button type="button" role="switch" aria-checked={rule.enabled} aria-label={`Toggle ${rule.name}`} onClick={() => void toggleRule(rule)} className={`relative h-5 w-9 rounded-full transition-colors ${rule.enabled ? "bg-[var(--brand)]" : "bg-[#cbd0d8]"}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${rule.enabled ? "left-[18px]" : "left-0.5"}`} /></button><span className="ml-1.5 text-[10px] text-[var(--text-secondary)]">{rule.enabled ? "Active" : "Paused"}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" aria-label={`Edit ${rule.name}`} onClick={() => openEdit(rule)} className="rounded px-2 py-1.5 text-[10px] font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)]">Edit</button><button type="button" aria-label={`Delete ${rule.name}`} onClick={() => setDeleteTarget(rule)} className="flex size-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-red-50 hover:text-[var(--danger)]"><Trash2 size={14} /></button></div></td></tr>)}</tbody></table> : <div className="flex h-full min-h-[260px] items-center justify-center p-8 text-center"><div><div className="mx-auto flex size-11 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Shuffle size={20} /></div><h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">No assignment rules yet</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[var(--text-secondary)]">Create a rule to route new incoming WhatsApp chats to the right agent automatically.</p><Button type="button" onClick={openCreate} className="mt-4 h-9 text-xs"><Plus size={14} /> Create first rule</Button></div></div>}
        </div>
        <footer className="flex flex-none items-center justify-between border-t border-[var(--border-soft)] px-4 py-2.5 text-[10px] text-[var(--text-muted)]"><span>First matching active rule wins</span><span>Fallback: leave unassigned</span></footer>
      </section>
    </main>

    {formOpen && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--overlay)] p-3 sm:p-6"><form role="dialog" aria-modal="true" aria-labelledby="assignment-rule-title" onSubmit={(event) => void save(event)} className="flex max-h-[min(760px,calc(100dvh-24px))] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[0_20px_60px_rgba(4,45,29,.18)]"><header className="flex flex-none items-center justify-between border-b border-[var(--border-soft)] px-5 py-4"><div><h2 id="assignment-rule-title" className="text-sm font-semibold text-[var(--text-primary)]">{editing ? "Edit assignment rule" : "Create assignment rule"}</h2><p className="mt-1 text-[11px] text-[var(--text-secondary)]">Set the match and choose who receives new chats.</p></div><button type="button" aria-label="Close rule form" onClick={() => setFormOpen(false)} className="flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]"><X size={17} /></button></header><div data-testid="assignment-rule-form-scroll-region" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
      <label className="block"><span className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">Rule name</span><input autoFocus maxLength={160} required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Sales leads rotation" className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-xs outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10" /></label>
      <section><h3 className="text-xs font-semibold text-[var(--text-primary)]">When this rule matches</h3><p className="mt-1 text-[10px] text-[var(--text-muted)]">Runs when an incoming WhatsApp message arrives on an unassigned chat.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">WhatsApp number</span><select aria-label="WhatsApp number condition" value={form.phoneNumberId} onChange={(event) => setForm((current) => ({ ...current, phoneNumberId: event.target.value }))} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"><option value="">Any connected number</option>{options.phoneNumbers.map((phone) => <option key={phone.id} value={phone.id}>{phone.name}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">Contact has tag</span><select aria-label="Contact tag condition" value={form.contactTagId} onChange={(event) => setForm((current) => ({ ...current, contactTagId: event.target.value }))} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"><option value="">Any contact</option>{options.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label></div></section>
      <section><h3 className="text-xs font-semibold text-[var(--text-primary)]">Assign to</h3><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" aria-pressed={form.strategy === "ROUND_ROBIN"} onClick={() => setForm((current) => ({ ...current, strategy: "ROUND_ROBIN", memberIds: current.memberIds.length ? current.memberIds : [] }))} className={`rounded-md border p-3 text-left ${form.strategy === "ROUND_ROBIN" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--border)] hover:bg-[var(--surface-subtle)]"}`}><span className="block text-xs font-medium text-[var(--text-primary)]">Round robin</span><span className="mt-1 block text-[10px] leading-4 text-[var(--text-secondary)]">Rotate new chats between selected agents.</span></button><button type="button" aria-pressed={form.strategy === "AGENT"} onClick={() => setForm((current) => ({ ...current, strategy: "AGENT", memberIds: current.memberIds.slice(0, 1) }))} className={`rounded-md border p-3 text-left ${form.strategy === "AGENT" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--border)] hover:bg-[var(--surface-subtle)]"}`}><span className="block text-xs font-medium text-[var(--text-primary)]">Specific agent</span><span className="mt-1 block text-[10px] leading-4 text-[var(--text-secondary)]">Always assign matching chats to one agent.</span></button></div>
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-md border border-[var(--border-soft)] p-1.5">{options.members.length ? options.members.map((member) => <label key={member.id} className="flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-2 hover:bg-[var(--surface-subtle)]"><input type={form.strategy === "AGENT" ? "radio" : "checkbox"} name="assignment-members" checked={form.memberIds.includes(member.id)} onChange={() => toggleMember(member.id)} className="accent-[var(--brand)]" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-[var(--text-primary)]">{member.name}</span>{member.email && <span className="block truncate text-[10px] text-[var(--text-muted)]">{member.email}</span>}</span></label>) : <p className="p-3 text-center text-[11px] text-[var(--text-muted)]">No active inbox agents available.</p>}</div>
      </section>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] leading-4 text-amber-900">Rules are checked in order; only the first match applies. An agent assignment made manually is preserved. If no rule matches, the chat stays unassigned.</div>
    </div><footer className="flex flex-none justify-end gap-2 border-t border-[var(--border-soft)] bg-[var(--surface-subtle)] px-5 py-3"><Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="h-9 text-xs">Cancel</Button><Button type="submit" disabled={saving || !options.members.length} className="h-9 text-xs">{saving ? "Saving…" : editing ? "Save changes" : "Create rule"}</Button></footer></form></div>}
    <ConfirmationDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} title="Delete this assignment rule?" description={`“${deleteTarget?.name ?? ""}” will no longer route new chats.`} confirmLabel="Delete rule" pendingLabel="Deleting…" tone="danger" onConfirm={remove} />
  </div>;
}
