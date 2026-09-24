import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon as ArrowLeft, ArrowRightIcon as ArrowRight, CheckIcon as Check, LoaderCircleIcon as LoaderCircle } from "@animateicons/react/lucide";
import { Step, StepLabel, Stepper } from "@mui/material";
import { Code2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { siFacebook, siGooglesheets, siRazorpay, siShopify, siWhatsapp, siXendit, type SimpleIcon } from "simple-icons";
import { AuthMark } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { clearWorkspaceOnboardingPrompt, getActiveMembership } from "@/lib/workspace";

type Channel = "whatsapp" | "instagram" | "both";
type Objective = "automated-notifications" | "chat-support-automation" | "bulk-campaigns" | "click-to-whatsapp-ads" | "whatsapp-forms" | "other-reasons";
type Integration = "apis-webhooks" | "shopify" | "google-sheets" | "facebook-lead-form" | "whatsapp-pay" | "razorpay" | "payu" | "aspire" | "xendit" | "cashfree";
type YesNo = "yes" | "no";

type OnboardingData = {
  channel?: Channel;
  state?: string;
  whatsappUpdatesConsent?: boolean;
  termsAccepted?: boolean;
  captchaCompleted?: boolean;
  industry?: string;
  industrySubcategory?: string;
  objectives: Objective[];
  integrations: Integration[];
  metaBusinessManager?: YesNo;
  usedWhatsAppApi?: YesNo;
};

type OnboardingResponse = {
  name: string;
  companyName: string | null;
  country: string | null;
  timezone: string | null;
  onboardingStep: number;
  data: Partial<OnboardingData>;
};

const steps = ["Industry", "Objectives", "Integrations", "Readiness"];
const countries = ["India", "United Arab Emirates", "Singapore", "United Kingdom", "United States", "Australia", "Canada", "Germany", "Indonesia", "Malaysia"];
const industries = [["marketing-advertising", "Marketing & Advertising"], ["retail", "Retail"], ["education", "Education"], ["entertainment-social-media-gaming", "Entertainment, Social Media & Gaming"], ["finance", "Finance"], ["healthcare", "Healthcare"], ["public-utilities-non-profits", "Public Utilities & Non-Profits"], ["professional-services", "Professional Services"], ["technology", "Technology"], ["travel-hospitality", "Travel & Hospitality"], ["automotive", "Automotive"], ["real-estate-construction", "Real Estate & Construction"], ["restaurants", "Restaurants"], ["manufacturing-impex", "Manufacturing & Impex"], ["fitness-wellness", "Fitness & Wellness"]] as const;
const subcategoriesByIndustry: Record<string, readonly string[]> = {
  "marketing-advertising": ["Digital marketing agency", "Advertising & media", "Public relations", "Market research", "Other"],
  retail: ["D2C / online store", "E-commerce marketplace", "Physical retail", "Grocery & food", "Other"],
  education: ["School / college", "Coaching & training", "EdTech", "Professional training", "Other"],
  "entertainment-social-media-gaming": ["Media & publishing", "Gaming", "Events & experiences", "Creator / influencer", "Other"],
  finance: ["Banking", "Lending", "Insurance", "Investment & wealth", "Other"],
  healthcare: ["Hospital / clinic", "Diagnostics", "Pharmacy", "Wellness", "Other"],
  "public-utilities-non-profits": ["Government / public services", "Non-profit / NGO", "Utilities", "Social impact", "Other"],
  "professional-services": ["Consulting", "Legal & accounting", "Agency", "Recruitment", "Other"],
  technology: ["SaaS / software", "IT services", "B2B services", "Developer tools", "Other"],
  "travel-hospitality": ["Travel agency", "Hotel / hospitality", "Tours & experiences", "Transport", "Other"],
  automotive: ["Dealership", "Auto services", "Parts & accessories", "Rentals", "Other"],
  "real-estate-construction": ["Residential property", "Commercial property", "Construction", "Architecture & interiors", "Other"],
  restaurants: ["Restaurant / cafe", "Cloud kitchen", "Catering", "Food delivery", "Other"],
  "manufacturing-impex": ["Industrial goods", "Consumer goods", "Electronics", "Export / import", "Other"],
  "fitness-wellness": ["Gym / studio", "Sports academy", "Wellness", "Personal trainer", "Other"],
};
const objectives: Array<[Objective, string, string]> = [
  ["automated-notifications", "Send Project Updates & Technical Alerts", "WhatsApp Automated Notifications"],
  ["chat-support-automation", "Handle Technical Support & Queries", "WhatsApp Chat Automation"],
  ["bulk-campaigns", "Promote Software Solutions & IT Services", "WhatsApp Bulk Campaigns"],
  ["click-to-whatsapp-ads", "Generate Software Development Leads", "Click to WhatsApp Ads"],
  ["whatsapp-forms", "Collect Technical Requirements & Project Details", "WhatsApp Forms"],
  ["other-reasons", "Other Reasons", "If you wish to do something else"],
];
const completionMessages = ["Preparing your workspace", "Getting things ready", "Setting up your Marento experience", "Almost there"];
type IntegrationOption = { value: Integration; label: string; icon: SimpleIcon | null; group: "custom" | "popular" | "payment" };
const integrations: IntegrationOption[] = [
  { value: "apis-webhooks", label: "Interakt APIs & Webhooks", icon: null, group: "custom" },
  { value: "shopify", label: "Shopify", icon: siShopify, group: "popular" },
  { value: "google-sheets", label: "Google Sheets", icon: siGooglesheets, group: "popular" },
  { value: "facebook-lead-form", label: "Facebook Lead Form", icon: siFacebook, group: "popular" },
  { value: "whatsapp-pay", label: "WhatsApp Pay", icon: siWhatsapp, group: "payment" },
  { value: "razorpay", label: "Razorpay", icon: siRazorpay, group: "payment" },
  { value: "payu", label: "PayU", icon: null, group: "payment" },
  { value: "aspire", label: "Aspire", icon: null, group: "payment" },
  { value: "xendit", label: "Xendit", icon: siXendit, group: "payment" },
  { value: "cashfree", label: "Cashfree", icon: null, group: "payment" },
];

const emptyData: OnboardingData = { objectives: [], integrations: [] };

function ChoiceCard({ selected, label, onClick, disabled = false }: { selected: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" aria-pressed={selected} disabled={disabled} onClick={onClick} className={`flex min-h-12 items-center justify-between rounded-md border px-3.5 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-[var(--brand)] bg-[var(--brand-soft)] font-semibold text-[var(--brand)]" : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--brand)]/40 hover:bg-[var(--surface-subtle)]"}`}><span>{label}</span>{selected && <Check size={16} aria-hidden="true" />}</button>;
}

