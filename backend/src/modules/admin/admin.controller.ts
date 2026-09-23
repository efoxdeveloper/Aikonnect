import type { Request, Response } from "express";
import * as adminService from "./admin.service.js";
import type { AdminAuditQuery, AdminListQuery, AdminWalletAdjustment } from "./admin.schemas.js";
import { creditWallet, debitWallet } from "../wallet/wallet.service.js";

export async function overview(_request: Request, response: Response) {
  response.status(200).json({ success: true, data: await adminService.getOverview() });
}

export async function workspaces(request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listWorkspaces(request.validatedQuery as AdminListQuery) }); }
export async function users(request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listUsers(request.validatedQuery as AdminListQuery) }); }
export async function platformAdmins(request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listPlatformAdmins(request.validatedQuery as AdminListQuery) }); }
export async function userAction(request: Request, response: Response) { const auth = request.auth; const platformAccess = request.platformAccess; if (!auth || !platformAccess) throw new Error("Platform authorization context is missing"); response.status(200).json({ success: true, data: await adminService.performUserAction(request.params.userId as string, auth.userId, platformAccess.role, request.body.action, request.body.confirmation) }); }
export async function whatsapp(request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listWhatsAppConnections(request.validatedQuery as AdminListQuery) }); }
export async function billing(_request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.getBillingOverview() }); }
export async function walletAdjustment(request: Request, response: Response) {
  const auth = request.auth;
  const input = request.body as AdminWalletAdjustment;
  if (!auth) throw new Error("Platform authorization context is missing");
  const mutation = { ...input, createdById: auth.userId, metadata: { source: "manual_platform_adjustment", actorUserId: auth.userId } };
  const result = input.direction === "CREDIT" ? await creditWallet(mutation) : await debitWallet(mutation);
  response.status(200).json({ success: true, data: result });
}
export async function usage(_request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.getUsageOverview() }); }
export async function health(_request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.getSystemHealth() }); }
export async function webhooks(request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listWebhooks(request.validatedQuery as AdminListQuery) }); }
export async function auditLogs(request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listAuditLogs(request.validatedQuery as AdminAuditQuery) }); }
export async function settings(_request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.getPlatformSettings() }); }
export async function featureFlags(_request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.getFeatureFlags() }); }
