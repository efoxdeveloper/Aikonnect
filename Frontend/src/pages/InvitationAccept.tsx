import { useEffect, useState } from "react";
import { ArrowRightIcon as ArrowRight, CheckIcon as Check, MailIcon as Mail, MessageSquareIcon as MessageSquare, SparklesIcon as Sparkles } from "@animateicons/react/lucide";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";

export function InvitationAccept() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const { accessToken, refreshUser, status, user } = useAuth();
  const [state, setState] = useState<"idle" | "accepting" | "accepted" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const logoIcon = useAnimatedIcon();
  const sparkleIcon = useAnimatedIcon();
  const actionIcon = useAnimatedIcon();

  useEffect(() => {
    if (!token || !accessToken || !user?.emailVerifiedAt || state !== "idle") return;
    setState("accepting");
    void apiRequest("/workspaces/invitations/accept", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token }),
    }).then(async () => {
      await refreshUser();
      setState("accepted");
    }).catch((caughtError) => {
      setState("error");
      setError(caughtError instanceof ApiError ? caughtError.message : "This invitation could not be accepted.");
    });
  }, [accessToken, refreshUser, state, token, user?.emailVerifiedAt]);

  const invitationQuery = token ? `?invitation=${encodeURIComponent(token)}` : "";
  const verified = Boolean(user?.emailVerifiedAt);

  return (
    <main className="relative isolate flex h-dvh items-center justify-center overflow-hidden bg-[#e8f6f7] px-4 py-8">
      <img src="/images/auth-background.png" alt="" className="absolute inset-0 -z-20 size-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.18),transparent_54%)]" />
      <section aria-labelledby="invitation-title" className="auth-card relative w-full max-w-[460px] rounded-sm border border-white/85 bg-white/90 px-6 pb-8 pt-10 shadow-[0_16px_42px_rgba(30,72,86,.10),0_4px_14px_rgba(17,107,111,.05)] backdrop-blur-xl sm:px-10">
        <div onMouseEnter={() => { logoIcon.onMouseEnter(); sparkleIcon.onMouseEnter(); }} onMouseLeave={() => { logoIcon.onMouseLeave(); sparkleIcon.onMouseLeave(); }} className="auth-logo absolute left-1/2 top-0 flex size-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[linear-gradient(145deg,#167a7f,#0b5f64)] text-white"><MessageSquare ref={logoIcon.ref} size={32} duration={0.7} aria-hidden="true" /><Sparkles ref={sparkleIcon.ref} size={12} duration={0.65} className="absolute right-2.5 top-2.5 text-[#a9edf0]" aria-hidden="true" /></div>
        <div className="pt-4 text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">{state === "accepted" ? <Check size={28} duration={0.6} aria-hidden="true" /> : <Mail size={27} duration={0.65} aria-hidden="true" />}</div><h1 id="invitation-title" className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-[#145f64]">{state === "accepted" ? "Invitation accepted" : "Join your workspace"}</h1><p className="mx-auto mt-3">{state === "accepted" ? "Your workspace access is ready. Continue to open the dashboard." : "You have been invited to collaborate with a team in Efox WhatsApp."}</p></div>
        {state === "error" && <p role="alert" className="mt-5 rounded-md bg-red-50 px-3 py-2.5 text-center">{error}</p>}
        {state === "accepted" ? <button type="button" onClick={() => navigate("/dashboard", { replace: true })} onMouseEnter={actionIcon.onMouseEnter} onMouseLeave={actionIcon.onMouseLeave} className="mt-6 flex h-12 w-full items-center justify-center rounded-md bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-hover)]">Continue to dashboard<ArrowRight ref={actionIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" /></button> : status === "loading" || state === "accepting" ? <div className="mt-6 flex h-12 items-center justify-center rounded-md bg-[var(--brand-soft)] text-sm font-medium text-[var(--brand)]">{state === "accepting" ? "Accepting invitation…" : "Checking invitation…"}</div> : verified ? <div className="mt-6 rounded-md bg-[var(--brand-soft)] px-4 py-3 text-center text-xs leading-5 text-[var(--brand)]">We are accepting this invitation for <strong>{user?.email}</strong>.</div> : <div className="mt-6 grid gap-3"><Link to={`/login${invitationQuery}`} className="flex h-12 items-center justify-center rounded-md bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-hover)]">Sign in to accept<ArrowRight size={16} duration={0.55} className="ml-2" aria-hidden="true" /></Link><Link to={`/register${invitationQuery}`} className="flex h-12 items-center justify-center rounded-md border border-[var(--border)] bg-white text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]">Create an account</Link></div>}
        {status === "authenticated" && !verified && <Link to={`/verify-email${invitationQuery}`} className="mt-5 block text-center text-xs font-medium text-[var(--brand)] underline underline-offset-4">Verify your email to continue</Link>}
      </section>
    </main>
  );
}
