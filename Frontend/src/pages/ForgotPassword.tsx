import { useState, type FormEvent } from "react";
import { ArrowLeftIcon as ArrowLeft, CircleCheckIcon as CircleCheck, SendIcon as Send } from "@animateicons/react/lucide";
import { Link } from "react-router-dom";
import { TextField } from "@mui/material";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { AuthMark, AuthShell } from "@/components/auth/AuthShell";
import { authTextFieldSx } from "@/components/auth/auth-text-field";
import { Button } from "@/components/ui/button";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const sendIcon = useAnimatedIcon();
  const successIcon = useAnimatedIcon();
  const backIcon = useAnimatedIcon();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <AuthShell>
      <section aria-labelledby="forgot-password-title">
        <AuthMark className="mx-auto mb-4" />
        {!submitted ? (
          <div className="auth-step">
            <div className="text-center">
              <h1 id="forgot-password-title" className="text-[23px] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)]">Forgot your password?</h1>
              <p className="mx-auto mt-2">Enter your work email and we’ll send you a secure password recovery link.</p>
            </div>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
              <TextField id="recovery-email" name="email" type="email" autoComplete="email" label="Work email" required value={email} onChange={(event) => setEmail(event.target.value)} fullWidth size="small" variant="outlined" sx={authTextFieldSx} slotProps={{ htmlInput: { "aria-label": "Work email" } }} />

              <Button type="submit" onMouseEnter={sendIcon.onMouseEnter} onMouseLeave={sendIcon.onMouseLeave} className="h-12 w-full rounded-md text-sm font-semibold shadow-[0_6px_16px_rgba(4,63,41,.16)]">
                Send recovery link
                <Send ref={sendIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" />
              </Button>
            </form>
          </div>
        ) : (
          <div className="auth-step text-center" aria-live="polite">
            <div onMouseEnter={successIcon.onMouseEnter} onMouseLeave={successIcon.onMouseLeave} className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
              <CircleCheck ref={successIcon.ref} size={32} duration={0.65} aria-hidden="true" />
            </div>
            <h1 id="forgot-password-title" className="mt-5 text-[23px] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)]">Check your inbox</h1>
            <p className="mx-auto mt-3">We sent a password recovery link to <span className="font-semibold text-[var(--text-primary)]">{email}</span>.</p>
            <p className="mt-2">The link will expire shortly. Check your spam folder if you don’t see it.</p>
            <Button type="button" variant="outline" onClick={() => setSubmitted(false)} onMouseEnter={sendIcon.onMouseEnter} onMouseLeave={sendIcon.onMouseLeave} className="mt-6 h-11 w-full rounded-md text-sm font-semibold text-[var(--brand)]">
              Send another link
              <Send ref={sendIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" />
            </Button>
          </div>
        )}

        <Link to="/login" onMouseEnter={backIcon.onMouseEnter} onMouseLeave={backIcon.onMouseLeave} className="mt-6 flex items-center justify-center text-[13px] font-semibold text-[var(--brand)] transition-colors hover:text-[var(--brand-hover)]">
          <ArrowLeft ref={backIcon.ref} size={15} duration={0.55} className="mr-1.5" aria-hidden="true" />
          Back to login
        </Link>
      </section>
    </AuthShell>
  );
}
