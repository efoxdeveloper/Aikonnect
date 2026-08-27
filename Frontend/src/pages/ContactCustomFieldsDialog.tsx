import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiRequest } from "@/lib/api";
import type { ContactCustomFieldDefinition, ContactCustomFieldType } from "@/pages/contact.types";

const fieldTypes: Array<{ value: ContactCustomFieldType; label: string }> = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "BOOLEAN", label: "Yes / No" },
  { value: "SELECT", label: "Dropdown" },
  { value: "MULTI_SELECT", label: "Multi-select" },
];

function typeLabel(type: ContactCustomFieldType) {
  return fieldTypes.find(({ value }) => value === type)?.label ?? type;
}

export function ContactCustomFieldsDialog({
  open,
  onOpenChange,
  workspaceId,
  accessToken,
  fields,
  onFieldsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  accessToken: string;
  fields: ContactCustomFieldDefinition[];
  onFieldsChange: (fields: ContactCustomFieldDefinition[]) => void;
}) {
  const [editing, setEditing] = useState<ContactCustomFieldDefinition | "new" | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ContactCustomFieldType>("TEXT");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ContactCustomFieldDefinition | null>(null);

  const beginCreate = () => {
    setEditing("new"); setLabel(""); setType("TEXT"); setOptions(""); setRequired(false); setError(null);
  };
  const beginEdit = (field: ContactCustomFieldDefinition) => {
    setEditing(field); setLabel(field.label); setType(field.type); setOptions(field.options.join("\n")); setRequired(field.required); setError(null);
  };
  const closeEditor = () => { setEditing(null); setError(null); };
  const parsedOptions = () => [...new Map(options.split(/[\n,]/).map((option) => option.trim()).filter(Boolean).map((option) => [option.toLocaleLowerCase("en-US"), option])).values()];
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!label.trim() || !editing) return;
    const selectable = type === "SELECT" || type === "MULTI_SELECT";
    const nextOptions = selectable ? parsedOptions() : [];
    if (selectable && nextOptions.length === 0) { setError("Add at least one option."); return; }
    setSaving(true); setError(null);
    try {
      const field = await apiRequest<ContactCustomFieldDefinition>(
        editing === "new" ? `/workspaces/${workspaceId}/contacts/custom-fields` : `/workspaces/${workspaceId}/contacts/custom-fields/${editing.id}`,
        {
          method: editing === "new" ? "POST" : "PATCH",
          headers: { authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(editing === "new"
            ? { label: label.trim(), type, options: nextOptions, required }
            : { label: label.trim(), options: nextOptions, required }),
        },
      );
      onFieldsChange(editing === "new" ? [...fields, field] : fields.map((item) => item.id === field.id ? field : item));
      toast.success(editing === "new" ? "Custom field created." : "Custom field updated.");
      closeEditor();
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Custom field could not be saved.";
      setError(message); toast.error(message);
    } finally { setSaving(false); }
  };
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    next.splice(target, 0, next.splice(index, 1)[0]);
    try {
      const reordered = await apiRequest<ContactCustomFieldDefinition[]>(`/workspaces/${workspaceId}/contacts/custom-fields/order`, {
        method: "PUT",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ fieldIds: next.map(({ id }) => id) }),
      });
      onFieldsChange(reordered);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Custom fields could not be reordered.";
      toast.error(message);
    }
  };
  const archive = async () => {
    if (!archiveTarget) return;
    await apiRequest(`/workspaces/${workspaceId}/contacts/custom-fields/${archiveTarget.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    onFieldsChange(fields.filter(({ id }) => id !== archiveTarget.id));
    setArchiveTarget(null);
    toast.success("Custom field archived. Existing contact values were preserved.");
  };

  return <>
    <Dialog.Root open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) closeEditor(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[130] bg-slate-950/45" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[131] flex max-h-[calc(100vh-32px)] w-[calc(100%-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_24px_70px_rgba(15,23,42,.24)]">
          <header className="flex flex-none items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <Dialog.Title asChild><h3>Manage custom fields</h3></Dialog.Title>
            <Dialog.Close asChild><button type="button" aria-label="Close custom fields" className="flex size-9 items-center justify-center rounded-full border border-[var(--border)]"><X size={17} /></button></Dialog.Close>
          </header>
          {editing ? <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div><label htmlFor="custom-field-label" className="mb-2 block text-xs font-medium">Field label</label><Input id="custom-field-label" required maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} /></div>
              <div><label htmlFor="custom-field-type" className="mb-2 block text-xs font-medium">Field type</label><Select value={type} disabled={editing !== "new"} onValueChange={(value) => setType(value as ContactCustomFieldType)}><SelectTrigger id="custom-field-type" aria-label="Field type"><SelectValue /></SelectTrigger><SelectContent className="z-[160]">{fieldTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>{editing !== "new" && <p className="mt-1">Field type cannot be changed after creation.</p>}</div>
              {(type === "SELECT" || type === "MULTI_SELECT") && <div><label htmlFor="custom-field-options" className="mb-2 block text-xs font-medium">Options</label><textarea id="custom-field-options" value={options} onChange={(event) => setOptions(event.target.value)} placeholder="One option per line" className="min-h-28 w-full rounded-md border border-[var(--border)] p-3 text-sm outline-none focus:border-[var(--brand)]" /></div>}
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} className="size-4 accent-[var(--brand)]" />Required when creating or updating custom-field values</label>
              {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2">{error}</p>}
            </div>
            <footer className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-5 py-4"><button type="button" onClick={closeEditor} className="h-9 rounded-md border px-4 text-xs font-medium">Cancel</button><button type="submit" disabled={saving || !label.trim()} className="h-9 rounded-md bg-[var(--brand)] px-4 text-xs font-medium text-white disabled:opacity-50">{saving ? "Saving..." : editing === "new" ? "Create field" : "Save changes"}</button></footer>
          </form> : <>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {fields.length ? <div className="space-y-2">{fields.map((field, index) => <div key={field.id} className="flex items-center gap-3 rounded-md border border-[var(--border-soft)] px-3 py-2.5"><span className="flex size-7 shrink-0 items-center justify-center rounded bg-[var(--brand-soft)] text-xs font-medium text-[var(--brand)]">{index + 1}</span><div className="min-w-0 flex-1"><div className="truncate font-medium">{field.label}</div><p className="mt-0.5">{typeLabel(field.type)} · {field.required ? "Required" : "Optional"}</p></div><div className="flex items-center"><button type="button" aria-label={`Move ${field.label} up`} disabled={index === 0} onClick={() => void move(index, -1)} className="flex size-8 items-center justify-center rounded hover:bg-[var(--brand-soft)] disabled:opacity-25"><ChevronUp size={15} /></button><button type="button" aria-label={`Move ${field.label} down`} disabled={index === fields.length - 1} onClick={() => void move(index, 1)} className="flex size-8 items-center justify-center rounded hover:bg-[var(--brand-soft)] disabled:opacity-25"><ChevronDown size={15} /></button><button type="button" aria-label={`Edit ${field.label}`} onClick={() => beginEdit(field)} className="flex size-8 items-center justify-center rounded text-[var(--brand)] hover:bg-[var(--brand-soft)]"><Pencil size={14} /></button><button type="button" aria-label={`Archive ${field.label}`} onClick={() => setArchiveTarget(field)} className="flex size-8 items-center justify-center rounded text-[var(--danger)] hover:bg-red-50"><Trash2 size={14} /></button></div></div>)}</div> : <div className="py-12 text-center"><p>No custom fields yet.</p><p className="mt-1">Create fields for business-specific contact information.</p></div>}
            </div>
            <footer className="flex flex-none justify-between border-t border-[var(--border)] px-5 py-4"><Dialog.Close asChild><button type="button" className="h-9 rounded-md border px-4 text-xs font-medium">Close</button></Dialog.Close><button type="button" onClick={beginCreate} className="flex h-9 items-center rounded-md bg-[var(--brand)] px-4 text-xs font-medium text-white"><Plus size={14} className="mr-1.5" />New field</button></footer>
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <ConfirmationDialog open={Boolean(archiveTarget)} onOpenChange={(next) => { if (!next) setArchiveTarget(null); }} title="Archive this custom field?" description="The field will stop appearing on contact forms. Existing values remain stored for history." confirmLabel="Archive field" pendingLabel="Archiving..." tone="danger" onConfirm={archive} />
  </>;
}
