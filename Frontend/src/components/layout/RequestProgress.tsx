import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { getActiveRequestCount, subscribeToRequests } from "@/lib/request-events";

const progressDelay = 160;

export function RequestProgress() {
  const requestCount = useSyncExternalStore(subscribeToRequests, getActiveRequestCount, () => 0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (requestCount === 0) {
      setVisible(false);
      return;
    }

    const timeout = window.setTimeout(() => setVisible(true), progressDelay);
    return () => window.clearTimeout(timeout);
  }, [requestCount]);

  return (
    <div
      aria-label="Loading"
      aria-live="polite"
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed left-0 right-0 top-0 z-[100] h-0.5 origin-left bg-[var(--brand)] transition-[transform,opacity] duration-200 ease-out",
        visible ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
      )}
      data-testid="request-progress"
      role="status"
    />
  );
}
