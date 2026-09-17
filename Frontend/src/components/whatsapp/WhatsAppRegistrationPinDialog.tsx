import { useState, type FormEvent } from "react";

export function WhatsAppRegistrationPinDialog({
  onSubmit,
  onClose,
  submitting,
  error,
}: {
  onSubmit: (pin: string) => void | Promise<void>;
  onClose: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [pin, setPin] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin)) {
      setValidationError("Enter exactly 6 digits.");
      return;
    }
    setValidationError(null);
    void onSubmit(pin);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="whatsapp-registration-pin-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,.28)]">
        <h2 id="whatsapp-registration-pin-title" className="text-lg font-semibold text-slate-900">Secure your WhatsApp number</h2>
        <p className="mt-2 text-sm leading-5 text-slate-600">Create a 6-digit Cloud API PIN for two-step verification. This is different from the SMS or voice OTP.</p>
        <form onSubmit={submit} className="mt-5">
          <label htmlFor="whatsapp-registration-pin" className="text-xs font-medium text-slate-700">6-digit registration PIN</label>
          <input
            id="whatsapp-registration-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="[0-9]{6}"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-center text-lg tracking-[0.35em] text-slate-900 outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            aria-describedby="whatsapp-registration-pin-help"
            required
          />
          <p id="whatsapp-registration-pin-help" className="mt-2 text-[11px] leading-4 text-slate-500">Save this PIN securely. Meta requires it to register the number for Cloud API.</p>
          {(validationError || error) && <p role="alert" className="mt-3 text-xs text-red-600">{validationError ?? error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="h-10 rounded-md border border-slate-300 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
            <button type="submit" disabled={submitting || pin.length !== 6} className="h-10 rounded-md bg-[var(--brand)] px-5 text-xs font-semibold text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Connecting…" : "Connect number"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
