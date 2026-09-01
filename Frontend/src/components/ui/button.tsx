import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("interakt-button inline-flex touch-manipulation select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-[.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--gray-100)] disabled:text-[var(--text-disabled)] disabled:opacity-100", {
  variants: { variant: { default: "bg-[var(--brand)] text-white shadow-[0_1px_2px_rgba(16,24,20,.04)]", ghost: "text-[#47554f]", outline: "border border-[var(--border-strong)] bg-white text-[#34443d]" }, size: { default: "h-10 px-4 py-2", sm: "h-10 px-3", icon: "size-10" } },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean; }
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  const [pressed, setPressed] = React.useState(false);
  const release = () => setPressed(false);
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!props.disabled && event.button === 0) setPressed(true);
    props.onPointerDown?.(event);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!props.disabled && (event.key === "Enter" || event.key === " ")) setPressed(true);
    props.onKeyDown?.(event);
  };
  return <Comp className={cn(buttonVariants({ variant, size, className }))} data-pressed={pressed || undefined} data-variant={variant ?? "default"} ref={ref} {...props} onBlur={(event) => { release(); props.onBlur?.(event); }} onKeyDown={handleKeyDown} onKeyUp={(event) => { release(); props.onKeyUp?.(event); }} onPointerCancel={(event) => { release(); props.onPointerCancel?.(event); }} onPointerDown={handlePointerDown} onPointerLeave={(event) => { release(); props.onPointerLeave?.(event); }} onPointerUp={(event) => { release(); props.onPointerUp?.(event); }} />;
});
Button.displayName = "Button";
export { Button, buttonVariants };
