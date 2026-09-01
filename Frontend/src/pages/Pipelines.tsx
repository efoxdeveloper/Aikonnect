import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useDraggable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownUp, ContactRound, Filter, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { ContactDrawer, type CreateContactPayload } from "@/pages/ContactHub";
import type { ContactApiRecord, ContactCustomFieldDefinition, ContactListResponse } from "@/pages/contact.types";
import { toast } from "react-toastify";

const fallbackStages = ["New Lead", "Qualification", "Needs Analysis", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const stageTones = ["#f97360", "#22c55e", "#536dfe", "#e83e9f", "#a855f7", "#16a36a", "#d64545"];
type PipelineSortField = "createdAt" | "closureDeadline" | "name";
type PipelineSortDirection = "asc" | "desc";

function leadField(fields: ContactCustomFieldDefinition[]) {
  return fields.find((field) => field.key === "lead_status" || /sales status|lead status/i.test(field.label)) ?? null;
}

function LeadCard({ contact, onOpen }: { contact: ContactApiRecord; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: contact.id });
  const style = { transform: CSS.Translate.toString(transform) };
  return <article ref={setNodeRef} style={style} {...attributes} {...listeners} tabIndex={0} onDoubleClick={onOpen} className={`cursor-grab rounded-md border border-[var(--border)] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,20,.04)] transition-shadow hover:shadow-[0_4px_12px_rgba(16,24,20,.08)] active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`} aria-label={`${contact.name} lead card`}>
    <div className="flex items-start justify-between gap-2"><button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} className="text-left text-sm font-medium text-[var(--text-primary)] hover:text-[var(--brand)]">{contact.name}</button><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-deep)] text-[10px] font-semibold text-white">{contact.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span></div>
    <div className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]"><div>{contact.phone ?? "No phone number"}</div><div>{fieldValue(contact, ["company", "company_name"]) || "No company"}</div></div>
    <div className="mt-3 flex items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap gap-1">{contact.tags.slice(0, 2).map((tag) => <span key={tag.id} className="rounded-full bg-[var(--premium-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--premium)]">{tag.name}</span>)}</div><span className="text-[10px] text-[var(--text-muted)]">Open</span></div>
  </article>;
}

function fieldValue(contact: ContactApiRecord, keys: string[]) { const attrs = contact.customAttributes ?? {}; const key = keys.find((candidate) => attrs[candidate] !== undefined); return key ? String(attrs[key] ?? "") : ""; }

function closureDeadlineValue(contact: ContactApiRecord) {
  const attrs = contact.customAttributes ?? {};
  const key = Object.keys(attrs).find((candidate) => candidate.replace(/[\s_-]/g, "").toLowerCase() === "closuredeadline");
  const value = key ? attrs[key] : undefined;
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function comparePipelineContacts(left: ContactApiRecord, right: ContactApiRecord, field: PipelineSortField) {
  if (field === "name") return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  const leftValue = field === "createdAt" ? left.createdAt : closureDeadlineValue(left);
  const rightValue = field === "createdAt" ? right.createdAt : closureDeadlineValue(right);
  if (!leftValue && !rightValue) return 0;
  if (!leftValue) return 1;
  if (!rightValue) return -1;
  const leftTime = Date.parse(leftValue);
  const rightTime = Date.parse(rightValue);
  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return leftTime - rightTime;
  return leftValue.localeCompare(rightValue, undefined, { sensitivity: "base" });
}

function PipelineColumn({ stage, index, contacts, onOpen }: { stage: string; index: number; contacts: ContactApiRecord[]; onOpen: (contact: ContactApiRecord) => void; onAdd?: () => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage });
  return <section ref={setNodeRef} className={`flex h-full min-h-0 min-w-[250px] flex-1 flex-col border-l border-[var(--border-soft)] px-2.5 py-2.5 first:border-l-0 transition-colors ${isOver ? "bg-[var(--brand-soft)]/45" : ""}`}><div className="mb-3 flex-none rounded-sm border-t-2 px-3 py-2.5" style={{ borderTopColor: stageTones[index % stageTones.length], backgroundColor: `${stageTones[index % stageTones.length]}16` }}><h2 className="text-sm font-medium text-[var(--text-primary)]">{stage}</h2><div className="mt-0.5 text-xs text-[var(--text-secondary)]">{contacts.length} {contacts.length === 1 ? "contact" : "contacts"}</div></div><div data-testid={`pipeline-column-scroll-${index}`} className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-3">{contacts.length ? contacts.map((contact) => <LeadCard key={contact.id} contact={contact} onOpen={() => onOpen(contact)} />) : <div className="flex min-h-[100px] items-center justify-center text-sm text-[var(--text-secondary)]">No Contacts present</div>}</div></section>;
}

