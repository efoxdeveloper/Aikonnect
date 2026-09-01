import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Drawer, DrawerCloseButton, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { automationActions } from "@/config/automation-actions";
import type { AutomationActionType } from "@/types/automation";

export function ActionSelector({ onChange, variant = "default", excludeTypes = [] }: { onChange: (value: AutomationActionType) => void; variant?: "default" | "node"; excludeTypes?: AutomationActionType[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => automationActions.filter((item) => !excludeTypes.includes(item.type)).filter((item) => `${item.label} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase())).reduce<Record<string, typeof automationActions>>((groups, item) => {
    (groups[item.category] ??= []).push(item);
    return groups;
  }, {}), [excludeTypes, query]);

  return <>
    <button
      type="button"
      aria-label="Add action"
      onClick={() => setOpen(true)}
      className={variant === "node"
        ? "nodrag nopan flex size-24 items-center justify-center border border-dashed border-[#b9d9da] bg-white text-[var(--brand)] shadow-[0_5px_16px_rgba(30,40,55,.08)] transition hover:-translate-y-0.5 hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]/30"
        : "flex h-10 w-full items-center justify-center rounded-md border border-dashed border-[var(--brand)]/35 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]"}
    >
      {variant === "node" ? <Plus size={25} /> : "+ Add Action"}
    </button>
    <Drawer open={open} onOpenChange={setOpen} direction="right">
      <DrawerContent className="h-full max-h-screen">
        <DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] pr-14">
          <DrawerTitle>Choose an action</DrawerTitle>
          <DrawerDescription>Choose what should happen next.</DrawerDescription>
          <DrawerCloseButton />
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-[var(--text-muted)]" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actions" className="h-10 pl-9" />
          </div>
          {Object.entries(grouped).map(([category, items]) => <section key={category} className="mb-5">
            <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--text-muted)]">{category}</h3>
            <div className="space-y-1">{items.map((item) => <button key={item.type} type="button" onClick={() => { onChange(item.type); setOpen(false); }} className="flex w-full items-start gap-3 rounded-md border border-transparent p-3 text-left hover:border-[var(--brand)]/20 hover:bg-[var(--brand-soft)]">
              <item.icon size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" />
              <span><strong className="block text-sm font-medium">{item.label}</strong><span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{item.description}</span></span>
            </button>)}</div>
          </section>)}
        </div>
      </DrawerContent>
    </Drawer>
  </>;
}
