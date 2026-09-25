import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api";

type RateCard = {
  id: string; countryCode: string; countryName: string; currency: string; category: string; pricingType: string;
  metaRate: string; platformFee: string; customerRate: string; volumeTierFrom: string | null; volumeTierTo: string | null;
  effectiveFrom: string; effectiveTo: string | null; status: "ACTIVE" | "INACTIVE"; source: string; notes: string | null;
};
type ListResponse = { items: RateCard[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type FormState = Omit<RateCard, "id" | "status" | "source"> & { status: "ACTIVE" | "INACTIVE"; source: string };

const blank: FormState = { countryCode: "IN", countryName: "India", currency: "INR", category: "UTILITY", pricingType: "REGULAR", metaRate: "", platformFee: "", customerRate: "", volumeTierFrom: null, volumeTierTo: null, effectiveFrom: "", effectiveTo: null, status: "ACTIVE", source: "MANUAL", notes: null };
const categories = ["MARKETING", "UTILITY", "AUTHENTICATION"];
const pricingTypes = ["REGULAR", "FREE_CUSTOMER_SERVICE", "FREE_ENTRY_POINT", "VOLUME_TIER"];
function label(value: string) { return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function volume(value: string | null) { return value === null || value === "" ? "—" : value; }

export function WhatsAppRateCards() {
  const [rows, setRows] = useState<RateCard[]>([]);
  const [form, setForm] = useState<FormState>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ countryCode: "", category: "", pricingType: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => new URLSearchParams({ page: "1", pageSize: "100", ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) }).toString(), [filters]);
  const load = async () => {
    setLoading(true); setError(null);
    try { const result = await apiRequest<ListResponse>(`/admin/whatsapp-rate-cards?${query}`); setRows(result.items); }
    catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load rate cards."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [query]);

  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setWorking(true); setError(null);
    const payload = { ...form, volumeTierFrom: form.volumeTierFrom || null, volumeTierTo: form.volumeTierTo || null, effectiveTo: form.effectiveTo || null, notes: form.notes || null };
    try {
      await apiRequest<RateCard>(editingId ? `/admin/whatsapp-rate-cards/${editingId}` : "/admin/whatsapp-rate-cards", { method: editingId ? "PUT" : "POST", body: JSON.stringify({ ...payload, ...(payload.customerRate ? { customerRate: payload.customerRate } : { customerRate: undefined }) }) });
      setForm(blank); setEditingId(null); await load();
    } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save rate card."); }
    finally { setWorking(false); }
  };
  const toggle = async (row: RateCard) => {
    setWorking(true); setError(null);
    try { await apiRequest<RateCard>(`/admin/whatsapp-rate-cards/${row.id}/status`, { method: "PATCH", body: JSON.stringify({ status: row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }) }); await load(); }
    catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to change rate-card status."); }
    finally { setWorking(false); }
  };

  return <div className="min-h-full bg-[var(--page-background)] p-5 sm:p-8"><div className="mx-auto max-w-[1500px]">
    <header className="flex flex-col gap-3 border-b border-[var(--border-soft)] pb-5 sm:flex-row sm:items-center sm:justify-between"><h1 className="text-[22px] font-medium tracking-[-0.02em] text-[var(--text-primary)]">WhatsApp Rate Cards</h1><div className="flex gap-2"><button type="button" onClick={() => { setForm(blank); setEditingId(null); }} className="inline-flex items-center gap-2 rounded-md bg-[var(--brand)] px-3 py-2 text-xs font-medium text-white"><Plus size={14} />Add rate</button><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)]"><RefreshCw size={14} />Refresh</button></div></header>
    {error && <div role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <form onSubmit={submit} className="mt-5 rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-medium">{editingId ? "Edit rate card" : "Add rate card"}</h2>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(blank); }} className="text-xs text-[var(--text-muted)]">Cancel</button>}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {([["countryCode", "Country code"], ["countryName", "Country name"], ["currency", "Currency"], ["metaRate", "Meta rate"], ["platformFee", "Platform fee"], ["customerRate", "Customer rate (optional override)"], ["volumeTierFrom", "Tier from"], ["volumeTierTo", "Tier to"], ["effectiveFrom", "Effective from"], ["effectiveTo", "Effective to"], ["source", "Source"]] as Array<[keyof FormState, string]>).map(([key, title]) => <label key={key} className="text-xs text-[var(--text-secondary)]">{title}<input required={!['volumeTierFrom', 'volumeTierTo', 'effectiveTo', 'customerRate'].includes(key)} type={key.startsWith("effective") ? "date" : "text"} value={(form[key] as string | null) ?? ""} onChange={(event) => update(key, event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--border)] px-3 text-xs outline-none focus:border-[var(--brand)]" /></label>)}
      <label className="text-xs text-[var(--text-secondary)]">Category<select value={form.category} onChange={(event) => update("category", event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-xs">{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs text-[var(--text-secondary)]">Pricing type<select value={form.pricingType} onChange={(event) => update("pricingType", event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-xs">{pricingTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs text-[var(--text-secondary)]">Status<select value={form.status} onChange={(event) => update("status", event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-xs"><option>ACTIVE</option><option>INACTIVE</option></select></label>
      <label className="text-xs text-[var(--text-secondary)] lg:col-span-2">Notes<textarea value={form.notes ?? ""} onChange={(event) => update("notes", event.target.value)} className="mt-1 min-h-9 w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs outline-none focus:border-[var(--brand)]" /></label>
    </div><div className="mt-4 flex justify-end"><button disabled={working} type="submit" className="rounded-md bg-[var(--brand)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{working ? "Saving…" : editingId ? "Save changes" : "Create rate"}</button></div></form>
    <div className="mt-5 flex flex-wrap gap-2"><input aria-label="Filter country" placeholder="Country (IN)" value={filters.countryCode} onChange={(event) => setFilters((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))} className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-xs" /><select aria-label="Filter category" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-xs"><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter pricing type" value={filters.pricingType} onChange={(event) => setFilters((current) => ({ ...current, pricingType: event.target.value }))} className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-xs"><option value="">All pricing types</option>{pricingTypes.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-xs"><option value="">All statuses</option><option>ACTIVE</option><option>INACTIVE</option></select></div>
    <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-xs"><thead className="border-b border-[var(--border-soft)] bg-[var(--page-background)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr>{["Country", "Category", "Pricing type", "Meta rate", "Platform fee", "Customer rate", "Currency", "Volume tier", "Effective", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{loading ? <tr><td colSpan={11} className="px-4 py-8 text-center text-[var(--text-muted)]">Loading rate cards…</td></tr> : rows.length === 0 ? <tr><td colSpan={11} className="px-4 py-8 text-center text-[var(--text-muted)]">No rate cards configured. Do not enter unverified production Meta rates.</td></tr> : rows.map((row) => <tr key={row.id} className="align-top"><td className="px-4 py-3"><div className="font-medium">{row.countryCode}</div><div className="text-[11px] text-[var(--text-muted)]">{row.countryName}</div></td><td className="px-4 py-3">{row.category}</td><td className="px-4 py-3">{label(row.pricingType)}</td><td className="px-4 py-3 font-mono">{row.metaRate}</td><td className="px-4 py-3 font-mono">{row.platformFee}</td><td className="px-4 py-3 font-mono">{row.customerRate}</td><td className="px-4 py-3">{row.currency}</td><td className="px-4 py-3 font-mono">{volume(row.volumeTierFrom)} – {volume(row.volumeTierTo)}</td><td className="whitespace-nowrap px-4 py-3">{row.effectiveFrom} – {row.effectiveTo ?? "Current"}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[11px] ${row.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{label(row.status)}</span></td><td className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => { setEditingId(row.id); setForm({ ...row }); }} className="mr-3 text-[var(--brand)]">Edit</button><button type="button" disabled={working} onClick={() => void toggle(row)} className="text-[var(--text-secondary)]">{row.status === "ACTIVE" ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div></div>
  </div></div>;
}
