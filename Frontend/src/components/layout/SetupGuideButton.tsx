import { ExternalLink, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { siYoutube } from "simple-icons";
import { Button } from "@/components/ui/button";

function YouTubeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#ff0033]" aria-hidden="true"><path d={siYoutube.path} /></svg>;
}

export function SetupGuideButton() {
  return <Dialog.Root>
    <Dialog.Trigger asChild>
      <Button type="button" variant="outline" aria-label="Open setup guide" className="h-9 shrink-0 gap-2 border-[var(--border)] bg-white px-2.5 text-[11px] font-medium text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-subtle)]">
        <YouTubeIcon />
        <span className="hidden sm:inline">Setup Guide</span>
      </Button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[110] bg-[#10251b]/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[111] flex max-h-[min(760px,calc(100dvh-2rem))] w-[min(900px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[0_24px_70px_rgba(15,23,42,.25)] focus:outline-none">
        <header className="flex flex-none items-center justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#ff0033]"><YouTubeIcon /></span>
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold text-[var(--text-primary)]">Workspace setup guide</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-[var(--text-secondary)]">A quick walkthrough of messaging, templates, and campaigns.</Dialog.Description>
            </div>
          </div>
          <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" aria-label="Close setup guide" className="size-8 shrink-0"><X size={17} /></Button></Dialog.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-[#f7f8f7] p-4 sm:p-6">
          <div className="mx-auto aspect-video w-full overflow-hidden rounded-lg bg-black shadow-[0_8px_24px_rgba(15,23,42,.12)]">
            <iframe title="Interakt workspace setup video" src="https://www.youtube-nocookie.com/embed/59fdY8aGPDE?autoplay=1&rel=0" className="size-full border-0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
          </div>
        </div>
        <footer className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] px-5 py-3">
          <a href="https://www.youtube.com/watch?v=59fdY8aGPDE" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--brand)]"><YouTubeIcon />Watch on YouTube<ExternalLink size={13} /></a>
          <Dialog.Close asChild><Button type="button" className="h-9 px-4 text-xs">Done</Button></Dialog.Close>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
