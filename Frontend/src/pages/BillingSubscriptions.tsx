import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarClock, CreditCard, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import { BillingShell } from "@/components/billing/BillingShell";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";

type Subscription = {
  id: string;
  planName: string;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "INCOMPLETE";
  billingPeriod: "MONTHLY" | "ANNUAL";
  currency: string;
  amountMinorUnits: string;
  startedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  createdAt: string;
};
type PlanRequestSummary = { id: string; planName: string; billingPeriod: "MONTHLY" | "ANNUAL"; currency: string; amountMinorUnits: string; trialDays: number; status: "PENDING" | "APPROVED" | "REJECTED"; adminNote: string | null; createdAt: string; decidedAt: string | null };
type SubscriptionData = { active: Subscription | null; items: Subscription[]; requests?: PlanRequestSummary[] };

function amount(subscription: { currency: string; amountMinorUnits: string }) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: subscription.currency, maximumFractionDigits: 2 }).format(Number(BigInt(subscription.amountMinorUnits)) / 100);
  } catch {
    return "—";
  }
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
}

function statusLabel(status: string) {
  return status.split("_").map((part) => part[0] + part.slice(1).toLowerCase()).join(" ");
}

function StatusBadge({ status }: { status: Subscription["status"] }) {
  const color = status === "ACTIVE" || status === "TRIALING" ? "bg-emerald-50 text-emerald-700" : status === "PAST_DUE" ? "bg-amber-50 text-amber-800" : status === "INCOMPLETE" ? "bg-slate-100 text-slate-600" : "bg-rose-50 text-rose-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${color}`}>{statusLabel(status)}</span>;
}

function RequestBadge({ status }: { status: PlanRequestSummary["status"] }) {
  const styles = status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : status === "REJECTED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${styles}`}>{statusLabel(status)}</span>;
}

