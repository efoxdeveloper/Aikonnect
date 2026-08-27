import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { cn } from "@/lib/utils";

export function InternationalPhoneInput({ id, value, onChange, required, className }: { id: string; value: string; onChange: (phone: string) => void; required?: boolean; className?: string }) {
  return <PhoneInput defaultCountry="in" preferredCountries={["in"]} forceDialCode value={value} onChange={onChange} required={required} placeholder="Phone number" className={cn("interakt-phone-input w-full", className)} inputClassName="min-w-0 flex-1" inputProps={{ id, "aria-label": "Phone number", autoComplete: "tel", minLength: 7 }} />;
}
