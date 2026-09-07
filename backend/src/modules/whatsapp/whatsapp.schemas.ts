import { z } from "zod";

const metaId = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

export const whatsappWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });

export const embeddedSignupSchema = z.object({
  code: z.string().trim().min(1).max(5_000),
  businessId: metaId.optional(),
  wabaId: metaId,
  phoneNumberId: metaId.optional().nullable(),
});

export const testMessageSchema = z.object({
  to: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Enter a valid international phone number, for example +919876543210"),
});

export type EmbeddedSignupInput = z.infer<typeof embeddedSignupSchema>;
