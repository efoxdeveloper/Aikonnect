import { ArrowLeftIcon as ArrowLeft, CheckIcon as Check, CircleCheckIcon as CircleCheck, ExternalLinkIcon as ExternalLink, LoaderCircleIcon as LoaderCircle, MessageSquareIcon as MessageSquare, QrCodeIcon as QrCode, RefreshCwIcon as RefreshCw, ScanLineIcon as ScanLine, ShieldCheckIcon as ShieldCheck, SmartphoneIcon as Smartphone } from "@animateicons/react/lucide";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { useWorkspaceSetup } from "@/hooks/use-workspace-setup";
import { useWhatsAppEmbeddedSignup } from "@/hooks/use-whatsapp-embedded-signup";
import { getActiveMembership } from "@/lib/workspace";
import { apiRequest } from "@/lib/api";

const requirements = [
  "Administrator access to a Meta Business portfolio",
  "A business phone number that can receive an OTP",
  "Business details that match your legal documents",
  "Permission to manage the WhatsApp Business Account",
];

const coexistenceSteps = [
  { title: "Choose Meta", detail: "Sign in and select your business portfolio.", icon: ExternalLink },
  { title: "Verify number", detail: "Use the number already active in WhatsApp Business.", icon: Smartphone },
  { title: "Scan QR", detail: "Open the Facebook message and scan the live code.", icon: ScanLine },
  { title: "Start chatting", detail: "Use the phone app and Cloud API together.", icon: CircleCheck },
];

