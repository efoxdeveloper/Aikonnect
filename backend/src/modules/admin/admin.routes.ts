import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePlatformRole, type PlatformRole } from "../../middleware/platform-access.js";
import * as controller from "./admin.controller.js";
import * as service from "./admin.service.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { adminAuditQuerySchema, adminListQuerySchema, adminUserActionSchema, adminUserParamsSchema, adminWalletAdjustmentSchema } from "./admin.schemas.js";
import * as rateCardController from "../whatsapp-pricing/pricing.controller.js";
import { rateCardIdParamsSchema, rateCardInputSchema, rateCardListQuerySchema, rateCardStatusSchema, ratePreviewSchema } from "../whatsapp-pricing/pricing.schemas.js";
import * as walletController from "../wallet/wallet.controller.js";
import { billingSettingsSchema, walletCreditSchema, walletDebitSchema, walletLedgerQuerySchema, walletParamsSchema, walletRefundSchema, walletReservationParamsSchema, walletStatusSchema } from "../wallet/wallet.schemas.js";

export const adminRouter = Router();

adminRouter.use(authenticate);
const auditAccess = asyncHandler(async (request, _response, next) => {
  // Audit failures must never hide the original platform response, but the request is recorded whenever storage is available.
  try { await service.recordAdminRequest(request); } catch { /* The endpoint remains available if audit storage is temporarily unavailable. */ }
  next();
});
const access = (...roles: PlatformRole[]) => [requirePlatformRole(...roles), auditAccess] as const;
const allRoles: PlatformRole[] = ["SUPPORT", "OPERATIONS", "BILLING", "ADMIN", "SUPER_ADMIN"];
const customerRoles: PlatformRole[] = ["SUPPORT", "OPERATIONS", "ADMIN", "SUPER_ADMIN"];
const operationsRoles: PlatformRole[] = ["OPERATIONS", "ADMIN", "SUPER_ADMIN"];
const billingRoles: PlatformRole[] = ["BILLING", "ADMIN", "SUPER_ADMIN"];
const auditRoles: PlatformRole[] = ["SUPPORT", "ADMIN", "SUPER_ADMIN"];
const administratorRoles: PlatformRole[] = ["ADMIN", "SUPER_ADMIN"];

adminRouter.get("/overview", ...access(...allRoles), asyncHandler(controller.overview));
adminRouter.get("/workspaces", ...access(...customerRoles), validateQuery(adminListQuerySchema), asyncHandler(controller.workspaces));
adminRouter.get("/users", ...access(...customerRoles), validateQuery(adminListQuerySchema), asyncHandler(controller.users));
adminRouter.post("/users/:userId/actions", ...access(...administratorRoles), validateParams(adminUserParamsSchema), validateBody(adminUserActionSchema), asyncHandler(controller.userAction));
adminRouter.get("/platform-admins", ...access(...administratorRoles), validateQuery(adminListQuerySchema), asyncHandler(controller.platformAdmins));
adminRouter.get("/whatsapp", ...access(...customerRoles), validateQuery(adminListQuerySchema), asyncHandler(controller.whatsapp));
adminRouter.get("/billing", ...access(...billingRoles), asyncHandler(controller.billing));
adminRouter.post("/billing/wallet-adjustments", ...access(...billingRoles), validateBody(adminWalletAdjustmentSchema), asyncHandler(controller.walletAdjustment));
adminRouter.get("/workspaces/:workspaceId/wallet", ...access(...billingRoles), validateParams(walletParamsSchema), asyncHandler(walletController.get));
adminRouter.get("/workspaces/:workspaceId/wallet/transactions", ...access(...billingRoles), validateParams(walletParamsSchema), validateQuery(walletLedgerQuerySchema), asyncHandler(walletController.ledger));
adminRouter.post("/workspaces/:workspaceId/wallet/credit", ...access(...billingRoles), validateParams(walletParamsSchema), validateBody(walletCreditSchema), asyncHandler(walletController.adminCredit));
adminRouter.post("/workspaces/:workspaceId/wallet/recharge", ...access(...billingRoles), validateParams(walletParamsSchema), validateBody(walletCreditSchema), asyncHandler(walletController.adminCredit));
adminRouter.post("/workspaces/:workspaceId/wallet/debit", ...access(...billingRoles), validateParams(walletParamsSchema), validateBody(walletDebitSchema), asyncHandler(walletController.adminDebit));
adminRouter.get("/workspaces/:workspaceId/wallet/settings", ...access(...billingRoles), validateParams(walletParamsSchema), asyncHandler(walletController.adminSettings));
adminRouter.patch("/workspaces/:workspaceId/wallet/settings", ...access(...billingRoles), validateParams(walletParamsSchema), validateBody(billingSettingsSchema), asyncHandler(walletController.adminUpdateSettings));
adminRouter.patch("/workspaces/:workspaceId/wallet/status", ...access(...billingRoles), validateParams(walletParamsSchema), validateBody(walletStatusSchema), asyncHandler(walletController.adminStatus));
adminRouter.post("/wallet-reservations/:reservationId/refund", ...access(...billingRoles), validateParams(walletReservationParamsSchema), validateBody(walletRefundSchema), asyncHandler(walletController.adminRefund));
adminRouter.get("/usage", ...access(...billingRoles, "OPERATIONS"), asyncHandler(controller.usage));
adminRouter.get("/health", ...access(...operationsRoles), asyncHandler(controller.health));
adminRouter.get("/webhooks", ...access(...operationsRoles), validateQuery(adminListQuerySchema), asyncHandler(controller.webhooks));
adminRouter.get("/audit-logs", ...access(...auditRoles), validateQuery(adminAuditQuerySchema), asyncHandler(controller.auditLogs));
adminRouter.get("/settings", ...access(...administratorRoles), asyncHandler(controller.settings));
adminRouter.get("/feature-flags", ...access(...administratorRoles), asyncHandler(controller.featureFlags));
adminRouter.post("/whatsapp-rate-cards/preview", ...access(...administratorRoles), validateBody(ratePreviewSchema), asyncHandler(rateCardController.preview));
adminRouter.get("/whatsapp-rate-cards", ...access(...administratorRoles), validateQuery(rateCardListQuerySchema), asyncHandler(rateCardController.list));
adminRouter.get("/whatsapp-rate-cards/:id", ...access(...administratorRoles), validateParams(rateCardIdParamsSchema), asyncHandler(rateCardController.get));
adminRouter.post("/whatsapp-rate-cards", ...access(...administratorRoles), validateBody(rateCardInputSchema), asyncHandler(rateCardController.create));
adminRouter.put("/whatsapp-rate-cards/:id", ...access(...administratorRoles), validateParams(rateCardIdParamsSchema), validateBody(rateCardInputSchema), asyncHandler(rateCardController.update));
adminRouter.patch("/whatsapp-rate-cards/:id/status", ...access(...administratorRoles), validateParams(rateCardIdParamsSchema), validateBody(rateCardStatusSchema), asyncHandler(rateCardController.updateStatus));
