import { z } from "zod";

export const reportKey = z.enum(["overview", "campaigns", "conversations", "contacts", "automations", "templates", "tasks"]);
export const reportParamsSchema = z.object({ workspaceId: z.uuid(), report: reportKey });
export const reportQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  search: z.string().trim().max(200).default(""),
  status: z.string().trim().max(50).optional(),
  channel: z.string().trim().max(50).optional(),
  category: z.string().trim().max(50).optional(),
  source: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).superRefine((value, context) => {
  if (value.from && value.to && new Date(value.from).getTime() > new Date(value.to).getTime()) context.addIssue({ code: "custom", path: ["from"], message: "The start date must be before the end date" });
});

export type ReportKey = z.infer<typeof reportKey>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
