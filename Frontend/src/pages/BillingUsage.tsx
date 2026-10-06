import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, CalendarDays, CheckCircle2, Info, MessageSquare, Plus, WalletCards } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { BillingShell } from "@/components/billing/BillingShell";
import { Link } from "react-router-dom";

type UsageData = {
  plan?: {
    name: string | null;
    status: "NONE" | "ACTIVE" | "TRIALING" | "EXPIRED";
    trialEndsAt: string | null;
    limits: { contacts: number | null; seats: number | null; campaignsPerMonth: number | null };
    usage: { contacts: number; seats: number; campaignsThisMonth: number };
    features: { apiAccess: boolean; webhooks: boolean; advancedReports: boolean };
  };
  wallet?: { currency: string; totalBalance: string; reservedBalance: string; availableBalance: string; lowBalanceThreshold: string; status: string; balanceMinorUnits: string; balance: string; configuredFromBackend: boolean };
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

type LedgerEntry = { id: string; direction: "CREDIT" | "DEBIT" | "HOLD" | "RELEASE"; amount?: string | null; amountMinorUnits?: string | null; closingTotalBalance?: string | null; balanceAfterMinorUnits?: string | null; transactionType?: string; reason?: string | null; description: string | null; createdAt: string };
type LedgerData = { items: LedgerEntry[]; pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean } };

const numberFormat = new Intl.NumberFormat("en-IN");
const moneyDisplayFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

function formatMinorUnits(currency: string, value: string, signed = false, direction?: LedgerEntry["direction"]) {
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

function formatMoney(currency: string, value: string | null | undefined, signed = false, direction?: LedgerEntry["direction"]) {
  if (value === null || value === undefined) return "—";
  const prefix = currency === "INR" ? "₹" : currency;
  const sign = signed ? direction === "DEBIT" ? "−" : direction === "CREDIT" ? "+" : "" : "";
  const amount = Number(value);
  return `${sign}${prefix} ${Number.isFinite(amount) ? moneyDisplayFormat.format(amount) : value}`;
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
    return <BillingShell><PageFrame title="Billing & Usage"><div className="rounded-lg border border-[var(--border-soft)] bg-white p-6 text-sm text-[var(--text-secondary)] shadow-[0_2px_8px_rgba(30,40,55,.04)]"><h2 className="text-sm font-medium text-[var(--text-primary)]">Billing access is restricted</h2><div className="mt-1">You do not have permission to view workspace usage.</div></div></PageFrame></BillingShell>;
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
    <BillingShell><PageFrame title="Billing & Usage">
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
          <MetricCard icon={<WalletCards size={17} />} label="Available balance" value={data.wallet ? formatMoney(data.wallet.currency, data.wallet.availableBalance ?? data.wallet.balance) : "--"} detail={data.wallet?.status === "ACTIVE" ? `Total ${formatMoney(data.wallet.currency, data.wallet.totalBalance ?? data.wallet.balance)}` : `Wallet ${data.wallet?.status?.toLowerCase() ?? "unavailable"}`} />
          <MetricCard icon={<WalletCards size={17} />} label="Reserved balance" value={data.wallet ? formatMoney(data.wallet.currency, data.wallet.reservedBalance ?? "0.000000") : "--"} detail="Held for pending messages" />
          <MetricCard icon={<MessageSquare size={17} />} label="Total messages" value={data.summary.totalMessages} detail={`${numberFormat.format(data.summary.incomingMessages)} incoming`} />
          <MetricCard icon={<BarChart3 size={17} />} label="Outbound messages" value={data.summary.outgoingMessages} detail={`${numberFormat.format(data.summary.deliveredMessages)} delivered`} />
          <MetricCard icon={<CheckCircle2 size={17} />} label="Read messages" value={data.summary.readMessages} detail={`${numberFormat.format(data.summary.failedMessages)} failed`} />
        </div>

        {data.plan && <PlanUsageCard plan={data.plan} />}

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

        {data.wallet && data.wallet.availableBalance < data.wallet.lowBalanceThreshold && <section className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><Info size={16} className="mt-0.5 shrink-0" /><div><div className="font-medium">Low wallet balance</div><div className="mt-0.5">Available balance is below your configured threshold of {formatMoney(data.wallet.currency, data.wallet.lowBalanceThreshold)}.</div></div></section>}
        <section className="mt-4 flex items-start gap-3 rounded-lg border border-[var(--border-soft)] bg-white p-4 text-xs leading-5 text-[var(--text-secondary)] shadow-[0_2px_8px_rgba(30,40,55,.04)]"><Info size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" /><div><div className="font-medium text-[var(--text-primary)]">Meta billing is separate</div><div className="mt-0.5">This page tracks internal usage. Meta charges the connected WhatsApp Business Account according to its message pricing and delivery rules.</div></div></section>
        <section className="mt-4 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-4 sm:px-6"><div><h2 className="text-sm font-medium text-[var(--text-primary)]">Wallet activity</h2><div className="mt-0.5 text-xs text-[var(--text-muted)]">Immutable credits, holds, charges, and releases</div></div><WalletCards size={18} className="text-[var(--brand)]" /></div>{ledger === null ? <div className="p-5 text-xs text-[var(--text-muted)]">Loading wallet activity…</div> : ledger.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="border-b border-[var(--border-soft)] bg-[var(--page-background)] text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Description</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3 text-right">Balance after</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{ledger.items.map((entry) => <tr key={entry.id}><td className="whitespace-nowrap px-5 py-3 text-[var(--text-muted)]">{new Date(entry.createdAt).toLocaleString()}</td><td className={`px-5 py-3 font-medium ${entry.direction === "CREDIT" ? "text-emerald-700" : entry.direction === "DEBIT" ? "text-amber-700" : "text-[var(--text-secondary)]"}`}>{entry.transactionType ?? entry.direction}</td><td className="px-5 py-3"><div className="font-medium text-[var(--text-primary)]">{entry.description ?? entry.reason ?? "Wallet transaction"}</div></td><td className={`px-5 py-3 text-right font-medium ${entry.direction === "CREDIT" ? "text-emerald-700" : "text-amber-700"}`}>{entry.amount ? formatMoney(data.wallet?.currency ?? "INR", entry.amount, true, entry.direction) : formatMinorUnits(data.wallet?.currency ?? "INR", entry.amountMinorUnits ?? "0", true, entry.direction)}</td><td className="px-5 py-3 text-right text-[var(--text-secondary)]">{entry.closingTotalBalance ? formatMoney(data.wallet?.currency ?? "INR", entry.closingTotalBalance) : formatMinorUnits(data.wallet?.currency ?? "INR", entry.balanceAfterMinorUnits ?? "0")}</td></tr>)}</tbody></table></div> : <div className="p-5 text-xs text-[var(--text-muted)]">No wallet activity has been recorded yet.</div>}</section>
      </>}
    </PageFrame></BillingShell>
  );
}

