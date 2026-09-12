import { z } from "zod";

export const apiKeyIdParamsSchema = z.object({ workspaceId: z.uuid(), apiKeyId: z.uuid() });
export const apiKeyWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });

export const apiKeyScopes = [
  "contacts.read",
  "contacts.write",
  "events.write",
  "templates.read",
  "messages.send",
  "conversations.read",
  "conversations.write",
] as const;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(apiKeyScopes)).min(1).max(apiKeyScopes.length).default([...apiKeyScopes]),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
