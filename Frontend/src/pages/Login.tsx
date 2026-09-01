import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthMark, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { getSafeRedirectPath } from "@/routes/AuthGuards";
import { authTextFieldSx } from "@/components/auth/auth-text-field";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <Button type="button" variant="outline" className="h-11 w-full rounded-md text-[13px] shadow-[0_1px_2px_rgba(4,45,29,.04)]">
            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Login with Google
          </Button>

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
