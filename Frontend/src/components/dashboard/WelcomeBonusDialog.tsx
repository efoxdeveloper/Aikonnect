import * as Dialog from "@radix-ui/react-dialog";
import type { CSSProperties } from "react";
import { CheckCircle2, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./WelcomeBonusDialog.module.css";

type WelcomeBonusDialogProps = {
  amount: string;
  currency: string;
  firstName: string;
  onClose: () => void;
};

const confetti = Array.from({ length: 88 }, (_, index) => {
  const direction = index % 2 === 0 ? 1 : -1;
  const spread = 14 + (Math.floor(index / 2) * 13) % 38;
  return {
    origin: direction === 1 ? "left" : "right",
    style: {
      "--burst-x": `${direction * spread}vw`,
      "--burst-end-x": `${direction * (spread + 8)}vw`,
      "--burst-height": `-${42 + (index * 11) % 38}vh`,
      "--burst-turn": `${direction * (180 + index * 23)}deg`,
      "--burst-end-turn": `${direction * (540 + index * 23)}deg`,
      animationDelay: `${(index % 6) * .035}s`,
      animationDuration: `${2.4 + (index % 7) * .16}s`,
    } as CSSProperties,
  };
});

function formatAmount(amount: string, currency: string) {
  const formatted = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(amount));
  return currency === "INR" ? `₹${formatted}` : `${currency} ${formatted}`;
}

export function WelcomeBonusDialog({ amount, currency, firstName, onClose }: WelcomeBonusDialogProps) {
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay}>
        <div className={styles.confetti} data-testid="welcome-bonus-confetti" aria-hidden="true">{confetti.map((piece, index) => <i key={index} data-origin={piece.origin} style={piece.style} />)}</div>
      </Dialog.Overlay>
      <Dialog.Content className={styles.dialog}>
        <header className={styles.header}>
          <Dialog.Title className={styles.title}>Congratulations{firstName ? `, ${firstName}` : ""}!</Dialog.Title>
          <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Close welcome bonus"><X size={17} aria-hidden="true" /></Button></Dialog.Close>
        </header>
        <div className={styles.body}>
          <Dialog.Description className={styles.description}>Your WhatsApp number is connected. We’ve added a welcome bonus to your wallet.</Dialog.Description>
          <div className={styles.credit} aria-label={`${formatAmount(amount, currency)} added to your wallet`}>
            <div className={styles.creditLabel}><WalletCards size={17} aria-hidden="true" /><span>WhatsApp connection credit</span></div>
            <strong className={styles.amount}>{formatAmount(amount, currency)}</strong>
            <div className={styles.creditStatus}><CheckCircle2 size={14} aria-hidden="true" /><span>Added to your wallet</span></div>
          </div>
        </div>
        <footer className={styles.footer}>
          <Dialog.Close asChild><Button type="button" className="h-10 text-xs">Explore your dashboard</Button></Dialog.Close>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
