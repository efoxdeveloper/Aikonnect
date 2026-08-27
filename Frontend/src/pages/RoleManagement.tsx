import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRightIcon as ArrowRight,
  ChartBarIcon as ChartBar,
  CheckIcon as Check,
  InboxIcon as Inbox,
  KeyRoundIcon as KeyRound,
  MegaphoneIcon as Megaphone,
  PlusIcon as Plus,
  SettingsIcon as Settings,
  ShieldCheckIcon as ShieldCheck,
  SparklesIcon as Sparkles,
  StoreIcon as Store,
  XIcon as X,
} from "@animateicons/react/lucide";
import type { AnimatedIcon } from "@/config/navigation";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { getActiveMembership } from "@/lib/workspace";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

type PermissionGroup = "contacts" | "contact-data" | "inbox" | "marketing" | "automation-reports" | "workspace";

type PermissionDefinition = {
  key: string;
  label: string;
  description: string;
  group: PermissionGroup;
};

type WorkspaceRole = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  permissions: string[];
};

const groupMetadata: Array<{ id: PermissionGroup; title: string; description: string; icon: AnimatedIcon }> = [
  { id: "contacts", title: "Contact Hub", description: "Control how this role can work with contacts.", icon: Store },
  { id: "contact-data", title: "Access to contact details", description: "Choose which sensitive contact details remain visible.", icon: KeyRound },
  { id: "inbox", title: "Shared inbox", description: "Manage access to conversations and assignment tools.", icon: Inbox },
  { id: "marketing", title: "Campaigns and templates", description: "Control campaign execution and WhatsApp templates.", icon: Megaphone },
  { id: "automation-reports", title: "Automations and reports", description: "Manage workflow configuration and analytics access.", icon: ChartBar },
  { id: "workspace", title: "Workspace administration", description: "Control team, account, billing and workspace settings.", icon: Settings },
];

function roleOrder(role: WorkspaceRole) {
  const priorities: Record<string, number> = { owner: 0, admin: 1, teammate: 2, member: 2, viewer: 3 };
  return priorities[role.slug] ?? 10;
}

