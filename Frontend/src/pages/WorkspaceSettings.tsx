import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  StoreIcon as Building2,
  CheckIcon as Check,
  GlobeIcon as Globe2,
  InfoIcon as Info,
  LinkIcon as Link2,
  MapPinIcon as MapPin,
  SaveIcon as Save,
  SettingsIcon as Settings2,
  Trash2Icon as Trash2,
  UsersRoundIcon as UsersRound,
} from "@animateicons/react/lucide";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { ApiError, apiRequest } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getActiveMembership } from "@/lib/workspace";

type WorkspaceData = {
  id: string;
  name: string;
  slug: string;
  companyName: string | null;
  companyWebsite: string | null;
  companyLocation: string | null;
  annualRevenue: string | null;
  country: string | null;
  timezone: string | null;
  onboardingCompletedAt: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  _count: { memberships: number; roles: number; invitations: number };
};

const countries = ["India", "United Arab Emirates", "Singapore", "United Kingdom", "United States", "Australia", "Bangladesh", "Canada", "Germany", "Indonesia", "Malaysia", "Nepal", "Pakistan", "Saudi Arabia", "South Africa"];
const timezones = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Karachi", "Asia/Dhaka", "Asia/Kathmandu", "Asia/Jakarta", "Asia/Kuala_Lumpur", "Asia/Riyadh", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "Australia/Sydney", "Africa/Johannesburg", "UTC"];
const revenueOptions = [
  ["under-50-lakh", "Under ₹50 lakh"],
  ["50-lakh-1-crore", "₹50 lakh – ₹1 crore"],
  ["1-5-crore", "₹1 – ₹5 crore"],
  ["5-25-crore", "₹5 – ₹25 crore"],
  ["25-crore-plus", "More than ₹25 crore"],
] as const;

type FormValues = {
  name: string;
  companyName: string;
  companyWebsite: string;
  companyLocation: string;
  annualRevenue: string;
  country: string;
  timezone: string;
};

function Field({ label, id, value, onChange, icon: Icon, type = "text", disabled = false }: { label: string; id: string; value: string; onChange: (value: string) => void; icon: typeof Building2; type?: string; disabled?: boolean }) {
  const icon = useAnimatedIcon();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">{label}</label>
      <div onMouseEnter={icon.onMouseEnter} onMouseLeave={icon.onMouseLeave} className="group/field relative">
        <Icon ref={icon.ref} size={17} duration={0.65} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[var(--text-muted)] transition-colors group-focus-within/field:text-[var(--brand)]" aria-hidden="true" />
        <input id={id} type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-[var(--border)] bg-white pl-11 pr-3.5 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10 disabled:cursor-not-allowed disabled:bg-[var(--surface-subtle)] disabled:text-[var(--text-disabled)]" />
      </div>
    </div>
  );
}

