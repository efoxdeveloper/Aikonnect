import { z } from "zod";

const variable = z.object({ source: z.enum(["contact", "custom", "constant"]), field: z.string().trim().max(160).default(""), fallback: z.string().max(500).default("") });
export const sequenceStepSchema = z.object({
  id: z.string().trim().min(1).max(80),
  delayMinutes: z.number().int().min(0).max(525_600).default(0),
  templateKey: z.string().trim().min(1).max(180),
  templateVariables: z.array(variable).max(50).default([]),
});

export const sequenceWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });
export const sequenceIdParamsSchema = sequenceWorkspaceParamsSchema.extend({ sequenceId: z.uuid() });
export const sequenceListQuerySchema = z.object({ search: z.string().trim().max(160).default(""), status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export const createSequenceSchema = z.object({ name: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).nullable().optional(), steps: z.array(sequenceStepSchema).min(1).max(30) });
export const enrollSequenceSchema = z.object({ contactIds: z.array(z.uuid()).min(1).max(1000).transform((ids) => [...new Set(ids)]) });
export const eligibleContactsQuerySchema = z.object({ search: z.string().trim().max(200).default("") });

export type SequenceStepInput = z.infer<typeof sequenceStepSchema>;
export type CreateSequenceInput = z.infer<typeof createSequenceSchema>;
export type SequenceListQuery = z.infer<typeof sequenceListQuerySchema>;
