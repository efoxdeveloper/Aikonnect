import { UserRound } from "lucide-react";
import { siMeta } from "simple-icons";

export function WhatsAppConnectingDialog() {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="whatsapp-connecting-title" className="relative flex min-h-[260px] w-full max-w-md flex-col justify-center rounded-xl border border-slate-200 bg-white px-10 py-10 text-center shadow-[0_24px_70px_rgba(15,23,42,.28)]">
        <div role="group" aria-label="Connection progress: you to Marento to Meta" className="relative mx-auto h-[76px] w-64 max-w-full">
          <UserRound role="img" aria-label="You" size={21} className="absolute left-[4%] top-0.5 -translate-x-1/2 text-slate-600" />
          <img src="/brand-logo-icon-oly.png" alt="Marento" className="absolute left-1/2 top-0 size-7 -translate-x-1/2 rounded-md object-contain" />
          <svg role="img" aria-label="Meta" viewBox="0 0 24 24" className="absolute left-[96%] top-0.5 size-6 -translate-x-1/2" fill={`#${siMeta.hex}`}><path d={siMeta.path} /></svg>
          <video src="/Connecting.mp4" autoPlay loop muted playsInline aria-hidden="true" className="absolute inset-x-0 bottom-0 h-8 w-full object-contain" />
        </div>
        <h2 id="whatsapp-connecting-title" className="mt-5 text-xl font-semibold text-slate-900">Connecting...</h2>
      </section>
    </div>
  );
}
