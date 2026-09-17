import type { ReactNode } from "react";
import { XIcon as X } from "@animateicons/react/lucide";

export type ConnectionChoice = "business-app" | "new-number";

const connectionChoices: Array<{
  id: ConnectionChoice;
  title: string;
  tone: string;
  sections: Array<{ title: string; content: ReactNode }>;
}> = [
  {
    id: "business-app",
    title: "WA Business App Number",
    tone: "bg-purple-100 text-purple-700",
    sections: [
      { title: "Requirements Before Connecting", content: <ul className="space-y-2"><li>A number registered on WhatsApp Business App version 2.24.4+</li><li>GST Certificate or Active Website needed for verification</li></ul> },
      { title: "Number", content: <><strong>No new number needed</strong><span>Use your existing WhatsApp Business App number</span></> },
      { title: "App Usage", content: <><strong>Continue using WhatsApp Business App alongside Interakt</strong><span>Messages sync between Interakt &amp; app</span></> },
      { title: "Broadcasts (from Interakt)", content: <><strong>Slower Broadcast Speeds</strong><span>Broadcast to 10,000 contacts could take an hour to send</span></> },
      { title: "Catalog", content: <><strong>Catalog must be created in WhatsApp app.</strong><span>Can&apos;t be created via APIs or CSV / no sync with Shopify.</span></> },
      { title: "Chat Automations", content: <><span>Possible to use Chatbots &amp; AI Agent for customer replies.</span></> },
      { title: "Groups, Status & Calling", content: <><span>Groups, Status, and Calling continue to be available on WA Business App</span><span>WA Calling not possible from Interakt.</span></> },
      { title: "Display Name", content: <><span>Display name depends on contact saving</span><span>Customers see your name only if they saved your number</span></> },
    ],
  },
  {
    id: "new-number",
    title: "New Number",
    tone: "bg-blue-100 text-blue-700",
    sections: [
      { title: "Requirements Before Connecting", content: <ul className="space-y-2"><li>Fresh number not on WA Personal/Business</li><li>Must be able to receive OTP via call or SMS</li><li>GST Certificate or Active Website needed for verification</li></ul> },
      { title: "Number", content: <><strong>Requires a fresh phone number</strong><span>Cannot be already registered on WhatsApp</span></> },
      { title: "App Usage", content: <><strong>Cannot use WhatsApp Business/Personal app</strong><span>Fully API-based — manage everything inside Interakt</span></> },
      { title: "Broadcasts (from Interakt)", content: <><strong>Faster Broadcast Speeds</strong><span>Broadcast to 10,000 contacts could take only few minutes to send</span></> },
      { title: "Catalog", content: <><strong>Catalog can be created via APIs / CSVs.</strong><span>Sync with Shopify possible as well.</span></> },
      { title: "Chat Automations", content: <><span>Possible to use Chatbots &amp; AI Agent for customer replies.</span></> },
      { title: "Groups, Status & Calling", content: <><span>Groups &amp; Status sharing won&apos;t be available. Calling possible from Interakt.</span><span>WA Calling from Interakt comes with recordings &amp; AI summaries!</span></> },
      { title: "Display Name", content: <><strong>After business verification:</strong><span>Customers see your business name even if they haven&apos;t saved your number</span></> },
    ],
  },
];

export function WhatsAppConnectionGuide({
  choice,
  onChoiceChange,
  onClose,
  onNext,
}: {
  choice: ConnectionChoice;
  onChoiceChange: (choice: ConnectionChoice) => void;
  onClose: () => void;
  onNext: (choice: ConnectionChoice) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="whatsapp-connection-guide-title" className="flex max-h-[min(700px,calc(100dvh-2rem))] w-full max-w-[820px] min-h-0 flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_70px_rgba(15,23,42,.28)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600"><span>Step 1 of 2</span><span className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200"><span className="block h-full w-1/2 rounded-full bg-[var(--brand)]" /></span><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700">WhatsApp Business API</span></div>
            <h2 id="whatsapp-connection-guide-title" className="mt-4 text-[21px] font-semibold leading-tight tracking-[-0.025em] text-slate-900">2 Ways to Setup WhatsApp API Number</h2>
            <p className="mt-1 text-sm text-slate-600">You can connect your number in two ways. Here&apos;s how they differ.</p>
          </div>
          <button type="button" aria-label="Close connection options" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-sm transition-colors hover:bg-slate-50"><X size={18} aria-hidden="true" /></button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:flex-row sm:overflow-hidden sm:px-6">
          {connectionChoices.map((option) => {
            const selected = choice === option.id;
            return <article key={option.id} className={`flex min-h-[360px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-white transition-[border-color,box-shadow] ${selected ? "border-[var(--brand)] shadow-[0_0_0_2px_rgba(21,150,106,.12)]" : "border-slate-200"}`}>
              <button type="button" aria-pressed={selected} onClick={() => onChoiceChange(option.id)} className={`shrink-0 px-4 py-3 text-left text-sm font-semibold ${option.tone}`}>{option.title}</button>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5">
                {option.sections.map((section) => <section key={section.title} className="border-b border-slate-200 py-3 last:border-b-0"><h3 className="text-[11px] font-medium text-slate-500">{section.title}</h3><div className="mt-2 space-y-1.5 text-[13px] leading-[1.35] text-slate-900 [&>strong]:block [&>span]:block">{section.content}</div></section>)}
              </div>
              <button type="button" aria-label={`Proceed with ${option.title}`} onClick={() => { onChoiceChange(option.id); onNext(option.id); }} className="flex shrink-0 items-center justify-center gap-2 border-t border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100">Proceed <span aria-hidden="true">→</span></button>
            </article>;
          })}
        </div>

        <footer className="flex shrink-0 items-center border-t border-slate-100 bg-white px-5 py-3.5 sm:px-6">
          <p className="text-[11px] text-slate-500">Select the setup that fits your WhatsApp number, then click Proceed.</p>
        </footer>
      </section>
    </div>
  );
}
