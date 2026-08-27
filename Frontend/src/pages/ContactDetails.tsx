import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, CalendarClock, CheckSquare, CircleUserRound, Clock3, FileText, MessageCircle, MessagesSquare, NotebookPen, Pencil, PhoneCall, Plus, Settings2, Trash2, Upload, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { InternationalPhoneInput } from "@/components/ui/international-phone-input";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactCustomFieldInput } from "@/pages/ContactCustomFieldInput";
import { ContactCustomFieldsDialog } from "@/pages/ContactCustomFieldsDialog";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getActiveMembership } from "@/lib/workspace";
import type { ContactApiRecord, ContactCustomFieldDefinition } from "@/pages/contact.types";

type DetailTab = "timeline" | "tasks" | "documents" | "notes" | "calls";
type Actor = { id: string; firstName: string; lastName: string; email: string } | null;
type ContactTask = { id: string; title: string; description: string | null; dueAt: string | null; status: "OPEN" | "COMPLETED"; createdAt: string; completedAt: string | null; createdBy: Actor };
type ContactNote = { id: string; title: string; content: string; createdAt: string; updatedAt: string; createdBy: Actor };
type ConversationMessage = { id: string; conversationId: string; direction: "INCOMING" | "OUTGOING"; type: string; status: string; text: string | null; sentAt: string; metaMessageId: string | null };
type ContactHistory = { conversations: unknown[]; messages: ConversationMessage[] };
type Paged<T> = { items: T[]; pagination: { total: number } };
type EditableContactField = "name" | "phone" | "whatsappId" | "profileName" | "email" | "source" | "tags" | "whatsappOpted" | "marketingBlocked";
type ContactEditDraft = { name: string; phone: string; whatsappId: string; profileName: string; email: string; source: string; tags: string; whatsappOpted: boolean; whatsappConsentSource: string; whatsappConsentAt: string; marketingBlocked: boolean; marketingBlockSource: string; marketingBlockReason: string; customAttributes: Record<string, unknown> };

const detailTabs: Array<{ id: DetailTab; label: string; icon: typeof Clock3 }> = [
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "calls", label: "Call Log", icon: PhoneCall },
];

function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function actorName(actor: Actor) { return actor ? `${actor.firstName} ${actor.lastName}`.trim() || actor.email : "Unknown user"; }
function customValueLabel(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function toDateTimeLocal(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}
function draftFromContact(contact: ContactApiRecord): ContactEditDraft {
  return {
    name: contact.name, phone: contact.phone ?? "", whatsappId: contact.whatsappId ?? "", profileName: contact.profileName ?? "",
    email: contact.email ?? "", source: contact.source, tags: contact.tags.map(({ name }) => name).join(", "),
    whatsappOpted: contact.whatsappOpted,
    whatsappConsentSource: (contact.whatsappOpted ? contact.whatsappOptInSource : contact.whatsappOptOutSource) ?? "Manual",
    whatsappConsentAt: toDateTimeLocal(contact.whatsappOpted ? contact.whatsappOptedInAt : contact.whatsappOptedOutAt),
    marketingBlocked: contact.marketingBlocked,
    marketingBlockSource: contact.marketingBlockSource ?? "Manual",
    marketingBlockReason: contact.marketingBlockReason ?? "",
    customAttributes: { ...(contact.customAttributes ?? {}) },
  };
}

function DetailField({ label, value, editable, editing, onEdit, children }: { label: string; value: ReactNode; editable?: boolean; editing?: boolean; onEdit?: () => void; children?: ReactNode }) {
  return <div className="group border-b border-[var(--border-soft)] px-4 py-3 last:border-0"><div className="flex min-h-6 items-center justify-between gap-2"><dt className="text-[11px] font-medium text-[var(--text-muted)]">{label}</dt>{editable && !editing && <button type="button" aria-label={`Edit ${label}`} onClick={onEdit} className="flex size-7 items-center justify-center rounded-md text-[var(--brand)] opacity-0 transition-opacity hover:bg-[var(--brand-soft)] focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"><Pencil size={13} /></button>}</div>{editing ? <dd className="mt-1">{children}</dd> : <dd className="break-words text-xs font-medium text-[var(--text-primary)]">{value || "—"}</dd>}</div>;
}

function FormDialog({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45" /><Dialog.Content className="fixed left-1/2 top-1/2 z-[121] flex max-h-[calc(100vh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_24px_70px_rgba(15,23,42,.24)]"><header className="flex flex-none items-center justify-between border-b border-[var(--border)] px-5 py-4"><Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title><Dialog.Close asChild><button type="button" aria-label={`Close ${title}`} className="flex size-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]"><X size={16} /></button></Dialog.Close></header>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Clock3; title: string; description: string }) {
  return <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-6 text-center"><div className="flex size-11 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Icon size={20} /></div><h2 className="mt-3 text-sm font-medium">{title}</h2><p className="mt-1">{description}</p></div>;
}

function ContactDetailsHeader({ onBack }: { onBack: () => void }) {
  return <div className="flex flex-none items-center gap-2 border-b border-[var(--border)] px-4 py-3"><button type="button" aria-label="Back to contacts" onClick={onBack} className="flex size-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><ArrowLeft size={18} /></button><h3>Contact Details</h3></div>;
}

function ContactDetailsSkeleton({ onBack }: { onBack: () => void }) {
  return <div role="status" aria-label="Loading contact details" data-testid="contact-details-skeleton" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)] lg:flex-row"><span className="sr-only">Loading contact details</span><aside className="flex max-h-[46%] min-h-0 flex-none flex-col border-b border-[var(--border)] bg-white lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r"><ContactDetailsHeader onBack={onBack} /><div className="min-h-0 flex-1 overflow-hidden p-4"><section className="rounded-lg border border-[var(--border)] p-4"><div className="flex items-start justify-between"><div className="space-y-2"><Skeleton className="h-5 w-44" /><Skeleton className="h-3 w-28" /></div><Skeleton className="h-9 w-20" /></div><div className="mt-4 flex gap-2"><Skeleton className="h-6 w-14" /><Skeleton className="h-6 w-20" /></div></section><section className="mt-4 overflow-hidden rounded-lg border border-[var(--border)]"><div className="border-b px-4 py-3"><Skeleton className="h-4 w-16" /></div>{Array.from({ length: 6 }, (_, index) => <div key={index} className="space-y-2 border-b px-4 py-3 last:border-0"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-36" /></div>)}</section></div></aside><main className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-5"><section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-white"><nav aria-label="Contact detail sections" data-testid="contact-details-loading-tabs" className="grid h-[53px] flex-none grid-cols-5 border-b px-3">{detailTabs.map(({ id, label, icon: Icon }) => <div key={id} className={cn("relative flex items-center justify-center gap-2 px-1 text-xs font-medium sm:px-2 sm:text-sm", id === "timeline" ? "text-[var(--brand)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[var(--brand)]" : "text-[var(--text-secondary)]")}><Icon size={16} /><span className="hidden md:inline">{label}</span></div>)}</nav><div className="flex-1 p-6"><div className="flex gap-2"><Skeleton className="h-8 w-14" /><Skeleton className="h-8 w-28" /><Skeleton className="h-8 w-20" /></div><div className="mt-8 space-y-7">{Array.from({ length: 3 }, (_, index) => <div key={index} className="flex gap-4"><Skeleton className="size-8 shrink-0 rounded-full" /><div className="w-full max-w-md space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-full" /></div></div>)}</div></div></section></main></div>;
}

