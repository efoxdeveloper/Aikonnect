import {
  ArrowRightIcon as ArrowRight,
  CheckIcon as Check,
  MessageSquareIcon as MessageSquare,
  PhoneIcon as Phone,
  RocketIcon as Rocket,
  SendIcon as Send,
  StoreIcon as Store,
} from "@animateicons/react/lucide";
import { Link } from "react-router-dom";
import type { AnimatedIcon } from "@/config/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { useWorkspaceSetup } from "@/hooks/use-workspace-setup";
import { useWhatsAppEmbeddedSignup } from "@/hooks/use-whatsapp-embedded-signup";
import { cn } from "@/lib/utils";
import { getActiveMembership } from "@/lib/workspace";

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

function SetupStep({ icon: Icon, title, description, complete, available, active, last }: StepProps) {
  const animatedIcon = useAnimatedIcon();
  return (
    <div className={cn("group/step relative flex gap-4 rounded-md pb-6 last:pb-0", active && "bg-[var(--brand-soft)]/55 px-3 py-3 last:pb-3")} onMouseEnter={animatedIcon.onMouseEnter} onMouseLeave={animatedIcon.onMouseLeave}>
      {!last && <span className={cn("absolute left-[19px] top-10 h-[calc(100%-24px)] w-px", complete ? "bg-[var(--brand)]/30" : "bg-[var(--border)]")} />}
      <div className={cn("relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors", complete ? "border-[var(--brand)] bg-[var(--brand)] text-white" : available ? "border-[var(--brand)]/25 bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--border)] bg-[#f7f8fa] text-[var(--text-muted)]")}>
        {complete ? <Check size={17} duration={0.55} aria-hidden="true" /> : <Icon ref={animatedIcon.ref} size={18} duration={0.7} aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className={cn("text-[14px] font-medium", available || complete ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]")}>{title}</h3>
            <p className="mt-1">{description}</p>
          </div>
          {complete ? (
            <span className="w-fit rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Complete</span>
          ) : active ? (
            <span className="w-fit shrink-0 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--brand)] ring-1 ring-inset ring-[var(--brand)]/15">Next</span>
          ) : (
            <span className="w-fit rounded-md bg-[#f2f3f5] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">Locked</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SetupLoading() {
  return <div className="mx-auto max-w-[1180px] animate-pulse px-5 py-7 sm:px-8"><div className="h-8 w-64 rounded-md bg-slate-200" /><div className="mt-6 h-36 rounded-md bg-slate-200" /><div className="mt-5 h-96 rounded-md bg-slate-200" /></div>;
}

export function WorkspaceSetupDashboard() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const { data, loading, error, refresh } = useWorkspaceSetup(
    membership?.workspace.id,
    accessToken,
    membership?.workspace.onboardingCompletedAt,
  );
  const rocketIcon = useAnimatedIcon();
  const nextActionIcon = useAnimatedIcon();
  const { connecting, error: connectionError, start } = useWhatsAppEmbeddedSignup({ workspaceId: membership?.workspace.id, accessToken, onConnected: refresh });

  if (loading) return <SetupLoading />;
  if (!membership) return <div className="p-8 text-sm text-[var(--text-secondary)]">No workspace is available for this account.</div>;
  if (error || !data) return <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8"><div className="rounded-md border border-red-100 bg-red-50 p-5 text-sm text-[var(--danger)]">{error ?? "Workspace setup is unavailable."}<button type="button" onClick={() => void refresh()} className="ml-3 font-medium underline">Try again</button></div></div>;

  const { progress } = data;
  const steps: StepProps[] = [
    { icon: Store, title: "Workspace created", description: `${data.workspace.name} is ready for your team.`, complete: progress.workspaceCreated, available: true },
    { icon: MessageSquare, title: "Connect WhatsApp Business", description: "Connect your Meta business portfolio and WhatsApp Business Account.", complete: progress.whatsappConnected, available: progress.workspaceCreated, action: connecting ? "Opening…" : "Connect", onAction: () => void start(), actionDisabled: connecting },
    { icon: Phone, title: "Connect a phone number", description: "Select an existing WhatsApp number or register a new business number.", complete: progress.phoneNumberConnected, available: progress.whatsappConnected, action: "Add number", to: "/whatsapp-account" },
    { icon: Send, title: "Send a test message", description: "Confirm that your number, templates and webhook delivery are working.", complete: progress.testMessageSent, available: progress.phoneNumberConnected, action: "Send test", to: "/whatsapp-account" },
  ];
  const nextStep = steps.find((step) => !step.complete && step.available);
  const allComplete = !nextStep;
  const NextStepIcon = nextStep?.icon;
  const connectedAccount = data.whatsapp.accounts.find((account) => account.status === "CONNECTED") ?? data.whatsapp.accounts[0];
  const connectedPhone = connectedAccount?.phoneNumbers.find((phone) => phone.status === "ACTIVE") ?? connectedAccount?.phoneNumbers[0];
  const whatsappStatusLabel = data.whatsapp.status === "CONNECTED" ? "Connected" : data.whatsapp.status === "CONNECTING" ? "Connecting" : data.whatsapp.status === "ERROR" ? "Needs attention" : "Not connected";
  const whatsappStatusClass = data.whatsapp.status === "CONNECTED" ? "bg-emerald-50 text-emerald-700" : data.whatsapp.status === "ERROR" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[25px] font-medium tracking-[-0.025em] text-[var(--text-primary)]">Welcome, {user?.firstName}</h1>
          <p className="mt-1">Get your workspace ready to start messaging customers.</p>
        </div>
        <span className="w-fit rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">{allComplete ? "Ready to launch" : progress.completedSteps + " of " + progress.totalSteps + " complete"}</span>
      </div>

      <section className="mt-5 overflow-hidden rounded-md bg-[linear-gradient(120deg,#0f696d,#197b80)] text-white shadow-[0_8px_24px_rgba(17,107,111,.13)]">
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-start gap-4">
            <div onMouseEnter={rocketIcon.onMouseEnter} onMouseLeave={rocketIcon.onMouseLeave} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-white ring-1 ring-white/15">
              <Rocket ref={rocketIcon.ref} size={21} duration={0.7} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-[17px] font-medium">{allComplete ? "Your workspace is ready" : progress.completedSteps + " of " + progress.totalSteps + " steps complete"}</h2>
              <p className="mt-1">{allComplete ? "You can now create campaigns and start conversations." : (nextStep?.title ?? "Complete your setup") + " is the next step."}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex size-[64px] items-center justify-center rounded-full" role="progressbar" aria-label="Workspace setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage} style={{ background: "conic-gradient(#ffffff " + progress.percentage + "%, rgba(255,255,255,.18) 0)" }}>
              <div className="flex size-[52px] items-center justify-center rounded-full bg-[#176f74] text-sm font-medium">{progress.percentage}%</div>
            </div>
          </div>
        </div>
        <div className="h-1.5 bg-white/15"><div className="h-full bg-white transition-[width] duration-500" style={{ width: `${progress.percentage}%` }} /></div>
      </section>

      {connectionError && <div role="alert" className="mt-5 rounded-md bg-red-50 px-4 py-3 text-[var(--danger)]">{connectionError}</div>}

      {nextStep && (
        <section className="mt-5 flex flex-col gap-4 rounded-md border border-[var(--brand)]/15 bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:flex-row sm:items-center sm:justify-between sm:p-6" aria-labelledby="next-step-title">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">{NextStepIcon && <NextStepIcon size={19} duration={0.7} aria-hidden="true" />}</div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--brand)]">Next step</div>
              <h2 id="next-step-title" className="mt-1 text-[16px] font-medium text-[var(--text-primary)]">{nextStep.title}</h2>
              <p className="mt-1">{nextStep.description}</p>
            </div>
          </div>
          {nextStep.onAction ? (
            <button type="button" disabled={nextStep.actionDisabled} onClick={nextStep.onAction} onMouseEnter={nextActionIcon.onMouseEnter} onMouseLeave={nextActionIcon.onMouseLeave} className="flex h-10 w-full shrink-0 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
              {nextStep.action}
              <ArrowRight ref={nextActionIcon.ref} size={14} duration={0.55} className="ml-1.5" aria-hidden="true" />
            </button>
          ) : nextStep.to ? (
            <Link to={nextStep.to} onMouseEnter={nextActionIcon.onMouseEnter} onMouseLeave={nextActionIcon.onMouseLeave} className="flex h-10 w-full shrink-0 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-hover)] sm:w-auto">
              {nextStep.action}
              <ArrowRight ref={nextActionIcon.ref} size={14} duration={0.55} className="ml-1.5" aria-hidden="true" />
            </Link>
          ) : null}
        </section>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
        <section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] pb-4">
            <div>
              <h2 className="text-[16px] font-medium text-[var(--text-primary)]">Setup checklist</h2>
              <p className="mt-1">Your workspace setup at a glance.</p>
            </div>
            <span className="text-xs font-medium text-[var(--text-muted)]">{progress.completedSteps}/{progress.totalSteps}</span>
          </div>
          <div className="mt-5">
            {steps.map((step, index) => <SetupStep key={step.title} {...step} active={step === nextStep} last={index === steps.length - 1} />)}
          </div>
        </section>

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
            {data.whatsapp.status === "DISCONNECTED" && <p className="mt-4 rounded-md bg-[var(--brand-soft)] px-3 py-2.5 text-xs text-[var(--brand)]">Connect WhatsApp to unlock phone number setup.</p>}
          </section>
          <section className="rounded-md border border-[#d7ebec] bg-[var(--brand-soft)] p-5">
            <h2 className="text-sm font-medium text-[var(--brand)]">Need help?</h2>
            <p className="mt-2">You will need access to your Meta Business portfolio before connecting WhatsApp.</p>
            <Link to="/whatsapp-account" className="mt-3 inline-flex items-center text-xs font-medium text-[var(--brand)] hover:text-[var(--brand-hover)]">View requirements <ArrowRight size={13} duration={0.55} className="ml-1" aria-hidden="true" /></Link>
          </section>
        </aside>
      </div>
        </div>
      </div>
    </div>
  );
}
