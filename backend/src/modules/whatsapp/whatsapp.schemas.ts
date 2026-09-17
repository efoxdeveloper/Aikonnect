import { z } from "zod";

const metaId = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

export const whatsappWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });

export const embeddedSignupSchema = z.object({
  code: z.string().trim().min(1).max(5_000),
  mode: z.enum(["coexistence", "new-number"]).default("coexistence"),
  businessId: metaId.optional(),
  wabaId: metaId,
  phoneNumberId: metaId.optional().nullable(),
  pin: z.string().regex(/^\d{6}$/, "Registration PIN must contain exactly 6 digits").optional(),
}).superRefine((input, context) => {
  if (input.mode === "new-number" && !input.pin) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["pin"], message: "Registration PIN is required for a new number" });
  }
});

export const testMessageSchema = z.object({
  to: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Enter a valid international phone number, for example +919876543210"),
});

export type EmbeddedSignupInput = z.infer<typeof embeddedSignupSchema>;
