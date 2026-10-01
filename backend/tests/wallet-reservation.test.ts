import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Prisma } from "../src/generated/prisma/client.js";

Object.assign(process.env, {
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  LOG_LEVEL: "silent",
});

const { prisma } = await import("../src/database/prisma.js");
const { expireDueMessageReservations } = await import("../src/modules/wallet/wallet.service.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

test("expired unsent reservations release their wallet hold exactly once", async (t) => {
  const wallet: any = {
    id: "wallet-1",
    tenantId: "tenant-1",
    currency: "INR",
    totalBalance: new Prisma.Decimal("10.000000"),
    reservedBalance: new Prisma.Decimal("2.000000"),
    balanceMinorUnits: 1000n,
    status: "ACTIVE",
    lowBalanceThreshold: new Prisma.Decimal("0"),
    autoRechargeEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const reservation: any = {
    id: "reservation-1",
    walletId: wallet.id,
    tenantId: wallet.tenantId,
    workspaceId: "workspace-1",
    messageId: "message-1",
    walletChargeAmount: new Prisma.Decimal("2.000000"),
    currency: "INR",
    status: "ACTIVE",
    expiresAt: new Date(Date.now() - 1_000),
  };
  const message: any = { metaMessageId: null, status: "QUEUED", billingStatus: "RESERVED" };
  const entries: any[] = [];
  const transaction: any = {
    walletReservation: {
      findUnique: async () => reservation,
      findUniqueOrThrow: async () => reservation,
      update: async ({ data }: any) => { Object.assign(reservation, data); return reservation; },
    },
    message: {
      update: async ({ data }: any) => { Object.assign(message, data); return message; },
    },
    wallet: {
      findUniqueOrThrow: async () => wallet,
      update: async ({ data }: any) => { Object.assign(wallet, data); return wallet; },
    },
    walletLedgerEntry: {
      create: async ({ data }: any) => { const entry = { id: `entry-${entries.length + 1}`, ...data, createdAt: new Date() }; entries.push(entry); return entry; },
    },
    $queryRaw: async () => [],
  };
  stub(t, prisma.walletReservation, "findMany", async () => [{ id: reservation.id }]);
  stub(t, prisma.walletReservation, "findUnique", async () => reservation);
  stub(t, prisma.message, "findUnique", async () => message);
  stub(t, prisma, "$transaction", async (callback: (client: any) => Promise<unknown>) => callback(transaction));

  const result = await expireDueMessageReservations();

  assert.deepEqual(result, { processed: 1, failed: 0 });
  assert.equal(reservation.status, "EXPIRED");
  assert.equal(message.billingStatus, "RELEASED");
  assert.equal(wallet.reservedBalance.toFixed(6), "0.000000");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].direction, "RELEASE");
  assert.equal(entries[0].transactionType, "EXPIRE");
});
