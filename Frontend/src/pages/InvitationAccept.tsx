import { useEffect, useState } from "react";
import { ArrowRightIcon as ArrowRight, CheckIcon as Check, MailIcon as Mail } from "@animateicons/react/lucide";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { AuthMark, AuthShell } from "@/components/auth/AuthShell";

export function InvitationAccept() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const { accessToken, refreshUser, status, user } = useAuth();
  const [state, setState] = useState<"idle" | "accepting" | "accepted" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
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
    <AuthShell>
      <section aria-labelledby="invitation-title">
        <AuthMark className="mx-auto mb-5" />
        <div className="text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">{state === "accepted" ? <Check size={28} duration={0.6} aria-hidden="true" /> : <Mail size={27} duration={0.65} aria-hidden="true" />}</div><h1 id="invitation-title" className="mt-5 text-[23px] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)]">{state === "accepted" ? "Invitation accepted" : "Join your workspace"}</h1><p className="mx-auto mt-3">{state === "accepted" ? "Your workspace access is ready. Continue to open the dashboard." : "You have been invited to collaborate with a team in Interakt."}</p></div>
        {state === "error" && <p role="alert" className="mt-5 rounded-md bg-red-50 px-3 py-2.5 text-center">{error}</p>}
        {state === "accepted" ? <button type="button" onClick={() => navigate("/dashboard", { replace: true })} onMouseEnter={actionIcon.onMouseEnter} onMouseLeave={actionIcon.onMouseLeave} className="mt-6 flex h-12 w-full items-center justify-center rounded-md bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-hover)]">Continue to dashboard<ArrowRight ref={actionIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" /></button> : status === "loading" || state === "accepting" ? <div className="mt-6 flex h-12 items-center justify-center rounded-md bg-[var(--brand-soft)] text-sm font-medium text-[var(--brand)]">{state === "accepting" ? "Accepting invitation…" : "Checking invitation…"}</div> : verified ? <div className="mt-6 rounded-md bg-[var(--brand-soft)] px-4 py-3 text-center text-xs leading-5 text-[var(--brand)]">We are accepting this invitation for <strong>{user?.email}</strong>.</div> : <div className="mt-6 grid gap-3"><Link to={`/login${invitationQuery}`} className="flex h-12 items-center justify-center rounded-md bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-hover)]">Sign in to accept<ArrowRight size={16} duration={0.55} className="ml-2" aria-hidden="true" /></Link><Link to={`/register${invitationQuery}`} className="flex h-12 items-center justify-center rounded-md border border-[var(--border)] bg-white text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]">Create an account</Link></div>}
        {status === "authenticated" && !verified && <Link to={`/verify-email${invitationQuery}`} className="mt-5 block text-center text-xs font-medium text-[var(--brand)] underline underline-offset-4">Verify your email to continue</Link>}
      </section>
    </AuthShell>
  );
}
