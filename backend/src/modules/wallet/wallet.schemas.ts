import { z } from "zod";

export const walletParamsSchema = z.object({ workspaceId: z.uuid() });

export const walletLedgerQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10_000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  direction: z.enum(["CREDIT", "DEBIT"]).optional(),
});

export type WalletLedgerQuery = z.infer<typeof walletLedgerQuerySchema>;
