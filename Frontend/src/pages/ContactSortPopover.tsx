import { useState, type DragEvent } from "react";
import { ArrowUpDown, ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ContactSortField = "name" | "phone" | "email" | "createdAt" | "updatedAt" | "source" | "profileName";
export type ContactSortDirection = "asc" | "desc";
export type ContactSortRule = { field: ContactSortField; direction: ContactSortDirection };

export const defaultContactSortRules: ContactSortRule[] = [{ field: "createdAt", direction: "desc" }];

const sortFields: Array<{ field: ContactSortField; label: string }> = [
  { field: "name", label: "Contact Name" },
  { field: "phone", label: "Phone Number" },
  { field: "email", label: "Email ID" },
  { field: "createdAt", label: "Created On" },
  { field: "updatedAt", label: "Last Updated" },
  { field: "source", label: "Source" },
  { field: "profileName", label: "WhatsApp Profile Name" },
];

export const contactSortFieldLabels = Object.fromEntries(
  sortFields.map(({ field, label }) => [field, label]),
) as Record<ContactSortField, string>;

function availableFields(canViewPhone: boolean) {
  return sortFields.filter(({ field }) => field !== "phone" || canViewPhone);
}

export function ContactSortPopover({
  rules,
  canViewPhone,
  onApply,
}: {
  rules: ContactSortRule[];
  canViewPhone: boolean;
  onApply: (rules: ContactSortRule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ContactSortRule[]>(rules);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const fields = availableFields(canViewPhone);
  const maxRules = Math.min(5, fields.length);

  const setPopoverOpen = (nextOpen: boolean) => {
    if (nextOpen) setDraft(rules.map((rule) => ({ ...rule })));
    setOpen(nextOpen);
    if (!nextOpen) setDraggedIndex(null);
  };
  const updateRule = (index: number, update: Partial<ContactSortRule>) => {
    setDraft((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...update } : rule));
  };
  const addRule = () => {
    const used = new Set(draft.map(({ field }) => field));
    const nextField = fields.find(({ field }) => !used.has(field))?.field;
    if (nextField) setDraft((current) => [...current, { field: nextField, direction: "asc" }]);
  };
  const removeRule = (index: number) => {
    setDraft((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
  };
  const moveRule = (sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex || sourceIndex < 0 || targetIndex < 0) return;
    setDraft((current) => {
      const next = [...current];
      next.splice(targetIndex, 0, next.splice(sourceIndex, 1)[0]);
      return next;
    });
  };
  const dropRule = (event: DragEvent<HTMLDivElement>, targetIndex: number) => {
    event.preventDefault();
    if (draggedIndex !== null) moveRule(draggedIndex, targetIndex);
    setDraggedIndex(null);
  };
  const reset = () => setDraft(defaultContactSortRules.map((rule) => ({ ...rule })));
  const apply = () => {
    onApply(draft.length ? draft : defaultContactSortRules);
    setPopoverOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Configure sorting"
          className="ml-auto flex h-10 shrink-0 items-center rounded-md border border-[var(--border)] bg-white px-3 text-[13px] hover:bg-[var(--brand-soft)]"
        >
          <ArrowUpDown size={16} className="mr-2 text-[var(--brand)]" />
          Sort
          <span className="ml-2 flex size-5 items-center justify-center rounded bg-[var(--brand-soft)] text-[11px] font-medium text-[var(--brand)]">
            {rules.length}
          </span>
          <ChevronDown size={15} className={cn("ml-2 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[460px] max-w-[calc(100vw-24px)] p-0">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h3>Sort contacts</h3>
          <p className="mt-1">Rules are applied from top to bottom.</p>
        </div>
        <div className="max-h-[340px] space-y-2 overflow-y-auto p-4 scrollbar-subtle">
          {draft.map((rule, index) => {
            const selectedElsewhere = new Set(draft.filter((_, ruleIndex) => ruleIndex !== index).map(({ field }) => field));
            return (
              <div
                key={`${rule.field}-${index}`}
                draggable
                data-testid={`contact-sort-rule-${index}`}
                onDragStart={() => setDraggedIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropRule(event, index)}
                onDragEnd={() => setDraggedIndex(null)}
                className={cn(
                  "grid grid-cols-[28px_minmax(0,1fr)_132px_32px] items-center gap-2 rounded-md border border-[var(--border-soft)] bg-[#fbfcfd] p-2",
                  draggedIndex === index && "opacity-50",
                )}
              >
                <div className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)]">
                  <GripVertical size={14} aria-hidden="true" />
                  {index + 1}
                </div>
                <Select value={rule.field} onValueChange={(field) => updateRule(index, { field: field as ContactSortField })}>
                  <SelectTrigger aria-label={`Field for sort priority ${index + 1}`} className="h-9 min-w-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map(({ field, label }) => (
                      <SelectItem key={field} value={field} disabled={selectedElsewhere.has(field)}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={rule.direction} onValueChange={(direction) => updateRule(index, { direction: direction as ContactSortDirection })}>
                  <SelectTrigger aria-label={`Direction for sort priority ${index + 1}`} className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  aria-label={`Remove sort priority ${index + 1}`}
                  disabled={draft.length === 1}
                  onClick={() => removeRule(index)}
                  className="flex size-8 items-center justify-center rounded-md text-[var(--danger)] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            disabled={draft.length >= maxRules}
            onClick={addRule}
            className="flex h-9 items-center text-xs font-medium text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={15} className="mr-1.5" />Add field
          </button>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border)] bg-white px-4 py-3">
          <button type="button" onClick={reset} className="h-9 px-2 text-xs font-medium text-[var(--brand)] hover:underline">Reset to default</button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPopoverOpen(false)} className="h-9 rounded-md border border-[var(--border)] px-4 text-xs font-medium">Cancel</button>
            <button type="button" onClick={apply} className="h-9 rounded-md bg-[var(--brand)] px-4 text-xs font-medium text-white">Apply sort</button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