function PlanUsageCard({ plan }: { plan: NonNullable<UsageData["plan"]> }) {
  const limits = [
    { key: "contacts", label: "Contacts", used: plan.usage.contacts, limit: plan.limits.contacts },
    { key: "seats", label: "Team seats", used: plan.usage.seats, limit: plan.limits.seats },
    { key: "campaigns", label: "Campaigns this month", used: plan.usage.campaignsThisMonth, limit: plan.limits.campaignsPerMonth },
  ];
  const featureRows = [
    { key: "apiAccess", label: "API access", included: plan.features.apiAccess },
    { key: "webhooks", label: "Webhooks", included: plan.features.webhooks },
    { key: "advancedReports", label: "Advanced reports", included: plan.features.advancedReports },
  ];
  const statusLabel = plan.status === "TRIALING" ? "Free trial" : plan.status === "ACTIVE" ? "Active" : plan.status === "EXPIRED" ? "Trial ended" : "No active plan";
  return <section aria-label="Plan limits and features" className="mt-4 rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)] sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-sm font-medium text-[var(--text-primary)]">Plan usage</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{plan.name ?? statusLabel}{plan.name ? ` · ${statusLabel}` : ""}{plan.status === "TRIALING" && plan.trialEndsAt ? ` · Ends ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(plan.trialEndsAt))}` : ""}</p></div>
      <Link to="/billing/plans" className="inline-flex h-8 items-center rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white hover:opacity-90">View plans</Link>
    </div>
    {plan.status === "EXPIRED" && <div role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Your free trial has ended. Some features and actions are locked until you choose a plan.</div>}
    {plan.status === "NONE" && <div className="mt-4 rounded-md border border-[var(--border-soft)] bg-[var(--page-background)] px-3 py-2 text-xs text-[var(--text-secondary)]">No plan limits are currently assigned to this workspace.</div>}
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">{limits.map((item) => <div key={item.key}>
        <div className="flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-secondary)]">{item.label}</span><span className="font-medium text-[var(--text-primary)]">{numberFormat.format(item.used)} / {item.limit == null ? plan.status === "EXPIRED" ? "Plan ended" : "No limit" : numberFormat.format(item.limit)}</span></div>
        {item.limit != null && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"><div className={`h-full rounded-full ${item.used >= item.limit ? "bg-amber-500" : "bg-[var(--brand)]"}`} style={{ width: `${Math.min(100, item.limit > 0 ? item.used / item.limit * 100 : item.used > 0 ? 100 : 0)}%` }} /></div>}
      </div>)}</div>
      <div className="border-t border-[var(--border-soft)] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        <h3 className="text-xs font-medium text-[var(--text-primary)]">Plan features</h3>
        <ul className="mt-3 space-y-2">{featureRows.map((feature) => {
          const included = plan.status === "NONE" || feature.included;
          return <li key={feature.key} className="flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-secondary)]">{feature.label}</span><span className={included ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>{plan.status === "NONE" ? "Available" : included ? "Included" : "Locked"}</span></li>;
        })}</ul>
        {featureRows.some((feature) => plan.status !== "NONE" && !feature.included) && <p className="mt-3 text-[11px] leading-4 text-[var(--text-muted)]">Blocked actions explain the limit and link here so you can review available plans.</p>}
      </div>
    </div>
  </section>;
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: ReactNode; detail: string }) {
  return <section className="rounded-lg border border-[var(--border-soft)] bg-white p-4 shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="flex items-center justify-between"><div className="flex size-8 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]">{icon}</div><span className="text-2xl font-medium tracking-[-0.03em] text-[var(--text-primary)]">{typeof value === "number" ? numberFormat.format(value) : value}</span></div><div className="mt-3 text-xs font-medium text-[var(--text-secondary)]">{label}</div><div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{detail}</div></section>;
}

function PageFrame({ title, children }: { title: string; children: ReactNode }) {
  return <div data-testid="billing-usage-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]"><header className="flex-none border-b border-[var(--border-soft)] bg-white shadow-[0_1px_3px_rgba(30,40,55,.04)]"><div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-3 sm:px-8"><h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">{title}</h1><button type="button" aria-label="Add funds" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90"><Plus size={14} aria-hidden="true" />Add funds</button></div></header><main data-testid="billing-usage-scroll-region" className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-[1400px] px-5 py-5 sm:px-8 sm:py-7">{children}</div></main></div>;
}
