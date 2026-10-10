import { z } from "zod";
import { AppError } from "../../middleware/error-handler.js";

const phone = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "Use a complete international WhatsApp number");
const idempotencyKey = z.string().trim().min(8).max(255);

export function normalizeDeveloperApiLanguageCode(value: string) {
  const normalized = value.trim().replace(/-/g, "_");
  if (/^(en|english|english_us)$/i.test(normalized)) return "en_US";
  if (/^english_uk$/i.test(normalized)) return "en_GB";
  return normalized;
}

export const createApiCampaignSchema = z.object({
  campaign_name: z.string().trim().min(1).max(160),
  campaign_type: z.literal("PublicAPI"),
  template_name: z.string().trim().min(1).max(512),
  language_code: z.string().trim().min(1).max(50).transform(normalizeDeveloperApiLanguageCode),
});

export const sendMessageSchema = z.object({
  to: phone,
  templateKey: z.string().trim().min(1).max(180),
  languageCode: z.string().trim().min(1).max(50).transform(normalizeDeveloperApiLanguageCode).optional(),
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

export const publicDocumentMessageSchema = publicMessageBase.extend({
  type: z.enum(["Document", "document"]).transform(() => "Document" as const),
  data: z.object({
    message: z.string().trim().max(1_024).optional().transform((value) => value || undefined),
    mediaUrl: publicMediaUrl,
    fileName: z.string().trim().max(255).optional().transform((value) => value || undefined),
  }),
});

export const publicVideoMessageSchema = publicMessageBase.extend({
  type: z.enum(["Video", "video"]).transform(() => "Video" as const),
  data: z.object({
    message: z.string().trim().max(1_024).optional().transform((value) => value || undefined),
    mediaUrl: publicMediaUrl,
    fileName: z.string().trim().max(255).optional().transform((value) => value || undefined),
  }),
});

export const publicAudioMessageSchema = publicMessageBase.extend({
  type: z.enum(["Audio", "audio"]).transform(() => "Audio" as const),
  data: z.object({
    message: z.string().trim().max(1_024).optional().transform((value) => value || undefined),
    mediaUrl: publicMediaUrl,
    fileName: z.string().trim().max(255).optional().transform((value) => value || undefined),
  }),
});

const publicInteractiveButton = z.object({
  type: z.literal("button"),
  body: z.object({
    text: z.string().trim().min(1, "Button body text cannot be empty").max(1_024),
  }),
  action: z.object({
    buttons: z.array(z.object({
      type: z.literal("reply"),
      reply: z.object({
        id: z.string().trim().min(1, "Button reply id cannot be empty").max(256),
        title: z.string().trim().min(1, "Button title cannot be empty").max(20),
      }),
    })).min(1, "At least one button is required").max(3, "WhatsApp supports at most three reply buttons"),
  }),
}).superRefine((value, context) => {
  const ids = value.action.buttons.map((button) => button.reply.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["action", "buttons"], message: "Button reply ids must be unique" });
  }
});

export const publicInteractiveButtonMessageSchema = publicMessageBase.extend({
  type: z.enum(["InteractiveButton", "interactivebutton"]).transform(() => "InteractiveButton" as const),
  data: z.object({
    message: publicInteractiveButton,
  }),
});

export const publicStickerMessageSchema = publicMessageBase.extend({
  type: z.enum(["Sticker", "sticker"]).transform(() => "Sticker" as const),
  data: z.object({
    mediaUrl: publicMediaUrl,
  }),
});

const publicTemplateRecipient = z.object({
  userId: publicTextValue,
  fullPhoneNumber: phone.optional(),
  countryCode: z.string().trim().regex(/^\+[1-9]\d{0,3}$/, "countryCode must be an international calling code").optional(),
  phoneNumber: z.string().trim().regex(/^\d{4,14}$/, "phoneNumber must contain 4 to 14 digits").optional(),
  callbackData: z.string().trim().max(255),
  campaignId: z.uuid().optional(),
  template_category: z.enum(["marketing", "utility", "authentication", "MARKETING", "UTILITY", "AUTHENTICATION"]).optional().transform((value) => value?.toUpperCase()),
});

const publicTemplateCarouselCardSchema = z.object({
  headerValues: z.array(z.string().trim().min(1).max(4096)).max(10).default([]),
  bodyValues: z.array(z.string().trim().min(1).max(4096)).max(100).default([]),
  buttonValues: z.record(z.string().regex(/^\d{1,2}$/), z.array(z.string().trim().min(1).max(4096)).min(1).max(10)).default({}),
});

const publicOrderDetailsItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive().max(100_000),
  amount: z.number().nonnegative().max(1_000_000_000),
  country_of_origin: z.string().trim().min(2).max(100).optional(),
});

const publicOrderShippingAddressSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone_number: z.string().trim().regex(/^\+?\d{7,15}$/),
  address: z.string().trim().min(1).max(255),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  in_pin_code: z.string().trim().min(3).max(20),
  house_number: z.string().trim().max(100).optional(),
  tower_number: z.string().trim().max(100).optional(),
  building_name: z.string().trim().max(150).optional(),
  landmark_area: z.string().trim().max(150).optional(),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
});

