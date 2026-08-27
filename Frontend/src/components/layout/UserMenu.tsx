import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, LogOut, Settings, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

export function UserMenu() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : "Account";
  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "AC";

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
        <button aria-label="Open profile menu" className="rounded-full outline-none transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-[0_3px_7px_rgba(31,42,55,.10)] active:translate-y-0 active:scale-[.94] focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30">
          <Avatar className="size-[42px] border border-[var(--border)]">
            <AvatarFallback className="bg-[#d7ecee] text-sm font-semibold text-[var(--brand)]">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[205px]">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{name}</span>
          <span className="mt-0.5 block truncate text-xs font-normal text-[var(--text-muted)]">{user?.email}</span>
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
