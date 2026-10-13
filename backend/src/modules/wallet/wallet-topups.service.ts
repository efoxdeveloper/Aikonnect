import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { getNttClient } from "../payments/ntt.client.js";
import { publishWalletUpdated } from "../../realtime/wallet.js";

const ZERO = new Prisma.Decimal(0);
const money = (value: Prisma.Decimal | string | number | null | undefined) => value instanceof Prisma.Decimal ? value : value == null ? ZERO : new Prisma.Decimal(value);
const fixed = (value: Prisma.Decimal) => value.toFixed(2);
const minorUnits = (value: Prisma.Decimal) => BigInt(value.mul(100).toDecimalPlaces(0).toFixed(0));

function configuredNtt() {
  try { return getNttClient(); }
  catch { throw new AppError(503, "NTT payment gateway configuration is incomplete", "PAYMENT_GATEWAY_NOT_CONFIGURED"); }
}

function topupResponse(topup: any, exposeCheckout = false) {
  return {
    id: topup.id,
    paymentId: topup.paymentId,
    amount: fixed(money(topup.amount)),
    currency: topup.currency,
    status: topup.status,
    checkout: exposeCheckout ? topup.checkout : null,
    checkoutEnvironment: typeof topup.checkout?.environment === "string" ? topup.checkout.environment : null,
    createdAt: topup.createdAt.toISOString(),
    completedAt: topup.completedAt?.toISOString() ?? null,
  };
}

async function notifyWalletUpdated(tenantId: string) {
  try {
    const workspaces = await prisma.workspace.findMany({ where: { tenantId }, select: { id: true } });
    for (const workspace of workspaces) publishWalletUpdated(workspace.id);
  } catch { /* Wallet state is already durable; realtime delivery is best effort. */ }
}

function checkoutReturnUrl(mode: string) {
  if (mode !== "mock" && !env.NTT_CALLBACK_URL) {
    throw new AppError(503, "NTT callback URL is not configured", "PAYMENT_GATEWAY_NOT_CONFIGURED");
  }
  return env.NTT_CALLBACK_URL ?? new URL("/billing", env.APP_URL).toString();
}

