import { useEffect, useState } from "react";
import { BellIcon as Bell } from "@animateicons/react/lucide";
import { WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserMenu } from "./UserMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import type { AnimatedIcon } from "@/config/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";

type WalletSummary = { currency: string; balance: string };

function HeaderIconButton({ label, icon: Icon, indicator }: { label: string; icon: AnimatedIcon; indicator?: boolean }) { const animatedIcon = useAnimatedIcon(); return <Tooltip><TooltipTrigger asChild><Button aria-label={label} title={label} variant="ghost" size="icon" onMouseEnter={animatedIcon.onMouseEnter} onMouseLeave={animatedIcon.onMouseLeave} className="group/action relative rounded-full bg-[#f7f8f7] text-[var(--icon-muted)] shadow-[inset_0_0_0_1px_#e9ecea] active:shadow-inner"><Icon ref={animatedIcon.ref} size={19} duration={0.7} />{indicator && <span className="pointer-events-none absolute right-1.5 top-1.5 size-[7px] rounded-full bg-[var(--brand-accent)] ring-2 ring-[#f7f8f7]" />}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>; }

export function WalletBalance() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canRead = membership?.role.permissions.includes("billing.read") ?? false;
  const [wallet, setWallet] = useState<WalletSummary | null>(null);

  useEffect(() => {
    if (!accessToken || !workspaceId || !canRead) {
      setWallet(null);
      return;
    }
    let active = true;
    setWallet(null);
    void apiRequest<WalletSummary>(`/workspaces/${workspaceId}/wallet/`, {
      headers: { authorization: `Bearer ${accessToken}` },
    }).then((result) => {
      if (active) setWallet(result);
    }).catch(() => {
      if (active) setWallet({ currency: "", balance: "—" });
    });
    return () => { active = false; };
  }, [accessToken, canRead, workspaceId]);

  if (!canRead) return null;
  const formatted = wallet ? `${wallet.currency === "INR" ? "₹" : wallet.currency} ${wallet.balance}` : "—";
  return <button type="button" data-testid="navbar-wallet" aria-label={`Wallet balance ${formatted}`} title="Wallet balance" onClick={() => navigate("/billing")} className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[#e4e8e5] bg-[#f7f8f7] px-2.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--brand-subtle)]"><WalletCards size={16} className="shrink-0 text-[var(--brand)]" /><span className="hidden sm:inline">Wallet</span><span>{formatted}</span></button>;
}

export function HeaderActions() { return <TooltipProvider delayDuration={250}><div className="flex shrink-0 items-center gap-2 sm:gap-2.5"><WorkspaceSwitcher /><WalletBalance /><Popover><PopoverTrigger asChild><div><HeaderIconButton label="Notifications" icon={Bell} indicator /></div></PopoverTrigger><PopoverContent align="end" className="w-[250px]"><p >Notifications</p><p className="mt-1">You’re all caught up. New workspace activity will appear here.</p></PopoverContent></Popover><UserMenu /></div></TooltipProvider>; }
