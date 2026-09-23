import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "tests/nonexistent-unit-test.env",
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  LOG_LEVEL: "silent",
});

const { env } = await import("../src/config/env.js");
const { prisma } = await import("../src/database/prisma.js");
const { getUsage } = await import("../src/modules/usage/usage.service.js");

test("usage exposes the persisted wallet balance", async (t: TestContext) => {
  const originalCurrency = env.WALLET_CURRENCY;
  Object.assign(env, { WALLET_CURRENCY: "INR" });
  const originalFindMany = prisma.message.findMany;
  const originalTransaction = prisma.$transaction;
  prisma.message.findMany = async () => [] as never;
  (prisma as any).$transaction = async (callback: (client: any) => Promise<unknown>) => callback({
    workspace: { findUnique: async () => ({ tenantId: "tenant-id" }) },
    wallet: { upsert: async () => ({ id: "wallet-id", tenantId: "tenant-id", currency: "INR", balanceMinorUnits: 12500n, createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-01T00:00:00.000Z") }) },
  });
  t.after(() => {
    prisma.message.findMany = originalFindMany;
    (prisma as any).$transaction = originalTransaction;
    Object.assign(env, { WALLET_CURRENCY: originalCurrency });
  });

  const result = await getUsage("workspace-id", {});
  assert.deepEqual(result.wallet, { currency: "INR", balanceMinorUnits: "12500", balance: "125.00", configuredFromBackend: false });
});
