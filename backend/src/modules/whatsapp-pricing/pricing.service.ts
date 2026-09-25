import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { resolvePricingCountry, validatePricingCountryCode } from "./country.service.js";
import { PRICING_CATEGORIES, type RateCardStatus } from "./pricing.constants.js";
import type { RateCardInput, RateCardListQuery } from "./pricing.schemas.js";

const MONEY_SCALE = 6;
const UNBOUNDED_DATE = new Date("9999-12-31T23:59:59.999Z");

export type PricingSnapshot = {
  rateCardId: string;
  countryCode: string;
  countryName: string;
  category: string;
  pricingType: string;
  metaRate: string;
  platformFee: string;
  customerRate: string;
  currency: string;
  effectiveFrom: string;
};

export function messagePricingSnapshot(pricing: PricingSnapshot) {
  return {
    rateCardId: pricing.rateCardId,
    pricingCountry: pricing.countryCode,
    pricingCategory: pricing.category,
    pricingType: pricing.pricingType,
    metaCost: pricing.metaRate,
    platformFee: pricing.platformFee,
    customerCost: pricing.customerRate,
    pricingCurrency: pricing.currency,
    pricingEffectiveDate: new Date(`${pricing.effectiveFrom}T00:00:00.000Z`),
    billingStatus: "ESTIMATED" as const,
  };
}

function dateAtStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateAtEnd(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

function dateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function decimalString(value: Prisma.Decimal) {
  return value.toFixed(MONEY_SCALE);
}

function normalizeCategory(value: string) {
  const category = value.trim().toUpperCase();
  if (!PRICING_CATEGORIES.includes(category as (typeof PRICING_CATEGORIES)[number])) {
    throw new AppError(422, "The pricing category is not supported", "INVALID_PRICING_CATEGORY");
  }
  return category;
}

function normalizePricingType(value: string) {
  const pricingType = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,59}$/.test(pricingType)) {
    throw new AppError(422, "The pricing type is not supported", "INVALID_PRICING_TYPE");
  }
  return pricingType;
}

function normalizeInput(input: RateCardInput) {
  const countryCode = validatePricingCountryCode(input.countryCode);
  const category = normalizeCategory(input.category);
  const pricingType = normalizePricingType(input.pricingType);
  const currency = input.currency.trim().toUpperCase();
  if (!Intl.supportedValuesOf("currency").includes(currency)) {
    throw new AppError(422, "The currency is not a supported ISO 4217 currency", "VALIDATION_ERROR");
  }
  const effectiveFrom = dateAtStart(input.effectiveFrom);
  const effectiveTo = input.effectiveTo ? dateAtEnd(input.effectiveTo) : null;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new AppError(422, "The effective end date must be on or after the start date", "INVALID_RATE_DATE_RANGE");
  }

  const volumeTierFrom = input.volumeTierFrom === undefined || input.volumeTierFrom === null ? null : BigInt(input.volumeTierFrom);
  const volumeTierTo = input.volumeTierTo === undefined || input.volumeTierTo === null ? null : BigInt(input.volumeTierTo);
  if (volumeTierFrom === null && volumeTierTo !== null) {
    throw new AppError(422, "A volume tier upper bound requires a lower bound", "INVALID_VOLUME_TIER");
  }
  if (volumeTierFrom !== null && volumeTierTo !== null && volumeTierTo < volumeTierFrom) {
    throw new AppError(422, "The volume tier upper bound must be greater than or equal to the lower bound", "INVALID_VOLUME_TIER");
  }
  const maxInt64 = 9223372036854775807n;
  if ((volumeTierFrom !== null && volumeTierFrom > maxInt64) || (volumeTierTo !== null && volumeTierTo > maxInt64)) {
    throw new AppError(422, "Volume tier values are too large", "INVALID_VOLUME_TIER");
  }

  const metaRate = decimal(input.metaRate);
  const platformFee = decimal(input.platformFee);
  const customerRate = input.customerRate ? decimal(input.customerRate) : metaRate.add(platformFee);
  if (metaRate.lt(0) || platformFee.lt(0) || customerRate.lt(0)) {
    throw new AppError(422, "Rate values cannot be negative", "VALIDATION_ERROR");
  }

  return {
    countryCode,
    countryName: input.countryName.trim(),
    currency,
    category,
    pricingType,
    metaRate,
    platformFee,
    customerRate,
    volumeTierFrom,
    volumeTierTo,
    effectiveFrom,
    effectiveTo,
    status: input.status as RateCardStatus,
    source: input.source.trim().toUpperCase(),
    notes: input.notes?.trim() || null,
  };
}

