import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./api-key.controller.js";
import { apiKeyIdParamsSchema, apiKeyWorkspaceParamsSchema, createApiKeySchema } from "./api-key.schemas.js";

export const apiKeyRouter = Router({ mergeParams: true });
apiKeyRouter.use(validateParams(apiKeyWorkspaceParamsSchema));
apiKeyRouter.get("/", requireWorkspacePermission(PERMISSIONS.WORKSPACE_UPDATE), asyncHandler(controller.list));
apiKeyRouter.post("/", requireWorkspacePermission(PERMISSIONS.WORKSPACE_UPDATE), validateBody(createApiKeySchema), asyncHandler(controller.create));
apiKeyRouter.delete("/:apiKeyId", requireWorkspacePermission(PERMISSIONS.WORKSPACE_UPDATE), validateParams(apiKeyIdParamsSchema), asyncHandler(controller.revoke));
