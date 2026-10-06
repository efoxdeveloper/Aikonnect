import { useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api";

export type SubscriptionPlan = {
  id: string; name: string; slug: string; description: string | null; currency: string;
  monthlyPriceMinorUnits: string; annualPriceMinorUnits: string; trialDays: number;
  maxSeats: number | null; maxContacts: number | null; maxCampaignsPerMonth: number | null;
  maxAutomations: number | null; maxWorkflows: number | null; maxPipelines: number | null;
  apiAccess: boolean; webhooks: boolean; advancedReports: boolean; active: boolean; displayOrder: number;
};
type PlanDraft = {
  id?: string; name: string; slug: string; description: string; currency: string;
  monthlyPrice: string; annualPrice: string; trialDays: number;
  maxSeats: string; maxContacts: string; maxCampaignsPerMonth: string;
  maxAutomations: string; maxWorkflows: string; maxPipelines: string;
  apiAccess: boolean; webhooks: boolean; advancedReports: boolean; active: boolean; displayOrder: number;
};

const toAmount = (minor: string) => {
  const value = BigInt(minor);
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
};
const newDraft = (displayOrder: number): PlanDraft => ({ name: "", slug: "", description: "", currency: "INR", monthlyPrice: "0.00", annualPrice: "0.00", trialDays: 14, maxSeats: "", maxContacts: "", maxCampaignsPerMonth: "", maxAutomations: "", maxWorkflows: "", maxPipelines: "", apiAccess: false, webhooks: false, advancedReports: false, active: true, displayOrder });
const fromPlan = (plan: SubscriptionPlan): PlanDraft => ({ id: plan.id, name: plan.name, slug: plan.slug, description: plan.description ?? "", currency: plan.currency, monthlyPrice: toAmount(plan.monthlyPriceMinorUnits), annualPrice: toAmount(plan.annualPriceMinorUnits), trialDays: plan.trialDays, maxSeats: plan.maxSeats === null ? "" : String(plan.maxSeats), maxContacts: plan.maxContacts === null ? "" : String(plan.maxContacts), maxCampaignsPerMonth: plan.maxCampaignsPerMonth === null ? "" : String(plan.maxCampaignsPerMonth), maxAutomations: plan.maxAutomations === null ? "" : String(plan.maxAutomations), maxWorkflows: plan.maxWorkflows === null ? "" : String(plan.maxWorkflows), maxPipelines: plan.maxPipelines === null ? "" : String(plan.maxPipelines), apiAccess: plan.apiAccess, webhooks: plan.webhooks, advancedReports: plan.advancedReports, active: plan.active, displayOrder: plan.displayOrder });

export function PlanManager({ items, canManage, onRefresh }: { items: SubscriptionPlan[]; canManage: boolean; onRefresh: () => void }) {
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const update = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const startEdit = (plan: SubscriptionPlan) => { setDraft(fromPlan(plan)); setError(null); setMessage(null); };
  const remove = async (plan: SubscriptionPlan) => {
    if (!window.confirm(`Permanently delete the ${plan.name} plan?`)) return;
    setWorking(true); setError(null); setMessage(null);
    try { await apiRequest(`/admin/plans/${plan.id}`, { method: "DELETE" }); setMessage(`${plan.name} deleted.`); onRefresh(); }
    catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "The plan could not be deleted."); }
    finally { setWorking(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const slug = draft.slug.trim().toLowerCase();
    if (!draft.name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { setError("Enter a plan name and a lowercase slug using letters, numbers, and hyphens."); return; }
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(draft.monthlyPrice) || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(draft.annualPrice)) { setError("Enter valid non-negative monthly and annual prices with up to two decimal places."); return; }
    setWorking(true); setError(null); setMessage(null);
    const limit = (value: string) => value.trim() ? Number(value) : null;
    const body = { ...draft, slug, description: draft.description.trim() || null, trialDays: Number(draft.trialDays), displayOrder: Number(draft.displayOrder), maxSeats: limit(draft.maxSeats), maxContacts: limit(draft.maxContacts), maxCampaignsPerMonth: limit(draft.maxCampaignsPerMonth), maxAutomations: limit(draft.maxAutomations), maxWorkflows: limit(draft.maxWorkflows), maxPipelines: limit(draft.maxPipelines) };
    try {
      if (draft.id) await apiRequest(`/admin/plans/${draft.id}`, { method: "PUT", body: JSON.stringify(body) });
      else await apiRequest("/admin/plans", { method: "POST", body: JSON.stringify(body) });
      setMessage(draft.id ? `${draft.name} updated.` : `${draft.name} created.`); setDraft(null); onRefresh();
    } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "The plan could not be saved."); }
    finally { setWorking(false); }
  };
  const inputClass = "h-9 rounded-md border border-[var(--border)] bg-white px-2 text-xs outline-none focus:border-[var(--brand)]";
  const textField = (label: string, value: string | number, onChange: (value: string) => void, props: { type?: string; min?: number; max?: number; maxLength?: number; placeholder?: string; inputMode?: "decimal" } = {}) => <label key={label} className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">{label}<input aria-label={label} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} {...props} /></label>;
  const limits: Array<[keyof Pick<PlanDraft, "maxSeats" | "maxContacts" | "maxCampaignsPerMonth" | "maxAutomations" | "maxWorkflows" | "maxPipelines">, string]> = [["maxSeats", "Seats limit"], ["maxContacts", "Contacts limit"], ["maxCampaignsPerMonth", "Campaigns per month limit"], ["maxAutomations", "Automations limit"], ["maxWorkflows", "Workflows limit"], ["maxPipelines", "Pipelines limit"]];

  return <section className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)]">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-medium text-[var(--text-primary)]">Subscription plans</h2><div className="mt-1 text-xs text-[var(--text-muted)]">Manage prices, trial duration, feature access, and usage limits.</div></div>{canManage && <button type="button" onClick={() => { setDraft(newDraft(items.length)); setError(null); setMessage(null); }} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white"><Plus size={14} />Create plan</button>}</div>
    {error && <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}{message && <div role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</div>}
    {draft && canManage && <form onSubmit={(event) => void save(event)} className="mt-4 rounded-md border border-[var(--border-soft)] bg-[var(--page-background)] p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {textField("Plan name", draft.name, (value) => { update("name", value); if (!draft.id) update("slug", value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); })}
      {textField("Plan slug", draft.slug, (value) => update("slug", value))}
      {textField("Currency", draft.currency, (value) => update("currency", value.toUpperCase()), { maxLength: 3 })}
      {textField("Monthly price", draft.monthlyPrice, (value) => update("monthlyPrice", value), { inputMode: "decimal" })}
      {textField("Annual price", draft.annualPrice, (value) => update("annualPrice", value), { inputMode: "decimal" })}
      {textField("Trial days", draft.trialDays, (value) => update("trialDays", Number(value)), { type: "number", min: 0, max: 365 })}
      {textField("Plan description", draft.description, (value) => update("description", value), { maxLength: 1000 })}
      {textField("Display order", draft.displayOrder, (value) => update("displayOrder", Number(value)), { type: "number", min: 0 })}
      {limits.map(([key, label]) => textField(label, draft[key], (value) => update(key, value), { type: "number", min: 1, placeholder: "Unlimited" }))}
    </div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">{([["apiAccess", "API access"], ["webhooks", "Webhooks"], ["advancedReports", "Advanced reports"], ["active", "Active"]] as const).map(([key, label]) => <label key={key} className="inline-flex items-center gap-2"><input type="checkbox" checked={draft[key]} onChange={(event) => update(key, event.target.checked)} />{label}</label>)}</div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} disabled={working} className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-xs">Cancel</button><button type="submit" disabled={working} className="h-9 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white disabled:opacity-50">{working ? "Saving…" : draft.id ? "Save changes" : "Create plan"}</button></div></form>}
    <div data-testid="plan-table-scroll-region" className="mt-4 overflow-x-auto rounded-md border border-[var(--border-soft)]"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-[var(--page-background)] text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-3 py-2.5">Plan</th><th className="px-3 py-2.5">Price</th><th className="px-3 py-2.5">Trial</th><th className="px-3 py-2.5">Limits</th><th className="px-3 py-2.5">Features</th><th className="px-3 py-2.5">Status</th>{canManage && <th className="px-3 py-2.5">Actions</th>}</tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{items.map((plan) => <tr key={plan.id}><td className="px-3 py-3"><div className="font-medium">{plan.name}</div><div className="mt-1 text-[10px] text-[var(--text-muted)]">{plan.slug}</div></td><td className="whitespace-nowrap px-3 py-3">{plan.currency} {toAmount(plan.monthlyPriceMinorUnits)}/mo<br />{plan.currency} {toAmount(plan.annualPriceMinorUnits)}/yr</td><td className="px-3 py-3">{plan.trialDays} days</td><td className="px-3 py-3 text-[11px] text-[var(--text-secondary)]">{[["Seats", plan.maxSeats], ["Contacts", plan.maxContacts], ["Campaigns", plan.maxCampaignsPerMonth], ["Automations", plan.maxAutomations], ["Workflows", plan.maxWorkflows], ["Pipelines", plan.maxPipelines]].map(([label, limit]) => `${label}: ${limit ?? "Unlimited"}`).join(" · ")}</td><td className="px-3 py-3 text-[11px]">{[plan.apiAccess && "API", plan.webhooks && "Webhooks", plan.advancedReports && "Advanced reports"].filter(Boolean).join(" · ") || "Core"}</td><td className="px-3 py-3"><span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${plan.active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{plan.active ? "Active" : "Inactive"}</span></td>{canManage && <td className="px-3 py-3"><div className="flex gap-2"><button type="button" aria-label={`Edit ${plan.name}`} onClick={() => startEdit(plan)} className="rounded border border-[var(--border)] p-1.5"><Pencil size={14} /></button><button type="button" aria-label={`Delete ${plan.name}`} onClick={() => void remove(plan)} disabled={working} className="rounded border border-red-200 p-1.5 text-red-700"><Trash2 size={14} /></button></div></td>}</tr>)}{items.length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="px-3 py-8 text-center text-[var(--text-muted)]">No plans have been created.</td></tr>}</tbody></table></div>
  </section>;
}
