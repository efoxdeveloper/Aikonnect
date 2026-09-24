import { useEffect, useState } from "react";
import {
  ArrowRightIcon as ArrowRight,
  CheckIcon as Check,
  MessageSquareIcon as MessageSquare,
  PhoneIcon as Phone,
  SendIcon as Send,
  StoreIcon as Store,
} from "@animateicons/react/lucide";
import { Link } from "react-router-dom";
import { BarChart3, Users } from "lucide-react";
import type { AnimatedIcon } from "@/config/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { useWorkspaceSetup } from "@/hooks/use-workspace-setup";
import { useWhatsAppEmbeddedSignup } from "@/hooks/use-whatsapp-embedded-signup";
import { cn } from "@/lib/utils";
import { getActiveMembership } from "@/lib/workspace";
import { WhatsAppConnectionGuide, type ConnectionChoice } from "@/components/whatsapp/WhatsAppConnectionGuide";
import { WhatsAppRegistrationPinDialog } from "@/components/whatsapp/WhatsAppRegistrationPinDialog";

type StepProps = {
  icon: AnimatedIcon;
  title: string;
  description: string;
  complete: boolean;
  available: boolean;
  active?: boolean;
  action?: string;
  to?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  last?: boolean;
};

function SetupStep({ icon: Icon, title, description, complete, available, active, action, to, onAction, actionDisabled, last }: StepProps) {
  const animatedIcon = useAnimatedIcon();
  return (
    <div aria-current={active ? "step" : undefined} className={cn("group/step relative flex items-start gap-3 rounded-lg px-3 py-3", active ? "bg-[#e8f8f0] shadow-[0_2px_8px_rgba(0,112,78,.08)] ring-1 ring-inset ring-[var(--brand)]/20" : "hover:bg-[var(--page-background)]", !last && "pb-5")} onMouseEnter={animatedIcon.onMouseEnter} onMouseLeave={animatedIcon.onMouseLeave}>
      {!last && <span className={cn("absolute bottom-0 left-[31px] top-[52px] w-px", complete ? "bg-[var(--brand)]/30" : "bg-[var(--border)]")} />}
      <div className={cn("relative z-10 flex size-[38px] shrink-0 items-center justify-center rounded-full border transition-colors", complete ? "border-[var(--brand)] bg-[var(--brand)] text-white" : active ? "border-[var(--brand)] bg-[var(--brand)] text-white shadow-[0_2px_6px_rgba(0,112,78,.2)]" : available ? "border-[var(--brand)]/25 bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--border)] bg-[#f7f8fa] text-[var(--text-muted)]")}>
        {complete ? <Check size={17} duration={0.55} aria-hidden="true" /> : <Icon ref={animatedIcon.ref} size={18} duration={0.7} aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h3 className={cn("text-[13px] font-semibold leading-5", active ? "text-[var(--brand)]" : available || complete ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]")}>{title}</h3>
            <p className={cn("mt-0.5 text-xs leading-5", available || complete ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]")}>{description}</p>
          </div>
          {complete ? (
            <span className="mt-0.5 w-fit shrink-0 rounded-full bg-[#e9f7f1] px-2.5 py-1 text-[10px] font-semibold text-[#137a57]">Complete</span>
          ) : active ? (
            onAction ? (
              <button type="button" aria-label={action ?? title} disabled={actionDisabled} onClick={onAction} className="mt-0.5 w-fit shrink-0 rounded-md bg-[var(--brand)] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-wait disabled:opacity-60">{action ?? "Next"}</button>
            ) : to ? (
              <Link to={to} aria-label={action ?? title} className="mt-0.5 w-fit shrink-0 rounded-md bg-[var(--brand)] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[var(--brand-hover)]">{action ?? "Next"}</Link>
            ) : (
              <span className="mt-0.5 w-fit shrink-0 rounded-md border border-[var(--brand)]/25 bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--brand)]">{action ?? "Next"}</span>
            )
          ) : (
            <span className="mt-0.5 w-fit shrink-0 rounded-full bg-[var(--gray-100)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-muted)]">Locked</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SetupLoading() {
  return <div className="mx-auto max-w-[1180px] animate-pulse px-5 py-7 sm:px-8"><div className="h-8 w-64 rounded-md bg-[var(--gray-200)]" /><div className="mt-6 h-36 rounded-md bg-[var(--gray-200)]" /><div className="mt-5 h-96 rounded-md bg-[var(--gray-200)]" /></div>;
}

export function WorkspaceSetupDashboard() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const { data, loading, error, refresh } = useWorkspaceSetup(
    membership?.workspace.id,
    accessToken,
    membership?.workspace.onboardingCompletedAt,
  );
  const { connecting, error: connectionError, pinRequired, submitRegistrationPin, cancelRegistrationPin, start } = useWhatsAppEmbeddedSignup({ workspaceId: membership?.workspace.id, accessToken, onConnected: refresh });
  const [connectionGuideOpen, setConnectionGuideOpen] = useState(false);
  const [connectionLaunching, setConnectionLaunching] = useState(false);
  const [connectionChoice, setConnectionChoice] = useState<ConnectionChoice>("business-app");

  useEffect(() => {
    if (connectionLaunching && !connecting) {
      setConnectionLaunching(false);
      setConnectionGuideOpen(false);
    }
  }, [connecting, connectionLaunching]);

  if (loading) return <SetupLoading />;
  if (!membership) return <div className="p-8 text-sm text-[var(--text-secondary)]">No workspace is available for this account.</div>;
  if (error || !data) return <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8"><div className="rounded-md border border-[#f5dada] bg-[var(--danger-soft)] p-5 text-sm text-[var(--danger)]">{error ?? "Workspace setup is unavailable."}<button type="button" onClick={() => void refresh()} className="ml-3 font-medium underline">Try again</button></div></div>;

  const { progress } = data;
  const steps: StepProps[] = [
    { icon: Store, title: "Workspace created", description: `${data.workspace.name} is ready for your team.`, complete: progress.workspaceCreated, available: true },
    { icon: MessageSquare, title: "Connect WhatsApp Business", description: "Connect your Meta business portfolio and WhatsApp Business Account.", complete: progress.whatsappConnected, available: progress.workspaceCreated, action: connecting ? "Opening…" : "Connect", onAction: () => setConnectionGuideOpen(true), actionDisabled: connecting },
    { icon: Phone, title: "Connect a phone number", description: "Select an existing WhatsApp number or register a new business number.", complete: progress.phoneNumberConnected, available: progress.whatsappConnected, action: "Add number", to: "/whatsapp-account" },
    { icon: Send, title: "Send a test message", description: "Confirm that your number, templates and webhook delivery are working.", complete: progress.testMessageSent, available: progress.phoneNumberConnected, action: "Send test", to: "/whatsapp-account" },
  ];
  const nextStep = steps.find((step) => !step.complete && step.available);
  const allComplete = !nextStep;
  const connectedAccount = data.whatsapp.accounts.find((account) => account.status === "CONNECTED") ?? data.whatsapp.accounts[0];
  const connectedPhone = connectedAccount?.phoneNumbers.find((phone) => phone.status === "ACTIVE") ?? connectedAccount?.phoneNumbers[0];
  const whatsappStatusLabel = data.whatsapp.status === "CONNECTED" ? "Connected" : data.whatsapp.status === "CONNECTING" ? "Connecting" : data.whatsapp.status === "ERROR" ? "Needs attention" : "Not connected";
  const whatsappStatusClass = data.whatsapp.status === "CONNECTED" ? "bg-[var(--success-soft)] text-[var(--success)]" : data.whatsapp.status === "ERROR" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--warning-soft)] text-[#a66a00]";
  const connectionType = connectedPhone?.isOnBusinessApp ? "App + Cloud API" : "Cloud API";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-8 sm:py-8">
      <section className="relative isolate min-h-[190px] overflow-hidden rounded-xl border border-[#d8f0e5] bg-gradient-to-br from-[#f0fcf7] via-[#e2f8ef] to-[#f8fcfa] shadow-[0_3px_12px_rgba(30,40,55,.045)]">
        <div className="pointer-events-none absolute -left-16 -top-20 size-56 rounded-full bg-[#c9f1df]/60 blur-2xl" />
        <div className="pointer-events-none absolute right-44 top-[-100px] size-64 rounded-full bg-[#d5f7e8]/80 blur-2xl" />
        <div className="relative z-10 max-w-[680px] px-5 py-5 sm:px-7 sm:py-6">
          <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">Welcome back, {user?.firstName}! <span aria-hidden="true">👋</span></h1>
          <div className="mt-5 border-t border-[#ccebdd] pt-4">
            <p className="text-[11px] font-semibold text-[var(--text-primary)]">Your setup progress</p>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">{progress.completedSteps} of {progress.totalSteps} steps complete</h2>
              <span className="text-[10px] font-semibold text-[var(--text-secondary)]">{progress.percentage}%</span>
            </div>
            <div role="progressbar" aria-label="Workspace setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage} className="mt-2 h-2 max-w-[430px] overflow-hidden rounded-full bg-[#d8e9e1]"><div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-500" style={{ width: `${progress.percentage}%` }} /></div>
          </div>
        </div>
        <img src="/marento-dashboard-hero.png" alt="" className="pointer-events-none absolute bottom-0 right-2 hidden h-[185px] w-[270px] object-contain object-right-bottom lg:block" />
      </section>

      {connectionError && <div role="alert" className="mt-5 rounded-md bg-[var(--danger-soft)] px-4 py-3 text-[var(--danger)]">{connectionError}</div>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
        {allComplete ? (
          <section data-testid="setup-complete-panel" aria-labelledby="setup-complete-title" className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-6">
            <div className="flex flex-col gap-2 border-b border-[var(--border-soft)] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--brand)]">Overview</div>
                <h2 id="setup-complete-title" className="mt-1 text-[19px] font-medium tracking-[-0.02em] text-[var(--text-primary)]">Your workspace is ready</h2>
              </div>
              <Link to="/whatsapp-account" className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--brand)]/30 hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]">Manage connection <ArrowRight size={13} aria-hidden="true" /></Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-[var(--border-soft)] bg-[var(--page-background)] p-4"><div className="flex items-center gap-2 text-[var(--text-muted)]"><Phone size={15} /><span className="text-xs">Connected number</span></div><div className="mt-3 truncate text-sm font-semibold text-[var(--text-primary)]">{connectedPhone?.displayPhoneNumber ?? "—"}</div></div>
              <div className="rounded-md border border-[var(--border-soft)] bg-[var(--page-background)] p-4"><div className="flex items-center gap-2 text-[var(--text-muted)]"><MessageSquare size={15} /><span className="text-xs">Connection</span></div><div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{connectionType}</div></div>
              <div className="rounded-md border border-[var(--border-soft)] bg-[var(--page-background)] p-4"><div className="flex items-center gap-2 text-[var(--text-muted)]"><Users size={15} /><span className="text-xs">Team members</span></div><div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{data.team.memberCount}</div></div>
            </div>

          </section>
        ) : (
        <section data-testid="setup-checklist" className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] pb-4">
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Setup checklist</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Your workspace setup at a glance.</p>
            </div>
            <span className="shrink-0 rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--brand)]">{progress.completedSteps}/{progress.totalSteps}</span>
          </div>
          <div className="mt-4 space-y-1">
            {steps.map((step, index) => <SetupStep key={step.title} {...step} active={step === nextStep} last={index === steps.length - 1} />)}
          </div>
        </section>
        )}

        <aside className="space-y-5">
          <section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)]">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Connection status</h2>
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between"><dt className="text-[var(--text-muted)]">WhatsApp</dt><dd className={cn("rounded-md px-2 py-1 font-medium", whatsappStatusClass)}>{whatsappStatusLabel}</dd></div>
              {connectedAccount?.displayName && <div className="flex items-center justify-between border-t border-[var(--border-soft)] pt-3"><dt className="text-[var(--text-muted)]">Business account</dt><dd className="max-w-[170px] truncate font-medium text-[var(--text-primary)]">{connectedAccount.displayName}</dd></div>}
              {connectedPhone?.displayPhoneNumber && <div className="flex items-center justify-between border-t border-[var(--border-soft)] pt-3"><dt className="text-[var(--text-muted)]">Phone number</dt><dd className="font-medium text-[var(--text-primary)]">{connectedPhone.displayPhoneNumber}</dd></div>}
              <div className="flex items-center justify-between border-t border-[var(--border-soft)] pt-3"><dt className="text-[var(--text-muted)]">Phone numbers</dt><dd className="font-medium text-[var(--text-primary)]">{data.whatsapp.phoneNumberCount}</dd></div>
              <div className="flex items-center justify-between border-t border-[var(--border-soft)] pt-3"><dt className="text-[var(--text-muted)]">Team members</dt><dd className="font-medium text-[var(--text-primary)]">{data.team.memberCount}</dd></div>
            </dl>
            {data.whatsapp.status === "DISCONNECTED" && <div className="mt-4 rounded-md bg-[var(--brand-soft)] px-3 py-2.5 text-xs text-[var(--brand)]">Connect WhatsApp to unlock phone number setup.</div>}
          </section>
          {allComplete ? <section className="rounded-md border border-[var(--green-100)] bg-[var(--brand-subtle)] p-5"><div className="flex items-center gap-2 text-[var(--brand)]"><BarChart3 size={16} /><h2 className="text-sm font-medium">Workspace health</h2></div><div className="mt-4 flex items-center gap-2 text-xs font-medium text-[var(--success)]"><span className="size-2 rounded-full bg-[var(--success)]" /> All systems operational</div></section> : <section className="rounded-md border border-[var(--green-100)] bg-[var(--brand-subtle)] p-5"><h2 className="text-sm font-medium text-[var(--brand)]">Need help?</h2><p className="mt-2">You will need access to your Meta Business portfolio before connecting WhatsApp.</p><Link to="/whatsapp-account" className="mt-3 inline-flex items-center text-xs font-medium text-[var(--brand)] hover:text-[var(--brand-hover)]">View requirements <ArrowRight size={13} duration={0.55} className="ml-1" aria-hidden="true" /></Link></section>}
        </aside>
      </div>
        </div>
      </div>
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
