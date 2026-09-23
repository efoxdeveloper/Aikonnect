import { useEffect, useState } from "react";
import { Users, Building2, MessageSquare, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, ApiError } from "@/lib/api";

type AdminOverview = {
  users: { active?: number; suspended?: number; disabled?: number };
  workspaces: number;
  connectedWhatsAppAccounts: number;
  activeSessions: number;
  whatsappAccountsByStatus?: Record<string, number>;
  recentWorkspaces?: Array<{ id: string; name: string; slug: string; createdAt: string; ownerName: string; status: string; _count: { memberships: number; contacts: number; messages: number; whatsappBusinessAccounts: number } }>;
};

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return <div className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="flex items-center justify-between"><span className="text-xs text-[var(--text-muted)]">{label}</span><Icon size={17} className="text-[var(--brand)]" aria-hidden="true" /></div><div className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{value.toLocaleString()}</div></div>;
}

function statusLabel(value: string) { return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }

export function AdminDashboard() {
  const { accessToken, user } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void apiRequest<AdminOverview>("/admin/overview", { headers: { authorization: `Bearer ${accessToken}` } })
      .then((result) => { if (!cancelled) setOverview(result); })
      .catch((caughtError: unknown) => { if (!cancelled) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load the admin overview."); });
    return () => { cancelled = true; };
  }, [accessToken]);

  return <div data-testid="admin-dashboard" className="min-h-full bg-[var(--page-background)] p-5 sm:p-8">
    <div className="mx-auto max-w-[1400px]">
      <header className="flex flex-col gap-3 border-b border-[var(--border-soft)] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-[22px] font-medium tracking-[-0.02em] text-[var(--text-primary)]">Admin overview</h1></div>
        <div className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs text-[var(--text-secondary)]">Signed in as {user?.email}</div>
      </header>
      {error && <div role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {!overview && !error ? <div className="mt-6 rounded-lg border border-[var(--border-soft)] bg-white p-6 text-sm text-[var(--text-muted)]">Loading platform overview…</div> : overview && <>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Workspaces" value={overview.workspaces} icon={Building2} />
          <MetricCard label="Active users" value={overview.users.active ?? 0} icon={Users} />
          <MetricCard label="Connected WhatsApp accounts" value={overview.connectedWhatsAppAccounts} icon={MessageSquare} />
          <MetricCard label="Active sessions" value={overview.activeSessions} icon={Activity} />
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="border-b border-[var(--border-soft)] px-5 py-4"><h2 className="text-sm font-medium text-[var(--text-primary)]">Recent workspaces</h2></div>{overview.recentWorkspaces?.length ? <div className="divide-y divide-[var(--border-soft)]">{overview.recentWorkspaces.map((workspace) => <div key={workspace.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-medium text-[var(--text-primary)]">{workspace.name}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{workspace.slug} · Owner {workspace.ownerName}</div></div><div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]"><span className="rounded-md bg-[var(--brand-soft)] px-2 py-1 text-[var(--brand)]">{statusLabel(workspace.status)}</span><span>{workspace._count.memberships} people</span><span>{workspace._count.contacts} contacts</span><span>{new Date(workspace.createdAt).toLocaleDateString()}</span></div></div>)}</div> : <div className="p-6 text-sm text-[var(--text-muted)]">No workspaces found.</div>}</section>
          <section className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)]"><h2 className="text-sm font-medium text-[var(--text-primary)]">WhatsApp connection health</h2><div className="mt-4 space-y-3 text-xs">{Object.entries(overview.whatsappAccountsByStatus ?? {}).map(([status, count]) => <div key={status} className="flex items-center justify-between border-t border-[var(--border-soft)] pt-3"><span className="text-[var(--text-muted)]">{statusLabel(status)}</span><span className="font-medium text-[var(--text-primary)]">{count}</span></div>)}{!Object.keys(overview.whatsappAccountsByStatus ?? {}).length && <div className="text-[var(--text-muted)]">No WhatsApp accounts connected.</div>}</div></section>
        </div>
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><h2 className="font-medium">Read-only control plane</h2><p className="mt-1">High-impact operations remain disabled until their individual permission, confirmation, and audit workflows are implemented.</p></section>
      </>}
    </div>
  </div>;
}
