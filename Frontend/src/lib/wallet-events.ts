type WalletStreamOptions = {
  url: string;
  accessToken: string;
  onUpdate: () => void;
};

export function parseWalletEventFrame(frame: string): string | null {
  let eventName = "message";
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
  }
  return eventName === "wallet.updated" ? eventName : null;
}

export function subscribeToWalletEvents({ url, accessToken, onUpdate }: WalletStreamOptions): () => void {
  const controller = new AbortController();
  let retryTimer: number | undefined;
  let retryDelay = 1_000;
  let stopped = false;

  const reconnect = () => {
    if (stopped) return;
    retryTimer = window.setTimeout(() => void connect(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 15_000);
  };

  const connect = async () => {
    if (stopped) return;
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/event-stream", authorization: `Bearer ${accessToken}` },
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`Wallet stream failed (${response.status})`);
      retryDelay = 1_000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const frames = pending.split(/\r?\n\r?\n/);
        pending = frames.pop() ?? "";
        for (const frame of frames) {
          if (parseWalletEventFrame(frame)) onUpdate();
        }
      }
    } catch {
      // A closed connection is expected during navigation and network changes.
    }
    reconnect();
  };

  void connect();
  return () => {
    stopped = true;
    controller.abort();
    if (retryTimer !== undefined) window.clearTimeout(retryTimer);
  };
}
