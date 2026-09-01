import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Check, CheckCircle2, Circle, Clock3, ListTodo, Plus, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerCloseButton, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { cn } from "@/lib/utils";

type TaskStatus = "OPEN" | "COMPLETED";
type TaskActor = { id: string; firstName: string; lastName: string; email: string } | null;
type TaskContact = { id: string; name: string; phone: string | null };
type TaskRecord = { id: string; title: string; description: string | null; dueAt: string | null; status: TaskStatus; createdAt: string; completedAt: string | null; contact: TaskContact; createdBy: TaskActor };
type TaskResponse = { items: TaskRecord[]; pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean } };
type ContactOption = { id: string; name: string; phone: string | null };

function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function isOverdue(task: TaskRecord) {
  return task.status === "OPEN" && Boolean(task.dueAt) && new Date(task.dueAt as string).getTime() < Date.now();
}

function actorLabel(actor: TaskActor) {
  return actor ? `${actor.firstName} ${actor.lastName}`.trim() || actor.email : "Unknown user";
}

function TaskDialog({ open, onOpenChange, contacts, workspaceId, accessToken, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; contacts: ContactOption[]; workspaceId: string; accessToken: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [contactId, setContactId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) { setTitle(""); setDescription(""); setDueAt(""); setContactId(""); setError(""); }
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !contactId) return;
    setSaving(true); setError("");
    try {
      await apiRequest(`/workspaces/${workspaceId}/contacts/${contactId}/tasks`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, dueAt: dueAt ? new Date(dueAt).toISOString() : null }) });
      onOpenChange(false); onCreated(); toast.success("Task created successfully.");
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Task could not be created.";
      setError(message); toast.error(message);
    } finally { setSaving(false); }
  };

  return <Drawer open={open} onOpenChange={onOpenChange} direction="right"><DrawerContent className="h-full max-h-screen border-l border-[var(--border)] data-[vaul-drawer-direction=right]:max-w-[520px]"><DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] bg-[var(--brand-soft)]/35 pr-14"><DrawerTitle>Create task</DrawerTitle><DrawerDescription>Create a follow-up and link it to a contact.</DrawerDescription><DrawerCloseButton /></DrawerHeader><form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">{error && <div role="alert" className="rounded-md border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">{error}</div>}<div><label htmlFor="task-page-title" className="mb-2 block text-xs font-medium text-[var(--text-body)]">Task title <span className="text-red-500">*</span></label><Input id="task-page-title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Follow up on pricing" /></div><div><label htmlFor="task-page-contact" className="mb-2 block text-xs font-medium text-[var(--text-body)]">Contact <span className="text-red-500">*</span></label><Select value={contactId} onValueChange={setContactId} required><SelectTrigger id="task-page-contact" aria-label="Contact" className="h-10"><SelectValue placeholder="Select a contact" /></SelectTrigger><SelectContent>{contacts.map((contact) => <SelectItem key={contact.id} value={contact.id}>{contact.name}{contact.phone ? ` · ${contact.phone}` : ""}</SelectItem>)}</SelectContent></Select></div><div><label htmlFor="task-page-due" className="mb-2 block text-xs font-medium text-[var(--text-body)]">Due date <span className="font-normal text-[var(--text-muted)]">(optional)</span></label><Input id="task-page-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div><div><label htmlFor="task-page-description" className="mb-2 block text-xs font-medium text-[var(--text-body)]">Description <span className="font-normal text-[var(--text-muted)]">(optional)</span></label><textarea id="task-page-description" maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context for the follow-up" className="min-h-28 w-full resize-y rounded-md border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--text-muted)] focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]/10" /></div></div><DrawerFooter className="flex-none flex-row justify-end border-t border-[var(--border-soft)] bg-white px-5 py-4"><DrawerClose asChild><Button type="button" variant="outline">Cancel</Button></DrawerClose><Button type="submit" disabled={saving || !title.trim() || !contactId}>{saving ? "Creating…" : "Create task"}</Button></DrawerFooter></form></DrawerContent></Drawer>;
}

