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
const { Prisma } = await import("../src/generated/prisma/client.js");
const { chargeOutboundMessage, creditWallet, creditWelcomeBonusInTransaction, debitWallet, listLedger, refundWalletCharge } = await import("../src/modules/wallet/wallet.service.js");

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
  let ledgerQueriesInFlight = 0;
  let maxLedgerQueriesInFlight = 0;
  const runLedgerQuery = async <T>(result: T) => {
    ledgerQueriesInFlight += 1;
    maxLedgerQueriesInFlight = Math.max(maxLedgerQueriesInFlight, ledgerQueriesInFlight);
    return Promise.resolve(result).finally(() => { ledgerQueriesInFlight -= 1; });
  };
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
      count: async () => runLedgerQuery(entries.length),
      findMany: async () => runLedgerQuery(entries),
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
  return { wallet, entries, get maxLedgerQueriesInFlight() { return maxLedgerQueriesInFlight; } };
}

test("wallet credits update the balance and append a ledger entry", async (t) => {
  const state = fixture(t);
  const result = await creditWallet({ workspaceId: "workspace-id", amountMinorUnits: 12500n, idempotencyKey: "topup-1", reason: "TOP_UP" });

  assert.equal(result.wallet.balanceMinorUnits, "12500");
  assert.equal(result.entry.direction, "CREDIT");
  assert.equal(result.entry.amountMinorUnits, "12500");
  assert.equal(state.entries.length, 1);
});

test("WhatsApp connection welcome credits use the configured amount and remain idempotent", async () => {
  const wallet: any = { id: "welcome-wallet", tenantId: "welcome-tenant", currency: "INR", totalBalance: new Prisma.Decimal(0), reservedBalance: new Prisma.Decimal(0), balanceMinorUnits: 0n, status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() };
  const entries: any[] = [];
  const workspace: any = { id: "welcome-workspace", tenantId: "welcome-tenant", welcomeBonusGrantedAt: null };
  const transaction: any = {
    workspace: { findUnique: async () => ({ id: workspace.id, tenantId: workspace.tenantId }), update: async ({ data }: any) => Object.assign(workspace, data) },
    platformConfiguration: { upsert: async () => ({ welcomeBonusAmount: new Prisma.Decimal("400.00") }) },
    wallet: { upsert: async () => wallet, update: async ({ data }: any) => { Object.assign(wallet, data); return wallet; } },
    walletLedgerEntry: {
      findUnique: async ({ where }: any) => entries.find((entry) => entry.walletId === where.walletId_idempotencyKey.walletId && entry.idempotencyKey === where.walletId_idempotencyKey.idempotencyKey) ?? null,
      create: async ({ data }: any) => { const entry = { id: "welcome-entry", ...data, createdAt: new Date() }; entries.push(entry); return entry; },
    },
    $queryRaw: async () => [{ id: wallet.id }],
  };

  const first = await creditWelcomeBonusInTransaction(transaction, workspace.id);
  const replay = await creditWelcomeBonusInTransaction(transaction, workspace.id);

  assert.equal(first?.amount, "400.000000");
  assert.equal(first?.transactionType, "WELCOME_BONUS");
  assert.equal(replay?.id, first?.id);
  assert.equal(wallet.totalBalance.toFixed(2), "400.00");
  assert.equal(entries.length, 1);
  assert.ok(workspace.welcomeBonusGrantedAt instanceof Date);
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

test("wallet ledger count and page queries run sequentially in the transaction", async (t) => {
  const state = fixture(t);

  const result = await listLedger("workspace-id", { page: 1, pageSize: 25 });

  assert.deepEqual(result.items, []);
  assert.equal(result.pagination.total, 0);
  assert.equal(state.maxLedgerQueriesInFlight, 1);
});
