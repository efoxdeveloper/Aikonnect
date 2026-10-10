import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { WorkspaceSetupData } from "@/types/workspace";
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
  const permissions = getActiveMembership(user)?.role.permissions ?? [];
  const canReadBilling = permissions.includes("billing.read");
  const canReadWorkspace = permissions.includes("workspace.read");
  const [wallet, setWallet] = useState<WorkspaceWallet | null>(null);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!accessToken || !workspaceId || !canReadBilling || !canReadWorkspace) {
      setWallet(null);
      setWhatsappConnected(false);
      return;
    }

    let active = true;
    setDismissed(false);
    setWhatsappConnected(false);
    const options = { headers: { authorization: `Bearer ${accessToken}` } };
    void (async () => {
      try {
        const walletResult = await apiRequest<WorkspaceWallet>(`/workspaces/${workspaceId}/wallet/`, options);
        if (!active) return;
        setWallet(walletResult);
        const available = Number(walletResult.availableBalance ?? walletResult.balance);
        const threshold = Number(walletResult.lowBalanceThreshold);
        const isLow = Number.isFinite(available) && Number.isFinite(threshold) && available <= threshold;
        if (!isLow) {
          setWhatsappConnected(false);
          return;
        }

        const setup = await apiRequest<WorkspaceSetupData>(`/workspaces/${workspaceId}/setup`, options);
        if (!active) return;
        const account = setup.whatsapp.accounts.find((item) => item.status === "CONNECTED") ?? setup.whatsapp.accounts[0];
        const phone = account?.phoneNumbers.find((item) => item.status === "ACTIVE") ?? account?.phoneNumbers[0];
        setWhatsappConnected(setup.whatsapp.status === "CONNECTED" && phone?.status === "ACTIVE");
      } catch {
        if (active) {
          setWallet(null);
          setWhatsappConnected(false);
        }
      }
    })();

    return () => { active = false; };
  }, [accessToken, canReadBilling, canReadWorkspace, workspaceId]);

  const availableBalance = wallet?.availableBalance ?? wallet?.balance;
  const threshold = wallet?.lowBalanceThreshold;
  const isLowBalance = availableBalance !== undefined
    && threshold !== undefined
    && Number.isFinite(Number(availableBalance))
    && Number.isFinite(Number(threshold))
    && Number(availableBalance) <= Number(threshold);
  const showStrip = !dismissed && isLowBalance && whatsappConnected;

  useEffect(() => {
    document.documentElement.style.setProperty("--notification-strip-height", showStrip ? "36px" : "0px");
    return () => { document.documentElement.style.setProperty("--notification-strip-height", "0px"); };
  }, [showStrip]);

  if (dismissed || !isLowBalance || !whatsappConnected || !wallet || availableBalance === undefined || threshold === undefined) return null;

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
