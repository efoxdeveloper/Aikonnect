import { siWhatsapp } from "simple-icons";

export function WhatsAppIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
    >
      <path d={siWhatsapp.path} />
    </svg>
  );
}
