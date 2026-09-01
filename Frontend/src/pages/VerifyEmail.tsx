import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRightIcon as ArrowRight, CircleCheckIcon as CircleCheck, MailIcon as Mail, RefreshCwIcon as RefreshCw } from "@animateicons/react/lucide";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { TextField } from "@mui/material";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { AuthMark, AuthShell } from "@/components/auth/AuthShell";
import { authTextFieldSx } from "@/components/auth/auth-text-field";
import { Button } from "@/components/ui/button";

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
  const statusIcon = useAnimatedIcon();
  const actionIcon = useAnimatedIcon();

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
    <AuthShell>
      <section aria-labelledby="verify-email-title">
        <AuthMark className="mx-auto mb-5" />
        <div className="text-center" aria-live="polite">
          <div onMouseEnter={statusIcon.onMouseEnter} onMouseLeave={statusIcon.onMouseLeave} className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
            {verified ? <CircleCheck ref={statusIcon.ref} size={32} duration={0.65} aria-hidden="true" /> : <Mail ref={statusIcon.ref} size={30} duration={0.65} aria-hidden="true" />}
          </div>
          <h1 id="verify-email-title" className="mt-5 text-[23px] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)]">
            {verificationState === "verifying" ? "Verifying your email…" : verified ? "Email verified" : "Check your inbox"}
          </h1>
          <p className="mx-auto mt-3">
            {verified
              ? "Your account is ready. You can now access your workspace."
              : <>We sent a verification link to {user?.email ? <span className="font-semibold text-[var(--text-primary)]">{user.email}</span> : "your email address"}.</>}
          </p>
          {!verified && status === "authenticated" && !editingEmail && verificationState !== "verifying" && (
            <button type="button" onClick={() => { setEditingEmail(true); setMessage(null); }} className="mt-2 text-xs font-semibold text-[var(--brand)] underline decoration-[var(--green-300)] underline-offset-4 hover:text-[var(--brand-hover)]">
              Entered the wrong email? Change it
            </button>
          )}
          {message && <p className={`mt-4 rounded-md px-3 py-2.5 ${verificationState === "error" ? "bg-[var(--danger-soft)]" : "bg-[var(--brand-soft)]"}`}>{message}</p>}
        </div>

        {editingEmail && !verified && (
          <form className="mt-5 space-y-4" onSubmit={handleChangeEmail}>
            <TextField id="new-email" type="email" autoComplete="email" label="New email address" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} fullWidth size="small" variant="outlined" sx={authTextFieldSx} slotProps={{ htmlInput: { "aria-label": "New email address" } }} />
            <TextField id="email-change-password" type="password" autoComplete="current-password" label="Account password" required value={password} onChange={(event) => setPassword(event.target.value)} fullWidth size="small" variant="outlined" sx={authTextFieldSx} slotProps={{ htmlInput: { "aria-label": "Account password" } }} />
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <Button type="button" variant="outline" disabled={changingEmail} onClick={() => { setEditingEmail(false); setMessage(null); }} className="h-11 rounded-md text-sm font-semibold">Cancel</Button>
              <Button type="submit" disabled={changingEmail} className="h-11 rounded-md text-sm font-semibold">{changingEmail ? "Updating…" : "Update email and resend"}</Button>
            </div>
          </form>
        )}

        {!editingEmail && verified ? (
          <Button type="button" onClick={() => navigate(status === "authenticated" ? "/dashboard" : "/login", { replace: true })} onMouseEnter={actionIcon.onMouseEnter} onMouseLeave={actionIcon.onMouseLeave} className="mt-6 h-12 w-full rounded-md text-sm font-semibold">
            Continue<ArrowRight ref={actionIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" />
          </Button>
        ) : !editingEmail && status === "authenticated" && verificationState !== "verifying" ? (
          <Button type="button" variant="outline" disabled={resending} onClick={handleResend} onMouseEnter={actionIcon.onMouseEnter} onMouseLeave={actionIcon.onMouseLeave} className="mt-6 h-12 w-full rounded-md text-sm font-semibold text-[var(--brand)]">
            {resending ? "Sending…" : "Resend verification email"}<RefreshCw ref={actionIcon.ref} size={16} duration={0.65} className="ml-2" aria-hidden="true" />
          </Button>
        ) : null}

        {status !== "authenticated" && verificationState !== "verifying" && !verified && (
          <Link to="/login" className="mt-6 block text-center text-[13px] font-semibold text-[var(--brand)]">Back to login</Link>
        )}
      </section>
    </AuthShell>
  );
}
