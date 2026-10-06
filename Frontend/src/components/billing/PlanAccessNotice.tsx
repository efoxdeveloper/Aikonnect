import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

type PlanAccessIssue = { code: string; message: string };

export function PlanAccessNotice() {
  const [issue, setIssue] = useState<PlanAccessIssue | null>(null);

  useEffect(() => {
    const onBlocked = (event: Event) => {
      const detail = (event as CustomEvent<PlanAccessIssue>).detail;
      if (detail?.message) setIssue(detail);
    };
    window.addEventListener("marento:plan-access-blocked", onBlocked);
    return () => window.removeEventListener("marento:plan-access-blocked", onBlocked);
  }, []);

  if (!issue) return null;
  return <aside role="alert" aria-live="assertive" className="fixed bottom-5 right-5 z-[100] w-[min(420px,calc(100vw-2.5rem))] rounded-lg border border-amber-200 bg-white p-4 shadow-lg">
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-[var(--text-primary)]">Plan restriction</h2><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{issue.message}</p>
        <Link to="/billing/plans" onClick={() => setIssue(null)} className="mt-3 inline-flex h-8 items-center rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white hover:opacity-90">View plans and pricing</Link>
      </div>
      <button type="button" aria-label="Dismiss plan restriction notice" onClick={() => setIssue(null)} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]"><X size={15} /></button>
    </div>
  </aside>;
}