function TaskListSkeleton() {
  return <div role="status" aria-label="Loading tasks" className="mt-5 grid gap-3 lg:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="rounded-lg border border-[var(--border)] p-4"><div className="flex gap-3"><Skeleton className="size-4 shrink-0" /><div className="w-full space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-24" /></div></div></div>)}</div>;
}

function NoteListSkeleton() {
  return <div role="status" aria-label="Loading notes" className="space-y-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="rounded-lg border border-[var(--border)] p-3"><Skeleton className="h-4 w-2/3" /><div className="mt-3 flex justify-between"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-24" /></div></div>)}</div>;
}

export function ContactDetails() {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canUpdate = membership?.role.permissions.includes("contacts.update") ?? false;
  const canViewFields = membership?.role.permissions.includes("contacts.fields.view") ?? false;
  const [contact, setContact] = useState<ContactApiRecord | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactEditDraft | null>(null);
  const [editingContactField, setEditingContactField] = useState<EditableContactField | null>(null);
  const [editingCustomFieldKey, setEditingCustomFieldKey] = useState<string | null>(null);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<ContactCustomFieldDefinition[]>([]);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [customFieldVersion, setCustomFieldVersion] = useState(0);
  const [savingContact, setSavingContact] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("timeline");
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingTag, setAddingTag] = useState(false);
  const [tagName, setTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [tasks, setTasks] = useState<ContactTask[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [deleteNoteOpen, setDeleteNoteOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);
  const [taskVersion, setTaskVersion] = useState(0);
  const [noteVersion, setNoteVersion] = useState(0);
  const [documentView, setDocumentView] = useState<"chat" | "uploaded">("chat");

  useEffect(() => {
    if (!workspaceId || !contactId || !accessToken) { setLoading(false); return; }
    let active = true; setLoading(true); setError(null);
    void apiRequest<ContactApiRecord>(`/workspaces/${workspaceId}/contacts/${contactId}`, { headers: { authorization: `Bearer ${accessToken}` } }).then((result) => { if (active) setContact(result); }).catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Contact details could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, contactId, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !accessToken || !canViewFields) { setCustomFieldDefinitions([]); return; }
    let active = true;
    void apiRequest<ContactCustomFieldDefinition[]>(`/workspaces/${workspaceId}/contacts/custom-fields?includeArchived=true`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((result) => { if (active) setCustomFieldDefinitions(result); })
      .catch(() => { if (active) setCustomFieldDefinitions([]); });
    return () => { active = false; };
  }, [accessToken, canViewFields, customFieldVersion, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !contactId || !accessToken || (activeTab !== "timeline" && activeTab !== "tasks" && activeTab !== "notes")) return;
    let active = true; setActivityLoading(true);
    if (activeTab === "timeline") {
      void apiRequest<ContactHistory>(`/workspaces/${workspaceId}/contacts/${contactId}/conversations/history?page=1&pageSize=100`, { headers: { authorization: `Bearer ${accessToken}` } }).then((result) => {
        if (active) setConversationMessages(result.messages);
      }).catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Conversation history could not be loaded."); }).finally(() => { if (active) setActivityLoading(false); });
      return () => { active = false; };
    }
    const resource = activeTab === "tasks" ? "tasks" : "notes";
    void apiRequest<Paged<ContactTask> | Paged<ContactNote>>(`/workspaces/${workspaceId}/contacts/${contactId}/${resource}?page=1&pageSize=100`, { headers: { authorization: `Bearer ${accessToken}` } }).then((result) => {
      if (!active) return;
      if (activeTab === "tasks") setTasks((result as Paged<ContactTask>).items);
      else {
        const nextNotes = (result as Paged<ContactNote>).items; setNotes(nextNotes);
        setSelectedNoteId((current) => current && nextNotes.some(({ id }) => id === current) ? current : null);
      }
    }).catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : `Contact ${resource} could not be loaded.`); }).finally(() => { if (active) setActivityLoading(false); });
    return () => { active = false; };
  }, [accessToken, activeTab, contactId, noteVersion, taskVersion, workspaceId]);

  const activeCustomFields = useMemo(() => customFieldDefinitions.filter(({ archivedAt }) => archivedAt === null), [customFieldDefinitions]);
  const knownCustomFieldKeys = useMemo(() => new Set(customFieldDefinitions.map(({ key }) => key)), [customFieldDefinitions]);
  const legacyCustomFields = useMemo(() => Object.entries(contact?.customAttributes ?? {}).filter(([key]) => !knownCustomFieldKeys.has(key)), [contact?.customAttributes, knownCustomFieldKeys]);
  const selectedNote = notes.find(({ id }) => id === selectedNoteId) ?? null;
  const beginContactEdit = (field: EditableContactField) => {
    if (!contact || !canUpdate || (field === "phone" && contact.phone === null)) return;
    setContactDraft((current) => current ?? draftFromContact(contact));
    setEditingContactField(field);
    setEditingCustomFieldKey(null);
  };
  const beginCustomFieldEdit = (key: string) => {
    if (!contact || !canUpdate || !canViewFields) return;
    setContactDraft((current) => current ?? draftFromContact(contact));
    setEditingContactField(null);
    setEditingCustomFieldKey(key);
  };
  const updateContactDraft = <Key extends keyof ContactEditDraft>(field: Key, value: ContactEditDraft[Key]) => setContactDraft((current) => current ? { ...current, [field]: value } : current);
  const cancelContactEdit = () => { setContactDraft(null); setEditingContactField(null); setEditingCustomFieldKey(null); setError(null); };
  const saveContactChanges = async () => {
    if (!workspaceId || !contactId || !accessToken || !contactDraft || !contact) return;
    const name = contactDraft.name.trim();
    const source = contactDraft.source.trim();
    const email = contactDraft.email.trim();
    const whatsappId = contactDraft.whatsappId.trim();
    const profileName = contactDraft.profileName.trim();
    if (!name || !source) { setError("Contact name and source are required."); return; }
    if (contact.phone !== null && !/^\+[1-9]\d{6,14}$/.test(contactDraft.phone)) { setError("Enter a complete international phone number."); return; }
    if (whatsappId && !/^[A-Za-z0-9._:-]+$/.test(whatsappId)) { setError("Enter a valid WhatsApp ID."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email address."); return; }
    if (!contactDraft.whatsappOpted && !contactDraft.marketingBlocked) { setError("An opted-out contact must remain blocked from marketing."); return; }
    const currentConsentSource = (contact.whatsappOpted ? contact.whatsappOptInSource : contact.whatsappOptOutSource) ?? "Manual";
    const currentConsentAt = toDateTimeLocal(contact.whatsappOpted ? contact.whatsappOptedInAt : contact.whatsappOptedOutAt);
    const consentChanged = contactDraft.whatsappOpted !== contact.whatsappOpted || contactDraft.whatsappConsentSource.trim() !== currentConsentSource || contactDraft.whatsappConsentAt !== currentConsentAt;
    const blockChanged = contactDraft.marketingBlocked !== contact.marketingBlocked || contactDraft.marketingBlockSource.trim() !== (contact.marketingBlockSource ?? "Manual") || contactDraft.marketingBlockReason.trim() !== (contact.marketingBlockReason ?? "");
    if (consentChanged && !contactDraft.whatsappConsentSource.trim()) { setError("Consent source is required."); return; }
    if (blockChanged && contactDraft.marketingBlocked && !contactDraft.marketingBlockSource.trim()) { setError("Marketing block source is required."); return; }
    const tags = [...new Map(contactDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => [tag.toLocaleLowerCase("en-US"), tag])).values()];
    setSavingContact(true); setError(null);
    try {
      const updated = await apiRequest<ContactApiRecord>(`/workspaces/${workspaceId}/contacts/${contactId}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ name, ...(contact.phone !== null ? { phone: contactDraft.phone } : {}), whatsappId: whatsappId || null, profileName: profileName || null, email: email || null, source, tags, customAttributes: contactDraft.customAttributes, ...(consentChanged ? { whatsappOpted: contactDraft.whatsappOpted, whatsappConsentSource: contactDraft.whatsappConsentSource.trim(), whatsappConsentAt: new Date(contactDraft.whatsappConsentAt).toISOString() } : {}), ...(blockChanged ? { marketingBlocked: contactDraft.marketingBlocked, marketingBlockSource: contactDraft.marketingBlockSource.trim(), marketingBlockReason: contactDraft.marketingBlockReason.trim() || null } : {}) }) });
      setContact(updated); setContactDraft(null); setEditingContactField(null); setEditingCustomFieldKey(null); toast.success("Contact updated successfully.");
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Contact could not be updated."; setError(message); toast.error(message);
    } finally { setSavingContact(false); }
  };
  const saveTags = async (tags: string[]) => {
    if (!workspaceId || !contactId || !accessToken || !canUpdate) return;
    setSavingTag(true); setError(null);
    try { const updated = await apiRequest<ContactApiRecord>(`/workspaces/${workspaceId}/contacts/${contactId}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ tags }) }); setContact(updated); setAddingTag(false); setTagName(""); toast.success("Contact tags updated."); }
    catch (caught) { const message = caught instanceof ApiError ? caught.message : "Contact tags could not be updated."; setError(message); toast.error(message); }
    finally { setSavingTag(false); }
  };
  const addTag = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const nextTag = tagName.trim(); if (!contact || !nextTag) return; const existing = contact.tags.map(({ name }) => name); if (existing.some((name) => name.toLowerCase() === nextTag.toLowerCase())) { setAddingTag(false); setTagName(""); return; } void saveTags([...existing, nextTag]); };

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!workspaceId || !contactId || !accessToken || !taskTitle.trim()) return;
    setSavingActivity(true); setError(null);
    try { await apiRequest(`/workspaces/${workspaceId}/contacts/${contactId}/tasks`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ title: taskTitle, description: taskDescription || undefined, dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null }) }); setTaskDialogOpen(false); setTaskTitle(""); setTaskDescription(""); setTaskDueAt(""); setTaskVersion((value) => value + 1); toast.success("Task created successfully."); }
    catch (caught) { const message = caught instanceof ApiError ? caught.message : "Task could not be created."; setError(message); toast.error(message); }
    finally { setSavingActivity(false); }
  };
  const toggleTask = async (task: ContactTask) => {
    if (!workspaceId || !contactId || !accessToken || !canUpdate) return;
    try { await apiRequest(`/workspaces/${workspaceId}/contacts/${contactId}/tasks/${task.id}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ status: task.status === "OPEN" ? "COMPLETED" : "OPEN" }) }); setTaskVersion((value) => value + 1); toast.success(task.status === "OPEN" ? "Task completed." : "Task reopened."); }
    catch (caught) { const message = caught instanceof ApiError ? caught.message : "Task could not be updated."; setError(message); toast.error(message); }
  };
  const saveNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!workspaceId || !contactId || !accessToken || !noteDraft.trim()) return;
    setSavingActivity(true); setError(null);
    try {
      if (editingNoteId) {
        await apiRequest<ContactNote>(`/workspaces/${workspaceId}/contacts/${contactId}/notes/${editingNoteId}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ content: noteDraft.trim() }) });
        setEditingNoteId(null); toast.success("Note updated successfully.");
      } else {
        await apiRequest<ContactNote>(`/workspaces/${workspaceId}/contacts/${contactId}/notes`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ content: noteDraft.trim() }) });
        setSelectedNoteId(null); toast.success("Note created successfully.");
      }
      setNoteDraft(""); setNoteVersion((value) => value + 1);
    }
    catch (caught) { const message = caught instanceof ApiError ? caught.message : `Note could not be ${editingNoteId ? "updated" : "created"}.`; setError(message); toast.error(message); }
    finally { setSavingActivity(false); }
  };
  const deleteNote = async () => {
    if (!workspaceId || !contactId || !accessToken || !selectedNote) return;
    try { await apiRequest(`/workspaces/${workspaceId}/contacts/${contactId}/notes/${selectedNote.id}`, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } }); setSelectedNoteId(null); setEditingNoteId(null); setNoteDraft(""); setNoteVersion((value) => value + 1); toast.success("Note deleted successfully."); }
    catch (caught) { const message = caught instanceof ApiError ? caught.message : "Note could not be deleted."; setError(message); toast.error(message); throw caught; }
  };

  if (loading) return <ContactDetailsSkeleton onBack={() => navigate("/contacts")} />;
  if (!contact) return <div className="flex h-full flex-col items-center justify-center overflow-hidden bg-[var(--page-background)] px-6 text-center"><p >{error ?? "Contact was not found."}</p><button type="button" onClick={() => navigate("/contacts")} className="mt-4 h-9 rounded-md border border-[var(--border)] bg-white px-4 text-xs font-medium text-[var(--brand)]">Back to contacts</button></div>;

  return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)] lg:flex-row" data-testid="contact-details-page">
    <aside className="flex max-h-[46%] min-h-0 flex-none flex-col border-b border-[var(--border)] bg-white lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r">
      <ContactDetailsHeader onBack={() => navigate("/contacts")} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <section className="flex-none rounded-lg border border-[var(--border)] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h1 className="truncate text-[15px] font-semibold">{contact.name}</h1><p className="mt-1">{contact.phone ?? "Phone number restricted"}</p></div><button type="button" onClick={() => navigate(`/inbox?contactId=${contact.id}`)} className="flex h-9 shrink-0 items-center rounded-md border border-[#abdacf] bg-[#effaf6] px-3 text-xs font-medium text-[var(--brand)]"><MessageCircle size={15} className="mr-1.5" />Chat</button></div><div className="mt-4 flex flex-wrap items-center gap-2">{contact.tags.map(({ id, name }) => <span key={id} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">{name}{canUpdate && <button type="button" aria-label={`Remove tag ${name}`} disabled={savingTag} onClick={() => void saveTags(contact.tags.filter((tag) => tag.id !== id).map((tag) => tag.name))}><X size={12} /></button>}</span>)}{canUpdate && !addingTag && <button type="button" onClick={() => setAddingTag(true)} className="flex items-center rounded-md border border-[#abdacf] px-2 py-1 text-[11px] font-medium text-[var(--brand)]"><Plus size={12} className="mr-1" />Add Tag</button>}</div>{addingTag && <form onSubmit={addTag} className="mt-3 flex gap-2"><Input autoFocus aria-label="New tag" value={tagName} onChange={(event) => setTagName(event.target.value)} className="h-8 text-xs" /><button type="submit" disabled={!tagName.trim() || savingTag} className="h-8 rounded-md bg-[var(--brand)] px-3 text-[11px] font-medium text-white">Add</button><button type="button" onClick={() => { setAddingTag(false); setTagName(""); }} className="h-8 px-2 text-[11px] text-[var(--text-muted)]">Cancel</button></form>}</section>
        <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)]"><div className="flex flex-none items-center justify-between border-b px-4 py-3"><h2 className="text-xs font-semibold">Details</h2>{canUpdate && canViewFields && <button type="button" onClick={() => setCustomFieldsOpen(true)} className="flex h-7 items-center rounded-md px-2 text-[11px] font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)]"><Settings2 size={13} className="mr-1" />Manage fields</button>}</div><dl data-testid="contact-details-scroll-region" className="min-h-0 flex-1 overflow-y-auto scrollbar-subtle">
          <DetailField label="Contact Name" value={contact.name} editable={canUpdate} editing={editingContactField === "name"} onEdit={() => beginContactEdit("name")}><Input autoFocus aria-label="Contact Name" value={contactDraft?.name ?? ""} maxLength={160} onChange={(event) => updateContactDraft("name", event.target.value)} className="h-9 text-xs" /></DetailField>
          <DetailField label="Phone Number" value={contact.phone ?? "Restricted"} editable={canUpdate && contact.phone !== null} editing={editingContactField === "phone"} onEdit={() => beginContactEdit("phone")}><InternationalPhoneInput id="edit-contact-phone" value={contactDraft?.phone ?? ""} onChange={(phone) => updateContactDraft("phone", phone)} required /></DetailField>
          <DetailField label="WhatsApp ID" value={contact.whatsappId ?? (contact.hasWhatsappId ? "Restricted" : "—")} editable={canUpdate && (!contact.hasWhatsappId || contact.whatsappId !== null)} editing={editingContactField === "whatsappId"} onEdit={() => beginContactEdit("whatsappId")}><Input autoFocus aria-label="WhatsApp ID" value={contactDraft?.whatsappId ?? ""} maxLength={64} onChange={(event) => updateContactDraft("whatsappId", event.target.value)} placeholder="e.g. 919876543210" className="h-9 text-xs" /></DetailField>
          <DetailField label="WhatsApp Profile Name" value={contact.profileName} editable={canUpdate} editing={editingContactField === "profileName"} onEdit={() => beginContactEdit("profileName")}><Input autoFocus aria-label="WhatsApp Profile Name" value={contactDraft?.profileName ?? ""} maxLength={160} onChange={(event) => updateContactDraft("profileName", event.target.value)} className="h-9 text-xs" /></DetailField>
          <DetailField label="Email ID" value={contact.email} editable={canUpdate} editing={editingContactField === "email"} onEdit={() => beginContactEdit("email")}><Input autoFocus type="email" aria-label="Email ID" value={contactDraft?.email ?? ""} maxLength={320} onChange={(event) => updateContactDraft("email", event.target.value)} className="h-9 text-xs" /></DetailField>
          <DetailField label="Source" value={contact.source} editable={canUpdate} editing={editingContactField === "source"} onEdit={() => beginContactEdit("source")}><Input autoFocus aria-label="Source" value={contactDraft?.source ?? ""} maxLength={50} onChange={(event) => updateContactDraft("source", event.target.value)} className="h-9 text-xs" /></DetailField>
          <DetailField label="Tags" value={contact.tags.length ? contact.tags.map(({ name }) => name).join(", ") : "—"} editable={canUpdate} editing={editingContactField === "tags"} onEdit={() => beginContactEdit("tags")}><Input autoFocus aria-label="Tags" value={contactDraft?.tags ?? ""} maxLength={1000} placeholder="tag-one, tag-two" onChange={(event) => updateContactDraft("tags", event.target.value)} className="h-9 text-xs" /></DetailField>
          <DetailField label="WhatsApp Opted" value={contact.whatsappOpted ? "Yes" : "No"} editable={canUpdate} editing={editingContactField === "whatsappOpted"} onEdit={() => beginContactEdit("whatsappOpted")}><div className="grid gap-2"><select autoFocus aria-label="WhatsApp Opted" value={contactDraft?.whatsappOpted ? "true" : "false"} onChange={(event) => { const opted = event.target.value === "true"; setContactDraft((current) => current ? { ...current, whatsappOpted: opted, whatsappConsentSource: "Manual", whatsappConsentAt: toDateTimeLocal(null), marketingBlocked: !opted, marketingBlockSource: "Manual", marketingBlockReason: opted ? "" : "WhatsApp opt-out" } : current); }} className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-xs outline-none focus:border-[var(--brand)]"><option value="true">Yes — opted in</option><option value="false">No — opted out</option></select><Input aria-label="Consent source" value={contactDraft?.whatsappConsentSource ?? ""} maxLength={100} onChange={(event) => updateContactDraft("whatsappConsentSource", event.target.value)} placeholder="e.g. Website form, WhatsApp reply" className="h-9 text-xs" /><Input type="datetime-local" aria-label="Consent date and time" value={contactDraft?.whatsappConsentAt ?? ""} onChange={(event) => updateContactDraft("whatsappConsentAt", event.target.value)} className="h-9 text-xs" /></div></DetailField>
          <DetailField label="Latest Opt-in Source" value={contact.whatsappOptInSource} />
          <DetailField label="Opted In At" value={contact.whatsappOptedInAt ? formatDate(contact.whatsappOptedInAt) : "—"} />
          <DetailField label="Latest Opt-out Source" value={contact.whatsappOptOutSource} />
          <DetailField label="Opted Out At" value={contact.whatsappOptedOutAt ? formatDate(contact.whatsappOptedOutAt) : "—"} />
          <DetailField label="Marketing Blocked" value={contact.marketingBlocked ? "Yes" : "No"} editable={canUpdate} editing={editingContactField === "marketingBlocked"} onEdit={() => beginContactEdit("marketingBlocked")}><div className="grid gap-2"><select autoFocus aria-label="Marketing Blocked" value={contactDraft?.marketingBlocked ? "true" : "false"} onChange={(event) => updateContactDraft("marketingBlocked", event.target.value === "true")} className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-xs outline-none focus:border-[var(--brand)]"><option value="true">Blocked</option><option value="false" disabled={!contactDraft?.whatsappOpted}>Not blocked</option></select>{contactDraft?.marketingBlocked && <><Input aria-label="Marketing block source" value={contactDraft.marketingBlockSource} maxLength={100} onChange={(event) => updateContactDraft("marketingBlockSource", event.target.value)} placeholder="e.g. Manual, abuse report" className="h-9 text-xs" /><Input aria-label="Marketing block reason" value={contactDraft.marketingBlockReason} maxLength={500} onChange={(event) => updateContactDraft("marketingBlockReason", event.target.value)} placeholder="Reason for blocking" className="h-9 text-xs" /></>}</div></DetailField>
          <DetailField label="Marketing Block Source" value={contact.marketingBlockSource} />
          <DetailField label="Marketing Block Reason" value={contact.marketingBlockReason} />
          <DetailField label="Marketing Blocked At" value={contact.marketingBlockedAt ? formatDate(contact.marketingBlockedAt) : "—"} />
          <DetailField label="Campaign Eligibility" value={contact.marketingEligible ? "Eligible" : "Not eligible"} />
          {activeCustomFields.map((field) => <DetailField key={field.id} label={field.label} value={customValueLabel(contact.customAttributes?.[field.key])} editable={canUpdate && canViewFields} editing={editingCustomFieldKey === field.key} onEdit={() => beginCustomFieldEdit(field.key)}><ContactCustomFieldInput hideLabel compact field={field} value={contactDraft?.customAttributes[field.key]} onChange={(value) => setContactDraft((current) => { if (!current) return current; const customAttributes = { ...current.customAttributes }; if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete customAttributes[field.key]; else customAttributes[field.key] = value; return { ...current, customAttributes }; })} /></DetailField>)}
          {legacyCustomFields.map(([name, value]) => <DetailField key={name} label={name} value={customValueLabel(value)} />)}
          <DetailField label="Created On" value={formatDate(contact.createdAt)} />
          <DetailField label="Last Updated" value={formatDate(contact.updatedAt)} />
        </dl>{canUpdate && canViewFields && <button type="button" onClick={() => setCustomFieldsOpen(true)} className="flex h-10 w-full flex-none items-center justify-center border-t border-[var(--border)] bg-white text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)]"><Plus size={14} className="mr-1.5" />Add custom field</button>}</section>
      </div>
      {contactDraft && <div data-testid="contact-edit-footer" className="flex flex-none items-center justify-end gap-2 border-t border-[var(--border)] bg-white px-4 py-3"><button type="button" disabled={savingContact} onClick={cancelContactEdit} className="h-9 rounded-md border border-[var(--border)] px-4 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]">Cancel</button><button type="button" disabled={savingContact} onClick={() => void saveContactChanges()} className="h-9 rounded-md bg-[var(--brand)] px-4 text-xs font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">{savingContact ? "Saving..." : "Save Changes"}</button></div>}
    </aside>
    <main className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-5"><section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-white"><nav aria-label="Contact detail sections" className="grid flex-none grid-cols-5 border-b">{detailTabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => setActiveTab(id)} className={cn("relative flex h-[52px] items-center justify-center gap-2 px-1 text-xs font-medium sm:px-2 sm:text-sm", activeTab === id ? "text-[var(--brand)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[var(--brand)]" : "text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]")}><Icon size={16} /><span className="hidden md:inline">{label}</span></button>)}</nav>{error && <p role="alert" className="mx-3 mt-3 flex-none rounded-md bg-red-50 px-3 py-2">{error}</p>}<div className="min-h-0 flex-1 overflow-y-auto scrollbar-subtle">
      {activeTab === "timeline" && <div className="p-4 sm:p-6"><div className="flex flex-wrap gap-2"><span className="rounded-md border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-medium text-[var(--brand)]">All</span><span className="rounded-md border px-3 py-1.5 text-xs">Contact Updates</span><span className="rounded-md border px-3 py-1.5 text-xs">Events</span></div><div className="relative mt-6 ml-3 border-l pl-7"><div className="relative pb-8"><span className="absolute -left-[42px] flex size-7 items-center justify-center rounded-full bg-[var(--brand)] text-white"><CircleUserRound size={15} /></span><h2 className="text-sm font-medium">Contact created via {contact.source}</h2><p className="mt-1">{formatDate(contact.createdAt)}</p></div>{contact.updatedAt !== contact.createdAt && <div className="relative"><span className="absolute -left-[42px] flex size-7 items-center justify-center rounded-full bg-[var(--brand)] text-white"><CalendarClock size={14} /></span><h2 className="text-sm font-medium">Contact details updated</h2><p className="mt-1">{formatDate(contact.updatedAt)}</p></div>}{activityLoading && <p className="mt-2">Loading conversation history…</p>}{conversationMessages.map((message) => <article key={message.id} className="relative border-t border-[var(--border-soft)] py-4"><span className="absolute -left-[42px] flex size-7 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><MessageCircle size={14} /></span><h2 className="text-sm font-medium">{message.direction === "INCOMING" ? "Incoming message" : "Outgoing message"}</h2><p className="mt-1">{formatDate(message.sentAt)} · {message.status.toLowerCase()}</p><p className="mt-2 break-words">{message.text || `${message.type.toLowerCase()} message`}</p></article>)}</div></div>}
      {activeTab === "tasks" && <div className="flex min-h-full flex-col p-4 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Tasks</h2><p className="mt-1">Follow-ups and reminders for this contact.</p></div>{canUpdate && <button type="button" onClick={() => setTaskDialogOpen(true)} className="flex h-9 items-center rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white"><Plus size={14} className="mr-1.5" />New Task</button>}</div>{activityLoading ? <TaskListSkeleton /> : tasks.length ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{tasks.map((task) => <article key={task.id} className="rounded-lg border border-[var(--border)] p-4"><div className="flex items-start gap-3"><input type="checkbox" aria-label={`Complete ${task.title}`} checked={task.status === "COMPLETED"} disabled={!canUpdate} onChange={() => void toggleTask(task)} className="mt-0.5 size-4 accent-[var(--brand)]" /><div className="min-w-0"><h3 className={cn("text-sm font-medium", task.status === "COMPLETED" && "text-[var(--text-muted)] line-through")}>{task.title}</h3>{task.description && <p className="mt-1">{task.description}</p>}<p className="mt-2">{task.dueAt ? `Due ${formatDate(task.dueAt)}` : "No due date"}</p></div></div></article>)}</div> : <EmptyState icon={CheckSquare} title="No tasks yet" description="Create a task to schedule a follow-up for this contact." />}</div>}
      {activeTab === "documents" && <div className="flex min-h-full flex-col"><div className="flex flex-none gap-2 border-b px-4 py-3"><button type="button" onClick={() => setDocumentView("chat")} className={cn("flex h-9 items-center rounded-md border px-3 text-xs font-medium", documentView === "chat" ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--border)]")}><MessagesSquare size={14} className="mr-1.5" />Chat Documents</button><button type="button" onClick={() => setDocumentView("uploaded")} className={cn("flex h-9 items-center rounded-md border px-3 text-xs font-medium", documentView === "uploaded" ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--border)]")}><Upload size={14} className="mr-1.5" />Uploaded Documents</button></div><EmptyState icon={documentView === "chat" ? MessagesSquare : Upload} title={documentView === "chat" ? "No chat documents" : "No uploaded documents"} description={documentView === "chat" ? "Documents exchanged in conversations will appear here." : "Documents uploaded for this contact will appear here."} /></div>}
      {activeTab === "notes" && <div className="grid min-h-full grid-cols-1 md:grid-cols-[minmax(230px,36%)_1fr]"><section className="flex min-h-[260px] flex-col border-b border-[var(--border)] md:border-b-0 md:border-r"><div className="min-h-0 flex-1 overflow-y-auto p-3">{activityLoading ? <NoteListSkeleton /> : notes.length ? <div className="space-y-2">{notes.map((note) => <button type="button" key={note.id} onClick={() => { setSelectedNoteId(note.id); setEditingNoteId(null); setNoteDraft(""); }} className={cn("w-full rounded-lg border p-3 text-left", selectedNoteId === note.id ? "border-amber-300 bg-amber-50/60" : "border-[var(--border)] hover:bg-[var(--brand-soft)]")}><h3 className="truncate text-sm font-medium">{note.title}</h3><div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]"><span>{formatDate(note.createdAt)}</span><span className="truncate">{actorName(note.createdBy)}</span></div></button>)}</div> : <p className="py-10 text-center">No notes yet.</p>}</div>{canUpdate && <div className="flex-none border-t p-3"><button type="button" onClick={() => { setSelectedNoteId(null); setEditingNoteId(null); setNoteDraft(""); }} className="ml-auto flex h-9 items-center rounded-md border border-[#abdacf] bg-[#effaf6] px-3 text-xs font-medium text-[var(--brand)]"><Plus size={14} className="mr-1.5" />New Note</button></div>}</section><section className="min-h-[260px] bg-[#fffef1]">{selectedNote && editingNoteId !== selectedNote.id ? <div className="flex h-full flex-col p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-medium">{selectedNote.title}</h2><p className="mt-1">{formatDate(selectedNote.createdAt)} · {actorName(selectedNote.createdBy)}</p></div>{canUpdate && <div className="flex items-center gap-1"><button type="button" aria-label="Edit note" onClick={() => { setEditingNoteId(selectedNote.id); setNoteDraft(selectedNote.content); }} className="flex h-9 items-center rounded-md px-3 text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)]"><Pencil size={14} className="mr-1.5" />Edit</button><button type="button" aria-label="Delete note" onClick={() => setDeleteNoteOpen(true)} className="flex h-9 items-center rounded-md px-3 text-xs font-medium text-[var(--danger)] hover:bg-red-50"><Trash2 size={14} className="mr-1.5" />Delete</button></div>}</div><p className="mt-5">{selectedNote.content}</p></div> : <form onSubmit={(event) => void saveNote(event)} className="flex h-full min-h-[260px] flex-col"><textarea autoFocus aria-label="Note" maxLength={20000} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder={editingNoteId ? "Edit note..." : "Write a note..."} className="min-h-0 flex-1 resize-none border-0 bg-transparent p-5 text-sm leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] sm:p-6" />{noteDraft.length > 0 && <div className="flex flex-none items-center justify-end gap-2 border-t border-[var(--border)] bg-white/70 px-5 py-3"><button type="button" onClick={() => { setNoteDraft(""); setEditingNoteId(null); }} className="h-9 rounded-md border border-[var(--border)] bg-white px-4 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]">Cancel</button><button type="submit" disabled={savingActivity || !noteDraft.trim()} className="h-9 rounded-md bg-[var(--brand)] px-4 text-xs font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">{savingActivity ? "Saving..." : editingNoteId ? "Save changes" : "Save note"}</button></div>}</form>}</section></div>}
      {activeTab === "calls" && <EmptyState icon={PhoneCall} title="No calls logged" description="Calls associated with this contact will appear here." />}
    </div></section></main>
    <FormDialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen} title="Create task"><form onSubmit={(event) => void createTask(event)} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"><div><label htmlFor="task-title" className="mb-2 block text-xs font-medium">Task title</label><Input id="task-title" required maxLength={160} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /></div><div><label htmlFor="task-description" className="mb-2 block text-xs font-medium">Description <span className="font-normal text-[var(--text-muted)]">(optional)</span></label><textarea id="task-description" maxLength={5000} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} className="min-h-28 w-full rounded-md border border-[var(--border)] p-3 text-sm outline-none focus:border-[var(--brand)]" /></div><div><label htmlFor="task-due" className="mb-2 block text-xs font-medium">Due date <span className="font-normal text-[var(--text-muted)]">(optional)</span></label><Input id="task-due" type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} /></div></div><div className="flex flex-none justify-end gap-2 border-t px-5 py-4"><button type="button" onClick={() => setTaskDialogOpen(false)} className="h-9 rounded-md border px-4 text-xs font-medium">Cancel</button><button type="submit" disabled={savingActivity || !taskTitle.trim()} className="h-9 rounded-md bg-[var(--brand)] px-4 text-xs font-medium text-white disabled:opacity-50">{savingActivity ? "Creating..." : "Create task"}</button></div></form></FormDialog>
    {workspaceId && accessToken && <ContactCustomFieldsDialog open={customFieldsOpen} onOpenChange={setCustomFieldsOpen} workspaceId={workspaceId} accessToken={accessToken} fields={activeCustomFields} onFieldsChange={() => setCustomFieldVersion((value) => value + 1)} />}
    <ConfirmationDialog open={deleteNoteOpen} onOpenChange={setDeleteNoteOpen} title="Delete this note?" description="The note will be removed from this contact and retained in history." confirmLabel="Delete note" pendingLabel="Deleting..." tone="danger" onConfirm={deleteNote} />
  </div>;
}
