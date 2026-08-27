import { z } from "zod";

const contentSchema = z
  .record(z.string().trim().min(1).max(80), z.json())
  .default({})
  .refine((value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= 256 * 1024, "Template content cannot exceed 256 KB");

export const templateWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });
export const templateParamsSchema = z.object({ workspaceId: z.uuid(), templateId: z.uuid() });

export const createTemplateSchema = z.object({
  saveAs: z.enum(["draft", "submit"]).default("draft"),
  name: z.string().trim().min(1).max(160),
  category: z.enum(["Marketing", "Utility", "Authentication"]).default("Marketing"),
  language: z.string().trim().min(1).max(50),
  templateType: z.enum(["standard", "carousel", "limited"]),
  headerType: z.enum(["none", "text", "image", "video", "doc"]).default("none"),
  headerText: z.string().trim().max(60).optional().nullable(),
  headerFileName: z.string().trim().max(255).optional().nullable(),
  body: z.string().trim().min(1).max(1024),
  footer: z.string().trim().max(60).optional().nullable(),
  content: contentSchema,
});

export const updateTemplateSchema = createTemplateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export const listTemplatesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["active", "deleted", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