export function BillingSubscriptions() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canRead = membership?.role.permissions.includes("billing.read") ?? false;
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!workspaceId || !accessToken || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void apiRequest<SubscriptionData>(`/workspaces/${workspaceId}/subscriptions`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then(setData)
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Unable to load subscriptions."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [accessToken, canRead, workspaceId]);

  if (!canRead) return <BillingShell><div data-testid="billing-subscriptions-page" className="flex h-full items-center justify-center p-6"><section className="max-w-md rounded-md border border-[var(--border-soft)] bg-white p-8 text-center"><CreditCard className="mx-auto text-[var(--brand)]" size={28} /><h1 className="mt-4 text-lg font-semibold">Billing access is restricted</h1><div className="mt-2 text-sm text-[var(--text-secondary)]">You do not have permission to view workspace subscriptions.</div></section></div></BillingShell>;

  return <BillingShell><div data-testid="billing-subscriptions-page" className="flex h-full min-h-0 flex-col overflow-hidden">
    <header className="flex flex-none items-center justify-between border-b border-[var(--border-soft)] bg-white px-5 py-3 sm:px-8"><h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">Subscriptions</h1><Link to="/billing/plans" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white hover:opacity-90">View plans <ArrowUpRight size={14} /></Link></header>
    <main data-testid="billing-subscriptions-scroll-region" className="min-h-0 flex-1 overflow-y-auto bg-[var(--page-background)]"><div className="mx-auto w-full max-w-[1400px] space-y-5 px-5 py-5 sm:px-8 sm:py-7">
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={load} className="font-medium underline underline-offset-2">Try again</button></div>}
      {loading && !data && <div className="h-36 animate-pulse rounded-lg border border-[var(--border-soft)] bg-white" aria-label="Loading subscriptions" />}
      {data?.requests && data.requests.length > 0 && <section className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_3px_12px_rgba(30,40,55,.045)]"><div className="border-b border-[var(--border-soft)] px-5 py-4 sm:px-6"><h2 className="text-sm font-medium text-[var(--text-primary)]">Plan requests</h2><p className="mt-1 text-xs text-[var(--text-muted)]">An administrator reviews each request manually. No payment is collected here.</p></div><div className="divide-y divide-[var(--border-soft)]">{data.requests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-[var(--text-primary)]">{request.planName}</span><RequestBadge status={request.status} /></div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{request.billingPeriod === "MONTHLY" ? "Monthly" : "Annual"} · requested {date(request.createdAt)}{request.trialDays > 0 ? ` · ${request.trialDays}-day trial if approved` : ""}</div>{request.adminNote && <div className="mt-1 text-xs text-[var(--text-secondary)]">Admin note: {request.adminNote}</div>}</div><div className="text-sm font-semibold text-[var(--text-primary)]">{amount(request)}<span className="ml-1 text-[11px] font-normal text-[var(--text-muted)]">/ {request.billingPeriod === "MONTHLY" ? "month" : "year"}</span></div></div>)}</div></section>}
      {!loading && !error && !data?.active && <section className="flex min-h-52 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-white p-8 text-center"><div><div className="mx-auto flex size-11 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><CreditCard size={21} /></div><h2 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">No active subscription</h2><p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-[var(--text-secondary)]">Choose a plan to get started. Your current plan and billing dates will appear here once a subscription is activated.</p><Link to="/billing/plans" className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white">Explore plans <ArrowUpRight size={14} /></Link></div></section>}
      {data?.active && <section aria-label="Active subscription" className="rounded-lg border border-[var(--brand)]/25 bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><CreditCard size={17} className="text-[var(--brand)]" /><h2 className="text-sm font-medium text-[var(--text-primary)]">Active subscription</h2></div><div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xl font-semibold text-[var(--text-primary)]">{data.active.planName}</span><StatusBadge status={data.active.status} /></div></div><div className="text-right"><div className="text-xl font-semibold text-[var(--text-primary)]">{amount(data.active)}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">/ {data.active.billingPeriod === "MONTHLY" ? "month" : "year"}</span></div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{data.active.status === "TRIALING" ? "Trial" : "Subscription"} started {date(data.active.startedAt)}</div></div></div><div className="mt-5 grid gap-3 border-t border-[var(--border-soft)] pt-4 text-xs sm:grid-cols-3"><div><div className="text-[var(--text-muted)]">{data.active.status === "TRIALING" ? "Trial ends" : "Current period ends"}</div><div className="mt-1 flex items-center gap-1.5 font-medium text-[var(--text-primary)]"><CalendarClock size={14} className="text-[var(--brand)]" />{date(data.active.status === "TRIALING" ? data.active.trialEndsAt : data.active.currentPeriodEndsAt)}</div></div><div><div className="text-[var(--text-muted)]">Billing period</div><div className="mt-1 font-medium text-[var(--text-primary)]">{data.active.billingPeriod === "MONTHLY" ? "Monthly" : "Annual"}</div></div><div><div className="text-[var(--text-muted)]">Renewal</div><div className="mt-1 font-medium text-[var(--text-primary)]">{data.active.cancelAtPeriodEnd ? `Ends ${date(data.active.currentPeriodEndsAt)}` : "Renews automatically"}</div></div></div></section>}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_3px_12px_rgba(30,40,55,.045)]"><div className="flex flex-none items-center justify-between border-b border-[var(--border-soft)] px-5 py-4 sm:px-6"><div><div className="flex items-center gap-2"><ReceiptText size={16} className="text-[var(--brand)]" /><h2 className="text-sm font-medium text-[var(--text-primary)]">All subscriptions</h2></div><div className="mt-1 text-xs text-[var(--text-muted)]">Current and previous plans for this workspace</div></div><span className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">{data?.items.length ?? 0}</span></div>
        <div data-testid="billing-subscription-list-scroll-region" className="min-h-0 flex-1 overflow-auto">{loading && !data ? <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading subscriptions…</div> : error && !data ? <div className="p-8 text-center text-xs text-[var(--text-muted)]">Subscription history is unavailable.</div> : data?.items.length ? <table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[#fafbfd] text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Billing</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3">Started</th><th className="px-5 py-3">Period ends</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{data.items.map((subscription) => <tr key={subscription.id} className="hover:bg-[var(--brand-soft)]/20"><td className="px-5 py-3.5 font-medium text-[var(--text-primary)]">{subscription.planName}</td><td className="px-4 py-3.5"><StatusBadge status={subscription.status} /></td><td className="px-4 py-3.5 text-[var(--text-secondary)]">{subscription.billingPeriod === "MONTHLY" ? "Monthly" : "Annual"}</td><td className="px-4 py-3.5 text-right font-medium text-[var(--text-primary)]">{amount(subscription)}</td><td className="px-4 py-3.5 text-[var(--text-secondary)]">{date(subscription.startedAt ?? subscription.createdAt)}</td><td className="px-5 py-3.5 text-[var(--text-secondary)]">{date(subscription.currentPeriodEndsAt ?? subscription.endedAt)}</td></tr>)}</tbody></table> : <div className="p-8 text-center text-xs text-[var(--text-muted)]">No subscription history for this workspace yet.</div>}</div>
      </section>
      <div className="flex items-start gap-2 rounded-md border border-[var(--border-soft)] bg-white p-4 text-[11px] leading-5 text-[var(--text-muted)]"><CalendarClock size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />Subscription history and renewal details are shown from this workspace’s billing records. WhatsApp message charges remain separate from plan fees.</div>
    </div></main>
  </div></BillingShell>;
}
