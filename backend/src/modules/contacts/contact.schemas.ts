import { z } from "zod";

const e164Phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "Phone number must be a complete E.164 number");
const contactName = z.string().trim().min(1).max(160);
const source = z.string().trim().min(1).max(50);
const tagName = z.string().trim().min(1).max(50);

const optionalWhatsappId = z
  .union([
    z.string().trim().min(1).max(64).regex(
      /^[A-Za-z0-9._:-]+$/,
      "WhatsApp ID can contain only letters, numbers, dots, underscores, colons and hyphens",
    ),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((value) => (value === undefined ? undefined : value || null));

const optionalProfileName = z
  .union([z.string().trim().min(1).max(160), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value || null));

const optionalEmail = z
  .union([z.email().max(320), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? value.trim().toLowerCase() : null));

const customAttributes = z
  .record(z.string().trim().min(1).max(80), z.json())
  .refine((value) => Object.keys(value).length <= 100, "A contact can have at most 100 custom fields")
  .refine(
    (value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= 64 * 1024,
    "Custom fields cannot exceed 64 KB",
  );

const tags = z
  .array(tagName)
  .max(20)
  .transform((values) => [
    ...new Map(values.map((value) => [value.toLocaleLowerCase("en-US"), value])).values(),
  ]);

const emptyOperators = ["is_empty", "is_not_empty"] as const;
const customFieldOperator = z.enum([
  "is", "is_not", "contains", "not_contains", ...emptyOperators,
  "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal",
  "before", "after", "on",
]);

export const segmentConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tag"),
    field: z.literal("tags"),
    operator: z.enum(["is", "is_not", "contains"]),
    value: tagName,
  }),
  z.object({
    type: z.literal("field"),
    field: z.enum(["name", "phone", "email", "source", "whatsappOpted", "marketingBlocked"]),
    operator: z.enum(["is", "is_not", "contains", ...emptyOperators]),
    value: z.union([z.string().trim().max(320), z.boolean()]).default(""),
  }).superRefine((condition, context) => {
    if (condition.field === "whatsappOpted" || condition.field === "marketingBlocked") {
      if (!["is", "is_not"].includes(condition.operator) || typeof condition.value !== "boolean") {
        context.addIssue({ code: "custom", message: "WhatsApp opted requires an Is or Is not boolean value" });
      }
      return;
    }
    if (!emptyOperators.includes(condition.operator as (typeof emptyOperators)[number]) && (typeof condition.value !== "string" || !condition.value.length)) {
      context.addIssue({ code: "custom", path: ["value"], message: "A condition value is required" });
    }
  }),
  z.object({
    type: z.literal("custom_field"),
    field: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{0,79}$/),
    operator: customFieldOperator,
    value: z.union([
      z.string().trim().max(5000),
      z.number().finite(),
      z.boolean(),
      z.array(z.string().trim().min(1).max(120)).max(20),
    ]).optional(),
  }).superRefine((condition, context) => {
    if (!emptyOperators.includes(condition.operator as (typeof emptyOperators)[number]) && condition.value === undefined) {
      context.addIssue({ code: "custom", path: ["value"], message: "A condition value is required" });
    }
  }),
]);

const segmentConditions = z.preprocess(
  (value) => {
    if (value === undefined || value === "") return undefined;
    try { return JSON.parse(String(Array.isArray(value) ? value[0] : value)); }
    catch { return value; }
  },
  z.array(segmentConditionSchema).min(1).max(10).optional(),
);

export const createContactSegmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  conditions: z.array(segmentConditionSchema).min(1).max(10),
});

export const updateContactSegmentSchema = createContactSegmentSchema;

export const listContactSegmentsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const createContactSchema = z.object({
  name: contactName,
  phone: e164Phone,
  status: z.string().trim().min(1).max(50).default("New Lead"),
  userId: z.string().trim().min(1).max(160).optional(),
  accountOwnerId: z.string().uuid().nullable().optional(),
  dealValue: z.number().finite().nonnegative().nullable().optional(),
  whatsappId: optionalWhatsappId,
  profileName: optionalProfileName,
  email: optionalEmail,
  source: source.default("Manual"),
  tags: tags.default([]),
  whatsappOpted: z.boolean().default(true),
  whatsappConsentSource: z.string().trim().min(1).max(100).default("Manual"),
  whatsappConsentAt: z.iso.datetime({ offset: true }).optional(),
  marketingBlocked: z.boolean().default(false),
  marketingBlockSource: z.string().trim().min(1).max(100).optional(),
  marketingBlockReason: z.string().trim().max(500).optional(),
  customAttributes: customAttributes.default({}),
});

