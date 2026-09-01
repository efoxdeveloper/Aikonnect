import { Bot, ListChecks, Settings, Workflow, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const links: Array<{ label: string; to: string; icon: LucideIcon; end?: boolean }> = [
  { label: "Automations", to: "/automations", icon: Bot },
  { label: "Workflows", to: "/workflows", icon: Workflow },
  { label: "Sequences", to: "/sequences", icon: ListChecks },
  { label: "Settings", to: "/automation-settings", icon: Settings },
];

export function AutomationShell({ children }: { children: React.ReactNode }) {
  return <div data-testid="automation-shell" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)] lg:flex-row">
    <aside className="hidden min-h-0 w-[184px] shrink-0 overflow-y-auto border-r border-[var(--border-soft)] bg-[#fbfcfc] px-3 py-4 lg:block">
      <div className="mb-4 flex h-9 items-center gap-2 px-2.5 text-[13px] font-semibold text-[var(--brand)]"><Bot size={16} /> Automation</div>
      <nav aria-label="Automation navigation" className="space-y-0.5">{links.map(({ label, to, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("flex h-10 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium transition-colors", isActive ? "bg-[var(--brand)] text-white" : "text-[var(--text-primary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]")}><Icon size={16} />{label}</NavLink>)}</nav>
    </aside>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <nav aria-label="Automation navigation" className="flex flex-none gap-1 overflow-x-auto border-b border-[var(--border-soft)] bg-white px-4 py-2 lg:hidden">{links.map(({ label, to, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium", isActive ? "bg-[var(--brand)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]")}><Icon size={14} />{label}</NavLink>)}</nav>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  </div>;
}
