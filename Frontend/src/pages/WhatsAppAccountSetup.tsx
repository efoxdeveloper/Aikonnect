import { ArrowLeftIcon as ArrowLeft, CheckIcon as Check, ExternalLinkIcon as ExternalLink, LoaderCircleIcon as LoaderCircle, MessageSquareIcon as MessageSquare, ShieldCheckIcon as ShieldCheck } from "@animateicons/react/lucide";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { useWorkspaceSetup } from "@/hooks/use-workspace-setup";
import { useWhatsAppEmbeddedSignup } from "@/hooks/use-whatsapp-embedded-signup";
import { getActiveMembership } from "@/lib/workspace";

const requirements = [
  "Administrator access to a Meta Business portfolio",
  "A business phone number that can receive an OTP",
  "Business details that match your legal documents",
  "Permission to manage the WhatsApp Business Account",
];

export function WhatsAppAccountSetup() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const { data, loading, error, refresh } = useWorkspaceSetup(membership?.workspace.id, accessToken);
  const { connecting, error: connectionError, start } = useWhatsAppEmbeddedSignup({ workspaceId: membership?.workspace.id, accessToken, onConnected: refresh });
  const messageIcon = useAnimatedIcon();
  const externalIcon = useAnimatedIcon();
  const backIcon = useAnimatedIcon();

  return (
    <div className="mx-auto max-w-[1050px] px-5 py-7 sm:px-8 sm:py-9">
      <Link to="/dashboard" onMouseEnter={backIcon.onMouseEnter} onMouseLeave={backIcon.onMouseLeave} className="inline-flex items-center text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--brand)]"><ArrowLeft ref={backIcon.ref} size={14} duration={0.55} className="mr-1.5" aria-hidden="true" />Back to setup</Link>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="uppercase">Channel setup</p>
          <h1 className="mt-1.5 text-[25px] font-medium tracking-[-0.025em] text-[var(--text-primary)]">WhatsApp Business account</h1>
          <p className="mt-1">Connect Meta securely to start using the WhatsApp Cloud API.</p>
        </div>
        <span className="w-fit rounded-md bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">{loading ? "Checking…" : data?.whatsapp.status === "CONNECTED" ? "Connected" : "Not connected"}</span>
      </div>

      {(error || connectionError) && <p role="alert" className="mt-5 rounded-md bg-red-50 px-4 py-3">{connectionError ?? error}</p>}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="rounded-md border border-[var(--border-soft)] bg-white p-6 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-8">
          <div className="flex items-start gap-4">
            <div onMouseEnter={messageIcon.onMouseEnter} onMouseLeave={messageIcon.onMouseLeave} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><MessageSquare ref={messageIcon.ref} size={23} duration={0.7} aria-hidden="true" /></div>
            <div>
              <h2 className="text-[17px] font-medium text-[var(--text-primary)]">Connect with Meta</h2>
              <p className="mt-1.5">Meta Embedded Signup will request access only to the business and WhatsApp assets you select.</p>
            </div>
          </div>

          <ol className="mt-7 grid gap-3 sm:grid-cols-2">
            {["Sign in to Meta", "Choose your business", "Select a WhatsApp account", "Connect a phone number"].map((step, index) => (
              <li key={step} className="flex items-center gap-3 rounded-md border border-[var(--border-soft)] bg-[#fafbfc] px-3.5 py-3 text-xs text-[var(--text-secondary)]"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white font-medium text-[var(--brand)] shadow-[0_1px_3px_rgba(30,40,55,.08)]">{index + 1}</span>{step}</li>
            ))}
          </ol>

          <button type="button" disabled={connecting || loading} onClick={() => void start()} onMouseEnter={externalIcon.onMouseEnter} onMouseLeave={externalIcon.onMouseLeave} className="mt-7 flex h-11 w-full items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-60">
            {connecting ? "Opening Meta…" : "Continue with Meta"}
            {connecting ? <LoaderCircle size={15} className="ml-2 animate-spin" aria-hidden="true" /> : <ExternalLink ref={externalIcon.ref} size={15} duration={0.6} className="ml-2" aria-hidden="true" />}
          </button>
          <p className="mt-2.5 text-center">You will complete the secure WhatsApp setup in Meta without entering credentials here.</p>
        </section>

        <aside className="space-y-5">
          <section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)]">
            <div className="flex items-center gap-2 text-[var(--text-primary)]"><ShieldCheck size={18} duration={0.65} className="text-[var(--brand)]" aria-hidden="true" /><h2 className="text-sm font-medium">Before you connect</h2></div>
            <ul className="mt-4 space-y-3">
              {requirements.map((requirement) => <li key={requirement} className="flex gap-2.5 text-xs leading-5 text-[var(--text-secondary)]"><Check size={14} duration={0.5} className="mt-0.5 shrink-0 text-[var(--success)]" aria-hidden="true" />{requirement}</li>)}
            </ul>
          </section>
          <section className="rounded-md border border-[#d7ebec] bg-[var(--brand-soft)] p-5">
            <h2 className="text-sm font-medium text-[var(--brand)]">Developer configuration</h2>
            <p className="mt-2">Sign in to Meta, choose your business and connect a WhatsApp phone number. Your credentials remain with Meta.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
