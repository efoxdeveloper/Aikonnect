import * as React from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/20 disabled:cursor-not-allowed disabled:opacity-55",
        checked ? "bg-[var(--success)]" : "bg-[#aeb3b8]",
        className,
      )}
      {...props}
    >
      <span className={cn("pointer-events-none block size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(30,40,55,.25)] transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  ),
);
Switch.displayName = "Switch";

export { Switch };
