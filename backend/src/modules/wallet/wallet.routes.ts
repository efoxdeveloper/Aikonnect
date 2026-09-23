import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateParams, validateQuery } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./wallet.controller.js";
import { walletLedgerQuerySchema, walletParamsSchema } from "./wallet.schemas.js";

export const walletRouter = Router({ mergeParams: true });
walletRouter.get("/", requireWorkspacePermission(PERMISSIONS.BILLING_READ), validateParams(walletParamsSchema), asyncHandler(controller.get));
walletRouter.get("/ledger", requireWorkspacePermission(PERMISSIONS.BILLING_READ), validateParams(walletParamsSchema), validateQuery(walletLedgerQuerySchema), asyncHandler(controller.ledger));
