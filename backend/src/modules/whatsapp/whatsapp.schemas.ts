import { z } from "zod";

const metaId = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

export const whatsappWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });

export const embeddedSignupSchema = z.object({
  code: z.string().trim().min(1).max(5_000),
  businessId: metaId.optional(),
  wabaId: metaId,
  phoneNumberId: metaId,
});

export type EmbeddedSignupInput = z.infer<typeof embeddedSignupSchema>;
