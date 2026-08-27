import { useState, type FormEvent } from "react";
import { EyeIcon as Eye, EyeOffIcon as EyeOff, LockIcon as Lock, MailIcon as Mail, UserRoundIcon as UserRound } from "@animateicons/react/lucide";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";

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
    setSavingEmail(true); setError(null); setMessage(null);
    try {
      const result = await apiRequest<{ email: string; emailSent: boolean }>("/auth/email", { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email, password: currentPassword }) });
      await refreshUser();
      setCurrentPassword("");
      setMessage(result.emailSent ? "A verification link was sent to your new email address." : "Your email was changed. Please verify the new address.");
    } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update your email."); } finally { setSavingEmail(false); }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;
    if (newPassword !== confirmPassword) { setError("New password and confirmation do not match."); return; }
    setSavingPassword(true); setError(null); setMessage(null);
    try {
      await apiRequest("/auth/change-password", { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ currentPassword, newPassword }) });
      await logout();
      navigate("/login", { replace: true });
    } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to change your password."); } finally { setSavingPassword(false); }
  };

  return <div className="mx-auto max-w-[1000px] px-5 py-7 sm:px-8 sm:py-9"><div><h1 className="text-[25px] font-medium tracking-[-0.025em] text-[var(--text-primary)]">Account settings</h1><p className="mt-1">Manage your personal information, email address and password.</p></div>{message && <p className="mt-5 rounded-md bg-[var(--brand-soft)] px-4 py-3">{message}</p>}{error && <p role="alert" className="mt-5 rounded-md bg-red-50 px-4 py-3">{error}</p>}<div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-7"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] pb-5"><div className="flex size-10 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><UserRound size={19} duration={0.65} /></div><div><h2 className="text-[16px] font-medium text-[var(--text-primary)]">Personal information</h2><p className="mt-1">Your identity within the workspace.</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">First name</label><input value={user?.firstName ?? ""} readOnly className="h-11 w-full rounded-md border border-[#d6dce0] bg-[#f7f8fa] px-3.5 text-sm text-[var(--text-primary)]" /></div><div><label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Last name</label><input value={user?.lastName ?? ""} readOnly className="h-11 w-full rounded-md border border-[#d6dce0] bg-[#f7f8fa] px-3.5 text-sm text-[var(--text-primary)]" /></div></div><p className="mt-4">Contact an administrator if your name needs to be updated.</p></section><section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-7"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] pb-5"><div className="flex size-10 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Mail size={19} duration={0.65} /></div><div><h2 className="text-[16px] font-medium text-[var(--text-primary)]">Email address</h2><p className="mt-1">Changing it requires verification.</p></div></div><form onSubmit={changeEmail} className="mt-6 space-y-4"><div><label htmlFor="account-email" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Email address</label><input id="account-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-md border border-[#d6dce0] px-3.5 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10" /></div><div><label htmlFor="email-password" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Current password</label><div className="relative"><input id="email-password" type={showCurrent ? "text" : "password"} required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="h-11 w-full rounded-md border border-[#d6dce0] px-3.5 pr-11 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10" /><button type="button" aria-label={showCurrent ? "Hide current password" : "Show current password"} onClick={() => setShowCurrent((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--brand-soft)]">{showCurrent ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div><button type="submit" disabled={savingEmail || email === user?.email} className="h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50">{savingEmail ? "Updating…" : "Update email"}</button></form></section><section className="rounded-md border border-[var(--border-soft)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-7 lg:col-span-2"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] pb-5"><div className="flex size-10 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Lock size={19} duration={0.65} /></div><div><h2 className="text-[16px] font-medium text-[var(--text-primary)]">Password</h2><p className="mt-1">Use a strong password to protect your account.</p></div></div><form onSubmit={changePassword} className="mt-6 grid gap-4 sm:grid-cols-3"><PasswordInput id="current-password" label="Current password" value={currentPassword} onChange={setCurrentPassword} visible={showCurrent} onToggle={() => setShowCurrent((value) => !value)} /><PasswordInput id="new-password" label="New password" value={newPassword} onChange={setNewPassword} visible={showNew} onToggle={() => setShowNew((value) => !value)} /><PasswordInput id="confirm-password" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirm} onToggle={() => setShowConfirm((value) => !value)} /><button type="submit" disabled={savingPassword} className="h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50 sm:col-span-3 sm:w-fit">{savingPassword ? "Updating…" : "Change password"}</button></form></section></div></div>;
}

function PasswordInput({ id, label, value, onChange, visible, onToggle }: { id: string; label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void }) { return <div><label htmlFor={id} className="mb-2 block text-sm font-medium text-[var(--text-primary)]">{label}</label><div className="relative"><input id={id} type={visible ? "text" : "password"} required value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-md border border-[#d6dce0] px-3.5 pr-11 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10" /><button type="button" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--brand-soft)]">{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>; }
