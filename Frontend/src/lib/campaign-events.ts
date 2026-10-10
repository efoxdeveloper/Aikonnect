type CampaignStreamOptions = {
  url: string;
  accessToken: string;
  onUpdate: () => void;
};

export function parseCampaignEventFrame(frame: string): boolean {
  let eventName = "message";
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
  }
  return eventName === "campaign.updated";
}

export function subscribeToCampaignEvents({ url, accessToken, onUpdate }: CampaignStreamOptions): () => void {
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
      if (!response.ok || !response.body) throw new Error(`Campaign stream failed (${response.status})`);
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
        if (frames.some(parseCampaignEventFrame)) onUpdate();
      }
    } catch {
      // Reconnect after transient network and server errors.
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
