import { z } from "zod";

export const contactCustomFieldTypeSchema = z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTI_SELECT"]);

const fieldLabel = z.string().trim().min(1).max(120);
const fieldKey = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{0,79}$/);
const fieldOptions = z.array(z.string().trim().min(1).max(120)).max(50).transform((values) => [
  ...new Map(values.map((value) => [value.toLocaleLowerCase("en-US"), value])).values(),
]);

export const createContactCustomFieldSchema = z
  .object({
    key: fieldKey.optional(),
    label: fieldLabel,
    type: contactCustomFieldTypeSchema,
    options: fieldOptions.default([]),
    required: z.boolean().default(false),
  })
  .superRefine(({ type, options }, context) => {
    const selectsOptions = type === "SELECT" || type === "MULTI_SELECT";
    if (selectsOptions && options.length === 0) {
      context.addIssue({ code: "custom", path: ["options"], message: "Select fields require at least one option" });
    }
    if (!selectsOptions && options.length > 0) {
      context.addIssue({ code: "custom", path: ["options"], message: "Only select fields can have options" });
    }
  });

export const updateContactCustomFieldSchema = z
  .object({
    label: fieldLabel.optional(),
    options: fieldOptions.optional(),
    required: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const reorderContactCustomFieldsSchema = z.object({
  fieldIds: z.array(z.uuid()).min(1).max(100).transform((values) => [...new Set(values)]),
});

export const contactCustomFieldParamsSchema = z.object({
  workspaceId: z.uuid(),
  fieldId: z.uuid(),
});

export const listContactCustomFieldsQuerySchema = z.object({
  includeArchived: z.preprocess(
    (value) => value === "true" ? true : value === "false" ? false : value,
    z.boolean().default(false),
  ),
});

export type CreateContactCustomFieldInput = z.infer<typeof createContactCustomFieldSchema>;
export type UpdateContactCustomFieldInput = z.infer<typeof updateContactCustomFieldSchema>;
export type ReorderContactCustomFieldsInput = z.infer<typeof reorderContactCustomFieldsSchema>;
export type ListContactCustomFieldsQuery = z.infer<typeof listContactCustomFieldsQuerySchema>;
