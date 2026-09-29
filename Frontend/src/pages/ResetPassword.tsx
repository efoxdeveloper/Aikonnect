import { useState, type FormEvent } from "react";
import { ArrowLeftIcon as ArrowLeft, CircleCheckIcon as CircleCheck } from "@animateicons/react/lucide";
import { LockKeyhole } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { TextField } from "@mui/material";
import { AuthMark, AuthShell } from "@/components/auth/AuthShell";
import { authTextFieldSx } from "@/components/auth/auth-text-field";
import { Button } from "@/components/ui/button";
import { ApiError, apiRequest } from "@/lib/api";

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "This password reset link is missing or invalid.");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("This password reset link is missing or invalid.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("Password must contain at least 8 characters, including a letter and a number.");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      setSuccess(true);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to reset your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <section aria-labelledby="reset-password-title">
        <AuthMark className="mx-auto mb-4" />
        {success ? (
          <div className="auth-step text-center" aria-live="polite">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
              <CircleCheck size={32} duration={0.65} aria-hidden="true" />
            </div>
            <h1 id="reset-password-title" className="mt-5 text-[23px] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)]">Password updated</h1>
            <p className="mx-auto mt-3">Your password has been reset successfully. You can now sign in with your new password.</p>
            <Link to="/login" className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(4,63,41,.16)] hover:bg-[var(--brand-hover)]">Back to login</Link>
          </div>
        ) : (
          <div className="auth-step">
            <div className="text-center">
              <h1 id="reset-password-title" className="text-[23px] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)]">Set a new password</h1>
              <p className="mx-auto mt-2">Choose a new password for your Marento account.</p>
            </div>

            <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
              <TextField id="new-password" name="newPassword" type="password" autoComplete="new-password" label="New password" required disabled={submitting || !token} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} fullWidth size="small" variant="outlined" sx={authTextFieldSx} slotProps={{ htmlInput: { "aria-label": "New password" } }} />
              <TextField id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" label="Confirm new password" required disabled={submitting || !token} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} fullWidth size="small" variant="outlined" sx={authTextFieldSx} slotProps={{ htmlInput: { "aria-label": "Confirm new password" } }} />

              {error && <div role="alert" className="rounded-lg border border-[#f5dada] bg-[var(--danger-soft)] px-3 py-2.5 text-center text-xs text-[var(--danger)]">{error}</div>}

              <Button type="submit" disabled={submitting || !token} aria-busy={submitting} className="h-12 w-full rounded-md text-sm font-semibold shadow-[0_6px_16px_rgba(4,63,41,.16)]">
                <LockKeyhole size={16} className="mr-2" aria-hidden="true" />
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          </div>
        )}

        {!success && <Link to="/login" className="mt-6 flex items-center justify-center text-[13px] font-semibold text-[var(--brand)] transition-colors hover:text-[var(--brand-hover)]"><ArrowLeft size={15} duration={0.55} className="mr-1.5" aria-hidden="true" />Back to login</Link>}
      </section>
    </AuthShell>
  );
}