export function Tasks() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canRead = membership?.role.permissions.includes("contacts.read") ?? false;
  const canUpdate = membership?.role.permissions.includes("contacts.update") ?? false;
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !accessToken || !canRead) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError("");
    const headers = { authorization: `Bearer ${accessToken}` };
    void Promise.all([
      apiRequest<TaskResponse>(`/workspaces/${workspaceId}/contacts/tasks?page=1&pageSize=100&status=${status}&search=${encodeURIComponent(query.trim())}`, { headers }),
      apiRequest<{ items: ContactOption[] }>(`/workspaces/${workspaceId}/contacts?page=1&pageSize=100&sortBy=name&sortOrder=asc`, { headers }),
    ]).then(([taskResult, contactResult]) => { if (!active) return; setTasks(taskResult.items); setContacts(contactResult.items); }).catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Tasks could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, canRead, query, refreshVersion, status, workspaceId]);

  const overdueCount = useMemo(() => tasks.filter(isOverdue).length, [tasks]);

  const toggleTask = async (task: TaskRecord) => {
    if (!workspaceId || !accessToken || !canUpdate) return;
    setUpdatingId(task.id); setError("");
    try { await apiRequest(`/workspaces/${workspaceId}/contacts/${task.contact.id}/tasks/${task.id}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ status: task.status === "OPEN" ? "COMPLETED" : "OPEN" }) }); setRefreshVersion((value) => value + 1); toast.success(task.status === "OPEN" ? "Task completed." : "Task reopened."); }
    catch (caught) { const message = caught instanceof ApiError ? caught.message : "Task could not be updated."; setError(message); toast.error(message); }
    finally { setUpdatingId(null); }
  };

  const statusLabel = status === "all" ? "All tasks" : status === "OPEN" ? "Open" : "Completed";
  if (!canRead) return <div data-testid="tasks-page" className="flex h-full min-h-0 items-center justify-center bg-[var(--page-background)] p-6"><div className="rounded-md border border-[var(--border)] bg-white p-8 text-center"><ListTodo className="mx-auto text-[var(--brand)]" size={28} /><h1 className="mt-3 text-base font-semibold text-[var(--text-primary)]">Tasks</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">You do not have permission to view tasks.</p></div></div>;

  return <div data-testid="tasks-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]"><header data-testid="tasks-page-header" className="flex flex-none flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-white px-5 py-4 sm:px-8"><h1 className="text-[19px] font-medium leading-tight text-[var(--text-primary)]">Tasks</h1>{canUpdate && <Button type="button" onClick={() => setDialogOpen(true)} className="h-10"><Plus size={16} /> Add Task</Button>}</header><main className="min-h-0 flex-1 overflow-hidden"><div className="mx-auto flex h-full min-h-0 max-w-[1400px] flex-col gap-4 px-5 py-4 sm:px-8"><section aria-label="Task summary" className="grid flex-none grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-md border border-[var(--border)] bg-white p-4"><div className="flex items-center justify-between text-xs text-[var(--text-secondary)]"><span>Total tasks</span><ListTodo size={16} className="text-[var(--brand)]" /></div><div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{tasks.length}</div></div><div className="rounded-md border border-[var(--border)] bg-white p-4"><div className="flex items-center justify-between text-xs text-[var(--text-secondary)]"><span>Open</span><Circle size={16} className="text-[var(--brand)]" /></div><div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{tasks.filter((task) => task.status === "OPEN").length}</div></div><div className="rounded-md border border-[var(--border)] bg-white p-4"><div className="flex items-center justify-between text-xs text-[var(--text-secondary)]"><span>Overdue</span><Clock3 size={16} className="text-[var(--warning)]" /></div><div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{overdueCount}</div></div><div className="rounded-md border border-[var(--border)] bg-white p-4"><div className="flex items-center justify-between text-xs text-[var(--text-secondary)]"><span>Completed</span><CheckCircle2 size={16} className="text-[var(--success)]" /></div><div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{tasks.filter((task) => task.status === "COMPLETED").length}</div></div></section><div className="flex flex-none flex-wrap items-center gap-3"><div className="relative min-w-[220px] flex-1 sm:max-w-[360px]"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" /><Input aria-label="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks or contacts" className="h-10 pl-9 text-xs" /></div><Select value={status} onValueChange={(value) => setStatus(value as "all" | TaskStatus)}><SelectTrigger aria-label="Filter tasks by status" className="h-10 w-auto min-w-[140px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All tasks</SelectItem><SelectItem value="OPEN">Open</SelectItem><SelectItem value="COMPLETED">Completed</SelectItem></SelectContent></Select></div>{error && <div role="alert" className="flex flex-none items-center justify-between gap-3 rounded-md border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"><span>{error}</span><button type="button" aria-label="Dismiss task error" onClick={() => setError("")}><X size={16} /></button></div>}<section data-testid="tasks-table-panel" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(16,24,20,.04)]"><div data-testid="tasks-table-scroll-region" className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-[#f8faf9] text-xs font-medium text-[var(--text-secondary)]"><tr className="border-b border-[var(--border-soft)]"><th className="w-[34%] px-5 py-3.5">Task</th><th className="w-[23%] px-4 py-3.5">Contact</th><th className="w-[19%] px-4 py-3.5">Due date</th><th className="w-[14%] px-4 py-3.5">Created by</th><th className="w-[10%] px-4 py-3.5 text-right">Status</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="p-12 text-center text-xs text-[var(--text-secondary)]"><span role="status">Loading tasks…</span></td></tr> : tasks.length ? tasks.map((task) => <tr key={task.id} className="border-b border-[var(--border-soft)] last:border-b-0 hover:bg-[var(--brand-soft)]/25"><td className="px-5 py-3.5 align-middle"><div className="flex items-start gap-3"><button type="button" aria-label={`${task.status === "OPEN" ? "Complete" : "Reopen"} ${task.title}`} disabled={!canUpdate || updatingId === task.id} onClick={() => void toggleTask(task)} className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors", task.status === "COMPLETED" ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--border-strong)] text-transparent hover:border-[var(--brand)]", "disabled:cursor-not-allowed disabled:opacity-50")}>{task.status === "COMPLETED" && <Check size={13} />}</button><div className="min-w-0"><div className={cn("font-medium text-[var(--text-primary)]", task.status === "COMPLETED" && "text-[var(--text-muted)] line-through")}>{task.title}</div>{task.description && <div className="mt-0.5 max-w-[360px] truncate text-xs text-[var(--text-secondary)]">{task.description}</div>}</div></div></td><td className="px-4 py-3.5 align-middle"><button type="button" onClick={() => navigate(`/contacts/${task.contact.id}`)} className="text-left font-medium text-[var(--text-primary)] hover:text-[var(--brand)]">{task.contact.name}</button>{task.contact.phone && <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{task.contact.phone}</div>}</td><td className={cn("px-4 py-3.5 align-middle text-xs", isOverdue(task) ? "font-medium text-[var(--danger)]" : "text-[var(--text-secondary)]")}><span className="inline-flex items-center gap-1.5"><CalendarClock size={14} />{isOverdue(task) ? `Overdue · ${formatDate(task.dueAt)}` : formatDate(task.dueAt)}</span></td><td className="px-4 py-3.5 align-middle text-xs text-[var(--text-secondary)]">{actorLabel(task.createdBy)}</td><td className="px-4 py-3.5 text-right align-middle"><span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium", task.status === "COMPLETED" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--brand-soft)] text-[var(--brand)]")}>{task.status === "COMPLETED" ? "Completed" : "Open"}</span></td></tr>) : <tr><td colSpan={5} className="p-14 text-center"><ListTodo className="mx-auto text-[var(--text-muted)]" size={28} /><div className="mt-3 text-sm font-medium text-[var(--text-primary)]">No {statusLabel.toLowerCase()} found</div><div className="mt-1 text-xs text-[var(--text-secondary)]">Create a task to keep your next follow-up visible.</div>{canUpdate && <Button type="button" onClick={() => setDialogOpen(true)} variant="outline" className="mt-4 h-9 text-xs"><Plus size={15} /> Add Task</Button>}</td></tr>}</tbody></table></div><footer className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-[var(--border-soft)] px-5 py-3 text-xs text-[var(--text-secondary)]"><span>{tasks.length} task{tasks.length === 1 ? "" : "s"}</span><span>Open tasks are sorted by due date.</span></footer></section></div></main>{workspaceId && accessToken && <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} contacts={contacts} workspaceId={workspaceId} accessToken={accessToken} onCreated={() => setRefreshVersion((value) => value + 1)} />}</div>;
}
