import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeftIcon as ArrowLeft,
  CheckIcon as Check,
  CircleCheckIcon as CircleCheck,
  ExternalLinkIcon as ExternalLink,
  LoaderCircleIcon as LoaderCircle,
  MessageSquareIcon as MessageSquare,
  QrCodeIcon as QrCode,
  RefreshCwIcon as RefreshCw,
  ScanLineIcon as ScanLine,
  ShieldCheckIcon as ShieldCheck,
  SmartphoneIcon as Smartphone,
} from "@animateicons/react/lucide";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { useWorkspaceSetup } from "@/hooks/use-workspace-setup";
import { useWhatsAppEmbeddedSignup } from "@/hooks/use-whatsapp-embedded-signup";
import { getActiveMembership } from "@/lib/workspace";
import { apiRequest } from "@/lib/api";
import { WhatsAppConnectionGuide, type ConnectionChoice } from "@/components/whatsapp/WhatsAppConnectionGuide";
import { WhatsAppRegistrationPinDialog } from "@/components/whatsapp/WhatsAppRegistrationPinDialog";

const requirements = [
  "Admin access to Meta Business",
  "A number that can receive an OTP",
  "Business details matching your documents",
  "Permission to manage WhatsApp Business",
];


const coexistenceSteps = [
  { title: "Choose Meta", detail: "Select your business.", icon: ExternalLink },
  { title: "Verify number", detail: "Confirm your WhatsApp number.", icon: Smartphone },
  { title: "Scan QR", detail: "Scan the code in WhatsApp.", icon: ScanLine },
  { title: "Start chatting", detail: "Use both apps together.", icon: CircleCheck },
];

