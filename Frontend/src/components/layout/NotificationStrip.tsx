import { AlertTriangle, CircleX, Info, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NotificationStripTone = "danger" | "warning" | "info" | "success";

type NotificationStripProps = {
  tone: NotificationStripTone;
  title: string;
  message: string;
  actions?: ReactNode;
  onDismiss?: () => void;
  className?: string;
};

const toneStyles: Record<NotificationStripTone, {
  container: string;
  icon: string;
  title: string;
  message: string;
  separator: string;
}> = {
  danger: {
    container: "border-y-red-300 bg-[#ffdfe1] text-[#b4232f]",
    icon: "bg-[#d92d3d] text-white",
    title: "text-[#a71927]",
    message: "text-[#b4232f]",
    separator: "bg-[#d92d3d]/45",
  },
  warning: {
    container: "border-y-[#edc94f] bg-[#ffeca9] text-[#604900]",
    icon: "bg-[#dda900] text-white",
    title: "text-[#3f3000]",
    message: "text-[#604900]",
    separator: "bg-[#9b7800]/45",
  },
  info: {
    container: "border-y-sky-300 bg-sky-50 text-sky-900",
    icon: "bg-sky-600 text-white",
    title: "text-sky-950",
    message: "text-sky-800",
    separator: "bg-sky-700/35",
  },
  success: {
    container: "border-y-emerald-300 bg-emerald-50 text-emerald-900",
    icon: "bg-emerald-600 text-white",
    title: "text-emerald-950",
    message: "text-emerald-800",
    separator: "bg-emerald-700/35",
  },
};

const toneIcons = {
  danger: CircleX,
  warning: AlertTriangle,
  info: Info,
  success: Info,
} satisfies Record<NotificationStripTone, typeof Info>;

export function NotificationStrip({ tone, title, message, actions, onDismiss, className }: NotificationStripProps) {
  const styles = toneStyles[tone];
  const Icon = toneIcons[tone];

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex min-h-9 w-full items-center gap-3 border-y px-5 py-1.5 text-xs sm:px-7", styles.container, className)}
    >
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", styles.icon)}>
        <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 leading-5">
        <strong className={cn("shrink-0 font-semibold", styles.title)}>{title}</strong>
        <span className={cn("hidden h-4 w-px shrink-0 sm:block", styles.separator)} aria-hidden="true" />
        <span className={cn("min-w-0", styles.message)}>{message}</span>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-current/70 transition-colors hover:bg-black/5 hover:text-current"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
