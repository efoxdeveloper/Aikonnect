import { useEffect, useState } from "react";
import MuiAvatar from "@mui/material/Avatar";
import { useNavigate } from "react-router-dom";
import { ChevronDown, CreditCard, LogOut, Settings, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";

type SubscriptionSummary = { active: { planName: string } | null };

export function UserMenu({ expanded = false }: { expanded?: boolean }) {
  const navigate = useNavigate();
  const { user, accessToken, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [activePlan, setActivePlan] = useState<{ workspaceId: string; name: string | null } | null>(null);
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canReadBilling = membership?.role.permissions.includes("billing.read") ?? false;
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : "Account";
  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "AC";

  useEffect(() => {
    let current = true;
    if (!open || !workspaceId || !accessToken || !canReadBilling) {
      setActivePlan(null);
      return () => { current = false; };
    }
    setActivePlan(null);
    void apiRequest<SubscriptionSummary>(`/workspaces/${workspaceId}/subscriptions`, {
      headers: { authorization: `Bearer ${accessToken}` },
    }).then((result) => {
      if (current) setActivePlan({ workspaceId, name: result.active?.planName ?? null });
    }).catch(() => {
      if (current) setActivePlan(null);
    });
    return () => { current = false; };
  }, [accessToken, canReadBilling, open, workspaceId]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setOpen(false);
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
      setSigningOut(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Open profile menu" title={name || "Open profile menu"} className={`interakt-button flex items-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 ${expanded ? "h-[52px] w-full justify-start gap-2 rounded-lg border border-[var(--border)] bg-white px-2 hover:border-[var(--border-strong)]" : "size-10 justify-center rounded-full bg-transparent hover:bg-[var(--surface-subtle)]"}`}>
          <MuiAvatar sx={{ width: 34, height: 34, fontSize: 12, flexShrink: 0, bgcolor: "#ebf7f0", color: "#186d38", border: "1px solid var(--border)" }} className="font-semibold">{initials}</MuiAvatar>
          {expanded && <><span className="flex min-w-0 flex-1 flex-col text-left leading-tight"><span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{name || "Account"}</span><span className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{user?.email}</span></span><ChevronDown className="size-3.5 shrink-0 text-[var(--text-muted)]" /></>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-[220px]">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{name}</span>
          <span className="mt-0.5 block truncate text-xs font-normal text-[var(--text-muted)]">{user?.email}</span>
          {canReadBilling && <span className="mt-1 block truncate text-xs font-medium text-[var(--brand)]">{activePlan && activePlan.workspaceId === workspaceId ? activePlan.name ? `Active plan · ${activePlan.name}` : "No active plan" : "Loading active plan…"}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/account-settings")}><UserRound className="size-4" />Settings</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/settings")}><Settings className="size-4" />Workspace Settings</DropdownMenuItem>
        <DropdownMenuItem><CreditCard className="size-4" />Billing &amp; Usage</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={() => void handleSignOut()}
          className="text-[var(--danger)] focus:text-[var(--danger)]"
        >
          <LogOut className="size-4" />
          {signingOut ? "Signing out…" : "Sign Out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