export async function createWalletTopup(input: { workspaceId: string; userId: string; email: string; amount: string; idempotencyKey: string }) {
  const ntt = configuredNtt();
  const callbackUrl = checkoutReturnUrl(ntt.configuration.mode);
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true, tenantId: true, ownerId: true, owner: { select: { email: true, firstName: true, lastName: true, phone: true } } },
  });
  if (!workspace) throw new AppError(404, "The workspace was not found", "WORKSPACE_NOT_FOUND");
  const customerMobile = workspace.owner.phone?.trim();
  if (!customerMobile || !/^\+?[0-9]{8,15}$/.test(customerMobile)) throw new AppError(422, "The workspace owner needs a saved phone number before recharging", "WALLET_TOPUP_PHONE_MISSING");
  const amount = new Prisma.Decimal(input.amount);
  const wallet = await prisma.wallet.upsert({ where: { tenantId: workspace.tenantId }, create: { tenantId: workspace.tenantId, currency: env.WALLET_CURRENCY }, update: {} });
  if (wallet.currency !== "INR") throw new AppError(422, "NTT wallet recharges currently support INR wallets only", "PAYMENT_CURRENCY_UNSUPPORTED");
  if (wallet.status !== "ACTIVE") throw new AppError(409, "The wallet is not active", "WALLET_NOT_ACTIVE");

  const existing = await prisma.walletTopup.findUnique({ where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: input.idempotencyKey } } });
  if (existing) {
    if (existing.workspaceId !== input.workspaceId || !money(existing.amount).eq(amount)) throw new AppError(409, "The recharge idempotency key has already been used for a different payment", "WALLET_TOPUP_IDEMPOTENCY_CONFLICT");
    return { ...topupResponse(existing, true), customerMobile };
  }

  const topup = await prisma.walletTopup.create({ data: {
    walletId: wallet.id,
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    createdById: input.userId,
    idempotencyKey: input.idempotencyKey,
    paymentId: `MRT${Date.now()}${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    amount,
    currency: wallet.currency,
    status: "INITIALIZING",
  } });

  try {
    const payment = await ntt.payments.create({
      orderId: topup.paymentId,
      amount: Number(fixed(amount)),
      currency: topup.currency,
      customer: { email: input.email, mobile: customerMobile, name: `${workspace.owner.firstName} ${workspace.owner.lastName}`.trim() },
      returnUrl: callbackUrl,
      metadata: { source: "wallet_topup", topupId: topup.id },
    });
    await prisma.walletTopup.update({ where: { id: topup.id }, data: {
      status: payment.status === "SUCCESS" ? "PENDING" : payment.status,
      transactionDate: payment.transactionDate,
      gatewayRequestId: payment.requestId,
      providerPaymentId: payment.providerPaymentId,
      providerTransactionId: payment.providerTransactionId,
      checkout: payment.checkout ? payment.checkout as unknown as Prisma.InputJsonValue : Prisma.DbNull,
    } });
    if (payment.status === "SUCCESS") await completeWalletTopup(topup.paymentId, payment.providerTransactionId);
  } catch (error) {
    // Keep the merchant payment ID durable. A timeout can mean NTT created the
    // payment even though this process never received its checkout response.
    await prisma.walletTopup.update({ where: { id: topup.id }, data: { status: "INITIATION_UNKNOWN", failureCode: error instanceof Error ? error.name.slice(0, 100) : "UNKNOWN" } });
  }
  return { ...await getWalletTopup(input.workspaceId, topup.id, true), customerMobile };
}

export async function getWalletTopup(workspaceId: string, topupId: string, exposeCheckout = false) {
  const topup = await prisma.walletTopup.findFirst({ where: { id: topupId, workspaceId } });
  if (!topup) throw new AppError(404, "The wallet recharge was not found", "WALLET_TOPUP_NOT_FOUND");
  return topupResponse(topup, exposeCheckout);
}

export async function completeWalletTopup(paymentId: string, providerTransactionId?: string) {
  const result = await prisma.$transaction(async (transaction) => {
    const topup = await transaction.walletTopup.findUnique({ where: { paymentId } });
    if (!topup) throw new AppError(404, "The wallet recharge was not found", "WALLET_TOPUP_NOT_FOUND");
    await transaction.$queryRaw`SELECT "id" FROM "wallet_topups" WHERE "id" = ${topup.id} FOR UPDATE`;
    const current = await transaction.walletTopup.findUniqueOrThrow({ where: { id: topup.id } });
    if (current.status === "SUCCESS") return { topup: current, tenantId: current.tenantId, replayed: true };
    const wallet = await transaction.wallet.findUniqueOrThrow({ where: { id: current.walletId } });
    await transaction.$queryRaw`SELECT "id" FROM "wallets" WHERE "id" = ${wallet.id} FOR UPDATE`;
    const freshWallet = await transaction.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    const duplicate = await transaction.walletLedgerEntry.findUnique({ where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: `ntt-topup:${current.id}` } } });
    if (duplicate) {
      const succeeded = await transaction.walletTopup.update({ where: { id: current.id }, data: { status: "SUCCESS", providerTransactionId: providerTransactionId ?? current.providerTransactionId, completedAt: current.completedAt ?? new Date() } });
      return { topup: succeeded, tenantId: current.tenantId, replayed: true };
    }
    if (freshWallet.status !== "ACTIVE") throw new AppError(409, "The wallet is not active", "WALLET_NOT_ACTIVE");
    const amount = money(current.amount);
    const openingTotal = money(freshWallet.totalBalance);
    const openingReserved = money(freshWallet.reservedBalance);
    const closingTotal = openingTotal.add(amount);
    const closingAvailable = closingTotal.sub(openingReserved);
    await transaction.wallet.update({ where: { id: wallet.id }, data: { totalBalance: closingTotal, balanceMinorUnits: minorUnits(closingTotal) } });
    await transaction.walletLedgerEntry.create({ data: {
      walletId: wallet.id,
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      direction: "CREDIT",
      transactionType: "RECHARGE",
      amount,
      amountMinorUnits: minorUnits(amount),
      balanceAfterMinorUnits: minorUnits(closingTotal),
      transactionReference: `txn_${randomUUID()}`,
      currency: current.currency,
      openingTotalBalance: openingTotal,
      closingTotalBalance: closingTotal,
      openingReservedBalance: openingReserved,
      closingReservedBalance: openingReserved,
      openingAvailableBalance: openingTotal.sub(openingReserved),
      closingAvailableBalance: closingAvailable,
      externalReference: providerTransactionId ?? current.paymentId,
      status: "COMPLETED",
      idempotencyKey: `ntt-topup:${current.id}`,
      reason: "RECHARGE",
      description: "Wallet recharge via NTT Data",
      metadata: { paymentId: current.paymentId, providerTransactionId: providerTransactionId ?? null },
      createdById: current.createdById,
    } });
    const succeeded = await transaction.walletTopup.update({ where: { id: current.id }, data: { status: "SUCCESS", providerTransactionId: providerTransactionId ?? current.providerTransactionId, completedAt: new Date() } });
    return { topup: succeeded, tenantId: current.tenantId, replayed: false };
  });
  if (!result.replayed) await notifyWalletUpdated(result.tenantId);
  return topupResponse(result.topup);
}

export async function applyWalletTopupStatus(paymentId: string, status: string, providerTransactionId?: string) {
  if (status === "SUCCESS") return completeWalletTopup(paymentId, providerTransactionId);
  const terminal = ["FAILED", "CANCELLED", "EXPIRED"].includes(status) ? status : "PENDING";
  const topup = await prisma.walletTopup.updateMany({ where: { paymentId, status: { not: "SUCCESS" } }, data: { status: terminal, ...(providerTransactionId ? { providerTransactionId } : {}) } });
  if (!topup.count) return;
}

export async function requeryWalletTopup(workspaceId: string, topupId: string) {
  const saved = await prisma.walletTopup.findFirst({ where: { id: topupId, workspaceId } });
  if (!saved) throw new AppError(404, "The wallet recharge was not found", "WALLET_TOPUP_NOT_FOUND");
  if (saved.status === "SUCCESS") return topupResponse(saved);
  if (configuredNtt().configuration.mode === "mock") return topupResponse(saved);
  try {
    const payment = await configuredNtt().payments.status({
      paymentId: saved.paymentId,
      amount: Number(fixed(money(saved.amount))),
      currency: saved.currency,
      transactionDate: saved.transactionDate ?? undefined,
      createdAt: saved.createdAt,
      providerTransactionId: saved.providerTransactionId ?? undefined,
    });
    await applyWalletTopupStatus(payment.paymentId, payment.status, payment.providerTransactionId);
  } catch {
    // A status timeout or unknown gateway response is not a failed payment.
  }
  return getWalletTopup(workspaceId, topupId);
}

export async function simulateMockWalletTopup(workspaceId: string, topupId: string) {
  if (configuredNtt().configuration.mode !== "mock") throw new AppError(404, "The recharge was not found", "WALLET_TOPUP_NOT_FOUND");
  const saved = await prisma.walletTopup.findFirst({ where: { id: topupId, workspaceId } });
  if (!saved) throw new AppError(404, "The wallet recharge was not found", "WALLET_TOPUP_NOT_FOUND");
  return completeWalletTopup(saved.paymentId, `MOCK-${saved.paymentId}`);
}

export async function processNttCallback(body: unknown) {
  const ntt = configuredNtt();
  const decoded = await ntt.payments.verifyCallback(body);
  const saved = await prisma.walletTopup.findUnique({ where: { paymentId: decoded.paymentId } });
  if (!saved) throw new AppError(404, "The wallet recharge was not found", "WALLET_TOPUP_NOT_FOUND");
  const verified = await ntt.payments.verifyCallback(body, { paymentId: saved.paymentId, amount: Number(fixed(money(saved.amount))), currency: saved.currency });
  if (verified.totalAmount !== Number(fixed(money(saved.amount))) || verified.currency.toUpperCase() !== saved.currency) {
    throw new AppError(400, "The payment callback does not match the expected recharge", "PAYMENT_CALLBACK_MISMATCH");
  }
  await applyWalletTopupStatus(saved.paymentId, verified.status, verified.providerTransactionId);
  return saved;
}
