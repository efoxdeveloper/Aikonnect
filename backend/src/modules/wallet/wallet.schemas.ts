import { z } from "zod";

export const walletParamsSchema = z.object({ workspaceId: z.uuid() });
export const walletReservationParamsSchema = z.object({ reservationId: z.uuid() });
export const walletTopupParamsSchema = z.object({ topupId: z.uuid() });

const moneyDecimal = z.string().trim().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/, "Use a non-negative decimal with up to 6 fractional digits");

export const walletLedgerQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10_000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  direction: z.enum(["CREDIT", "DEBIT", "HOLD", "RELEASE"]).optional(),
  transactionType: z.string().trim().max(40).optional(),
  status: z.string().trim().max(30).optional(),
  messageId: z.uuid().optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
});

export type WalletLedgerQuery = z.infer<typeof walletLedgerQuerySchema>;

export const walletCreditSchema = z.object({
  amount: moneyDecimal,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  paymentReference: z.string().trim().max(255).optional(),
  reason: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(255),
});

export const walletDebitSchema = walletCreditSchema.omit({ paymentReference: true });
export const walletRefundSchema = z.object({ amount: moneyDecimal.optional(), reason: z.string().trim().min(1).max(160), });
export const walletStatusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]) });
export const billingSettingsSchema = z.object({
  billingMode: z.enum(["CUSTOMER_META_BILLING", "MARRENTO_SHARED_BILLING"]).optional(),
  billingType: z.enum(["PREPAID", "POSTPAID", "ENTERPRISE_CONTRACT"]).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  walletRequired: z.boolean().optional(),
  allowNegativeBalance: z.boolean().optional(),
  creditLimit: moneyDecimal.optional(),
});
export const walletTopupSchema = z.object({
  amount: z.string().trim().regex(/^(?:[1-9]\d{0,7})(?:\.\d{1,2})?$/, "Enter an amount greater than zero with up to 2 decimal places"),
  idempotencyKey: z.string().trim().min(8).max(255),
});
export type WalletTopupInput = z.infer<typeof walletTopupSchema>;
export type WalletCreditInput = z.infer<typeof walletCreditSchema>;
export type WalletDebitInput = z.infer<typeof walletDebitSchema>;
export type WalletRefundInput = z.infer<typeof walletRefundSchema>;
export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;
