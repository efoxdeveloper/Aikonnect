import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type {
  BulkTagContactsInput,
  BulkDeleteContactsInput,
  CreateContactInput,
  ImportContactsInput,
  ListContactsQuery,
  CreateContactSegmentInput,
  ListContactSegmentsQuery,
  MarketingEligibilityInput,
  SegmentCondition,
  UpdateContactSegmentInput,
  UpdateContactInput,
} from "./contact.schemas.js";
import {
  activeCustomFieldDefinitions,
  syncContactCustomFieldValues,
  validateCustomFieldValues,
} from "./contact-custom-field.service.js";

const contactInclude = {
  tagAssignments: {
    orderBy: { tag: { name: "asc" as const } },
    select: { tag: { select: { id: true, name: true, color: true } } },
  },
  accountOwner: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.ContactInclude;

type ContactRecord = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;
type Visibility = { canViewPhone: boolean; canViewFields: boolean };

function normalizedTagName(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function serializeContact(contact: ContactRecord, visibility: Visibility) {
  return {
    id: contact.id,
    name: contact.name,
    phone: visibility.canViewPhone ? contact.phoneE164 : null,
    hasPhone: true,
    whatsappId: visibility.canViewPhone ? contact.whatsappId : null,
    hasWhatsappId: contact.whatsappId !== null,
    profileName: contact.profileName,
    email: contact.email,
    source: contact.source,
    status: contact.status,
    userId: contact.userId,
    accountOwnerId: contact.accountOwnerId,
    accountOwner: contact.accountOwner,
    dealValue: contact.dealValue === null ? null : Number(contact.dealValue),
    whatsappOpted: contact.whatsappOpted,
    whatsappOptInSource: contact.whatsappOptInSource,
    whatsappOptedInAt: contact.whatsappOptedInAt,
    whatsappOptOutSource: contact.whatsappOptOutSource,
    whatsappOptedOutAt: contact.whatsappOptedOutAt,
    marketingBlocked: contact.marketingBlocked,
    marketingBlockedAt: contact.marketingBlockedAt,
    marketingBlockSource: contact.marketingBlockSource,
    marketingBlockReason: contact.marketingBlockReason,
    marketingEligible: contact.whatsappOpted && !contact.marketingBlocked,
    tags: contact.tagAssignments.map(({ tag }) => tag),
    ...(visibility.canViewFields ? { customAttributes: contact.customAttributes } : {}),
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function phoneConflict(): AppError {
  return new AppError(
    409,
    "A contact with this phone number already exists in this workspace",
    "CONTACT_PHONE_EXISTS",
  );
}

function whatsappIdConflict(): AppError {
  return new AppError(
    409,
    "A contact with this WhatsApp ID already exists in this workspace",
    "CONTACT_WHATSAPP_ID_EXISTS",
  );
}

function uniqueContactIdentityConflict(error: unknown): AppError {
  const target = error && typeof error === "object" && "meta" in error
    ? JSON.stringify((error as { meta?: unknown }).meta).toLocaleLowerCase("en-US")
    : "";
  return target.includes("whatsapp") ? whatsappIdConflict() : phoneConflict();
}

type FilterableCustomField = Awaited<ReturnType<typeof activeCustomFieldDefinitions>>[number];

const emptySegmentOperators = new Set(["is_empty", "is_not_empty"]);

function invalidCustomFilter(field: FilterableCustomField, message: string): never {
  throw new AppError(422, `${field.label}: ${message}`, "CONTACT_CUSTOM_FIELD_FILTER_INVALID", { field: field.key });
}

function customFieldConditionFilter(field: FilterableCustomField, condition: Extract<SegmentCondition, { type: "custom_field" }>): Prisma.ContactWhereInput {
  const base = { fieldId: field.id };
  if (condition.operator === "is_empty") return { customFieldValues: { none: base } };
  if (condition.operator === "is_not_empty") return { customFieldValues: { some: base } };
  const value = condition.value;

  if (field.type === "TEXT") {
    if (typeof value !== "string" || !["is", "is_not", "contains", "not_contains"].includes(condition.operator)) invalidCustomFilter(field, "choose a valid text operator and value");
    const comparison = condition.operator === "contains" || condition.operator === "not_contains"
      ? { contains: value, mode: "insensitive" as const }
      : { equals: value, mode: "insensitive" as const };
    const textValue = condition.operator === "is_not" || condition.operator === "not_contains" ? { not: comparison } : comparison;
    return { customFieldValues: { some: { ...base, textValue } } };
  }
  if (field.type === "SELECT") {
    if (typeof value !== "string" || !["is", "is_not"].includes(condition.operator) || !optionsFromDefinition(field).includes(value)) invalidCustomFilter(field, "select an available option");
    return { customFieldValues: { some: { ...base, textValue: condition.operator === "is_not" ? { not: value } : value } } };
  }
  if (field.type === "MULTI_SELECT") {
    if (typeof value !== "string" || !["contains", "not_contains"].includes(condition.operator) || !optionsFromDefinition(field).includes(value)) invalidCustomFilter(field, "select an available option");
    return { customFieldValues: { some: condition.operator === "not_contains" ? { ...base, NOT: { stringValues: { has: value } } } : { ...base, stringValues: { has: value } } } };
  }
  if (field.type === "NUMBER") {
    if (typeof value !== "number" || !Number.isFinite(value)) invalidCustomFilter(field, "enter a valid number");
    const operators: Record<string, Prisma.FloatNullableFilter> = {
      is: { equals: value }, is_not: { not: value }, greater_than: { gt: value }, greater_than_or_equal: { gte: value }, less_than: { lt: value }, less_than_or_equal: { lte: value },
    };
    const numberValue = operators[condition.operator];
    if (!numberValue) invalidCustomFilter(field, "choose a valid number operator");
    return { customFieldValues: { some: { ...base, numberValue } } };
  }
  if (field.type === "DATE") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalidCustomFilter(field, "enter a valid date");
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) invalidCustomFilter(field, "enter a valid date");
    const operators: Record<string, Prisma.DateTimeNullableFilter> = { on: { equals: date }, is: { equals: date }, is_not: { not: date }, before: { lt: date }, after: { gt: date } };
    const dateValue = operators[condition.operator];
    if (!dateValue) invalidCustomFilter(field, "choose a valid date operator");
    return { customFieldValues: { some: { ...base, dateValue } } };
  }
  if (typeof value !== "boolean" || !["is", "is_not"].includes(condition.operator)) invalidCustomFilter(field, "select yes or no");
  return { customFieldValues: { some: { ...base, booleanValue: condition.operator === "is_not" ? { not: value } : value } } };
}

function optionsFromDefinition(field: FilterableCustomField): string[] {
  return Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === "string") : [];
}

function applySegmentCondition(filters: Prisma.ContactWhereInput[], workspaceId: string, condition: SegmentCondition, visibility: Visibility, customFieldsByKey: Map<string, FilterableCustomField>) {
  if (condition.type === "tag") {
    const normalizedValue = normalizedTagName(condition.value);
    const tagFilter = condition.operator === "contains"
      ? { workspaceId, normalizedName: { contains: normalizedValue } }
      : { workspaceId, normalizedName: normalizedValue };
    const assignment = { tagAssignments: { some: { tag: tagFilter } } };
    filters.push(condition.operator === "is_not" ? { NOT: assignment } : assignment);
    return;
  }
  if (condition.type === "custom_field") {
    if (!visibility.canViewFields) throw new AppError(403, "You do not have permission to filter by custom fields", "PERMISSION_DENIED");
    const field = customFieldsByKey.get(condition.field);
    if (!field) throw new AppError(422, `Unknown or archived custom field: ${condition.field}`, "CONTACT_CUSTOM_FIELD_UNKNOWN", { field: condition.field });
    filters.push(customFieldConditionFilter(field, condition));
    return;
  }
  if (condition.field === "phone" && !visibility.canViewPhone) {
    filters.push({ id: "00000000-0000-0000-0000-000000000000" });
    return;
  }
  if (condition.field === "whatsappOpted" || condition.field === "marketingBlocked") {
    const comparison = { [condition.field]: condition.value as boolean };
    filters.push(condition.operator === "is_not" ? { NOT: comparison } : comparison);
    return;
  }
  const field = condition.field === "phone" ? "phoneE164" : condition.field;
  if (condition.operator === "is_empty" || condition.operator === "is_not_empty") {
    const empty = field === "email" ? { OR: [{ email: null }, { email: "" }] } : { [field]: "" };
    filters.push(condition.operator === "is_not_empty" ? { NOT: empty } : empty);
    return;
  }
  const stringFilter = condition.operator === "contains"
    ? { contains: condition.value, mode: "insensitive" as const }
    : { equals: condition.value, mode: "insensitive" as const };
  filters.push(condition.operator === "is_not" ? { NOT: { [field]: stringFilter } } : { [field]: stringFilter });
}

async function resolveTags(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  names: string[],
) {
  if (names.length === 0) return [];
  const uniqueTags = [
    ...new Map(names.map((name) => [normalizedTagName(name), { name, normalizedName: normalizedTagName(name) }])).values(),
  ];
  await transaction.contactTag.createMany({
    data: uniqueTags.map((tag) => ({ workspaceId, ...tag })),
    skipDuplicates: true,
  });
  return transaction.contactTag.findMany({
    where: { workspaceId, normalizedName: { in: uniqueTags.map(({ normalizedName }) => normalizedName) } },
    select: { id: true, name: true, normalizedName: true },
  });
}

function contactData(input: Partial<CreateContactInput> | UpdateContactInput, actorUserId: string) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phoneE164: input.phone } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    ...(input.accountOwnerId !== undefined ? { accountOwnerId: input.accountOwnerId } : {}),
    ...(input.dealValue !== undefined ? { dealValue: input.dealValue } : {}),
    ...(input.whatsappId !== undefined ? { whatsappId: input.whatsappId } : {}),
    ...(input.profileName !== undefined ? { profileName: input.profileName } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.customAttributes !== undefined
      ? { customAttributes: input.customAttributes as Prisma.InputJsonValue }
      : {}),
    updatedById: actorUserId,
  };
}

