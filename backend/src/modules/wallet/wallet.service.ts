import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { Prisma, WalletEntryDirection } from "../../generated/prisma/client.js";
import type { WalletLedgerQuery } from "./wallet.schemas.js";

export type WalletMutation = {
  workspaceId?: string;
  tenantId?: string;
  direction: WalletEntryDirection;
  amountMinorUnits: bigint;
  idempotencyKey: string;
  reason: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
  createdById?: string;
};

export type WalletCharge = {
  entryId: string;
  amountMinorUnits: bigint;
  idempotencyKey: string;
};

function assertMutation(input: WalletMutation) {
  if (!input.workspaceId && !input.tenantId) throw new AppError(422, "A workspace or tenant is required for a wallet mutation", "WALLET_OWNER_REQUIRED");
  if (input.amountMinorUnits <= 0n) throw new AppError(422, "Wallet amount must be greater than zero", "WALLET_AMOUNT_INVALID");
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 255) throw new AppError(422, "Wallet idempotency key is invalid", "WALLET_IDEMPOTENCY_KEY_INVALID");
  if (!input.reason.trim() || input.reason.length > 80) throw new AppError(422, "Wallet reason is invalid", "WALLET_REASON_INVALID");
}

export function minorUnitsToAmount(value: bigint) {
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${value < 0n ? "-" : ""}${whole.toString()}.${fraction}`;
}

async function resolveTenantContext(transaction: Prisma.TransactionClient, input: Pick<WalletMutation, "workspaceId" | "tenantId">) {
  if (input.workspaceId) {
    const workspace = await transaction.workspace.findUnique({ where: { id: input.workspaceId }, select: { tenantId: true } });
    if (!workspace) throw new AppError(404, "The workspace was not found", "WORKSPACE_NOT_FOUND");
    return { tenantId: workspace.tenantId, workspaceId: input.workspaceId };
  }
  const tenant = await transaction.tenant.findUnique({ where: { id: input.tenantId as string }, select: { id: true } });
  if (!tenant) throw new AppError(404, "The tenant was not found", "TENANT_NOT_FOUND");
  return { tenantId: tenant.id, workspaceId: undefined };
}

async function ensureWallet(transaction: Prisma.TransactionClient, tenantId: string) {
  return transaction.wallet.upsert({
    where: { tenantId },
    create: { tenantId, currency: env.WALLET_CURRENCY },
    update: {},
  });
}

function walletResponse(wallet: { id: string; tenantId: string; currency: string; balanceMinorUnits: bigint; createdAt: Date; updatedAt: Date }) {
    return {
      id: wallet.id,
    tenantId: wallet.tenantId,
    currency: wallet.currency,
    balanceMinorUnits: wallet.balanceMinorUnits.toString(),
    balance: minorUnitsToAmount(wallet.balanceMinorUnits),
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

function entryResponse(entry: { id: string; walletId: string; tenantId: string; workspaceId: string | null; direction: WalletEntryDirection; amountMinorUnits: bigint; balanceAfterMinorUnits: bigint; idempotencyKey: string; reason: string; description: string | null; metadata: Prisma.JsonValue; createdById: string | null; createdAt: Date }) {
  return {
    id: entry.id,
    walletId: entry.walletId,
    tenantId: entry.tenantId,
    workspaceId: entry.workspaceId,
    direction: entry.direction,
    amountMinorUnits: entry.amountMinorUnits.toString(),
    balanceAfterMinorUnits: entry.balanceAfterMinorUnits.toString(),
    idempotencyKey: entry.idempotencyKey,
    reason: entry.reason,
    description: entry.description,
    metadata: entry.metadata,
    createdById: entry.createdById,
    createdAt: entry.createdAt.toISOString(),
  };
}

export async function getWallet(workspaceId: string) {
  const wallet = await prisma.$transaction(async (transaction) => {
    const context = await resolveTenantContext(transaction, { workspaceId });
    return ensureWallet(transaction, context.tenantId);
  });
  return walletResponse(wallet);
}

export async function listLedger(workspaceId: string, query: WalletLedgerQuery) {
  return prisma.$transaction(async (transaction) => {
    const context = await resolveTenantContext(transaction, { workspaceId });
    await ensureWallet(transaction, context.tenantId);
    const where = { tenantId: context.tenantId, ...(query.direction ? { direction: query.direction } : {}) };
    const [total, entries] = await Promise.all([
      transaction.walletLedgerEntry.count({ where }),
      transaction.walletLedgerEntry.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ]);
    return {
      items: entries.map(entryResponse),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), hasNext: query.page * query.pageSize < total, hasPrevious: query.page > 1 },
    };
  });
}

export async function mutateWallet(input: WalletMutation) {
  assertMutation(input);
  return prisma.$transaction(async (transaction) => {
    const context = await resolveTenantContext(transaction, input);
    const wallet = await ensureWallet(transaction, context.tenantId);
    await transaction.$queryRaw`SELECT "id" FROM "wallets" WHERE "id" = ${wallet.id} FOR UPDATE`;

    const existing = await transaction.walletLedgerEntry.findUnique({ where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: input.idempotencyKey } } });
    if (existing) {
      if (existing.direction !== input.direction || existing.amountMinorUnits !== input.amountMinorUnits) {
        throw new AppError(409, "The wallet idempotency key has already been used for a different mutation", "WALLET_IDEMPOTENCY_CONFLICT");
      }
      return { wallet: walletResponse(await transaction.wallet.findUniqueOrThrow({ where: { id: wallet.id } })), entry: entryResponse(existing), replayed: true };
    }

    const updated = await transaction.wallet.updateMany({
      where: { id: wallet.id, ...(input.direction === "DEBIT" ? { balanceMinorUnits: { gte: input.amountMinorUnits } } : {}) },
      data: { balanceMinorUnits: input.direction === "CREDIT" ? { increment: input.amountMinorUnits } : { decrement: input.amountMinorUnits } },
    });
    if (updated.count !== 1) throw new AppError(409, "The wallet does not have enough balance", "WALLET_INSUFFICIENT_FUNDS");

    const updatedWallet = await transaction.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    const entry = await transaction.walletLedgerEntry.create({
      data: {
        walletId: wallet.id,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        direction: input.direction,
        amountMinorUnits: input.amountMinorUnits,
        balanceAfterMinorUnits: updatedWallet.balanceMinorUnits,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        description: input.description,
        metadata: input.metadata ?? {},
        createdById: input.createdById,
      },
    });
    return { wallet: walletResponse(updatedWallet), entry: entryResponse(entry), replayed: false };
  });
}

export function creditWallet(input: Omit<WalletMutation, "direction">) {
  return mutateWallet({ ...input, direction: "CREDIT" });
}

export function debitWallet(input: Omit<WalletMutation, "direction">) {
  return mutateWallet({ ...input, direction: "DEBIT" });
}

export async function chargeOutboundMessage(input: { workspaceId: string; idempotencyKey: string; metadata?: Prisma.InputJsonValue }) {
  const amountMinorUnits = env.WALLET_OUTBOUND_MESSAGE_RATE_MINOR_UNITS;
  if (amountMinorUnits === 0n) return null;
  const result = await debitWallet({
    workspaceId: input.workspaceId,
    amountMinorUnits,
    idempotencyKey: input.idempotencyKey,
    reason: "OUTBOUND_MESSAGE",
    description: "WhatsApp outbound message",
    metadata: input.metadata,
  });
  return { entryId: result.entry.id, amountMinorUnits, idempotencyKey: input.idempotencyKey } satisfies WalletCharge;
}

export function refundWalletCharge(input: WalletCharge & { workspaceId: string; metadata?: Prisma.InputJsonValue }) {
  return creditWallet({
    workspaceId: input.workspaceId,
    amountMinorUnits: input.amountMinorUnits,
    idempotencyKey: `${input.idempotencyKey}:refund`,
    reason: "OUTBOUND_MESSAGE_REFUND",
    description: "Refund for failed WhatsApp outbound message",
    metadata: { ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}), originalChargeEntryId: input.entryId },
  });
}
