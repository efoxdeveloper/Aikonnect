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

test("usage exposes the backend-configured wallet amount", async (t: TestContext) => {
  const originalBalance = env.WALLET_BALANCE_PAISE;
  const originalCurrency = env.WALLET_CURRENCY;
  Object.assign(env, { WALLET_BALANCE_PAISE: 12500, WALLET_CURRENCY: "INR" });
  const originalFindMany = prisma.message.findMany;
  prisma.message.findMany = async () => [] as never;
  t.after(() => {
    prisma.message.findMany = originalFindMany;
    Object.assign(env, { WALLET_BALANCE_PAISE: originalBalance, WALLET_CURRENCY: originalCurrency });
  });

  const result = await getUsage("workspace-id", {});
  assert.deepEqual(result.wallet, { currency: "INR", balancePaise: 12500, balance: 125, configuredFromBackend: true });
});
