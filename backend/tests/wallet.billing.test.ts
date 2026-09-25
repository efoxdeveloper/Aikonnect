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

const { Prisma } = await import("../src/generated/prisma/client.js");
const { prisma } = await import("../src/database/prisma.js");
const { AppError } = await import("../src/middleware/error-handler.js");
const { reserveMessage, captureReservation, releaseReservation, refundReservation, checkLedgerConsistency } = await import("../src/modules/wallet/wallet.service.js");

function fixture(t: TestContext, total = "100.000000") {
  const wallet: any = { id: "wallet-1", tenantId: "tenant-1", currency: "INR", totalBalance: new Prisma.Decimal(total), reservedBalance: new Prisma.Decimal("0"), balanceMinorUnits: 10000n, status: "ACTIVE", lowBalanceThreshold: new Prisma.Decimal("0"), autoRechargeEnabled: false, createdAt: new Date(), updatedAt: new Date() };
  const message: any = { id: "message-1", workspaceId: "workspace-1", billingStatus: "ESTIMATED" };
  const reservations: any[] = [];
  const entries: any[] = [];
  const transaction: any = {
    workspace: { findUnique: async () => ({ tenantId: "tenant-1" }) },
    tenant: { findUnique: async () => ({ id: "tenant-1" }) },
    wallet: {
      upsert: async () => wallet,
      findUnique: async () => wallet,
      findUniqueOrThrow: async () => wallet,
      update: async ({ data }: any) => { if (data.totalBalance !== undefined) wallet.totalBalance = data.totalBalance; if (data.reservedBalance !== undefined) wallet.reservedBalance = data.reservedBalance; if (data.balanceMinorUnits !== undefined) wallet.balanceMinorUnits = data.balanceMinorUnits; return wallet; },
    },
    message: {
      findFirst: async () => message,
      update: async ({ data }: any) => Object.assign(message, data),
    },
    workspaceBillingSettings: {
      findUnique: async () => ({ allowNegativeBalance: true, creditLimit: new Prisma.Decimal("0.100000") }),
    },
    walletReservation: {
      findUnique: async ({ where }: any) => where.id ? reservations.find((item) => item.id === where.id) ?? null : where.messageId ? reservations.find((item) => item.messageId === where.messageId) ?? null : reservations.find((item) => item.idempotencyKey === where.idempotencyKey) ?? null,
      findUniqueOrThrow: async ({ where }: any) => {
        const value = where.id ? reservations.find((item) => item.id === where.id) : where.messageId ? reservations.find((item) => item.messageId === where.messageId) : reservations.find((item) => item.idempotencyKey === where.idempotencyKey);
        if (!value) throw new Error("Reservation not found");
        return value;
      },
      create: async ({ data }: any) => { const value = { id: `reservation-${reservations.length + 1}`, ...data }; reservations.push(value); return value; },
      update: async ({ where, data }: any) => { const value = reservations.find((item) => item.id === where.id); Object.assign(value, data); return value; },
    },
    walletLedgerEntry: {
      findUnique: async ({ where }: any) => entries.find((item) => item.idempotencyKey === where.walletId_idempotencyKey.idempotencyKey) ?? null,
      findMany: async ({ where }: any) => where.walletId ? entries : entries.filter((item) => item.reservationId === where.reservationId && item.transactionType === where.transactionType),
      create: async ({ data }: any) => { const value = { id: `entry-${entries.length + 1}`, createdAt: new Date(), ...data }; entries.push(value); return value; },
    },
    $queryRaw: async () => [],
  };
  const original = (prisma as any).$transaction;
  (prisma as any).$transaction = async (callback: (client: any) => Promise<unknown>) => callback(transaction);
  t.after(() => { (prisma as any).$transaction = original; });
  return { wallet, message, reservations, entries };
}

const reservationInput = { workspaceId: "workspace-1", messageId: "message-1", rateCardId: "rate-1", metaAmount: "0.115000", platformFee: "0.035000", customerAmount: "0.150000", walletChargeAmount: "0.150000", currency: "INR", billingMode: "MARRENTO_SHARED_BILLING", idempotencyKey: "message-reservation-1" };

