import { z } from "zod";
import { AppError } from "../../middleware/error-handler.js";

const phone = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "Use a complete international WhatsApp number");
const idempotencyKey = z.string().trim().min(8).max(255);

export const sendMessageSchema = z.object({
  to: phone,
  templateKey: z.string().trim().min(1).max(180),
  languageCode: z.string().trim().min(1).max(50).optional(),
  parameters: z.array(z.string().max(4096)).max(100).default([]),
  pricingType: z.enum(["REGULAR", "FREE_CUSTOMER_SERVICE", "FREE_ENTRY_POINT", "VOLUME_TIER"]).default("REGULAR"),
  currentVolume: z.string().trim().regex(/^\d+$/).optional(),
  clientReference: z.string().trim().max(255).optional(),
});

const publicTextValue = z.string().trim().max(255).optional().transform((value) => value || undefined);
const publicCallbackData = z.string().trim().min(1, "callbackData is required").max(255);
const publicMediaUrl = z.string().trim().max(2_048).url("mediaUrl must be a valid URL").refine((value) => /^https?:\/\//i.test(value), "mediaUrl must use http or https");

const publicMessageBase = z.object({
  userId: publicTextValue,
  fullPhoneNumber: phone,
  callbackData: publicCallbackData,
});

export const publicTextMessageSchema = publicMessageBase.extend({
  type: z.enum(["Text", "text"]).transform(() => "Text" as const),
  data: z.object({
    message: z.string().trim().min(1, "Message text cannot be empty").max(100_000),
  }),
});

export const publicImageMessageSchema = publicMessageBase.extend({
  type: z.enum(["Image", "image"]).transform(() => "Image" as const),
  data: z.object({
    message: z.string().trim().max(1_024).optional().transform((value) => value || undefined),
    mediaUrl: publicMediaUrl,
  }),
});

export const publicMessageSchema = z.union([publicTextMessageSchema, publicImageMessageSchema]);

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type PublicTextMessageInput = z.infer<typeof publicTextMessageSchema>;
export type PublicImageMessageInput = z.infer<typeof publicImageMessageSchema>;
export type PublicMessageInput = z.infer<typeof publicMessageSchema>;

export function requestIdempotencyKey(value: string | string[] | undefined) {
  const key = Array.isArray(value) ? value[0] : value;
  const parsed = idempotencyKey.safeParse(key ?? "");
  if (!parsed.success) throw new AppError(400, "The Idempotency-Key header is required and must be 8 to 255 characters", "IDEMPOTENCY_KEY_REQUIRED");
  return parsed.data;
}
