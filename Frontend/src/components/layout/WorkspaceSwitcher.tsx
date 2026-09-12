import { useState, type FormEvent } from "react";
import { Building2, ChevronDown, Plus, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveMembership, markWorkspaceForOnboarding, setActiveWorkspaceId } from "@/lib/workspace";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "WS";
}

function WorkspaceAvatar({ name, logoData, size }: { name: string; logoData?: string | null; size: "large" | "small" }) {
  const classes = size === "large" ? "size-10 rounded-md" : "size-7 rounded-md";
  return (
    <Avatar className={cn(classes, "border border-white/10 bg-white/10")}>
      <AvatarImage src={logoData ?? undefined} alt="" />
      <AvatarFallback className={cn("rounded-md", size === "large" ? "bg-white/10 text-[12px] text-white" : "bg-[var(--brand-soft)] text-[10px] text-[var(--brand)]", "font-semibold")}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const memberships = user?.memberships ?? [];
  const workspace = getActiveMembership(user)?.workspace;
  const workspaceName = workspace?.name ?? "Your workspace";
  const canCreate = memberships.some(({ role }) => role.slug === "owner" || role.slug === "admin");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !name.trim()) return;
    setError(null);
    try {
      const created = await apiRequest<{ id: string }>("/workspaces", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: name.trim(), companyName: companyName.trim() || undefined }),
      });
      setActiveWorkspaceId(created.id);
      markWorkspaceForOnboarding(created.id);
      window.location.reload();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to create the workspace.");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-navbar-workspace
            aria-label={`Switch workspace: ${workspaceName}`}
            title={`Switch workspace: ${workspaceName}`}
            variant="ghost"
            className="h-10 w-10 shrink-0 justify-center gap-2 rounded-lg border border-[#e4e8e5] bg-[#f7f8f7] px-1.5 text-[var(--text-primary)] shadow-none hover:bg-[var(--brand-subtle)] sm:w-[min(220px,30vw)] sm:justify-start sm:px-2"
          >
            <span className="relative shrink-0">
              <WorkspaceAvatar name={workspaceName} logoData={workspace?.logoData} size="small" />
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#34d399] ring-2 ring-[#f7f8f7]" />
            </span>
            <span className="hidden min-w-0 flex-1 text-left sm:block">
              <span className="block truncate text-[13px] font-semibold leading-4 text-[var(--text-primary)]">{workspaceName}</span>
              <span className="mt-0.5 block truncate text-[11px] font-normal leading-4 text-[var(--text-muted)]">Business workspace</span>
            </span>
            <ChevronDown className="hidden size-4 shrink-0 text-[var(--text-muted)] sm:block" strokeWidth={1.9} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[244px]">
          <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
          {memberships.map(({ workspace: item }) => (
            <DropdownMenuItem key={item.id} onSelect={() => { setActiveWorkspaceId(item.id); window.location.reload(); }}>
              <WorkspaceAvatar name={item.name} logoData={item.logoData} size="small" />
              <span className="truncate">{item.name}</span>
            </DropdownMenuItem>
          ))}
          {canCreate && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { setError(null); setCreating(true); }}><Plus className="size-4" />Create new workspace</DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={() => navigate("/settings")}><Settings className="size-4" />Workspace settings</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {creating && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--overlay)] px-4 backdrop-blur-[2px]" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="create-workspace-title" className="w-full max-w-[460px] rounded-xl border border-[var(--border)] bg-white p-6 shadow-[0_18px_50px_rgba(16,24,20,.14)]">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Building2 size={19} aria-hidden="true" /></div>
              <div><h2 id="create-workspace-title" className="text-lg font-semibold text-[var(--text-primary)]">Create a new workspace</h2><p className="mt-1">Create a separate workspace for another company or team.</p></div>
            </div>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div><label htmlFor="new-workspace-name" className="mb-2 block text-[13px] font-medium text-[#525252]">Workspace name</label><Input id="new-workspace-name" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></div>
              <div><label htmlFor="new-workspace-company" className="mb-2 block text-[13px] font-medium text-[#525252]">Company name</label><Input id="new-workspace-company" maxLength={160} value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></div>
              {error && <p role="alert" className="rounded-lg bg-[var(--danger-soft)] px-3 py-2.5">{error}</p>}
              <div className="grid grid-cols-[110px_1fr] gap-3 pt-1">
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                <Button type="submit" disabled={!name.trim()}>Create workspace</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