export function WhatsAppAccountSetup() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const { data, loading, error, refresh } = useWorkspaceSetup(membership?.workspace.id, accessToken);
  const { connecting, error: connectionError, start } = useWhatsAppEmbeddedSignup({ workspaceId: membership?.workspace.id, accessToken, onConnected: refresh });
  const [recipient, setRecipient] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const messageIcon = useAnimatedIcon();
  const externalIcon = useAnimatedIcon();
  const backIcon = useAnimatedIcon();
  const connectedAccount = data?.whatsapp.accounts.find((account) => account.status === "CONNECTED") ?? data?.whatsapp.accounts[0];
  const connectedPhone = connectedAccount?.phoneNumbers.find((phone) => phone.status === "ACTIVE") ?? connectedAccount?.phoneNumbers[0];
  const isConnected = data?.whatsapp.status === "CONNECTED" && Boolean(connectedPhone);
  const isCoexistence = Boolean(connectedPhone?.isOnBusinessApp && connectedPhone.platformType === "CLOUD_API");

  async function sendTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!membership?.workspace.id || !accessToken) return;
    setSendingTest(true); setActionMessage(null);
    try {
      await apiRequest(`/workspaces/${membership.workspace.id}/whatsapp/test-message`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ to: recipient }) });
      setActionMessage("Test message sent successfully. Check the recipient's WhatsApp.");
      await refresh();
    } catch (caughtError) { setActionMessage(caughtError instanceof Error ? caughtError.message : "The test message could not be sent."); }
    finally { setSendingTest(false); }
  }

  async function disconnect() {
    if (!membership?.workspace.id || !accessToken) return;
    if (!window.confirm("Remove this WhatsApp connection from Aikonnect? To fully offboard a coexistence number, you must also disconnect it in WhatsApp Business.")) return;
    setDisconnecting(true); setActionMessage(null);
    try { const result = await apiRequest<{ message: string }>(`/workspaces/${membership.workspace.id}/whatsapp/connection`, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } }); setActionMessage(result.message); await refresh(); }
    catch (caughtError) { setActionMessage(caughtError instanceof Error ? caughtError.message : "The WhatsApp connection could not be removed."); }
    finally { setDisconnecting(false); }
  }

  return (
    <div className="mx-auto max-w-[1050px] px-5 py-7 sm:px-8 sm:py-9">
      <Link to="/dashboard" onMouseEnter={backIcon.onMouseEnter} onMouseLeave={backIcon.onMouseLeave} className="inline-flex items-center text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--brand)]"><ArrowLeft ref={backIcon.ref} size={14} duration={0.55} className="mr-1.5" aria-hidden="true" />Back to setup</Link>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="uppercase">Channel setup</p>
          <h1 className="mt-1.5 text-[25px] font-medium tracking-[-0.025em] text-[var(--text-primary)]">WhatsApp Business account</h1>
          <p className="mt-1">Connect Meta securely to start using the WhatsApp Cloud API.</p>
        </div>
        <span className={`w-fit rounded-md px-3 py-1.5 text-xs font-medium ${isConnected ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-amber-50 text-amber-700"}`}>{loading ? "Checking…" : isConnected ? "Connected" : "Not connected"}</span>
      </div>

      {(error || connectionError) && <p role="alert" className="mt-5 rounded-md bg-red-50 px-4 py-3">{connectionError ?? error}</p>}
      {actionMessage && <p role="status" className={`mt-5 rounded-md px-4 py-3 ${actionMessage.includes("successfully") || actionMessage.includes("removed") ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-red-50 text-[var(--danger)]"}`}>{actionMessage}</p>}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="rounded-md border border-[var(--border-soft)] bg-white p-6 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-8">
          {isConnected ? <>
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] pb-5">
            <div className="flex items-start gap-4">
            <div onMouseEnter={messageIcon.onMouseEnter} onMouseLeave={messageIcon.onMouseLeave} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><MessageSquare ref={messageIcon.ref} size={23} duration={0.7} aria-hidden="true" /></div>
            <div>
              <h2 className="text-[17px] font-medium text-[var(--text-primary)]">WhatsApp is connected</h2>
              <p className="mt-1.5">{connectedAccount?.displayName ?? "Business account"} · {connectedPhone?.displayPhoneNumber}</p>
              <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isCoexistence ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-slate-100 text-slate-600"}`}>
                {isCoexistence ? <><CircleCheck size={13} /> Coexistence active</> : "Cloud API active"}
              </span>
            </div>
            </div>
            <button type="button" onClick={() => void disconnect()} disabled={disconnecting} className="shrink-0 text-xs font-medium text-[var(--danger)] hover:underline disabled:opacity-60">{disconnecting ? "Removing…" : "Disconnect"}</button>
          </div>
          {isCoexistence && <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-3"><Smartphone size={17} className="text-[var(--brand)]" /><div className="mt-2 text-xs font-semibold text-[var(--text-primary)]">Phone app</div><div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">Connected</div></div>
            <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-3"><MessageSquare size={17} className="text-[var(--brand)]" /><div className="mt-2 text-xs font-semibold text-[var(--text-primary)]">Cloud API</div><div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">Ready for inbox</div></div>
            <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-3"><RefreshCw size={17} className="text-[var(--brand)]" /><div className="mt-2 text-xs font-semibold text-[var(--text-primary)]">Last sync</div><div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{connectedAccount?.lastSyncedAt ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(connectedAccount.lastSyncedAt)) : "Pending"}</div></div>
          </div>}
          {connectedAccount?.lastError && <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-800"><RefreshCw size={15} className="mt-0.5 shrink-0" /><div><strong>Sync needs attention.</strong> {connectedAccount.lastError}</div></div>}
          <form onSubmit={sendTest} className="mt-6 rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Send a test message</h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Enter a WhatsApp number that can receive messages. Include the country code.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input aria-label="Test recipient phone number" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="+919876543210" className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)]" required pattern="\+[1-9][0-9]{6,14}" /><button type="submit" disabled={sendingTest} className="h-10 rounded-md bg-[var(--brand)] px-4 text-xs font-semibold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60">{sendingTest ? "Sending…" : "Send test"}</button></div>
          </form>
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><strong>Fully disconnect coexistence:</strong> in WhatsApp Business, open Settings → Account → Business Platform → Disconnect Account. The button above only removes this workspace's saved connection.</div>
          </> : <>
          <div className="rounded-xl bg-[linear-gradient(135deg,#effcf6_0%,#f8fbff_100%)] p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div onMouseEnter={messageIcon.onMouseEnter} onMouseLeave={messageIcon.onMouseLeave} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-[var(--brand)] shadow-[0_4px_12px_rgba(4,63,50,.08)]"><MessageSquare ref={messageIcon.ref} size={23} duration={0.7} aria-hidden="true" /></div>
            <div>
              <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Keep WhatsApp on your phone</h2>
              <p className="mt-1.5 max-w-[560px] text-sm leading-5 text-[var(--text-secondary)]">Connect your existing WhatsApp Business App to Cloud API and manage the same number from both places.</p>
            </div>
          </div>
          <ol aria-label="Coexistence setup steps" className="mt-6 grid gap-2 sm:grid-cols-4">
            {coexistenceSteps.map(({ title, detail, icon: Icon }, index) => (
              <li key={title} className="relative rounded-lg border border-white/80 bg-white/80 p-3 shadow-[0_2px_8px_rgba(4,63,50,.04)] sm:min-h-[128px]">
                <div className="flex items-center justify-between"><span className="flex size-7 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">{index + 1}</span><Icon size={17} className="text-[var(--brand)]" /></div>
                <div className="mt-3 text-xs font-semibold text-[var(--text-primary)]">{title}</div><div className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">{detail}</div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-white/80 p-3.5">
            <QrCode size={22} className="mt-0.5 shrink-0 text-[var(--brand)]" />
            <div><div className="text-xs font-semibold text-[var(--text-primary)]">The QR code appears inside Meta’s secure flow</div><div className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">When Facebook sends a message to your WhatsApp Business App, tap <strong>Scan QR</strong> and scan the live code shown by Meta. Screenshots will not work.</div></div>
          </div>
          <button type="button" disabled={connecting || loading} onClick={() => void start()} onMouseEnter={externalIcon.onMouseEnter} onMouseLeave={externalIcon.onMouseLeave} className="mt-6 flex h-11 w-full items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-60">
            {connecting ? "Opening Meta…" : "Connect existing Business App"}
            {connecting ? <LoaderCircle size={15} className="ml-2 animate-spin" aria-hidden="true" /> : <ExternalLink ref={externalIcon.ref} size={15} duration={0.6} className="ml-2" aria-hidden="true" />}
          </button>
          <p className="mt-2.5 text-center text-[11px] text-[var(--text-muted)]">Your WhatsApp credentials stay with Meta. Aikonnect only receives the approved connection.</p>
          </div>
          </>}
        </section>

        <aside className="space-y-5">
          <section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)]">
            <div className="flex items-center gap-2 text-[var(--text-primary)]"><ShieldCheck size={18} duration={0.65} className="text-[var(--brand)]" aria-hidden="true" /><h2 className="text-sm font-medium">Before you connect</h2></div>
            <ul className="mt-4 space-y-3">
              {requirements.map((requirement) => <li key={requirement} className="flex gap-2.5 text-xs leading-5 text-[var(--text-secondary)]"><Check size={14} duration={0.5} className="mt-0.5 shrink-0 text-[var(--success)]" aria-hidden="true" />{requirement}</li>)}
            </ul>
          </section>
          <section className="rounded-md border border-[var(--green-100)] bg-[var(--brand-subtle)] p-5">
            <h2 className="text-sm font-medium text-[var(--brand)]">Developer configuration</h2>
            <p className="mt-2">Sign in to Meta, choose your business and connect a WhatsApp phone number. Your credentials remain with Meta.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
