import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time");
const timezone = z.string().trim().min(1).max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Choose a valid timezone");

export const automationSettingsWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });
export const updateAutomationSettingsSchema = z.object({
  timezone,
  sendWindowStart: time,
  sendWindowEnd: time,
  sendDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).transform((days) => [...new Set(days)].sort()),
  retryLimit: z.number().int().min(0).max(10),
}).superRefine((value, context) => {
  if (value.sendWindowStart >= value.sendWindowEnd) context.addIssue({ code: "custom", path: ["sendWindowEnd"], message: "End time must be after the start time" });
});

export type UpdateAutomationSettingsInput = z.infer<typeof updateAutomationSettingsSchema>;
