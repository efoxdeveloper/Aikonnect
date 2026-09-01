import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Drawer, DrawerCloseButton, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { automationTriggers } from "@/config/automation-triggers";
import type { AutomationTriggerType } from "@/types/automation";

type TriggerSelectorProps = {
  value: AutomationTriggerType | null;
  onChange: (value: AutomationTriggerType) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

export function TriggerSelector({ value, onChange, open: controlledOpen, onOpenChange, hideTrigger = false }: TriggerSelectorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const open = controlledOpen ?? internalOpen;
  const selected = automationTriggers.find((item) => item.type === value);
  const grouped = useMemo(() => automationTriggers.filter((item) => `${item.label} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase())).reduce<Record<string, typeof automationTriggers>>((groups, item) => {
    (groups[item.category] ??= []).push(item);
    return groups;
  }, {}), [query]);

  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return <>
    {!hideTrigger && <button type="button" onClick={() => setOpen(true)} className="flex min-h-24 w-full items-center gap-3 rounded-md border border-dashed border-[var(--brand)]/35 bg-[var(--brand-soft)]/25 p-4 text-left hover:bg-[var(--brand-soft)]/45">
      {selected ? <>
        <selected.icon size={22} className="shrink-0 text-[var(--brand)]" />
        <span className="min-w-0 flex-1">
          <strong className="block text-sm font-medium text-[var(--text-primary)]">{selected.label}</strong>
          <span className="mt-1 block text-xs text-[var(--text-secondary)]">{selected.description}</span>
        </span>
        <span className="text-xs font-medium text-[var(--brand)]">Change</span>
      </> : <span className="mx-auto text-sm font-medium text-[var(--brand)]">+ Select Trigger</span>}
    </button>}
    <Drawer open={open} onOpenChange={setOpen} direction="right">
      <DrawerContent className="h-full max-h-screen">
        <DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] pr-14">
          <DrawerTitle>Select a trigger</DrawerTitle>
          <DrawerDescription>Choose what starts this automation.</DrawerDescription>
          <DrawerCloseButton />
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-[var(--text-muted)]" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search triggers" className="h-10 pl-9 pr-9" />
            {query && <button type="button" aria-label="Clear trigger search" onClick={() => setQuery("")} className="absolute right-2 top-2 flex size-6 items-center justify-center text-[var(--text-muted)]"><X size={14} /></button>}
          </div>
          {Object.entries(grouped).map(([category, items]) => <section key={category} className="mb-5">
            <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--text-muted)]">{category}</h3>
            <div className="space-y-1">{items.map((item) => <button key={item.type} type="button" onClick={() => { onChange(item.type); setOpen(false); }} className="flex w-full items-start gap-3 rounded-md border border-transparent p-3 text-left hover:border-[var(--brand)]/20 hover:bg-[var(--brand-soft)]">
              <item.icon size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" />
              <span><strong className="block text-sm font-medium">{item.label}</strong><span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">{item.description}</span></span>
            </button>)}</div>
          </section>)}
          {!Object.keys(grouped).length && <div className="py-10 text-center text-sm text-[var(--text-secondary)]">No triggers match your search.</div>}
        </div>
      </DrawerContent>
    </Drawer>
  </>;
}