function consentDate(value: string | undefined, field: string): Date {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.valueOf()) || date.valueOf() > Date.now() + 5 * 60 * 1000) {
    throw new AppError(422, `${field} cannot be in the future`, "CONTACT_CONSENT_TIMESTAMP_INVALID", { field });
  }
  return date;
}

type ConsentState = Pick<ContactRecord, "whatsappOpted" | "whatsappOptInSource" | "whatsappOptedInAt" | "whatsappOptOutSource" | "whatsappOptedOutAt" | "marketingBlocked" | "marketingBlockedAt" | "marketingBlockSource" | "marketingBlockReason">;
type ConsentEventInput = { type: "OPT_IN" | "OPT_OUT" | "BLOCK" | "UNBLOCK"; source: string; reason?: string | null; occurredAt: Date };

function consentTransition(existing: ConsentState, input: UpdateContactInput) {
  const data: Prisma.ContactUncheckedUpdateInput = {};
  const events: ConsentEventInput[] = [];
  const opted = input.whatsappOpted ?? existing.whatsappOpted;
  const optedChanged = input.whatsappOpted !== undefined && input.whatsappOpted !== existing.whatsappOpted;

  if (input.marketingBlocked === false && !opted) {
    throw new AppError(422, "An opted-out contact cannot be unblocked for marketing", "CONTACT_MARKETING_CONSENT_REQUIRED");
  }

  if (input.whatsappOpted !== undefined) data.whatsappOpted = input.whatsappOpted;
  if (optedChanged || input.whatsappConsentSource !== undefined || input.whatsappConsentAt !== undefined) {
    const source = input.whatsappConsentSource ?? "Manual";
    const occurredAt = consentDate(input.whatsappConsentAt, "whatsappConsentAt");
    if (opted) {
      data.whatsappOptInSource = source; data.whatsappOptedInAt = occurredAt;
      if (optedChanged) events.push({ type: "OPT_IN", source, occurredAt });
    } else {
      data.whatsappOptOutSource = source; data.whatsappOptedOutAt = occurredAt;
      data.marketingBlocked = true; data.marketingBlockedAt = occurredAt;
      data.marketingBlockSource = source; data.marketingBlockReason = input.marketingBlockReason ?? "WhatsApp opt-out";
      if (optedChanged) events.push({ type: "OPT_OUT", source, reason: input.marketingBlockReason ?? "WhatsApp opt-out", occurredAt });
    }
  }

  const explicitBlockChanged = input.marketingBlocked !== undefined && input.marketingBlocked !== existing.marketingBlocked;
  if (input.marketingBlocked !== undefined && opted) {
    const source = input.marketingBlockSource ?? "Manual";
    const occurredAt = new Date();
    data.marketingBlocked = input.marketingBlocked;
    if (input.marketingBlocked) {
      data.marketingBlockedAt = occurredAt; data.marketingBlockSource = source;
      data.marketingBlockReason = input.marketingBlockReason ?? "Blocked manually";
      if (explicitBlockChanged) events.push({ type: "BLOCK", source, reason: input.marketingBlockReason ?? "Blocked manually", occurredAt });
    } else {
      data.marketingBlockedAt = null; data.marketingBlockSource = null; data.marketingBlockReason = null;
      if (explicitBlockChanged) events.push({ type: "UNBLOCK", source, occurredAt });
    }
  } else if (optedChanged && opted) {
    data.marketingBlocked = false; data.marketingBlockedAt = null; data.marketingBlockSource = null; data.marketingBlockReason = null;
  }
  return { data, events };
}

