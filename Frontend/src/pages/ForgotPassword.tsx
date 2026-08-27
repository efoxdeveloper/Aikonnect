import { useState, type FormEvent } from "react";
import { ArrowLeftIcon as ArrowLeft, CircleCheckIcon as CircleCheck, MailIcon as Mail, MessageSquareIcon as MessageSquare, SendIcon as Send, SparklesIcon as Sparkles } from "@animateicons/react/lucide";
import { Link } from "react-router-dom";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const logoIcon = useAnimatedIcon();
  const sparkleIcon = useAnimatedIcon();
  const mailIcon = useAnimatedIcon();
  const sendIcon = useAnimatedIcon();
  const successIcon = useAnimatedIcon();
  const backIcon = useAnimatedIcon();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <main className="relative isolate flex h-dvh items-center justify-center overflow-hidden bg-[#e8f6f7] px-4 py-8 sm:px-6 sm:py-10">
      <img src="/images/auth-background.png" alt="" className="absolute inset-0 -z-20 size-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.18),transparent_54%)]" />
      <div className="pointer-events-none absolute left-[8%] top-[13%] size-36 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[8%] right-[8%] size-44 rounded-full bg-[#8fd9dc]/20 blur-3xl" />

      <section aria-labelledby="forgot-password-title" className="auth-card relative w-full max-w-[460px] rounded-sm border border-white/85 bg-white/90 px-6 pb-8 pt-[62px] shadow-[0_16px_42px_rgba(30,72,86,.10),0_4px_14px_rgba(17,107,111,.05),inset_0_1px_0_rgba(255,255,255,.95)] backdrop-blur-xl sm:px-10 sm:pb-9">
        <div onMouseEnter={() => { logoIcon.onMouseEnter(); sparkleIcon.onMouseEnter(); }} onMouseLeave={() => { logoIcon.onMouseLeave(); sparkleIcon.onMouseLeave(); }} className="auth-logo absolute left-1/2 top-0 flex size-[86px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[linear-gradient(145deg,#167a7f,#0b5f64)] text-white">
          <MessageSquare ref={logoIcon.ref} size={40} duration={0.7} aria-hidden="true" />
          <Sparkles ref={sparkleIcon.ref} size={14} duration={0.65} className="absolute right-3 top-3 text-[#a9edf0]" aria-hidden="true" />
        </div>

        {!submitted ? (
          <div className="auth-step">
            <div className="text-center">
              <h1 id="forgot-password-title" className="text-2xl font-semibold tracking-[-0.035em] text-[#145f64] sm:text-[26px]">Forgot your password?</h1>
              <p className="mx-auto mt-2">Enter your work email and we’ll send you a secure password recovery link.</p>
            </div>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="recovery-email" className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Work email</label>
                <div onMouseEnter={mailIcon.onMouseEnter} onMouseLeave={mailIcon.onMouseLeave} onFocus={mailIcon.onMouseEnter} onBlur={mailIcon.onMouseLeave} className="group/input flex h-12 items-center rounded-md border border-[#d6dce0] bg-white px-3.5 shadow-[0_1px_2px_rgba(31,42,55,.03)] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_rgba(17,107,111,.10)]">
                  <Mail ref={mailIcon.ref} size={18} duration={0.7} className="mr-3 shrink-0 text-[var(--text-muted)] transition-colors group-focus-within/input:text-[var(--brand)]" aria-hidden="true" />
                  <input id="recovery-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[var(--text-primary)] outline-none" />
                </div>
              </div>

              <button type="submit" onMouseEnter={sendIcon.onMouseEnter} onMouseLeave={sendIcon.onMouseLeave} className="flex h-12 w-full items-center justify-center rounded-md bg-[linear-gradient(135deg,#15777c,#0d6267)] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(17,107,111,.20)] transition-[transform,box-shadow,filter] duration-150 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_14px_28px_rgba(17,107,111,.25)] active:translate-y-0 active:scale-[.99]">
                Send recovery link
                <Send ref={sendIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" />
              </button>
            </form>
          </div>
        ) : (
          <div className="auth-step text-center" aria-live="polite">
            <div onMouseEnter={successIcon.onMouseEnter} onMouseLeave={successIcon.onMouseLeave} className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
              <CircleCheck ref={successIcon.ref} size={32} duration={0.65} aria-hidden="true" />
            </div>
            <h1 id="forgot-password-title" className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-[#145f64] sm:text-[26px]">Check your inbox</h1>
            <p className="mx-auto mt-3">We sent a password recovery link to <span className="font-semibold text-[var(--text-primary)]">{email}</span>.</p>
            <p className="mt-2">The link will expire shortly. Check your spam folder if you don’t see it.</p>
            <button type="button" onClick={() => setSubmitted(false)} onMouseEnter={sendIcon.onMouseEnter} onMouseLeave={sendIcon.onMouseLeave} className="mt-6 flex h-11 w-full items-center justify-center rounded-md border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--brand)] transition-[background-color,border-color] hover:border-[#b9cfd0] hover:bg-[var(--brand-soft)]">
              Send another link
              <Send ref={sendIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" />
            </button>
          </div>
        )}

        <Link to="/login" onMouseEnter={backIcon.onMouseEnter} onMouseLeave={backIcon.onMouseLeave} className="mt-6 flex items-center justify-center text-[13px] font-semibold text-[var(--brand)] transition-colors hover:text-[var(--brand-hover)]">
          <ArrowLeft ref={backIcon.ref} size={15} duration={0.55} className="mr-1.5" aria-hidden="true" />
          Back to login
        </Link>
      </section>
    </main>
  );
}