function volumeRange(card: { volumeTierFrom: bigint | null; volumeTierTo: bigint | null }) {
  return { from: card.volumeTierFrom ?? 0n, to: card.volumeTierTo };
}

function dateRangesOverlap(leftFrom: Date, leftTo: Date | null, rightFrom: Date, rightTo: Date | null) {
  return leftFrom <= (rightTo ?? UNBOUNDED_DATE) && rightFrom <= (leftTo ?? UNBOUNDED_DATE);
}

function volumeRangesOverlap(left: { volumeTierFrom: bigint | null; volumeTierTo: bigint | null }, right: { volumeTierFrom: bigint | null; volumeTierTo: bigint | null }) {
  const a = volumeRange(left);
  const b = volumeRange(right);
  const maxVolume = 9223372036854775807n;
  return a.from <= (b.to ?? maxVolume) && b.from <= (a.to ?? maxVolume);
}

async function assertNoActiveConflict(input: ReturnType<typeof normalizeInput>, excludeId?: string, transaction: Prisma.TransactionClient = prisma) {
  const existing = await transaction.whatsAppRateCard.findMany({
    where: {
      countryCode: input.countryCode,
      category: input.category,
      pricingType: input.pricingType,
      status: "ACTIVE",
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, effectiveFrom: true, effectiveTo: true, volumeTierFrom: true, volumeTierTo: true },
  });
  const conflict = existing.find((card) => dateRangesOverlap(input.effectiveFrom, input.effectiveTo, card.effectiveFrom, card.effectiveTo) && volumeRangesOverlap(input, card));
  if (conflict) {
    throw new AppError(409, "An active rate card overlaps this country, category, pricing type, volume tier, and effective date range", "RATE_CARD_CONFLICT", { conflictingRateCardId: conflict.id });
  }
}

function assertVersionUnchanged(existing: {
  countryCode: string; currency: string; category: string; pricingType: string; metaRate: Prisma.Decimal; platformFee: Prisma.Decimal;
  customerRate: Prisma.Decimal; volumeTierFrom: bigint | null; volumeTierTo: bigint | null; effectiveFrom: Date; effectiveTo: Date | null;
}, next: ReturnType<typeof normalizeInput>) {
  const sameVolume = existing.volumeTierFrom === next.volumeTierFrom && existing.volumeTierTo === next.volumeTierTo;
  const sameDates = existing.effectiveFrom.getTime() === next.effectiveFrom.getTime() && existing.effectiveTo?.getTime() === next.effectiveTo?.getTime();
  if (existing.countryCode !== next.countryCode || existing.currency !== next.currency || existing.category !== next.category || existing.pricingType !== next.pricingType || !existing.metaRate.eq(next.metaRate) || !existing.platformFee.eq(next.platformFee) || !existing.customerRate.eq(next.customerRate) || !sameVolume || !sameDates) {
    throw new AppError(409, "Pricing versions are immutable; create a new rate card version instead of changing its pricing terms", "RATE_CARD_VERSION_IMMUTABLE");
  }
}

