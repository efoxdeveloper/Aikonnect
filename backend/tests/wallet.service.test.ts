import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "tests/nonexistent-unit-test.env",
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  LOG_LEVEL: "silent",
  WALLET_OUTBOUND_MESSAGE_RATE_MINOR_UNITS: "100",
});

const { prisma } = await import("../src/database/prisma.js");
const { AppError } = await import("../src/middleware/error-handler.js");
const { chargeOutboundMessage, creditWallet, debitWallet, refundWalletCharge } = await import("../src/modules/wallet/wallet.service.js");

function fixture(t: TestContext, startingBalance = 0n) {
  const wallet = {
    id: "wallet-id",
    tenantId: "tenant-id",
    currency: "INR",
    balanceMinorUnits: startingBalance,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const entries: any[] = [];
  const transaction: any = {
    workspace: { findUnique: async () => ({ tenantId: "tenant-id" }) },
    tenant: { findUnique: async () => ({ id: "tenant-id" }) },
    wallet: {
      upsert: async () => wallet,
      updateMany: async ({ where, data }: any) => {
        if (where.balanceMinorUnits?.gte !== undefined && wallet.balanceMinorUnits < where.balanceMinorUnits.gte) return { count: 0 };
        wallet.balanceMinorUnits = data.balanceMinorUnits.increment !== undefined
          ? wallet.balanceMinorUnits + data.balanceMinorUnits.increment
          : wallet.balanceMinorUnits - data.balanceMinorUnits.decrement;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => wallet,
    },
    walletLedgerEntry: {
      findUnique: async ({ where }: any) => entries.find((entry) => entry.walletId === where.walletId_idempotencyKey.walletId && entry.idempotencyKey === where.walletId_idempotencyKey.idempotencyKey) ?? null,
      create: async ({ data }: any) => {
        const entry = { id: `entry-${entries.length + 1}`, ...data, createdAt: new Date("2026-01-01T00:00:00.000Z") };
        entries.push(entry);
        return entry;
      },
    },
    $queryRaw: async () => [{ id: wallet.id }],
  };
  const originalTransaction = prisma.$transaction;
  (prisma as any).$transaction = async (callback: (client: any) => Promise<unknown>) => callback(transaction);
  t.after(() => { (prisma as any).$transaction = originalTransaction; });
  return { wallet, entries };
}

test("wallet credits update the balance and append a ledger entry", async (t) => {
  const state = fixture(t);
  const result = await creditWallet({ workspaceId: "workspace-id", amountMinorUnits: 12500n, idempotencyKey: "topup-1", reason: "TOP_UP" });

  assert.equal(result.wallet.balanceMinorUnits, "12500");
  assert.equal(result.entry.direction, "CREDIT");
  assert.equal(result.entry.amountMinorUnits, "12500");
  assert.equal(state.entries.length, 1);
});

test("wallet debits reject insufficient funds without changing the balance", async (t) => {
  const state = fixture(t, 1000n);

  await assert.rejects(
    debitWallet({ workspaceId: "workspace-id", amountMinorUnits: 1001n, idempotencyKey: "message-1", reason: "MESSAGE_CHARGE" }),
    (error: unknown) => error instanceof AppError && error.code === "WALLET_INSUFFICIENT_FUNDS",
  );
  assert.equal(state.wallet.balanceMinorUnits, 1000n);
  assert.equal(state.entries.length, 0);
});

test("wallet mutations are idempotent and do not charge twice", async (t) => {
  const state = fixture(t);
  const input = { workspaceId: "workspace-id", amountMinorUnits: 500n, idempotencyKey: "topup-retry-1", reason: "TOP_UP" };

  const first = await creditWallet(input);
  const second = await creditWallet(input);

  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(second.wallet.balanceMinorUnits, "500");
  assert.equal(state.wallet.balanceMinorUnits, 500n);
  assert.equal(state.entries.length, 1);
});

test("outbound message charges can be refunded idempotently", async (t) => {
  const state = fixture(t, 500n);
  const charge = await chargeOutboundMessage({ workspaceId: "workspace-id", idempotencyKey: "outbound-message-1" });

  assert.ok(charge);
  assert.equal(charge.amountMinorUnits, 100n);
  assert.equal(state.wallet.balanceMinorUnits, 400n);
  assert.equal(state.entries[0].direction, "DEBIT");

  await refundWalletCharge({ workspaceId: "workspace-id", ...charge });
  await refundWalletCharge({ workspaceId: "workspace-id", ...charge });

  assert.equal(state.wallet.balanceMinorUnits, 500n);
  assert.equal(state.entries.length, 2);
  assert.equal(state.entries[1].direction, "CREDIT");
});

test("workspaces under one tenant share the same wallet balance", async (t) => {
  const state = fixture(t);

  await creditWallet({ tenantId: "tenant-id", amountMinorUnits: 1000n, idempotencyKey: "tenant-credit-1", reason: "TOP_UP" });
  await debitWallet({ workspaceId: "workspace-2", amountMinorUnits: 250n, idempotencyKey: "workspace-2-debit-1", reason: "MESSAGE_CHARGE" });

  assert.equal(state.wallet.balanceMinorUnits, 750n);
  assert.equal(state.entries[1].tenantId, "tenant-id");
  assert.equal(state.entries[1].workspaceId, "workspace-2");
});
