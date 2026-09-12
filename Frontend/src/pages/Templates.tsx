import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FileText, Flag, Info, Pencil, Plus, RefreshCw, Search, Tag, Trash2, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { cn } from "@/lib/utils";

type TemplateTab = "library" | "active" | "deleted";
type TemplateStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "DELETED";
type TemplateRecord = { id: string; name: string; key: string; status: TemplateStatus; metaStatus?: string | null; metaTemplateId?: string | null; category: string; language: string; templateType: string; headerText?: string | null; headerFileName?: string | null; body: string; footer: string | null; createdBy: string; createdAt: string; updatedAt: string };
type TemplateListResponse = { items: TemplateRecord[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type TemplateSyncResponse = { imported: number; wabaId: string; debug?: { tokenSource?: string; pages?: number; remoteCount?: number; importedCount?: number; categories?: Record<string, number> } };
const tabs: Array<{ id: TemplateTab; label: string }> = [{ id: "library", label: "Template Library" }, { id: "active", label: "Active" }, { id: "deleted", label: "Deleted" }];

function TemplatesHeader({ onCreate }: { onCreate: () => void }) { return <header data-testid="templates-page-header" className="flex-none border-b border-[var(--border)] bg-white"><div className="mx-auto flex min-h-[78px] max-w-[1400px] items-center justify-between gap-4 px-5 py-3 sm:px-8"><div className="flex min-w-0 items-center gap-4"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-[0_3px_8px_rgba(17,107,111,.15)]"><FileText size={19} /></div><div className="min-w-0"><h1 className="text-[17px] font-semibold leading-tight text-[var(--text-primary)]">Templates</h1><div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">Managing WhatsApp Templates</div></div></div><Button onClick={onCreate} className="h-10 shrink-0 bg-[var(--brand)] px-4 text-[14px] hover:bg-[var(--brand-hover)]"><Plus size={17} /> New Template</Button></div></header>; }
function TemplateTabs({ activeTab, onChange }: { activeTab: TemplateTab; onChange: (tab: TemplateTab) => void }) { return <div role="tablist" aria-label="Template views" className="flex min-h-[54px] overflow-hidden rounded-md border border-[var(--border)] bg-white">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => onChange(tab.id)} className={cn("relative flex min-w-[140px] flex-1 items-center justify-center px-4 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft)] sm:min-w-0", activeTab === tab.id && "bg-[var(--brand-soft)] text-[var(--brand)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--brand)]")}>{tab.label}</button>)}</div>; }
function TemplateToolbar({ query, onQueryChange, status, onStatusChange, category, onCategoryChange }: { query: string; onQueryChange: (value: string) => void; status: string; onStatusChange: (value: string) => void; category: string; onCategoryChange: (value: string) => void }) {
  return <div className="flex flex-wrap items-center gap-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-[var(--text-primary)]" /><Input aria-label="Search templates" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search a template by name" className="h-10 w-[280px] pl-9 text-[13px]" /></div><label className="flex h-10 items-center gap-1.5 px-2 text-[13px] text-[var(--text-secondary)]"><Flag size={15} /><span>Status</span><select aria-label="Filter templates by status" value={status} onChange={(event) => onStatusChange(event.target.value)} className="h-8 rounded border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"><option value="">All</option><option value="DRAFT">Draft</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label><label className="flex h-10 items-center gap-1.5 px-2 text-[13px] text-[var(--text-secondary)]"><Tag size={15} /><span>Category</span><select aria-label="Filter templates by category" value={category} onChange={(event) => onCategoryChange(event.target.value)} className="h-8 rounded border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"><option value="">All</option><option value="Marketing">Marketing</option><option value="Utility">Utility</option><option value="Authentication">Authentication</option></select></label></div>;
}
function SyncNotice({ onSync, syncing }: { onSync: () => void; syncing: boolean }) { return <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 rounded-md border border-[var(--accent-amber)]/45 bg-[var(--accent-amber-soft)]/35 px-2.5 py-2 text-[13px] text-[var(--accent-amber)]"><Info size={17} /><span>Meta is the source of truth for submitted WhatsApp templates.</span></div><Button variant="outline" size="sm" onClick={onSync} disabled={syncing} className="h-10 border-[var(--brand)]/25 bg-[var(--brand-soft)] text-[var(--brand)] hover:bg-[var(--brand-soft)]"><RefreshCw className={cn(syncing && "animate-spin")} size={17} /> {syncing ? "Syncing from Meta" : "Sync from Meta"}</Button></div>; }
function statusLabel(status: TemplateStatus) { return status.charAt(0) + status.slice(1).toLowerCase(); }

function ActiveTemplatesTable({ templates, onEdit, onDelete, onRestore }: { templates: TemplateRecord[]; onEdit: (template: TemplateRecord) => void; onDelete: (template: TemplateRecord) => void; onRestore: (template: TemplateRecord) => void }) {
  return <section data-testid="templates-table-panel" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--border)] bg-white"><div data-testid="templates-table-scroll-region" className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[900px] border-collapse text-left"><thead className="sticky top-0 z-10 bg-[#fafbfd] text-[13px] font-semibold text-[var(--text-primary)]"><tr className="border-b border-[var(--border)]"><th className="px-6 py-4">Template Name</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Category</th><th className="px-5 py-4">Language(s)</th><th className="px-5 py-4">Created By</th><th className="w-28 px-5 py-4"><span className="sr-only">Actions</span></th></tr></thead><tbody>{templates.map((template) => <tr key={template.id} className="group border-b border-[var(--border-soft)] text-[14px] last:border-b-0 hover:bg-[var(--brand-soft)]/30"><td className="px-6 py-4"><div className="font-medium text-[var(--text-primary)]">{template.name}</div><div className="mt-0.5 flex items-center gap-1 text-[12px] text-[var(--text-muted)]">{template.key}<button type="button" aria-label={`Copy ${template.key}`} onClick={() => void navigator.clipboard?.writeText(template.key)} className="text-[var(--text-muted)] hover:text-[var(--brand)]"><Copy size={12} /></button>{template.metaTemplateId && <span className="rounded-full bg-[var(--brand-soft)] px-1.5 py-0.5 text-[9px] text-[var(--brand)]">Meta</span>}</div></td><td className="px-5 py-4"><span className="inline-flex items-center gap-2 text-[var(--text-primary)]"><span className={cn("size-2 rounded-full", template.status === "APPROVED" ? "bg-[var(--success)]" : template.status === "REJECTED" || template.status === "DELETED" ? "bg-[var(--danger)]" : "bg-[var(--warning)]")} />{statusLabel(template.status)}{template.metaStatus && template.metaStatus !== template.status && <span className="text-[10px] text-[var(--text-muted)]">({template.metaStatus.toLowerCase().replace(/_/g, " ")})</span>}</span></td><td className="px-5 py-4">{template.category}</td><td className="px-5 py-4">{template.language}</td><td className="px-5 py-4">{template.createdBy}</td><td className="px-5 py-4"><div data-testid={`template-row-actions-${template.key}`} className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-white px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><button type="button" aria-label={`Edit ${template.name}`} onClick={() => onEdit(template)} className="flex size-7 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Pencil size={15} /></button>{template.status === "DELETED" ? <button type="button" aria-label={`Restore ${template.name}`} onClick={() => onRestore(template)} className="flex size-7 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><RotateCcw size={15} /></button> : <button type="button" aria-label={`Delete ${template.name}`} onClick={() => onDelete(template)} className="flex size-7 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-red-50 hover:text-[var(--danger)]"><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table>{templates.length === 0 && <div className="flex min-h-[220px] items-center justify-center text-[13px] text-[var(--text-secondary)]">No templates found.</div>}</div><div className="flex flex-none items-center justify-between border-t border-[var(--border-soft)] px-6 py-3 text-[12px] text-[var(--text-secondary)]"><span>Total templates: <strong className="text-[var(--text-primary)]">{templates.length}</strong></span><span>Showing {templates.length} of {templates.length}</span></div></section>;
}
export function Templates() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const workspaceId = getActiveMembership(user)?.workspace.id;
  const [activeTab, setActiveTab] = useState<TemplateTab>("library");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [syncResult, setSyncResult] = useState("");
  const [templateToDelete, setTemplateToDelete] = useState<TemplateRecord | null>(null);
  const loadTemplates = useCallback(async (showSync = false) => {
    if (!workspaceId || !accessToken) { setTemplates([]); setLoading(false); return; }
    if (showSync) setSyncing(true); else setLoading(true);
    setError("");
    try { const result = await apiRequest<TemplateListResponse>(`/workspaces/${workspaceId}/templates?status=all&search=${encodeURIComponent(query)}`, { headers: { authorization: `Bearer ${accessToken}` } }); setTemplates(result.items); }
    catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load templates."); }
    finally { setLoading(false); setSyncing(false); }
  }, [accessToken, query, workspaceId]);
  const syncTemplates = async () => {
    if (!workspaceId || !accessToken || syncing) return;
    setSyncing(true);
    setError("");
    setSyncResult("");
    try {
      const result = await apiRequest<TemplateSyncResponse>(`/workspaces/${workspaceId}/templates/sync`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
      const categories = Object.entries(result.debug?.categories ?? {}).map(([category, count]) => `${category}: ${count}`).join(", ");
      setSyncResult(result.imported === 0
        ? `Meta returned 0 templates. WABA ${result.wabaId}; token: ${result.debug?.tokenSource ?? "unknown"}; pages: ${result.debug?.pages ?? 0}. Verify this WABA owns the templates and the token has whatsapp_business_management.`
        : `Synced ${result.imported} template${result.imported === 1 ? "" : "s"} from Meta. WABA ${result.wabaId}; token: ${result.debug?.tokenSource ?? "unknown"}; pages: ${result.debug?.pages ?? 0}${categories ? `; ${categories}` : ""}.`);
      await loadTemplates();
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        const details = caughtError.details && typeof caughtError.details === "object" && !Array.isArray(caughtError.details) ? caughtError.details as Record<string, unknown> : {};
        const debug = [
          typeof details.wabaId === "string" ? `WABA ${details.wabaId}` : "",
          typeof details.tokenSource === "string" ? `token: ${details.tokenSource}` : "",
          typeof details.providerCode === "number" ? `Meta code: ${details.providerCode}` : "",
          typeof details.providerSubcode === "number" ? `Meta subcode: ${details.providerSubcode}` : "",
          typeof details.diagnosis === "string" ? details.diagnosis : "",
        ].filter(Boolean).join("; ");
        setError(`${caughtError.message}${debug ? ` [Debug: ${debug}]` : ""}`);
      } else {
        setError("Unable to sync templates from Meta.");
      }
    } finally {
      setSyncing(false);
    }
  };
  useEffect(() => { void loadTemplates(); }, [loadTemplates]);
  const visibleTemplates = useMemo(() => { const matches = templates.filter((template) => (template.name.toLowerCase().includes(query.toLowerCase()) || template.key.toLowerCase().includes(query.toLowerCase())) && (!statusFilter || template.status === statusFilter) && (!categoryFilter || template.category === categoryFilter)); if (activeTab === "deleted") return matches.filter((template) => template.status === "DELETED"); return matches.filter((template) => template.status !== "DELETED"); }, [activeTab, categoryFilter, query, statusFilter, templates]);
  const updateStatus = async (template: TemplateRecord, action: "delete" | "restore") => { if (!workspaceId || !accessToken) return; try { await apiRequest(action === "delete" ? `/workspaces/${workspaceId}/templates/${template.id}` : `/workspaces/${workspaceId}/templates/${template.id}/restore`, { method: action === "delete" ? "DELETE" : "POST", headers: { authorization: `Bearer ${accessToken}` } }); await loadTemplates(true); } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update this template."); } };
  return <><div data-testid="templates-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-white"><TemplatesHeader onCreate={() => navigate("/createtemplate")} /><main className="min-h-0 flex-1 overflow-hidden bg-white"><div className="mx-auto flex h-full min-h-0 max-w-[1400px] flex-col gap-4 px-5 py-4 sm:px-8"><TemplateTabs activeTab={activeTab} onChange={setActiveTab} /><SyncNotice onSync={() => void syncTemplates()} syncing={syncing} /><TemplateToolbar query={query} onQueryChange={setQuery} status={statusFilter} onStatusChange={setStatusFilter} category={categoryFilter} onCategoryChange={setCategoryFilter} />{syncResult && <div role="status" className="rounded-md border border-[var(--brand)]/20 bg-[var(--brand-soft)] px-4 py-3 text-[12px] text-[var(--brand)]">{syncResult}</div>}{error && <div role="alert" className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-[var(--danger)]">{error}</div>}{loading ? <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-[var(--border)] bg-white text-[13px] text-[var(--text-secondary)]">Loading templates...</div> : <ActiveTemplatesTable templates={visibleTemplates} onEdit={(template) => navigate(`/createtemplate?templateId=${template.id}`)} onDelete={setTemplateToDelete} onRestore={(template) => void updateStatus(template, "restore")} />}</div></main></div><ConfirmationDialog open={Boolean(templateToDelete)} onOpenChange={(open) => { if (!open) setTemplateToDelete(null); }} title="Delete this template?" description={`The template “${templateToDelete?.name ?? ""}” will be moved to Deleted and can be restored later.`} confirmLabel="Delete template" pendingLabel="Deleting..." tone="danger" onConfirm={() => templateToDelete ? updateStatus(templateToDelete, "delete") : Promise.resolve()} /></>;
}
