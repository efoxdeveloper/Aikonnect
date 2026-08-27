import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRightIcon as ArrowRight, CircleCheckIcon as CircleCheck, LockIcon as Lock, MailIcon as Mail, MessageSquareIcon as MessageSquare, RefreshCwIcon as RefreshCw, SparklesIcon as Sparkles } from "@animateicons/react/lucide";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";

type VerificationState = "waiting" | "verifying" | "verified" | "error";

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { status, user, verifyEmail, resendVerification, changeEmail } = useAuth();
  const [verificationState, setVerificationState] = useState<VerificationState>(
    searchParams.get("token") ? "verifying" : "waiting",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const verificationStarted = useRef(false);
  const logoIcon = useAnimatedIcon();
  const sparkleIcon = useAnimatedIcon();
  const statusIcon = useAnimatedIcon();
  const actionIcon = useAnimatedIcon();
  const emailIcon = useAnimatedIcon();
  const lockIcon = useAnimatedIcon();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token || verificationStarted.current) return;
    verificationStarted.current = true;
    void verifyEmail(token)
      .then(() => {
        setVerificationState("verified");
        setMessage("Your email address has been verified successfully.");
        const invitation = searchParams.get("invitation");
        if (invitation) navigate(`/invitations/accept?token=${encodeURIComponent(invitation)}`, { replace: true });
      })
      .catch((error) => {
        setVerificationState("error");
        setMessage(error instanceof ApiError ? error.message : "This verification link is invalid or expired.");
      });
  }, [searchParams, verifyEmail]);

  const handleResend = async () => {
    setResending(true);
    setMessage(null);
    try {
      const result = await resendVerification();
      setMessage(
        result.emailSent
          ? "A new verification link has been sent to your inbox."
          : "A new verification link was created, but SMTP delivery is not configured.",
      );
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Unable to resend verification right now.");
    } finally {
      setResending(false);
    }
  };

  const handleChangeEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChangingEmail(true);
    setMessage(null);
    try {
      const result = await changeEmail(newEmail, password);
      setEditingEmail(false);
      setNewEmail("");
      setPassword("");
      setMessage(
        result.emailSent
          ? `A verification link has been sent to ${result.email}.`
          : `Your email was changed to ${result.email}, but delivery is not configured.`,
      );
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Unable to change your email right now.");
    } finally {
      setChangingEmail(false);
    }
  };

  const verified = verificationState === "verified" || Boolean(user?.emailVerifiedAt);

  return (
    <main className="relative isolate flex h-dvh items-center justify-center overflow-hidden bg-[#e8f6f7] px-4 py-8 sm:px-6 sm:py-10">
      <img src="/images/auth-background.png" alt="" className="absolute inset-0 -z-20 size-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.18),transparent_54%)]" />

      <section aria-labelledby="verify-email-title" className="auth-card relative w-full max-w-[460px] rounded-sm border border-white/85 bg-white/90 px-6 pb-8 pt-[62px] shadow-[0_16px_42px_rgba(30,72,86,.10),0_4px_14px_rgba(17,107,111,.05)] backdrop-blur-xl sm:px-10 sm:pb-9">
        <div onMouseEnter={() => { logoIcon.onMouseEnter(); sparkleIcon.onMouseEnter(); }} onMouseLeave={() => { logoIcon.onMouseLeave(); sparkleIcon.onMouseLeave(); }} className="absolute left-1/2 top-0 flex size-[86px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[linear-gradient(145deg,#167a7f,#0b5f64)] text-white">
          <MessageSquare ref={logoIcon.ref} size={40} duration={0.7} aria-hidden="true" />
          <Sparkles ref={sparkleIcon.ref} size={14} duration={0.65} className="absolute right-3 top-3 text-[#a9edf0]" aria-hidden="true" />
        </div>

        <div className="text-center" aria-live="polite">
          <div onMouseEnter={statusIcon.onMouseEnter} onMouseLeave={statusIcon.onMouseLeave} className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
            {verified ? <CircleCheck ref={statusIcon.ref} size={32} duration={0.65} aria-hidden="true" /> : <Mail ref={statusIcon.ref} size={30} duration={0.65} aria-hidden="true" />}
          </div>
          <h1 id="verify-email-title" className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-[#145f64]">
            {verificationState === "verifying" ? "Verifying your email…" : verified ? "Email verified" : "Check your inbox"}
          </h1>
          <p className="mx-auto mt-3">
            {verified
              ? "Your account is ready. You can now access your workspace."
              : <>We sent a verification link to {user?.email ? <span className="font-semibold text-[var(--text-primary)]">{user.email}</span> : "your email address"}.</>}
          </p>
          {!verified && status === "authenticated" && !editingEmail && verificationState !== "verifying" && (
            <button type="button" onClick={() => { setEditingEmail(true); setMessage(null); }} className="mt-2 text-xs font-semibold text-[var(--brand)] underline decoration-[#a9c5c7] underline-offset-4 hover:text-[var(--brand-hover)]">
              Entered the wrong email? Change it
            </button>
          )}
          {message && <p className={`mt-4 rounded-md px-3 py-2.5 ${verificationState === "error" ? "bg-red-50" : "bg-[var(--brand-soft)]"}`}>{message}</p>}
        </div>

        {editingEmail && !verified && (
          <form className="mt-5 space-y-4" onSubmit={handleChangeEmail}>
            <div>
              <label htmlFor="new-email" className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">New email address</label>
              <div onMouseEnter={emailIcon.onMouseEnter} onMouseLeave={emailIcon.onMouseLeave} className="flex h-12 items-center rounded-md border border-[#d6dce0] bg-white px-3.5 focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand)]/10">
                <Mail ref={emailIcon.ref} size={17} duration={0.65} className="mr-2.5 text-[var(--text-muted)]" aria-hidden="true" />
                <input id="new-email" type="email" autoComplete="email" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
              </div>
            </div>
            <div>
              <label htmlFor="email-change-password" className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Account password</label>
              <div onMouseEnter={lockIcon.onMouseEnter} onMouseLeave={lockIcon.onMouseLeave} className="flex h-12 items-center rounded-md border border-[#d6dce0] bg-white px-3.5 focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand)]/10">
                <Lock ref={lockIcon.ref} size={17} duration={0.65} className="mr-2.5 text-[var(--text-muted)]" aria-hidden="true" />
                <input id="email-change-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <button type="button" disabled={changingEmail} onClick={() => { setEditingEmail(false); setMessage(null); }} className="h-11 rounded-md border border-[var(--border)] bg-white text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]">Cancel</button>
              <button type="submit" disabled={changingEmail} className="h-11 rounded-md bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-hover)] disabled:cursor-wait disabled:opacity-60">{changingEmail ? "Updating…" : "Update email and resend"}</button>
            </div>
          </form>
        )}

        {!editingEmail && verified ? (
          <button type="button" onClick={() => navigate(status === "authenticated" ? "/dashboard" : "/login", { replace: true })} onMouseEnter={actionIcon.onMouseEnter} onMouseLeave={actionIcon.onMouseLeave} className="mt-6 flex h-12 w-full items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-hover)]">
            Continue<ArrowRight ref={actionIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" />
          </button>
        ) : !editingEmail && status === "authenticated" && verificationState !== "verifying" ? (
          <button type="button" disabled={resending} onClick={handleResend} onMouseEnter={actionIcon.onMouseEnter} onMouseLeave={actionIcon.onMouseLeave} className="mt-6 flex h-12 w-full items-center justify-center rounded-md border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:cursor-wait disabled:opacity-60">
            {resending ? "Sending…" : "Resend verification email"}<RefreshCw ref={actionIcon.ref} size={16} duration={0.65} className="ml-2" aria-hidden="true" />
          </button>
        ) : null}

        {status !== "authenticated" && verificationState !== "verifying" && !verified && (
          <Link to="/login" className="mt-6 block text-center text-[13px] font-semibold text-[var(--brand)]">Back to login</Link>
        )}
      </section>
    </main>
  );
}