export function WhatsAppAccountSetup() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") === "/onboarding" ? "/onboarding" : "/dashboard";
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const { data, loading, error, refresh } = useWorkspaceSetup(membership?.workspace.id, accessToken);
  const { connecting, error: connectionError, pinRequired, submitRegistrationPin, cancelRegistrationPin, start } = useWhatsAppEmbeddedSignup({
    workspaceId: membership?.workspace.id,
    accessToken,
    onConnected: refresh,
  });
  const [recipient, setRecipient] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [attachingBilling, setAttachingBilling] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [connectionGuideOpen, setConnectionGuideOpen] = useState(false);
  const [connectionLaunching, setConnectionLaunching] = useState(false);
  const [connectionChoice, setConnectionChoice] = useState<ConnectionChoice>("business-app");
  const messageIcon = useAnimatedIcon();
  const externalIcon = useAnimatedIcon();
  const backIcon = useAnimatedIcon();
  const connectedAccount = data?.whatsapp.accounts.find((account) => account.status === "CONNECTED") ?? data?.whatsapp.accounts[0];
  const connectedPhone = connectedAccount?.phoneNumbers.find((phone) => phone.status === "ACTIVE") ?? connectedAccount?.phoneNumbers[0];
  const isConnected = data?.whatsapp.status === "CONNECTED" && Boolean(connectedPhone);
  const isCoexistence = Boolean(connectedPhone?.isOnBusinessApp && connectedPhone.platformType === "CLOUD_API");

  useEffect(() => {
    if (connectionLaunching && !connecting) {
      setConnectionLaunching(false);
      setConnectionGuideOpen(false);
    }
  }, [connecting, connectionLaunching]);

  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!membership?.workspace.id || !accessToken) return;
    setSendingTest(true);
    setActionMessage(null);
    try {
      await apiRequest(`/workspaces/${membership.workspace.id}/whatsapp/test-message`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ to: recipient }),
      });
      setActionMessage("Test message sent successfully. Check the recipient's WhatsApp.");
      await refresh();
    } catch (caughtError) {
      setActionMessage(caughtError instanceof Error ? caughtError.message : "The test message could not be sent.");
    } finally {
      setSendingTest(false);
    }
  }

  async function disconnect() {
    if (!membership?.workspace.id || !accessToken) return;
    if (!window.confirm("Remove this WhatsApp connection?")) return;
    setDisconnecting(true);
    setActionMessage(null);
    try {
      const result = await apiRequest<{ message: string }>(`/workspaces/${membership.workspace.id}/whatsapp/connection`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      setActionMessage(result.message);
      await refresh();
    } catch (caughtError) {
      setActionMessage(caughtError instanceof Error ? caughtError.message : "The WhatsApp connection could not be removed.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function attachSharedBilling() {
    if (!membership?.workspace.id || !accessToken) return;
    setAttachingBilling(true);
    setActionMessage(null);
    try {
      await apiRequest(`/workspaces/${membership.workspace.id}/whatsapp/shared-billing`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      setActionMessage("Shared billing attached successfully.");
      await refresh();
    } catch (caughtError) {
      setActionMessage(caughtError instanceof Error ? caughtError.message : "Shared billing could not be attached.");
      await refresh();
    } finally {
      setAttachingBilling(false);
    }
  }

  return (
    <div data-testid="whatsapp-account-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]">
      <header className="flex-none border-b border-[var(--border-soft)] bg-white shadow-[0_1px_3px_rgba(30,40,55,.04)]">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">WhatsApp account</h1>
          <span className={`w-fit rounded-md px-2.5 py-1 text-[11px] font-medium ${isConnected ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-amber-50 text-amber-700"}`}>
            {loading ? "Checking…" : isConnected ? "Connected" : "Not connected"}
          </span>
        </div>
      </header>

      <main data-testid="whatsapp-account-scroll-region" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-5 py-5 sm:px-8 sm:py-7">
          <Link to={returnTo} onMouseEnter={backIcon.onMouseEnter} onMouseLeave={backIcon.onMouseLeave} className="mb-4 inline-flex items-center text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--brand)]">
            <ArrowLeft ref={backIcon.ref} size={14} duration={0.55} className="mr-1.5" aria-hidden="true" />
            Back to {returnTo === "/onboarding" ? "onboarding" : "setup"}
          </Link>

          {(error || connectionError) && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{connectionError ?? error}</div>}
          {actionMessage && <div role="status" className={`mb-4 rounded-md border px-4 py-3 text-sm ${actionMessage.includes("successfully") || actionMessage.includes("removed") ? "border-emerald-200 bg-[var(--success-soft)] text-[var(--success)]" : "border-red-200 bg-red-50 text-[var(--danger)]"}`}>{actionMessage}</div>}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)]">
              <div className="p-5 sm:p-6">
                {isConnected ? (
                  <>
                    <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] pb-4">
                      <div className="flex items-start gap-4">
                        <div onMouseEnter={messageIcon.onMouseEnter} onMouseLeave={messageIcon.onMouseLeave} className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]">
                          <MessageSquare ref={messageIcon.ref} size={18} duration={0.7} aria-hidden="true" />
                        </div>
                        <div>
                          <h2 className="text-sm font-medium text-[var(--text-primary)]">WhatsApp is connected</h2>
                          <div className="mt-0.5 text-xs text-[var(--text-muted)]">{connectedAccount?.displayName ?? "Business account"} · {connectedPhone?.displayPhoneNumber}</div>
                          <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isCoexistence ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-slate-100 text-slate-600"}`}>
                            {isCoexistence ? <><CircleCheck size={13} /> Coexistence active</> : "Cloud API active"}
                          </span>
                        </div>
                      </div>
                      <button type="button" onClick={() => void disconnect()} disabled={disconnecting} className="shrink-0 text-xs font-medium text-[var(--danger)] hover:underline disabled:opacity-60">{disconnecting ? "Removing…" : "Disconnect"}</button>
                    </div>

                    {isCoexistence && <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <InfoTile icon={<Smartphone size={17} />} title="Phone app" detail="Connected" />
                      <InfoTile icon={<MessageSquare size={17} />} title="Cloud API" detail="Ready for inbox" />
                      <InfoTile icon={<RefreshCw size={17} />} title="Last sync" detail={connectedAccount?.lastSyncedAt ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(connectedAccount.lastSyncedAt)) : "Pending"} />
                    </div>}

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <InfoTile icon={<ShieldCheck size={17} />} title="Shared billing" detail={connectedAccount?.sharedBillingStatus === "ATTACHED" ? "Active" : connectedAccount?.sharedBillingStatus === "ERROR" ? "Needs attention" : "Not configured"} />
                    </div>
                    {connectedAccount?.sharedBillingStatus !== "ATTACHED" && <button type="button" onClick={() => void attachSharedBilling()} disabled={attachingBilling} className="mt-3 h-9 rounded-md border border-[var(--brand)] px-3 text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-60">{attachingBilling ? "Attaching shared billing…" : "Attach shared billing"}</button>}

                    {connectedAccount?.lastError && <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-800"><RefreshCw size={15} className="mt-0.5 shrink-0" /><div><strong>Sync needs attention.</strong> {connectedAccount.lastError}</div></div>}
                    {connectedAccount?.sharedBillingError && <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-800"><ShieldCheck size={15} className="mt-0.5 shrink-0" /><div><strong>Shared billing needs attention.</strong> {connectedAccount.sharedBillingError}</div></div>}
                    <form onSubmit={sendTest} className="mt-5 rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-4">
                      <h3 className="text-sm font-medium text-[var(--text-primary)]">Send a test message</h3>
                      <div className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Use an E.164 number, including the country code. The recipient must message your connected number first; otherwise Meta requires an approved template.</div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input aria-label="Test recipient phone number" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="+919876543210" className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)]" required pattern="\+[1-9][0-9]{6,14}" /><button type="submit" disabled={sendingTest} className="h-10 rounded-md bg-[var(--brand)] px-4 text-xs font-semibold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60">{sendingTest ? "Sending…" : "Send test"}</button></div>
                    </form>
                    {isCoexistence && <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><strong>Coexistence:</strong> remove the number from WhatsApp Business too to fully disconnect it.</div>}
                  </>
                ) : (
                  <div className="rounded-lg bg-[linear-gradient(135deg,#effcf6_0%,#f8fbff_100%)] p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div onMouseEnter={messageIcon.onMouseEnter} onMouseLeave={messageIcon.onMouseLeave} className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white text-[var(--brand)] shadow-[0_4px_12px_rgba(4,63,50,.08)]"><MessageSquare ref={messageIcon.ref} size={18} duration={0.7} aria-hidden="true" /></div>
                      <div>
                        <h2 className="text-base font-medium text-[var(--text-primary)]">Connect WhatsApp Business</h2>
                        <div className="mt-1 max-w-[560px] text-xs leading-5 text-[var(--text-secondary)]">Use the same number in WhatsApp and Marento.</div>
                      </div>
                    </div>
                    <ol aria-label="Coexistence setup steps" className="mt-5 grid gap-2 sm:grid-cols-4">
                      {coexistenceSteps.map(({ title, detail, icon: Icon }, index) => <li key={title} className="rounded-lg border border-white/80 bg-white/80 p-3 shadow-[0_2px_8px_rgba(4,63,50,.04)] sm:min-h-[112px]"><div className="flex items-center justify-between"><span className="flex size-7 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">{index + 1}</span><Icon size={17} className="text-[var(--brand)]" /></div><div className="mt-3 text-xs font-semibold text-[var(--text-primary)]">{title}</div><div className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">{detail}</div></li>)}
                    </ol>
                    <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-white/80 p-3.5"><QrCode size={22} className="mt-0.5 shrink-0 text-[var(--brand)]" /><div><div className="text-xs font-semibold text-[var(--text-primary)]">Scan the QR code in Meta’s flow</div><div className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">Open the message in WhatsApp and scan the live code. Screenshots will not work.</div></div></div>
                    <button type="button" disabled={connecting || loading} onClick={() => { setConnectionLaunching(false); setConnectionGuideOpen(true); }} onMouseEnter={externalIcon.onMouseEnter} onMouseLeave={externalIcon.onMouseLeave} className="mt-5 flex h-10 w-full items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-60">{connecting ? "Opening Meta…" : "Connect Number"}{connecting ? <LoaderCircle size={15} className="ml-2 animate-spin" aria-hidden="true" /> : <ExternalLink ref={externalIcon.ref} size={15} duration={0.6} className="ml-2" aria-hidden="true" />}</button>
                    <div className="mt-2.5 text-center text-[11px] text-[var(--text-muted)]">Meta keeps your credentials secure.</div>
                  </div>
                )}
              </div>
            </section>

            <aside>
              <section className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)]">
                <div className="flex items-center gap-2 text-[var(--text-primary)]"><ShieldCheck size={18} duration={0.65} className="text-[var(--brand)]" aria-hidden="true" /><h2 className="text-sm font-medium">Before you connect</h2></div>
                <ul className="mt-3 space-y-2.5">{requirements.map((requirement) => <li key={requirement} className="flex gap-2.5 text-xs leading-5 text-[var(--text-secondary)]"><Check size={14} duration={0.5} className="mt-0.5 shrink-0 text-[var(--success)]" aria-hidden="true" />{requirement}</li>)}</ul>
              </section>
            </aside>
          </div>
        </div>
      </main>
      {connectionGuideOpen && <WhatsAppConnectionGuide
        choice={connectionChoice}
        onChoiceChange={setConnectionChoice}
        loading={connecting}
        onClose={() => { setConnectionLaunching(false); setConnectionGuideOpen(false); }}
        onNext={async (choice) => {
          setConnectionLaunching(true);
          void start(choice === "new-number" ? "new-number" : "coexistence");
        }}
      />}
      {pinRequired && <WhatsAppRegistrationPinDialog
        submitting={connecting}
        error={connectionError}
        onClose={cancelRegistrationPin}
        onSubmit={submitRegistrationPin}
      />}
    </div>
  );
}

function InfoTile({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-3"><div className="text-[var(--brand)]">{icon}</div><div className="mt-2 text-xs font-semibold text-[var(--text-primary)]">{title}</div><div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{detail}</div></div>;
}