export async function listContacts(
  workspaceId: string,
  query: ListContactsQuery,
  visibility: Visibility,
) {
  const sortRules = query.sort?.length
    ? query.sort
    : [{ field: query.sortBy, direction: query.sortOrder }];
  if (sortRules.some(({ field }) => field === "phone") && !visibility.canViewPhone) {
    throw new AppError(403, "You do not have permission to sort contacts by phone number", "PERMISSION_DENIED");
  }
  const filters: Prisma.ContactWhereInput[] = [{ workspaceId, deletedAt: null }];
  if (query.search) {
    filters.push({
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { profileName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        ...(visibility.canViewPhone
          ? [
              { phoneE164: { contains: query.search } },
              { whatsappId: { contains: query.search, mode: "insensitive" as const } },
            ]
          : []),
      ],
    });
  }
  if (query.sources?.length) filters.push({ source: { in: query.sources } });
  if (query.tags?.length) {
    const normalizedTags = [...new Set(query.tags.map(normalizedTagName))];
    filters.push(
      query.tagMode === "all"
        ? {
            AND: normalizedTags.map((name) => ({
              tagAssignments: { some: { tag: { workspaceId, normalizedName: name } } },
            })),
          }
        : {
            tagAssignments: {
              some: { tag: { workspaceId, normalizedName: { in: normalizedTags } } },
            },
          },
    );
  }
  if (query.hasEmail !== undefined) {
    filters.push(query.hasEmail ? { email: { not: null } } : { email: null });
  }
  if (query.whatsappOpted !== undefined) filters.push({ whatsappOpted: query.whatsappOpted });
  if (query.marketingBlocked !== undefined) filters.push({ marketingBlocked: query.marketingBlocked });
  if (query.marketingEligible !== undefined) {
    filters.push(query.marketingEligible
      ? { whatsappOpted: true, marketingBlocked: false }
      : { OR: [{ whatsappOpted: false }, { marketingBlocked: true }] });
  }
  if (query.createdFrom || query.createdTo) {
    filters.push({
      createdAt: {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
      },
    });
  }
  const customConditions = query.segmentConditions?.filter((condition): condition is Extract<SegmentCondition, { type: "custom_field" }> => condition.type === "custom_field") ?? [];
  const customFields = customConditions.length ? await activeCustomFieldDefinitions(workspaceId) : [];
  const customFieldsByKey = new Map(customFields.map((field) => [field.key, field]));
  query.segmentConditions?.forEach((condition) => applySegmentCondition(filters, workspaceId, condition, visibility, customFieldsByKey));

  const where: Prisma.ContactWhereInput = { AND: filters };
  const orderBy: Prisma.ContactOrderByWithRelationInput[] = sortRules.map(({ field, direction }) => {
    const sortField = field === "phone" ? "phoneE164" : field;
    return sortField === "email" || sortField === "profileName"
      ? { [sortField]: { sort: direction, nulls: "last" as const } }
      : { [sortField]: direction };
  });
  orderBy.push({ id: sortRules.at(-1)?.direction ?? "asc" });
  const skip = (query.page - 1) * query.pageSize;
  const [total, contacts] = await prisma.$transaction([
    prisma.contact.count({ where }),
    prisma.contact.findMany({ where, orderBy, skip, take: query.pageSize, include: contactInclude }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    items: contacts.map((contact) => serializeContact(contact, visibility)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevious: query.page > 1,
    },
  };
}

export async function getContact(workspaceId: string, contactId: string, visibility: Visibility) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId, deletedAt: null },
    include: contactInclude,
  });
  if (!contact) throw new AppError(404, "Contact was not found", "CONTACT_NOT_FOUND");
  return serializeContact(contact, visibility);
}

