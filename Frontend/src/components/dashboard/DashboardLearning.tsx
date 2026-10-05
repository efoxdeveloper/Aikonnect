import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Check, ExternalLink, Play, X } from "lucide-react";
import type { SVGProps } from "react";
import { siYoutube } from "simple-icons";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { WorkspaceSetupData } from "@/types/workspace";
import styles from "./DashboardLearning.module.css";

function YouTubeIcon({ size = 17, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}><path d={siYoutube.path} /></svg>;
}

const setupSteps = [
  { key: "workspaceCreated", title: "Create your workspace", description: "Review your business details and preferences.", to: "/settings", permission: "workspace.read" },
  { key: "whatsappConnected", title: "Connect WhatsApp Business", description: "Link your WhatsApp Business account.", to: "/whatsapp-account", permission: "whatsapp.read" },
  { key: "phoneNumberConnected", title: "Connect your phone number", description: "Select the number customers will message.", to: "/whatsapp-account", permission: "whatsapp.read" },
  { key: "testMessageSent", title: "Send your first test message", description: "Check your connection before going live.", to: "/whatsapp-account", permission: "whatsapp.read" },
] as const;

export function DashboardSetupGuide({ data, status, permissions }: { data: WorkspaceSetupData | null; status: string; permissions: string[] }) {
  const completed = data ? setupSteps.filter((step) => data.progress[step.key]).length : null;
  return <div className={styles.guide}>
    <div className={styles.progressCard}>
      <div className={styles.progressSummary}><div><span className={styles.progressLabel}>Workspace setup</span><strong>{completed === null ? status || "Progress unavailable" : `${completed} / 4`}</strong><span className={styles.progressDetail}>{completed === null ? "steps complete" : `steps complete · ${completed * 25}%`}</span></div><span className={styles.progressBadge}>{completed === 4 ? <><Check size={14} /> Ready</> : "In progress"}</span></div>
      {completed !== null && <div role="progressbar" aria-label="Workspace setup progress" aria-valuemin={0} aria-valuemax={4} aria-valuenow={completed} className={styles.progress}><span style={{ width: `${completed * 25}%` }} /></div>}
    </div>
    <ol className={styles.steps}>{setupSteps.map((step, index) => {
      const done = data?.progress[step.key];
      return <li key={step.key} data-complete={done || undefined}>
        <span className={styles.stepIcon} aria-hidden="true">{done ? <Check size={16} /> : index + 1}</span>
        <div className={styles.stepText}><div className={styles.stepHeading}><h3>{step.title}</h3><span data-status={data ? done ? "complete" : "todo" : "unavailable"}>{data ? done ? "Complete" : "To do" : "—"}</span></div><p>{step.description}</p></div>
        {permissions.includes(step.permission) && <Button asChild variant="ghost" className={styles.stepAction}><Link to={step.to} aria-label={`${done ? "View" : "Open"} ${step.title.toLowerCase()}`}><ArrowRight size={17} aria-hidden="true" /></Link></Button>}
      </li>;
    })}</ol>
  </div>;
}

export function DashboardTutorials() {
  return <Dialog.Root>
    <div className={styles.tutorial}>
      <Dialog.Trigger asChild><button type="button" className={styles.videoPreview} aria-label="Watch WhatsApp workspace walkthrough">
        <img src="https://i.ytimg.com/vi/59fdY8aGPDE/hqdefault.jpg" alt="" loading="lazy" />
        <span className={styles.play}><Play size={22} fill="currentColor" aria-hidden="true" /></span>
      </button></Dialog.Trigger>
      <div className={styles.videoText}><h3>WhatsApp workspace walkthrough</h3><p>Explore messaging, templates and campaigns.</p><span>Interakt platform demo</span><Dialog.Trigger asChild><Button className={styles.watchButton}><YouTubeIcon size={17} aria-hidden="true" />Watch tutorial</Button></Dialog.Trigger></div>
    </div>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.dialog}>
        <header className={styles.dialogHeader}><Dialog.Title>WhatsApp workspace walkthrough</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close tutorial"><X size={20} /></Button></Dialog.Close></header>
        <div className={styles.dialogBody}><Dialog.Description>Interakt platform demo — the introduction used in our onboarding guide.</Dialog.Description><iframe title="Interakt platform demo video" src="https://www.youtube-nocookie.com/embed/59fdY8aGPDE?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>
        <footer className={styles.dialogFooter}><Button asChild className={styles.youtubeLink}><a href="https://www.youtube.com/watch?v=59fdY8aGPDE" target="_blank" rel="noopener noreferrer"><YouTubeIcon size={17} aria-hidden="true" />Watch on YouTube<ExternalLink size={15} aria-hidden="true" /></a></Button><Dialog.Close asChild><Button>Done</Button></Dialog.Close></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
