import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, CirclePlus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ContactCustomFieldDefinition, ContactCustomFieldType } from "@/pages/contact.types";
import { cn } from "@/lib/utils";

type SegmentTab = "Tags" | "Fields" | "Events";
type ValidationAction = "apply" | "save";
type StringOperator = "is" | "is_not" | "contains" | "not_contains" | "is_empty" | "is_not_empty";
type CustomOperator = StringOperator | "greater_than" | "greater_than_or_equal" | "less_than" | "less_than_or_equal" | "before" | "after" | "on";
type StandardField = "name" | "phone" | "email" | "source" | "whatsappOpted" | "marketingBlocked";

export type ContactSegmentCondition =
  | { type: "tag"; field: "tags"; operator: "is" | "is_not" | "contains"; value: string }
  | { type: "field"; field: StandardField; operator: StringOperator; value: string | boolean }
  | { type: "custom_field"; field: string; operator: CustomOperator; value?: string | number | boolean | string[] };

type BuilderCondition = ContactSegmentCondition & { id: number };
type Option = { value: string; label: string };
const standardFields: Array<{ value: StandardField; label: string }> = [
  { value: "name", label: "Contact name" }, { value: "phone", label: "Phone number" },
  { value: "email", label: "Email ID" }, { value: "source", label: "Source" },
  { value: "whatsappOpted", label: "WhatsApp opted" },
  { value: "marketingBlocked", label: "Marketing blocked" },
];
const labels: Record<string, string> = {
  is: "Is", is_not: "Is not", contains: "Contains", not_contains: "Does not contain",
  is_empty: "Is empty", is_not_empty: "Is not empty", greater_than: "Greater than",
  greater_than_or_equal: "Greater than or equal", less_than: "Less than",
  less_than_or_equal: "Less than or equal", before: "Before", after: "After", on: "On",
};
const stringOperators: StringOperator[] = ["is", "is_not", "contains", "not_contains", "is_empty", "is_not_empty"];
const noValueOperators = new Set<CustomOperator>(["is_empty", "is_not_empty"]);
const operatorOptions = (operators: readonly string[]): Option[] => operators.map((value) => ({ value, label: labels[value] }));

function operatorsFor(type: ContactCustomFieldType): CustomOperator[] {
  if (type === "NUMBER") return ["is", "is_not", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "is_empty", "is_not_empty"];
  if (type === "DATE") return ["on", "before", "after", "is_empty", "is_not_empty"];
  if (type === "BOOLEAN" || type === "SELECT") return ["is", "is_not", "is_empty", "is_not_empty"];
  if (type === "MULTI_SELECT") return ["contains", "not_contains", "is_empty", "is_not_empty"];
  return [...stringOperators];
}
function defaultValue(field?: ContactCustomFieldDefinition): string | boolean | string[] {
  if (field?.type === "BOOLEAN") return true;
  if (field?.type === "MULTI_SELECT") return [];
  return "";
}
function freshCondition(tab: Exclude<SegmentTab, "Events">): BuilderCondition {
  return tab === "Tags" ? { id: Date.now() + Math.random(), type: "tag", field: "tags", operator: "is", value: "" }
    : { id: Date.now() + Math.random(), type: "field", field: "name", operator: "is", value: "" };
}
function hasValue(condition: BuilderCondition) {
  if (noValueOperators.has(condition.operator as CustomOperator)) return true;
  if (Array.isArray(condition.value)) return condition.value.some((value) => value.trim().length > 0);
  if (typeof condition.value === "boolean" || typeof condition.value === "number") return true;
  return Boolean(condition.value?.trim());
}

function NativeSelect({ label, value, options, onChange, invalid = false }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; invalid?: boolean }) {
  return <div className="relative min-w-0"><select aria-label={label} aria-invalid={invalid} value={value} onChange={(event) => onChange(event.target.value)} className={cn("h-10 w-full appearance-none rounded-md border border-[#cfd7e4] bg-white px-3 pr-8 text-sm outline-none focus:border-[var(--brand)]", invalid && "border-[var(--danger)]")}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" /></div>;
}