const publicOrderDetailsSchema = z.object({
  reference_id: z.string().trim().min(1).max(100),
  order_items: z.array(publicOrderDetailsItemSchema).min(1).max(100),
  shipping_addresses: z.array(publicOrderShippingAddressSchema).max(10).optional(),
  subtotal: z.number().nonnegative().max(1_000_000_000),
  discount: z.number().nonnegative().max(1_000_000_000),
  tax: z.number().nonnegative().max(1_000_000_000),
  shipping: z.number().nonnegative().max(1_000_000_000),
  total_amount: z.number().positive().max(1_000_000_000),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  payment_option_expires_in: z.object({
    value: z.number().int().positive().max(525_600),
    unit: z.enum(["seconds", "minutes", "hours", "days"]),
    expiration_message: z.string().trim().max(255).default(""),
  }).optional(),
});

const publicOrderStatusSchema = z.object({
  reference_id: z.string().trim().min(1).max(100),
  order: z.object({
    status: z.enum(["pending", "processing", "partially_shipped", "shipped", "completed", "canceled"]),
    description: z.string().trim().max(120).optional(),
  }),
});

export const publicTemplateMessageSchema = publicTemplateRecipient.extend({
  type: z.literal("Template"),
  template: z.object({
    name: z.string().trim().min(1).max(512),
    languageCode: z.string().trim().min(1).max(50).transform(normalizeDeveloperApiLanguageCode),
    headerValues: z.array(z.string().trim().min(1).max(4096)).max(10).default([]),
    fileName: z.string().trim().min(1).max(255).optional(),
    bodyValues: z.array(z.string().trim().min(1).max(4096)).max(100).default([]),
    buttonValues: z.record(z.string().regex(/^\d{1,2}$/), z.array(z.string().trim().min(1).max(4096)).min(1).max(10)).default({}),
    carouselCards: z.array(publicTemplateCarouselCardSchema).min(2).max(10).optional(),
    order_details: z.array(publicOrderDetailsSchema).min(1).max(10).optional(),
    order_status: publicOrderStatusSchema.optional(),
  }),
}).superRefine((value, context) => {
  const hasFullNumber = Boolean(value.fullPhoneNumber);
  const hasCountryAndPhone = Boolean(value.countryCode && value.phoneNumber);
  if (!hasFullNumber && !hasCountryAndPhone) {
    context.addIssue({ code: "custom", path: ["fullPhoneNumber"], message: "Provide fullPhoneNumber or both countryCode and phoneNumber" });
  }
  if (Boolean(value.countryCode) !== Boolean(value.phoneNumber)) {
    context.addIssue({ code: "custom", path: [value.countryCode ? "phoneNumber" : "countryCode"], message: "countryCode and phoneNumber must be provided together" });
  }
  if (hasFullNumber && hasCountryAndPhone) {
    const fullDigits = value.fullPhoneNumber!.replace(/\D/g, "");
    const combinedDigits = `${value.countryCode}${value.phoneNumber}`.replace(/\D/g, "");
    if (fullDigits !== combinedDigits) context.addIssue({ code: "custom", path: ["fullPhoneNumber"], message: "fullPhoneNumber must match countryCode and phoneNumber" });
  }
}).transform(({ countryCode, phoneNumber, fullPhoneNumber, ...value }) => ({
  ...value,
  fullPhoneNumber: `+${(fullPhoneNumber ?? `${countryCode}${phoneNumber}`).replace(/\D/g, "")}`,
}));

export const publicMessageSchema = z.union([publicTextMessageSchema, publicImageMessageSchema, publicDocumentMessageSchema, publicVideoMessageSchema, publicAudioMessageSchema, publicInteractiveButtonMessageSchema, publicStickerMessageSchema, publicTemplateMessageSchema]);

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateApiCampaignInput = z.infer<typeof createApiCampaignSchema>;
export type PublicTextMessageInput = z.infer<typeof publicTextMessageSchema>;
export type PublicImageMessageInput = z.infer<typeof publicImageMessageSchema>;
export type PublicDocumentMessageInput = z.infer<typeof publicDocumentMessageSchema>;
export type PublicVideoMessageInput = z.infer<typeof publicVideoMessageSchema>;
export type PublicAudioMessageInput = z.infer<typeof publicAudioMessageSchema>;
export type PublicInteractiveButtonMessageInput = z.infer<typeof publicInteractiveButtonMessageSchema>;
export type PublicStickerMessageInput = z.infer<typeof publicStickerMessageSchema>;
export type PublicTemplateMessageInput = z.infer<typeof publicTemplateMessageSchema>;
export type PublicMessageInput = z.infer<typeof publicMessageSchema>;

export function requestIdempotencyKey(value: string | string[] | undefined) {
  const key = Array.isArray(value) ? value[0] : value;
  const parsed = idempotencyKey.safeParse(key ?? "");
  if (!parsed.success) throw new AppError(400, "The Idempotency-Key header is required and must be 8 to 255 characters", "IDEMPOTENCY_KEY_REQUIRED");
  return parsed.data;
}
