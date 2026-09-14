import { useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";

const fieldClassName =
  "h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10";
const readOnlyFieldClassName =
  "h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 text-sm text-[var(--text-primary)] outline-none";

export function AccountSettings() {
  const navigate = useNavigate();
  const { accessToken, logout, refreshUser, user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const changeEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || email === user?.email) return;
    setSavingEmail(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiRequest<{ email: string; emailSent: boolean }>("/auth/email", {
        method: "PATCH",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email, password: currentPassword }),
      });
      await refreshUser();
      setCurrentPassword("");
      setMessage(
        result.emailSent
          ? "A verification link was sent to your new email address."
          : "Your email was changed. Please verify the new address.",
      );
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update your email.");
    } finally {
      setSavingEmail(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setSavingPassword(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      await logout();
      navigate("/login", { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to change your password.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div
      data-testid="account-settings-page"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]"
    >
      <header className="flex-none border-b border-[var(--border-soft)] bg-white shadow-[0_1px_3px_rgba(30,40,55,.04)]">
        <div className="mx-auto flex w-full max-w-[1400px] items-center px-5 py-3 sm:px-8">
          <h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">
            Account settings
          </h1>
        </div>
      </header>

      <main data-testid="account-settings-scroll-region" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-5 py-5 sm:px-8 sm:py-7">
          {(message || error) && (
            <div className="mb-5 space-y-2">
              {message && (
                <div
                  role="status"
                  className="rounded-md border border-[var(--brand)]/15 bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--text-primary)]"
                >
                  {message}
                </div>
              )}
              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"
                >
                  {error}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <SettingsCard icon={<UserRound size={17} />} title="Personal information" description="Your identity within the workspace.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="first-name" className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">
                    First name
                  </label>
                  <input id="first-name" value={user?.firstName ?? ""} readOnly className={readOnlyFieldClassName} />
                </div>
                <div>
                  <label htmlFor="last-name" className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">
                    Last name
                  </label>
                  <input id="last-name" value={user?.lastName ?? ""} readOnly className={readOnlyFieldClassName} />
                </div>
              </div>
              <div className="mt-4 text-xs text-[var(--text-muted)]">Contact an administrator if your name needs to be updated.</div>
            </SettingsCard>

            <SettingsCard icon={<Mail size={17} />} title="Email address" description="Changing it requires verification.">
              <form onSubmit={changeEmail} className="space-y-4">
                <div>
                  <label htmlFor="account-email" className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">
                    Email address
                  </label>
                  <input
                    id="account-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={fieldClassName}
                  />
                </div>
                <PasswordInput
                  id="email-password"
                  label="Current password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  visible={showCurrent}
                  onToggle={() => setShowCurrent((value) => !value)}
                />
                <button
                  type="submit"
                  disabled={savingEmail || email === user?.email}
                  className="h-9 rounded-md bg-[var(--brand)] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingEmail ? "Updating…" : "Update email"}
                </button>
              </form>
            </SettingsCard>

            <div className="xl:col-span-2">
              <SettingsCard icon={<LockKeyhole size={17} />} title="Password" description="Use a strong password to protect your account.">
                <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-3">
                  <PasswordInput
                    id="current-password"
                    label="Current password"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    visible={showCurrent}
                    onToggle={() => setShowCurrent((value) => !value)}
                  />
                  <PasswordInput
                    id="new-password"
                    label="New password"
                    value={newPassword}
                    onChange={setNewPassword}
                    visible={showNew}
                    onToggle={() => setShowNew((value) => !value)}
                  />
                  <PasswordInput
                    id="confirm-password"
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    visible={showConfirm}
                    onToggle={() => setShowConfirm((value) => !value)}
                  />
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="h-9 rounded-md bg-[var(--brand)] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3 sm:w-fit"
                  >
                    {savingPassword ? "Updating…" : "Change password"}
                  </button>
                </form>
              </SettingsCard>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function SettingsCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)]">
      <header className="flex items-center gap-3 border-b border-[var(--border-soft)] px-5 py-4 sm:px-6">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">{title}</h2>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</div>
        </div>
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClassName} pr-10`}
        />
        <button
          type="button"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={onToggle}
          className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--text-primary)]"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
