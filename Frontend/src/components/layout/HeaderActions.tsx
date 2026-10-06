import { useEffect, useState } from "react";
import { BellIcon as Bell } from "@animateicons/react/lucide";
import { Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";

type WalletSummary = { currency: string; balance: string };
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
  const amount = wallet?.balance && Number.isFinite(Number(wallet.balance)) ? walletAmountFormat.format(Number(wallet.balance)) : wallet?.balance ?? "—";
  const formatted = wallet ? `${wallet.currency === "INR" ? "₹" : wallet.currency} ${amount}` : "—";
  return <button type="button" data-testid="navbar-wallet" aria-label={`Wallet balance ${formatted}`} title={`Wallet balance ${formatted}`} onClick={() => navigate("/billing")} className="flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-1 text-xs font-semibold tabular-nums text-[var(--text-primary)] shadow-none transition-colors hover:bg-[var(--surface-subtle)] sm:w-auto sm:px-2"><Wallet size={16} className="shrink-0 text-[var(--brand)]" /><span className="hidden md:inline">{formatted}</span></button>;
}

export function HeaderActions() { return <div className="flex shrink-0 items-center justify-end"><WalletBalance /></div>; }
