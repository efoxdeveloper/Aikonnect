import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateParams, validateQuery } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { requireWorkspacePlanFeature } from "../../middleware/plan-feature-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./report.controller.js";
import { reportParamsSchema, reportQuerySchema } from "./report.schemas.js";

export const reportRouter = Router({ mergeParams: true });
const requireAdvancedReport: RequestHandler = (request, response, next) => {
  if (request.params.report === "overview") {
    next();
    return;
  }
  requireWorkspacePlanFeature("advancedReports")(request, response, next);
};

reportRouter.get("/:report/export", requireWorkspacePermission(PERMISSIONS.REPORTS_EXPORT), validateParams(reportParamsSchema), requireAdvancedReport, validateQuery(reportQuerySchema), asyncHandler(controller.exportReport));
reportRouter.get("/:report", requireWorkspacePermission(PERMISSIONS.REPORTS_READ), validateParams(reportParamsSchema), requireAdvancedReport, validateQuery(reportQuerySchema), asyncHandler(controller.get));
