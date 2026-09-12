import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { cn } from "@/lib/utils";

export function InternationalPhoneInput({ id, value, onChange, required, className, ariaInvalid, ariaDescribedBy }: { id: string; value: string; onChange: (phone: string) => void; required?: boolean; className?: string; ariaInvalid?: boolean; ariaDescribedBy?: string }) {
  return <PhoneInput defaultCountry="in" preferredCountries={["in"]} forceDialCode value={value} onChange={onChange} required={required} placeholder="Phone number" className={cn("interakt-phone-input w-full", className)} inputClassName={cn("min-w-0 flex-1", ariaInvalid && "border-[var(--danger)] focus:border-[var(--danger)] focus:ring-red-500/20")} inputProps={{ id, "aria-label": "Phone number", "aria-invalid": ariaInvalid || undefined, "aria-describedby": ariaDescribedBy, autoComplete: "tel", minLength: 7 }} />;
}
