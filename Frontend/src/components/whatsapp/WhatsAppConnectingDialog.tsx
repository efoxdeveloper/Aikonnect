import { LoaderCircle } from "lucide-react";

export function WhatsAppConnectingDialog() {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="whatsapp-connecting-title" aria-describedby="whatsapp-connecting-description" className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-7 py-8 text-center shadow-[0_24px_70px_rgba(15,23,42,.28)]">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-[var(--brand)]">
          <LoaderCircle size={24} className="animate-spin" aria-hidden="true" />
        </span>
        <h2 id="whatsapp-connecting-title" className="mt-4 text-lg font-semibold text-slate-900">Connecting Marento to Meta</h2>
        <p id="whatsapp-connecting-description" className="mt-2 text-sm leading-5 text-slate-600">We’re securely setting up your WhatsApp account. This may take a few moments.</p>
      </section>
    </div>
  );
}
