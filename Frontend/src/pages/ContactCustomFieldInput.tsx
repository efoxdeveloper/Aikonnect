import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ContactCustomFieldDefinition } from "@/pages/contact.types";

function valueAsString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function ContactCustomFieldInput({
  field,
  value,
  onChange,
  compact = false,
  hideLabel = false,
}: {
  field: ContactCustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  compact?: boolean;
  hideLabel?: boolean;
}) {
  const inputId = `custom-field-${field.id}`;
  const label = hideLabel ? null : (
    <label htmlFor={inputId} className={cn("mb-2 block font-medium", compact ? "text-xs" : "text-sm")}>
      {field.label}
      {field.required ? <span className="ml-1 text-[var(--danger)]">*</span> : <span className="ml-1 font-normal text-[var(--text-muted)]">(optional)</span>}
    </label>
  );

  if (field.type === "BOOLEAN") {
    return <div>{label}<Select value={typeof value === "boolean" ? String(value) : "__empty__"} onValueChange={(next) => onChange(next === "__empty__" ? undefined : next === "true")}><SelectTrigger id={inputId} aria-label={field.label} className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__empty__">Not set</SelectItem><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent></Select></div>;
  }
  if (field.type === "SELECT") {
    return <div>{label}<Select value={typeof value === "string" && value ? value : "__empty__"} onValueChange={(next) => onChange(next === "__empty__" ? undefined : next)}><SelectTrigger id={inputId} aria-label={field.label} className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__empty__">Not set</SelectItem>{field.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>;
  }
  if (field.type === "MULTI_SELECT") {
    const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return <fieldset><legend className={cn(hideLabel ? "sr-only" : "mb-2 font-medium", compact ? "text-xs" : "text-sm")}>{field.label}{!hideLabel && (field.required ? <span className="ml-1 text-[var(--danger)]">*</span> : <span className="ml-1 font-normal text-[var(--text-muted)]">(optional)</span>)}</legend><div id={inputId} className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] bg-white p-2">{field.options.map((option) => <label key={option} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-[var(--brand-soft)]"><input type="checkbox" checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} className="size-4 accent-[var(--brand)]" />{option}</label>)}</div></fieldset>;
  }
  return (
    <div>
      {label}
      <Input
        id={inputId}
        aria-label={field.label}
        type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
        required={field.required}
        maxLength={field.type === "TEXT" ? 5000 : undefined}
        value={valueAsString(value)}
        onChange={(event) => onChange(field.type === "NUMBER" ? event.target.value === "" ? undefined : Number(event.target.value) : event.target.value || undefined)}
        className="h-9"
      />
    </div>
  );
}
