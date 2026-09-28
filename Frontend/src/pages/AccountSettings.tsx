import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import MuiAvatar from "@mui/material/Avatar";
import {
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  LockKeyhole,
  LogOut,
  Mail,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth, type AuthUser } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { InternationalPhoneInput } from "@/components/ui/international-phone-input";
import { Switch } from "@/components/ui/switch";

const fieldClassName =
  "h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10";
const buttonClassName =
  "inline-flex h-9 items-center justify-center rounded-md bg-[var(--brand)] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-55";
const secondaryButtonClassName =
  "inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-white px-3.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-55";

type ProfileState = { firstName: string; lastName: string; phone: string };
type PreferencesState = {
  language: "en-IN" | "en-US" | "en-GB";
  timezone: string;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  defaultLandingPage: "/dashboard" | "/inbox" | "/campaigns";
  notifyProductUpdates: boolean;
  notifyBillingAlerts: boolean;
  notifyCampaignAlerts: boolean;
  notifyWhatsappAlerts: boolean;
};

const defaultPreferences: PreferencesState = {
  language: "en-IN",
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  defaultLandingPage: "/dashboard",
  notifyProductUpdates: true,
  notifyBillingAlerts: true,
  notifyCampaignAlerts: true,
  notifyWhatsappAlerts: true,
};

const timezones = ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"];

function initials(user: AuthUser | null) {
  return user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() : "AC";
}