function PermissionSection({
  title,
  description,
  icon: Icon,
  permissions,
  selected,
  disabled,
  roleName,
  onToggle,
}: {
  title: string;
  description: string;
  icon: AnimatedIcon;
  permissions: PermissionDefinition[];
  selected: Set<string>;
  disabled: boolean;
  roleName: string;
  onToggle: (key: string, checked: boolean) => void;
}) {
  const sectionIcon = useAnimatedIcon();
  return (
    <section className="rounded-md border border-[var(--border-soft)] bg-white shadow-[0_2px_9px_rgba(30,40,55,.035)]" onMouseEnter={sectionIcon.onMouseEnter} onMouseLeave={sectionIcon.onMouseLeave}>
      <div className="flex items-start gap-3 border-b border-[var(--border-soft)] px-5 py-4 sm:px-6">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Icon ref={sectionIcon.ref} size={18} duration={0.7} aria-hidden="true" /></div>
        <div><h2 className="text-[15px] font-medium text-[var(--text-primary)]">{title}</h2><p className="mt-0.5">{description}</p></div>
      </div>
      <div className="divide-y divide-[var(--border-soft)] px-5 sm:px-6">
        {permissions.map((permission) => {
          const checked = selected.has(permission.key);
          return (
            <div key={permission.key} className="flex min-h-[66px] items-center justify-between gap-5 py-3">
              <div className="min-w-0"><h3 className="text-[13px] font-normal text-[var(--text-primary)]">{permission.label}</h3><p className="mt-1">{permission.description}</p></div>
              <Switch checked={checked} disabled={disabled} onCheckedChange={(next) => onToggle(permission.key, next)} aria-label={`${permission.label} for ${roleName}`} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CreateRoleDialog({
  open,
  creating,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  creating: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const closeIcon = useAnimatedIcon();
  const createIcon = useAnimatedIcon();
  const sparkleIcon = useAnimatedIcon();

  useEffect(() => {
    if (open) { setName(""); setDescription(""); }
  }, [open]);

  if (!open) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void onCreate(name, description); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#102c35]/40 px-4 py-6 backdrop-blur-[2px]" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="create-role-title" className="w-full max-w-[460px] rounded-md border border-white/80 bg-white p-6 shadow-[0_18px_48px_rgba(21,52,62,.16)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3"><div onMouseEnter={sparkleIcon.onMouseEnter} onMouseLeave={sparkleIcon.onMouseLeave} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Sparkles ref={sparkleIcon.ref} size={19} duration={0.7} aria-hidden="true" /></div><div><h2 id="create-role-title" className="text-lg font-medium text-[var(--text-primary)]">Create a custom role</h2><p className="mt-1">The new role starts with Teammate permissions, which you can customize after creation.</p></div></div>
          <button type="button" aria-label="Close role creation" disabled={creating} onClick={onClose} onMouseEnter={closeIcon.onMouseEnter} onMouseLeave={closeIcon.onMouseLeave} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><X ref={closeIcon.ref} size={17} duration={0.55} aria-hidden="true" /></button>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div><label htmlFor="role-name" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Role name</label><Input id="role-name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="h-11" /></div>
          <div><label htmlFor="role-description" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Description <span className="font-normal text-[var(--text-muted)]">(optional)</span></label><Input id="role-description" maxLength={255} value={description} onChange={(event) => setDescription(event.target.value)} className="h-11" /></div>
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2.5">{error}</p>}
          <div className="grid grid-cols-[110px_1fr] gap-3 pt-1"><button type="button" disabled={creating} onClick={onClose} className="h-11 rounded-md border border-[var(--border)] bg-white text-sm font-medium text-[var(--text-secondary)] hover:bg-[#f7f8fa]">Cancel</button><button type="submit" aria-label="Create custom role" disabled={creating} onMouseEnter={createIcon.onMouseEnter} onMouseLeave={createIcon.onMouseLeave} className="flex h-11 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-wait disabled:opacity-60">{creating ? "Creating…" : "Create role"}<ArrowRight ref={createIcon.ref} size={15} duration={0.55} className="ml-1.5" aria-hidden="true" /></button></div>
        </form>
      </section>
    </div>
  );
}

export function RoleManagement() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canManage = membership?.role.permissions.includes("roles.manage") ?? false;
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [catalog, setCatalog] = useState<PermissionDefinition[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const plusIcon = useAnimatedIcon();

  const load = useCallback(async (preferredRoleId?: string) => {
    if (!workspaceId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { authorization: `Bearer ${accessToken}` };
      const [nextRoles, nextCatalog] = await Promise.all([
        apiRequest<WorkspaceRole[]>(`/workspaces/${workspaceId}/roles`, { headers }),
        apiRequest<PermissionDefinition[]>(`/workspaces/${workspaceId}/permissions`, { headers }),
      ]);
      const sortedRoles = [...nextRoles].sort((a, b) => roleOrder(a) - roleOrder(b) || a.name.localeCompare(b.name));
      setRoles(sortedRoles);
      setCatalog(nextCatalog);
      setSelectedRoleId((current) => {
        const requested = preferredRoleId ?? current;
        return sortedRoles.some(({ id }) => id === requested) ? requested : sortedRoles[0]?.id ?? null;
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load roles and permissions.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId]);

  useEffect(() => { void load(); }, [load]);
  const selectedRole = roles.find(({ id }) => id === selectedRoleId) ?? null;
  useEffect(() => {
    setSelectedPermissions(new Set(selectedRole?.permissions ?? []));
    setSuccess(null);
  }, [selectedRole?.id]);

  const permissionGroups = useMemo(() => groupMetadata.map((group) => ({
    ...group,
    permissions: catalog.filter((permission) => permission.group === group.id),
  })).filter((group) => group.permissions.length > 0), [catalog]);
  const dirty = selectedRole ? selectedRole.permissions.length !== selectedPermissions.size || selectedRole.permissions.some((permission) => !selectedPermissions.has(permission)) : false;
  const readOnly = !canManage || selectedRole?.slug === "owner";

  const togglePermission = (key: string, checked: boolean) => {
    setSuccess(null);
    setSelectedPermissions((current) => { const next = new Set(current); if (checked) next.add(key); else next.delete(key); return next; });
  };

  const save = async () => {
    if (!workspaceId || !accessToken || !selectedRole || readOnly || selectedPermissions.size === 0) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/roles/${selectedRole.id}`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ permissions: [...selectedPermissions] }) });
      await load(selectedRole.id);
      setSuccess("Permissions saved successfully.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save role permissions.");
    } finally { setSaving(false); }
  };

  const createRole = async (name: string, description: string) => {
    if (!workspaceId || !accessToken) return;
    setCreating(true); setCreateError(null);
    const template = roles.find(({ slug }) => slug === "teammate" || slug === "member");
    try {
      const result = await apiRequest<{ id: string }>(`/workspaces/${workspaceId}/roles`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ name, description: description || undefined, permissions: template?.permissions.length ? template.permissions : ["workspace.read"] }) });
      setCreateOpen(false);
      await load(result.id);
      setSuccess(`${name.trim()} was created.`);
    } catch (caughtError) {
      setCreateError(caughtError instanceof ApiError ? caughtError.message : "Unable to create this role.");
    } finally { setCreating(false); }
  };

  if (loading) return <div className="mx-auto max-w-[1180px] animate-pulse px-5 py-8 sm:px-8"><div className="h-8 w-64 rounded-md bg-slate-200" /><div className="mt-6 h-12 rounded-md bg-slate-200" /><div className="mt-5 h-80 rounded-md bg-slate-200" /></div>;

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-[25px] font-medium tracking-[-0.025em] text-[var(--text-primary)]">Roles and permissions</h1><p className="mt-1">Control what each role can view and manage in this workspace.</p></div>{canManage && <button type="button" onClick={() => { setCreateError(null); setCreateOpen(true); }} onMouseEnter={plusIcon.onMouseEnter} onMouseLeave={plusIcon.onMouseLeave} className="flex h-10 w-fit items-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"><Plus ref={plusIcon.ref} size={16} duration={0.55} className="mr-1.5" aria-hidden="true" />Create role</button>}</div>

      {error && <p role="alert" className="mt-5 rounded-md bg-red-50 px-4 py-3">{error}</p>}
      {success && <div role="status" className="mt-5 flex items-center rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><Check size={15} duration={0.5} className="mr-2" aria-hidden="true" />{success}</div>}

      <div className="mt-6 overflow-x-auto border-b border-[var(--border)]" role="tablist" aria-label="Workspace roles">
        <div className="flex min-w-max gap-1">
          {roles.map((role) => <button key={role.id} type="button" role="tab" aria-selected={role.id === selectedRoleId} onClick={() => setSelectedRoleId(role.id)} className={cn("relative flex h-11 items-center gap-2 px-4 text-sm font-medium transition-colors", role.id === selectedRoleId ? "text-[var(--brand)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}><span>{role.name}</span>{!role.isSystem && <span className="rounded-md bg-[#f0f2f4] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Custom</span>}<span className="text-[10px] font-normal text-[var(--text-muted)]">{role.memberCount}</span>{role.id === selectedRoleId && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-[var(--brand)]" />}</button>)}
        </div>
      </div>

      {selectedRole && <>
        <div className="mt-5 flex flex-col gap-3 rounded-md border border-[var(--border-soft)] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><ShieldCheck size={18} duration={0.65} aria-hidden="true" /></div><div><h2 className="text-sm font-medium text-[var(--text-primary)]">{selectedRole.name}</h2><p className="mt-0.5">{selectedRole.slug === "owner" ? "The Owner always has every permission and cannot be restricted." : selectedRole.description ?? "A custom workspace access role."}</p></div></div><span className="w-fit text-[11px] font-medium text-[var(--text-muted)]">{selectedPermissions.size} of {catalog.length} permissions enabled</span></div>

        <div className="mt-5 space-y-5">
          {permissionGroups.map((group) => <PermissionSection key={group.id} {...group} selected={selectedPermissions} disabled={readOnly} roleName={selectedRole.name} onToggle={togglePermission} />)}
        </div>

        {canManage && selectedRole.slug !== "owner" && <div className="sticky bottom-4 z-20 mt-5 flex items-center justify-between gap-4 rounded-md border border-[var(--border)] bg-white/95 px-4 py-3 shadow-[0_8px_28px_rgba(30,40,55,.11)] backdrop-blur-md"><p className="hidden sm:block">{dirty ? "You have unsaved permission changes." : "Role permissions are up to date."}</p><button type="button" disabled={!dirty || saving || selectedPermissions.size === 0} onClick={() => void save()} className="ml-auto flex h-10 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button></div>}
      </>}

      <CreateRoleDialog open={createOpen} creating={creating} error={createError} onClose={() => setCreateOpen(false)} onCreate={createRole} />
    </div>
  );
}