function TagPicker({ value, onChange, tags, invalid }: { value: string; onChange: (value: string) => void; tags: string[]; invalid: boolean }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  const filteredTags = tags.filter((tag) => tag.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="relative min-w-0 flex-1">
    <button type="button" aria-label="Select a tag" aria-expanded={open} aria-invalid={invalid} onClick={() => setOpen((current) => !current)} className={cn("flex h-10 w-full items-center justify-between rounded-md border border-[#cfd7e4] bg-white px-3 text-left text-sm hover:border-[var(--brand)]", invalid && "border-[var(--danger)] hover:border-[var(--danger)]")}><span className="flex min-w-0 items-center gap-2 truncate">{!value && <Search size={16} className="shrink-0 text-[var(--text-muted)]" />}{value || "Select a Tag"}</span><ChevronDown size={16} /></button>
    {open && <div className="absolute left-0 right-0 top-11 z-30 min-w-[240px] rounded-md border border-[var(--border)] bg-white p-2 shadow-[0_12px_32px_rgba(31,42,55,.16)]"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" /><input autoFocus aria-label="Search segment tags" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tags" className="h-8 w-full rounded border border-[var(--border)] pl-8 pr-2 text-xs outline-none focus:border-[var(--brand)]" /></div><div role="listbox" aria-label="Segment tags" className="mt-1 max-h-40 overflow-y-auto">{filteredTags.map((tag) => <button type="button" role="option" aria-selected={value === tag} key={tag} onClick={() => { onChange(tag); setOpen(false); setQuery(""); }} className="flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]">{tag}{value === tag && <Check size={14} />}</button>)}{!filteredTags.length && <p className="px-2.5 py-3">No tags found.</p>}</div></div>}
  </div>;
}

function selectorValue(condition: BuilderCondition) { return condition.type === "custom_field" ? `custom:${condition.field}` : condition.type === "field" ? `standard:${condition.field}` : "tag"; }

function ConditionValue({ condition, customField, invalid, onChange }: { condition: BuilderCondition; customField?: ContactCustomFieldDefinition; invalid: boolean; onChange: (value: string | number | boolean | string[]) => void }) {
  if (noValueOperators.has(condition.operator as CustomOperator)) return <div className="flex h-10 items-center rounded-md border border-dashed border-[#cfd7e4] px-3 text-xs text-[var(--text-muted)]">No value required</div>;
  if ((condition.type === "field" && (condition.field === "whatsappOpted" || condition.field === "marketingBlocked")) || customField?.type === "BOOLEAN") return <NativeSelect label="Condition value" value={String(condition.value)} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} onChange={(value) => onChange(value === "true")} invalid={invalid} />;
  if (customField && (customField.type === "SELECT" || customField.type === "MULTI_SELECT")) return <NativeSelect label="Condition value" value={Array.isArray(condition.value) ? condition.value[0] ?? "" : String(condition.value ?? "")} options={[{ value: "", label: "Select an option" }, ...customField.options.map((option) => ({ value: option, label: option }))]} onChange={(value) => onChange(customField.type === "MULTI_SELECT" ? [value] : value)} invalid={invalid} />;
  const inputType = customField?.type === "NUMBER" ? "number" : customField?.type === "DATE" ? "date" : "text";
  return <Input type={inputType} aria-label="Condition value" aria-invalid={invalid} value={String(condition.value ?? "")} onChange={(event) => onChange(inputType === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} placeholder="Enter value" className={cn("h-10", invalid && "border-[var(--danger)] focus-visible:ring-red-500/20")} />;
}

function ConditionRow({ condition, tags, customFields, onChange, onRemove, removable, showValidation }: { condition: BuilderCondition; tags: string[]; customFields: ContactCustomFieldDefinition[]; onChange: (condition: BuilderCondition) => void; onRemove: () => void; removable: boolean; showValidation: boolean }) {
  const customField = condition.type === "custom_field" ? customFields.find((field) => field.key === condition.field) : undefined;
  const fields: Option[] = [...standardFields.map((field) => ({ value: `standard:${field.value}`, label: field.label })), ...customFields.map((field) => ({ value: `custom:${field.key}`, label: `${field.label} · Custom` }))];
  const operators = condition.type === "tag" ? ["is", "is_not", "contains"] : condition.type === "custom_field" && customField ? operatorsFor(customField.type) : condition.type === "field" && (condition.field === "whatsappOpted" || condition.field === "marketingBlocked") ? ["is", "is_not"] : stringOperators;
  const invalid = showValidation && !hasValue(condition);
  const changeField = (value: string) => {
    if (value.startsWith("custom:")) { const field = customFields.find((item) => item.key === value.slice(7)); if (field) onChange({ id: condition.id, type: "custom_field", field: field.key, operator: operatorsFor(field.type)[0], value: defaultValue(field) }); return; }
    const field = value.slice(9) as StandardField; onChange({ id: condition.id, type: "field", field, operator: "is", value: field === "whatsappOpted" || field === "marketingBlocked" ? true : "" });
  };
  return <div><div className="relative grid gap-3 pl-8 sm:grid-cols-[180px_180px_minmax(180px,1fr)_36px]"><div className="absolute bottom-[-13px] left-4 top-[-13px] border-l border-dashed border-[#aab6c8]" /><div className="absolute left-[13px] top-5 size-2 rounded-full border border-[#8da0b5] bg-white" />
    {condition.type === "tag" ? <div className="flex h-10 items-center rounded-md border border-[#cfd7e4] bg-[#fbfcfd] px-3 text-sm">Tags</div> : <NativeSelect label="Condition field" value={selectorValue(condition)} options={fields} onChange={changeField} />}
    <NativeSelect label="Condition operator" value={condition.operator} options={operatorOptions(operators)} onChange={(operator) => onChange({ ...condition, operator: operator as never } as BuilderCondition)} />
    {condition.type === "tag" ? <TagPicker value={condition.value} onChange={(value) => onChange({ ...condition, value })} tags={tags} invalid={invalid} /> : <ConditionValue condition={condition} customField={customField} invalid={invalid} onChange={(value) => onChange({ ...condition, value } as BuilderCondition)} />}
    {removable ? <button type="button" aria-label="Remove condition" onClick={onRemove} className="flex size-9 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-red-50 hover:text-[var(--danger)]"><X size={16} /></button> : <span />}
  </div>{invalid && <p role="alert" className="mt-1 pl-8 sm:pl-[396px]">{condition.type === "tag" ? "Select a tag to continue." : "Select or enter a condition value to continue."}</p>}</div>;
}

export function SegmentBuilderDialog({ open, onClose, onApply, onSave, tags = [], customFields = [], initialSegment = null }: { open: boolean; onClose: () => void; onApply: (conditions: ContactSegmentCondition[]) => void; onSave: (name: string, conditions: ContactSegmentCondition[]) => Promise<void>; tags?: string[]; customFields?: ContactCustomFieldDefinition[]; initialSegment?: { name: string; conditions: ContactSegmentCondition[] } | null }) {
  const activeCustomFields = useMemo(() => customFields.filter((field) => !field.archivedAt).sort((a, b) => a.position - b.position), [customFields]);
  const [tab, setTab] = useState<SegmentTab>("Tags"); const [name, setName] = useState("");
  const [conditions, setConditions] = useState<BuilderCondition[]>([freshCondition("Tags")]);
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [validationAction, setValidationAction] = useState<ValidationAction | null>(null);
  useEffect(() => { if (!open) return; const initial = initialSegment?.conditions.length ? initialSegment.conditions.map((condition) => ({ ...condition, id: Date.now() + Math.random() })) : [freshCondition("Tags")]; setName(initialSegment?.name ?? ""); setConditions(initial); setTab(initial[0]?.type === "tag" ? "Tags" : "Fields"); setError(null); setValidationAction(null); }, [initialSegment, open]);
  if (!open) return null;
  const normalized = conditions.map(({ id: _id, ...condition }) => condition); const conditionsValid = tab !== "Events" && conditions.length > 0 && conditions.every(hasValue); const nameMissing = validationAction === "save" && !name.trim();
  const switchTab = (next: SegmentTab) => { setError(null); setValidationAction(null); setTab(next); setConditions(next === "Events" ? [] : [freshCondition(next)]); };
  const validate = (action: ValidationAction) => { setValidationAction(action); setError(null); if (tab === "Events") { setError("Event segments are not available yet."); return false; } return conditionsValid && (action === "apply" || Boolean(name.trim())); };
  const save = async () => { if (!validate("save")) return; setSaving(true); try { await onSave(name.trim(), normalized); } catch (caught) { setError(caught instanceof Error ? caught.message : "Segment could not be saved."); } finally { setSaving(false); } };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 px-4 py-6" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="save-segment-title" className="flex h-[min(680px,calc(100vh-48px))] max-h-[calc(100vh-48px)] w-full max-w-[1032px] flex-col overflow-hidden rounded-lg bg-white shadow-[0_20px_60px_rgba(15,23,42,.22)]">
    <header className="flex flex-none items-center justify-between border-b border-[#d8deea] px-6 py-4"><h2 id="save-segment-title" className="text-sm font-semibold">{initialSegment ? "Edit Segment" : "Create Segment"}</h2><button type="button" aria-label="Close segment builder" onClick={onClose} className="flex size-8 items-center justify-center rounded-full border border-[#52617c] text-[#52617c] hover:bg-[var(--brand-soft)]"><X size={17} /></button></header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"><div className="mb-4 max-w-md"><label htmlFor="segment-name" className="mb-2 block text-xs font-medium">Segment name</label><Input id="segment-name" value={name} maxLength={120} aria-invalid={nameMissing} onChange={(event) => setName(event.target.value)} placeholder="For example, VIP customers" className={cn(nameMissing && "border-[var(--danger)] focus-visible:ring-red-500/20")} />{nameMissing && <p role="alert" className="mt-1">Segment name is required.</p>}</div>
    <div className="rounded-md border border-[#cfd7e4] p-4 sm:p-5"><h3>Filter Contacts by</h3><div className="relative mt-5"><div className="relative z-10 ml-4 -mb-[21px] flex w-[315px] max-w-[calc(100%-1rem)] rounded-full border border-[#cfd7e4] bg-white p-1">{(["Tags", "Fields", "Events"] as SegmentTab[]).map((item) => <button type="button" key={item} onClick={() => switchTab(item)} className={cn("flex-1 rounded-full py-2 text-sm font-medium transition-colors", tab === item ? "bg-[var(--brand)] text-white" : "text-[#27406b] hover:bg-[var(--brand-soft)]")}>{item}</button>)}</div>
    <div className="relative z-0 min-h-[170px] rounded-md border border-[#cfd7e4] px-3 pb-5 pt-10 sm:px-4">{tab === "Events" ? <div className="flex min-h-[110px] items-center justify-center text-center"><div><p>Event segments are not available yet</p><p className="mt-1">Connect conversation and campaign events before creating event conditions.</p></div></div> : <>{conditions.map((condition, index) => <div key={condition.id} className={index ? "mt-4" : ""}>{index > 0 && <div className="mb-2 ml-8 text-[10px] font-medium uppercase text-[var(--text-muted)]">And</div>}<ConditionRow condition={condition} tags={tags} customFields={activeCustomFields} removable={conditions.length > 1} showValidation={validationAction !== null} onChange={(next) => setConditions((current) => current.map((item) => item.id === next.id ? next : item))} onRemove={() => setConditions((current) => current.filter(({ id }) => id !== condition.id))} /></div>)}<button type="button" disabled={conditions.length >= 10} onClick={() => setConditions((current) => [...current, freshCondition(tab)])} className="mt-5 flex items-center gap-1.5 text-sm text-[#77958e] hover:text-[var(--brand)] disabled:opacity-50"><CirclePlus size={17} />Add Condition</button></>}</div></div></div>{error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2">{error}</p>}</div>
    <footer className="flex flex-none justify-end gap-2 border-t border-[#d8deea] px-4 py-4 sm:px-6"><button type="button" disabled={saving} onClick={() => { if (validate("apply")) onApply(normalized); }} className="h-10 rounded-md border border-[var(--border)] bg-white px-4 text-sm font-medium disabled:opacity-50">Apply Without Saving</button><button type="button" disabled={saving} onClick={() => void save()} className="h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving..." : initialSegment ? "Update Segment" : "Save Segment"}</button></footer>
  </section></div>;
}
