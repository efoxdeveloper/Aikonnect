import type { Request, Response } from "express";
import * as adminService from "./admin.service.js";
import type { AdminAuditQuery, AdminListQuery, AdminPlanInput, AdminPlanRequestDecision, AdminPlanRequestQuery, AdminUserWalletAdjustment, AdminWalletAdjustment, PlatformSettingsInput } from "./admin.schemas.js";
import * as planRequestsService from "./admin-plan-requests.service.js";
import { creditWallet, debitWallet } from "../wallet/wallet.service.js";

export async function overview(_request: Request, response: Response) {
  response.status(200).json({ success: true, data: await adminService.getOverview() });
}

export async function workspaces(request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listWorkspaces(request.validatedQuery as AdminListQuery) }); }
export async function users(request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listUsers(request.validatedQuery as AdminListQuery) }); }
export async function platformAdmins(request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listPlatformAdmins(request.validatedQuery as AdminListQuery) }); }
export async function userAction(request: Request, response: Response) { const auth = request.auth; const platformAccess = request.platformAccess; if (!auth || !platformAccess) throw new Error("Platform authorization context is missing"); response.status(200).json({ success: true, data: await adminService.performUserAction(request.params.userId as string, auth.userId, platformAccess.role, request.body.action, request.body.confirmation) }); }
export async function userWalletAdjustment(request: Request, response: Response) {
  const auth = request.auth;
  const input = request.body as AdminUserWalletAdjustment;
  if (!auth) throw new Error("Platform authorization context is missing");
  const target = await adminService.getUserWalletTarget(request.params.userId as string);
  const result = await creditWallet({
    tenantId: target.tenantId,
    amountMinorUnits: input.amountMinorUnits,
    idempotencyKey: input.idempotencyKey,
    reason: "USER_ACCOUNT_FUNDING",
    description: input.description ?? input.reason,
    createdById: auth.userId,
    metadata: { source: "manual_user_account_funding", actorUserId: auth.userId, targetUserId: target.userId, reason: input.reason },
  });
  response.status(200).json({ success: true, data: { ...result, userId: target.userId, userEmail: target.email, currency: result.wallet.currency } });
}
export async function whatsapp(request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listWhatsAppConnections(request.validatedQuery as AdminListQuery) }); }
export async function billing(_request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.getBillingOverview() }); }
export async function plans(_request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.listSubscriptionPlans() }); }
export async function createPlan(request: Request, response: Response) {
  if (!request.auth) throw new Error("Platform authorization context is missing");
  response.status(201).json({ success: true, data: await adminService.createSubscriptionPlan(request.body as AdminPlanInput, request.auth.userId) });
}
export async function updatePlan(request: Request, response: Response) {
  if (!request.auth) throw new Error("Platform authorization context is missing");
  response.status(200).json({ success: true, data: await adminService.updateSubscriptionPlan(request.params.planId as string, request.body as AdminPlanInput, request.auth.userId) });
}
export async function deletePlan(request: Request, response: Response) {
  if (!request.auth) throw new Error("Platform authorization context is missing");
  response.status(200).json({ success: true, data: await adminService.deleteSubscriptionPlan(request.params.planId as string, request.auth.userId) });
}
export async function planRequests(request: Request, response: Response) { response.status(200).json({ success: true, data: await planRequestsService.listPlanRequests(request.validatedQuery as AdminPlanRequestQuery) }); }
export async function decidePlanRequest(request: Request, response: Response) {
  if (!request.auth) throw new Error("Platform authorization context is missing");
  response.status(200).json({ success: true, data: await planRequestsService.decidePlanRequest(request.params.requestId as string, request.auth.userId, request.body as AdminPlanRequestDecision) });
}
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
export async function updateSettings(request: Request, response: Response) {
  if (!request.auth) throw new Error("Platform authorization context is missing");
  const input = request.body as PlatformSettingsInput;
  const result = await adminService.updatePlatformSettings(input);
  await adminService.recordPlatformSettingsChange(request.auth.userId, input);
  response.status(200).json({ success: true, data: result });
}
export async function featureFlags(_request: Request, response: Response) { response.status(200).json({ success: true, data: await adminService.getFeatureFlags() }); }
