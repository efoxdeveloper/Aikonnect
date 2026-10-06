import { useCallback, useContext, useEffect, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api";
import { AuthContext } from "@/contexts/AuthContext";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";
type PlanRequest = {
  id: string;
  planName: string;
  billingPeriod: "MONTHLY" | "ANNUAL";
  currency: string;
  amountMinorUnits: string;
  trialDays: number;
  status: RequestStatus;
  customerNote: string | null;
  adminNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  subscription: { id: string; status: string } | null;
  workspace: { id: string; name: string; slug: string };
  requestedBy: { id: string; firstName: string; lastName: string; email: string };
  reviewedBy: { id: string; firstName: string; lastName: string; email: string } | null;
};
type ListResult = { items: PlanRequest[]; pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean } };

function money(item: PlanRequest) {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: item.currency, maximumFractionDigits: 2 }).format(Number(BigInt(item.amountMinorUnits)) / 100); }
  catch { return `${item.currency} ${item.amountMinorUnits}`; }
}
function when(value: string) { return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

export function PlanRequestManager() {
  const auth = useContext(AuthContext);
  const accessToken = auth?.accessToken;
  const [status, setStatus] = useState<RequestStatus | "">("PENDING");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (status) query.set("status", status);
    void apiRequest<ListResult>(`/admin/plan-requests?${query}`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((value) => setResult({ items: Array.isArray(value?.items) ? value.items : [], pagination: value?.pagination ?? { page: 1, pageSize: 50, total: 0, totalPages: 1, hasNext: false, hasPrevious: false } }))
      .catch((caughtError) => setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load customer plan requests."))
      .finally(() => setLoading(false));
  }, [accessToken, page, status]);

  useEffect(() => { load(); }, [load]);

  const decide = async (item: PlanRequest, decision: "APPROVE" | "REJECT") => {
    const prompt = decision === "APPROVE"
      ? `Approve ${item.planName} for ${item.workspace.name}? This manually activates the subscription; no payment will be collected.`
      : `Reject the ${item.planName} request from ${item.workspace.name}?`;
    if (!window.confirm(prompt)) return;
    setWorkingId(item.id);
    setError(null);
    setNotice(null);
    try {
      const outcome = await apiRequest<{ status: RequestStatus; subscriptionStatus: string | null }>(`/admin/plan-requests/${item.id}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ decision }) });
      setNotice(decision === "APPROVE" ? `Request approved. Subscription status: ${outcome.subscriptionStatus ?? "active"}.` : "Plan request rejected.");
      load();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "The plan request could not be reviewed.");
    } finally {
      setWorkingId(null);
    }
  };

  return <section className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-4"><div><h2 className="text-sm font-medium text-[var(--text-primary)]">Customer plan requests</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Review requests and manually activate or reject them. Approval does not collect payment.</p></div><div className="flex items-center gap-2"><select aria-label="Plan request status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as RequestStatus | ""); }} className="h-8 rounded-md border border-[var(--border)] bg-white px-2 text-xs"><option value="PENDING">Pending</option><option value="">All requests</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><button type="button" aria-label="Refresh plan requests" onClick={load} className="flex size-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--page-background)]"><RefreshCw size={14} /></button></div></div>
    {error && <div role="alert" className="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
    {notice && <div role="status" className="mx-5 mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</div>}
    <div data-testid="plan-request-scroll-region" className="max-h-[min(520px,calc(100dvh-360px))] min-h-[120px] overflow-auto">
      {loading && !result ? <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading plan requests…</div> : result?.items.length ? <table className="w-full min-w-[920px] text-left text-xs"><thead className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[#fafbfd] text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-4 py-3">Workspace / requester</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Requested</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Review</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{result.items.map((item) => <tr key={item.id} className="align-top"><td className="px-4 py-3.5"><div className="font-medium text-[var(--text-primary)]">{item.workspace.name}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{item.requestedBy.firstName} {item.requestedBy.lastName} · {item.requestedBy.email}</div></td><td className="px-4 py-3.5"><div className="font-medium text-[var(--text-primary)]">{item.planName}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{item.billingPeriod.toLowerCase()} · {item.trialDays ? `${item.trialDays}-day trial` : "No trial"}</div>{item.customerNote && <div className="mt-1 max-w-[220px] text-[11px] text-[var(--text-muted)]">{item.customerNote}</div>}</td><td className="whitespace-nowrap px-4 py-3.5 font-medium">{money(item)} / {item.billingPeriod === "MONTHLY" ? "month" : "year"}</td><td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{when(item.createdAt)}</td><td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${item.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : item.status === "REJECTED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{item.status.toLowerCase()}</span>{item.subscription && <div className="mt-1 text-[10px] text-[var(--text-muted)]">Subscription {item.subscription.status.toLowerCase()}</div>}{item.adminNote && <div className="mt-1 max-w-[190px] text-[10px] text-[var(--text-muted)]">{item.adminNote}</div>}</td><td className="px-4 py-3.5"><div className="flex justify-end gap-1.5">{item.status === "PENDING" ? <><button type="button" disabled={Boolean(workingId)} onClick={() => void decide(item, "APPROVE")} className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-[11px] font-medium text-white disabled:opacity-50">{workingId === item.id ? "Saving…" : <><Check size={13} />Approve</>}</button><button type="button" disabled={Boolean(workingId)} onClick={() => void decide(item, "REJECT")} className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] disabled:opacity-50"><X size={13} />Reject</button></> : <span className="text-[11px] text-[var(--text-muted)]">Reviewed {item.decidedAt ? when(item.decidedAt) : "—"}</span>}</div></td></tr>)}</tbody></table> : <div className="p-8 text-center text-xs text-[var(--text-muted)]">{error ? "Plan requests could not be loaded." : "No plan requests in this view."}</div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] px-5 py-3 text-[11px] text-[var(--text-muted)]"><span>{result?.pagination.total ?? 0} request{result?.pagination.total === 1 ? "" : "s"} · Page {result?.pagination.page ?? page} of {result?.pagination.totalPages ?? 1}</span><div className="flex items-center gap-2"><button type="button" disabled={!result?.pagination.hasPrevious || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-7 rounded border border-[var(--border)] px-2.5 disabled:opacity-40">Previous</button><button type="button" disabled={!result?.pagination.hasNext || loading} onClick={() => setPage((value) => value + 1)} className="h-7 rounded border border-[var(--border)] px-2.5 disabled:opacity-40">Next</button></div><span>Approval manually activates the requested plan without charging.</span></div>
  </section>;
}