export async function createContact(
  workspaceId: string,
  actorUserId: string,
  input: CreateContactInput,
  visibility: Visibility,
) {
  const customFieldDefinitions = await activeCustomFieldDefinitions(workspaceId);
  validateCustomFieldValues(customFieldDefinitions, input.customAttributes);
  const consentAt = consentDate(input.whatsappConsentAt, "whatsappConsentAt");
  const marketingBlocked = !input.whatsappOpted || input.marketingBlocked;
  const consentSource = input.whatsappConsentSource;
  const blockSource = input.marketingBlockSource ?? (!input.whatsappOpted ? consentSource : "Manual");
  try {
    const contact = await prisma.$transaction(async (transaction) => {
      const resolvedTags = await resolveTags(transaction, workspaceId, input.tags);
      const created = await transaction.contact.create({
        data: {
          workspaceId,
          name: input.name,
          phoneE164: input.phone,
          whatsappId: input.whatsappId,
          profileName: input.profileName,
          email: input.email ?? null,
          source: input.source,
          status: input.status,
          userId: input.userId,
          accountOwnerId: input.accountOwnerId ?? null,
          dealValue: input.dealValue ?? null,
          whatsappOpted: input.whatsappOpted,
          whatsappOptInSource: input.whatsappOpted ? consentSource : null,
          whatsappOptedInAt: input.whatsappOpted ? consentAt : null,
          whatsappOptOutSource: input.whatsappOpted ? null : consentSource,
          whatsappOptedOutAt: input.whatsappOpted ? null : consentAt,
          marketingBlocked,
          marketingBlockedAt: marketingBlocked ? consentAt : null,
          marketingBlockSource: marketingBlocked ? blockSource : null,
          marketingBlockReason: marketingBlocked ? input.marketingBlockReason ?? (!input.whatsappOpted ? "WhatsApp opt-out" : "Blocked manually") : null,
          customAttributes: input.customAttributes as Prisma.InputJsonValue,
          createdById: actorUserId,
          updatedById: actorUserId,
        },
        select: { id: true },
      });
      if (resolvedTags.length) {
        await transaction.contactTagAssignment.createMany({
          data: resolvedTags.map(({ id: tagId }) => ({ contactId: created.id, tagId })),
        });
      }
      await transaction.contactConsentEvent.create({
        data: {
          workspaceId,
          contactId: created.id,
          type: input.whatsappOpted ? "OPT_IN" : "OPT_OUT",
          source: consentSource,
          reason: input.whatsappOpted ? null : input.marketingBlockReason ?? "WhatsApp opt-out",
          occurredAt: consentAt,
          actorUserId,
        },
      });
      if (input.whatsappOpted && marketingBlocked) {
        await transaction.contactConsentEvent.create({
          data: { workspaceId, contactId: created.id, type: "BLOCK", source: blockSource, reason: input.marketingBlockReason ?? "Blocked manually", occurredAt: consentAt, actorUserId },
        });
      }
      await syncContactCustomFieldValues(transaction, workspaceId, created.id, customFieldDefinitions, input.customAttributes);
      return transaction.contact.findUniqueOrThrow({ where: { id: created.id }, include: contactInclude });
    });
    return serializeContact(contact, visibility);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw uniqueContactIdentityConflict(error);
    throw error;
  }
}

