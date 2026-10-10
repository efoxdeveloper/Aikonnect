import { useEffect, useState } from "react";
import { BellIcon as Bell } from "@animateicons/react/lucide";
import { Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { subscribeToWalletEvents } from "@/lib/wallet-events";

type WalletSummary = { currency: string; balance: string; availableBalance?: string; reservedBalance?: string };
const walletAmountFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    let latestRequest = 0;
    const refresh = () => {
      const requestId = ++latestRequest;
      void apiRequest<WalletSummary>(`/workspaces/${workspaceId}/wallet/`, {
        headers: { authorization: `Bearer ${accessToken}` },
      }).then((result) => {
        if (active && requestId === latestRequest) setWallet(result);
      }).catch(() => {
        if (active && requestId === latestRequest) setWallet({ currency: "", balance: "—" });
      });
    };
    setWallet(null);
    refresh();
    const unsubscribe = subscribeToWalletEvents({
      url: getApiUrl(`/workspaces/${workspaceId}/wallet/events`),
      accessToken,
      onUpdate: refresh,
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [accessToken, canRead, workspaceId]);

  if (!canRead) return null;
  const availableBalance = wallet?.availableBalance ?? wallet?.balance;
  const amount = availableBalance && Number.isFinite(Number(availableBalance)) ? walletAmountFormat.format(Number(availableBalance)) : availableBalance ?? "—";
  const formatted = wallet ? `${wallet.currency === "INR" ? "₹" : wallet.currency} ${amount}` : "—";
  const held = Number(wallet?.reservedBalance ?? 0);
  const heldFormatted = wallet ? `${wallet.currency === "INR" ? "₹" : wallet.currency} ${walletAmountFormat.format(Number.isFinite(held) ? held : 0)}` : "—";
  const heldLabel = held > 0 ? `; ${heldFormatted} held for pending messages` : "";
  return <button type="button" data-testid="navbar-wallet" aria-label={`Available wallet balance ${formatted}${heldLabel}`} title={`Available ${formatted}${heldLabel}`} onClick={() => navigate("/billing")} className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-1 text-xs font-semibold tabular-nums text-[var(--text-primary)] shadow-none transition-colors hover:bg-[var(--surface-subtle)] sm:px-2"><Wallet size={16} className="shrink-0 text-[var(--brand)]" /><span className="hidden md:inline">{formatted}</span>{held > 0 && <span className="hidden text-[10px] font-normal text-[var(--text-muted)] lg:inline">Held {heldFormatted}</span>}</button>;
}

export function HeaderActions() { return <div className="flex shrink-0 items-center justify-end"><WalletBalance /></div>; }