function serialize(card: {
  id: string; countryCode: string; countryName: string; currency: string; category: string; pricingType: string;
  metaRate: Prisma.Decimal; platformFee: Prisma.Decimal; customerRate: Prisma.Decimal; volumeTierFrom: bigint | null;
  volumeTierTo: bigint | null; effectiveFrom: Date; effectiveTo: Date | null; status: string; source: string; notes: string | null;
  createdById: string | null; updatedById: string | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: card.id,
    countryCode: card.countryCode,
    countryName: card.countryName,
    currency: card.currency,
    category: card.category,
    pricingType: card.pricingType,
    metaRate: decimalString(card.metaRate),
    platformFee: decimalString(card.platformFee),
    customerRate: decimalString(card.customerRate),
    volumeTierFrom: card.volumeTierFrom?.toString() ?? null,
    volumeTierTo: card.volumeTierTo?.toString() ?? null,
    effectiveFrom: dateOnly(card.effectiveFrom),
    effectiveTo: dateOnly(card.effectiveTo),
    status: card.status,
    source: card.source,
    notes: card.notes,
    createdById: card.createdById,
    updatedById: card.updatedById,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

const rateCardSelect = {
  id: true, countryCode: true, countryName: true, currency: true, category: true, pricingType: true,
  metaRate: true, platformFee: true, customerRate: true, volumeTierFrom: true, volumeTierTo: true,
  effectiveFrom: true, effectiveTo: true, status: true, source: true, notes: true, createdById: true,
  updatedById: true, createdAt: true, updatedAt: true,
} satisfies Prisma.WhatsAppRateCardSelect;

function auditMetadata(input: ReturnType<typeof normalizeInput>) {
  return { countryCode: input.countryCode, category: input.category, pricingType: input.pricingType, effectiveFrom: input.effectiveFrom.toISOString(), effectiveTo: input.effectiveTo?.toISOString() ?? null };
}

export async function listRateCards(query: RateCardListQuery) {
  const effectiveDate = query.effectiveDate ? dateAtStart(query.effectiveDate) : undefined;
  const where: Prisma.WhatsAppRateCardWhereInput = {
    ...(query.countryCode ? { countryCode: query.countryCode } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.pricingType ? { pricingType: query.pricingType } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(effectiveDate ? { effectiveFrom: { lte: effectiveDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.whatsAppRateCard.count({ where }),
    prisma.whatsAppRateCard.findMany({ where, select: rateCardSelect, orderBy: [{ countryCode: "asc" }, { category: "asc" }, { pricingType: "asc" }, { effectiveFrom: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { items: items.map(serialize), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), hasNext: query.page * query.pageSize < total, hasPrevious: query.page > 1 } };
}

export async function getRateCard(id: string) {
  const card = await prisma.whatsAppRateCard.findUnique({ where: { id }, select: rateCardSelect });
  if (!card) throw new AppError(404, "The WhatsApp rate card was not found", "RATE_CARD_NOT_FOUND");
  return serialize(card);
}

export async function createRateCard(input: RateCardInput, actorUserId: string) {
  const normalized = normalizeInput(input);
  const card = await prisma.$transaction(async (transaction) => {
    if (normalized.status === "ACTIVE") await assertNoActiveConflict(normalized, undefined, transaction);
    const created = await transaction.whatsAppRateCard.create({ data: { ...normalized, createdById: actorUserId, updatedById: actorUserId }, select: rateCardSelect });
    await transaction.platformAuditLog.create({ data: { actorUserId, action: "RATE_CARD_CREATED", resourceType: "whatsapp_rate_card", resourceId: created.id, metadata: auditMetadata(normalized) } });
    return created;
  });
  return serialize(card);
}

export async function updateRateCard(id: string, input: RateCardInput, actorUserId: string) {
  const normalized = normalizeInput(input);
  const card = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.whatsAppRateCard.findUnique({ where: { id }, select: rateCardSelect });
    if (!existing) throw new AppError(404, "The WhatsApp rate card was not found", "RATE_CARD_NOT_FOUND");
    assertVersionUnchanged(existing, normalized);
    if (normalized.status === "ACTIVE") await assertNoActiveConflict(normalized, id, transaction);
    const updated = await transaction.whatsAppRateCard.update({ where: { id }, data: { ...normalized, updatedById: actorUserId }, select: rateCardSelect });
    await transaction.platformAuditLog.create({ data: { actorUserId, action: "RATE_CARD_UPDATED", resourceType: "whatsapp_rate_card", resourceId: id, metadata: auditMetadata(normalized) } });
    return updated;
  });
  return serialize(card);
}

export async function updateRateCardStatus(id: string, status: RateCardStatus, actorUserId: string) {
  const card = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.whatsAppRateCard.findUnique({ where: { id }, select: { ...rateCardSelect } });
    if (!existing) throw new AppError(404, "The WhatsApp rate card was not found", "RATE_CARD_NOT_FOUND");
    if (status === "ACTIVE") {
      const normalized = normalizeInput({ ...existing, metaRate: decimalString(existing.metaRate), platformFee: decimalString(existing.platformFee), customerRate: decimalString(existing.customerRate), volumeTierFrom: existing.volumeTierFrom?.toString() ?? null, volumeTierTo: existing.volumeTierTo?.toString() ?? null, effectiveFrom: dateOnly(existing.effectiveFrom)!, effectiveTo: dateOnly(existing.effectiveTo), source: existing.source, notes: existing.notes, status });
      await assertNoActiveConflict(normalized, id, transaction);
    }
    const updated = await transaction.whatsAppRateCard.update({ where: { id }, data: { status, updatedById: actorUserId }, select: rateCardSelect });
    await transaction.platformAuditLog.create({ data: { actorUserId, action: status === "ACTIVE" ? "RATE_CARD_ACTIVATED" : "RATE_CARD_DEACTIVATED", resourceType: "whatsapp_rate_card", resourceId: id, metadata: { previousStatus: existing.status, status } } });
    return updated;
  });
  return serialize(card);
}

export async function getRate(input: { countryCode: string; category: string; pricingType: string; timestamp?: Date; currentVolume?: bigint }) {
  const countryCode = validatePricingCountryCode(input.countryCode);
  const category = normalizeCategory(input.category);
  const pricingType = normalizePricingType(input.pricingType);
  const timestamp = input.timestamp ?? new Date();
  const currentVolume = input.currentVolume ?? 0n;
  const candidates = await prisma.whatsAppRateCard.findMany({
    where: { countryCode, category, pricingType, status: "ACTIVE", effectiveFrom: { lte: timestamp }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: timestamp } }] },
    select: { ...rateCardSelect },
    orderBy: [{ effectiveFrom: "desc" }, { volumeTierFrom: "desc" }],
  });
  const matching = candidates.filter((candidate) => {
    const range = volumeRange(candidate);
    return currentVolume >= range.from && (range.to === null || currentVolume <= range.to);
  });
  matching.sort((left, right) => {
    if (left.volumeTierFrom === null && right.volumeTierFrom !== null) return 1;
    if (left.volumeTierFrom !== null && right.volumeTierFrom === null) return -1;
    if (left.volumeTierFrom !== null && right.volumeTierFrom !== null) return left.volumeTierFrom > right.volumeTierFrom ? -1 : left.volumeTierFrom < right.volumeTierFrom ? 1 : 0;
    return right.effectiveFrom.getTime() - left.effectiveFrom.getTime();
  });
  const card = matching[0];
  if (!card) throw new AppError(422, "No active WhatsApp rate card matches this recipient, category, pricing type, date, and volume", "RATE_CARD_NOT_FOUND");
  return {
    rateCardId: card.id,
    countryCode: card.countryCode,
    countryName: card.countryName,
    category: card.category,
    pricingType: card.pricingType,
    metaRate: decimalString(card.metaRate),
    platformFee: decimalString(card.platformFee),
    customerRate: decimalString(card.customerRate),
    currency: card.currency,
    effectiveFrom: dateOnly(card.effectiveFrom)!,
  } satisfies PricingSnapshot;
}

export async function resolveMessagePricing(input: { phoneNumber: string; category: string; pricingType?: string; timestamp?: Date; currentVolume?: bigint }) {
  const country = resolvePricingCountry(input.phoneNumber);
  const rate = await getRate({ countryCode: country.countryCode, category: input.category, pricingType: input.pricingType ?? "REGULAR", timestamp: input.timestamp, currentVolume: input.currentVolume });
  return { ...rate, countryName: country.countryName, callingCode: country.callingCode };
}
