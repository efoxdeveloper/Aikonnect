import { useState, type FormEvent } from "react";
import { ArrowRightIcon as ArrowRight, EyeIcon as Eye, EyeOffIcon as EyeOff, LockIcon as Lock, MailIcon as Mail, MessageSquareIcon as MessageSquare, SparklesIcon as Sparkles } from "@animateicons/react/lucide";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { getSafeRedirectPath } from "@/routes/AuthGuards";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoIcon = useAnimatedIcon();
  const sparkleIcon = useAnimatedIcon();
  const mailIcon = useAnimatedIcon();
  const lockIcon = useAnimatedIcon();
  const eyeIcon = useAnimatedIcon();
  const continueIcon = useAnimatedIcon();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
      const invitation = new URLSearchParams(location.search).get("invitation");
      navigate(invitation ? `/invitations/accept?token=${encodeURIComponent(invitation)}` : getSafeRedirectPath(location.state), { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative isolate flex h-dvh items-center justify-center overflow-hidden bg-[#e8f6f7] px-4 py-8 sm:px-6 sm:py-10">
      <img src="/images/auth-background.png" alt="" className="absolute inset-0 -z-20 size-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.18),transparent_54%)]" />
      <div className="pointer-events-none absolute left-[8%] top-[13%] size-36 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[8%] right-[8%] size-44 rounded-full bg-[#8fd9dc]/20 blur-3xl" />

      <section aria-labelledby="login-title" className="auth-card relative w-full max-w-[460px] rounded-sm border border-white/85 bg-white/90 px-6 pb-7 pt-[62px] shadow-[0_16px_42px_rgba(30,72,86,.10),0_4px_14px_rgba(17,107,111,.05),inset_0_1px_0_rgba(255,255,255,.95)] backdrop-blur-xl sm:px-10 sm:pb-9">
        <div onMouseEnter={() => { logoIcon.onMouseEnter(); sparkleIcon.onMouseEnter(); }} onMouseLeave={() => { logoIcon.onMouseLeave(); sparkleIcon.onMouseLeave(); }} className="auth-logo absolute left-1/2 top-0 flex size-[86px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[linear-gradient(145deg,#167a7f,#0b5f64)] text-white">
          <MessageSquare ref={logoIcon.ref} size={40} duration={0.7} aria-hidden="true" />
          <Sparkles ref={sparkleIcon.ref} size={14} duration={0.65} className="absolute right-3 top-3 text-[#a9edf0]" aria-hidden="true" />
        </div>

        <div className="text-center">
          <h1 id="login-title" className="text-2xl font-semibold tracking-[-0.035em] text-[#145f64] sm:text-[26px]">Login to your account</h1>
          <p className="mx-auto mt-2">Welcome back. Enter your details to continue to your Interakt workspace.</p>
        </div>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          <button type="button" className="flex h-12 w-full items-center justify-center rounded-md border border-[#d6dce0] bg-white px-4 text-sm font-semibold text-[var(--text-primary)] shadow-[0_2px_6px_rgba(31,42,55,.05)] transition-[transform,border-color,box-shadow,background-color] duration-150 hover:-translate-y-0.5 hover:border-[#b9c7cd] hover:bg-[#fbfcfc] hover:shadow-[0_6px_14px_rgba(31,42,55,.08)] active:translate-y-0 active:scale-[.99]">
            <svg xmlns="http://www.w3.org/2000/svg" height="19" viewBox="0 0 24 24" width="19" className="mr-2.5 shrink-0" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              <path d="M1 1h22v22H1z" fill="none" />
            </svg>
            Sign in with Google
          </button>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[10px] font-normal uppercase tracking-[0.12em] text-[var(--text-muted)]">or continue with email</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Email address</label>
            <div onMouseEnter={mailIcon.onMouseEnter} onMouseLeave={mailIcon.onMouseLeave} onFocus={mailIcon.onMouseEnter} onBlur={mailIcon.onMouseLeave} className="group/input flex h-12 items-center rounded-md border border-[#d6dce0] bg-white px-3.5 shadow-[0_1px_2px_rgba(31,42,55,.03)] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_rgba(17,107,111,.10)]">
              <Mail ref={mailIcon.ref} size={18} duration={0.7} className="mr-3 shrink-0 text-[var(--text-muted)] transition-colors group-focus-within/input:text-[var(--brand)]" aria-hidden="true" />
              <input id="email" name="email" type="email" autoComplete="email" required disabled={submitting} className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[var(--text-primary)] outline-none disabled:cursor-wait" />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="password" className="text-sm font-semibold text-[var(--text-primary)]">Password</label>
              <Link to="/forgot-password" className="rounded-md text-xs font-medium text-[var(--brand)] transition-colors hover:text-[var(--brand-hover)]">Forgot password?</Link>
            </div>
            <div onMouseEnter={lockIcon.onMouseEnter} onMouseLeave={lockIcon.onMouseLeave} onFocus={lockIcon.onMouseEnter} onBlur={lockIcon.onMouseLeave} className="group/input flex h-12 items-center rounded-md border border-[#d6dce0] bg-white px-3.5 shadow-[0_1px_2px_rgba(31,42,55,.03)] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_rgba(17,107,111,.10)]">
              <Lock ref={lockIcon.ref} size={18} duration={0.7} className="mr-3 shrink-0 text-[var(--text-muted)] transition-colors group-focus-within/input:text-[var(--brand)]" aria-hidden="true" />
              <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required disabled={submitting} className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[var(--text-primary)] outline-none disabled:cursor-wait" />
              <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onMouseEnter={eyeIcon.onMouseEnter} onMouseLeave={eyeIcon.onMouseLeave} onClick={() => setShowPassword((visible) => !visible)} className="ml-2 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]">
                {showPassword ? <EyeOff ref={eyeIcon.ref} size={18} duration={0.6} /> : <Eye ref={eyeIcon.ref} size={18} duration={0.6} />}
              </button>
            </div>
          </div>

          <label className="relative flex w-fit cursor-pointer items-center gap-2.5 text-[13px] text-[var(--text-secondary)]">
            <input type="checkbox" name="remember" className="peer size-4 appearance-none rounded-md border border-[#bdc5ca] bg-white checked:border-[var(--brand)] checked:bg-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/25" />
            <span className="pointer-events-none absolute ml-[3px] mt-[-1px] hidden text-[11px] font-bold leading-none text-white peer-checked:block">✓</span>
            Remember me
          </label>

          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2.5 text-center">{error}</p>}

          <button type="submit" disabled={submitting} aria-busy={submitting} onMouseEnter={continueIcon.onMouseEnter} onMouseLeave={continueIcon.onMouseLeave} className="group flex h-12 w-full items-center justify-center rounded-md bg-[linear-gradient(135deg,#15777c,#0d6267)] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(17,107,111,.20)] transition-[transform,box-shadow,filter] duration-150 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_14px_28px_rgba(17,107,111,.25)] active:translate-y-0 active:scale-[.99] disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0">
            {submitting ? "Signing in…" : "Continue"}
            <ArrowRight ref={continueIcon.ref} size={16} duration={0.55} className="ml-2" aria-hidden="true" />
          </button>
        </form>

        <p className="mt-6 text-center">New to Interakt? <Link to="/register" className="font-semibold text-[var(--brand)] transition-colors hover:text-[var(--brand-hover)]">Create an account</Link></p>
        <p className="mt-6 text-center">By continuing, you agree to our <a href="#" className="font-medium text-[var(--text-secondary)] underline decoration-[#aeb6ba] underline-offset-4 transition-colors hover:text-[var(--brand)]">Terms of use</a> and <a href="#" className="font-medium text-[var(--text-secondary)] underline decoration-[#aeb6ba] underline-offset-4 transition-colors hover:text-[var(--brand)]">Privacy policy</a>.</p>
      </section>
    </main>
  );
}
