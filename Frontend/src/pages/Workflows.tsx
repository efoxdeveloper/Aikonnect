import { useCallback, useEffect, useState } from "react";
import { Copy, GitBranch, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AutomationShell } from "@/components/automation/AutomationShell";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { workflowService } from "@/lib/workflow.service";
import { getActiveMembership } from "@/lib/workspace";
import type { AutomationStatus } from "@/types/automation";
import type { Workflow } from "@/types/workflow";

function modifiedDate(value: string) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(value)); }

export function Workflows() {
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canRead = membership?.role.permissions.includes("automations.read") ?? false;
  const canManage = membership?.role.permissions.includes("automations.manage") ?? false;
  const [items, setItems] = useState<Workflow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AutomationStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId || !accessToken || !canRead) { setItems([]); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const result = await workflowService(workspaceId, accessToken).list({ search: query.trim(), status: status || undefined });
      setItems(result.items);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Workflows could not be loaded.");
    } finally { setLoading(false); }
  }, [accessToken, canRead, query, status, workspaceId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);

  const remove = async () => {
    if (!deleteTarget || !workspaceId || !accessToken) return;
    try { await workflowService(workspaceId, accessToken).remove(deleteTarget.id); setDeleteTarget(null); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Workflow could not be deleted."); }
  };
  const duplicate = (item: Workflow) => navigate("/workflows/create", { state: { duplicate: { ...item, name: `Copy of ${item.name}`, status: "DRAFT" } } });

  if (!canRead) return <AutomationShell><div className="flex h-full items-center justify-center p-6"><section className="max-w-md rounded-md border border-[var(--border)] bg-white p-8 text-center"><GitBranch className="mx-auto text-[var(--brand)]" size={28} /><h1 className="mt-4 text-lg font-semibold">Workflow access is restricted</h1><div className="mt-2 text-sm text-[var(--text-secondary)]">You do not have permission to view workflows in this workspace.</div></section></div></AutomationShell>;

  const empty = !loading && items.length === 0;
  return <AutomationShell><div data-testid="workflows-page" className="flex h-full min-h-0 flex-col overflow-hidden">
    <header className="flex flex-none flex-wrap items-center justify-between gap-4 border-b border-[var(--border-soft)] bg-white px-5 py-4 sm:px-8"><h1 className="text-[19px] font-medium leading-tight text-[var(--text-primary)]">Workflows</h1>{canManage && <Button type="button" onClick={() => navigate("/workflows/create")} className="h-9 text-xs"><Plus size={15} /> Create Workflow</Button>}</header>
    <div className="min-h-0 flex-1 overflow-hidden bg-[var(--page-background)]"><div className="mx-auto flex h-full min-h-0 max-w-[1400px] flex-col gap-4 px-5 py-4 sm:px-8">
      <div className="flex flex-wrap items-center gap-3"><div className="relative min-w-[220px] flex-1 sm:max-w-[360px]"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-[var(--text-muted)]" /><Input aria-label="Search Workflows" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Workflows" className="h-10 pl-9 text-xs" /></div><select aria-label="Filter by Status" value={status} onChange={(event) => setStatus(event.target.value as AutomationStatus | "")} className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-xs text-[var(--text-primary)] outline-none"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="PAUSED">Paused</option></select></div>
      {error && <div role="alert" className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-xs text-[var(--danger)]">{error}</div>}
      {empty ? <section className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-white p-8 text-center"><div><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><GitBranch size={22} /></div><h2 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">Build your first workflow</h2><div className="mx-auto mt-1.5 max-w-[400px] text-xs leading-5 text-[var(--text-secondary)]">Guide contacts through a reusable journey with messages, delays, conditions, and team handoffs.</div>{canManage && <Button type="button" onClick={() => navigate("/workflows/create")} className="mt-5 h-9 text-xs"><Plus size={15} /> Create Workflow</Button>}</div></section> : <section data-testid="workflows-table-panel" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-[0_3px_12px_rgba(30,40,55,.045)]"><div data-testid="workflows-table-scroll-region" className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[820px] border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-[#fafbfd] text-[12px] font-semibold text-[var(--text-primary)]"><tr className="border-b border-[var(--border)]"><th className="px-5 py-4">Name</th><th className="px-4 py-4">Triggered</th><th className="px-4 py-4">Steps</th><th className="px-4 py-4">Finished</th><th className="px-4 py-4">Modified on</th><th className="w-32 px-4 py-4">Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="p-10 text-center text-[var(--text-secondary)]">Loading workflows...</td></tr> : items.map((item) => <tr key={item.id} className="group border-b border-[var(--border-soft)] hover:bg-[var(--brand-soft)]/25"><td className="px-5 py-4"><button type="button" onClick={() => navigate(`/workflows/${item.id}`)} className="text-left"><div className="font-medium text-[var(--text-primary)]">{item.name}</div>{item.description && <div className="mt-0.5 max-w-[280px] truncate text-[11px] text-[var(--text-muted)]">{item.description}</div>}</button></td><td className="px-4 py-4 text-[var(--text-secondary)]">{item.enrolledCount.toLocaleString("en-IN")}</td><td className="px-4 py-4 text-[var(--text-secondary)]">{item.steps.length}</td><td className="px-4 py-4 text-[var(--text-secondary)]">{item.runCount.toLocaleString("en-IN")}</td><td className="px-4 py-4 text-[var(--text-secondary)]">{modifiedDate(item.updatedAt)}</td><td className="px-4 py-4"><div className="flex items-center gap-1"><button type="button" aria-label={`Delete ${item.name}`} onClick={() => setDeleteTarget(item)} disabled={!canManage} className="flex size-8 items-center justify-center rounded-md text-[var(--danger)] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={15} /></button><button type="button" aria-label={`Duplicate ${item.name}`} onClick={() => duplicate(item)} disabled={!canManage} className="flex size-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-40"><Copy size={15} /></button><button type="button" aria-label={`Edit ${item.name}`} onClick={() => navigate(`/workflows/${item.id}`)} className="flex size-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Pencil size={15} /></button></div></td></tr>)}</tbody></table></div><footer className="flex flex-none items-center justify-between border-t border-[var(--border-soft)] px-5 py-3 text-xs text-[var(--text-secondary)]"><span>{items.length} workflow{items.length === 1 ? "" : "s"}</span><span>Triggered counts enrollments · Finished counts completed runs</span></footer></section>}
    </div></div>
    <ConfirmationDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} title="Delete this workflow?" description={`“${deleteTarget?.name ?? ""}” will be permanently deleted.`} confirmLabel="Delete workflow" pendingLabel="Deleting..." tone="danger" onConfirm={remove} />
  </div></AutomationShell>;
}
