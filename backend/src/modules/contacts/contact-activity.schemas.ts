import { z } from "zod";

export const activityListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const createContactTaskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5_000).optional(),
  dueAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
});

export const updateContactTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.union([z.string().trim().max(5_000), z.null()]).optional(),
    dueAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
    status: z.enum(["OPEN", "COMPLETED"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const createContactNoteSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().trim().min(1).max(20_000),
});

export const updateContactNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    content: z.string().trim().min(1).max(20_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const activityParamsSchema = z.object({ workspaceId: z.uuid(), contactId: z.uuid() });
export const taskParamsSchema = activityParamsSchema.extend({ taskId: z.uuid() });
export const noteParamsSchema = activityParamsSchema.extend({ noteId: z.uuid() });

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
export type CreateContactTaskInput = z.infer<typeof createContactTaskSchema>;
export type UpdateContactTaskInput = z.infer<typeof updateContactTaskSchema>;
export type CreateContactNoteInput = z.infer<typeof createContactNoteSchema>;
export type UpdateContactNoteInput = z.infer<typeof updateContactNoteSchema>;
