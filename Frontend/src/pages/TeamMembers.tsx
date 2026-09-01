import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CheckIcon as Check,
  MailIcon as Mail,
  PlusIcon as Plus,
  ShieldCheckIcon as ShieldCheck,
  UserRoundIcon as UserRound,
  UsersRoundIcon as UsersRound,
  XIcon as X,
} from "@animateicons/react/lucide";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { getActiveMembership } from "@/lib/workspace";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

type Member = {
  id: string;
  status: "ACTIVE" | "SUSPENDED";
  joinedAt: string;
  user: { id: string; email: string; firstName: string; lastName: string; phone: string | null; emailVerifiedAt: string | null; status: string };
  role: { id: string; name: string; slug: string };
};

type Role = { id: string; name: string; slug: string };
type Invitation = { id: string; email: string; status: string; expiresAt: string; createdAt: string; role: { id: string; name: string; slug: string } };

function initials(firstName: string, lastName: string) { return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "TM"; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }

function InviteMemberDialog({ open, roles, inviting, error, onClose, onInvite }: { open: boolean; roles: Role[]; inviting: boolean; error: string | null; onClose: () => void; onInvite: (email: string, roleId: string) => Promise<void> }) {
  const inviteIcon = useAnimatedIcon();
  const closeIcon = useAnimatedIcon();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  useEffect(() => { if (open) { setEmail(""); setRoleId(roles.find((role) => role.slug !== "owner")?.id ?? roles[0]?.id ?? ""); } }, [open, roles]);
  if (!open) return null;
  const defaultRoleId = roles.find((role) => role.slug !== "owner")?.id ?? roles[0]?.id ?? "";
  const selectedRoleId = roleId || defaultRoleId;
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void onInvite(email, selectedRoleId); };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--overlay)] px-4 py-6 backdrop-blur-[2px]" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="invite-member-title" className="w-full max-w-[470px] rounded-md border border-white/80 bg-white p-6 shadow-[0_18px_48px_rgba(21,52,62,.16)] sm:p-7">
        <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><UsersRound size={19} duration={0.7} aria-hidden="true" /></div><div><h2 id="invite-member-title" className="text-lg font-medium text-[var(--text-primary)]">Invite a team member</h2><p className="mt-1">They will receive an email invitation to join this workspace.</p></div></div><button type="button" aria-label="Close invite member" disabled={inviting} onClick={onClose} onMouseEnter={closeIcon.onMouseEnter} onMouseLeave={closeIcon.onMouseLeave} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><X ref={closeIcon.ref} size={17} duration={0.55} aria-hidden="true" /></button></div>
        <form onSubmit={submit} className="mt-6 space-y-4"><div><label htmlFor="member-email" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Work email</label><div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3.5 z-10 flex items-center text-[var(--text-muted)]"><Mail size={17} duration={0.65} aria-hidden="true" /></span><Input id="member-email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 pl-11" /></div></div><div><label htmlFor="member-role" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Role</label><Select required value={selectedRoleId} onValueChange={setRoleId}><SelectTrigger id="member-role" aria-label="Role" className="h-11"><SelectValue /></SelectTrigger><SelectContent className="z-[110]">{roles.filter((role) => role.slug !== "owner").map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent></Select></div>{error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2.5">{error}</p>}<div className="grid grid-cols-[110px_1fr] gap-3 pt-1"><button type="button" disabled={inviting} onClick={onClose} className="h-11 rounded-md border border-[var(--border)] bg-white text-sm font-medium text-[var(--text-secondary)] hover:bg-[#f7f8fa]">Cancel</button><button type="submit" disabled={inviting || !selectedRoleId} onMouseEnter={inviteIcon.onMouseEnter} onMouseLeave={inviteIcon.onMouseLeave} className="flex h-11 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-wait disabled:opacity-60">{inviting ? "Sending…" : "Send invitation"}<Check ref={inviteIcon.ref} size={15} duration={0.55} className="ml-1.5" aria-hidden="true" /></button></div></form>
      </section>
    </div>
  );
}