test("reserve, capture, and duplicate delivery charge exactly once", async (t) => {
  const state = fixture(t);
  const reserved = await reserveMessage(reservationInput);
  assert.equal(reserved.wallet.totalBalance, "100.000000");
  assert.equal(reserved.wallet.reservedBalance, "0.150000");
  assert.equal(reserved.wallet.availableBalance, "99.850000");
  assert.equal(state.message.billingStatus, "RESERVED");

  const first = await captureReservation({ messageId: "message-1", externalReference: "wamid-1" });
  const second = await captureReservation({ messageId: "message-1", externalReference: "wamid-1" });
  assert.equal(first.wallet.totalBalance, "99.850000");
  assert.equal(first.wallet.reservedBalance, "0.000000");
  assert.equal(first.wallet.availableBalance, "99.850000");
  assert.equal(second.replayed, true);
  assert.equal(state.message.billingStatus, "CHARGED");
  assert.equal(state.entries.filter((entry) => entry.transactionType === "CHARGE").length, 1);
});

test("failed delivery releases the hold without changing total balance", async (t) => {
  const state = fixture(t);
  await reserveMessage(reservationInput);
  const released = await releaseReservation({ messageId: "message-1", reason: "Meta delivery failed" });
  const replayed = await releaseReservation({ messageId: "message-1", reason: "duplicate webhook" });
  assert.equal(released.wallet.totalBalance, "100.000000");
  assert.equal(released.wallet.reservedBalance, "0.000000");
  assert.equal(released.wallet.availableBalance, "100.000000");
  assert.equal(replayed.replayed, true);
  assert.equal(state.message.billingStatus, "RELEASED");
  assert.equal(state.entries.filter((entry) => entry.transactionType === "RELEASE").length, 1);
});

test("insufficient balance prevents a reservation", async (t) => {
  fixture(t, "0.100000");
  await assert.rejects(reserveMessage(reservationInput), (error: unknown) => error instanceof AppError && error.code === "INSUFFICIENT_WALLET_BALANCE");
});

test("refund is a new credit and cannot exceed the original charge", async (t) => {
  const state = fixture(t);
  const reserved = await reserveMessage(reservationInput);
  await captureReservation({ reservationId: reserved.reservation!.id });
  const refund = await refundReservation({ reservationId: reserved.reservation!.id, amount: "0.150000", reason: "Provider refund" });
  assert.equal(refund.wallet.totalBalance, "100.000000");
  assert.equal(state.message.billingStatus, "REFUNDED");
  assert.equal(state.entries.filter((entry) => entry.transactionType === "REFUND").length, 1);
  await assert.rejects(refundReservation({ reservationId: reserved.reservation!.id, amount: "0.010000", reason: "Duplicate refund" }), (error: unknown) => error instanceof AppError && error.code === "INVALID_REFUND_AMOUNT");
});

test("credit-limit wallets can settle a reservation within the configured limit", async (t) => {
  const state = fixture(t, "0.100000");
  await reserveMessage({ ...reservationInput, allowNegativeBalance: true, creditLimit: "0.100000", idempotencyKey: "message-credit-limit-1" });
  const captured = await captureReservation({ messageId: "message-1", externalReference: "wamid-credit-limit" });
  assert.equal(captured.wallet.totalBalance, "-0.050000");
  assert.equal(captured.wallet.reservedBalance, "0.000000");
  assert.equal(state.message.billingStatus, "CHARGED");
});

test("ledger consistency helper detects cached balance drift without repairing it", async (t) => {
  const state = fixture(t, "100.000000");
  state.entries.push({ direction: "CREDIT", transactionType: "RECHARGE", amount: new Prisma.Decimal("100.000000") });
  const consistent = await checkLedgerConsistency("workspace-1");
  assert.equal(consistent.consistent, true);
  state.wallet.totalBalance = new Prisma.Decimal("99.000000");
  const drifted = await checkLedgerConsistency("workspace-1");
  assert.equal(drifted.consistent, false);
  assert.equal(drifted.walletTotalBalance, "99.000000");
});
