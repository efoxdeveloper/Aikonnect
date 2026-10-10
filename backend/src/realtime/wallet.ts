import type { Response } from "express";

type WalletStream = { workspaceId: string; response: Response };
const streams = new Set<WalletStream>();

function writeEvent(response: Response, event: string, data: Record<string, unknown>) {
  if (response.writableEnded || response.destroyed) return false;
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  response.flush?.();
  return true;
}

export function streamWalletUpdates(workspaceId: string, response: Response) {
  response.status(200);
  response.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  const stream = { workspaceId, response };
  streams.add(stream);
  writeEvent(response, "wallet.ready", { workspaceId });

  const heartbeat = setInterval(() => {
    if (response.writableEnded || response.destroyed) return;
    response.write(": keep-alive\n\n");
    response.flush?.();
  }, 20_000);
  heartbeat.unref();

  const close = () => {
    clearInterval(heartbeat);
    streams.delete(stream);
  };
  response.on("close", close);
  return close;
}

export function publishWalletUpdated(workspaceId: string) {
  for (const stream of streams) {
    if (stream.workspaceId !== workspaceId) continue;
    if (!writeEvent(stream.response, "wallet.updated", {})) streams.delete(stream);
  }
}