export async function updateContact(
  workspaceId: string,
  contactId: string,
  actorUserId: string,
  input: UpdateContactInput,
  visibility: Visibility,
) {
  try {
    const contact = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.contact.findFirst({
        where: { id: contactId, workspaceId, deletedAt: null },
        select: {
          id: true, customAttributes: true, whatsappOpted: true, whatsappOptInSource: true,
          whatsappOptedInAt: true, whatsappOptOutSource: true, whatsappOptedOutAt: true,
          marketingBlocked: true, marketingBlockedAt: true, marketingBlockSource: true, marketingBlockReason: true,
        },
      });
      if (!existing) throw new AppError(404, "Contact was not found", "CONTACT_NOT_FOUND");

      let definitions: Awaited<ReturnType<typeof activeCustomFieldDefinitions>> = [];
      if (input.customAttributes !== undefined) {
        definitions = await transaction.contactCustomField.findMany({
          where: { workspaceId, archivedAt: null },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: { id: true, key: true, label: true, type: true, options: true, required: true },
        });
        validateCustomFieldValues(
          definitions,
          input.customAttributes,
          existing.customAttributes as Record<string, unknown>,
        );
      }

      if (input.tags) {
        const resolvedTags = await resolveTags(transaction, workspaceId, input.tags);
        await transaction.contactTagAssignment.deleteMany({ where: { contactId } });
        if (resolvedTags.length) {
          await transaction.contactTagAssignment.createMany({
            data: resolvedTags.map(({ id }) => ({ contactId, tagId: id })),
            skipDuplicates: true,
          });
        }
      }
      const consent = consentTransition(existing, input);
      const updated = await transaction.contact.update({
        where: { id: contactId, workspaceId, deletedAt: null },
        data: { ...contactData(input, actorUserId), ...consent.data },
        include: contactInclude,
      });
      if (consent.events.length) {
        await transaction.contactConsentEvent.createMany({
          data: consent.events.map((event) => ({ ...event, workspaceId, contactId, actorUserId })),
        });
      }
      if (input.customAttributes !== undefined) {
        await syncContactCustomFieldValues(transaction, workspaceId, contactId, definitions, input.customAttributes);
      }
      return updated;
    });
    return serializeContact(contact, visibility);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw uniqueContactIdentityConflict(error);
    throw error;
  }
}

export async function deleteContact(workspaceId: string, contactId: string, actorUserId: string): Promise<void> {
  const result = await prisma.contact.updateMany({
    where: { id: contactId, workspaceId, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: actorUserId, updatedById: actorUserId },
  });
  if (result.count !== 1) throw new AppError(404, "Contact was not found", "CONTACT_NOT_FOUND");
}

