import { z } from "zod";

export const usageParamsSchema = z.object({ workspaceId: z.uuid() });
export const usageQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
}).superRefine((value, context) => {
  if (!value.from || !value.to) return;
  const from = new Date(value.from).getTime();
  const to = new Date(value.to).getTime();
  if (from > to) context.addIssue({ code: "custom", path: ["from"], message: "The start date must be before the end date" });
  if (to - from > 366 * 24 * 60 * 60 * 1000) context.addIssue({ code: "custom", path: ["to"], message: "Usage can be requested for at most 366 days" });
});

export type UsageQuery = z.infer<typeof usageQuerySchema>;
