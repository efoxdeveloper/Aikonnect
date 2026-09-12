import { useState, type FormEvent } from "react";
import { ArrowRightIcon as ArrowRight, CheckIcon as Check, ChevronLeftIcon as ChevronLeft, EyeIcon as Eye, EyeOffIcon as EyeOff, IndianRupeeIcon as IndianRupee } from "@animateicons/react/lucide";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { getPasswordValidationError, toRegistrationRequest, type RegistrationFormData } from "@/pages/register.utils";
import { AuthMark, AuthShell } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { authTextFieldSx } from "@/components/auth/auth-text-field";

type RegistrationData = RegistrationFormData;

type RegistrationFieldProps = {
  id: keyof RegistrationData;
  label: string;
  value: string;
  type?: string;
  autoComplete?: string;
  onChange: (field: keyof RegistrationData, value: string) => void;
};

function RegistrationField({ id, label, value, type = "text", autoComplete, onChange }: RegistrationFieldProps) {
  return (
    <TextField id={id} name={id} type={type} autoComplete={autoComplete} label={label} required value={value} onChange={(event) => onChange(id, event.target.value)} fullWidth size="small" variant="outlined" sx={authTextFieldSx} slotProps={{ htmlInput: { "aria-label": label } }} />
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
  const eyeIcon = useAnimatedIcon();
  const fieldName = id === "confirmPassword" ? "confirm password" : "password";

  return (
    <TextField id={id} name={id} type={visible ? "text" : "password"} autoComplete="new-password" label={label} required value={value} onChange={(event) => onChange(id, event.target.value)} fullWidth size="small" variant="outlined" sx={authTextFieldSx} slotProps={{ htmlInput: { "aria-label": label }, input: { endAdornment: <InputAdornment position="end"><IconButton type="button" edge="end" size="small" aria-label={`${visible ? "Hide" : "Show"} ${fieldName}`} title={`${visible ? "Hide" : "Show"} ${fieldName}`} onMouseEnter={eyeIcon.onMouseEnter} onMouseLeave={eyeIcon.onMouseLeave} onClick={onToggle} sx={{ color: "var(--text-muted)", "&:hover": { color: "var(--brand)" } }}>{visible ? <EyeOff ref={eyeIcon.ref} size={18} duration={0.6} aria-hidden="true" /> : <Eye ref={eyeIcon.ref} size={18} duration={0.6} aria-hidden="true" />}</IconButton></InputAdornment> } }} />
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
    <AuthShell contentClassName="max-w-[560px]">
      <section aria-labelledby="register-title" className="w-full">
        <div className="text-center">
          <AuthMark className="mx-auto" />
          <h1 id="register-title" className="mt-4 text-[23px] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)]">Create your account</h1>
          <div className="mt-2 text-[13px] text-[var(--text-secondary)]">{step === 1 ? "Tell us who you are to get started." : "Now tell us a little about your business."}</div>
        </div>

        {step === 1 && <div className="mt-5"><GoogleButton label="Sign up with Google" /><div className="my-5 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-[var(--border-soft)]" /><span className="text-[10px] text-[var(--text-muted)]">Or continue with email</span><span className="h-px flex-1 bg-[var(--border-soft)]" /></div></div>}

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
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <RegistrationField id="firstName" label="First name" value={data.firstName} onChange={updateField} autoComplete="given-name" />
                <RegistrationField id="lastName" label="Last name" value={data.lastName} onChange={updateField} autoComplete="family-name" />
              </div>
              <RegistrationField id="workEmail" label="Work email" value={data.workEmail} onChange={updateField} type="email" autoComplete="email" />
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <PasswordField id="password" label="Password" value={data.password} visible={showPassword} onChange={updateField} onToggle={() => setShowPassword((visible) => !visible)} />
                <PasswordField id="confirmPassword" label="Confirm password" value={data.confirmPassword} visible={showConfirmPassword} onChange={updateField} onToggle={() => setShowConfirmPassword((visible) => !visible)} />
              </div>
              {error && <p role="alert" className="rounded-md bg-[var(--danger-soft)] px-3 py-2.5 text-center">{error}</p>}
              <Button type="submit" onMouseEnter={continueIcon.onMouseEnter} onMouseLeave={continueIcon.onMouseLeave} className="group h-12 w-full rounded-md text-sm font-semibold shadow-[0_6px_16px_rgba(4,63,41,.16)]">
                Continue
                <ArrowRight ref={continueIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <RegistrationField id="phone" label="Phone number" value={data.phone} onChange={updateField} type="tel" autoComplete="tel" />
                <RegistrationField id="companyName" label="Company name" value={data.companyName} onChange={updateField} autoComplete="organization" />
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <RegistrationField id="companyWebsite" label="Company website" value={data.companyWebsite} onChange={updateField} type="url" autoComplete="url" />
                <RegistrationField id="companyLocation" label="Company location" value={data.companyLocation} onChange={updateField} autoComplete="address-level2" />
              </div>
              <div>
                <label htmlFor="annualRevenue" className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Annual revenue</label>
                <Select required value={data.annualRevenue} onValueChange={(value) => updateField("annualRevenue", value)}>
                  <SelectTrigger id="annualRevenue" aria-label="Annual revenue" onMouseEnter={revenueIcon.onMouseEnter} onMouseLeave={revenueIcon.onMouseLeave} onFocus={revenueIcon.onMouseEnter} onBlur={revenueIcon.onMouseLeave} className="group/input h-12 border-[var(--border-strong)] px-3.5 shadow-[0_1px_2px_rgba(4,45,29,.03)] focus:shadow-[0_0_0_3px_rgba(21,150,106,.12)]">
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
              {error && <p role="alert" className="rounded-md bg-[var(--danger-soft)] px-3 py-2.5 text-center">{error}</p>}
              <div className="grid grid-cols-[112px_1fr] gap-3">
                <Button type="button" variant="outline" disabled={submitting} onMouseEnter={backIcon.onMouseEnter} onMouseLeave={backIcon.onMouseLeave} onClick={() => setStep(1)} className="h-12 rounded-md text-sm font-semibold">
                  <ChevronLeft ref={backIcon.ref} size={16} duration={0.55} className="mr-1" aria-hidden="true" />
                  Back
                </Button>
                <Button type="submit" disabled={submitting} aria-busy={submitting} onMouseEnter={completeIcon.onMouseEnter} onMouseLeave={completeIcon.onMouseLeave} className="h-12 rounded-md text-sm font-semibold shadow-[0_6px_16px_rgba(4,63,41,.16)]">{submitting ? "Creating account…" : "Create account"}<Check ref={completeIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" /></Button>
              </div>
            </div>
          )}
        </form>

        <div className="mt-5 text-center text-[12px] text-[var(--text-secondary)]">Already have an account? <Link to="/login" className="font-semibold text-[var(--brand)] underline decoration-[var(--green-300)] underline-offset-3 hover:text-[var(--brand-hover)]">Log in</Link></div>
      </section>
    </AuthShell>
  );
}
