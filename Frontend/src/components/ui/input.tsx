import * as React from "react";
import { cn } from "@/lib/utils";
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => <input type={type} className={cn("flex h-11 w-full rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#a3a3a3] focus-visible:border-[var(--brand-accent)] focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]/10 disabled:cursor-not-allowed disabled:bg-[var(--gray-100)] disabled:text-[var(--text-disabled)]", className)} ref={ref} {...props} />);
Input.displayName = "Input";
export { Input };
