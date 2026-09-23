import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, CalendarDays, CheckCircle2, Info, MessageSquare, Users, WalletCards } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";

type UsageData = {
  wallet?: { currency: string; balanceMinorUnits: string; balance: string; configuredFromBackend: boolean };
  filters: { from: string; to: string };
  summary: {
    totalMessages: number;
    incomingMessages: number;
    outgoingMessages: number;
    deliveredMessages: number;
    readMessages: number;
    failedMessages: number;
    engagedContacts: number;
    activeConversations: number;
    mediaMessages: number;
  };
  breakdown: Array<{ key: string; label: string; messages: number; percentage: number }>;
  daily: Array<{ date: string; total: number; incoming: number; outgoing: number; delivered: number }>;
};

type LedgerEntry = { id: string; direction: "CREDIT" | "DEBIT"; amountMinorUnits: string; balanceAfterMinorUnits: string; reason: string; description: string | null; createdAt: string };
type LedgerData = { items: LedgerEntry[]; pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean } };

const numberFormat = new Intl.NumberFormat("en-IN");

function dateRange(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function dateBoundary(value: string, endOfDay: boolean) {
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(value));
}

function formatMinorUnits(currency: string, value: string, signed = false, direction?: "CREDIT" | "DEBIT") {
  try {
    const minor = BigInt(value);
    const absolute = minor < 0n ? -minor : minor;
    const amount = `${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
    const prefix = currency === "INR" ? "₹" : currency;
    return `${signed ? direction === "DEBIT" ? "−" : "+" : ""}${prefix} ${amount}`;
  } catch {
    return "—";
  }
}

export function BillingUsage() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canRead = membership?.role.permissions.includes("billing.read") ?? false;
  const [days, setDays] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [data, setData] = useState<UsageData | null>(null);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !accessToken || !canRead) {
      setLoading(false);
      return;
    }
    let active = true;
    const range = appliedRange ?? dateRange(days);
    const params = new URLSearchParams(range);
    setLoading(true);
    setError(null);
    setLedger(null);
    void apiRequest<UsageData>(`/workspaces/${workspaceId}/usage?${params.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
      .then((result) => { if (active) setData(result); })
      .catch((caughtError) => { if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to load usage."); })
      .finally(() => { if (active) setLoading(false); });
    void apiRequest<LedgerData>(`/workspaces/${workspaceId}/wallet/ledger?page=1&pageSize=50`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
      .then((result) => { if (active) setLedger(result); })
      .catch(() => { if (active) setLedger({ items: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1, hasNext: false, hasPrevious: false } }); });
    return () => { active = false; };
  }, [accessToken, appliedRange, canRead, days, workspaceId]);

  const maxDaily = useMemo(() => Math.max(1, ...(data?.daily.map((item) => item.total) ?? [])), [data]);

  if (!canRead) {
    return <PageFrame title="Billing & Usage"><div className="rounded-lg border border-[var(--border-soft)] bg-white p-6 text-sm text-[var(--text-secondary)] shadow-[0_2px_8px_rgba(30,40,55,.04)]"><h2 className="text-sm font-medium text-[var(--text-primary)]">Billing access is restricted</h2><div className="mt-1">You do not have permission to view workspace usage.</div></div></PageFrame>;
  }

  const applyCustomRange = () => {
    if (!customFrom || !customTo) {
      setCustomRangeError("Choose both a start date and an end date.");
      return;
    }
    if (customFrom > customTo) {
      setCustomRangeError("The start date must be before the end date.");
      return;
    }
    const from = dateBoundary(customFrom, false);
    const to = dateBoundary(customTo, true);
    if (new Date(to).getTime() - new Date(from).getTime() > 366 * 24 * 60 * 60 * 1000) {
      setCustomRangeError("Choose a date range of 366 days or less.");
      return;
    }
    setCustomRangeError(null);
    setAppliedRange({ from, to });
  };

  return (
    <PageFrame title="Billing & Usage">
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><CalendarDays size={15} /><span>{data ? `${formatDate(data.filters.from)} – ${formatDate(data.filters.to)}` : "Usage period"}</span></div>
          <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-white p-1" aria-label="Usage period">
            {[7, 30, 90].map((period) => <button key={period} type="button" onClick={() => { setDays(period); setAppliedRange(null); setCustomRangeError(null); }} className={`h-7 rounded px-2.5 text-[11px] font-medium transition-colors ${!appliedRange && days === period ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"}`}>{period} days</button>)}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--border)] bg-white p-2.5">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--text-secondary)]"><span>From</span><input aria-label="Usage start date" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="h-8 rounded-md border border-[var(--border-strong)] bg-white px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]" /></label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--text-secondary)]"><span>To</span><input aria-label="Usage end date" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="h-8 rounded-md border border-[var(--border-strong)] bg-white px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]" /></label>
          <button type="button" onClick={applyCustomRange} className="h-8 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90">Apply date range</button>
        </div>
        {customRangeError && <div role="alert" className="text-xs text-[var(--danger)]">{customRangeError}</div>}
      </div>

      {error && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{error}</div>}
      {loading && !data ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="h-28 animate-pulse rounded-lg bg-slate-200" /><div className="h-28 animate-pulse rounded-lg bg-slate-200" /><div className="h-28 animate-pulse rounded-lg bg-slate-200" /><div className="h-28 animate-pulse rounded-lg bg-slate-200" /></div> : data && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={<WalletCards size={17} />} label="Wallet balance" value={data.wallet ? `${data.wallet.currency === "INR" ? "₹" : data.wallet.currency} ${data.wallet.balance}` : "--"} detail={data.wallet?.configuredFromBackend ? "Configured by backend" : "Persisted wallet balance"} />
          <MetricCard icon={<MessageSquare size={17} />} label="Total messages" value={data.summary.totalMessages} detail={`${numberFormat.format(data.summary.incomingMessages)} incoming`} />
          <MetricCard icon={<BarChart3 size={17} />} label="Outbound messages" value={data.summary.outgoingMessages} detail={`${numberFormat.format(data.summary.deliveredMessages)} delivered`} />
          <MetricCard icon={<CheckCircle2 size={17} />} label="Read messages" value={data.summary.readMessages} detail={`${numberFormat.format(data.summary.failedMessages)} failed`} />
          <MetricCard icon={<Users size={17} />} label="Engaged contacts" value={data.summary.engagedContacts} detail={`${numberFormat.format(data.summary.activeConversations)} conversations`} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]">
          <section className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)] sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-medium text-[var(--text-primary)]">Message activity</h2><div className="mt-0.5 text-xs text-[var(--text-muted)]">Messages recorded by day</div></div><BarChart3 size={18} className="text-[var(--brand)]" /></div>
            {data.daily.length ? <div className="mt-6 flex h-44 items-end gap-1 border-b border-[var(--border-soft)] px-1">{data.daily.map((item) => <div key={item.date} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${formatDate(item.date)}: ${item.total} messages`}><div aria-label={`${formatDate(item.date)}: ${item.total} messages`} className="w-full rounded-t-sm bg-[var(--brand)]/70 transition-colors group-hover:bg-[var(--brand)]" style={{ height: `${Math.max(4, (item.total / maxDaily) * 100)}%` }} /></div>)}</div> : <div className="flex h-44 items-center justify-center text-xs text-[var(--text-muted)]">No messages in this period.</div>}
            {data.daily.length > 0 && <div className="mt-2 flex justify-between px-1 text-[10px] text-[var(--text-muted)]"><span>{formatDate(data.daily[0].date)}</span><span>{formatDate(data.daily[Math.floor(data.daily.length / 2)].date)}</span><span>{formatDate(data.daily[data.daily.length - 1].date)}</span></div>}
          </section>

          <section className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)] sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-medium text-[var(--text-primary)]">Usage breakdown</h2><div className="mt-0.5 text-xs text-[var(--text-muted)]">Internal message sources</div></div><MessageSquare size={18} className="text-[var(--brand)]" /></div>
            <div className="mt-5 space-y-4">{data.breakdown.map((item) => <div key={item.key}><div className="flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-secondary)]">{item.label}</span><span className="font-medium text-[var(--text-primary)]">{numberFormat.format(item.messages)}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"><div className="h-full rounded-full bg-[var(--brand-accent)]" style={{ width: `${item.percentage}%` }} /></div></div>)}</div>
            <div className="mt-5 flex items-start gap-2 border-t border-[var(--border-soft)] pt-4 text-[11px] leading-4 text-[var(--text-muted)]"><Info size={14} className="mt-0.5 shrink-0" />Counts are based on messages recorded in Marento.</div>
          </section>
        </div>

        <section className="mt-4 flex items-start gap-3 rounded-lg border border-[var(--border-soft)] bg-white p-4 text-xs leading-5 text-[var(--text-secondary)] shadow-[0_2px_8px_rgba(30,40,55,.04)]"><Info size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" /><div><div className="font-medium text-[var(--text-primary)]">Meta billing is separate</div><div className="mt-0.5">This page tracks internal usage. Meta charges the connected WhatsApp Business Account according to its message pricing and delivery rules.</div></div></section>
        <section className="mt-4 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-4 sm:px-6"><div><h2 className="text-sm font-medium text-[var(--text-primary)]">Wallet activity</h2><div className="mt-0.5 text-xs text-[var(--text-muted)]">Manual credits and debits recorded in the immutable ledger</div></div><WalletCards size={18} className="text-[var(--brand)]" /></div>{ledger === null ? <div className="p-5 text-xs text-[var(--text-muted)]">Loading wallet activity…</div> : ledger.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="border-b border-[var(--border-soft)] bg-[var(--page-background)] text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3 text-right">Balance after</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{ledger.items.map((entry) => <tr key={entry.id}><td className="whitespace-nowrap px-5 py-3 text-[var(--text-muted)]">{new Date(entry.createdAt).toLocaleString()}</td><td className={`px-5 py-3 font-medium ${entry.direction === "CREDIT" ? "text-emerald-700" : "text-amber-700"}`}>{entry.direction === "CREDIT" ? "Credit" : "Debit"}</td><td className="px-5 py-3"><div className="font-medium text-[var(--text-primary)]">{entry.reason}</div>{entry.description && <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{entry.description}</div>}</td><td className={`px-5 py-3 text-right font-medium ${entry.direction === "CREDIT" ? "text-emerald-700" : "text-amber-700"}`}>{formatMinorUnits(data.wallet?.currency ?? "INR", entry.amountMinorUnits, true, entry.direction)}</td><td className="px-5 py-3 text-right text-[var(--text-secondary)]">{formatMinorUnits(data.wallet?.currency ?? "INR", entry.balanceAfterMinorUnits)}</td></tr>)}</tbody></table></div> : <div className="p-5 text-xs text-[var(--text-muted)]">No wallet activity has been recorded yet.</div>}</section>
      </>}
    </PageFrame>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: ReactNode; detail: string }) {
  return <section className="rounded-lg border border-[var(--border-soft)] bg-white p-4 shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="flex items-center justify-between"><div className="flex size-8 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]">{icon}</div><span className="text-2xl font-medium tracking-[-0.03em] text-[var(--text-primary)]">{typeof value === "number" ? numberFormat.format(value) : value}</span></div><div className="mt-3 text-xs font-medium text-[var(--text-secondary)]">{label}</div><div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{detail}</div></section>;
}

function PageFrame({ title, children }: { title: string; children: ReactNode }) {
  return <div data-testid="billing-usage-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]"><header className="flex-none border-b border-[var(--border-soft)] bg-white shadow-[0_1px_3px_rgba(30,40,55,.04)]"><div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-3 sm:px-8"><h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">{title}</h1><span className="rounded-md bg-[var(--brand-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand)]">Internal tracking</span></div></header><main data-testid="billing-usage-scroll-region" className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-[1400px] px-5 py-5 sm:px-8 sm:py-7">{children}</div></main></div>;
}
