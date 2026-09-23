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

export const adminUserActionSchema = z.object({
  action: z.enum(["ACTIVATE", "SUSPEND", "BLOCK", "DELETE"]),
  confirmation: z.string().trim().max(320).optional(),
});

export const adminUserParamsSchema = z.object({ userId: z.string().uuid() });

export const adminWalletAdjustmentSchema = z.object({
  tenantId: z.uuid(),
  direction: z.enum(["CREDIT", "DEBIT"]),
  amountMinorUnits: z.string().regex(/^[1-9]\d*$/, "Enter a positive amount in the currency's minor units").transform((value) => BigInt(value)),
  idempotencyKey: z.string().trim().min(8).max(255),
  reason: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;
export type AdminUserAction = z.infer<typeof adminUserActionSchema>["action"];
export type AdminWalletAdjustment = z.infer<typeof adminWalletAdjustmentSchema>;
