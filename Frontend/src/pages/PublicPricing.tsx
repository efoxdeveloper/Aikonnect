import { useContext, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "@/lib/api";
import { AuthContext } from "@/contexts/AuthContext";
import { getActiveMembership } from "@/lib/workspace";

type PublicPlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currency: string;
  monthlyPriceMinorUnits: string;
  annualPriceMinorUnits: string;
  trialDays: number;
  maxSeats: number | null;
  maxContacts: number | null;
  maxCampaignsPerMonth: number | null;
  maxAutomations: number | null;
  maxWorkflows: number | null;
  maxPipelines: number | null;
  apiAccess: boolean;
  webhooks: boolean;
  advancedReports: boolean;
};
type BillingPeriod = "monthly" | "annual";

function formatPrice(currency: string, minorUnits: string) {
  const amount = Number(BigInt(minorUnits)) / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
}

function limit(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString("en-IN");
}

function planDescription(plan: PublicPlan) {
  if (!plan.description || plan.description.toLowerCase().startsWith("draft plan")) {
    return plan.slug === "enterprise" ? "Flexible capacity for complex operations." : `Everything your team needs to ${plan.slug === "starter" ? "get started" : "grow with WhatsApp"}.`;
  }
  return plan.description;
}

export function PublicPricing({ embedded = false }: { embedded?: boolean }) {
  const auth = useContext(AuthContext);
  const membership = getActiveMembership(auth?.user ?? null);
  const workspaceId = membership?.workspace.id;
  const canRequestPlan = membership?.role.permissions.includes("billing.manage") ?? false;
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<{ slug: string; billingPeriod: BillingPeriod } | null>(null);
  const [requestingPlanId, setRequestingPlanId] = useState<string | null>(null);
  const [requestResult, setRequestResult] = useState<{ id: string; planName: string; slug: string; billingPeriod: BillingPeriod; status: string } | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const annualAvailable = useMemo(() => plans.some((plan) => BigInt(plan.annualPriceMinorUnits) > 0n), [plans]);

  const loadPlans = () => {
    setLoading(true);
    setError(null);
    void apiRequest<{ items: PublicPlan[] }>("/plans")
      .then((result) => setPlans(result.items))
      .catch((caughtError) => setError(caughtError instanceof ApiError ? caughtError.message : "We couldn't load plans right now."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPlans(); }, []);
  useEffect(() => {
    document.title = "Plans & Pricing | Marento";
    return () => { document.title = "Marento"; };
  }, []);

  const visiblePlans = plans.filter((plan) => period === "monthly" || BigInt(plan.annualPriceMinorUnits) > 0n);
  const requestPlan = async (plan: PublicPlan) => {
    if (!workspaceId || !auth?.accessToken) {
      setRequestError("Sign in to your workspace to request a plan.");
      return;
    }
    if (!canRequestPlan) {
      setRequestError("You need billing management permission to request a plan.");
      return;
    }
    setRequestingPlanId(plan.id);
    setRequestError(null);
    try {
      const created = await apiRequest<{ id: string; status: string }>(`/workspaces/${workspaceId}/subscriptions/requests`, { method: "POST", headers: { authorization: `Bearer ${auth.accessToken}` }, body: JSON.stringify({ planId: plan.id, billingPeriod: period.toUpperCase() }) });
      setSelectedPlan({ slug: plan.slug, billingPeriod: period });
      setRequestResult({ id: created.id, planName: plan.name, slug: plan.slug, billingPeriod: period, status: created.status });
    } catch (caughtError) {
      setRequestError(caughtError instanceof ApiError ? caughtError.message : "Your plan request could not be submitted.");
    } finally {
      setRequestingPlanId(null);
    }
  };
  const allFeatures = [
    { label: "Team seats", value: (plan: PublicPlan) => limit(plan.maxSeats) },
    { label: "Contacts", value: (plan: PublicPlan) => limit(plan.maxContacts) },
    { label: "Campaigns / month", value: (plan: PublicPlan) => limit(plan.maxCampaignsPerMonth) },
    { label: "Automations", value: (plan: PublicPlan) => limit(plan.maxAutomations) },
    { label: "Workflows", value: (plan: PublicPlan) => limit(plan.maxWorkflows) },
    { label: "Pipelines", value: (plan: PublicPlan) => limit(plan.maxPipelines) },
  ];
  const billingToggle = annualAvailable && <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] bg-white p-1 shadow-sm" aria-label="Billing period">
    {(["monthly", "annual"] as const).map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`rounded-md px-4 py-2 text-xs font-medium capitalize transition-colors ${period === value ? "bg-[var(--brand)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--page-background)]"}`}>{value}{value === "annual" && <span className="ml-1.5 text-[10px] opacity-80">Annual billing</span>}</button>)}
  </div>;

  return <main data-testid={embedded ? "billing-plans-page" : "public-pricing-page"} className={`${embedded ? "flex h-full min-h-0 flex-col overflow-hidden" : "min-h-dvh"} bg-[var(--page-background)] text-[var(--text-primary)]`}>
    {!embedded && <header className="border-b border-[var(--border-soft)] bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/login" className="flex items-center gap-2.5" aria-label="Marento home"><img src="/brand-logo-icon-oly.png" alt="" className="size-9 rounded-lg object-contain" /><span className="text-lg font-semibold tracking-tight">Marento</span></Link>
        <nav className="flex items-center gap-4 text-sm"><Link to="/login" className="text-[var(--text-secondary)] hover:text-[var(--brand)]">Log in</Link><Link to="/register" className="rounded-md bg-[var(--brand)] px-3.5 py-2 text-xs font-medium text-white hover:opacity-90">Create account</Link></nav>
      </div>
    </header>}

    {embedded && <header className="flex flex-none items-center border-b border-[var(--border-soft)] bg-white px-5 py-3 sm:px-8"><h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">Plans & pricing</h1></header>}
    {!embedded && <section className="mx-auto max-w-[1280px] px-5 pb-8 pt-14 text-center sm:px-8 sm:pt-20">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand)]/15 bg-[var(--brand-soft)] px-3 py-1 text-[11px] font-medium text-[var(--brand)]"><Sparkles size={13} /> Plans that grow with your team</div>
      <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">Simple pricing for better customer conversations</h1>
      <div className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">Choose the plan that fits your team. Every plan keeps your WhatsApp conversations, contacts, and follow-up work together.</div>
      {annualAvailable && <div className="mt-7">{billingToggle}</div>}
    </section>}

    <section className={`${embedded ? "min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-7" : "px-5 pb-16 sm:px-8"}`} aria-label="Available plans">
      {embedded && annualAvailable && <div className="mx-auto mb-5 flex max-w-[1280px] justify-end">{billingToggle}</div>}
      {loading && <div className="rounded-xl border border-[var(--border-soft)] bg-white p-12 text-center text-sm text-[var(--text-muted)]">Loading plans…</div>}
      {error && <div role="alert" className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700"><div>{error}</div><button type="button" onClick={loadPlans} className="mt-3 font-medium underline underline-offset-2">Try again</button></div>}
      {!loading && !error && visiblePlans.length === 0 && <div className="mx-auto max-w-xl rounded-xl border border-[var(--border-soft)] bg-white p-10 text-center shadow-sm"><h2 className="text-lg font-medium">Plans are being prepared</h2><div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Please check back soon.{!embedded && " You can create an account now and explore Marento with your team."}</div>{!embedded && <Link to="/register" className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white">Create an account <ArrowRight size={15} /></Link>}</div>}
      {!loading && !error && visiblePlans.length > 0 && <div className={`grid items-stretch gap-4 ${visiblePlans.length === 1 ? "mx-auto max-w-md" : visiblePlans.length === 2 ? "mx-auto max-w-3xl md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4"}`}>
        {visiblePlans.map((plan) => {
          const amount = period === "annual" ? plan.annualPriceMinorUnits : plan.monthlyPriceMinorUnits;
          const featured = plan.slug === "growth";
          return <article key={plan.id} className={`relative flex flex-col rounded-xl border bg-white p-5 shadow-[0_4px_18px_rgba(30,40,55,.045)] sm:p-6 ${featured ? "border-[var(--brand)] ring-1 ring-[var(--brand)]" : "border-[var(--border-soft)]"}`}>
            {featured && <div className="absolute -top-3 left-5 rounded-full bg-[var(--brand)] px-3 py-1 text-[10px] font-semibold text-white">MOST POPULAR</div>}
            <div className="flex items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">{plan.name}</h2><div className="mt-1 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">{planDescription(plan)}</div></div>{plan.trialDays > 0 && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">{plan.trialDays}-day trial</span>}</div>
            <div className="mt-5 flex items-baseline gap-1"><span className="text-3xl font-semibold tracking-[-0.04em]">{formatPrice(plan.currency, amount)}</span><span className="text-xs text-[var(--text-muted)]">/{period === "monthly" ? "month" : "year"}</span></div>
            {embedded ? <button type="button" aria-label={`Request ${plan.name} plan`} disabled={!canRequestPlan || Boolean(requestingPlanId)} aria-pressed={selectedPlan?.slug === plan.slug && selectedPlan.billingPeriod === period} onClick={() => void requestPlan(plan)} className={`mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${requestResult?.slug === plan.slug && requestResult.billingPeriod === period ? "bg-emerald-600 text-white" : featured ? "bg-[var(--brand)] text-white hover:opacity-90" : "border border-[var(--border-strong)] bg-white text-[var(--text-primary)] hover:bg-[var(--page-background)]"}`}>{requestingPlanId === plan.id ? "Submitting…" : requestResult?.slug === plan.slug && requestResult.billingPeriod === period ? "Request submitted" : "Request plan"}<ArrowRight size={14} /></button> : <Link to={`/register?plan=${encodeURIComponent(plan.slug)}&billing=${period}`} aria-label={`Choose ${plan.name}`} className={`mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold transition-opacity hover:opacity-90 ${featured ? "bg-[var(--brand)] text-white" : "border border-[var(--border-strong)] bg-white text-[var(--text-primary)]"}`}>Choose plan<ArrowRight size={14} /></Link>}
            <div className="mt-5 border-t border-[var(--border-soft)] pt-4"><div className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--text-muted)]">Plan includes</div><ul className="mt-3 space-y-2.5 text-xs text-[var(--text-secondary)]">
              <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />WhatsApp inbox, contacts, templates, and campaigns</li>
              {allFeatures.map(({ label, value }) => <li key={label} className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" /><span>{value(plan)} {label.toLowerCase()}</span></li>)}
              {plan.apiAccess && <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />API access</li>}
              {plan.webhooks && <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />Webhooks</li>}
              {plan.advancedReports && <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />Advanced reports</li>}
            </ul></div>
          </article>;
        })}
      </div>}
      {embedded && requestError && <div role="alert" className="mx-auto mt-5 max-w-[1280px] rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{requestError}</div>}
      {embedded && requestResult && selectedPlan && (() => {
        const plan = plans.find((item) => item.slug === selectedPlan.slug);
        if (!plan) return null;
        const selectedAmount = selectedPlan.billingPeriod === "annual" ? plan.annualPriceMinorUnits : plan.monthlyPriceMinorUnits;
        return <div role="status" className="mx-auto mt-5 flex max-w-[1280px] flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900"><span><strong>{plan.name}</strong> request submitted at {formatPrice(plan.currency, selectedAmount)} / {selectedPlan.billingPeriod === "monthly" ? "month" : "year"}. An admin must review it. Approval does not collect payment.</span><Link to="/billing/subscriptions" className="shrink-0 font-semibold underline underline-offset-2">View subscriptions</Link></div>;
      })()}
      {!loading && !error && visiblePlans.length > 0 && <div className="mx-auto mt-7 max-w-[1280px] rounded-lg border border-[var(--border-soft)] bg-white px-4 py-3 text-center text-[11px] leading-5 text-[var(--text-muted)]">WhatsApp message charges are separate and depend on Meta pricing. {embedded ? "Subscription activation and payment checkout are not enabled yet." : "Create an account to get started; subscription activation and payment checkout are not enabled yet."}</div>}
    </section>
  </main>;
}
