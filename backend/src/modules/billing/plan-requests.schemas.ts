import { z } from "zod";

export const planRequestCreateSchema = z.object({
  planId: z.uuid(),
  billingPeriod: z.enum(["MONTHLY", "ANNUAL"]),
  customerNote: z.string().trim().max(1000).optional(),
});

export type PlanRequestCreate = z.infer<typeof planRequestCreateSchema>;
