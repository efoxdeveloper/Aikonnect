import type { ContactCustomField, ContactCustomFieldType, Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { toSlug } from "../../utils/slug.js";
import type {
  CreateContactCustomFieldInput,
  ListContactCustomFieldsQuery,
  ReorderContactCustomFieldsInput,
  UpdateContactCustomFieldInput,
} from "./contact-custom-field.schemas.js";

const fieldSelect = {
  id: true,
  key: true,
  label: true,
  type: true,
  options: true,
  required: true,
  position: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContactCustomFieldSelect;

export type CustomFieldDefinition = Pick<ContactCustomField, "id" | "key" | "label" | "type" | "options" | "required">;

function normalizeLabel(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function generatedKey(label: string) {
  return toSlug(label).replaceAll("-", "_").slice(0, 80);
}

function optionsFromJson(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((option): option is string => typeof option === "string") : [];
}

function serializeField<T extends { options: Prisma.JsonValue }>(field: T) {
  return { ...field, options: optionsFromJson(field.options) };
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function fieldConflict() {
  return new AppError(409, "A custom field with this label or key already exists", "CONTACT_CUSTOM_FIELD_EXISTS");
}

function validateOptions(type: ContactCustomFieldType, options: string[] | undefined) {
  if (options === undefined) return;
  const isSelect = type === "SELECT" || type === "MULTI_SELECT";
  if (isSelect && options.length === 0) {
    throw new AppError(422, "Select fields require at least one option", "CONTACT_CUSTOM_FIELD_OPTIONS_REQUIRED");
  }
  if (!isSelect && options.length > 0) {
    throw new AppError(422, "Only select fields can have options", "CONTACT_CUSTOM_FIELD_OPTIONS_NOT_ALLOWED");
  }
}

export async function listContactCustomFields(workspaceId: string, query: ListContactCustomFieldsQuery) {
  const fields = await prisma.contactCustomField.findMany({
    where: { workspaceId, ...(query.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: fieldSelect,
  });
  return fields.map(serializeField);
}

export async function createContactCustomField(workspaceId: string, actorUserId: string, input: CreateContactCustomFieldInput) {
  const count = await prisma.contactCustomField.count({ where: { workspaceId, archivedAt: null } });
  if (count >= 100) throw new AppError(422, "A workspace can have at most 100 active custom fields", "CONTACT_CUSTOM_FIELD_LIMIT");
  const key = input.key ?? generatedKey(input.label);
  if (!key) throw new AppError(422, "A field key could not be generated from this label", "CONTACT_CUSTOM_FIELD_KEY_INVALID");
  try {
    const field = await prisma.contactCustomField.create({
      data: {
        workspaceId,
        key,
        label: input.label,
        normalizedLabel: normalizeLabel(input.label),
        type: input.type,
        options: input.options,
        required: input.required,
        position: count,
        createdById: actorUserId,
        updatedById: actorUserId,
      },
      select: fieldSelect,
    });
    return serializeField(field);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw fieldConflict();
    throw error;
  }
}

export async function updateContactCustomField(workspaceId: string, fieldId: string, actorUserId: string, input: UpdateContactCustomFieldInput) {
  const existing = await prisma.contactCustomField.findFirst({ where: { id: fieldId, workspaceId, archivedAt: null } });
  if (!existing) throw new AppError(404, "Custom field was not found", "CONTACT_CUSTOM_FIELD_NOT_FOUND");
  validateOptions(existing.type, input.options);
  try {
    const field = await prisma.contactCustomField.update({
      where: { id: fieldId },
      data: {
        ...(input.label !== undefined ? { label: input.label, normalizedLabel: normalizeLabel(input.label) } : {}),
        ...(input.options !== undefined ? { options: input.options } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
        updatedById: actorUserId,
      },
      select: fieldSelect,
    });
    return serializeField(field);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw fieldConflict();
    throw error;
  }
}

export async function reorderContactCustomFields(workspaceId: string, actorUserId: string, input: ReorderContactCustomFieldsInput) {
  const active = await prisma.contactCustomField.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const activeIds = new Set(active.map(({ id }) => id));
  if (input.fieldIds.some((id) => !activeIds.has(id)) || input.fieldIds.length !== active.length) {
    throw new AppError(422, "The complete active custom-field order is required", "CONTACT_CUSTOM_FIELD_ORDER_INVALID");
  }
  await prisma.$transaction(input.fieldIds.map((id, position) => prisma.contactCustomField.update({
    where: { id },
    data: { position, updatedById: actorUserId },
  })));
  return listContactCustomFields(workspaceId, { includeArchived: false });
}

export async function archiveContactCustomField(workspaceId: string, fieldId: string, actorUserId: string) {
  const result = await prisma.contactCustomField.updateMany({
    where: { id: fieldId, workspaceId, archivedAt: null },
    data: { archivedAt: new Date(), updatedById: actorUserId },
  });
  if (result.count === 0) throw new AppError(404, "Custom field was not found", "CONTACT_CUSTOM_FIELD_NOT_FOUND");
}

export async function activeCustomFieldDefinitions(workspaceId: string): Promise<CustomFieldDefinition[]> {
  return prisma.contactCustomField.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true, key: true, label: true, type: true, options: true, required: true },
  });
}

function valueMissing(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}


function isExactDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function invalidValue(field: CustomFieldDefinition, message: string): never {
  throw new AppError(422, `${field.label}: ${message}`, "CONTACT_CUSTOM_FIELD_VALUE_INVALID", { field: field.key });
}

export function validateCustomFieldValues(
  definitions: CustomFieldDefinition[],
  attributes: Record<string, unknown>,
  existingAttributes: Record<string, unknown> = {},
) {
  const definitionsByKey = new Map(definitions.map((field) => [field.key, field]));
  for (const key of Object.keys(attributes)) {
    if (!definitionsByKey.has(key) && JSON.stringify(attributes[key]) !== JSON.stringify(existingAttributes[key])) {
      throw new AppError(422, `Unknown or archived custom field: ${key}`, "CONTACT_CUSTOM_FIELD_UNKNOWN", { field: key });
    }
  }
  for (const field of definitions) {
    const value = attributes[field.key];
    if (valueMissing(value)) {
      if (field.required) invalidValue(field, "a value is required");
      continue;
    }
    const options = optionsFromJson(field.options);
    if (field.type === "TEXT" && (typeof value !== "string" || value.length > 5000)) invalidValue(field, "enter text up to 5,000 characters");
    if (field.type === "NUMBER" && (typeof value !== "number" || !Number.isFinite(value))) invalidValue(field, "enter a valid number");
    if (field.type === "DATE" && !isExactDate(value)) invalidValue(field, "enter a valid date");
    if (field.type === "BOOLEAN" && typeof value !== "boolean") invalidValue(field, "select yes or no");
    if (field.type === "SELECT" && (typeof value !== "string" || !options.includes(value))) invalidValue(field, "select an available option");
    if (field.type === "MULTI_SELECT" && (!Array.isArray(value) || value.length > 20 || value.some((item) => typeof item !== "string" || !options.includes(item)) || new Set(value).size !== value.length)) invalidValue(field, "select unique available options");
  }
}

export async function syncContactCustomFieldValues(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  contactId: string,
  definitions: CustomFieldDefinition[],
  attributes: Record<string, unknown>,
) {
  const fieldIds = definitions.map(({ id }) => id);
  if (fieldIds.length) {
    await transaction.contactCustomFieldValue.deleteMany({ where: { contactId, fieldId: { in: fieldIds } } });
  }
  const values = definitions.flatMap((field) => {
    const value = attributes[field.key];
    if (valueMissing(value)) return [];
    return [{
      workspaceId,
      contactId,
      fieldId: field.id,
      ...(field.type === "TEXT" || field.type === "SELECT" ? { textValue: value as string } : {}),
      ...(field.type === "NUMBER" ? { numberValue: value as number } : {}),
      ...(field.type === "DATE" ? { dateValue: new Date(`${value as string}T00:00:00.000Z`) } : {}),
      ...(field.type === "BOOLEAN" ? { booleanValue: value as boolean } : {}),
      ...(field.type === "MULTI_SELECT" ? { stringValues: value as string[] } : {}),
    }];
  });
  if (values.length) await transaction.contactCustomFieldValue.createMany({ data: values });
}
