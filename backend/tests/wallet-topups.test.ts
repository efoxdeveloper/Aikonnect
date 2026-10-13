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

const { prisma } = await import("../src/database/prisma.js");
const { Prisma } = await import("../src/generated/prisma/client.js");
const { completeWalletTopup } = await import("../src/modules/wallet/wallet-topups.service.js");
const { walletTopupSchema } = await import("../src/modules/wallet/wallet.schemas.js");

test("wallet recharge input validates amount without requesting a phone number", () => {
  assert.equal(walletTopupSchema.safeParse({ amount: "500.25", idempotencyKey: "recharge-test-1" }).success, true);
  assert.equal(walletTopupSchema.safeParse({ amount: "0", idempotencyKey: "recharge-test-1" }).success, false);
  assert.equal(walletTopupSchema.safeParse({ amount: "500.255", idempotencyKey: "recharge-test-1" }).success, false);
});

test("verified wallet recharge credits balance and ledger once on callback replay", async (t: TestContext) => {
  const wallet = { id: "wallet-topup-test", tenantId: "tenant-topup-test", currency: "INR", totalBalance: new Prisma.Decimal("25.00"), reservedBalance: new Prisma.Decimal("5.00"), balanceMinorUnits: 2500n, status: "ACTIVE" };
  const topup: any = { id: "topup-test", walletId: wallet.id, tenantId: wallet.tenantId, workspaceId: "workspace-topup-test", createdById: "user-topup-test", paymentId: "MRTTESTTOPUP", amount: new Prisma.Decimal("500.50"), currency: "INR", status: "PENDING", providerTransactionId: null, createdAt: new Date("2026-10-12T00:00:00.000Z"), completedAt: null };
  const ledger: any[] = [];
  const transaction: any = {
    walletTopup: { findUnique: async () => topup, findUniqueOrThrow: async () => topup, update: async ({ data }: any) => Object.assign(topup, data) },
    wallet: { findUniqueOrThrow: async () => wallet, update: async ({ data }: any) => Object.assign(wallet, data) },
    walletLedgerEntry: {
      findUnique: async ({ where }: any) => ledger.find((entry) => entry.walletId === where.walletId_idempotencyKey.walletId && entry.idempotencyKey === where.walletId_idempotencyKey.idempotencyKey) ?? null,
      create: async ({ data }: any) => { const entry = { id: `entry-${ledger.length + 1}`, ...data }; ledger.push(entry); return entry; },
    },
    $queryRaw: async () => [],
  };
  const originalTransaction = prisma.$transaction;
  const originalFindMany = prisma.workspace.findMany;
  (prisma as any).$transaction = async (callback: (client: any) => Promise<unknown>) => callback(transaction);
  prisma.workspace.findMany = async () => [] as never;
  t.after(() => { (prisma as any).$transaction = originalTransaction; prisma.workspace.findMany = originalFindMany; });

  const first = await completeWalletTopup(topup.paymentId, "ATOM-TXN-1");
  const replay = await completeWalletTopup(topup.paymentId, "ATOM-TXN-1");
  assert.equal(first.status, "SUCCESS");
  assert.equal(replay.status, "SUCCESS");
  assert.equal(wallet.totalBalance.toFixed(2), "525.50");
  assert.equal(wallet.balanceMinorUnits, 52550n);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].transactionType, "RECHARGE");
  assert.equal(ledger[0].idempotencyKey, "ntt-topup:topup-test");
});
