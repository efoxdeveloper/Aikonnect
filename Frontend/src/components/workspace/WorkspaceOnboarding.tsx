import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowRightIcon as ArrowRight,
  ClockIcon as Clock,
  GlobeIcon as Globe,
  SparklesIcon as Sparkles,
  StoreIcon as Store,
} from "@animateicons/react/lucide";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { ApiError, apiRequest } from "@/lib/api";
import { clearWorkspaceOnboardingPrompt, getActiveMembership, shouldPromptWorkspaceOnboarding } from "@/lib/workspace";

const countries = [
  "India",
  "United Arab Emirates",
  "Singapore",
  "United Kingdom",
  "United States",
  "Australia",
  "Bangladesh",
  "Canada",
  "Germany",
  "Indonesia",
  "Malaysia",
  "Nepal",
  "Pakistan",
  "Saudi Arabia",
  "South Africa",
] as const;

const commonTimezones = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Kathmandu",
  "Asia/Jakarta",
  "Asia/Kuala_Lumpur",
  "Asia/Riyadh",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "Africa/Johannesburg",
  "UTC",
] as const;

function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [role="combobox"]:not([data-disabled])',
    ),
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function WorkspaceOnboarding() {
  const { accessToken, refreshUser, user } = useAuth();
  const activeMembership = getActiveMembership(user);
  const membership = activeMembership?.role.slug === "owner" && !activeMembership.workspace.onboardingCompletedAt && shouldPromptWorkspaceOnboarding(user, activeMembership.workspace.id)
    ? activeMembership
    : undefined;
  const [name, setName] = useState(() => membership?.workspace.name ?? "");
  const [country, setCountry] = useState(() => membership?.workspace.country ?? "India");
  const [timezone, setTimezone] = useState(() => membership?.workspace.timezone ?? "Asia/Kolkata");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const storeIcon = useAnimatedIcon();
  const globeIcon = useAnimatedIcon();
  const clockIcon = useAnimatedIcon();
  const sparkleIcon = useAnimatedIcon();
  const continueIcon = useAnimatedIcon();

  if (!membership || !accessToken) return null;

  const timezoneOptions = commonTimezones.includes(timezone as (typeof commonTimezones)[number])
    ? commonTimezones
    : ([timezone, ...commonTimezones] as readonly string[]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!name.trim() || !country || !timezone) {
      setError("Complete all workspace details to continue.");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest(`/workspaces/${membership.workspace.id}/onboarding/complete`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name, country, timezone }),
      });
      await refreshUser();
      clearWorkspaceOnboardingPrompt(membership.workspace.id);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to create your workspace. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#102c35]/45 px-4 py-6 backdrop-blur-[3px]" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-onboarding-title"
        onKeyDown={trapFocus}
        className="workspace-onboarding-card relative w-full max-w-[520px] overflow-hidden rounded-md border border-white/80 bg-white shadow-[0_18px_50px_rgba(21,52,62,.16)]"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#116b6f,#4daeb1,#116b6f)]" />
        <div className="px-6 pb-7 pt-8 sm:px-9 sm:pb-9 sm:pt-10">
          <div className="flex items-start gap-4">
            <div
              onMouseEnter={sparkleIcon.onMouseEnter}
              onMouseLeave={sparkleIcon.onMouseLeave}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"
            >
              <Sparkles ref={sparkleIcon.ref} size={23} duration={0.7} aria-hidden="true" />
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="uppercase">Welcome to Efox WhatsApp</p>
              <h2 id="workspace-onboarding-title" className="mt-1.5 text-[22px] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
                Create your workspace
              </h2>
            </div>
          </div>

          <form aria-label="Workspace setup" onSubmit={submit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="workspace-name" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Workspace name</label>
              <div
                onMouseEnter={storeIcon.onMouseEnter}
                onMouseLeave={storeIcon.onMouseLeave}
                className="group/field relative"
              >
                <Store ref={storeIcon.ref} size={18} duration={0.7} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[var(--text-muted)] transition-colors group-focus-within/field:text-[var(--brand)]" aria-hidden="true" />
                <Input
                  id="workspace-name"
                  autoFocus
                  required
                  maxLength={160}
                  autoComplete="organization"
                  value={name}
                  onChange={(event) => { setName(event.target.value); setError(null); }}
                  className="h-12 pl-11"
                />
              </div>
              <p className="mt-1.5">You can change this later from workspace settings.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="workspace-country" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Country</label>
                <Select required value={country} onValueChange={(value) => { setCountry(value); setError(null); }}>
                  <SelectTrigger
                    id="workspace-country"
                    aria-label="Country"
                    onMouseEnter={globeIcon.onMouseEnter}
                    onMouseLeave={globeIcon.onMouseLeave}
                    className="group/field h-12 px-3.5"
                  >
                    <span className="flex min-w-0 items-center">
                      <Globe ref={globeIcon.ref} size={17} duration={0.7} className="mr-2.5 shrink-0 text-[var(--text-muted)] group-focus/field:text-[var(--brand)]" aria-hidden="true" />
                      <SelectValue aria-label={country || "Select country"}>{country || "Select country"}</SelectValue>
                    </span>
                  </SelectTrigger>
                  <SelectContent className="z-[110]">
                    {countries.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="workspace-timezone" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Time zone</label>
                <Select required value={timezone} onValueChange={(value) => { setTimezone(value); setError(null); }}>
                  <SelectTrigger
                    id="workspace-timezone"
                    aria-label="Time zone"
                    onMouseEnter={clockIcon.onMouseEnter}
                    onMouseLeave={clockIcon.onMouseLeave}
                    className="group/field h-12 px-3.5"
                  >
                    <span className="flex min-w-0 items-center">
                      <Clock ref={clockIcon.ref} size={17} duration={0.7} className="mr-2.5 shrink-0 text-[var(--text-muted)] group-focus/field:text-[var(--brand)]" aria-hidden="true" />
                      <SelectValue>{timezone}</SelectValue>
                    </span>
                  </SelectTrigger>
                  <SelectContent className="z-[110]">
                    {timezoneOptions.map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2.5 text-center">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              onMouseEnter={continueIcon.onMouseEnter}
              onMouseLeave={continueIcon.onMouseLeave}
              className="group flex h-12 w-full items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white shadow-[0_7px_16px_rgba(17,107,111,.18)] transition-[background-color,transform,box-shadow] hover:-translate-y-px hover:bg-[var(--brand-hover)] hover:shadow-[0_10px_20px_rgba(17,107,111,.22)] active:translate-y-0 disabled:cursor-wait disabled:opacity-65 disabled:hover:translate-y-0"
            >
              {submitting ? "Creating workspace…" : "Create workspace"}
              <ArrowRight ref={continueIcon.ref} size={17} duration={0.6} className="ml-1" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
