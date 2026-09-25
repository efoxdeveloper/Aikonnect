import type { Request, Response } from "express";
import * as service from "./wallet.service.js";
import type { WalletLedgerQuery } from "./wallet.schemas.js";
import { prisma } from "../../database/prisma.js";
import { credit, debit, getBillingSettings, updateBillingSettings, refundReservation, setWalletStatus } from "./wallet.service.js";
import type { BillingSettingsInput, WalletCreditInput, WalletDebitInput, WalletRefundInput } from "./wallet.schemas.js";

export async function get(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.getWallet(request.params.workspaceId as string) });
}

export async function ledger(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.listLedger(request.params.workspaceId as string, request.validatedQuery as WalletLedgerQuery) });
}

export async function settings(request: Request, response: Response) { response.status(200).json({ success: true, data: await getBillingSettings(request.params.workspaceId as string) }); }
export async function adminCredit(request: Request, response: Response) {
  const auth = request.auth;
  if (!auth) throw new Error("Authentication context is missing");
  const input = request.body as WalletCreditInput;
  const result = await credit({ workspaceId: request.params.workspaceId as string, amount: input.amount, transactionType: input.paymentReference ? "RECHARGE" : "ADMIN_CREDIT", idempotencyKey: input.idempotencyKey, description: input.description ?? input.reason, metadata: { reason: input.reason, paymentReference: input.paymentReference }, createdById: auth.userId });
  await prisma.platformAuditLog.create({ data: { actorUserId: auth.userId, action: input.paymentReference ? "WALLET_RECHARGED" : "WALLET_CREDITED", resourceType: "wallet", resourceId: result.entry.walletId, workspaceId: request.params.workspaceId as string, metadata: { amount: input.amount, reason: input.reason, paymentReference: input.paymentReference ?? null } } });
  response.status(201).json({ success: true, data: result });
}
export async function adminDebit(request: Request, response: Response) {
  const auth = request.auth;
  if (!auth) throw new Error("Authentication context is missing");
  const input = request.body as WalletDebitInput;
  const result = await debit({ workspaceId: request.params.workspaceId as string, amount: input.amount, transactionType: "ADMIN_DEBIT", idempotencyKey: input.idempotencyKey, description: input.description ?? input.reason, metadata: { reason: input.reason }, createdById: auth.userId });
  await prisma.platformAuditLog.create({ data: { actorUserId: auth.userId, action: "WALLET_DEBITED", resourceType: "wallet", resourceId: result.entry.walletId, workspaceId: request.params.workspaceId as string, metadata: { amount: input.amount, reason: input.reason } } });
  response.status(201).json({ success: true, data: result });
}
export async function adminRefund(request: Request, response: Response) {
  const auth = request.auth;
  if (!auth) throw new Error("Authentication context is missing");
  const input = request.body as WalletRefundInput;
  const result = await refundReservation({ reservationId: request.params.reservationId as string, amount: input.amount, reason: input.reason, createdById: auth.userId });
  await prisma.platformAuditLog.create({ data: { actorUserId: auth.userId, action: "WALLET_REFUNDED", resourceType: "wallet_reservation", resourceId: request.params.reservationId as string, metadata: { amount: input.amount ?? null, reason: input.reason } } });
  response.status(201).json({ success: true, data: result });
}
export async function adminSettings(request: Request, response: Response) { response.status(200).json({ success: true, data: await getBillingSettings(request.params.workspaceId as string) }); }
export async function adminUpdateSettings(request: Request, response: Response) {
  const auth = request.auth;
  if (!auth) throw new Error("Authentication context is missing");
  const result = await updateBillingSettings(request.params.workspaceId as string, request.body as BillingSettingsInput);
  await prisma.platformAuditLog.create({ data: { actorUserId: auth.userId, action: "WALLET_SETTING_CHANGED", resourceType: "workspace_billing_settings", resourceId: result.id, workspaceId: request.params.workspaceId as string, metadata: request.body } });
  response.status(200).json({ success: true, data: result });
}
export async function adminStatus(request: Request, response: Response) {
  const auth = request.auth;
  if (!auth) throw new Error("Authentication context is missing");
  const result = await setWalletStatus(request.params.workspaceId as string, request.body.status);
  await prisma.platformAuditLog.create({ data: { actorUserId: auth.userId, action: request.body.status === "SUSPENDED" ? "WALLET_SUSPENDED" : "WALLET_ACTIVATED", resourceType: "wallet", resourceId: result.id, workspaceId: request.params.workspaceId as string, metadata: { status: request.body.status } } });
  response.status(200).json({ success: true, data: result });
}