export function Pipelines() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const workspaceId = getActiveMembership(user)?.workspace.id;
  const [fields, setFields] = useState<ContactCustomFieldDefinition[]>([]);
  const [contacts, setContacts] = useState<ContactApiRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [sortField, setSortField] = useState<PipelineSortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<PipelineSortDirection>("desc");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const statusField = { key: "status", options: fallbackStages };
  const stages = fallbackStages;
  const visibleContacts = useMemo(() => {
    const filtered = contacts.filter((contact) => !query.trim() || `${contact.name} ${contact.phone ?? ""} ${contact.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
    return [...filtered].sort((left, right) => comparePipelineContacts(left, right, sortField) * (sortDirection === "asc" ? 1 : -1));
  }, [contacts, query, sortDirection, sortField]);

  useEffect(() => {
    if (!workspaceId || !accessToken) { setLoading(false); return; }
    let active = true;
    const headers = { authorization: `Bearer ${accessToken}` };
    setLoading(true); setError(null);
    void Promise.all([
      apiRequest<ContactCustomFieldDefinition[]>(`/workspaces/${workspaceId}/contacts/custom-fields`, { headers }),
      apiRequest<ContactListResponse>(`/workspaces/${workspaceId}/contacts?page=1&pageSize=100&sortBy=createdAt&sortOrder=desc`, { headers }),
    ]).then(([nextFields, result]) => { if (!active) return; setFields(nextFields); setContacts(result.items); }).catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Unable to load pipeline contacts."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, refreshVersion, workspaceId]);

  const createContact = async (contact: CreateContactPayload) => {
    if (!workspaceId || !accessToken) throw new Error("A workspace is required.");
    await apiRequest(`/workspaces/${workspaceId}/contacts`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        ...contact,
        whatsappId: contact.whatsappId || null,
        profileName: contact.profileName || null,
        email: contact.email === "-" ? "" : contact.email,
      }),
    });
    setCreateOpen(false);
    setRefreshVersion((value) => value + 1);
    toast.success("Contact created successfully.");
  };

  const grouped = (stage: string) => visibleContacts.filter((contact) => contact.status === stage);
  const moveContact = async ({ active: activeItem, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || activeItem.id === over.id) return;
    const contact = contacts.find(({ id }) => id === activeItem.id);
    const targetStage = stages.find((stage) => stage === String(over.id));
    if (!contact || !targetStage || !workspaceId || !accessToken) return;
    const previous = contacts;
    setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, status: targetStage } : item));
    try { await apiRequest(`/workspaces/${workspaceId}/contacts/${contact.id}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ status: targetStage }) }); } catch (caught) { setContacts(previous); setError(caught instanceof ApiError ? caught.message : "The lead stage could not be updated."); }
  };

  return <div data-testid="pipelines-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]">
    <header data-testid="pipelines-page-header" className="flex-none border-b border-[var(--border)] bg-white"><div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"><div className="flex min-w-0 items-center gap-3"><div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-dark)] text-white"><ContactRound size={21} /></div><div className="min-w-0"><h1 className="text-[18px] font-medium leading-6 text-[var(--text-primary)]">Sales Pipelines</h1><div className="mt-0.5 truncate text-[14px] text-[var(--text-body)]">You can track and manage your Contacts (Leads) at all stages of your sales cycle here</div></div></div><button type="button" onClick={() => setCreateOpen(true)} className="hidden h-10 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-sm font-medium text-white hover:bg-[var(--brand-hover)] sm:flex"><Plus size={16} /> Add Contact</button></div></header>
    <main className="min-h-0 flex-1 overflow-hidden"><div className="mx-auto flex h-full min-h-0 max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[180px] flex-1 sm:max-w-[280px]"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" /><Input aria-label="Search pipeline contacts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts" className="h-10 pl-9 text-[13px]" /></div>
        <Select value={sortField} onValueChange={(value) => setSortField(value as PipelineSortField)}><SelectTrigger aria-label="Sort contacts by" className="h-10 w-auto min-w-[180px] gap-2 text-sm"><SlidersHorizontal size={15} /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="createdAt">Contact Creation Date</SelectItem><SelectItem value="closureDeadline">Closure Deadline</SelectItem><SelectItem value="name">Contact Name</SelectItem></SelectContent></Select>
        <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as PipelineSortDirection)}><SelectTrigger aria-label="Sort direction" className="h-10 w-auto min-w-[132px] gap-2 text-sm"><ArrowDownUp size={15} /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="asc">Ascending</SelectItem><SelectItem value="desc">Descending</SelectItem></SelectContent></Select>
        <button type="button" className="flex h-10 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-white px-3 text-sm text-[var(--text-body)]"><Filter size={15} /> Filters</button><button type="button" aria-label="Manage pipeline stages" onClick={() => navigate("/contacts")} className="flex h-10 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-white px-3 text-sm text-[var(--text-body)]"><ContactRound size={15} /> Account Owner</button>
      </div>{error && <div role="alert" className="rounded-md border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>}{!loading && !statusField ? <section className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-white p-8 text-center"><div><ContactRound className="mx-auto text-[var(--brand)]" size={30} /><h2 className="mt-3 text-base font-medium text-[var(--text-primary)]">Set up a sales status field</h2><p className="mt-1 max-w-[420px]">Create a custom select field named “Sales Status” or “Lead status” in Contacts to use this pipeline.</p><button type="button" onClick={() => navigate("/contacts")} className="mt-4 h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white">Open Contacts</button></div></section> : <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active: item }) => setActiveId(String(item.id))} onDragCancel={() => setActiveId(null)} onDragEnd={moveContact}><div data-testid="pipeline-kanban-scroll-region" className="min-h-0 flex-1 overflow-auto"><div data-testid="pipeline-kanban-surface" className="flex min-w-[1320px] gap-0 rounded-md border border-[var(--border)] bg-white p-2 shadow-[0_1px_2px_rgba(16,24,20,.04)]"><div className="flex min-w-full pb-4">{stages.map((stage, index) => <PipelineColumn key={stage} stage={stage} index={index} contacts={loading ? [] : grouped(stage)} onOpen={(contact) => navigate(`/contacts/${contact.id}`)} onAdd={() => setCreateOpen(true)} />)}</div></div></div><DragOverlay>{activeId ? <div className="w-[250px] rotate-1 rounded-md border border-[var(--brand)] bg-white p-3 shadow-[0_12px_30px_rgba(16,24,20,.16)]">{contacts.find(({ id }) => id === activeId)?.name}</div> : null}</DragOverlay></DndContext>}{!loading && statusField && <footer className="flex flex-none items-center justify-between border-t border-[var(--border-soft)] py-3 text-xs text-[var(--text-secondary)]"><span>Showing {visibleContacts.length} of {contacts.length} lead contacts</span><span>Drag a contact to update its sales stage.</span></footer>}<ContactDrawer open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createContact} customFields={fields} /></div></main>
  </div>;
}