export async function getMarketingEligibility(workspaceId: string, input: MarketingEligibilityInput) {
  const contacts = await prisma.contact.findMany({
    where: { workspaceId, deletedAt: null, id: { in: input.contactIds } },
    select: { id: true, whatsappOpted: true, marketingBlocked: true },
  });
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const eligibleContactIds: string[] = [];
  const excluded: Array<{ contactId: string; reason: "NOT_FOUND" | "OPTED_OUT" | "MARKETING_BLOCKED" }> = [];
  for (const contactId of input.contactIds) {
    const contact = byId.get(contactId);
    if (!contact) excluded.push({ contactId, reason: "NOT_FOUND" });
    else if (!contact.whatsappOpted) excluded.push({ contactId, reason: "OPTED_OUT" });
    else if (contact.marketingBlocked) excluded.push({ contactId, reason: "MARKETING_BLOCKED" });
    else eligibleContactIds.push(contactId);
  }
  return { eligibleContactIds, excluded };
}

export async function assertMarketingEligibleContacts(workspaceId: string, contactIds: string[]) {
  const result = await getMarketingEligibility(workspaceId, { contactIds });
  if (result.excluded.length) {
    throw new AppError(422, "One or more contacts cannot receive marketing campaigns", "CAMPAIGN_CONTACTS_INELIGIBLE", result);
  }
  return result.eligibleContactIds;
}

export async function listTags(workspaceId: string, search?: string) {
  const tags = await prisma.contactTag.findMany({
    where: {
      workspaceId,
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { assignments: { where: { contact: { deletedAt: null } } } } },
    },
  });
  return tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color, contactCount: tag._count.assignments }));
}

