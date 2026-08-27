import { useState, type FormEvent } from "react";
import { ArrowRightIcon as ArrowRight, CheckIcon as Check, ChevronLeftIcon as ChevronLeft, EyeIcon as Eye, EyeOffIcon as EyeOff, GlobeIcon as Globe2, IndianRupeeIcon as IndianRupee, LockIcon as Lock, MailIcon as Mail, MapPinIcon as MapPin, MessageSquareIcon as MessageSquare, PhoneIcon as Phone, SparklesIcon as Sparkles, StoreIcon as Building2, UserRoundIcon as UserRound } from "@animateicons/react/lucide";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import type { AnimatedIcon } from "@/config/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { getPasswordValidationError, toRegistrationRequest, type RegistrationFormData } from "@/pages/register.utils";

type RegistrationData = RegistrationFormData;

type RegistrationFieldProps = {
  id: keyof RegistrationData;
  label: string;
  icon: AnimatedIcon;
  value: string;
  type?: string;
  autoComplete?: string;
  onChange: (field: keyof RegistrationData, value: string) => void;
};

function RegistrationField({ id, label, icon: Icon, value, type = "text", autoComplete, onChange }: RegistrationFieldProps) {
  const animatedIcon = useAnimatedIcon();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block truncate text-sm font-semibold text-[var(--text-primary)]">{label}</label>
      <div onMouseEnter={animatedIcon.onMouseEnter} onMouseLeave={animatedIcon.onMouseLeave} onFocus={animatedIcon.onMouseEnter} onBlur={animatedIcon.onMouseLeave} className="group/input flex h-12 items-center rounded-md border border-[#d6dce0] bg-white px-3.5 shadow-[0_1px_2px_rgba(31,42,55,.03)] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_rgba(17,107,111,.10)]">
        <Icon ref={animatedIcon.ref} size={17} duration={0.7} className="mr-2.5 shrink-0 text-[var(--text-muted)] transition-colors group-focus-within/input:text-[var(--brand)]" aria-hidden="true" />
        <input id={id} name={id} type={type} autoComplete={autoComplete} required value={value} onChange={(event) => onChange(id, event.target.value)} className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[var(--text-primary)] outline-none" />
      </div>
    </div>
  );
}

type PasswordFieldProps = {
  id: "password" | "confirmPassword";
  label: string;
  value: string;
  visible: boolean;
  onChange: (field: keyof RegistrationData, value: string) => void;
  onToggle: () => void;
};

