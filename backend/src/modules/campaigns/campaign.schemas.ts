import { z } from "zod";

export const campaignKind = z.enum(["one_time", "ongoing", "api"]);
export const campaignStatus = z.enum(["DRAFT", "SCHEDULED", "RUNNING", "COMPLETED", "PAUSED"]);
export const campaignAudienceType = z.enum(["csv", "manual", "segment", "contacts", "all"]);
export const campaignLaunchMode = z.enum(["draft", "send", "schedule"]);
const e164Phone = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Phone numbers must be complete E.164 numbers");
const templateVariable = z.object({
  source: z.enum(["contact", "custom", "constant"]),
  field: z.string().trim().max(160).default(""),
  fallback: z.string().max(500).default(""),
});

export const campaignWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });
export const campaignIdParamsSchema = campaignWorkspaceParamsSchema.extend({ campaignId: z.uuid() });

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: campaignKind.default("one_time"),
  category: z.string().trim().min(1).max(40).default("Marketing"),
  templateKey: z.string().trim().max(180).nullable().optional(),
  audienceType: campaignAudienceType.default("all"),
  audienceLabel: z.string().trim().min(1).max(255),
  segmentId: z.uuid().optional(),
  contactIds: z.array(z.uuid()).max(10_000).default([]).transform((values) => [...new Set(values)]),
  phoneNumbers: z.array(e164Phone).max(10_000).default([]).transform((values) => [...new Set(values)]),
  launchMode: campaignLaunchMode.default("draft"),
  scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
  retryFailed: z.boolean().default(false),
  templateVariables: z.array(templateVariable).max(50).default([]),
  audienceConfig: z.record(z.string(), z.json()).default({}),
}).superRefine((value, context) => {
  if (value.launchMode === "schedule" && !value.scheduledAt) context.addIssue({ code: "custom", path: ["scheduledAt"], message: "A schedule time is required" });
  if (value.launchMode !== "schedule" && value.scheduledAt) context.addIssue({ code: "custom", path: ["scheduledAt"], message: "A schedule time can only be used with scheduled campaigns" });
  if (value.scheduledAt && new Date(value.scheduledAt).getTime() <= Date.now() && value.launchMode === "schedule") context.addIssue({ code: "custom", path: ["scheduledAt"], message: "The schedule time must be in the future" });
  if (value.audienceType === "contacts" && !value.contactIds.length) context.addIssue({ code: "custom", path: ["contactIds"], message: "Select at least one contact" });
  if ((value.audienceType === "manual" || value.audienceType === "csv") && !value.phoneNumbers.length) context.addIssue({ code: "custom", path: ["phoneNumbers"], message: "Add at least one phone number" });
  if (value.audienceType === "segment" && !value.segmentId) context.addIssue({ code: "custom", path: ["segmentId"], message: "Choose a saved segment" });
  if (value.launchMode !== "draft") value.templateVariables.forEach((variable, index) => {
    if ((variable.source === "contact" || variable.source === "custom") && !variable.field) context.addIssue({ code: "custom", path: ["templateVariables", index, "field"], message: "Choose a field for this variable" });
    if (variable.source === "constant" && !variable.field && !variable.fallback) context.addIssue({ code: "custom", path: ["templateVariables", index], message: "Enter a constant value" });
  });
});

export const campaignListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).default(""),
  status: z.preprocess((value) => typeof value === "string" && value.includes(",") ? value.split(",") : value, z.array(campaignStatus).min(1).optional()),
  kind: campaignKind.optional(),
  category: z.string().trim().max(40).optional(),
  createdById: z.uuid().optional(),
  hasSetLive: z.preprocess((value) => value === "true" ? true : value === "false" ? false : undefined, z.boolean().optional()),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
}).superRefine((value, context) => {
  if (value.from && value.to && new Date(value.from).getTime() > new Date(value.to).getTime()) context.addIssue({ code: "custom", path: ["from"], message: "The start date must be before the end date" });
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
