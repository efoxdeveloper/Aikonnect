import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BarChart3, CalendarDays, CheckCircle2, Info, MessageSquare, Plus, WalletCards } from "lucide-react";
import { openCheckout } from "@paypilot/ntt/checkout";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { BillingShell } from "@/components/billing/BillingShell";
import { useSearchParams } from "react-router-dom";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canRead = membership?.role.permissions.includes("billing.read") ?? false;
  const canManage = membership?.role.permissions.includes("billing.manage") ?? false;
  const [days, setDays] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [data, setData] = useState<UsageData | null>(null);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupReturned, setTopupReturned] = useState(false);
  const [topupRequerying, setTopupRequerying] = useState(false);
  const [topupFinalStatus, setTopupFinalStatus] = useState<string | null>(null);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupNotice, setTopupNotice] = useState<string | null>(null);
  const [activeTopup, setActiveTopup] = useState<{ id: string; status: string; checkoutEnvironment?: string | null; checkout: { type: "SDK_TOKEN"; token: string; merchantId: string; environment: string; returnUrl?: string } | null } | null>(null);

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

  useEffect(() => {
    const returnedTopupId = searchParams.get("walletTopup");
    if (!returnedTopupId || !workspaceId || !accessToken || !canRead) return;
    let active = true;
    setTopupOpen(true);
    setTopupReturned(true);
    setTopupRequerying(true);
    setTopupFinalStatus(null);
    setTopupError(null);
    void apiRequest<{ id: string; status: string; checkoutEnvironment?: string | null; checkout: { type: "SDK_TOKEN"; token: string; merchantId: string; environment: string; returnUrl?: string } | null }>(`/workspaces/${workspaceId}/wallet/topups/${returnedTopupId}`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((result) => { if (active) { setActiveTopup(result); setTopupNotice("Payment returned from NTT. Checking the verified recharge status…"); } })
      .then(async () => {
        if (!active) return;
        const result = await apiRequest<{ id: string; status: string; checkoutEnvironment?: string | null; checkout: { type: "SDK_TOKEN"; token: string; merchantId: string; environment: string; returnUrl?: string } | null }>(`/workspaces/${workspaceId}/wallet/topups/${returnedTopupId}/requery`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
        if (active) { setActiveTopup(result); setTopupFinalStatus(result.status); setTopupRequerying(false); }
        if (active && result.status === "SUCCESS") {
          setTopupNotice("Recharge complete. Your wallet balance has been updated.");
          const range = appliedRange ?? dateRange(days);
          const params = new URLSearchParams(range);
          const [updatedUsage, updatedLedger] = await Promise.all([
            apiRequest<UsageData>(`/workspaces/${workspaceId}/usage?${params.toString()}`, { headers: { authorization: `Bearer ${accessToken}` } }),
            apiRequest<LedgerData>(`/workspaces/${workspaceId}/wallet/ledger?page=1&pageSize=50`, { headers: { authorization: `Bearer ${accessToken}` } }),
          ]);
          if (active) { setData(updatedUsage); setLedger(updatedLedger); }
        } else if (active) setTopupNotice(`Recharge status: ${result.status.toLowerCase()}.`);
      })
      .catch((caughtError) => { if (active) { setTopupRequerying(false); setTopupError(caughtError instanceof Error ? caughtError.message : "Unable to verify the recharge status."); } })
      .finally(() => { if (active) { searchParams.delete("walletTopup"); searchParams.delete("paymentReturn"); setSearchParams(searchParams, { replace: true }); } });
    return () => { active = false; };
  // The return URL is handled once per payment reference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, canRead, workspaceId]);

  if (!canRead) {
    return <BillingShell><PageFrame title="Billing & Usage" canAddFunds={false} onAddFunds={() => undefined}><div className="rounded-lg border border-[var(--border-soft)] bg-white p-6 text-sm text-[var(--text-secondary)] shadow-[0_2px_8px_rgba(30,40,55,.04)]"><h2 className="text-sm font-medium text-[var(--text-primary)]">Billing access is restricted</h2><div className="mt-1">You do not have permission to view workspace usage.</div></div></PageFrame></BillingShell>;
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

  const startTopup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !accessToken) return;
    setTopupBusy(true); setTopupReturned(false); setTopupError(null); setTopupNotice(null);
    try {
      const result = await apiRequest<{ id: string; status: string; customerMobile: string; checkoutEnvironment?: string | null; checkout: { type: "SDK_TOKEN"; token: string; merchantId: string; environment: string; returnUrl?: string } | null }>(`/workspaces/${workspaceId}/wallet/topups`, {
        method: "POST", headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ amount: topupAmount, idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `wallet-topup-${Date.now()}` }),
      });
      setActiveTopup(result);
      if (result.checkout?.environment !== "MOCK" && result.checkout) {
        // NTT renders its checkout in the current page. Close the Radix modal
        // first so its overlay and focus trap do not cover the gateway UI.
        setTopupOpen(false);
        setTopupReturned(true);
        setTopupRequerying(false);
        setTopupFinalStatus(null);
        await openCheckout({
          checkout: result.checkout,
          customer: { email: user?.email ?? "", mobile: result.customerMobile },
          onClose: () => {
            setTopupOpen(true);
            setTopupReturned(true);
            setTopupRequerying(true);
            setTopupFinalStatus(null);
            void refreshTopup(false, result.id);
          },
        });
        setTopupNotice("Complete payment in the NTT checkout window. The wallet updates after the payment is verified.");
      } else if (result.status === "SUCCESS") {
        setTopupNotice("Recharge complete. Your wallet balance has been updated.");
      } else {
        setTopupNotice("NTT mock mode is active. Use the button below to simulate a verified payment.");
      }
    } catch (caughtError) {
      setTopupOpen(true);
      setTopupError(caughtError instanceof Error ? caughtError.message : "Unable to start the wallet recharge.");
    } finally { setTopupBusy(false); }
  };

  const refreshTopup = async (mock = false, topupId = activeTopup?.id) => {
    if (!workspaceId || !accessToken || !topupId) return;
    if (topupReturned) { setTopupRequerying(true); setTopupError(null); }
    setTopupBusy(true); setTopupError(null);
    try {
      const path = `/workspaces/${workspaceId}/wallet/topups/${topupId}${mock ? "/mock-success" : "/requery"}`;
      const result = await apiRequest<{ id: string; status: string; checkoutEnvironment?: string | null; checkout: { type: "SDK_TOKEN"; token: string; merchantId: string; environment: string; returnUrl?: string } | null }>(path, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
      setActiveTopup(result);
      setTopupFinalStatus(result.status);
      setTopupRequerying(false);
      if (result.status === "SUCCESS") {
        setTopupNotice("Recharge complete. Your wallet balance has been updated.");
        const range = appliedRange ?? dateRange(days);
        const params = new URLSearchParams(range);
        const [updatedUsage, updatedLedger] = await Promise.all([
          apiRequest<UsageData>(`/workspaces/${workspaceId}/usage?${params.toString()}`, { headers: { authorization: `Bearer ${accessToken}` } }),
          apiRequest<LedgerData>(`/workspaces/${workspaceId}/wallet/ledger?page=1&pageSize=50`, { headers: { authorization: `Bearer ${accessToken}` } }),
        ]);
        setData(updatedUsage); setLedger(updatedLedger);
      } else setTopupNotice(`Recharge status: ${result.status.toLowerCase()}.`);
    } catch (caughtError) { setTopupError(caughtError instanceof Error ? caughtError.message : "Unable to refresh payment status."); }
    finally { setTopupRequerying(false); setTopupBusy(false); }
  };

  return (
    <BillingShell><PageFrame title="Billing & Usage" canAddFunds={canManage} onAddFunds={() => { setTopupReturned(false); setTopupRequerying(false); setTopupFinalStatus(null); setTopupOpen(true); setTopupError(null); setTopupNotice(null); }}>
      <Dialog.Root open={topupOpen} onOpenChange={setTopupOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[130] bg-slate-950/45 backdrop-blur-[1px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[131] flex max-h-[calc(100vh-32px)] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_24px_70px_rgba(15,23,42,.24)]">
            <header className="flex flex-none items-start justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-4">
              <div><Dialog.Title className="text-sm font-semibold text-[var(--text-primary)]">{topupReturned ? topupRequerying ? "Checking payment" : topupFinalStatus === "SUCCESS" ? "Payment successful" : topupFinalStatus && ["FAILED", "CANCELLED", "EXPIRED"].includes(topupFinalStatus) ? "Payment not completed" : "Payment status" : "Add funds"}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[var(--text-muted)]">{topupReturned ? topupRequerying ? "Confirming the transaction with NTT. This may take a moment." : "The verified transaction status is shown below." : "Enter an amount to recharge your wallet."}</Dialog.Description></div>
              {!topupReturned && <Dialog.Close aria-label="Close recharge dialog" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-lg leading-none text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]">×</Dialog.Close>}
            </header>
            {topupReturned ? <>
              <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center" aria-live="polite">
                {topupRequerying ? <><span className="size-9 animate-spin rounded-full border-[3px] border-[var(--brand-soft)] border-t-[var(--brand)]" aria-hidden="true" /><p role="status" className="text-sm font-medium text-[var(--text-primary)]">Processing transaction…</p><p className="max-w-xs text-xs leading-5 text-[var(--text-muted)]">Please wait while we confirm the final status.</p></> : topupError ? <><span className="flex size-10 items-center justify-center rounded-full bg-amber-50 text-lg text-amber-700" aria-hidden="true">!</span><p role="alert" className="text-sm font-medium text-[var(--text-primary)]">We couldn’t confirm the payment yet.</p><p className="max-w-xs text-xs leading-5 text-[var(--text-muted)]">{topupError}</p></> : topupFinalStatus === "SUCCESS" ? <><CheckCircle2 size={38} className="text-emerald-600" aria-hidden="true" /><p role="status" className="text-sm font-medium text-[var(--text-primary)]">Recharge complete</p><p className="text-xs text-[var(--text-muted)]">Your wallet balance has been updated.</p></> : topupFinalStatus && ["FAILED", "CANCELLED", "EXPIRED"].includes(topupFinalStatus) ? <><span className="flex size-10 items-center justify-center rounded-full bg-red-50 text-xl text-red-600" aria-hidden="true">×</span><p role="status" className="text-sm font-medium text-[var(--text-primary)]">Transaction {topupFinalStatus.toLowerCase()}</p><p className="text-xs text-[var(--text-muted)]">No funds were added to your wallet.</p></> : <><Info size={36} className="text-amber-600" aria-hidden="true" /><p role="status" className="text-sm font-medium text-[var(--text-primary)]">Payment status: {topupFinalStatus?.toLowerCase() ?? "unknown"}</p><p className="text-xs text-[var(--text-muted)]">The gateway has not reported a final result yet.</p></>}
              </div>
              <footer className="flex flex-none justify-end gap-2 border-t border-[var(--border-soft)] px-5 py-4">{(topupError || (topupFinalStatus && !["SUCCESS", "FAILED", "CANCELLED", "EXPIRED"].includes(topupFinalStatus))) && <button type="button" onClick={() => void refreshTopup(false)} disabled={topupBusy || topupRequerying} className="h-9 rounded-md border border-[var(--border)] px-4 text-xs font-medium text-[var(--text-secondary)] disabled:opacity-50">{topupBusy || topupRequerying ? "Checking…" : "Check again"}</button>}<Dialog.Close asChild><button type="button" disabled={topupRequerying} className="h-9 rounded-md bg-[var(--brand)] px-4 text-xs font-medium text-white disabled:opacity-50">{topupRequerying ? "Please wait…" : "Done"}</button></Dialog.Close></footer>
            </> : <form onSubmit={(event) => void startTopup(event)} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
                <label htmlFor="wallet-topup-amount" className="flex flex-col gap-1.5 text-xs font-medium text-[var(--text-secondary)]"><span>Amount (INR)</span><input id="wallet-topup-amount" required min="1" max="99999999" step="0.01" inputMode="decimal" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)} placeholder="500.00" className="h-10 rounded-md border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--brand)]" /></label>
                {topupError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{topupError}</div>}
                {topupNotice && <div role="status" className="rounded-md border border-[var(--border-soft)] bg-[var(--page-background)] px-3 py-2 text-xs text-[var(--text-secondary)]">{topupNotice}</div>}
                {activeTopup && activeTopup.status !== "SUCCESS" && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void refreshTopup(false)} disabled={topupBusy} className="h-8 rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--text-secondary)] disabled:opacity-50">{topupBusy ? "Checking…" : "Check payment status"}</button>{(activeTopup.checkoutEnvironment ?? activeTopup.checkout?.environment) === "MOCK" && <button type="button" onClick={() => void refreshTopup(true)} disabled={topupBusy} className="h-8 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-900 disabled:opacity-50">Simulate mock payment</button>}</div>}
              </div>
              <footer className="flex flex-none justify-end gap-2 border-t border-[var(--border-soft)] px-5 py-4"><Dialog.Close asChild><button type="button" className="h-9 rounded-md border border-[var(--border)] px-4 text-xs font-medium text-[var(--text-secondary)]">Cancel</button></Dialog.Close><button type="submit" disabled={topupBusy || !topupAmount} className="h-9 rounded-md bg-[var(--brand)] px-4 text-xs font-medium text-white disabled:opacity-50">{topupBusy ? "Processing…" : "Proceed"}</button></footer>
            </form>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
          <MetricCard icon={<WalletCards size={17} />} label="Estimated wallet debit" value={data.wallet ? formatMoney(data.wallet.currency, data.wallet.reservedBalance ?? "0.000000") : "--"} detail="Held for pending delivery; released if delivery fails" />
          <MetricCard icon={<MessageSquare size={17} />} label="Total messages" value={data.summary.totalMessages} detail={`${numberFormat.format(data.summary.incomingMessages)} incoming`} />
          <MetricCard icon={<BarChart3 size={17} />} label="Outbound messages" value={data.summary.outgoingMessages} detail={`${numberFormat.format(data.summary.deliveredMessages)} delivered`} />
          <MetricCard icon={<CheckCircle2 size={17} />} label="Read messages" value={data.summary.readMessages} detail={`${numberFormat.format(data.summary.failedMessages)} failed`} />
        </div>

        {data.wallet && data.wallet.availableBalance < data.wallet.lowBalanceThreshold && <section className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><Info size={16} className="mt-0.5 shrink-0" /><div><div className="font-medium">Low wallet balance</div><div className="mt-0.5">Available balance is below your configured threshold of {formatMoney(data.wallet.currency, data.wallet.lowBalanceThreshold)}.</div></div></section>}
        <section className="mt-4 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-4 sm:px-6"><div><h2 className="text-sm font-medium text-[var(--text-primary)]">Wallet activity</h2><div className="mt-0.5 text-xs text-[var(--text-muted)]">Immutable credits, holds, charges, and releases</div></div><WalletCards size={18} className="text-[var(--brand)]" /></div>{ledger === null ? <div className="p-5 text-xs text-[var(--text-muted)]">Loading wallet activity…</div> : ledger.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="border-b border-[var(--border-soft)] bg-[var(--page-background)] text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Description</th><th className="whitespace-nowrap px-5 py-3 text-right">Amount</th><th className="whitespace-nowrap px-5 py-3 text-right">Balance after</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{ledger.items.map((entry) => <tr key={entry.id}><td className="whitespace-nowrap px-5 py-3 text-[var(--text-muted)]">{new Date(entry.createdAt).toLocaleString()}</td><td className={`px-5 py-3 font-medium ${entry.direction === "CREDIT" ? "text-emerald-700" : entry.direction === "DEBIT" ? "text-amber-700" : "text-[var(--text-secondary)]"}`}>{entry.transactionType ?? entry.direction}</td><td className="px-5 py-3"><div className="font-medium text-[var(--text-primary)]">{entry.description ?? entry.reason ?? "Wallet transaction"}</div></td><td className={`whitespace-nowrap px-5 py-3 text-right font-medium ${entry.direction === "CREDIT" ? "text-emerald-700" : "text-amber-700"}`}>{entry.amount ? formatMoney(data.wallet?.currency ?? "INR", entry.amount, true, entry.direction) : formatMinorUnits(data.wallet?.currency ?? "INR", entry.amountMinorUnits ?? "0", true, entry.direction)}</td><td className="whitespace-nowrap px-5 py-3 text-right text-[var(--text-secondary)]">{entry.closingTotalBalance ? formatMoney(data.wallet?.currency ?? "INR", entry.closingTotalBalance) : formatMinorUnits(data.wallet?.currency ?? "INR", entry.balanceAfterMinorUnits ?? "0")}</td></tr>)}</tbody></table></div> : <div className="p-5 text-xs text-[var(--text-muted)]">No wallet activity has been recorded yet.</div>}</section>
      </>}
    </PageFrame></BillingShell>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: ReactNode; detail: string }) {
  return <section className="rounded-lg border border-[var(--border-soft)] bg-white p-4 shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="flex items-center justify-between"><div className="flex size-8 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]">{icon}</div><span className="text-2xl font-medium tracking-[-0.03em] text-[var(--text-primary)]">{typeof value === "number" ? numberFormat.format(value) : value}</span></div><div className="mt-3 text-xs font-medium text-[var(--text-secondary)]">{label}</div><div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{detail}</div></section>;
}

function PageFrame({ title, children, canAddFunds, onAddFunds }: { title: string; children: ReactNode; canAddFunds: boolean; onAddFunds: () => void }) {
  return <div data-testid="billing-usage-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]"><header className="flex-none border-b border-[var(--border-soft)] bg-white shadow-[0_1px_3px_rgba(30,40,55,.04)]"><div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-3 sm:px-8"><h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">{title}</h1>{canAddFunds && <button type="button" onClick={onAddFunds} aria-label="Add funds" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90"><Plus size={14} aria-hidden="true" />Add funds</button>}</div></header><main data-testid="billing-usage-scroll-region" className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-[1400px] px-5 py-5 sm:px-8 sm:py-7">{children}</div></main></div>;
}
