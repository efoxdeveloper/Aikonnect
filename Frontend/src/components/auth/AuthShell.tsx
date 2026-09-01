import { useEffect, useState, type ReactNode } from "react";
import { MessageSquareMore, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  children: ReactNode;
  contentClassName?: string;
};

const authSlides = [
  {
    image: "/images/auth-side-visual-1.png",
    quote: "Keep every customer conversation moving with one clear, shared inbox.",
    title: "Customer operations, simplified",
    detail: "Unified inbox · Team collaboration · Faster replies",
  },
  {
    image: "/images/auth-side-visual-2.png",
    quote: "Turn repeatable work into reliable workflows your team can trust.",
    title: "Automation that scales",
    detail: "Triggers · Actions · Consistent customer journeys",
  },
  {
    image: "/images/auth-side-visual-3.png",
    quote: "See the signals that matter and make the next customer action count.",
    title: "Clarity for every decision",
    detail: "Insights · Team performance · Confident follow-through",
  },
];

export function AuthMark({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex size-11 items-center justify-center rounded-xl bg-[var(--green-900)] text-white shadow-[0_6px_16px_rgba(4,63,41,.18)]", className)} aria-hidden="true">
      <MessageSquareMore className="size-6" strokeWidth={2.2} />
      <Sparkles className="absolute right-1.5 top-1.5 size-2.5 text-[var(--green-300)]" strokeWidth={2.5} />
    </div>
  );
}

export function AuthShell({ children, contentClassName }: AuthShellProps) {
  const [visualIndex, setVisualIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisualIndex((index) => (index + 1) % authSlides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="h-dvh overflow-hidden bg-zinc-100 p-0 sm:p-4 lg:p-6" data-testid="auth-shell">
      <div className="mx-auto grid h-full w-full max-w-[1440px] overflow-hidden bg-white shadow-[0_20px_60px_rgba(4,45,29,.10)] sm:rounded-2xl sm:border sm:border-[var(--border)] lg:grid-cols-[minmax(0,1.02fr)_minmax(480px,.98fr)] lg:gap-1.5 lg:bg-zinc-100 lg:p-1.5">
        <section className="flex min-h-0 min-w-0 flex-col bg-white lg:order-2 lg:rounded-xl" aria-label="Account access">
          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="auth-form-scroll-region">
            <div className="flex min-h-full items-center justify-center px-5 py-8 sm:px-10 sm:py-10 lg:px-14">
              <div className={cn("auth-card w-full max-w-[420px]", contentClassName)}>{children}</div>
            </div>
          </div>
          <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-[var(--border-soft)] px-5 py-4 text-[11px] text-[var(--text-muted)] sm:border-t-0">
            <a href="#terms" className="rounded-sm underline decoration-[var(--green-300)] underline-offset-4 transition-colors hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]/30">Terms of Service</a>
            <span aria-hidden="true">·</span>
            <a href="#privacy" className="rounded-sm underline decoration-[var(--green-300)] underline-offset-4 transition-colors hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]/30">Privacy Policy</a>
          </footer>
        </section>

        <aside className="relative hidden min-h-0 overflow-hidden bg-[var(--green-900)] lg:order-1 lg:flex lg:rounded-xl" aria-label="Interakt product preview">
          <img key={authSlides[visualIndex].image} src={authSlides[visualIndex].image} alt="" className="auth-visual absolute inset-0 size-full object-cover object-top" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,63,41,.05)_25%,rgba(4,63,41,.22)_54%,rgba(4,45,29,.94)_100%)]" />
          <div className="relative z-10 flex min-h-0 w-full flex-col justify-end px-10 pb-11 pt-10 xl:px-14 xl:pb-14">
            <div key={visualIndex} className="auth-copy max-w-[520px] text-white" aria-live="polite">
              <div className="mb-5 flex size-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold shadow-[0_8px_24px_rgba(0,0,0,.16)] backdrop-blur-md">IA</div>
              <blockquote className="text-[23px] font-medium leading-[1.35] tracking-[-0.025em] text-white xl:text-[27px]">
                “{authSlides[visualIndex].quote}”
              </blockquote>
              <div className="mt-6 text-sm font-semibold text-white">{authSlides[visualIndex].title}</div>
              <div className="mt-1 text-xs text-white/65">{authSlides[visualIndex].detail}</div>
              <div className="mt-7 flex items-center gap-1.5" aria-label="Product preview slides">
                {authSlides.map((slide, index) => (
                  <button
                    key={slide.image}
                    type="button"
                    aria-label={`Show product preview ${index + 1}`}
                    aria-pressed={visualIndex === index}
                    onClick={() => setVisualIndex(index)}
                    className={cn("h-1.5 rounded-full transition-[width,background-color,opacity] duration-200", visualIndex === index ? "w-5 bg-white" : "w-1.5 bg-white/30 hover:bg-white/60")}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
