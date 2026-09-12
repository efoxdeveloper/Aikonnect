import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthMark, AuthShell } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { getSafeRedirectPath } from "@/routes/AuthGuards";
import { authTextFieldSx } from "@/components/auth/auth-text-field";

function googleErrorMessage(code: string | null): string | null {
  if (code === "GOOGLE_ACCOUNT_LINK_REQUIRED") return "This email already has a password account. Log in with your password instead.";
  if (code === "GOOGLE_SIGNIN_CANCELLED") return "Google sign-in was cancelled.";
  if (code) return "Google sign-in could not be completed. Please try again.";
  return null;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const googleError = googleErrorMessage(new URLSearchParams(location.search).get("google_error"));
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(googleError);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
      const invitation = new URLSearchParams(location.search).get("invitation");
      navigate(invitation ? `/invitations/accept?token=${encodeURIComponent(invitation)}` : getSafeRedirectPath(location.state), { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <section aria-labelledby="login-title">
        <div className="text-center">
          <AuthMark className="mx-auto" />
          <h1 id="login-title" className="mt-4 text-[23px] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)]">Login to your account</h1>
          <div className="mt-2 text-[13px] text-[var(--text-secondary)]">Enter your email below to access your Interakt workspace.</div>
        </div>

        <form className="mt-7" onSubmit={handleSubmit}>
          <GoogleButton label="Login with Google" returnTo={getSafeRedirectPath(location.state)} />

          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-[var(--border-soft)]" />
            <span className="text-[10px] text-[var(--text-muted)]">Or continue with email</span>
            <span className="h-px flex-1 bg-[var(--border-soft)]" />
          </div>

          <div className="space-y-4">
            <TextField id="email" name="email" type="email" autoComplete="email" label="Email" required disabled={submitting} fullWidth size="small" variant="outlined" sx={authTextFieldSx} slotProps={{ htmlInput: { "aria-label": "Email" } }} />

            <div>
              <TextField id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" label="Password" required disabled={submitting} fullWidth size="small" variant="outlined" sx={authTextFieldSx} slotProps={{ htmlInput: { "aria-label": "Password" }, input: { endAdornment: <InputAdornment position="end"><IconButton type="button" edge="end" size="small" aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)} sx={{ color: "var(--text-muted)", "&:hover": { color: "var(--brand)" } }}>{showPassword ? <EyeOff className="size-[17px]" aria-hidden="true" /> : <Eye className="size-[17px]" aria-hidden="true" />}</IconButton></InputAdornment> } }} />
              <div className="mt-2 flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--text-secondary)]"><input type="checkbox" name="remember" className="size-3.5 rounded border-[var(--border-strong)] accent-[var(--brand-accent)]" />Remember me</label>
                <Link to="/forgot-password" className="rounded-sm text-[11px] font-medium text-[var(--brand)] underline decoration-[var(--green-300)] underline-offset-3 hover:text-[var(--brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]/25">Reset password</Link>
              </div>
            </div>
          </div>

          {error && <div role="alert" className="mt-4 rounded-lg border border-[#f5dada] bg-[var(--danger-soft)] px-3 py-2.5 text-center text-xs text-[var(--danger)]">{error}</div>}

          <Button type="submit" disabled={submitting} aria-busy={submitting} data-loading={submitting || undefined} className="mt-5 h-11 w-full rounded-md text-[13px] shadow-[0_6px_16px_rgba(4,63,41,.16)]">
            {submitting ? "Signing in…" : "Log in"}
          </Button>
        </form>

        <div className="mt-5 text-center text-[12px] text-[var(--text-secondary)]">Don’t have an account? <Link to="/register" className="font-semibold text-[var(--brand)] underline decoration-[var(--green-300)] underline-offset-3 hover:text-[var(--brand-hover)]">Sign up</Link></div>
      </section>
    </AuthShell>
  );
}
