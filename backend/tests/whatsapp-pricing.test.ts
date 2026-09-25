import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Prisma } from "../src/generated/prisma/client.js";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  META_APP_SECRET: "test-meta-app-secret-for-whatsapp-pricing",
  META_WEBHOOK_VERIFY_TOKEN: "test-webhook-verify-token",
  META_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-for-tests-32chars",
  APP_URL: "http://localhost:5173",
});

const { prisma } = await import("../src/database/prisma.js");
const { resolvePricingCountry } = await import("../src/modules/whatsapp-pricing/country.service.js");
const { createRateCard, getRate, messagePricingSnapshot, resolveMessagePricing } = await import("../src/modules/whatsapp-pricing/pricing.service.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

const card = (overrides: Record<string, unknown> = {}) => ({
  id: "rate-card-1", countryCode: "IN", countryName: "India", currency: "INR", category: "UTILITY", pricingType: "REGULAR",
  metaRate: new Prisma.Decimal("0.115000"), platformFee: new Prisma.Decimal("0.035000"), customerRate: new Prisma.Decimal("0.150000"), volumeTierFrom: null, volumeTierTo: null,
  effectiveFrom: new Date("2026-07-01T00:00:00.000Z"), effectiveTo: null, status: "ACTIVE", source: "MANUAL", notes: null,
  createdById: null, updatedById: null, createdAt: new Date("2026-07-01T00:00:00.000Z"), updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  ...overrides,
});

test("resolves India Utility rates with exact decimal strings", { concurrency: false }, async (t) => {
  stub(t, prisma.whatsAppRateCard, "findMany", async () => [card()]);
  const result = await resolveMessagePricing({ phoneNumber: "919876543210", category: "UTILITY" });
  assert.deepEqual(result, { rateCardId: "rate-card-1", countryCode: "IN", countryName: "India", callingCode: "91", category: "UTILITY", pricingType: "REGULAR", metaRate: "0.115000", platformFee: "0.035000", customerRate: "0.150000", currency: "INR", effectiveFrom: "2026-07-01" });
});

test("selects category-specific rates and historical versions", { concurrency: false }, async (t) => {
  const cards = [
    card({ id: "utility-old", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: new Date("2026-06-30T23:59:59.999Z"), metaRate: new Prisma.Decimal("0.100000"), customerRate: new Prisma.Decimal("0.130000") }),
    card({ id: "utility-new", metaRate: new Prisma.Decimal("0.115000") }),
    card({ id: "marketing", category: "MARKETING", metaRate: new Prisma.Decimal("0.500000"), customerRate: new Prisma.Decimal("0.550000") }),
  ];
  stub(t, prisma.whatsAppRateCard, "findMany", async (args: any) => cards.filter((item) => {
    return item.status === args.where.status && item.countryCode === args.where.countryCode && item.category === args.where.category && item.pricingType === args.where.pricingType && item.effectiveFrom <= args.where.effectiveFrom.lte && (!item.effectiveTo || item.effectiveTo >= args.where.OR[1].effectiveTo.gte);
  }));
  assert.equal((await getRate({ countryCode: "IN", category: "UTILITY", pricingType: "REGULAR", timestamp: new Date("2026-03-01T00:00:00.000Z") })).rateCardId, "utility-old");
  assert.equal((await getRate({ countryCode: "IN", category: "UTILITY", pricingType: "REGULAR", timestamp: new Date("2026-07-02T00:00:00.000Z") })).rateCardId, "utility-new");
  assert.equal((await getRate({ countryCode: "IN", category: "MARKETING", pricingType: "REGULAR", timestamp: new Date("2026-07-02T00:00:00.000Z") })).customerRate, "0.550000");
});

test("ignores inactive and missing rates instead of defaulting to zero", { concurrency: false }, async (t) => {
  stub(t, prisma.whatsAppRateCard, "findMany", async () => []);
  await assert.rejects(() => getRate({ countryCode: "IN", category: "UTILITY", pricingType: "REGULAR" }), (error: any) => error.code === "RATE_CARD_NOT_FOUND");
  await assert.rejects(() => getRate({ countryCode: "IN", category: "MARKETING", pricingType: "REGULAR" }), (error: any) => error.code === "RATE_CARD_NOT_FOUND");
});

test("resolves finite and unlimited volume tiers", { concurrency: false }, async (t) => {
  const tiers = [
    card({ id: "tier-1", pricingType: "VOLUME_TIER", volumeTierFrom: 0n, volumeTierTo: 999999n, customerRate: new Prisma.Decimal("0.100000") }),
    card({ id: "tier-2", pricingType: "VOLUME_TIER", volumeTierFrom: 1000000n, volumeTierTo: 1999999n, customerRate: new Prisma.Decimal("0.090000") }),
    card({ id: "tier-3", pricingType: "VOLUME_TIER", volumeTierFrom: 2000000n, volumeTierTo: null, customerRate: new Prisma.Decimal("0.080000") }),
  ];
  stub(t, prisma.whatsAppRateCard, "findMany", async () => tiers);
  assert.equal((await getRate({ countryCode: "IN", category: "UTILITY", pricingType: "VOLUME_TIER", currentVolume: 1500000n })).rateCardId, "tier-2");
  assert.equal((await getRate({ countryCode: "IN", category: "UTILITY", pricingType: "VOLUME_TIER", currentVolume: 5000000n })).rateCardId, "tier-3");
});

test("message pricing snapshots remain fixed after a later rate-card change", { concurrency: false }, async (t) => {
  stub(t, prisma.whatsAppRateCard, "findMany", async () => [card({ id: "historical", metaRate: new Prisma.Decimal("0.115000"), customerRate: new Prisma.Decimal("0.150000") })]);
  const pricing = await getRate({ countryCode: "IN", category: "UTILITY", pricingType: "REGULAR" });
  const snapshot = messagePricingSnapshot(pricing);
  assert.equal(snapshot.metaCost, "0.115000");
  assert.equal(snapshot.customerCost, "0.150000");
  assert.equal(snapshot.billingStatus, "ESTIMATED");
  assert.equal(snapshot.pricingEffectiveDate.toISOString(), "2026-07-01T00:00:00.000Z");
});

test("unknown countries are controlled errors", { concurrency: false }, () => {
  assert.deepEqual(resolvePricingCountry("919876543210"), { countryCode: "IN", callingCode: "91", countryName: "India" });
  assert.throws(() => resolvePricingCountry("123"), (error: any) => error.code === "COUNTRY_NOT_RESOLVED");
});

test("overlapping active rate cards are rejected by service validation", { concurrency: false }, async (t) => {
  const transaction = {
    whatsAppRateCard: {
      findMany: async () => [{ id: "existing", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: new Date("2026-12-31T23:59:59.999Z"), volumeTierFrom: null, volumeTierTo: null }],
      create: async () => { throw new Error("create must not be reached"); },
    },
    platformAuditLog: { create: async () => ({}) },
  };
  stub(t, prisma, "$transaction", async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction));
  await assert.rejects(() => createRateCard({ countryCode: "IN", countryName: "India", currency: "INR", category: "UTILITY", pricingType: "REGULAR", metaRate: "0.115000", platformFee: "0.035000", customerRate: "0.150000", volumeTierFrom: null, volumeTierTo: null, effectiveFrom: "2026-06-01", effectiveTo: null, source: "MANUAL", notes: null, status: "ACTIVE" }, "admin-1"), (error: any) => error.code === "RATE_CARD_CONFLICT");
});
