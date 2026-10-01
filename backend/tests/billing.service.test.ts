import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "tests/nonexistent-unit-test.env",
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  LOG_LEVEL: "silent",
});

const { Prisma } = await import("../src/generated/prisma/client.js");
const { walletChargeAmount } = await import("../src/modules/billing/billing.service.js");

test("customer wallet covers the Meta/customer rate when wallet billing is enabled", () => {
  const charge = walletChargeAmount({ walletRequired: true, customerAmount: new Prisma.Decimal("0.863100") });
  assert.equal(charge.toFixed(6), "0.863100");
});

test("wallet billing can be disabled without changing the customer rate", () => {
  const charge = walletChargeAmount({ walletRequired: false, customerAmount: new Prisma.Decimal("0.863100") });
  assert.equal(charge.toFixed(6), "0.000000");
});