function IndustryChip({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`rounded-md border px-3 py-2 text-left text-[13px] transition-colors ${selected ? "border-[var(--brand)] bg-[var(--brand-soft)] font-semibold text-[var(--brand)]" : "border-[#cbd5e5] bg-white text-[#536d9f] hover:border-[var(--brand)]/50 hover:bg-[var(--surface-subtle)]"}`}>{label}</button>;
}

function ObjectiveCard({ selected, title, description, onClick, disabled = false }: { selected: boolean; title: string; description: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" aria-pressed={selected} disabled={disabled} onClick={onClick} className={`relative flex min-h-[88px] flex-col items-start justify-between rounded-xl border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--border)] bg-white hover:border-[var(--brand)]/50 hover:bg-[var(--surface-subtle)]"}`}><span className="pr-7"><span className={`block text-[14px] font-semibold leading-5 ${selected ? "text-[var(--brand)]" : "text-[var(--text-primary)]"}`}>{title}</span><span className="mt-1 block text-xs leading-4 text-[#6680b5]">{description}</span></span><span aria-hidden="true" className={`absolute right-3.5 top-3.5 flex size-4 items-center justify-center rounded-[3px] border ${selected ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[#c8d2e6] bg-white"}`}>{selected && <Check size={12} />}</span></button>;
}

function BrandLogo({ icon, size = 22 }: { icon: SimpleIcon; size?: number }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width={size} height={size} fill={`#${icon.hex}`} xmlns="http://www.w3.org/2000/svg"><path d={icon.path} /></svg>;
}

function IntegrationCard({ option, selected, onClick }: { option: IntegrationOption; selected: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`flex min-h-[68px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${selected ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[#cbd5e5] bg-white hover:border-[var(--brand)]/50 hover:bg-[var(--surface-subtle)]"}`}><span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#f1f4f8]">{option.icon ? <BrandLogo icon={option.icon} size={22} /> : <Code2 size={20} className="text-amber-500" aria-hidden="true" />}</span><span className={`min-w-0 flex-1 text-[14px] font-medium leading-5 ${selected ? "text-[var(--brand)]" : "text-[var(--text-primary)]"}`}>{option.label}</span><span aria-hidden="true" className={`flex size-4 shrink-0 items-center justify-center rounded-[3px] border ${selected ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[#c8d2e6] bg-white"}`}>{selected && <Check size={12} />}</span></button>;
}

function RadioOption({ name, label, selected, onChange }: { name: string; label: string; selected: boolean; onChange: () => void }) {
  return <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]"><input type="radio" name={name} checked={selected} onChange={onChange} className="peer sr-only" /><span aria-hidden="true" className={`flex size-5 items-center justify-center rounded-full border transition-colors ${selected ? "border-[var(--brand)]" : "border-[#8a8f94]"}`}><span className={`size-2.5 rounded-full bg-[var(--brand)] transition-transform ${selected ? "scale-100" : "scale-0"}`} /></span><span>{label}</span></label>;
}

export function Onboarding() {
  const navigate = useNavigate();
  const { accessToken, refreshUser, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const [workspace, setWorkspace] = useState<OnboardingResponse | null>(null);
  const [data, setData] = useState<OnboardingData>(emptyData);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completionPreview, setCompletionPreview] = useState(false);
  const [completionMessageIndex, setCompletionMessageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const country = workspace?.country ?? "India";
  const timezone = workspace?.timezone ?? (country === "India" ? "Asia/Kolkata" : "UTC");
  const progress = Math.round((step / (steps.length - 1)) * 100);
  const selectedObjectives = useMemo(() => new Set(data.objectives), [data.objectives]);
  const selectedIntegrations = useMemo(() => new Set(data.integrations), [data.integrations]);
  const availableSubcategories = subcategoriesByIndustry[data.industry ?? ""] ?? ["Other"];

  useEffect(() => {
    if (!workspaceId || !accessToken) return;
    let mounted = true;
    void apiRequest<OnboardingResponse>(`/workspaces/${workspaceId}/onboarding`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((result) => {
        if (!mounted) return;
        setWorkspace(result);
        setStep(Math.min(Math.max(result.onboardingStep, 0), steps.length - 1));
        setData({ ...emptyData, ...result.data, objectives: result.data.objectives ?? [], integrations: result.data.integrations ?? [] });
      })
      .catch((caughtError) => setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load your onboarding progress."))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [accessToken, workspaceId]);

  useEffect(() => {
    if (!completionPreview) return;
    const interval = window.setInterval(() => setCompletionMessageIndex((current) => (current + 1) % completionMessages.length), 600);
    return () => window.clearInterval(interval);
  }, [completionPreview]);

  const updateData = <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setError(null);
    setData((current) => ({ ...current, [key]: value }));
  };

  const selectIndustry = (industry: string) => {
    setError(null);
    setData((current) => ({ ...current, industry, industrySubcategory: undefined }));
  };

  const saveProgress = async (nextStep: number, nextData = data) => {
    if (!workspaceId || !accessToken) return false;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/onboarding`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ step: nextStep, data: nextData }),
      });
      setData(nextData);
      setStep(nextStep);
      return true;
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save your progress. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!workspaceId || !accessToken || !workspace) return;
    const previewStartedAt = performance.now();
    setSaving(true);
    setCompletionMessageIndex(0);
    setCompletionPreview(true);
    setError(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/onboarding/complete`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: workspace.name, country, timezone, ...data }),
      });
      await refreshUser();
      const remainingPreviewTime = Math.max(0, 2000 - (performance.now() - previewStartedAt));
      if (remainingPreviewTime > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remainingPreviewTime));
      clearWorkspaceOnboardingPrompt(workspaceId);
      navigate("/dashboard", { replace: true });
    } catch (caughtError) {
      setCompletionPreview(false);
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to complete onboarding. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  async function next() {
    if (step === 0 && (!data.industry || !data.industrySubcategory)) return setError("Select your industry and a sub-category to continue.");
    if (step === 1 && data.objectives.length === 0) return setError("Choose at least one business objective.");
    if (step === steps.length - 1) return finish();
    await saveProgress(step + 1, data);
  }

  if (loading) return <main className="flex min-h-dvh items-center justify-center bg-[var(--page-background)]"><LoaderCircle className="animate-spin text-[var(--brand)]" size={28} aria-label="Loading onboarding" /></main>;
  if (!membership || !workspaceId || !accessToken || !workspace) return <main className="flex min-h-dvh items-center justify-center bg-[var(--page-background)] px-5"><p role="alert" className="text-sm text-[var(--danger)]">{error ?? "No workspace is available for onboarding."}</p></main>;
  if (completionPreview) return <main className="flex h-dvh items-center justify-center overflow-hidden bg-[var(--page-background)] px-5"><section className="flex flex-col items-center text-center" role="status" aria-live="polite"><AuthMark className="size-12 rounded-xl" /><p key={completionMessages[completionMessageIndex]} className="onboarding-preview-text mt-6 text-lg font-semibold text-[var(--text-primary)]">{completionMessages[completionMessageIndex]}</p><p className="mt-2 text-sm text-[var(--text-secondary)]">Your workspace is almost ready.</p><div className="mt-6 flex gap-1.5" aria-hidden="true"><span className="size-2 animate-pulse rounded-full bg-[var(--brand)]" /><span className="size-2 animate-pulse rounded-full bg-[var(--brand)] [animation-delay:150ms]" /><span className="size-2 animate-pulse rounded-full bg-[var(--brand)] [animation-delay:300ms]" /></div></section></main>;

  return <main className="h-dvh min-h-0 overflow-y-auto bg-[var(--page-background)] px-4 py-2 sm:px-8 sm:py-4">
    <div className="mx-auto w-full max-w-[1080px]">
      <section className="mt-2 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-white shadow-[0_12px_36px_rgba(4,45,29,.08)]">
        <div className="border-b border-[var(--border-soft)] px-4 py-3 sm:px-6 sm:py-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">Let&apos;s set up your workspace</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">A few quick answers help us tailor Marento to your business.</p></div><div className="flex shrink-0 items-start gap-3"><span className="pt-1 text-xs font-medium text-[var(--text-muted)]">Step {step + 1} of {steps.length}</span><AuthMark className="size-9 rounded-lg" /></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--gray-100)]"><div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-300" style={{ width: `${progress}%` }} /></div></div>
        <div className="overflow-x-auto px-4 pt-3 sm:px-6"><Stepper activeStep={step} alternativeLabel className="min-w-[680px]" sx={{ "& .MuiStepLabel-label": { fontSize: "0.72rem", fontWeight: 600 }, "& .MuiStepIcon-root.Mui-active, & .MuiStepIcon-root.Mui-completed": { color: "var(--brand)" }, "& .MuiStepConnector-line": { borderColor: "var(--border)" } }}>{steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper></div>
        <div className="grid gap-6 px-4 py-5 sm:px-8 sm:py-6 lg:grid-cols-[minmax(0,1fr)_250px]">
          <div className="flex min-h-[420px] min-w-0 flex-col sm:min-h-[440px]">
            <div className="flex-1">
            {step === 0 && <><p className="text-xs font-semibold text-[var(--brand)]">Let&apos;s Get Started!</p><h2 className="mt-1 text-[19px] font-semibold text-[var(--text-primary)]">Which industry does your business belong to?</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">We&apos;ll accordingly personalise your experience.</p><div className="mt-5 flex flex-wrap gap-2.5">{industries.map(([value, label]) => <IndustryChip key={value} selected={data.industry === value} label={label} onClick={() => selectIndustry(value)} />)}</div><div className="mt-5"><label htmlFor="onboarding-subcategory" className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Sub-category</label><Select value={data.industrySubcategory ?? ""} onValueChange={(value) => updateData("industrySubcategory", value)}><SelectTrigger id="onboarding-subcategory" aria-label="Sub-category" className="h-12"><SelectValue placeholder={data.industry ? "Select a sub-category" : "Select an industry first"} /></SelectTrigger><SelectContent>{availableSubcategories.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></>}
            {step === 1 && <><h2 className="text-[19px] font-semibold text-[var(--text-primary)]">What are your business objectives?</h2><p className="mt-1.5 text-sm text-[var(--text-secondary)]">Choose up to 3 objectives and we&apos;ll help you achieve them quickly.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{objectives.map(([value, title, description]) => <ObjectiveCard key={value} selected={selectedObjectives.has(value)} disabled={!selectedObjectives.has(value) && data.objectives.length >= 3} title={title} description={description} onClick={() => updateData("objectives", selectedObjectives.has(value) ? data.objectives.filter((item) => item !== value) : [...data.objectives, value])} />)}</div><p className="mt-3 text-xs text-[var(--text-muted)]">{data.objectives.length}/3 selected</p></>}
            {step === 2 && <><h2 className="text-[19px] font-semibold text-[var(--text-primary)]">Looking to integrate with a software tool?</h2><p className="mt-1.5 text-sm text-[var(--text-secondary)]">You can connect Marento to tools used by your team.</p><div className="mt-5"><p className="text-sm font-semibold text-[#36537f]">Custom Integration</p><div className="mt-2 max-w-[292px]">{integrations.filter(({ group }) => group === "custom").map((option) => <IntegrationCard key={option.value} option={option} selected={selectedIntegrations.has(option.value)} onClick={() => updateData("integrations", selectedIntegrations.has(option.value) ? data.integrations.filter((item) => item !== option.value) : [...data.integrations, option.value])} />)}</div></div><div className="mt-4"><p className="text-sm font-semibold text-[#36537f]">Popular Tools</p><div className="mt-2 grid gap-2.5 sm:grid-cols-3">{integrations.filter(({ group }) => group === "popular").map((option) => <IntegrationCard key={option.value} option={option} selected={selectedIntegrations.has(option.value)} onClick={() => updateData("integrations", selectedIntegrations.has(option.value) ? data.integrations.filter((item) => item !== option.value) : [...data.integrations, option.value])} />)}</div></div><div className="mt-4"><p className="text-sm font-semibold text-[#36537f]">Payment Provider</p><div className="mt-2 grid gap-2.5 sm:grid-cols-3">{integrations.filter(({ group }) => group === "payment").map((option) => <IntegrationCard key={option.value} option={option} selected={selectedIntegrations.has(option.value)} onClick={() => updateData("integrations", selectedIntegrations.has(option.value) ? data.integrations.filter((item) => item !== option.value) : [...data.integrations, option.value])} />)}</div></div></>}
            {step === 3 && <><h2 className="text-[19px] font-semibold text-[var(--text-primary)]">A Few Quick Checks Before We Begin</h2><p className="mt-1.5 text-sm text-[var(--text-secondary)]">Help us understand your current setup to get you started faster.</p><div className="mt-7 space-y-12"><fieldset><legend className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Do you have a Facebook Business Manager account?</legend><div className="flex gap-8"><RadioOption name="meta-business-manager" label="Yes" selected={data.metaBusinessManager === "yes"} onChange={() => updateData("metaBusinessManager", "yes")} /><RadioOption name="meta-business-manager" label="No" selected={data.metaBusinessManager === "no"} onChange={() => updateData("metaBusinessManager", "no")} /></div></fieldset><fieldset><legend className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Have you used a WhatsApp API number previously?</legend><div className="flex gap-8"><RadioOption name="used-whatsapp-api" label="Yes" selected={data.usedWhatsAppApi === "yes"} onChange={() => updateData("usedWhatsAppApi", "yes")} /><RadioOption name="used-whatsapp-api" label="No" selected={data.usedWhatsAppApi === "no"} onChange={() => updateData("usedWhatsAppApi", "no")} /></div></fieldset></div></>}
            {error && <p role="alert" className="mt-5 rounded-md bg-[var(--danger-soft)] px-3 py-2.5 text-sm text-[var(--danger)]">{error}</p>}
            </div>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button type="button" variant="outline" disabled={saving || step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} className="h-11 text-sm"><ArrowLeft size={16} aria-hidden="true" />Back</Button><div className="flex gap-3 sm:ml-auto"><Button type="button" variant="outline" disabled={saving || ![2, 3].includes(step)} onClick={() => void saveProgress(step + 1)} className="h-11 text-sm">Skip</Button><Button type="button" disabled={saving} onClick={() => void next()} className="h-11 min-w-32 text-sm">{saving ? <LoaderCircle className="animate-spin" size={16} aria-label="Saving" /> : step === steps.length - 1 ? "Finish setup" : "Continue"}<ArrowRight size={16} aria-hidden="true" /></Button></div></div>
          </div>
          <aside className="hidden rounded-lg bg-[var(--surface-subtle)] p-5 lg:block"><div className="aspect-video overflow-hidden rounded-lg bg-black"><iframe className="h-full w-full" src="https://www.youtube.com/embed/59fdY8aGPDE?si=1m8QpGckk1EZvDFH" title="Marento onboarding introduction" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div><h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">Get started with Marento</h3><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Watch this quick introduction to learn how to set up your workspace and connect the tools your team uses.</p><ul className="mt-4 space-y-2.5 text-xs leading-4 text-[var(--text-secondary)]"><li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden="true" />Tell us about your business</li><li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden="true" />Choose your business objectives</li><li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden="true" />Connect the tools your team uses</li><li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden="true" />Complete your setup checks</li></ul></aside>
        </div>
      </section>
    </div>
  </main>;
}