export const updateContactSchema = z
  .object({
  name: contactName.optional(),
  phone: e164Phone.optional(),
  status: z.string().trim().min(1).max(50).optional(),
  userId: z.string().trim().min(1).max(160).nullable().optional(),
  accountOwnerId: z.string().uuid().nullable().optional(),
  dealValue: z.number().finite().nonnegative().nullable().optional(),
    whatsappId: optionalWhatsappId,
    profileName: optionalProfileName,
    email: optionalEmail,
    source: source.optional(),
    tags: tags.optional(),
    whatsappOpted: z.boolean().optional(),
    whatsappConsentSource: z.string().trim().min(1).max(100).optional(),
    whatsappConsentAt: z.iso.datetime({ offset: true }).optional(),
    marketingBlocked: z.boolean().optional(),
    marketingBlockSource: z.string().trim().min(1).max(100).optional(),
    marketingBlockReason: z.string().trim().max(500).nullable().optional(),
    customAttributes: customAttributes.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const queryList = (item: z.ZodType<string>, maximum: number) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === "") return undefined;
      const values = Array.isArray(value) ? value : [value];
      return values.flatMap((entry) => String(entry).split(",")).map((entry) => entry.trim()).filter(Boolean);
    },
    z.array(item).max(maximum).optional(),
  );

const queryBoolean = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value),
  z.boolean().optional(),
);

const contactSortField = z.enum(["createdAt", "updatedAt", "name", "phone", "email", "source", "profileName"]);
const contactSortRule = z.object({
  field: contactSortField,
  direction: z.enum(["asc", "desc"]),
});
const contactSortRules = z.preprocess(
  (value) => {
    if (value === undefined || value === "") return undefined;
    if (Array.isArray(value)) return value;
    try { return JSON.parse(String(value)); }
    catch { return value; }
  },
  z.array(contactSortRule)
    .min(1)
    .max(5)
    .refine(
      (rules) => new Set(rules.map(({ field }) => field)).size === rules.length,
      "Each sort field can be used only once",
    )
    .optional(),
);

export const listContactsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(200).optional(),
    sources: queryList(z.string().trim().min(1).max(50), 20),
    tags: queryList(tagName, 20),
    tagMode: z.enum(["any", "all"]).default("any"),
    hasEmail: queryBoolean,
    whatsappOpted: queryBoolean,
    marketingBlocked: queryBoolean,
    marketingEligible: queryBoolean,
    createdFrom: z.iso.datetime({ offset: true }).optional(),
    createdTo: z.iso.datetime({ offset: true }).optional(),
    segmentConditions,
    sort: contactSortRules,
    sortBy: contactSortField.default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    ({ createdFrom, createdTo }) => !createdFrom || !createdTo || new Date(createdFrom) <= new Date(createdTo),
    { message: "createdFrom must be earlier than or equal to createdTo", path: ["createdFrom"] },
  );

const importContact = createContactSchema.omit({
  source: true,
  whatsappOpted: true,
  whatsappConsentSource: true,
  whatsappConsentAt: true,
  marketingBlocked: true,
  marketingBlockSource: true,
  marketingBlockReason: true,
}).extend({
  source: source.default("Import"),
  whatsappOpted: z.boolean().optional(),
  whatsappConsentSource: z.string().trim().min(1).max(100).optional(),
  whatsappConsentAt: z.iso.datetime({ offset: true }).optional(),
  marketingBlocked: z.boolean().optional(),
  marketingBlockSource: z.string().trim().min(1).max(100).optional(),
  marketingBlockReason: z.string().trim().max(500).optional(),
});

export const importContactsSchema = z.object({
  contacts: z.array(importContact).min(1).max(500),
  duplicatePolicy: z.enum(["skip", "update", "reject"]).default("skip"),
});

export const bulkTagContactsSchema = z
  .object({
    contactIds: z.array(z.uuid()).min(1).max(500).transform((values) => [...new Set(values)]),
    add: tags.default([]),
    remove: tags.default([]),
  })
  .refine(({ add, remove }) => add.length > 0 || remove.length > 0, "Add or remove at least one tag")
  .refine(
    ({ add, remove }) => {
      const removed = new Set(remove.map((value) => value.toLocaleLowerCase("en-US")));
      return !add.some((value) => removed.has(value.toLocaleLowerCase("en-US")));
    },
    "The same tag cannot be added and removed",
  );

export const bulkDeleteContactsSchema = z.object({
  contactIds: z.array(z.uuid()).min(1).max(500).transform((values) => [...new Set(values)]),
});

export const marketingEligibilitySchema = z.object({
  contactIds: z.array(z.uuid()).min(1).max(500).transform((values) => [...new Set(values)]),
});

export const contactParamsSchema = z.object({ workspaceId: z.uuid(), contactId: z.uuid() });
export const contactWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });
export const contactSegmentParamsSchema = z.object({ workspaceId: z.uuid(), segmentId: z.uuid() });
export const tagListQuerySchema = z.object({ search: z.string().trim().max(50).optional() });

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
export type ContactSortRule = z.infer<typeof contactSortRule>;
export type ImportContactsInput = z.infer<typeof importContactsSchema>;
export type BulkTagContactsInput = z.infer<typeof bulkTagContactsSchema>;
export type BulkDeleteContactsInput = z.infer<typeof bulkDeleteContactsSchema>;
export type MarketingEligibilityInput = z.infer<typeof marketingEligibilitySchema>;
export type SegmentCondition = z.infer<typeof segmentConditionSchema>;
export type CreateContactSegmentInput = z.infer<typeof createContactSegmentSchema>;
export type UpdateContactSegmentInput = z.infer<typeof updateContactSegmentSchema>;
export type ListContactSegmentsQuery = z.infer<typeof listContactSegmentsQuerySchema>;
