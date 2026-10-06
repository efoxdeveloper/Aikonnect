import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { NotificationStrip } from "./NotificationStrip";

type WorkspaceWallet = {
  currency: string;
  availableBalance?: string;
  lowBalanceThreshold?: string;
  balance?: string;
};

const moneyFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatMoney(currency: string, value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  return `${currency === "INR" ? "₹" : currency} ${moneyFormat.format(amount)}`;
}

export function WorkspaceNotificationStrip({ className, reserveSpace = false, style }: { className?: string; reserveSpace?: boolean; style?: CSSProperties }) {
  const { accessToken, user } = useAuth();
  const workspaceId = getActiveMembership(user)?.workspace.id;
  const canReadBilling = getActiveMembership(user)?.role.permissions.includes("billing.read") ?? false;
  const [wallet, setWallet] = useState<WorkspaceWallet | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!accessToken || !workspaceId || !canReadBilling) {
      setWallet(null);
      return;
    }

    let active = true;
    setDismissed(false);
    void apiRequest<WorkspaceWallet>(`/workspaces/${workspaceId}/wallet/`, {
      headers: { authorization: `Bearer ${accessToken}` },
    }).then((result) => {
      if (active) setWallet(result);
    }).catch(() => {
      if (active) setWallet(null);
    });

    return () => { active = false; };
  }, [accessToken, canReadBilling, workspaceId]);

  const availableBalance = wallet?.availableBalance ?? wallet?.balance;
  const threshold = wallet?.lowBalanceThreshold;
  const isLowBalance = availableBalance !== undefined
    && threshold !== undefined
    && Number.isFinite(Number(availableBalance))
    && Number.isFinite(Number(threshold))
    && Number(availableBalance) <= Number(threshold);
  const showStrip = !dismissed && isLowBalance;

  useEffect(() => {
    document.documentElement.style.setProperty("--notification-strip-height", showStrip ? "36px" : "0px");
    return () => { document.documentElement.style.setProperty("--notification-strip-height", "0px"); };
  }, [showStrip]);

  if (dismissed || !isLowBalance || !wallet || availableBalance === undefined || threshold === undefined) return null;

  return (
    <>
      {reserveSpace && <div aria-hidden="true" className="min-h-9" />}
      <NotificationStrip
        tone="warning"
        title="Low Balance"
        message={`Your messaging has been stopped due to low wallet balance. Please add funds to continue sending WhatsApp messages. Available ${formatMoney(wallet.currency, availableBalance)}.`}
        actions={(
          <>
            <Link to="/billing" className="rounded-md bg-white px-3 py-1.5 text-[11px] font-medium text-[#604900] shadow-sm ring-1 ring-[#caa900]/25 transition-colors hover:bg-[#fff8d9]">
              View Billing
            </Link>
            <Link to="/billing" className="rounded-md bg-[#087b61] px-3 py-1.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-[#06664f]">
              Add Funds
            </Link>
          </>
        )}
        onDismiss={() => setDismissed(true)}
        className={cn(className)}
        style={style}
      />
    </>
  );
}