function displayName(user: AuthUser | null) {
  return user ? `${user.firstName} ${user.lastName}`.trim() : "Account";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function AccountSettings() {
  const navigate = useNavigate();
  const { accessToken, logout, refreshUser, resendVerification, user } = useAuth();
  const membership = getActiveMembership(user);
  const [profile, setProfile] = useState<ProfileState>({ firstName: user?.firstName ?? "", lastName: user?.lastName ?? "", phone: user?.phone ?? "" });
  const [preferences, setPreferences] = useState<PreferencesState>({
    language: user?.language ?? defaultPreferences.language,
    timezone: user?.timezone ?? defaultPreferences.timezone,
    dateFormat: user?.dateFormat ?? defaultPreferences.dateFormat,
    defaultLandingPage: user?.defaultLandingPage ?? defaultPreferences.defaultLandingPage,
    notifyProductUpdates: user?.notifyProductUpdates ?? defaultPreferences.notifyProductUpdates,
    notifyBillingAlerts: user?.notifyBillingAlerts ?? defaultPreferences.notifyBillingAlerts,
    notifyCampaignAlerts: user?.notifyCampaignAlerts ?? defaultPreferences.notifyCampaignAlerts,
    notifyWhatsappAlerts: user?.notifyWhatsappAlerts ?? defaultPreferences.notifyWhatsappAlerts,
  });
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setProfile({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? "" });
    setEmail(user.email);
    setPreferences({
      language: user.language ?? defaultPreferences.language,
      timezone: user.timezone ?? defaultPreferences.timezone,
      dateFormat: user.dateFormat ?? defaultPreferences.dateFormat,
      defaultLandingPage: user.defaultLandingPage ?? defaultPreferences.defaultLandingPage,
      notifyProductUpdates: user.notifyProductUpdates ?? defaultPreferences.notifyProductUpdates,
      notifyBillingAlerts: user.notifyBillingAlerts ?? defaultPreferences.notifyBillingAlerts,
      notifyCampaignAlerts: user.notifyCampaignAlerts ?? defaultPreferences.notifyCampaignAlerts,
      notifyWhatsappAlerts: user.notifyWhatsappAlerts ?? defaultPreferences.notifyWhatsappAlerts,
    });
  }, [user]);

  const activeRole = membership?.role.name ?? (user?.platformRole && user.platformRole !== "NONE" ? "Platform administrator" : "Member");
  const hasGoogle = user?.oauthProviders?.includes("google") ?? false;
  const workspaceCountLabel = `${user?.memberships.length ?? 0} workspace${user?.memberships.length === 1 ? "" : "s"}`;
  const languageLabel = useMemo(() => ({ "en-IN": "English (India)", "en-US": "English (United States)", "en-GB": "English (United Kingdom)" }[preferences.language]), [preferences.language]);

  const clearFeedback = () => { setMessage(null); setError(null); };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;
    clearFeedback();
    setSavingProfile(true);
    try {
      const phoneDigits = profile.phone.replace(/\D/g, "");
      await apiRequest("/auth/profile", { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ ...profile, phone: phoneDigits.length > 3 ? profile.phone.trim() : null }) });
      await refreshUser();
      setMessage("Profile details updated.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update your profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;
    clearFeedback();
    setSavingPreferences(true);
    try {
      await apiRequest("/auth/preferences", { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify(preferences) });
      await refreshUser();
      setMessage("Preferences saved.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save your preferences.");
    } finally {
      setSavingPreferences(false);
    }
  };

  const changeEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || email === user?.email) return;
    clearFeedback();
    setSavingEmail(true);
    try {
      const result = await apiRequest<{ email: string; emailSent: boolean }>("/auth/email", { method: "PATCH", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email, password: emailPassword }) });
      await refreshUser();
      setEmailPassword("");
      setMessage(result.emailSent ? "A verification link was sent to your new email address." : "Your email was changed. Please verify the new address.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update your email.");
    } finally {
      setSavingEmail(false);
    }
  };

  const resendEmailVerification = async () => {
    clearFeedback();
    setResendingVerification(true);
    try {
      const result = await resendVerification();
      setMessage(result.emailSent ? "A new verification link was sent to your email." : "Your verification request was received.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to send a verification email.");
    } finally {
      setResendingVerification(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;
    clearFeedback();
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await apiRequest("/auth/change-password", { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ currentPassword, newPassword }) });
      await logout();
      navigate("/login", { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to change your password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const signOutAllDevices = async () => {
    if (!accessToken || signingOutAll) return;
    clearFeedback();
    setSigningOutAll(true);
    try {
      await apiRequest("/auth/logout-all", { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
      await logout();
      navigate("/login", { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to sign out of your other sessions.");
      setSigningOutAll(false);
    }
  };

  return (
    <div data-testid="account-settings-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]">
      <header className="flex-none border-b border-[var(--border-soft)] bg-white shadow-[0_1px_3px_rgba(30,40,55,.04)]">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">Account settings</h1>
        </div>
      </header>

      <main data-testid="account-settings-scroll-region" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-5 py-5 sm:px-8 sm:py-7">
          {(message || error) && <div className="mb-5 space-y-2">{message && <div role="status" className="flex items-center gap-2 rounded-md border border-[var(--brand)]/15 bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--text-primary)]"><Check size={16} className="text-[var(--brand)]" />{message}</div>}{error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{error}</div>}</div>}

          <section data-testid="account-profile-summary" className="mb-5 flex flex-col gap-4 rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-center gap-4"><MuiAvatar className="size-16 shrink-0 border border-[var(--brand)]/15 bg-[var(--brand-soft)] text-lg font-semibold text-[var(--brand)]">{initials(user)}</MuiAvatar><div className="min-w-0"><h2 className="truncate text-lg font-semibold text-[var(--text-primary)]">{displayName(user)}</h2><p className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">{user?.email}</p><div className="mt-2 flex flex-wrap items-center gap-2"><StatusPill tone="green">{activeRole}</StatusPill><StatusPill tone={user?.emailVerifiedAt ? "green" : "amber"}>{user?.emailVerifiedAt ? "Email verified" : "Email verification pending"}</StatusPill></div></div></div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-[var(--border-soft)] pt-4 text-xs sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0"><SummaryMetric label="Member since" value={formatDate(user?.createdAt)} /><SummaryMetric label="Workspace access" value={workspaceCountLabel} /></div>
          </section>

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-5">
              <SettingsCard icon={<UserRound size={17} />} title="Profile details" testId="profile-details-card">
                <form onSubmit={saveProfile} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><TextField id="first-name" label="First name" value={profile.firstName} onChange={(value) => setProfile((current) => ({ ...current, firstName: value }))} required /><TextField id="last-name" label="Last name" value={profile.lastName} onChange={(value) => setProfile((current) => ({ ...current, lastName: value }))} required /></div><div><label htmlFor="account-phone" className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">Phone number</label><InternationalPhoneInput id="account-phone" value={profile.phone} onChange={(phone) => setProfile((current) => ({ ...current, phone }))} /></div><div className="flex items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-4"><p className="text-xs text-[var(--text-muted)]">Used for account recovery and important workspace alerts.</p><button type="submit" disabled={savingProfile} className={buttonClassName}>{savingProfile ? "Saving…" : "Save profile"}</button></div></form>
              </SettingsCard>

              <SettingsCard icon={<Mail size={17} />} title="Email address" testId="email-settings-card">
                <form onSubmit={changeEmail} className="space-y-4"><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]"><TextField id="account-email" label="Email address" type="email" value={email} onChange={setEmail} required /><PasswordInput id="email-password" label="Current password" value={emailPassword} onChange={setEmailPassword} visible={showCurrent} onToggle={() => setShowCurrent((value) => !value)} /></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-4"><div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">{user?.emailVerifiedAt ? <><Check size={14} className="text-[var(--success)]" />Verified email</> : <><span className="size-2 rounded-full bg-amber-500" />Verification required</>}</div><div className="flex gap-2"><button type="submit" disabled={savingEmail || email === user?.email} className={buttonClassName}>{savingEmail ? "Updating…" : "Update email"}</button>{!user?.emailVerifiedAt && <button type="button" disabled={resendingVerification} onClick={() => void resendEmailVerification()} className={secondaryButtonClassName}>{resendingVerification ? "Sending…" : "Resend verification"}</button>}</div></div></form>
              </SettingsCard>

              <SettingsCard icon={<Bell size={17} />} title="Notifications" testId="notification-settings-card">
                <form onSubmit={savePreferences} className="space-y-1"><ToggleRow label="Product updates" description="New features, improvements and service announcements." checked={preferences.notifyProductUpdates} onCheckedChange={(checked) => setPreferences((current) => ({ ...current, notifyProductUpdates: checked }))} /><ToggleRow label="Billing alerts" description="Low balance, payment and wallet activity alerts." checked={preferences.notifyBillingAlerts} onCheckedChange={(checked) => setPreferences((current) => ({ ...current, notifyBillingAlerts: checked }))} /><ToggleRow label="Campaign alerts" description="Delivery issues and campaign completion updates." checked={preferences.notifyCampaignAlerts} onCheckedChange={(checked) => setPreferences((current) => ({ ...current, notifyCampaignAlerts: checked }))} /><ToggleRow label="WhatsApp account alerts" description="Connection, template and account status alerts." checked={preferences.notifyWhatsappAlerts} onCheckedChange={(checked) => setPreferences((current) => ({ ...current, notifyWhatsappAlerts: checked }))} /><div className="flex justify-end border-t border-[var(--border-soft)] pt-4"><button type="submit" disabled={savingPreferences} className={buttonClassName}>{savingPreferences ? "Saving…" : "Save notifications"}</button></div></form>
              </SettingsCard>

              <SettingsCard icon={<LockKeyhole size={17} />} title="Password and sign-in" testId="security-settings-card">
                <form onSubmit={changePassword} className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><PasswordInput id="current-password" label="Current password" value={currentPassword} onChange={setCurrentPassword} visible={showCurrent} onToggle={() => setShowCurrent((value) => !value)} /><PasswordInput id="new-password" label="New password" value={newPassword} onChange={setNewPassword} visible={showNew} onToggle={() => setShowNew((value) => !value)} /><PasswordInput id="confirm-password" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirm} onToggle={() => setShowConfirm((value) => !value)} /></div><div className="flex items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-4"><p className="text-xs text-[var(--text-muted)]">Use at least 8 characters with a letter and a number.</p><button type="submit" disabled={savingPassword} className={buttonClassName}>{savingPassword ? "Updating…" : "Change password"}</button></div></form>
              </SettingsCard>
            </div>

            <aside className="min-w-0 space-y-5">
              <SettingsCard icon={<Globe2 size={17} />} title="Preferences" testId="preference-settings-card">
                <form onSubmit={savePreferences} className="space-y-4"><SelectField id="language" label="Language" value={preferences.language} onChange={(value) => setPreferences((current) => ({ ...current, language: value as PreferencesState["language"] }))} options={[["en-IN", "English (India)"], ["en-US", "English (United States)"], ["en-GB", "English (United Kingdom)"]]} /><SelectField id="timezone" label="Time zone" value={preferences.timezone} onChange={(value) => setPreferences((current) => ({ ...current, timezone: value }))} options={timezones.map((value) => [value, value])} /><SelectField id="date-format" label="Date format" value={preferences.dateFormat} onChange={(value) => setPreferences((current) => ({ ...current, dateFormat: value as PreferencesState["dateFormat"] }))} options={[["DD/MM/YYYY", "DD/MM/YYYY"], ["MM/DD/YYYY", "MM/DD/YYYY"], ["YYYY-MM-DD", "YYYY-MM-DD"]]} /><SelectField id="default-page" label="Default landing page" value={preferences.defaultLandingPage} onChange={(value) => setPreferences((current) => ({ ...current, defaultLandingPage: value as PreferencesState["defaultLandingPage"] }))} options={[["/dashboard", "Dashboard"], ["/inbox", "Inbox"], ["/campaigns", "Campaigns"]]} /><div className="flex justify-end border-t border-[var(--border-soft)] pt-4"><button type="submit" disabled={savingPreferences} className={buttonClassName}>{savingPreferences ? "Saving…" : "Save preferences"}</button></div></form><p className="mt-3 text-[11px] text-[var(--text-muted)]">{languageLabel} · {preferences.timezone}</p>
              </SettingsCard>

              <SettingsCard icon={<UsersRound size={17} />} title="Workspace access" testId="workspace-access-card">
                <div className="space-y-2">{user?.memberships.length ? user.memberships.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] px-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-medium text-[var(--text-primary)]">{item.workspace.name}</p><p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{item.workspace.slug}</p></div><StatusPill tone="gray">{item.role.name}</StatusPill></div>) : <p className="text-xs text-[var(--text-muted)]">No workspace memberships found.</p>}</div><button type="button" onClick={() => navigate("/team-members")} className="mt-4 flex w-full items-center justify-between border-t border-[var(--border-soft)] pt-4 text-xs font-medium text-[var(--brand)]">Manage team access <ChevronRight size={15} /></button>
              </SettingsCard>

              <SettingsCard icon={<KeyRound size={17} />} title="Sign-in methods" testId="signin-methods-card">
                <div className="space-y-3"><MethodRow icon={<Mail size={15} />} label="Email and password" detail={user?.email ?? "—"} /><MethodRow icon={<span className="text-xs font-bold">G</span>} label="Google" detail={hasGoogle ? "Connected" : "Not connected"} status={hasGoogle ? "Connected" : undefined} /><MethodRow icon={<Clock3 size={15} />} label="Last sign-in" detail={formatDate(user?.lastLoginAt)} /></div>
              </SettingsCard>

              <SettingsCard icon={<LogOut size={17} />} title="Account actions" testId="account-actions-card" tone="danger">
                <p className="text-xs leading-5 text-[var(--text-secondary)]">Sign out of every browser and device connected to this account. You will need to sign in again here.</p><button type="button" onClick={() => void signOutAllDevices()} disabled={signingOutAll} className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-medium text-[var(--danger)] transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-55">{signingOutAll ? "Signing out…" : "Sign out of all devices"}</button>
              </SettingsCard>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

function SettingsCard({ icon, title, children, testId, tone = "default" }: { icon: ReactNode; title: string; children: ReactNode; testId?: string; tone?: "default" | "danger" }) {
  return <section data-testid={testId} className={`overflow-hidden rounded-lg border bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)] ${tone === "danger" ? "border-red-200" : "border-[var(--border-soft)]"}`}><header className="flex items-center gap-3 border-b border-[var(--border-soft)] px-5 py-4 sm:px-6"><div className={`flex size-8 shrink-0 items-center justify-center rounded-md ${tone === "danger" ? "bg-red-50 text-[var(--danger)]" : "bg-[var(--brand-soft)] text-[var(--brand)]"}`}>{icon}</div><h2 className="text-sm font-medium text-[var(--text-primary)]">{title}</h2></header><div className="px-5 py-5 sm:px-6">{children}</div></section>;
}

function TextField({ id, label, value, onChange, type = "text", required = false }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <div><label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">{label}</label><input id={id} type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className={fieldClassName} /></div>;
}

function SelectField({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <div><label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={fieldClassName}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></div>;
}

function PasswordInput({ id, label, value, onChange, visible, onToggle }: { id: string; label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void }) {
  return <div><label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">{label}</label><div className="relative"><input id={id} type={visible ? "text" : "password"} required value={value} onChange={(event) => onChange(event.target.value)} className={`${fieldClassName} pr-10`} /><button type="button" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} onClick={onToggle} className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--text-primary)]">{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>;
}

function ToggleRow({ label, description, checked, onCheckedChange }: { label: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-md px-1 py-3"><div className="min-w-0"><p className="text-sm font-medium text-[var(--text-primary)]">{label}</p><p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">{description}</p></div><Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} /></div>;
}

function StatusPill({ children, tone }: { children: ReactNode; tone: "green" | "amber" | "gray" }) {
  const classes = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-[var(--surface-subtle)] text-[var(--text-secondary)]";
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium ${classes}`}>{children}</span>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p><p className="mt-0.5 text-xs font-medium text-[var(--text-primary)]">{value}</p></div>;
}

function MethodRow({ icon, label, detail, status }: { icon: ReactNode; label: string; detail: string; status?: string }) {
  return <div className="flex items-center gap-3"><div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface-subtle)] text-[var(--text-secondary)]">{icon}</div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-[var(--text-primary)]">{label}</p><p className="truncate text-[11px] text-[var(--text-muted)]">{detail}</p></div>{status && <Check size={14} className="text-[var(--success)]" />}</div>;
}
