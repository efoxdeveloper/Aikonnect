import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateParams, validateQuery } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./report.controller.js";
import { reportParamsSchema, reportQuerySchema } from "./report.schemas.js";

export const reportRouter = Router({ mergeParams: true });
reportRouter.get("/:report/export", requireWorkspacePermission(PERMISSIONS.REPORTS_EXPORT), validateParams(reportParamsSchema), validateQuery(reportQuerySchema), asyncHandler(controller.exportReport));
reportRouter.get("/:report", requireWorkspacePermission(PERMISSIONS.REPORTS_READ), validateParams(reportParamsSchema), validateQuery(reportQuerySchema), asyncHandler(controller.get));
