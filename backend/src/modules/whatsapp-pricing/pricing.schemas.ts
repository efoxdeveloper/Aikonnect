import { z } from "zod";

const decimalString = z.string().trim().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/, "Use a non-negative decimal with up to 6 fractional digits");
const dateOnly = z.iso.date();
const tierValue = z.union([
  z.string().trim().regex(/^\d+$/),
  z.number().int().nonnegative().safe(),
]).transform((value) => String(value));

export const rateCardIdParamsSchema = z.object({ id: z.uuid() });

export const rateCardListQuerySchema = z.object({
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  category: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/).optional(),
  pricingType: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,59}$/).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  effectiveDate: dateOnly.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export const rateCardInputSchema = z.object({
  countryCode: z.string().trim().toUpperCase().min(2).max(2),
  countryName: z.string().trim().min(1).max(100),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  category: z.string().trim().toUpperCase().min(1).max(40),
  pricingType: z.string().trim().toUpperCase().min(1).max(60),
  metaRate: decimalString,
  platformFee: decimalString,
  customerRate: decimalString.optional(),
  volumeTierFrom: tierValue.nullable().optional(),
  volumeTierTo: tierValue.nullable().optional(),
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly.nullable().optional(),
  source: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/).default("MANUAL"),
  notes: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const rateCardStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });

export const ratePreviewSchema = z.object({
  phoneNumber: z.string().trim().min(5).max(30),
  category: z.string().trim().toUpperCase().min(1).max(40),
  pricingType: z.string().trim().toUpperCase().min(1).max(60).default("REGULAR"),
  timestamp: z.iso.datetime({ offset: true }).optional(),
  currentVolume: z.union([z.string().trim().regex(/^\d+$/), z.number().int().nonnegative().safe()]).optional(),
});

export type RateCardInput = z.infer<typeof rateCardInputSchema>;
export type RateCardListQuery = z.infer<typeof rateCardListQuerySchema>;
export type RatePreviewInput = z.infer<typeof ratePreviewSchema>;