export async function listSegments(workspaceId: string, query: ListContactSegmentsQuery) {
  const where = { workspaceId, ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}) };
  const [total, items] = await prisma.$transaction([
    prisma.contactSegment.count({ where }),
    prisma.contactSegment.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { items: items.map((segment) => ({ id: segment.id, name: segment.name, conditions: segment.definition, createdAt: segment.createdAt, updatedAt: segment.updatedAt })), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
}

async function validateCustomSegmentConditions(workspaceId: string, conditions: SegmentCondition[]) {
  const customConditions = conditions.filter((condition): condition is Extract<SegmentCondition, { type: "custom_field" }> => condition.type === "custom_field");
  if (!customConditions.length) return;
  const definitions = await activeCustomFieldDefinitions(workspaceId);
  const byKey = new Map(definitions.map((field) => [field.key, field]));
  customConditions.forEach((condition) => {
    const field = byKey.get(condition.field);
    if (!field) throw new AppError(422, `Unknown or archived custom field: ${condition.field}`, "CONTACT_CUSTOM_FIELD_UNKNOWN", { field: condition.field });
    customFieldConditionFilter(field, condition);
  });
}

export async function createSegment(workspaceId: string, actorUserId: string, input: CreateContactSegmentInput) {
  await validateCustomSegmentConditions(workspaceId, input.conditions);
  try {
    const segment = await prisma.contactSegment.create({
      data: { workspaceId, name: input.name, normalizedName: input.name.toLocaleLowerCase("en-US"), definition: input.conditions as Prisma.InputJsonValue, createdById: actorUserId, updatedById: actorUserId },
    });
    return { id: segment.id, name: segment.name, conditions: segment.definition, createdAt: segment.createdAt, updatedAt: segment.updatedAt };
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppError(409, "A segment with this name already exists", "CONTACT_SEGMENT_NAME_EXISTS");
    throw error;
  }
}

export async function updateSegment(
  workspaceId: string,
  segmentId: string,
  actorUserId: string,
  input: UpdateContactSegmentInput,
) {
  await validateCustomSegmentConditions(workspaceId, input.conditions);
  const existing = await prisma.contactSegment.findFirst({
    where: { id: segmentId, workspaceId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Segment was not found", "CONTACT_SEGMENT_NOT_FOUND");

  try {
    const segment = await prisma.contactSegment.update({
      where: { id: segmentId },
      data: {
        name: input.name,
        normalizedName: input.name.toLocaleLowerCase("en-US"),
        definition: input.conditions as Prisma.InputJsonValue,
        updatedById: actorUserId,
      },
    });
    return {
      id: segment.id,
      name: segment.name,
      conditions: segment.definition,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, "A segment with this name already exists", "CONTACT_SEGMENT_NAME_EXISTS");
    }
    throw error;
  }
}

export async function deleteSegment(workspaceId: string, segmentId: string): Promise<void> {
  const result = await prisma.contactSegment.deleteMany({ where: { id: segmentId, workspaceId } });
  if (result.count !== 1) throw new AppError(404, "Segment was not found", "CONTACT_SEGMENT_NOT_FOUND");
}

export async function bulkTagContacts(
  workspaceId: string,
  input: BulkTagContactsInput,
) {
  return prisma.$transaction(async (transaction) => {
    const contacts = await transaction.contact.findMany({
      where: { workspaceId, deletedAt: null, id: { in: input.contactIds } },
      select: { id: true },
    });
    const foundIds = new Set(contacts.map(({ id }) => id));
    const missingContactIds = input.contactIds.filter((id) => !foundIds.has(id));
    if (missingContactIds.length) {
      throw new AppError(404, "One or more contacts were not found", "CONTACTS_NOT_FOUND", { missingContactIds });
    }

    const addedTags = await resolveTags(transaction, workspaceId, input.add);
    const removedTags = input.remove.length
      ? await transaction.contactTag.findMany({
          where: { workspaceId, normalizedName: { in: input.remove.map(normalizedTagName) } },
          select: { id: true },
        })
      : [];
    if (removedTags.length) {
      await transaction.contactTagAssignment.deleteMany({
        where: { contactId: { in: input.contactIds }, tagId: { in: removedTags.map(({ id }) => id) } },
      });
    }
    if (addedTags.length) {
      await transaction.contactTagAssignment.createMany({
        data: input.contactIds.flatMap((contactId) => addedTags.map(({ id: tagId }) => ({ contactId, tagId }))),
        skipDuplicates: true,
      });
    }
    return { updatedCount: contacts.length };
  });
}

export async function bulkDeleteContacts(
  workspaceId: string,
  actorUserId: string,
  input: BulkDeleteContactsInput,
) {
  return prisma.$transaction(async (transaction) => {
    const activeContacts = await transaction.contact.findMany({
      where: { workspaceId, deletedAt: null, id: { in: input.contactIds } },
      select: { id: true },
    });
    const activeIds = new Set(activeContacts.map(({ id }) => id));
    const missingContactIds = input.contactIds.filter((id) => !activeIds.has(id));
    if (missingContactIds.length) {
      throw new AppError(404, "One or more contacts were not found", "CONTACTS_NOT_FOUND", { missingContactIds });
    }
    const result = await transaction.contact.updateMany({
      where: { workspaceId, deletedAt: null, id: { in: input.contactIds } },
      data: { deletedAt: new Date(), deletedById: actorUserId, updatedById: actorUserId },
    });
    return { deletedCount: result.count };
  });
}

export async function importContacts(
  workspaceId: string,
  actorUserId: string,
  input: ImportContactsInput,
) {
  const customFieldDefinitions = await activeCustomFieldDefinitions(workspaceId);
  input.contacts.forEach((contact) => validateCustomFieldValues(customFieldDefinitions, contact.customAttributes));
  const inputIndexes = new Map<string, number[]>();
  input.contacts.forEach((contact, index) => {
    const indexes = inputIndexes.get(contact.phone) ?? [];
    indexes.push(index);
    inputIndexes.set(contact.phone, indexes);
  });
  const duplicateInput = [...inputIndexes.entries()].filter(([, indexes]) => indexes.length > 1);
  if (input.duplicatePolicy === "reject" && duplicateInput.length) {
    throw new AppError(409, "The import contains duplicate phone numbers", "IMPORT_DUPLICATE_PHONE", {
      duplicates: duplicateInput.map(([phone, indexes]) => ({ phone, rows: indexes.map((index) => index + 1) })),
    });
  }

  const existingContacts = await prisma.contact.findMany({
    where: { workspaceId, deletedAt: null, phoneE164: { in: [...inputIndexes.keys()] } },
    select: {
      id: true, phoneE164: true, whatsappOpted: true, whatsappOptInSource: true, whatsappOptedInAt: true,
      whatsappOptOutSource: true, whatsappOptedOutAt: true, marketingBlocked: true, marketingBlockedAt: true,
      marketingBlockSource: true, marketingBlockReason: true,
    },
  });
  if (input.duplicatePolicy === "reject" && existingContacts.length) {
    throw new AppError(409, "One or more contacts already exist", "CONTACT_PHONE_EXISTS", {
      rows: existingContacts.flatMap(({ phoneE164 }) => (inputIndexes.get(phoneE164) ?? []).map((index) => index + 1)),
    });
  }

  return prisma.$transaction(async (transaction) => {
    const allTagNames = input.contacts.flatMap(({ tags: contactTags }) => contactTags);
    const resolvedTags = await resolveTags(transaction, workspaceId, allTagNames);
    const tagsByName = new Map(resolvedTags.map((tag) => [tag.normalizedName, tag.id]));
    const existingByPhone = new Map(existingContacts.map((contact) => [contact.phoneE164, contact]));
    const results: Array<{ row: number; action: "created" | "updated" | "skipped"; contactId?: string; reason?: string }> = [];
    for (let index = 0; index < input.contacts.length; index += 1) {
      const contactInput = input.contacts[index] as ImportContactsInput["contacts"][number];
      const duplicateIndexes = inputIndexes.get(contactInput.phone) as number[];
      const winningIndex = input.duplicatePolicy === "update" ? duplicateIndexes.at(-1) : duplicateIndexes[0];
      if (index !== winningIndex) {
        results.push({
          row: index + 1,
          action: "skipped",
          reason: input.duplicatePolicy === "update" ? "superseded_in_file" : "duplicate_in_file",
        });
        continue;
      }

      const existing = existingByPhone.get(contactInput.phone);
      if (existing && input.duplicatePolicy === "skip") {
        results.push({ row: index + 1, action: "skipped", contactId: existing.id, reason: "already_exists" });
        continue;
      }
      const tagIds = contactInput.tags.map((name) => tagsByName.get(normalizedTagName(name)) as string);
      if (existing) {
        await transaction.contactTagAssignment.deleteMany({ where: { contactId: existing.id } });
        if (tagIds.length) {
          await transaction.contactTagAssignment.createMany({
            data: tagIds.map((tagId) => ({ contactId: existing.id, tagId })),
            skipDuplicates: true,
          });
        }
        const includesConsent = contactInput.whatsappOpted !== undefined || contactInput.whatsappConsentSource !== undefined || contactInput.whatsappConsentAt !== undefined || contactInput.marketingBlocked !== undefined || contactInput.marketingBlockSource !== undefined || contactInput.marketingBlockReason !== undefined;
        const consent = includesConsent ? consentTransition(existing, contactInput) : { data: {}, events: [] as ConsentEventInput[] };
        await transaction.contact.update({
          where: { id: existing.id, workspaceId, deletedAt: null },
          data: { ...contactData(contactInput, actorUserId), ...consent.data },
        });
        if (consent.events.length) await transaction.contactConsentEvent.createMany({ data: consent.events.map((event) => ({ ...event, workspaceId, contactId: existing.id, actorUserId })) });
        await syncContactCustomFieldValues(transaction, workspaceId, existing.id, customFieldDefinitions, contactInput.customAttributes);
        results.push({ row: index + 1, action: "updated", contactId: existing.id });
      } else {
        const whatsappOpted = contactInput.whatsappOpted ?? true;
        const consentSource = contactInput.whatsappConsentSource ?? "Import";
        const consentAt = consentDate(contactInput.whatsappConsentAt, "whatsappConsentAt");
        const marketingBlocked = !whatsappOpted || (contactInput.marketingBlocked ?? false);
        const blockSource = contactInput.marketingBlockSource ?? (!whatsappOpted ? consentSource : "Import");
        const created = await transaction.contact.create({
          data: {
            workspaceId,
            name: contactInput.name,
            phoneE164: contactInput.phone,
            whatsappId: contactInput.whatsappId,
            profileName: contactInput.profileName,
            email: contactInput.email ?? null,
            source: contactInput.source,
            whatsappOpted,
            whatsappOptInSource: whatsappOpted ? consentSource : null,
            whatsappOptedInAt: whatsappOpted ? consentAt : null,
            whatsappOptOutSource: whatsappOpted ? null : consentSource,
            whatsappOptedOutAt: whatsappOpted ? null : consentAt,
            marketingBlocked,
            marketingBlockedAt: marketingBlocked ? consentAt : null,
            marketingBlockSource: marketingBlocked ? blockSource : null,
            marketingBlockReason: marketingBlocked ? contactInput.marketingBlockReason ?? (!whatsappOpted ? "WhatsApp opt-out" : "Blocked manually") : null,
            customAttributes: contactInput.customAttributes as Prisma.InputJsonValue,
            createdById: actorUserId,
            updatedById: actorUserId,
          },
          select: { id: true },
        });
        if (tagIds.length) {
          await transaction.contactTagAssignment.createMany({
            data: tagIds.map((tagId) => ({ contactId: created.id, tagId })),
          });
        }
        await transaction.contactConsentEvent.create({ data: { workspaceId, contactId: created.id, type: whatsappOpted ? "OPT_IN" : "OPT_OUT", source: consentSource, reason: whatsappOpted ? null : contactInput.marketingBlockReason ?? "WhatsApp opt-out", occurredAt: consentAt, actorUserId } });
        if (whatsappOpted && marketingBlocked) await transaction.contactConsentEvent.create({ data: { workspaceId, contactId: created.id, type: "BLOCK", source: blockSource, reason: contactInput.marketingBlockReason ?? "Blocked manually", occurredAt: consentAt, actorUserId } });
        await syncContactCustomFieldValues(transaction, workspaceId, created.id, customFieldDefinitions, contactInput.customAttributes);
        results.push({ row: index + 1, action: "created", contactId: created.id });
      }
    }

    return {
      summary: {
        total: input.contacts.length,
        created: results.filter(({ action }) => action === "created").length,
        updated: results.filter(({ action }) => action === "updated").length,
        skipped: results.filter(({ action }) => action === "skipped").length,
      },
      results,
    };
  });
}
