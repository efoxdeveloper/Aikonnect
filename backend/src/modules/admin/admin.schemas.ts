import { z } from "zod";

export const adminListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export const adminAuditQuerySchema = adminListQuerySchema.extend({
  resourceType: z.string().trim().max(80).optional(),
  action: z.string().trim().max(120).optional(),
});

export const platformSettingsInputSchema = z.object({
  welcomeBonusAmount: z.string().trim().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/, "Enter an amount from ₹0 to ₹99,999,999 with up to two decimal places"),
});

export const adminUserActionSchema = z.object({
  action: z.enum(["ACTIVATE", "SUSPEND", "BLOCK", "DELETE"]),
  confirmation: z.string().trim().max(320).optional(),
});

export const adminUserParamsSchema = z.object({ userId: z.string().uuid() });
export const adminPlanParamsSchema = z.object({ planId: z.uuid() });
export const adminPlanRequestParamsSchema = z.object({ requestId: z.uuid() });
export const adminPlanRequestQuerySchema = adminListQuerySchema.extend({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional() });
export const adminPlanRequestDecisionSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]), adminNote: z.string().trim().max(1000).optional() });

const planPrice = z.string().trim().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, "Enter a non-negative price with up to two decimal places")
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  });
const planLimit = z.number().int().min(1).nullable();

export const adminPlanInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  description: z.string().trim().max(1000).nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  monthlyPrice: planPrice,
  annualPrice: planPrice,
  trialDays: z.number().int().min(0).max(365),
  maxSeats: planLimit,
  maxContacts: planLimit,
  maxCampaignsPerMonth: planLimit,
  maxAutomations: planLimit,
  maxWorkflows: planLimit,
  maxPipelines: planLimit,
  apiAccess: z.boolean(),
  webhooks: z.boolean(),
  advancedReports: z.boolean(),
  active: z.boolean(),
  displayOrder: z.number().int().min(0).max(10000),
});

export const adminUserWalletAdjustmentSchema = z.object({
  amountMinorUnits: z.string().regex(/^[1-9]\d*$/, "Enter a positive amount in the currency's minor units").transform((value) => BigInt(value)),
  idempotencyKey: z.string().trim().min(8).max(255),
  reason: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

export const adminWalletAdjustmentSchema = z.object({
  tenantId: z.uuid(),
  direction: z.enum(["CREDIT", "DEBIT"]),
  amountMinorUnits: z.string().regex(/^[1-9]\d*$/, "Enter a positive amount in the currency's minor units").transform((value) => BigInt(value)),
  idempotencyKey: z.string().trim().min(8).max(255),
  reason: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type PlatformSettingsInput = z.infer<typeof platformSettingsInputSchema>;
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;
export type AdminUserAction = z.infer<typeof adminUserActionSchema>["action"];
export type AdminWalletAdjustment = z.infer<typeof adminWalletAdjustmentSchema>;
export type AdminUserWalletAdjustment = z.infer<typeof adminUserWalletAdjustmentSchema>;
export type AdminPlanInput = z.infer<typeof adminPlanInputSchema>;
export type AdminPlanRequestQuery = z.infer<typeof adminPlanRequestQuerySchema>;
export type AdminPlanRequestDecision = z.infer<typeof adminPlanRequestDecisionSchema>;
