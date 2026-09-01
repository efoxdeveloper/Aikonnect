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
  logoData?: string | null;
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
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-[var(--text-primary)]">{label}</label>
      <div onMouseEnter={icon.onMouseEnter} onMouseLeave={icon.onMouseLeave} className="group/field relative">
        <Icon ref={icon.ref} size={17} duration={0.65} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[var(--text-muted)] transition-colors group-focus-within/field:text-[var(--brand)]" aria-hidden="true" />
        <input id={id} type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-md border border-[var(--border-strong)] bg-white pl-11 pr-3.5 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]/10 disabled:cursor-not-allowed disabled:bg-[var(--gray-100)] disabled:text-[var(--text-disabled)]" />
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
  const [logoData, setLogoData] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const saveIcon = useAnimatedIcon();

  useEffect(() => {
    if (!accessToken || !membership?.workspace.id) return;
    setLoading(true);
    void apiRequest<WorkspaceData>(`/workspaces/${membership.workspace.id}`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((data) => {
        setWorkspace(data);
        setLogoData(data.logoData ?? null);
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
      const updated = await apiRequest<WorkspaceData>(`/workspaces/${workspace.id}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ ...values, logoData: logoData ?? "" }) });
      setWorkspace(updated);
      setLogoData(updated.logoData ?? null);
      setValues({ name: updated.name, companyName: updated.companyName ?? "", companyWebsite: updated.companyWebsite ?? "", companyLocation: updated.companyLocation ?? "", annualRevenue: updated.annualRevenue ?? "", country: updated.country ?? "India", timezone: updated.timezone ?? "Asia/Kolkata" });
      await refreshUser();
      setSaved(true);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save workspace settings.");
    } finally { setSaving(false); }
  };

  const uploadLogo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 1_500_000) {
      setError("Choose an image smaller than 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setLogoData(typeof reader.result === "string" ? reader.result : null); setSaved(false); setError(null); };
    reader.readAsDataURL(file);
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
    <div className="mx-auto max-w-[1100px] px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-[25px] font-medium tracking-[-0.025em] text-[var(--text-primary)]">Workspace settings</h1><p className="mt-1">Manage your workspace identity, business details and regional preferences.</p></div>
        {canUpdate && <button type="submit" form="workspace-settings-form" disabled={saving} onMouseEnter={saveIcon.onMouseEnter} onMouseLeave={saveIcon.onMouseLeave} className="flex h-10 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white shadow-[0_6px_14px_rgba(17,107,111,.14)] hover:bg-[var(--brand-hover)] disabled:cursor-wait disabled:opacity-60">{saving ? "Saving…" : saved ? "Saved" : "Save changes"}{saved ? <Check ref={saveIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" /> : <Save ref={saveIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" />}</button>}
      </div>

      {!canUpdate && <div className="mt-5 flex items-start gap-3 rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Only workspace administrators can edit these settings. You have read-only access.</div>}
      {error && <p role="alert" className="mt-5 rounded-md bg-red-50 px-4 py-3">{error}</p>}

      <form id="workspace-settings-form" onSubmit={submit} className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-7"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] pb-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Settings2 size={19} duration={0.65} aria-hidden="true" /></div><div><h2 className="text-[16px] font-medium text-[var(--text-primary)]">General</h2><p className="mt-1">The name your team sees throughout the app.</p></div></div><div className="mt-6 flex flex-col gap-5 sm:flex-row"><div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-[var(--border)] bg-[#f7f8fa] text-2xl font-semibold text-[var(--brand)]">{logoData ? <img src={logoData} alt="Workspace logo" className="size-full object-cover" /> : initials}</div><div><label htmlFor="workspace-logo" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Workspace logo</label><input id="workspace-logo" type="file" accept="image/*" disabled={!canUpdate} onChange={(event) => uploadLogo(event.target.files?.[0])} className="block w-full max-w-[260px] text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--brand-soft)] file:px-3 file:py-2 file:text-xs file:font-medium file:text-[var(--brand)]" /><p className="mt-2">PNG, JPG or WEBP up to 1.5 MB.</p></div></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field id="workspace-name" label="Workspace name" value={values.name} onChange={(value) => update("name", value)} icon={Building2} disabled={!canUpdate} /><Field id="workspace-slug" label="Workspace URL slug" value={workspace.slug} onChange={() => undefined} icon={Link2} disabled /></div></section>
          <section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-7"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] pb-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Building2 size={19} duration={0.65} aria-hidden="true" /></div><div><h2 className="text-[16px] font-medium text-[var(--text-primary)]">Business details</h2><p className="mt-1">Keep your company information up to date.</p></div></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field id="company-name" label="Company name" value={values.companyName} onChange={(value) => update("companyName", value)} icon={Building2} disabled={!canUpdate} /><Field id="company-location" label="Company location" value={values.companyLocation} onChange={(value) => update("companyLocation", value)} icon={MapPin} disabled={!canUpdate} /><Field id="company-website" label="Company website" value={values.companyWebsite} onChange={(value) => update("companyWebsite", value)} icon={Globe2} type="url" disabled={!canUpdate} /><div><label htmlFor="annual-revenue" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Annual revenue</label><Select disabled={!canUpdate} value={values.annualRevenue} onValueChange={(value) => update("annualRevenue", value)}><SelectTrigger id="annual-revenue" className="h-12"><SelectValue /></SelectTrigger><SelectContent>{revenueOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div></section>
          <section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-7"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] pb-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Globe2 size={19} duration={0.65} aria-hidden="true" /></div><div><h2 className="text-[16px] font-medium text-[var(--text-primary)]">Regional preferences</h2><p className="mt-1">Used for dates, time and business communication.</p></div></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><div><label htmlFor="workspace-country" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Country</label><Select disabled={!canUpdate} value={values.country} onValueChange={(value) => update("country", value)}><SelectTrigger id="workspace-country" className="h-12"><SelectValue /></SelectTrigger><SelectContent>{countries.map((country) => <SelectItem key={country} value={country}>{country}</SelectItem>)}</SelectContent></Select></div><div><label htmlFor="workspace-timezone" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Time zone</label><Select disabled={!canUpdate} value={values.timezone} onValueChange={(value) => update("timezone", value)}><SelectTrigger id="workspace-timezone" className="h-12"><SelectValue /></SelectTrigger><SelectContent>{timezones.map((timezone) => <SelectItem key={timezone} value={timezone}>{timezone}</SelectItem>)}</SelectContent></Select></div></div></section>
          {canUpdate && <section className="rounded-md border border-red-100 bg-red-50/60 p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><h2 className="text-[16px] font-medium text-red-800">Danger zone</h2><p className="mt-1">Deleting this workspace permanently removes its members, roles and settings.</p></div><button type="button" disabled={deleting} onClick={() => void deleteWorkspace()} className="flex h-10 shrink-0 items-center rounded-md border border-red-200 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"><Trash2 size={15} className="mr-1.5" />{deleting ? "Deleting…" : "Delete workspace"}</button></div></section>}
        </div>
        <aside className="space-y-5"><section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)]"><div className="flex items-center gap-3"><div className="flex size-12 items-center justify-center rounded-full bg-[#d9eef0] text-lg font-semibold text-[var(--brand)]">{initials}</div><div className="min-w-0"><h2 className="truncate text-sm font-medium text-[var(--text-primary)]">{values.name}</h2><p className="mt-1">Business workspace</p></div></div><div className="mt-5 space-y-3 border-t border-[var(--border-soft)] pt-4 text-xs"><div className="flex items-center justify-between"><span className="text-[var(--text-muted)]">Team members</span><span className="font-medium text-[var(--text-primary)]">{workspace._count.memberships}</span></div><div className="flex items-center justify-between border-t border-[var(--border-soft)] pt-3"><span className="text-[var(--text-muted)]">Roles</span><span className="font-medium text-[var(--text-primary)]">{workspace._count.roles}</span></div><div className="flex items-center justify-between border-t border-[var(--border-soft)] pt-3"><span className="text-[var(--text-muted)]">Pending invites</span><span className="font-medium text-[var(--text-primary)]">{workspace._count.invitations}</span></div></div></section><section className="rounded-md border border-[#d7ebec] bg-[var(--brand-soft)] p-5"><div className="flex items-center gap-2 text-sm font-medium text-[var(--brand)]"><UsersRound size={16} duration={0.65} aria-hidden="true" />Team access</div><p className="mt-2">Manage roles, permissions and team invitations from Team Members.</p><button type="button" onClick={() => navigate("/team-members")} className="mt-3 text-xs font-medium text-[var(--brand)] underline underline-offset-4">Open team members</button></section><section className="rounded-md border border-[var(--border-soft)] bg-white p-5 text-xs leading-5 text-[var(--text-muted)]"><p>Workspace ID</p><p className="mt-1 break-all">{workspace.id}</p><p className="mt-4">Created {new Date(workspace.createdAt).toLocaleDateString()}</p></section></aside>
      </form>
    </div>
  );
}
