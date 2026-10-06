import type { RequestHandler } from "express";
import { assertWorkspaceFeatureEnabled, type PlanFeature } from "../modules/billing/entitlements.service.js";
import { AppError } from "./error-handler.js";

export function requireWorkspacePlanFeature(feature: PlanFeature): RequestHandler {
  return async (request, _response, next) => {
    try {
      const workspaceId = request.params.workspaceId;
      if (typeof workspaceId !== "string") throw new AppError(400, "Workspace ID is required", "WORKSPACE_ID_REQUIRED");
      await assertWorkspaceFeatureEnabled(workspaceId, feature);
      next();
    } catch (error) {
      next(error);
    }
  };
}
