import type { Response } from "express";

type CampaignStream = { workspaceId: string; campaignId: string; response: Response };
const streams = new Set<CampaignStream>();

function writeEvent(response: Response, event: string, data: Record<string, unknown>) {
  if (response.writableEnded || response.destroyed) return false;
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  response.flush?.();
  return true;
}

export function streamCampaignUpdates(workspaceId: string, campaignId: string, response: Response) {
  response.status(200);
  response.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  const stream = { workspaceId, campaignId, response };
  streams.add(stream);
  writeEvent(response, "campaign.ready", { campaignId });

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

export function publishCampaignUpdated(workspaceId: string, campaignId: string) {
  for (const stream of streams) {
    if (stream.workspaceId !== workspaceId || stream.campaignId !== campaignId) continue;
    if (!writeEvent(stream.response, "campaign.updated", { campaignId })) streams.delete(stream);
  }
}