export function WorkspaceSettings() {
  const navigate = useNavigate();
  const { accessToken, refreshUser, user } = useAuth();
  const membership = getActiveMembership(user);
  const canUpdate = membership?.role.permissions.includes("workspace.update") ?? false;
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [values, setValues] = useState<FormValues>({ name: "", companyName: "", companyWebsite: "", companyLocation: "", annualRevenue: "", country: "India", timezone: "Asia/Kolkata" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saveIcon = useAnimatedIcon();

  useEffect(() => {
    if (!accessToken || !membership?.workspace.id) return;
    setLoading(true);
    void apiRequest<WorkspaceData>(`/workspaces/${membership.workspace.id}`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((data) => {
        setWorkspace(data);
        setValues({ name: data.name, companyName: data.companyName ?? "", companyWebsite: data.companyWebsite ?? "", companyLocation: data.companyLocation ?? "", annualRevenue: data.annualRevenue ?? "", country: data.country ?? "India", timezone: data.timezone ?? "Asia/Kolkata" });
      })
      .catch((caughtError) => setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load workspace settings."))
      .finally(() => setLoading(false));
  }, [accessToken, membership?.workspace.id]);

  const initials = useMemo(() => values.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "WS", [values.name]);
  const update = (field: keyof FormValues, value: string) => { setSaved(false); setError(null); setValues((current) => ({ ...current, [field]: value })); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !workspace || !canUpdate) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      const updated = await apiRequest<WorkspaceData>(`/workspaces/${workspace.id}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify(values) });
      setWorkspace(updated);
      setValues({ name: updated.name, companyName: updated.companyName ?? "", companyWebsite: updated.companyWebsite ?? "", companyLocation: updated.companyLocation ?? "", annualRevenue: updated.annualRevenue ?? "", country: updated.country ?? "India", timezone: updated.timezone ?? "Asia/Kolkata" });
      await refreshUser();
      setSaved(true);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save workspace settings.");
    } finally { setSaving(false); }
  };

  const deleteWorkspace = async () => {
    if (!accessToken || !workspace || !canUpdate || !window.confirm(`Delete ${workspace.name}? This cannot be undone.`)) return;
    setDeleting(true); setError(null);
    try {
      await apiRequest(`/workspaces/${workspace.id}`, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } });
      await refreshUser();
      navigate("/dashboard", { replace: true });
      window.location.reload();
    } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to delete this workspace."); setDeleting(false); }
  };

  if (!membership) return <div className="mx-auto max-w-[1100px] px-5 py-10 text-sm text-[var(--text-secondary)]">No workspace is available for this account.</div>;
  if (loading) return <div className="mx-auto max-w-[1100px] animate-pulse px-5 py-8 sm:px-8"><div className="h-8 w-64 rounded-md bg-slate-200" /><div className="mt-6 h-[520px] rounded-md bg-slate-200" /></div>;
  if (!workspace) return <div className="mx-auto max-w-[1100px] px-5 py-10"><p className="rounded-md bg-red-50 p-4">{error ?? "Workspace settings are unavailable."}</p></div>;

  return (
    <div data-testid="workspace-settings-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]">
      <header className="flex-none border-b border-[var(--border-soft)] bg-white shadow-[0_1px_3px_rgba(30,40,55,.04)]">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">Workspace settings</h1>
          {canUpdate && <button type="submit" form="workspace-settings-form" disabled={saving} onMouseEnter={saveIcon.onMouseEnter} onMouseLeave={saveIcon.onMouseLeave} className="flex h-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand)] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-wait disabled:opacity-60">{saving ? "Saving…" : saved ? "Saved" : "Save changes"}{saved ? <Check ref={saveIcon.ref} size={15} duration={0.55} className="ml-1.5" aria-hidden="true" /> : <Save ref={saveIcon.ref} size={15} duration={0.55} className="ml-1.5" aria-hidden="true" />}</button>}
        </div>
      </header>

      <main data-testid="workspace-settings-scroll-region" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-5 py-5 sm:px-8 sm:py-7">
          <p className="mb-5 text-sm text-[var(--text-secondary)]">Manage your workspace identity, business details and regional preferences.</p>
          {!canUpdate && <div className="mb-5 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Only workspace administrators can edit these settings. You have read-only access.</div>}
          {error && <p role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{error}</p>}

      <form id="workspace-settings-form" onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)] sm:p-6"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] pb-4"><div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><Settings2 size={17} duration={0.65} aria-hidden="true" /></div><div><h2 className="text-sm font-medium text-[var(--text-primary)]">General</h2></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field id="workspace-name" label="Workspace name" value={values.name} onChange={(value) => update("name", value)} icon={Building2} disabled={!canUpdate} /><Field id="workspace-slug" label="Workspace URL slug" value={workspace.slug} onChange={() => undefined} icon={Link2} disabled /></div></section>
          <section className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)] sm:p-6"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] pb-4"><div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><Building2 size={17} duration={0.65} aria-hidden="true" /></div><div><h2 className="text-sm font-medium text-[var(--text-primary)]">Business details</h2></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field id="company-name" label="Company name" value={values.companyName} onChange={(value) => update("companyName", value)} icon={Building2} disabled={!canUpdate} /><Field id="company-location" label="Company location" value={values.companyLocation} onChange={(value) => update("companyLocation", value)} icon={MapPin} disabled={!canUpdate} /><Field id="company-website" label="Company website" value={values.companyWebsite} onChange={(value) => update("companyWebsite", value)} icon={Globe2} type="url" disabled={!canUpdate} /><div><label htmlFor="annual-revenue" className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">Annual revenue</label><Select disabled={!canUpdate} value={values.annualRevenue} onValueChange={(value) => update("annualRevenue", value)}><SelectTrigger id="annual-revenue" className="h-10"><SelectValue /></SelectTrigger><SelectContent>{revenueOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div></section>
          <section className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)] sm:p-6"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] pb-4"><div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><Globe2 size={17} duration={0.65} aria-hidden="true" /></div><div><h2 className="text-sm font-medium text-[var(--text-primary)]">Regional preferences</h2></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><label htmlFor="workspace-country" className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">Country</label><Select disabled={!canUpdate} value={values.country} onValueChange={(value) => update("country", value)}><SelectTrigger id="workspace-country" className="h-10"><SelectValue /></SelectTrigger><SelectContent>{countries.map((country) => <SelectItem key={country} value={country}>{country}</SelectItem>)}</SelectContent></Select></div><div><label htmlFor="workspace-timezone" className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">Time zone</label><Select disabled={!canUpdate} value={values.timezone} onValueChange={(value) => update("timezone", value)}><SelectTrigger id="workspace-timezone" className="h-10"><SelectValue /></SelectTrigger><SelectContent>{timezones.map((timezone) => <SelectItem key={timezone} value={timezone}>{timezone}</SelectItem>)}</SelectContent></Select></div></div></section>
          {canUpdate && <section className="rounded-lg border border-red-100 bg-red-50/60 p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><h2 className="text-sm font-medium text-red-800">Danger zone</h2><button type="button" disabled={deleting} onClick={() => void deleteWorkspace()} className="flex h-9 shrink-0 items-center rounded-md border border-red-200 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"><Trash2 size={15} className="mr-1.5" />{deleting ? "Deleting…" : "Delete workspace"}</button></div></section>}
        </div>
        <aside className="space-y-5"><section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)]"><div className="flex items-center gap-3"><div className="flex size-12 items-center justify-center rounded-full bg-[#d9eef0] text-lg font-semibold text-[var(--brand)]">{initials}</div><div className="min-w-0"><h2 className="truncate text-sm font-medium text-[var(--text-primary)]">{values.name}</h2><p className="mt-1">Business workspace</p></div></div><div className="mt-5 space-y-3 border-t border-[var(--border-soft)] pt-4 text-xs"><div className="flex items-center justify-between"><span className="text-[var(--text-muted)]">Team members</span><span className="font-medium text-[var(--text-primary)]">{workspace._count.memberships}</span></div><div className="flex items-center justify-between border-t border-[var(--border-soft)] pt-3"><span className="text-[var(--text-muted)]">Roles</span><span className="font-medium text-[var(--text-primary)]">{workspace._count.roles}</span></div><div className="flex items-center justify-between border-t border-[var(--border-soft)] pt-3"><span className="text-[var(--text-muted)]">Pending invites</span><span className="font-medium text-[var(--text-primary)]">{workspace._count.invitations}</span></div></div></section><section className="rounded-md border border-[#d7ebec] bg-[var(--brand-soft)] p-5"><div className="flex items-center gap-2 text-sm font-medium text-[var(--brand)]"><UsersRound size={16} duration={0.65} aria-hidden="true" />Team access</div><p className="mt-2">Manage roles, permissions and team invitations from Team Members.</p><button type="button" onClick={() => navigate("/team-members")} className="mt-3 text-xs font-medium text-[var(--brand)] underline underline-offset-4">Open team members</button></section><section className="rounded-md border border-[var(--border-soft)] bg-white p-5 text-xs leading-5 text-[var(--text-muted)]"><p>Workspace ID</p><p className="mt-1 break-all">{workspace.id}</p><p className="mt-4">Created {new Date(workspace.createdAt).toLocaleDateString()}</p></section></aside>
      </form>
        </div>
      </main>
    </div>
  );
}
