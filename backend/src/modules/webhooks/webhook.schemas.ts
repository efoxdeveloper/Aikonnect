import { z } from "zod";

export const webhookWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });
export const webhookIdParamsSchema = z.object({ workspaceId: z.uuid(), webhookId: z.uuid() });

export const webhookEventTypes = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "conversation.updated",
  "contact.updated",
  "campaign.updated",
] as const;

export const createWebhookSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.url().max(500).refine((value) => value.startsWith("https://"), "Webhook URL must use HTTPS"),
  events: z.array(z.enum(webhookEventTypes)).min(1).max(webhookEventTypes.length).default(["message.received", "message.sent", "message.delivered", "message.read", "message.failed"]),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
