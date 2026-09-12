import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./template.controller.js";
import { createTemplateSchema, listTemplatesQuerySchema, templateParamsSchema, templateWorkspaceParamsSchema, updateTemplateSchema } from "./template.schemas.js";

export const templateRouter = Router({ mergeParams: true });
templateRouter.use(validateParams(templateWorkspaceParamsSchema));
templateRouter.get("/", requireWorkspacePermission(PERMISSIONS.TEMPLATES_READ), validateQuery(listTemplatesQuerySchema), asyncHandler(controller.list));
templateRouter.post("/sync", requireWorkspacePermission(PERMISSIONS.TEMPLATES_MANAGE), asyncHandler(controller.sync));
templateRouter.post("/", requireWorkspacePermission(PERMISSIONS.TEMPLATES_MANAGE), validateBody(createTemplateSchema), asyncHandler(controller.create));
templateRouter.get("/:templateId", requireWorkspacePermission(PERMISSIONS.TEMPLATES_READ), validateParams(templateParamsSchema), asyncHandler(controller.get));
templateRouter.patch("/:templateId", requireWorkspacePermission(PERMISSIONS.TEMPLATES_MANAGE), validateParams(templateParamsSchema), validateBody(updateTemplateSchema), asyncHandler(controller.update));
templateRouter.delete("/:templateId", requireWorkspacePermission(PERMISSIONS.TEMPLATES_MANAGE), validateParams(templateParamsSchema), asyncHandler(controller.remove));
templateRouter.post("/:templateId/restore", requireWorkspacePermission(PERMISSIONS.TEMPLATES_MANAGE), validateParams(templateParamsSchema), asyncHandler(controller.restore));