export function TeamMembers() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const permissions = membership?.role.permissions ?? [];
  const canInvite = permissions.includes("members.invite");
  const canManage = permissions.includes("members.manage");
  const canRemove = permissions.includes("members.remove");
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const inviteButtonIcon = useAnimatedIcon();

  const load = useCallback(async () => {
    if (!workspaceId || !accessToken) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const headers = { authorization: `Bearer ${accessToken}` };
      const [nextMembers, nextRoles, nextInvitations] = await Promise.all([
        apiRequest<Member[]>(`/workspaces/${workspaceId}/members`, { headers }),
        apiRequest<Role[]>(`/workspaces/${workspaceId}/roles`, { headers }),
        apiRequest<Invitation[]>(`/workspaces/${workspaceId}/invitations`, { headers }),
      ]);
      setMembers(nextMembers); setRoles(nextRoles); setInvitations(nextInvitations.filter((invitation) => invitation.status === "PENDING"));
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Unable to load team members."); }
    finally { setLoading(false); }
  }, [accessToken, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const invite = async (email: string, roleId: string) => {
    if (!workspaceId || !accessToken) return;
    setInviting(true); setInviteError(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/invitations`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email, roleId }) });
      setInviteOpen(false); setSuccess(`Invitation sent to ${email}.`); await load();
    } catch (caughtError) { setInviteError(caughtError instanceof ApiError ? caughtError.message : "Unable to send invitation."); }
    finally { setInviting(false); }
  };

  const changeRole = async (member: Member, roleId: string) => {
    if (!workspaceId || !accessToken || member.role.id === roleId) return;
    setWorkingId(member.id); setError(null); setSuccess(null);
    try { await apiRequest(`/workspaces/${workspaceId}/members/${member.id}/role`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ roleId }) }); setSuccess(`Role updated for ${member.user.firstName} ${member.user.lastName}.`); await load(); }
    catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update the member role."); }
    finally { setWorkingId(null); }
  };

  const changeStatus = async (member: Member) => {
    if (!workspaceId || !accessToken) return;
    const nextStatus = member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setWorkingId(member.id); setError(null); setSuccess(null);
    try { await apiRequest(`/workspaces/${workspaceId}/members/${member.id}/status`, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ status: nextStatus }) }); setSuccess(`${member.user.firstName} ${member.user.lastName} is now ${nextStatus === "ACTIVE" ? "active" : "suspended"}.`); await load(); }
    catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update member status."); }
    finally { setWorkingId(null); }
  };

  const revokeInvitation = async (invitation: Invitation) => {
    if (!workspaceId || !accessToken) return;
    setWorkingId(invitation.id); setError(null);
    try { await apiRequest(`/workspaces/${workspaceId}/invitations/${invitation.id}`, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } }); setSuccess(`Invitation for ${invitation.email} was revoked.`); await load(); }
    catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to revoke invitation."); }
    finally { setWorkingId(null); }
  };

  if (loading) return <div className="mx-auto max-w-[1180px] animate-pulse px-5 py-8 sm:px-8"><div className="h-8 w-64 rounded-md bg-slate-200" /><div className="mt-6 h-56 rounded-md bg-slate-200" /><div className="mt-5 h-72 rounded-md bg-slate-200" /></div>;
  if (!membership) return <div className="p-8 text-sm text-[var(--text-secondary)]">No workspace is available for this account.</div>;

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-[25px] font-medium tracking-[-0.025em] text-[var(--text-primary)]">Team members</h1><p className="mt-1">Invite teammates and manage how they work in {membership.workspace.name}.</p></div><div className="flex flex-wrap gap-2">{canManage && <Link to="/team-members/roles" className="flex h-10 items-center rounded-md border border-[var(--border)] bg-white px-3.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><ShieldCheck size={16} duration={0.6} className="mr-1.5" aria-hidden="true" />Roles & permissions</Link>}{canInvite && <button type="button" onClick={() => { setInviteError(null); setInviteOpen(true); }} onMouseEnter={inviteButtonIcon.onMouseEnter} onMouseLeave={inviteButtonIcon.onMouseLeave} className="flex h-10 items-center rounded-md bg-[var(--brand)] px-3.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"><Plus ref={inviteButtonIcon.ref} size={16} duration={0.55} className="mr-1.5" aria-hidden="true" />Invite member</button>}</div></div>
      {error && <p role="alert" className="mt-5 rounded-md bg-red-50 px-4 py-3">{error}</p>}{success && <p role="status" className="mt-5 rounded-md bg-emerald-50 px-4 py-3">{success}</p>}
      <section className="mt-6 overflow-hidden rounded-md border border-[var(--border-soft)] bg-white shadow-[0_3px_12px_rgba(30,40,55,.045)]"><div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4 sm:px-6"><div><h2 className="text-[15px] font-medium text-[var(--text-primary)]">People with access</h2><p className="mt-0.5">{members.length} active workspace member{members.length === 1 ? "" : "s"}</p></div><UsersRound size={19} duration={0.7} className="text-[var(--brand)]" aria-hidden="true" /></div><div className="divide-y divide-[var(--border-soft)]">{members.map((member) => { const isOwner = member.role.slug === "owner"; const busy = workingId === member.id; return <div key={member.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between sm:px-6"><div className="flex min-w-0 items-center gap-3"><Avatar className="size-10 rounded-full bg-[var(--brand-soft)]"><AvatarFallback className="rounded-full bg-[var(--brand-soft)] text-xs font-medium text-[var(--brand)]">{initials(member.user.firstName, member.user.lastName)}</AvatarFallback></Avatar><div className="min-w-0"><p >{member.user.firstName} {member.user.lastName}{isOwner && <span className="ml-2 rounded-md bg-[var(--brand-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand)]">Owner</span>}</p><p >{member.user.email}</p></div></div><div className="flex flex-wrap items-center gap-2 lg:justify-end"><span className={cn("rounded-md px-2 py-1 text-[10px] font-medium", member.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{member.status === "ACTIVE" ? "Active" : "Suspended"}</span><Select disabled={isOwner || !canManage || busy} value={member.role.id} onValueChange={(roleId) => void changeRole(member, roleId)}><SelectTrigger aria-label={`Role for ${member.user.firstName} ${member.user.lastName}`} className="h-9 w-[145px] text-xs"><SelectValue /></SelectTrigger><SelectContent className="z-[60]">{roles.map((role) => <SelectItem key={role.id} value={role.id} disabled={role.slug === "owner"}>{role.name}</SelectItem>)}</SelectContent></Select>{!isOwner && canManage && <button type="button" disabled={busy} onClick={() => void changeStatus(member)} className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] disabled:opacity-50">{member.status === "ACTIVE" ? "Deactivate" : "Activate"}</button>}{!isOwner && canRemove && <button type="button" disabled={busy} onClick={() => void (async () => { if (!workspaceId || !accessToken) return; setWorkingId(member.id); try { await apiRequest(`/workspaces/${workspaceId}/members/${member.id}`, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } }); setSuccess(`${member.user.firstName} ${member.user.lastName} was removed.`); await load(); } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to remove this member."); } finally { setWorkingId(null); } })()} className="h-9 rounded-md px-3 text-xs font-medium text-[var(--danger)] hover:bg-red-50 disabled:opacity-50">Remove</button>}</div></div>; })}</div></section>
      <section className="mt-5 rounded-md border border-[var(--border-soft)] bg-white shadow-[0_3px_12px_rgba(30,40,55,.045)]"><div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4 sm:px-6"><div><h2 className="text-[15px] font-medium text-[var(--text-primary)]">Pending invitations</h2><p className="mt-0.5">Invitations expire after 7 days.</p></div><Mail size={18} duration={0.7} className="text-[var(--text-muted)]" aria-hidden="true" /></div>{invitations.length === 0 ? <p className="px-5 py-5 sm:px-6">No pending invitations.</p> : <div className="divide-y divide-[var(--border-soft)]">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p >{invitation.email}</p><p className="mt-1">{invitation.role.name} · Sent {formatDate(invitation.createdAt)}</p></div>{canInvite && <button type="button" disabled={workingId === invitation.id} onClick={() => void revokeInvitation(invitation)} className="flex h-8 w-fit items-center rounded-md px-2.5 text-xs font-medium text-[var(--danger)] hover:bg-red-50 disabled:opacity-50"><X size={13} duration={0.5} className="mr-1" aria-hidden="true" />Revoke</button>}</div>)}</div>}</section>
      <InviteMemberDialog open={inviteOpen} roles={roles} inviting={inviting} error={inviteError} onClose={() => setInviteOpen(false)} onInvite={invite} />
    </div>
  );
}
