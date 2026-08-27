import * as React from "react";
import { cn } from "@/lib/utils";
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => <input type={type} className={cn("flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--brand)]/20", className)} ref={ref} {...props} />);
Input.displayName = "Input";
export { Input };
