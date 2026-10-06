export function BillingShell({ children }: { children: React.ReactNode }) {
  return <div data-testid="billing-shell" className="h-full min-h-0 overflow-hidden bg-[var(--page-background)]">{children}</div>;
}