function PasswordField({ id, label, value, visible, onChange, onToggle }: PasswordFieldProps) {
  const lockIcon = useAnimatedIcon();
  const eyeIcon = useAnimatedIcon();
  const fieldName = id === "confirmPassword" ? "confirm password" : "password";

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block truncate text-sm font-semibold text-[var(--text-primary)]">{label}</label>
      <div onMouseEnter={lockIcon.onMouseEnter} onMouseLeave={lockIcon.onMouseLeave} onFocus={lockIcon.onMouseEnter} onBlur={lockIcon.onMouseLeave} className="group/input flex h-12 items-center rounded-md border border-[#d6dce0] bg-white px-3.5 shadow-[0_1px_2px_rgba(31,42,55,.03)] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_rgba(17,107,111,.10)]">
        <Lock ref={lockIcon.ref} size={17} duration={0.7} className="mr-2.5 shrink-0 text-[var(--text-muted)] transition-colors group-focus-within/input:text-[var(--brand)]" aria-hidden="true" />
        <input id={id} name={id} type={visible ? "text" : "password"} autoComplete="new-password" required value={value} onChange={(event) => onChange(id, event.target.value)} className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[var(--text-primary)] outline-none" />
        <button type="button" aria-label={`${visible ? "Hide" : "Show"} ${fieldName}`} onMouseEnter={eyeIcon.onMouseEnter} onMouseLeave={eyeIcon.onMouseLeave} onClick={onToggle} className="ml-2 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]">
          {visible ? <EyeOff ref={eyeIcon.ref} size={18} duration={0.6} aria-hidden="true" /> : <Eye ref={eyeIcon.ref} size={18} duration={0.6} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

const initialData: RegistrationData = {
  workEmail: "",
  password: "",
  confirmPassword: "",
  firstName: "",
  lastName: "",
  phone: "",
  companyName: "",
  companyWebsite: "",
  companyLocation: "",
  annualRevenue: "",
};

export function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [data, setData] = useState(initialData);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoIcon = useAnimatedIcon();
  const sparkleIcon = useAnimatedIcon();
  const continueIcon = useAnimatedIcon();
  const revenueIcon = useAnimatedIcon();
  const backIcon = useAnimatedIcon();
  const completeIcon = useAnimatedIcon();

  const updateField = (field: keyof RegistrationData, value: string) => {
    setError(null);
    setData((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (step === 1) {
      const passwordError = getPasswordValidationError(data.password, data.confirmPassword);
      if (passwordError) {
        setError(passwordError);
        return;
      }
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      const invitation = searchParams.get("invitation");
      await register(toRegistrationRequest(data, invitation ?? undefined));
      navigate(invitation ? `/verify-email?invitation=${encodeURIComponent(invitation)}` : "/verify-email", { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative isolate flex h-dvh items-center justify-center overflow-hidden bg-[#e8f6f7] px-4 py-8 sm:px-6 sm:py-10">
      <img src="/images/auth-background.png" alt="" className="absolute inset-0 -z-20 size-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.18),transparent_54%)]" />
      <div className="pointer-events-none absolute left-[8%] top-[13%] size-36 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[8%] right-[8%] size-44 rounded-full bg-[#8fd9dc]/20 blur-3xl" />

      <section aria-labelledby="register-title" className="auth-card relative w-full max-w-[540px] rounded-sm border border-white/85 bg-white/90 px-6 pb-7 pt-[62px] shadow-[0_16px_42px_rgba(30,72,86,.10),0_4px_14px_rgba(17,107,111,.05),inset_0_1px_0_rgba(255,255,255,.95)] backdrop-blur-xl sm:px-10 sm:pb-8">
        <div onMouseEnter={() => { logoIcon.onMouseEnter(); sparkleIcon.onMouseEnter(); }} onMouseLeave={() => { logoIcon.onMouseLeave(); sparkleIcon.onMouseLeave(); }} className="auth-logo absolute left-1/2 top-0 flex size-[86px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[linear-gradient(145deg,#167a7f,#0b5f64)] text-white">
          <MessageSquare ref={logoIcon.ref} size={40} duration={0.7} aria-hidden="true" />
          <Sparkles ref={sparkleIcon.ref} size={14} duration={0.65} className="absolute right-3 top-3 text-[#a9edf0]" aria-hidden="true" />
        </div>

        <div className="text-center">
          <h1 id="register-title" className="text-2xl font-semibold tracking-[-0.035em] text-[#145f64] sm:text-[26px]">Create your account</h1>
          <p className="mx-auto mt-2">{step === 1 ? "Tell us who you are to get started." : "Now tell us a little about your business."}</p>
        </div>

        <div className="mx-auto mt-5 flex max-w-[310px] items-center" aria-label={`Registration step ${step} of 2`}>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-semibold text-white">1</span>
            <span className="hidden text-xs font-medium text-[var(--brand)] sm:inline">Your details</span>
          </div>
          <span className={step === 2 ? "mx-3 h-px flex-1 bg-[var(--brand)]" : "mx-3 h-px flex-1 bg-[var(--border)]"} />
          <div className="flex items-center gap-2">
            <span className={step === 2 ? "flex size-7 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-semibold text-white" : "flex size-7 items-center justify-center rounded-full border border-[var(--border)] bg-white text-xs font-semibold text-[var(--text-muted)]"}>2</span>
            <span className={step === 2 ? "hidden text-xs font-medium text-[var(--brand)] sm:inline" : "hidden text-xs font-medium text-[var(--text-muted)] sm:inline"}>Company</span>
          </div>
        </div>

        <form key={step} className="auth-step mt-6" onSubmit={handleSubmit}>
          {step === 1 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3.5">
                <RegistrationField id="firstName" label="First name" icon={UserRound} value={data.firstName} onChange={updateField} autoComplete="given-name" />
                <RegistrationField id="lastName" label="Last name" icon={UserRound} value={data.lastName} onChange={updateField} autoComplete="family-name" />
              </div>
              <RegistrationField id="workEmail" label="Work email" icon={Mail} value={data.workEmail} onChange={updateField} type="email" autoComplete="email" />
              <div className="grid grid-cols-2 gap-3.5">
                <PasswordField id="password" label="Password" value={data.password} visible={showPassword} onChange={updateField} onToggle={() => setShowPassword((visible) => !visible)} />
                <PasswordField id="confirmPassword" label="Confirm password" value={data.confirmPassword} visible={showConfirmPassword} onChange={updateField} onToggle={() => setShowConfirmPassword((visible) => !visible)} />
              </div>
              {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2.5 text-center">{error}</p>}
              <button type="submit" onMouseEnter={continueIcon.onMouseEnter} onMouseLeave={continueIcon.onMouseLeave} className="group flex h-12 w-full items-center justify-center rounded-md bg-[linear-gradient(135deg,#15777c,#0d6267)] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(17,107,111,.20)] transition-[transform,box-shadow,filter] duration-150 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_14px_28px_rgba(17,107,111,.25)] active:translate-y-0 active:scale-[.99]">
                Continue
                <ArrowRight ref={continueIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3.5">
                <RegistrationField id="phone" label="Phone number" icon={Phone} value={data.phone} onChange={updateField} type="tel" autoComplete="tel" />
                <RegistrationField id="companyName" label="Company name" icon={Building2} value={data.companyName} onChange={updateField} autoComplete="organization" />
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <RegistrationField id="companyWebsite" label="Company website" icon={Globe2} value={data.companyWebsite} onChange={updateField} type="url" autoComplete="url" />
                <RegistrationField id="companyLocation" label="Company location" icon={MapPin} value={data.companyLocation} onChange={updateField} autoComplete="address-level2" />
              </div>
              <div>
                <label htmlFor="annualRevenue" className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Annual revenue</label>
                <Select required value={data.annualRevenue} onValueChange={(value) => updateField("annualRevenue", value)}>
                  <SelectTrigger id="annualRevenue" aria-label="Annual revenue" onMouseEnter={revenueIcon.onMouseEnter} onMouseLeave={revenueIcon.onMouseLeave} onFocus={revenueIcon.onMouseEnter} onBlur={revenueIcon.onMouseLeave} className="group/input h-12 border-[#d6dce0] px-3.5 shadow-[0_1px_2px_rgba(31,42,55,.03)] focus:shadow-[0_0_0_3px_rgba(17,107,111,.10)]">
                    <span className="flex min-w-0 items-center">
                      <IndianRupee ref={revenueIcon.ref} size={17} duration={0.7} className="mr-2.5 shrink-0 text-[var(--text-muted)] transition-colors group-focus/input:text-[var(--brand)]" aria-hidden="true" />
                      <SelectValue placeholder="Select a revenue range" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="under-50-lakh">Under ₹50 lakh</SelectItem>
                    <SelectItem value="50-lakh-1-crore">₹50 lakh – ₹1 crore</SelectItem>
                    <SelectItem value="1-5-crore">₹1 crore – ₹5 crore</SelectItem>
                    <SelectItem value="5-25-crore">₹5 crore – ₹25 crore</SelectItem>
                    <SelectItem value="25-crore-plus">₹25 crore and above</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2.5 text-center">{error}</p>}
              <div className="grid grid-cols-[112px_1fr] gap-3">
                <button type="button" disabled={submitting} onMouseEnter={backIcon.onMouseEnter} onMouseLeave={backIcon.onMouseLeave} onClick={() => setStep(1)} className="flex h-12 items-center justify-center rounded-md border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] transition-[background-color,color] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] disabled:opacity-60">
                  <ChevronLeft ref={backIcon.ref} size={16} duration={0.55} className="mr-1" aria-hidden="true" />
                  Back
                </button>
                <button type="submit" disabled={submitting} aria-busy={submitting} onMouseEnter={completeIcon.onMouseEnter} onMouseLeave={completeIcon.onMouseLeave} className="flex h-12 items-center justify-center rounded-md bg-[linear-gradient(135deg,#15777c,#0d6267)] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(17,107,111,.20)] transition-[transform,box-shadow,filter] duration-150 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_14px_28px_rgba(17,107,111,.25)] active:translate-y-0 active:scale-[.99] disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0">{submitting ? "Creating account…" : "Create account"}<Check ref={completeIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" /></button>
              </div>
            </div>
          )}
        </form>

        <p className="mt-5 text-center">Already have an account? <Link to="/login" className="font-semibold text-[var(--brand)] transition-colors hover:text-[var(--brand-hover)]">Log in</Link></p>
        <p className="mt-3 text-center">By registering, you agree to our Terms of use and Privacy policy.</p>
      </section>
    </main>
  );
}
